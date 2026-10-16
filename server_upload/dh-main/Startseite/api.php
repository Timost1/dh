<?php
// Startseiten-API: Anmeldung, Telefonzuweisungen, Tagesplan (aus dem Wochenplan),
// Schwarzes Brett mit Kommentaren und LEAN-Kennzahlen. Alle Daten liegen in db_emhs.
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

// --- DB CONNECTION ---
$db_host = 'localhost';
$db_name = 'db_emhs';
$db_user = 'emhs';
$db_pass = 'dQ34TkmsMWRTUuwh';

const ST_KATEGORIEN = ['info', 'sicherheit', 'betrieb', 'organisation', 'sonstiges'];
const ST_MAX_TITEL = 120;
const ST_MAX_INHALT = 5000;
const ST_MAX_KOMMENTAR = 2000;
const ST_MAX_NAME = 80;
const ST_MAX_KENNZAHLEN = 6;

// Benachrichtigungen
const ST_NOTIF_TAGE = 14;            // Meldungen und Kommentare der letzten Tage
const ST_NOTIF_MAX = 50;             // höchstens so viele Einträge in der Liste
const ST_NOTIF_SYSTEMAUTOR = 'Übernahme alt%';   // automatisch übernommene Altinhalte lösen keine Benachrichtigung aus
const ST_BESTELL_STATUS = ['NEU' => 'Neu', 'ANGENOMMEN' => 'Angenommen', 'IN_BEARBEITUNG' => 'In Bearbeitung', 'ABGESCHLOSSEN' => 'Abgeschlossen'];

function respond($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function fehler($text, $status = 400, $code = null) {
    $payload = ['success' => false, 'error' => $text];
    if ($code !== null) $payload['code'] = $code;
    respond($payload, $status);
}

try {
    $dsn = "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4";
    $pdo = new PDO($dsn, $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
} catch (PDOException $e) {
    fehler('Datenbankverbindung fehlgeschlagen', 500);
}

// --- TABELLEN ---
function st_tabelle_vorhanden($pdo, $tabelle) {
    try {
        $pdo->query("SELECT 1 FROM `$tabelle` LIMIT 0");
        return true;
    } catch (Exception $e) {
        return false;
    }
}

function st_schema_anlegen($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mitarbeiter (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255),
        rfid VARCHAR(255),
        schicht VARCHAR(10),
        isAdmin INTEGER DEFAULT 0,
        Meister INTEGER DEFAULT 0,
        Lagermensch INTEGER DEFAULT 0
    )");

    // Telefonnummern auf der Startseite
    $pdo->exec("CREATE TABLE IF NOT EXISTS telefon_zuweisungen (
        num VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255)
    )");

    // Schwarzes Brett
    $meldungenNeu = !st_tabelle_vorhanden($pdo, 'startseite_meldungen');
    $pdo->exec("CREATE TABLE IF NOT EXISTS startseite_meldungen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titel VARCHAR(150) NOT NULL,
        inhalt TEXT NOT NULL,
        kategorie VARCHAR(30) NOT NULL DEFAULT 'info',
        autor_name VARCHAR(100) NOT NULL,
        autor_id INT NULL,
        angepinnt TINYINT(1) NOT NULL DEFAULT 0,
        archiviert TINYINT(1) NOT NULL DEFAULT 0,
        gueltig_bis DATE NULL,
        erstellt_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        geaendert_am DATETIME NULL,
        KEY idx_liste (archiviert, angepinnt, erstellt_am)
    ) DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS startseite_kommentare (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meldung_id INT NOT NULL,
        autor_name VARCHAR(100) NOT NULL,
        autor_id INT NULL,
        inhalt TEXT NOT NULL,
        erstellt_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_meldung (meldung_id, erstellt_am)
    ) DEFAULT CHARSET=utf8mb4");

    // LEAN-Kennzahlen
    $kennzahlenNeu = !st_tabelle_vorhanden($pdo, 'startseite_kennzahlen');
    $pdo->exec("CREATE TABLE IF NOT EXISTS startseite_kennzahlen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titel VARCHAR(80) NOT NULL,
        wert VARCHAR(30) NOT NULL,
        hinweis VARCHAR(80) NOT NULL DEFAULT '',
        fortschritt INT NULL,
        sortierung INT NOT NULL DEFAULT 0
    ) DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS startseite_einstellungen (
        schluessel VARCHAR(50) PRIMARY KEY,
        wert VARCHAR(255)
    ) DEFAULT CHARSET=utf8mb4");

    // Benachrichtigungen: welcher Benutzer hat welche Benachrichtigung gelesen.
    // Der Schlüssel benennt den Anlass, z.B. "meldung:12" oder "bestellung:14:IN_BEARBEITUNG".
    $pdo->exec("CREATE TABLE IF NOT EXISTS startseite_gelesen (
        user_id INT NOT NULL,
        schluessel VARCHAR(80) NOT NULL,
        gelesen_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, schluessel)
    ) DEFAULT CHARSET=utf8mb4");

    // Einmalige Übernahme der Inhalte, die bisher fest im HTML der Startseite standen
    if ($meldungenNeu) {
        $stmt = $pdo->prepare("INSERT INTO startseite_meldungen (titel, inhalt, kategorie, autor_name, angepinnt) VALUES (?, ?, ?, ?, 1)");
        $autor = 'Übernahme alte Startseite';
        $stmt->execute(['Tür Zentrale 1', "Tür Zentrale 1: 8449#\n\n(Stand: 18.03.25)", 'info', $autor]);
        $stmt->execute(['Sicherheitsanweisung', 'Werkstatt nicht offen lassen!', 'sicherheit', $autor]);
        $stmt->execute(['Brandschutz Info', 'Rauchmelder A25/26 -> Feuerwehr.', 'sicherheit', $autor]);
        $stmt->execute(['Support', 'Bei Problemen mit der Seite: E-Mail an Dörr & Sturm.', 'organisation', $autor]);
    }
    if ($kennzahlenNeu) {
        $stmt = $pdo->prepare("INSERT INTO startseite_kennzahlen (titel, wert, hinweis, fortschritt, sortierung) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute(['Prozessoptimierung', '94%', '+2.4% vs LM', 94, 1]);
        $stmt->execute(['Arbeitssicherheit', '100%', 'Optimal', 100, 2]);
        $stmt->execute(['5S Standard', 'A+', 'Zertifiziert', 75, 3]);
    }
}

try {
    $vollstaendig = true;
    foreach (['mitarbeiter', 'telefon_zuweisungen', 'startseite_meldungen', 'startseite_kommentare', 'startseite_kennzahlen', 'startseite_einstellungen', 'startseite_gelesen'] as $t) {
        if (!st_tabelle_vorhanden($pdo, $t)) { $vollstaendig = false; break; }
    }
    if (!$vollstaendig) st_schema_anlegen($pdo);
} catch (Exception $e) {
    fehler('Tabellen konnten nicht angelegt werden', 500);
}

// --- INPUT ---
$data = $_REQUEST;
$jsonInput = file_get_contents('php://input');
if (!empty($jsonInput)) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) {
        $data = array_merge($data, $decoded);
    }
}
$action = $data['action'] ?? '';

// --- HELFER ---
function st_user($pdo) {
    $userId = intval($_SESSION['user']['id'] ?? 0);
    if ($userId <= 0) return null;
    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    return $user ?: null;
}

// Mitarbeiter zu einem Ausweis-Code: Hauptausweis (mitarbeiter.rfid) oder ein weiterer Chip,
// der in der Benutzerverwaltung hinterlegt wurde (Tabelle mitarbeiter_ausweise)
function st_mitarbeiter_per_ausweis($pdo, $rfid) {
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
// Benutzerdaten für den Browser: ohne Ausweis-Code
function st_user_public($user) {
    if (!$user) return null;
    unset($user['rfid']);
    return $user;
}

// Admins und Meister dürfen Meldungen anpinnen, verwalten und Kennzahlen pflegen
function st_ist_verwalter($user) {
    return $user && (intval($user['isAdmin'] ?? 0) === 1 || intval($user['Meister'] ?? 0) === 1);
}

// Text säubern: Steuerzeichen entfernen, Zeilenenden vereinheitlichen, Länge begrenzen
function st_text($wert, $max, $einzeilig = false) {
    if (!is_string($wert)) return '';
    $wert = str_replace(["\r\n", "\r"], "\n", $wert);
    $wert = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $wert) ?? '';
    if ($einzeilig) $wert = preg_replace('/\s+/u', ' ', $wert) ?? '';
    $wert = preg_replace("/\n{4,}/", "\n\n\n", $wert) ?? '';
    return mb_substr(trim($wert), 0, $max);
}

function st_datum($wert) {
    if (!is_string($wert) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $wert, $m)) return null;
    return checkdate(intval($m[2]), intval($m[3]), intval($m[1])) ? $wert : null;
}

// Wer schreibt? Angemeldete Benutzer schreiben unter ihrem Namen, alle anderen müssen
// einen Namen angeben oder den Ausweis scannen. Ohne Namen wird nichts gespeichert.
function st_autor($pdo, $data, $user) {
    if ($user) return [$user['name'], intval($user['id'])];

    $rfid = trim((string)($data['rfid'] ?? ''));
    if ($rfid !== '') {
        $row = st_mitarbeiter_per_ausweis($pdo, $rfid);
        if (!$row) fehler('Ausweis nicht erkannt.', 400, 'rfid');
        return [$row['name'], intval($row['id'])];
    }

    $name = st_text($data['autor_name'] ?? '', ST_MAX_NAME, true);
    if (mb_strlen($name) < 2) fehler('Bitte Namen angeben.', 400, 'name');
    return [$name, null];
}

function st_meldung_laden($pdo, $id) {
    $stmt = $pdo->prepare("SELECT *, (gueltig_bis IS NOT NULL AND gueltig_bis < CURDATE()) AS abgelaufen FROM startseite_meldungen WHERE id = ?");
    $stmt->execute([intval($id)]);
    $m = $stmt->fetch();
    if (!$m) fehler('Meldung nicht gefunden.', 404);
    return $m;
}

function st_darf_meldung_bearbeiten($user, $meldung) {
    if (!$user) return false;
    if (st_ist_verwalter($user)) return true;
    return $meldung['autor_id'] !== null && intval($meldung['autor_id']) === intval($user['id']);
}

function st_meldung_eingabe($data) {
    $titel = st_text($data['titel'] ?? '', ST_MAX_TITEL, true);
    $inhalt = st_text($data['inhalt'] ?? '', ST_MAX_INHALT);
    $kategorie = $data['kategorie'] ?? 'info';
    if (mb_strlen($titel) < 3) fehler('Bitte eine Überschrift angeben (mindestens 3 Zeichen).', 400, 'titel');
    if ($inhalt === '') fehler('Bitte einen Text eingeben.', 400, 'inhalt');
    if (!in_array($kategorie, ST_KATEGORIEN, true)) $kategorie = 'info';

    $gueltigBis = null;
    if (!empty($data['gueltig_bis'])) {
        $gueltigBis = st_datum($data['gueltig_bis']);
        if ($gueltigBis === null) fehler('Das Ablaufdatum ist ungültig.', 400, 'gueltig_bis');
    }
    return [$titel, $inhalt, $kategorie, $gueltigBis];
}

function st_kennzahlen($pdo) {
    $rows = $pdo->query("SELECT id, titel, wert, hinweis, fortschritt FROM startseite_kennzahlen ORDER BY sortierung ASC, id ASC")->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = intval($r['id']);
        $r['fortschritt'] = $r['fortschritt'] === null ? null : intval($r['fortschritt']);
    }
    unset($r);

    $stmt = $pdo->prepare("SELECT wert, DATEDIFF(CURDATE(), wert) AS tage FROM startseite_einstellungen WHERE schluessel = 'unfallfrei_seit'");
    $stmt->execute();
    $unfall = $stmt->fetch();
    $seit = ($unfall && st_datum($unfall['wert'])) ? $unfall['wert'] : null;

    return [
        'kennzahlen' => $rows,
        'unfallfrei_seit' => $seit,
        'unfallfreie_tage' => $seit !== null ? max(0, intval($unfall['tage'])) : null,
    ];
}

function st_tagesplan($pdo, $jahr, $kw, $tag) {
    $plan = ['frueh' => '', 'mittag' => '', 'nacht' => '', 'kwinfo' => ''];
    try {
        $stmt = $pdo->prepare("SELECT schicht, inhalt FROM wochenplan_eintraege WHERE jahr = ? AND kw = ? AND tag = ?");
        $stmt->execute([$jahr, $kw, $tag]);
        foreach ($stmt->fetchAll() as $r) {
            if (array_key_exists($r['schicht'], $plan)) $plan[$r['schicht']] = (string)$r['inhalt'];
        }
        $stmt = $pdo->prepare("SELECT inhalt FROM wochenplan_kwinfo WHERE jahr = ? AND kw = ?");
        $stmt->execute([$jahr, $kw]);
        $plan['kwinfo'] = (string)($stmt->fetchColumn() ?: '');
    } catch (Exception $e) {
        // Wochenplan-Tabellen existieren noch nicht: leerer Plan
    }
    return $plan;
}

function st_telefone($pdo) {
    return $pdo->query("SELECT num, name FROM telefon_zuweisungen")->fetchAll(PDO::FETCH_KEY_PAIR);
}

// --- BENACHRICHTIGUNGEN ---
// Es gibt keine eigene Ereignistabelle: Die Liste wird bei jedem Abruf aus den vorhandenen
// Daten gebildet (Schwarzes Brett, Lager-Bestellungen). Gespeichert wird nur, was ein
// Benutzer gelesen hat. Jeder Anlass hat einen festen Schlüssel; ändert sich der Anlass
// (neuer Kommentar, neuer Bestellstatus), entsteht ein neuer Schlüssel und damit wieder
// eine ungelesene Benachrichtigung.

function st_kurz($text, $max) {
    $text = trim(preg_replace('/\s+/u', ' ', (string)$text) ?? '');
    return mb_strlen($text) > $max ? rtrim(mb_substr($text, 0, $max - 1)) . '…' : $text;
}

// Bestellte Artikel und Bemerkung als eine Zeile
function st_bestellung_kurz($bestellung) {
    $teile = [];
    $artikel = json_decode((string)($bestellung['items'] ?? ''), true);
    if (is_array($artikel)) {
        foreach (array_slice($artikel, 0, 3) as $a) {
            if (!is_array($a)) continue;
            $name = $a['name'] ?? ($a['bezeichnung'] ?? '');
            if (!is_string($name) || trim($name) === '') continue;
            $menge = intval($a['amount'] ?? ($a['menge'] ?? ($a['qty'] ?? 1)));
            $teile[] = max(1, $menge) . '× ' . trim($name);
        }
        if (count($artikel) > 3) $teile[] = '+' . (count($artikel) - 3) . ' weitere';
    }
    $text = implode(', ', $teile);
    $bemerkung = st_kurz($bestellung['bemerkung'] ?? '', 120);
    if ($bemerkung !== '') $text .= ($text !== '' ? ' – ' : '') . $bemerkung;
    return st_kurz($text, 200);
}

function st_benachrichtigungen($pdo, $user) {
    $uid = intval($user['id']);
    $name = (string)$user['name'];
    $tage = ST_NOTIF_TAGE;
    $liste = [];

    // 1) Schwarzes Brett: neue Meldungen anderer
    $stmt = $pdo->prepare("SELECT id, titel, inhalt, autor_name, erstellt_am, TIMESTAMPDIFF(SECOND, erstellt_am, NOW()) AS alter_sek
        FROM startseite_meldungen
        WHERE archiviert = 0 AND (gueltig_bis IS NULL OR gueltig_bis >= CURDATE())
          AND erstellt_am >= DATE_SUB(NOW(), INTERVAL $tage DAY)
          AND (autor_id IS NULL OR autor_id <> ?) AND autor_name <> ? AND autor_name NOT LIKE ?
        ORDER BY erstellt_am DESC LIMIT 30");
    $stmt->execute([$uid, $name, ST_NOTIF_SYSTEMAUTOR]);
    foreach ($stmt->fetchAll() as $m) {
        $liste[] = [
            'schluessel' => 'meldung:' . intval($m['id']),
            'typ' => 'meldung',
            'titel' => 'Neue Meldung: ' . $m['titel'],
            'text' => $m['autor_name'] . ' · ' . st_kurz($m['inhalt'], 140),
            'zeitpunkt' => $m['erstellt_am'],
            'alter_sek' => max(0, intval($m['alter_sek'])),
            'ziel' => ['art' => 'meldung', 'id' => intval($m['id'])],
        ];
    }

    // 2) Schwarzes Brett: Kommentare anderer zu eigenen Meldungen und zu Meldungen, die man selbst
    //    kommentiert hat. Eine Benachrichtigung je Meldung, sie zeigt den neuesten Kommentar.
    $stmt = $pdo->prepare("SELECT k.id, k.meldung_id, k.autor_name, k.inhalt, k.erstellt_am,
            TIMESTAMPDIFF(SECOND, k.erstellt_am, NOW()) AS alter_sek, m.titel
        FROM startseite_kommentare k
        JOIN startseite_meldungen m ON m.id = k.meldung_id
        WHERE k.id IN (
                SELECT MAX(k2.id) FROM startseite_kommentare k2
                WHERE k2.erstellt_am >= DATE_SUB(NOW(), INTERVAL $tage DAY)
                  AND (k2.autor_id IS NULL OR k2.autor_id <> ?) AND k2.autor_name <> ?
                GROUP BY k2.meldung_id)
          AND (m.autor_id = ? OR EXISTS (SELECT 1 FROM startseite_kommentare e WHERE e.meldung_id = k.meldung_id AND e.autor_id = ?))
        ORDER BY k.erstellt_am DESC LIMIT 30");
    $stmt->execute([$uid, $name, $uid, $uid]);
    foreach ($stmt->fetchAll() as $k) {
        $liste[] = [
            'schluessel' => 'kommentar:' . intval($k['meldung_id']) . ':' . intval($k['id']),
            'typ' => 'kommentar',
            'titel' => 'Neuer Kommentar zu „' . st_kurz($k['titel'], 70) . '“',
            'text' => $k['autor_name'] . ': ' . st_kurz($k['inhalt'], 140),
            'zeitpunkt' => $k['erstellt_am'],
            'alter_sek' => max(0, intval($k['alter_sek'])),
            'ziel' => ['art' => 'meldung', 'id' => intval($k['meldung_id'])],
        ];
    }

    // 3) Lager-Bestellungen (Tabellen der Lagerverwaltung; fehlen sie, entfällt dieser Teil)
    try {
        $istLager = intval($user['Lagermensch'] ?? 0) === 1 || intval($user['isAdmin'] ?? 0) === 1;

        if ($istLager) {
            $rows = $pdo->query("SELECT *, TIMESTAMPDIFF(SECOND, zeitpunkt, NOW()) AS alter_sek FROM bestellungen
                WHERE status = 'NEU' ORDER BY zeitpunkt DESC LIMIT 30")->fetchAll();
            foreach ($rows as $b) {
                $schicht = ($b['schicht'] === '?' || $b['schicht'] === null || $b['schicht'] === '') ? '' : ' (Schicht ' . $b['schicht'] . ')';
                $liste[] = [
                    'schluessel' => 'bestellung:' . intval($b['id']) . ':NEU',
                    'typ' => 'bestellung_neu',
                    'titel' => 'Neue Bestellung von ' . ($b['user_name'] ?: 'Unbekannt') . $schicht,
                    'text' => st_bestellung_kurz($b),
                    'zeitpunkt' => $b['zeitpunkt'],
                    'alter_sek' => max(0, intval($b['alter_sek'])),
                    'ziel' => ['art' => 'lager'],
                ];
            }
        }

        // Statusänderungen an eigenen Bestellungen bzw. Bestellungen der eigenen Schicht.
        // Wann und von wem der Status geändert wurde, steht nur im Lager-Protokoll.
        $aenderungen = [];
        $log = $pdo->query("SELECT beschreibung, user_name, zeitpunkt, TIMESTAMPDIFF(SECOND, zeitpunkt, NOW()) AS alter_sek
            FROM lager_log WHERE aktion = 'STATUS' ORDER BY id DESC LIMIT 300")->fetchAll();
        foreach ($log as $l) {
            if (preg_match('/Bestellung #(\d+)\b/u', (string)$l['beschreibung'], $m) && !isset($aenderungen[intval($m[1])])) {
                $aenderungen[intval($m[1])] = $l;
            }
        }

        $stmt = $pdo->prepare("SELECT *, TIMESTAMPDIFF(SECOND, zeitpunkt, NOW()) AS alter_sek FROM bestellungen
            WHERE status <> 'NEU' AND (user_name = ? OR schicht = ?) ORDER BY id DESC LIMIT 30");
        $stmt->execute([$name, (string)($user['schicht'] ?? '')]);
        foreach ($stmt->fetchAll() as $b) {
            $id = intval($b['id']);
            $status = preg_replace('/[^A-Z_]/', '', strtoupper((string)$b['status']));
            if ($status === '') continue;

            $aenderung = $aenderungen[$id] ?? null;
            if ($aenderung && $aenderung['user_name'] === $name) continue;   // selbst geändert
            $zeit = $aenderung ? $aenderung['zeitpunkt'] : $b['zeitpunkt'];
            $alter = max(0, intval($aenderung ? $aenderung['alter_sek'] : $b['alter_sek']));
            // Abgeschlossene Bestellungen nach 30 Tagen nicht mehr melden; offene bleiben sichtbar
            if ($status === 'ABGESCHLOSSEN' && $alter > 30 * 86400) continue;

            $text = st_bestellung_kurz($b);
            if ($aenderung && $aenderung['user_name']) $text = 'Geändert von ' . $aenderung['user_name'] . ($text !== '' ? ' · ' . $text : '');
            $liste[] = [
                'schluessel' => "bestellung:$id:$status",
                'typ' => 'bestellung_status',
                'titel' => "Bestellung #$id ist jetzt „" . (ST_BESTELL_STATUS[$status] ?? ucfirst(strtolower($status))) . '“',
                'text' => $text,
                'zeitpunkt' => $zeit,
                'alter_sek' => $alter,
                'ziel' => ['art' => 'lager'],
            ];
        }
    } catch (Exception $e) {
        // Lagerverwaltung nicht eingerichtet
    }

    usort($liste, function($a, $b) { return $a['alter_sek'] <=> $b['alter_sek']; });
    $liste = array_slice($liste, 0, ST_NOTIF_MAX);

    $stmt = $pdo->prepare("SELECT schluessel FROM startseite_gelesen WHERE user_id = ?");
    $stmt->execute([$uid]);
    $gelesen = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));
    foreach ($liste as &$n) $n['gelesen'] = isset($gelesen[$n['schluessel']]);
    unset($n);

    return $liste;
}

function st_ungelesen($liste) {
    $n = 0;
    foreach ($liste as $eintrag) if (!$eintrag['gelesen']) $n++;
    return $n;
}

function st_schluessel_gueltig($schluessel) {
    return is_string($schluessel) && (bool)preg_match('/^(meldung:\d{1,10}|kommentar:\d{1,10}:\d{1,10}|bestellung:\d{1,10}:[A-Z_]{1,20})$/', $schluessel);
}

// ============================================================================
// ANMELDUNG (gleiche Sitzung wie Lagerverwaltung, Wochenplan usw.)
// ============================================================================
if ($action === 'login') {
    $rfid = trim((string)($data['rfid'] ?? ''));
    if ($rfid === '') fehler('Kein Code eingegeben', 200);

    $user = st_mitarbeiter_per_ausweis($pdo, $rfid);
    if (!$user) fehler('Ungültiger Code oder Benutzer nicht gefunden', 200);

    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    respond(['success' => true, 'user' => st_user_public($user)]);
}

if ($action === 'logout') {
    session_unset();
    session_destroy();
    respond(['success' => true]);
}

$user = st_user($pdo);
if ($user) {
    $_SESSION['user'] = $user;
} elseif (isset($_SESSION['user'])) {
    unset($_SESSION['user']);
}
// Sitzung wird ab hier nur noch gelesen; Sperre freigeben, damit parallele Abfragen nicht warten
session_write_close();

if ($action === 'check_auth') {
    respond(['success' => (bool)$user, 'user' => st_user_public($user)]);
}

// Ausweis nur nachschlagen (z.B. für die Telefonzuweisung), ohne die Person anzumelden
if ($action === 'lookup_rfid') {
    $rfid = trim((string)($data['rfid'] ?? ''));
    if ($rfid === '') fehler('Kein Code eingegeben', 200);
    $row = st_mitarbeiter_per_ausweis($pdo, $rfid);
    if (!$row) fehler('Ausweis nicht erkannt.', 200);
    respond(['success' => true, 'name' => $row['name']]);
}

// ============================================================================
// ÜBERSICHT (ein Aufruf für alles, was regelmäßig aktualisiert wird)
// ============================================================================
if ($action === 'dashboard') {
    $jahr = intval($data['jahr'] ?? 0);
    $kw = intval($data['kw'] ?? 0);
    $tag = intval($data['tag'] ?? -1);
    $planGueltig = $jahr >= 2000 && $jahr <= 2100 && $kw >= 1 && $kw <= 53 && $tag >= 0 && $tag <= 6;

    respond(array_merge([
        'success' => true,
        'user' => st_user_public($user),
        'verwalter' => st_ist_verwalter($user),
        'telefone' => (object)st_telefone($pdo),
        'tagesplan' => $planGueltig ? st_tagesplan($pdo, $jahr, $kw, $tag) : null,
        'ungelesen' => $user ? st_ungelesen(st_benachrichtigungen($pdo, $user)) : 0,
    ], st_kennzahlen($pdo)));
}

// ============================================================================
// BENACHRICHTIGUNGEN (nur für angemeldete Benutzer; der Gelesen-Zustand gehört zum Benutzer)
// ============================================================================
if ($action === 'benachrichtigungen') {
    if (!$user) fehler('Nicht angemeldet', 401, 'auth');
    $liste = st_benachrichtigungen($pdo, $user);
    respond(['success' => true, 'data' => $liste, 'ungelesen' => st_ungelesen($liste)]);
}

// Einzelne oder mehrere Benachrichtigungen als gelesen bzw. wieder als ungelesen markieren
if ($action === 'benachrichtigung_markieren') {
    if (!$user) fehler('Nicht angemeldet', 401, 'auth');
    $eingabe = $data['schluessel'] ?? [];
    if (!is_array($eingabe)) $eingabe = [$eingabe];
    $schluessel = array_values(array_unique(array_filter($eingabe, 'st_schluessel_gueltig')));
    if (!$schluessel || count($schluessel) > 200) fehler('Ungültige Benachrichtigung');

    // Nur als gelesen markieren – zurück auf "ungelesen" ist bewusst nicht vorgesehen
    $uid = intval($user['id']);
    $stmt = $pdo->prepare("INSERT INTO startseite_gelesen (user_id, schluessel, gelesen_am) VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE gelesen_am = gelesen_am");
    foreach ($schluessel as $s) $stmt->execute([$uid, $s]);

    respond(['success' => true, 'ungelesen' => st_ungelesen(st_benachrichtigungen($pdo, $user))]);
}

if ($action === 'benachrichtigungen_alle_gelesen') {
    if (!$user) fehler('Nicht angemeldet', 401, 'auth');
    $uid = intval($user['id']);
    $stmt = $pdo->prepare("INSERT INTO startseite_gelesen (user_id, schluessel, gelesen_am) VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE gelesen_am = gelesen_am");
    foreach (st_benachrichtigungen($pdo, $user) as $n) {
        if (!$n['gelesen']) $stmt->execute([$uid, $n['schluessel']]);
    }
    // Merker zu längst erledigten Anlässen aufräumen
    $pdo->prepare("DELETE FROM startseite_gelesen WHERE user_id = ? AND gelesen_am < DATE_SUB(NOW(), INTERVAL 365 DAY)")->execute([$uid]);
    respond(['success' => true, 'ungelesen' => 0]);
}

// ============================================================================
// TELEFONNUMMERN
// ============================================================================
if ($action === 'get_phones') {
    respond(['success' => true, 'data' => (object)st_telefone($pdo)]);
}

if ($action === 'set_phone') {
    $num = trim((string)($data['num'] ?? ''));
    $name = st_text($data['name'] ?? '', ST_MAX_NAME, true);
    if ($num === '') fehler('Nummer fehlt');
    if (!preg_match('/^[A-Za-z0-9 \-]{1,20}$/', $num)) fehler('Ungültige Nummer');
    if ($name === '') $name = '-';

    $stmt = $pdo->prepare("INSERT INTO telefon_zuweisungen (num, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = ?");
    $stmt->execute([$num, $name, $name]);
    respond(['success' => true, 'name' => $name]);
}

// ============================================================================
// SCHWARZES BRETT
// ============================================================================
if ($action === 'brett_list') {
    $archiv = !empty($data['archiv']);
    $kategorie = $data['kategorie'] ?? '';
    $suche = st_text($data['q'] ?? '', 100, true);
    $proSeite = max(1, min(24, intval($data['pro_seite'] ?? 6)));
    $seite = max(1, intval($data['seite'] ?? 1));

    $aktiv = "(m.archiviert = 0 AND (m.gueltig_bis IS NULL OR m.gueltig_bis >= CURDATE()))";
    $where = [$archiv ? "NOT $aktiv" : $aktiv];
    $params = [];

    if (in_array($kategorie, ST_KATEGORIEN, true)) {
        $where[] = "m.kategorie = ?";
        $params[] = $kategorie;
    }
    if ($suche !== '') {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $suche) . '%';
        $where[] = "(m.titel LIKE ? OR m.inhalt LIKE ? OR m.autor_name LIKE ?)";
        array_push($params, $like, $like, $like);
    }
    $whereSql = implode(' AND ', $where);

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM startseite_meldungen m WHERE $whereSql");
    $stmt->execute($params);
    $gesamt = intval($stmt->fetchColumn());

    $seiten = max(1, (int)ceil($gesamt / $proSeite));
    $seite = min($seite, $seiten);
    $offset = ($seite - 1) * $proSeite;

    // Für die Kacheln genügt ein Textanfang; der volle Text wird erst beim Öffnen geladen
    $stmt = $pdo->prepare("SELECT m.id, m.titel, LEFT(m.inhalt, 320) AS vorschau, CHAR_LENGTH(m.inhalt) AS laenge,
            m.kategorie, m.autor_name, (m.autor_id IS NOT NULL) AS bestaetigt, m.angepinnt, m.archiviert,
            m.gueltig_bis, m.erstellt_am, m.geaendert_am,
            (SELECT COUNT(*) FROM startseite_kommentare k WHERE k.meldung_id = m.id) AS kommentare
        FROM startseite_meldungen m
        WHERE $whereSql
        ORDER BY m.angepinnt DESC, m.erstellt_am DESC, m.id DESC
        LIMIT $proSeite OFFSET $offset");
    $stmt->execute($params);

    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        foreach (['id', 'laenge', 'bestaetigt', 'angepinnt', 'archiviert', 'kommentare'] as $feld) $r[$feld] = intval($r[$feld]);
    }
    unset($r);

    $anzahlArchiv = intval($pdo->query("SELECT COUNT(*) FROM startseite_meldungen m WHERE NOT $aktiv")->fetchColumn());

    respond(['success' => true, 'data' => $rows, 'gesamt' => $gesamt, 'seite' => $seite, 'seiten' => $seiten, 'archiv_anzahl' => $anzahlArchiv]);
}

if ($action === 'brett_get') {
    $m = st_meldung_laden($pdo, $data['id'] ?? 0);

    $stmt = $pdo->prepare("SELECT id, autor_name, autor_id, inhalt, erstellt_am FROM startseite_kommentare WHERE meldung_id = ? ORDER BY erstellt_am ASC, id ASC");
    $stmt->execute([$m['id']]);
    $kommentare = [];
    foreach ($stmt->fetchAll() as $k) {
        $eigen = $user && $k['autor_id'] !== null && intval($k['autor_id']) === intval($user['id']);
        $kommentare[] = [
            'id' => intval($k['id']),
            'autor_name' => $k['autor_name'],
            'bestaetigt' => $k['autor_id'] !== null ? 1 : 0,
            'inhalt' => $k['inhalt'],
            'erstellt_am' => $k['erstellt_am'],
            'darf_loeschen' => st_ist_verwalter($user) || $eigen,
        ];
    }

    $abgelaufen = intval($m['abgelaufen']) === 1;
    respond(['success' => true, 'meldung' => [
        'id' => intval($m['id']),
        'titel' => $m['titel'],
        'inhalt' => $m['inhalt'],
        'kategorie' => $m['kategorie'],
        'autor_name' => $m['autor_name'],
        'bestaetigt' => $m['autor_id'] !== null ? 1 : 0,
        'angepinnt' => intval($m['angepinnt']),
        'archiviert' => intval($m['archiviert']),
        'abgelaufen' => $abgelaufen,
        'gueltig_bis' => $m['gueltig_bis'],
        'erstellt_am' => $m['erstellt_am'],
        'geaendert_am' => $m['geaendert_am'],
        'darf_bearbeiten' => st_darf_meldung_bearbeiten($user, $m),
        'darf_verwalten' => st_ist_verwalter($user),
    ], 'kommentare' => $kommentare]);
}

if ($action === 'brett_create') {
    list($titel, $inhalt, $kategorie, $gueltigBis) = st_meldung_eingabe($data);
    list($autorName, $autorId) = st_autor($pdo, $data, $user);
    $angepinnt = (!empty($data['angepinnt']) && st_ist_verwalter($user)) ? 1 : 0;

    // Der Zeitpunkt wird von der Datenbank gesetzt, nicht vom Browser
    $stmt = $pdo->prepare("INSERT INTO startseite_meldungen (titel, inhalt, kategorie, autor_name, autor_id, angepinnt, gueltig_bis, erstellt_am)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$titel, $inhalt, $kategorie, $autorName, $autorId, $angepinnt, $gueltigBis]);
    respond(['success' => true, 'id' => intval($pdo->lastInsertId())]);
}

if ($action === 'brett_update') {
    $m = st_meldung_laden($pdo, $data['id'] ?? 0);
    if (!st_darf_meldung_bearbeiten($user, $m)) {
        fehler('Nur der angemeldete Verfasser, Meister oder Administratoren dürfen diese Meldung ändern.', 403, 'forbidden');
    }
    list($titel, $inhalt, $kategorie, $gueltigBis) = st_meldung_eingabe($data);

    $stmt = $pdo->prepare("UPDATE startseite_meldungen SET titel = ?, inhalt = ?, kategorie = ?, gueltig_bis = ?, geaendert_am = NOW() WHERE id = ?");
    $stmt->execute([$titel, $inhalt, $kategorie, $gueltigBis, $m['id']]);
    respond(['success' => true]);
}

if ($action === 'brett_archive') {
    $m = st_meldung_laden($pdo, $data['id'] ?? 0);
    if (!st_darf_meldung_bearbeiten($user, $m)) {
        fehler('Nur der angemeldete Verfasser, Meister oder Administratoren dürfen diese Meldung archivieren.', 403, 'forbidden');
    }
    $archiviert = !empty($data['archiviert']) ? 1 : 0;
    if ($archiviert) {
        $pdo->prepare("UPDATE startseite_meldungen SET archiviert = 1, angepinnt = 0 WHERE id = ?")->execute([$m['id']]);
    } else {
        // Beim Wiederherstellen ein abgelaufenes Datum entfernen, sonst bliebe die Meldung im Archiv
        $pdo->prepare("UPDATE startseite_meldungen SET archiviert = 0,
            gueltig_bis = IF(gueltig_bis IS NOT NULL AND gueltig_bis < CURDATE(), NULL, gueltig_bis) WHERE id = ?")->execute([$m['id']]);
    }
    respond(['success' => true]);
}

if ($action === 'brett_pin') {
    if (!st_ist_verwalter($user)) fehler('Nur Meister oder Administratoren dürfen Meldungen anpinnen.', 403, 'forbidden');
    $m = st_meldung_laden($pdo, $data['id'] ?? 0);
    $pdo->prepare("UPDATE startseite_meldungen SET angepinnt = ? WHERE id = ?")->execute([!empty($data['angepinnt']) ? 1 : 0, $m['id']]);
    respond(['success' => true]);
}

if ($action === 'brett_delete') {
    if (!st_ist_verwalter($user)) fehler('Nur Meister oder Administratoren dürfen Meldungen löschen.', 403, 'forbidden');
    $m = st_meldung_laden($pdo, $data['id'] ?? 0);
    try {
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM startseite_kommentare WHERE meldung_id = ?")->execute([$m['id']]);
        $pdo->prepare("DELETE FROM startseite_meldungen WHERE id = ?")->execute([$m['id']]);
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Löschen fehlgeschlagen', 500);
    }
    respond(['success' => true]);
}

if ($action === 'kommentar_create') {
    $m = st_meldung_laden($pdo, $data['meldung_id'] ?? 0);
    $inhalt = st_text($data['inhalt'] ?? '', ST_MAX_KOMMENTAR);
    if ($inhalt === '') fehler('Bitte einen Kommentar eingeben.', 400, 'inhalt');
    list($autorName, $autorId) = st_autor($pdo, $data, $user);

    $stmt = $pdo->prepare("INSERT INTO startseite_kommentare (meldung_id, autor_name, autor_id, inhalt, erstellt_am) VALUES (?, ?, ?, ?, NOW())");
    $stmt->execute([$m['id'], $autorName, $autorId, $inhalt]);
    respond(['success' => true, 'id' => intval($pdo->lastInsertId())]);
}

if ($action === 'kommentar_delete') {
    $stmt = $pdo->prepare("SELECT id, autor_id FROM startseite_kommentare WHERE id = ?");
    $stmt->execute([intval($data['id'] ?? 0)]);
    $k = $stmt->fetch();
    if (!$k) fehler('Kommentar nicht gefunden.', 404);

    $eigen = $user && $k['autor_id'] !== null && intval($k['autor_id']) === intval($user['id']);
    if (!st_ist_verwalter($user) && !$eigen) fehler('Keine Berechtigung, diesen Kommentar zu löschen.', 403, 'forbidden');

    $pdo->prepare("DELETE FROM startseite_kommentare WHERE id = ?")->execute([$k['id']]);
    respond(['success' => true]);
}

// ============================================================================
// LEAN-KENNZAHLEN
// ============================================================================
if ($action === 'kennzahlen_save') {
    if (!st_ist_verwalter($user)) fehler('Nur Meister oder Administratoren dürfen die Kennzahlen pflegen.', 403, 'forbidden');
    $liste = $data['kennzahlen'] ?? [];
    if (!is_array($liste)) fehler('Ungültige Daten');

    $zeilen = [];
    foreach ($liste as $z) {
        if (!is_array($z)) continue;
        $titel = st_text($z['titel'] ?? '', 60, true);
        $wert = st_text($z['wert'] ?? '', 20, true);
        if ($titel === '' && $wert === '') continue;
        if ($titel === '' || $wert === '') fehler('Jede Kennzahl braucht eine Bezeichnung und einen Wert.', 400, 'kennzahl');
        $fortschritt = null;
        if (isset($z['fortschritt']) && $z['fortschritt'] !== '' && is_numeric($z['fortschritt'])) {
            $fortschritt = max(0, min(100, intval($z['fortschritt'])));
        }
        $zeilen[] = [$titel, $wert, st_text($z['hinweis'] ?? '', 60, true), $fortschritt];
    }
    if (count($zeilen) > ST_MAX_KENNZAHLEN) fehler('Es sind höchstens ' . ST_MAX_KENNZAHLEN . ' Kennzahlen möglich.', 400, 'kennzahl');

    $seit = null;
    if (!empty($data['unfallfrei_seit'])) {
        $seit = st_datum($data['unfallfrei_seit']);
        if ($seit === null) fehler('Das Datum "Unfallfrei seit" ist ungültig.', 400, 'unfallfrei_seit');
        $stmt = $pdo->prepare("SELECT ? > CURDATE()");
        $stmt->execute([$seit]);
        if (intval($stmt->fetchColumn()) === 1) fehler('Das Datum "Unfallfrei seit" darf nicht in der Zukunft liegen.', 400, 'unfallfrei_seit');
    }

    try {
        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM startseite_kennzahlen");
        $stmt = $pdo->prepare("INSERT INTO startseite_kennzahlen (titel, wert, hinweis, fortschritt, sortierung) VALUES (?, ?, ?, ?, ?)");
        foreach ($zeilen as $i => $z) $stmt->execute([$z[0], $z[1], $z[2], $z[3], $i + 1]);

        if ($seit === null) {
            $pdo->exec("DELETE FROM startseite_einstellungen WHERE schluessel = 'unfallfrei_seit'");
        } else {
            $pdo->prepare("INSERT INTO startseite_einstellungen (schluessel, wert) VALUES ('unfallfrei_seit', ?)
                ON DUPLICATE KEY UPDATE wert = VALUES(wert)")->execute([$seit]);
        }
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Speichern fehlgeschlagen', 500);
    }

    respond(array_merge(['success' => true], st_kennzahlen($pdo)));
}

// ============================================================================
// ALTDATEN-ÜBERNAHME (einmalig, aus den JSON-Dateien der früheren Version)
//   schwarzesbrett: { "text": "..." }            -> eine Meldung am Schwarzen Brett
//   telefonbuch:    { "6012": "Name", ... }      -> Telefonzuweisungen (nur freie Nummern)
// ============================================================================
if ($action === 'import_altdaten') {
    if (!$user || intval($user['isAdmin'] ?? 0) !== 1) {
        fehler('Die Datenübernahme ist Administratoren vorbehalten.', 403, 'forbidden');
    }

    $stat = ['meldungen_neu' => 0, 'meldungen_uebersprungen' => 0, 'telefone_neu' => 0, 'telefone_uebersprungen' => 0];
    $brett = $data['schwarzesbrett'] ?? null;
    $telefonbuch = $data['telefonbuch'] ?? null;
    // neueres Dateiformat: { "telefonbuch": { Nummer: Name }, "cowarner": { … } }
    if (is_array($telefonbuch) && is_array($telefonbuch['telefonbuch'] ?? null)) $telefonbuch = $telefonbuch['telefonbuch'];
    if (!is_array($brett) && !is_array($telefonbuch)) fehler('Keine importierbaren Daten gefunden.');

    try {
        $pdo->beginTransaction();

        if (is_array($brett)) {
            $text = is_string($brett['text'] ?? null) ? $brett['text'] : '';
            // Das alte Brett kannte Markierungen für fett/unterstrichen; das neue zeigt reinen Text
            $text = preg_replace('/\*\*(.+?)\*\*/s', '$1', $text);
            $text = preg_replace('/__(.+?)__/s', '$1', $text);
            $text = st_text($text, ST_MAX_INHALT);

            if ($text !== '') {
                $autor = 'Übernahme altes Schwarzes Brett';
                $erstellt = null;
                // Übliche Signatur am Ende: "(Vorname Nachname - TT.MM.JJJJ)"
                if (preg_match('/\n?\(([^()\n]{2,80}?)\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\)\s*$/u', $text, $m)
                    && checkdate(intval($m[3]), intval($m[2]), intval($m[4]))) {
                    $autor = st_text($m[1], ST_MAX_NAME, true);
                    $erstellt = sprintf('%04d-%02d-%02d 00:00:00', $m[4], $m[3], $m[2]);
                    $text = trim(mb_substr($text, 0, mb_strlen($text) - mb_strlen($m[0])));
                }

                $ersteZeile = trim(strtok($text, "\n"));
                $titel = rtrim(mb_substr($ersteZeile, 0, ST_MAX_TITEL), ' .');
                if (mb_strlen($titel) < 3) $titel = 'Mitteilung vom alten Schwarzen Brett';

                $stmt = $pdo->prepare("SELECT COUNT(*) FROM startseite_meldungen WHERE titel = ? AND inhalt = ?");
                $stmt->execute([$titel, $text]);
                if (intval($stmt->fetchColumn()) > 0 || $text === '') {
                    $stat['meldungen_uebersprungen']++;
                } else {
                    $stmt = $pdo->prepare("INSERT INTO startseite_meldungen (titel, inhalt, kategorie, autor_name, erstellt_am)
                        VALUES (?, ?, 'info', ?, COALESCE(?, NOW()))");
                    $stmt->execute([$titel, $text, $autor, $erstellt]);
                    $stat['meldungen_neu']++;
                }
            }
        }

        if (is_array($telefonbuch)) {
            $vorhanden = st_telefone($pdo);
            $stmt = $pdo->prepare("INSERT INTO telefon_zuweisungen (num, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)");
            foreach ($telefonbuch as $num => $wert) {
                $num = trim((string)$num);
                if ($num === 'Vertreter') $num = 'Vertretung';
                if (is_array($wert)) $wert = $wert['name'] ?? '';
                $name = st_text(is_string($wert) ? $wert : '', ST_MAX_NAME, true);
                if ($name === '' || $name === '-' || !preg_match('/^[A-Za-z0-9 \-]{1,20}$/', $num)) continue;

                // Aktuelle Zuweisungen aus der Datenbank haben Vorrang vor den alten Dateien
                $aktuell = $vorhanden[$num] ?? '';
                if ($aktuell !== '' && $aktuell !== '-') { $stat['telefone_uebersprungen']++; continue; }
                $stmt->execute([$num, $name]);
                $stat['telefone_neu']++;
            }
        }

        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Datenübernahme fehlgeschlagen', 500);
    }

    respond(['success' => true, 'statistik' => $stat]);
}

fehler('Unbekannte Aktion');
