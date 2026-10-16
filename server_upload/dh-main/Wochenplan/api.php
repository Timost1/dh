<?php
// Wochenplan-API (MySQL, Datenbank db_emhs).
//
// Der Plan besteht aus einzelnen Feldern: je Woche 7 Tage × 3 Schichten plus die KW-Info.
// Jedes Feld wird für sich bearbeitet und gespeichert, damit mehrere Personen gleichzeitig
// am Plan arbeiten können:
//   - Wer ein Feld bearbeitet, hält dafür eine kurzlebige Sperre (wochenplan_sperren).
//   - Jedes Feld trägt eine Versionsnummer; ein Speichern auf veraltetem Stand wird erkannt.
//   - Jede gespeicherte Fassung bleibt in wochenplan_verlauf erhalten.
session_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Serverfehler']);
    }
});

// --- DB CONNECTION (gleiche Zugangsdaten wie Lagerverwaltung) ---
$db_host = 'localhost';
$db_name = 'db_emhs';
$db_user = 'emhs';
$db_pass = 'dQ34TkmsMWRTUuwh';

// Sekunden ohne Lebenszeichen, nach denen die Sperre eines Feldes verfällt
const WP_SPERRE_SEK = 30;
// Maximale Länge eines einzelnen Feldes (Zeichen, inkl. Formatierung)
const WP_MAX_FELD = 20000;
const WP_MAX_BAUSTEIN = 5000;
const WP_SCHICHTEN = ['frueh', 'mittag', 'nacht'];
const WP_SCHICHT_NAMEN = ['frueh' => 'Frühschicht', 'mittag' => 'Mittagsschicht', 'nacht' => 'Nachtschicht'];
const WP_TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function respond($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function fehler($text, $status = 400, $code = null, $extra = []) {
    $payload = array_merge(['success' => false, 'error' => $text], $extra);
    if ($code !== null) $payload['code'] = $code;
    respond($payload, $status);
}

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
} catch (PDOException $e) {
    fehler('DB-Verbindung fehlgeschlagen', 500);
}

// --- TABELLEN (bestehende Daten bleiben unberührt; es wird nur ergänzt, was fehlt) ---
function wp_schema_vorhanden($pdo) {
    try {
        $pdo->query("SELECT kannWochenplanBearbeiten FROM mitarbeiter LIMIT 0");
        $pdo->query("SELECT version, geaendert_von FROM wochenplan_eintraege LIMIT 0");
        $pdo->query("SELECT version, geaendert_von FROM wochenplan_kwinfo LIMIT 0");
        $pdo->query("SELECT html, nutzung FROM wochenplan_quicktexte LIMIT 0");
        $pdo->query("SELECT 1 FROM wochenplan_sperren LIMIT 0");
        $pdo->query("SELECT 1 FROM wochenplan_verlauf LIMIT 0");
        $pdo->query("SELECT 1 FROM wochenplan_log LIMIT 0");
        return true;
    } catch (Exception $e) {
        return false;
    }
}

function wp_spalte_ergaenzen($pdo, $sql) {
    try { $pdo->exec($sql); } catch (Exception $e) { /* Spalte existiert bereits */ }
}

function wp_schema_anlegen($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mitarbeiter (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255),
        rfid VARCHAR(255),
        schicht VARCHAR(10),
        isAdmin INTEGER DEFAULT 0,
        Meister INTEGER DEFAULT 0,
        Lagermensch INTEGER DEFAULT 0
    )");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE mitarbeiter ADD COLUMN kannWochenplanBearbeiten INTEGER DEFAULT 0");

    $pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_eintraege (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        jahr INT NOT NULL,
        kw INT NOT NULL,
        tag INT NOT NULL,
        schicht VARCHAR(10) NOT NULL,
        inhalt TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_entry (jahr, kw, tag, schicht)
    )");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE wochenplan_eintraege ADD COLUMN version INT NOT NULL DEFAULT 0");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE wochenplan_eintraege ADD COLUMN geaendert_von VARCHAR(255) NULL");

    $pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_kwinfo (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        jahr INT NOT NULL,
        kw INT NOT NULL,
        inhalt TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_kwinfo (jahr, kw)
    )");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE wochenplan_kwinfo ADD COLUMN version INT NOT NULL DEFAULT 0");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE wochenplan_kwinfo ADD COLUMN geaendert_von VARCHAR(255) NULL");

    // Textbausteine (früher "Quick-Texte"): reiner Text, optional mit Formatierung
    $pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_quicktexte (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        text TEXT
    )");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE wochenplan_quicktexte ADD COLUMN html TEXT NULL");
    wp_spalte_ergaenzen($pdo, "ALTER TABLE wochenplan_quicktexte ADD COLUMN nutzung INT NOT NULL DEFAULT 0");

    // Wer bearbeitet gerade welches Feld ("0:frueh" … "6:nacht" oder "kwinfo")
    $pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_sperren (
        jahr INT NOT NULL,
        kw INT NOT NULL,
        feld VARCHAR(12) NOT NULL,
        user_id INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        aktiv_am DATETIME NOT NULL,
        PRIMARY KEY (jahr, kw, feld)
    ) DEFAULT CHARSET=utf8mb4");

    // Jede gespeicherte Fassung eines Feldes
    $pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_verlauf (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jahr INT NOT NULL,
        kw INT NOT NULL,
        feld VARCHAR(12) NOT NULL,
        inhalt TEXT,
        user_name VARCHAR(255) NOT NULL,
        zeitpunkt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_feld (jahr, kw, feld, id)
    ) DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_log (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        user_name VARCHAR(255),
        beschreibung VARCHAR(500),
        zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
}

try {
    if (!wp_schema_vorhanden($pdo)) wp_schema_anlegen($pdo);
} catch (Exception $e) {
    fehler('Tabellen konnten nicht vorbereitet werden', 500);
}

// --- INPUT ---
$data = $_REQUEST;
$jsonInput = file_get_contents('php://input');
if (!empty($jsonInput)) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) $data = array_merge($data, $decoded);
}
$action = $data['action'] ?? ($_GET['action'] ?? '');

// --- HELFER ---
function logAction($pdo, $user, $desc) {
    $stmt = $pdo->prepare("INSERT INTO wochenplan_log (user_name, beschreibung) VALUES (?, ?)");
    $stmt->execute([$user, mb_substr($desc, 0, 500)]);
}

// Angemeldeten Benutzer frisch aus der DB lesen (Rechte können sich geändert haben)
function wp_current_user($pdo) {
    $userId = intval($_SESSION['user']['id'] ?? 0);
    if ($userId <= 0) return null;
    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    return $user ?: null;
}

// Mitarbeiter zu einem Ausweis-Code: Hauptausweis (mitarbeiter.rfid) oder ein weiterer Chip,
// der in der Benutzerverwaltung hinterlegt wurde (Tabelle mitarbeiter_ausweise)
function wp_mitarbeiter_per_ausweis($pdo, $rfid) {
    try {
        $stmt = $pdo->prepare("SELECT m.* FROM mitarbeiter m
            WHERE m.rfid = ? OR m.id = (SELECT a.mitarbeiter_id FROM mitarbeiter_ausweise a WHERE a.rfid = ? LIMIT 1)
            ORDER BY (m.rfid = ?) DESC LIMIT 1");
        $stmt->execute([$rfid, $rfid, $rfid]);
    } catch (Exception $e) {
        // Tabelle der weiteren Ausweise gibt es noch nicht (Benutzerverwaltung noch nie geöffnet)
        $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE rfid = ? LIMIT 1");
        $stmt->execute([$rfid]);
    }
    return $stmt->fetch() ?: null;
}
function wp_user_public($user) {
    if (!$user) return null;
    unset($user['rfid']);
    return $user;
}

function wp_darf_bearbeiten($user) {
    return $user && (intval($user['kannWochenplanBearbeiten'] ?? 0) === 1 || intval($user['isAdmin'] ?? 0) === 1);
}

function wp_require_login($pdo) {
    $user = wp_current_user($pdo);
    if (!$user) fehler('Nicht angemeldet', 401, 'auth');
    return $user;
}

function wp_require_editor($pdo) {
    $user = wp_require_login($pdo);
    if (!wp_darf_bearbeiten($user)) fehler('Keine Berechtigung zum Bearbeiten des Wochenplans', 403, 'forbidden');
    return $user;
}

// Woche und Feld aus der Anfrage, geprüft
function wp_woche($data) {
    $jahr = intval($data['jahr'] ?? 0);
    $kw = intval($data['kw'] ?? 0);
    if ($jahr < 2000 || $jahr > 2100 || $kw < 1 || $kw > 53) fehler('Jahr oder Kalenderwoche ist ungültig', 400);
    return [$jahr, $kw];
}

function wp_feld_gueltig($feld) {
    return is_string($feld) && (bool)preg_match('/^(kwinfo|[0-6]:(frueh|mittag|nacht))$/', $feld);
}

function wp_feld($data) {
    $feld = $data['feld'] ?? '';
    if (!wp_feld_gueltig($feld)) fehler('Unbekanntes Feld', 400);
    return $feld;
}

function wp_feld_name($feld) {
    if ($feld === 'kwinfo') return 'KW-Info';
    list($tag, $schicht) = explode(':', $feld);
    return WP_TAGE[intval($tag)] . ' ' . WP_SCHICHT_NAMEN[$schicht];
}

// Aktuellen Stand eines Feldes lesen. $sperren = true hält die Zeile bis zum Ende der Transaktion fest.
function wp_feld_lesen($pdo, $jahr, $kw, $feld, $sperren = false) {
    $zusatz = $sperren ? ' FOR UPDATE' : '';
    if ($feld === 'kwinfo') {
        $stmt = $pdo->prepare("SELECT inhalt, version, geaendert_von, last_updated FROM wochenplan_kwinfo WHERE jahr = ? AND kw = ?$zusatz");
        $stmt->execute([$jahr, $kw]);
    } else {
        list($tag, $schicht) = explode(':', $feld);
        $stmt = $pdo->prepare("SELECT inhalt, version, geaendert_von, last_updated FROM wochenplan_eintraege WHERE jahr = ? AND kw = ? AND tag = ? AND schicht = ?$zusatz");
        $stmt->execute([$jahr, $kw, intval($tag), $schicht]);
    }
    $row = $stmt->fetch();
    return [
        'inhalt' => $row ? (string)$row['inhalt'] : '',
        'version' => $row ? intval($row['version']) : 0,
        'von' => $row ? $row['geaendert_von'] : null,
        'am' => $row ? $row['last_updated'] : null,
    ];
}

// Feld schreiben; die Versionsnummer zählt bei jeder Änderung hoch
function wp_feld_schreiben($pdo, $jahr, $kw, $feld, $inhalt, $name) {
    if ($feld === 'kwinfo') {
        $stmt = $pdo->prepare("INSERT INTO wochenplan_kwinfo (jahr, kw, inhalt, version, geaendert_von, last_updated) VALUES (?, ?, ?, 1, ?, NOW())
            ON DUPLICATE KEY UPDATE inhalt = VALUES(inhalt), version = version + 1, geaendert_von = VALUES(geaendert_von), last_updated = NOW()");
        $stmt->execute([$jahr, $kw, $inhalt, $name]);
    } else {
        list($tag, $schicht) = explode(':', $feld);
        $stmt = $pdo->prepare("INSERT INTO wochenplan_eintraege (jahr, kw, tag, schicht, inhalt, version, geaendert_von, last_updated) VALUES (?, ?, ?, ?, ?, 1, ?, NOW())
            ON DUPLICATE KEY UPDATE inhalt = VALUES(inhalt), version = version + 1, geaendert_von = VALUES(geaendert_von), last_updated = NOW()");
        $stmt->execute([$jahr, $kw, intval($tag), $schicht, $inhalt, $name]);
    }
}

// Fassung im Verlauf ablegen. Gibt es zu einem Feld noch keinen Verlauf, wird zuerst der
// bisherige Inhalt gesichert – so bleibt auch der Stand vor der ersten Änderung erhalten.
function wp_verlauf_schreiben($pdo, $jahr, $kw, $feld, $alt, $neuerInhalt, $name) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM wochenplan_verlauf WHERE jahr = ? AND kw = ? AND feld = ?");
    $stmt->execute([$jahr, $kw, $feld]);
    if (intval($stmt->fetchColumn()) === 0 && trim($alt['inhalt']) !== '') {
        $stmt = $pdo->prepare("INSERT INTO wochenplan_verlauf (jahr, kw, feld, inhalt, user_name, zeitpunkt) VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))");
        $stmt->execute([$jahr, $kw, $feld, $alt['inhalt'], $alt['von'] ?: 'Stand vor der ersten Änderung', $alt['am']]);
    }
    $stmt = $pdo->prepare("INSERT INTO wochenplan_verlauf (jahr, kw, feld, inhalt, user_name, zeitpunkt) VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$jahr, $kw, $feld, $neuerInhalt, $name]);
}

// --- SPERREN ---
function wp_sperren_aufraeumen($pdo) {
    $pdo->exec("DELETE FROM wochenplan_sperren WHERE aktiv_am < DATE_SUB(NOW(), INTERVAL " . WP_SPERRE_SEK . " SECOND)");
}

// Sperre holen oder verlängern. Liefert null bei Erfolg, sonst den Namen dessen, der das Feld gerade bearbeitet.
function wp_sperre_holen($pdo, $jahr, $kw, $feld, $user) {
    $uid = intval($user['id']);
    $sek = WP_SPERRE_SEK;
    // Eigene und verfallene Sperre entfernen, dann neu eintragen: Der Primärschlüssel sorgt dafür,
    // dass von zwei gleichzeitigen Anfragen nur eine gewinnt.
    $stmt = $pdo->prepare("DELETE FROM wochenplan_sperren WHERE jahr = ? AND kw = ? AND feld = ?
        AND (user_id = ? OR aktiv_am < DATE_SUB(NOW(), INTERVAL $sek SECOND))");
    $stmt->execute([$jahr, $kw, $feld, $uid]);

    $stmt = $pdo->prepare("INSERT IGNORE INTO wochenplan_sperren (jahr, kw, feld, user_id, user_name, aktiv_am) VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$jahr, $kw, $feld, $uid, (string)$user['name']]);
    if ($stmt->rowCount() === 1) return null;

    $stmt = $pdo->prepare("SELECT user_name FROM wochenplan_sperren WHERE jahr = ? AND kw = ? AND feld = ?");
    $stmt->execute([$jahr, $kw, $feld]);
    $name = $stmt->fetchColumn();
    return $name === false ? 'jemand anderem' : $name;
}

function wp_sperre_fremd($pdo, $jahr, $kw, $feld, $uid) {
    $sek = WP_SPERRE_SEK;
    $stmt = $pdo->prepare("SELECT user_name FROM wochenplan_sperren WHERE jahr = ? AND kw = ? AND feld = ?
        AND user_id <> ? AND aktiv_am >= DATE_SUB(NOW(), INTERVAL $sek SECOND)");
    $stmt->execute([$jahr, $kw, $feld, $uid]);
    $name = $stmt->fetchColumn();
    return $name === false ? null : $name;
}

function wp_sperre_loesen($pdo, $jahr, $kw, $feld, $uid) {
    $pdo->prepare("DELETE FROM wochenplan_sperren WHERE jahr = ? AND kw = ? AND feld = ? AND user_id = ?")->execute([$jahr, $kw, $feld, $uid]);
}

// --- HTML-BEREINIGUNG ---
// Die Felder werden als formatierter Text (HTML aus dem Editor) gespeichert.
// Erlaubt bleibt nur, was die Formatierungsleiste erzeugen kann.
function wp_safe_style($style) {
    $erlaubt = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align'];
    $out = [];
    foreach (explode(';', $style) as $decl) {
        $parts = explode(':', $decl, 2);
        if (count($parts) !== 2) continue;
        $prop = strtolower(trim($parts[0]));
        $val = trim($parts[1]);
        if (!in_array($prop, $erlaubt, true)) continue;
        if (!preg_match('/^[#a-zA-Z0-9 .,%()\-]{1,60}$/', $val)) continue;
        if (preg_match('/url|expression/i', $val)) continue;
        $out[] = "$prop: $val";
    }
    return implode('; ', $out);
}

function wp_sanitize_node($node) {
    static $erlaubteTags = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'div', 'p', 'span', 'font', 'ul', 'ol', 'li', 'hr', 'a'];
    static $entfernen = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'img', 'video', 'audio', 'base', 'template', 'noscript'];

    foreach (iterator_to_array($node->childNodes) as $child) {
        if ($child->nodeType === XML_TEXT_NODE) continue;
        if ($child->nodeType !== XML_ELEMENT_NODE) {
            $node->removeChild($child);
            continue;
        }

        $tag = strtolower($child->nodeName);
        if (in_array($tag, $entfernen, true)) {
            $node->removeChild($child);
            continue;
        }

        wp_sanitize_node($child);

        if (!in_array($tag, $erlaubteTags, true)) {
            // Unbekanntes Element: Inhalt behalten, Hülle entfernen
            while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
            $node->removeChild($child);
            continue;
        }

        foreach (iterator_to_array($child->attributes) as $attr) {
            $name = strtolower($attr->nodeName);
            $value = $attr->nodeValue;
            $behalten = false;

            if ($name === 'style') {
                $safe = wp_safe_style($value);
                if ($safe !== '') { $child->setAttribute('style', $safe); $behalten = true; }
            } elseif ($tag === 'font' && $name === 'color') {
                $behalten = (bool)preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/', $value);
            } elseif ($tag === 'font' && $name === 'size') {
                $behalten = (bool)preg_match('/^[1-7]$/', $value);
            } elseif ($tag === 'a' && $name === 'href') {
                $behalten = (bool)preg_match('/^(https?:\/\/|mailto:)/i', trim($value));
            }

            if (!$behalten) $child->removeAttribute($attr->nodeName);
        }

        if ($tag === 'a') {
            if (!$child->hasAttribute('href')) {
                while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
                $node->removeChild($child);
                continue;
            }
            $child->setAttribute('target', '_blank');
            $child->setAttribute('rel', 'noopener noreferrer');
        }
    }
}

function wp_sanitize_html($html) {
    $html = (string)$html;
    if (mb_strlen($html) > WP_MAX_FELD) $html = mb_substr($html, 0, WP_MAX_FELD);
    if (trim($html) === '') return '';

    if (!class_exists('DOMDocument')) {
        // Notlösung ohne DOM-Erweiterung: nur einfache Formatierung ohne Attribute zulassen
        $html = strip_tags($html, '<b><strong><i><em><u><s><br><div><p><ul><ol><li><hr>');
        return preg_replace('/<(\w+)\s[^>]*>/', '<$1>', $html);
    }

    $doc = new DOMDocument('1.0', 'UTF-8');
    $alt = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><div id="wp-root">' . $html . '</div>', LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    libxml_use_internal_errors($alt);

    $root = $doc->getElementById('wp-root');
    if (!$root) return htmlspecialchars(strip_tags($html), ENT_QUOTES, 'UTF-8');

    wp_sanitize_node($root);

    $out = '';
    foreach ($root->childNodes as $child) $out .= $doc->saveHTML($child);
    $out = trim($out);

    // Felder, die nur aus leeren Zeilen bestehen, als leer speichern
    if (trim(str_replace("\xC2\xA0", ' ', html_entity_decode(strip_tags($out), ENT_QUOTES, 'UTF-8'))) === '' && stripos($out, '<hr') === false) {
        return '';
    }
    return $out;
}

// Formatierten Text in Zeilen reinen Texts zerlegen
function wp_html_zeilen($html) {
    $text = preg_replace('/<\/?(br|hr|div|p|li|ul|ol)\b[^>]*>/i', "\n", (string)$html);
    $text = html_entity_decode(strip_tags($text), ENT_QUOTES, 'UTF-8');
    $zeilen = [];
    foreach (explode("\n", str_replace("\xC2\xA0", ' ', $text)) as $z) {
        $z = trim(preg_replace('/\s+/u', ' ', $z) ?? '');
        if ($z !== '') $zeilen[] = $z;
    }
    return $zeilen;
}

// Alte JSON-Version speicherte Markdown-ähnlichen Text; für den Import nach HTML wandeln
function wp_markdown_to_html($md) {
    $md = rtrim(str_replace(["\r\n", "\r"], "\n", (string)$md));
    $html = htmlspecialchars($md, ENT_NOQUOTES, 'UTF-8');
    // In der Altversion per Farb-/Größenknopf eingefügte <span style='...'>-Markierungen wiederherstellen
    $html = preg_replace('/&lt;span style=(["\'])([^"\'<>]*)\1&gt;(.*?)&lt;\/span&gt;/s', '<span style="$2">$3</span>', $html);
    $html = preg_replace('/^#{1,3} (.*)$/m', '<b><font size="4">$1</font></b>', $html);
    $html = preg_replace('/^(-{3,}|_{5,})$/m', '<hr>', $html);
    $html = preg_replace('/\*\*(.+?)\*\*/s', '<b>$1</b>', $html);
    $html = preg_replace('/__(.+?)__/s', '<u>$1</u>', $html);
    $html = preg_replace('/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/', '<a href="$2">$1</a>', $html);
    $html = preg_replace('/(?<![\w\/:.])_(?!_)([^_\n]+)_(?![\w\/])/', '<i>$1</i>', $html);
    $html = preg_replace('/<hr>\n?/', '<hr>', $html);
    return str_replace("\n", '<br>', $html);
}

function wp_altdaten_zu_html($wert) {
    if (!is_string($wert) || trim($wert) === '') return '';
    $istHtml = (bool)preg_match('/<(br|div|p|b|i|u|font|ul|li|hr|strong|em)\b[^>]*>/i', $wert);
    return wp_sanitize_html($istHtml ? $wert : wp_markdown_to_html($wert));
}

function wp_baustein_public($row) {
    return [
        'id' => intval($row['id']),
        'text' => (string)$row['text'],
        'html' => $row['html'] !== null && $row['html'] !== '' ? (string)$row['html'] : null,
        'nutzung' => intval($row['nutzung']),
    ];
}

// ============================================================================
// ANMELDUNG
// ============================================================================
if ($action === 'login') {
    $rfid = trim((string)($data['rfid'] ?? ''));
    if ($rfid === '') fehler('Kein Code eingegeben', 200);

    $user = wp_mitarbeiter_per_ausweis($pdo, $rfid);
    if (!$user) fehler('Ungültiger Code', 200);

    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    respond(['success' => true, 'user' => wp_user_public($user), 'darf_bearbeiten' => wp_darf_bearbeiten($user)]);
}

if ($action === 'check_auth') {
    $user = wp_current_user($pdo);
    if (!$user) {
        if (isset($_SESSION['user'])) unset($_SESSION['user']);
        respond(['success' => false]);
    }
    $_SESSION['user'] = $user;
    respond(['success' => true, 'user' => wp_user_public($user), 'darf_bearbeiten' => wp_darf_bearbeiten($user)]);
}

if ($action === 'logout') {
    $userId = intval($_SESSION['user']['id'] ?? 0);
    if ($userId > 0) $pdo->prepare("DELETE FROM wochenplan_sperren WHERE user_id = ?")->execute([$userId]);
    session_unset();
    session_destroy();
    respond(['success' => true]);
}

// Ab hier wird die Sitzung nur noch gelesen: Sperre der Sitzungsdatei freigeben, damit der
// regelmäßige Abgleich andere Anfragen desselben Browsers nicht aufhält.
session_write_close();

// ============================================================================
// WOCHE LADEN (auch für den laufenden Abgleich: mit "stand" kommt nur bei Änderungen der volle Inhalt)
// ============================================================================
if ($action === 'woche') {
    $user = wp_require_login($pdo);
    list($jahr, $kw) = wp_woche($data);
    wp_sperren_aufraeumen($pdo);

    $felder = [];
    $stmt = $pdo->prepare("SELECT tag, schicht, inhalt, version, geaendert_von, last_updated FROM wochenplan_eintraege WHERE jahr = ? AND kw = ?");
    $stmt->execute([$jahr, $kw]);
    foreach ($stmt->fetchAll() as $r) {
        $feld = intval($r['tag']) . ':' . $r['schicht'];
        if (!wp_feld_gueltig($feld)) continue;
        if ((string)$r['inhalt'] === '' && intval($r['version']) === 0) continue;
        $felder[$feld] = ['inhalt' => (string)$r['inhalt'], 'version' => intval($r['version']), 'von' => $r['geaendert_von'], 'am' => $r['last_updated']];
    }
    $info = wp_feld_lesen($pdo, $jahr, $kw, 'kwinfo');
    if ($info['inhalt'] !== '' || $info['version'] > 0) $felder['kwinfo'] = $info;

    $sperren = [];
    $stmt = $pdo->prepare("SELECT feld, user_id, user_name FROM wochenplan_sperren WHERE jahr = ? AND kw = ?");
    $stmt->execute([$jahr, $kw]);
    foreach ($stmt->fetchAll() as $s) $sperren[$s['feld']] = ['user_id' => intval($s['user_id']), 'name' => $s['user_name']];

    // Kurzer Fingerabdruck des Stands: unverändert = keine erneute Übertragung der Inhalte
    $merkmale = [];
    foreach ($felder as $feld => $f) $merkmale[] = $feld . '#' . $f['version'] . '#' . strlen($f['inhalt']);
    foreach ($sperren as $feld => $s) $merkmale[] = $feld . '@' . $s['user_id'];
    sort($merkmale);
    $darf = wp_darf_bearbeiten($user);
    $stand = md5("$jahr|$kw|" . ($darf ? 1 : 0) . '|' . implode(',', $merkmale));

    if (($data['stand'] ?? '') === $stand) respond(['success' => true, 'unveraendert' => true, 'stand' => $stand]);

    respond([
        'success' => true,
        'jahr' => $jahr,
        'kw' => $kw,
        'felder' => (object)$felder,
        'sperren' => (object)$sperren,
        'stand' => $stand,
        'darf_bearbeiten' => $darf,
        'ich' => intval($user['id']),
    ]);
}

// Einzelnes Feld lesen (z.B. um den Eintrag der Vorwoche zu übernehmen)
if ($action === 'feld') {
    wp_require_login($pdo);
    list($jahr, $kw) = wp_woche($data);
    respond(['success' => true, 'feld' => wp_feld_lesen($pdo, $jahr, $kw, wp_feld($data))]);
}

// ============================================================================
// FELD BEARBEITEN
// ============================================================================

// Bearbeitung beginnen bzw. Sperre verlängern (Lebenszeichen alle paar Sekunden)
if ($action === 'sperren') {
    $user = wp_require_editor($pdo);
    list($jahr, $kw) = wp_woche($data);
    $feld = wp_feld($data);

    $belegtVon = wp_sperre_holen($pdo, $jahr, $kw, $feld, $user);
    if ($belegtVon !== null) {
        fehler($belegtVon . ' bearbeitet dieses Feld gerade.', 200, 'gesperrt', ['name' => $belegtVon]);
    }
    respond(['success' => true, 'feld' => wp_feld_lesen($pdo, $jahr, $kw, $feld)]);
}

if ($action === 'freigeben') {
    $user = wp_require_login($pdo);
    list($jahr, $kw) = wp_woche($data);
    wp_sperre_loesen($pdo, $jahr, $kw, wp_feld($data), intval($user['id']));
    respond(['success' => true]);
}

// Feld speichern. "version" ist der Stand, auf dem die Bearbeitung begonnen hat.
if ($action === 'speichern') {
    $user = wp_require_editor($pdo);
    list($jahr, $kw) = wp_woche($data);
    $feld = wp_feld($data);
    $basis = intval($data['version'] ?? -1);
    $erzwingen = !empty($data['erzwingen']);
    $uid = intval($user['id']);

    $inhalt = wp_sanitize_html($data['inhalt'] ?? '');

    try {
        $pdo->beginTransaction();

        $belegtVon = wp_sperre_fremd($pdo, $jahr, $kw, $feld, $uid);
        if ($belegtVon !== null) {
            $pdo->rollBack();
            fehler($belegtVon . ' bearbeitet dieses Feld gerade.', 200, 'gesperrt', ['name' => $belegtVon]);
        }

        $aktuell = wp_feld_lesen($pdo, $jahr, $kw, $feld, true);
        if ($aktuell['version'] !== $basis && !$erzwingen) {
            // Jemand hat das Feld inzwischen geändert: nichts überschreiben, beide Fassungen zurückmelden
            $pdo->rollBack();
            fehler('Das Feld wurde inzwischen von ' . ($aktuell['von'] ?: 'jemand anderem') . ' geändert.', 200, 'konflikt', ['feld' => $aktuell]);
        }

        if ($inhalt !== $aktuell['inhalt']) {
            wp_verlauf_schreiben($pdo, $jahr, $kw, $feld, $aktuell, $inhalt, (string)$user['name']);
            wp_feld_schreiben($pdo, $jahr, $kw, $feld, $inhalt, (string)$user['name']);
            logAction($pdo, (string)$user['name'], "KW $kw/$jahr: " . wp_feld_name($feld) . ($inhalt === '' ? ' geleert' : ' geändert'));
        }
        wp_sperre_loesen($pdo, $jahr, $kw, $feld, $uid);

        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Speichern fehlgeschlagen', 500);
    }

    respond(['success' => true, 'feld' => wp_feld_lesen($pdo, $jahr, $kw, $feld)]);
}

// Frühere Fassungen eines Feldes
if ($action === 'verlauf') {
    wp_require_login($pdo);
    list($jahr, $kw) = wp_woche($data);
    $feld = wp_feld($data);
    $stmt = $pdo->prepare("SELECT id, inhalt, user_name, zeitpunkt FROM wochenplan_verlauf WHERE jahr = ? AND kw = ? AND feld = ? ORDER BY id DESC LIMIT 25");
    $stmt->execute([$jahr, $kw, $feld]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) $r['id'] = intval($r['id']);
    unset($r);
    respond(['success' => true, 'data' => $rows]);
}

// ============================================================================
// TEXTBAUSTEINE UND VORSCHLÄGE
// ============================================================================
if ($action === 'bausteine') {
    wp_require_login($pdo);
    $rows = $pdo->query("SELECT id, text, html, nutzung FROM wochenplan_quicktexte ORDER BY nutzung DESC, id ASC")->fetchAll();
    respond(['success' => true, 'data' => array_map('wp_baustein_public', $rows)]);
}

if ($action === 'baustein_speichern') {
    $user = wp_require_editor($pdo);
    $id = intval($data['id'] ?? 0);
    $html = isset($data['html']) && is_string($data['html']) ? wp_sanitize_html($data['html']) : '';
    $text = is_string($data['text'] ?? null) ? trim(str_replace(["\r\n", "\r"], "\n", $data['text'])) : '';
    if ($text === '' && $html !== '') $text = implode("\n", wp_html_zeilen($html));
    if ($text === '') fehler('Bitte einen Text eingeben.', 400, 'text');
    $text = mb_substr($text, 0, WP_MAX_BAUSTEIN);

    if ($id > 0) {
        $stmt = $pdo->prepare("UPDATE wochenplan_quicktexte SET text = ?, html = ? WHERE id = ?");
        $stmt->execute([$text, $html !== '' ? $html : null, $id]);
    } else {
        $stmt = $pdo->prepare("SELECT id FROM wochenplan_quicktexte WHERE text = ? LIMIT 1");
        $stmt->execute([$text]);
        if ($stmt->fetchColumn() !== false) fehler('Diesen Textbaustein gibt es bereits.', 200, 'doppelt');
        $stmt = $pdo->prepare("INSERT INTO wochenplan_quicktexte (text, html) VALUES (?, ?)");
        $stmt->execute([$text, $html !== '' ? $html : null]);
        $id = intval($pdo->lastInsertId());
        logAction($pdo, (string)$user['name'], 'Textbaustein angelegt');
    }

    $stmt = $pdo->prepare("SELECT id, text, html, nutzung FROM wochenplan_quicktexte WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) fehler('Textbaustein nicht gefunden.', 404);
    respond(['success' => true, 'baustein' => wp_baustein_public($row)]);
}

if ($action === 'baustein_loeschen') {
    $user = wp_require_editor($pdo);
    $stmt = $pdo->prepare("DELETE FROM wochenplan_quicktexte WHERE id = ?");
    $stmt->execute([intval($data['id'] ?? 0)]);
    if ($stmt->rowCount() > 0) logAction($pdo, (string)$user['name'], 'Textbaustein gelöscht');
    respond(['success' => true]);
}

// Zählt mit, wie oft ein Baustein eingefügt wurde: häufig genutzte stehen oben
if ($action === 'baustein_genutzt') {
    wp_require_editor($pdo);
    $pdo->prepare("UPDATE wochenplan_quicktexte SET nutzung = nutzung + 1 WHERE id = ?")->execute([intval($data['id'] ?? 0)]);
    respond(['success' => true]);
}

// Vorschläge beim Tippen: Zeilen, die in den letzten Wochen mehrfach eingetragen wurden
if ($action === 'vorschlaege') {
    wp_require_login($pdo);
    $rows = $pdo->query("SELECT inhalt FROM wochenplan_eintraege WHERE inhalt <> '' ORDER BY jahr DESC, kw DESC, tag DESC LIMIT 900")->fetchAll(PDO::FETCH_COLUMN);

    $zaehler = [];
    $schreibweise = [];
    foreach ($rows as $html) {
        foreach (array_unique(wp_html_zeilen($html)) as $zeile) {
            $laenge = mb_strlen($zeile);
            if ($laenge < 4 || $laenge > 140 || !preg_match('/\p{L}{3}/u', $zeile)) continue;
            $key = mb_strtolower($zeile);
            $zaehler[$key] = ($zaehler[$key] ?? 0) + 1;
            if (!isset($schreibweise[$key])) $schreibweise[$key] = $zeile;   // neueste Schreibweise
        }
    }
    arsort($zaehler);

    $liste = [];
    foreach ($zaehler as $key => $n) {
        if ($n < 2) break;
        $liste[] = ['text' => $schreibweise[$key], 'n' => $n];
        if (count($liste) >= 300) break;
    }
    respond(['success' => true, 'data' => $liste]);
}

// ============================================================================
// ALTDATEN-IMPORT (einmalige Übernahme aus wochenplan.json / Quickbearbeitung.json)
//   wochenplan: { "<jahr>": { "<kw>": { "<tag 0-6>": { frueh, mittag, nacht }, "kwinfo": "..." } } }
//   quicktexte: [ { text }, ... ]
// ============================================================================
if ($action === 'import_json') {
    $user = wp_require_login($pdo);
    if (intval($user['isAdmin'] ?? 0) !== 1) fehler('Der Import ist Administratoren vorbehalten', 403, 'forbidden');

    $plan = $data['wochenplan'] ?? null;
    $quick = $data['quicktexte'] ?? null;
    $ueberschreiben = !empty($data['ueberschreiben']);
    if (!is_array($plan) && !is_array($quick)) fehler('Keine importierbaren Daten gefunden', 400);

    $stat = ['eintraege_neu' => 0, 'eintraege_uebersprungen' => 0, 'kwinfos' => 0, 'quicktexte_neu' => 0, 'quicktexte_uebersprungen' => 0];
    $quelle = 'Import (' . $user['name'] . ')';

    // Ein Feld übernehmen; vorhandene Inhalte bleiben ohne "überschreiben" stehen. Überschriebenes landet im Verlauf.
    $uebernehmen = function($jahr, $kw, $feld, $inhalt) use ($pdo, $ueberschreiben, $quelle) {
        $aktuell = wp_feld_lesen($pdo, $jahr, $kw, $feld);
        if ($aktuell['inhalt'] === $inhalt) return false;
        if (!$ueberschreiben && trim($aktuell['inhalt']) !== '') return false;
        if (trim($aktuell['inhalt']) !== '') wp_verlauf_schreiben($pdo, $jahr, $kw, $feld, $aktuell, $inhalt, $quelle);
        wp_feld_schreiben($pdo, $jahr, $kw, $feld, $inhalt, $quelle);
        return true;
    };

    try {
        $pdo->beginTransaction();

        if (is_array($plan)) {
            foreach ($plan as $jahr => $wochen) {
                $jahr = intval($jahr);
                if ($jahr < 2000 || $jahr > 2100 || !is_array($wochen)) continue;

                foreach ($wochen as $kw => $tage) {
                    $kw = intval($kw);
                    if ($kw < 1 || $kw > 53 || !is_array($tage)) continue;

                    foreach ($tage as $tag => $schichten) {
                        if (is_string($schichten) && in_array(strtolower((string)$tag), ['kwinfo', 'info'], true)) {
                            $inhalt = wp_altdaten_zu_html($schichten);
                            if ($inhalt !== '' && $uebernehmen($jahr, $kw, 'kwinfo', $inhalt)) $stat['kwinfos']++;
                            continue;
                        }

                        if (!is_numeric($tag) || !is_array($schichten)) continue;
                        $tag = intval($tag);
                        if ($tag < 0 || $tag > 6) continue;

                        foreach (WP_SCHICHTEN as $schicht) {
                            if (!isset($schichten[$schicht])) continue;
                            $inhalt = wp_altdaten_zu_html($schichten[$schicht]);
                            if ($inhalt === '') continue;
                            if ($uebernehmen($jahr, $kw, "$tag:$schicht", $inhalt)) $stat['eintraege_neu']++; else $stat['eintraege_uebersprungen']++;
                        }
                    }
                }
            }
        }

        if (is_array($quick)) {
            $vorhandene = $pdo->query("SELECT text FROM wochenplan_quicktexte")->fetchAll(PDO::FETCH_COLUMN);
            $stmtQ = $pdo->prepare("INSERT INTO wochenplan_quicktexte (text) VALUES (?)");
            foreach ($quick as $q) {
                $text = is_array($q) ? ($q['text'] ?? '') : $q;
                if (!is_string($text)) continue;
                // Textbausteine sind reiner Text: alte Markierungszeichen entfernen
                $text = preg_replace('/\*\*(.+?)\*\*/s', '$1', $text);
                $text = preg_replace('/__(.+?)__/s', '$1', $text);
                $text = trim(preg_replace('/^_{5,}$/m', '', str_replace(["\r\n", "\r"], "\n", $text)));
                if ($text === '') continue;
                if (in_array($text, $vorhandene, true)) { $stat['quicktexte_uebersprungen']++; continue; }
                $stmtQ->execute([mb_substr($text, 0, WP_MAX_BAUSTEIN)]);
                $vorhandene[] = $text;
                $stat['quicktexte_neu']++;
            }
        }

        logAction($pdo, (string)$user['name'], "Altdaten importiert: {$stat['eintraege_neu']} Einträge, {$stat['quicktexte_neu']} Textbausteine");
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Import fehlgeschlagen', 500);
    }

    respond(['success' => true, 'statistik' => $stat]);
}

fehler('Unbekannte Aktion', 400);
