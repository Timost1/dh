<?php
// Benutzerverwaltung-API. Arbeitet direkt auf der Tabelle `mitarbeiter` der Datenbank
// db_emhs, die auch alle anderen Module für Anmeldung und Rechte verwenden.
// Zugriff haben ausschließlich angemeldete Administratoren.
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

// Rollen und Rechte = Spalten der Tabelle mitarbeiter (Spaltenname => Bezeichnung im Protokoll)
const VW_RECHTE = [
    'isAdmin' => 'Administrator',
    'Meister' => 'Meister',
    'Vertreter' => 'Vertreter',
    'Lagermensch' => 'Lagermitarbeiter',
    'kannWochenplanBearbeiten' => 'Wochenplan bearbeiten',
    'kannFahrtenBearbeiten' => 'Fahrten bearbeiten',
    'kannFahrtenLoeschen' => 'Fahrten löschen',
    'kannProjektplanerBearbeiten' => 'Projektplaner bearbeiten',
    'kannSAWSehen' => 'Schaltanweisungen sehen',
    'kannSAWBearbeiten' => 'Schaltanweisungen bearbeiten',
    'kannSAWBearbeitenPlus' => 'Schaltanweisungen verwalten',
];
const VW_MAX_NAME = 100;
const VW_MAX_SCHICHT = 20;
const VW_MAX_RFID = 64;
const VW_MAX_AUSWEISE = 10;          // Ausweise/Chips je Benutzer
const VW_MAX_BEZEICHNUNG = 40;

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
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
} catch (PDOException $e) {
    fehler('Datenbankverbindung fehlgeschlagen', 500);
}

// --- TABELLEN (nur ergänzen, was fehlt; vorhandene Daten bleiben unberührt) ---
function vw_schema_pruefen($pdo) {
    try {
        $pdo->query("SELECT id, name, rfid, schicht, adminUserId, " . implode(', ', array_keys(VW_RECHTE)) . " FROM mitarbeiter LIMIT 0");
        $pdo->query("SELECT 1 FROM benutzer_log LIMIT 0");
        $pdo->query("SELECT id, mitarbeiter_id, rfid, bezeichnung, hauptausweis FROM mitarbeiter_ausweise LIMIT 0");
        return;
    } catch (Exception $e) {
        // weiter unten anlegen/ergänzen
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS mitarbeiter (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name TEXT,
        rfid TEXT,
        schicht TEXT
    )");
    try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN adminUserId INTEGER DEFAULT 0"); } catch (Exception $e) {}
    foreach (array_keys(VW_RECHTE) as $spalte) {
        $standard = $spalte === 'kannSAWSehen' ? 1 : 0;
        try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN `$spalte` INTEGER DEFAULT $standard"); } catch (Exception $e) {}
    }

    // Änderungsprotokoll: wer hat wann welchen Benutzer angelegt, geändert oder gelöscht
    $pdo->exec("CREATE TABLE IF NOT EXISTS benutzer_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        admin_name VARCHAR(255) NOT NULL,
        aktion VARCHAR(20) NOT NULL,
        benutzer_id INT NULL,
        benutzer_name VARCHAR(255) NOT NULL,
        details VARCHAR(1000) NOT NULL DEFAULT '',
        zeitpunkt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_zeit (zeitpunkt)
    ) DEFAULT CHARSET=utf8mb4");

    // Alle Ausweise und Chips je Benutzer. Der Hauptausweis steht zusätzlich wie bisher in
    // mitarbeiter.rfid, damit Module, die nur diese Spalte kennen, unverändert weiterlaufen.
    $pdo->exec("CREATE TABLE IF NOT EXISTS mitarbeiter_ausweise (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitarbeiter_id INT NOT NULL,
        rfid VARCHAR(191) NOT NULL,
        bezeichnung VARCHAR(60) NOT NULL DEFAULT '',
        hauptausweis TINYINT(1) NOT NULL DEFAULT 0,
        erstellt_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        erstellt_von VARCHAR(255) NOT NULL DEFAULT '',
        UNIQUE KEY uq_rfid (rfid),
        KEY idx_mitarbeiter (mitarbeiter_id)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
}

try {
    vw_schema_pruefen($pdo);
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
$action = $data['action'] ?? '';

// --- HELFER ---
function vw_user($pdo) {
    $userId = intval($_SESSION['user']['id'] ?? 0);
    if ($userId <= 0) return null;
    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    return $user ?: null;
}

// Daten für den Browser: Der Ausweis-Code verlässt den Server nie
function vw_public($row) {
    if (!$row) return null;
    $out = [
        'id' => intval($row['id']),
        'name' => (string)$row['name'],
        'schicht' => (string)($row['schicht'] ?? ''),
    ];
    foreach (array_keys(VW_RECHTE) as $spalte) $out[$spalte] = intval($row[$spalte] ?? 0);
    return $out;
}

function vw_text($wert, $max) {
    if (!is_string($wert)) return '';
    $wert = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $wert) ?? '';
    $wert = preg_replace('/\s+/u', ' ', $wert) ?? '';
    return mb_substr(trim($wert), 0, $max);
}

function vw_log($pdo, $admin, $aktion, $benutzerId, $benutzerName, $details) {
    $stmt = $pdo->prepare("INSERT INTO benutzer_log (admin_id, admin_name, aktion, benutzer_id, benutzer_name, details) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([intval($admin['id']), (string)$admin['name'], $aktion, $benutzerId, $benutzerName, mb_substr($details, 0, 1000)]);
}

// Mitarbeiter zu einem Ausweis-Code – Hauptausweis oder einer der weiteren Chips
function vw_mitarbeiter_per_ausweis($pdo, $rfid) {
    $stmt = $pdo->prepare("SELECT m.* FROM mitarbeiter m
        WHERE m.rfid = ? OR m.id = (SELECT a.mitarbeiter_id FROM mitarbeiter_ausweise a WHERE a.rfid = ? LIMIT 1)
        ORDER BY (m.rfid = ?) DESC LIMIT 1");
    $stmt->execute([$rfid, $rfid, $rfid]);
    return $stmt->fetch() ?: null;
}

// Ausweistabelle mit mitarbeiter.rfid abgleichen: Beim ersten Mal werden alle bisherigen Ausweise
// übernommen; danach fängt das Änderungen auf, die außerhalb dieser Verwaltung gemacht wurden.
function vw_ausweise_abgleichen($pdo) {
    $pdo->exec("DELETE a FROM mitarbeiter_ausweise a LEFT JOIN mitarbeiter m ON m.id = a.mitarbeiter_id WHERE m.id IS NULL");
    $pdo->exec("INSERT IGNORE INTO mitarbeiter_ausweise (mitarbeiter_id, rfid, bezeichnung, hauptausweis, erstellt_von)
        SELECT m.id, m.rfid, 'Werksausweis', 1, 'Übernahme'
        FROM mitarbeiter m
        WHERE m.rfid IS NOT NULL AND m.rfid <> '' AND CHAR_LENGTH(m.rfid) <= 191
          AND NOT EXISTS (SELECT 1 FROM mitarbeiter_ausweise a WHERE a.rfid = m.rfid)");
    $pdo->exec("UPDATE mitarbeiter_ausweise a JOIN mitarbeiter m ON m.id = a.mitarbeiter_id
        SET a.hauptausweis = IF(a.rfid = m.rfid, 1, 0)");
}

// Ausweise für den Browser: nie der Code selbst, nur die letzten drei Zeichen zum Unterscheiden
function vw_ausweis_public($row) {
    $code = (string)$row['rfid'];
    return [
        'id' => intval($row['id']),
        'bezeichnung' => (string)$row['bezeichnung'],
        'haupt' => intval($row['hauptausweis']) === 1,
        'ende' => mb_strlen($code) > 5 ? mb_substr($code, -3) : '',
        'erstellt_am' => (string)$row['erstellt_am'],
        'erstellt_von' => (string)$row['erstellt_von'],
    ];
}

function vw_ausweise_von($pdo, $mitarbeiterId) {
    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter_ausweise WHERE mitarbeiter_id = ? ORDER BY hauptausweis DESC, erstellt_am ASC, id ASC");
    $stmt->execute([$mitarbeiterId]);
    return $stmt->fetchAll();
}

function vw_anzahl_admins($pdo) {
    return intval($pdo->query("SELECT COUNT(*) FROM mitarbeiter WHERE isAdmin = 1")->fetchColumn());
}

// ============================================================================
// ANMELDUNG (gleiche Sitzung wie die übrigen Module)
// ============================================================================
if ($action === 'login') {
    $rfid = trim((string)($data['rfid'] ?? ''));
    if ($rfid === '') fehler('Kein Code eingegeben', 200);

    $user = vw_mitarbeiter_per_ausweis($pdo, $rfid);
    if (!$user) fehler('Ungültiger Code oder Benutzer nicht gefunden', 200);

    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    respond(['success' => true, 'user' => vw_public($user)]);
}

if ($action === 'logout') {
    session_unset();
    session_destroy();
    respond(['success' => true]);
}

$admin = vw_user($pdo);
if ($admin) {
    $_SESSION['user'] = $admin;
} elseif (isset($_SESSION['user'])) {
    unset($_SESSION['user']);
}
session_write_close();

if ($action === 'check_auth') {
    respond(['success' => (bool)$admin, 'user' => vw_public($admin)]);
}

// Alles Weitere nur für Administratoren
if (!$admin) fehler('Nicht angemeldet', 401, 'auth');
if (intval($admin['isAdmin'] ?? 0) !== 1) fehler('Die Benutzerverwaltung ist Administratoren vorbehalten.', 403, 'forbidden');

// ============================================================================
// BENUTZER
// ============================================================================
if ($action === 'uebersicht') {
    try { vw_ausweise_abgleichen($pdo); } catch (Exception $e) { /* Anzeige trotzdem liefern */ }

    $ausweise = [];
    foreach ($pdo->query("SELECT * FROM mitarbeiter_ausweise ORDER BY hauptausweis DESC, erstellt_am ASC, id ASC") as $a) {
        $ausweise[intval($a['mitarbeiter_id'])][] = vw_ausweis_public($a);
    }
    $rows = $pdo->query("SELECT * FROM mitarbeiter ORDER BY name ASC, id ASC")->fetchAll();
    $benutzer = array_map(function($row) use ($ausweise) {
        $u = vw_public($row);
        $u['ausweise'] = $ausweise[$u['id']] ?? [];
        return $u;
    }, $rows);
    $schichten = $pdo->query("SELECT DISTINCT schicht FROM mitarbeiter WHERE schicht IS NOT NULL AND schicht <> '' ORDER BY schicht ASC")->fetchAll(PDO::FETCH_COLUMN);
    respond([
        'success' => true,
        'ich' => intval($admin['id']),
        'benutzer' => $benutzer,
        'schichten' => $schichten,
    ]);
}

if ($action === 'benutzer_speichern') {
    $id = intval($data['id'] ?? 0);
    $neu = $id <= 0;

    $alt = null;
    if (!$neu) {
        $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
        $stmt->execute([$id]);
        $alt = $stmt->fetch();
        if (!$alt) fehler('Benutzer nicht gefunden.', 404);
    }

    $name = vw_text($data['name'] ?? '', VW_MAX_NAME);
    $schicht = vw_text($data['schicht'] ?? '', VW_MAX_SCHICHT);

    if (mb_strlen($name) < 2) fehler('Bitte einen Namen angeben (mindestens 2 Zeichen).', 400, 'name');
    if ($schicht === '') fehler('Bitte eine Schicht angeben.', 400, 'schicht');
    if (!preg_match('/^[\p{L}\p{N} .\-\/]+$/u', $schicht)) fehler('Die Schicht enthält unzulässige Zeichen.', 400, 'schicht');

    // --- Ausweise: gewünschter Stand als Liste. Vorhandene kommen mit id, neue mit Code. ---
    try { vw_ausweise_abgleichen($pdo); } catch (Exception $e) {}
    $bisher = [];
    if (!$neu) foreach (vw_ausweise_von($pdo, $id) as $a) $bisher[intval($a['id'])] = $a;

    $eingabeAusweise = is_array($data['ausweise'] ?? null) ? array_values($data['ausweise']) : [];
    if (count($eingabeAusweise) > VW_MAX_AUSWEISE) fehler('Höchstens ' . VW_MAX_AUSWEISE . ' Ausweise je Benutzer.', 400, 'ausweise');

    $ausweise = [];      // ['id' => int|null, 'rfid' => string, 'bezeichnung' => string, 'haupt' => bool]
    $neueCodes = [];
    foreach ($eingabeAusweise as $i => $a) {
        if (!is_array($a)) fehler('Ungültige Ausweisdaten.', 400, 'ausweise');
        $aid = intval($a['id'] ?? 0);
        $bezeichnung = vw_text($a['bezeichnung'] ?? '', VW_MAX_BEZEICHNUNG);
        if ($aid > 0) {
            if (!isset($bisher[$aid])) fehler('Ein Ausweis gehört nicht (mehr) zu diesem Benutzer. Bitte die Seite neu laden.', 409, 'ausweise');
            $code = (string)$bisher[$aid]['rfid'];
        } else {
            $code = trim((string)($a['rfid'] ?? ''));
            if ($code === '' || mb_strlen($code) > VW_MAX_RFID || preg_match('/[\s\x00-\x1F\x7F]/u', $code)) {
                fehler('Ein Ausweis-Code ist ungültig (keine Leerzeichen, höchstens ' . VW_MAX_RFID . ' Zeichen).', 400, 'ausweise');
            }
            $schluessel = mb_strtolower($code);
            if (isset($neueCodes[$schluessel])) fehler('Derselbe Ausweis wurde zweimal hinzugefügt.', 400, 'ausweise');
            $neueCodes[$schluessel] = true;

            // schon vergeben? (Hauptausweis eines anderen Benutzers oder irgendein hinterlegter Chip)
            $besitzer = vw_mitarbeiter_per_ausweis($pdo, $code);
            if ($besitzer) {
                if (intval($besitzer['id']) === $id) fehler('Dieser Ausweis ist bei ' . $name . ' bereits hinterlegt.', 409, 'ausweise');
                fehler('Dieser Ausweis ist bereits ' . $besitzer['name'] . ' zugeordnet.', 409, 'ausweise');
            }
        }
        $ausweise[] = ['id' => $aid > 0 ? $aid : null, 'rfid' => $code, 'bezeichnung' => $bezeichnung !== '' ? $bezeichnung : 'Ausweis', 'haupt' => !empty($a['haupt'])];
    }

    if ($neu && !$ausweise) fehler('Bitte mindestens einen Ausweis oder Chip hinterlegen.', 400, 'ausweise');
    if (!$neu && !$ausweise && $id === intval($admin['id'])) fehler('Den eigenen letzten Ausweis zu entfernen würde Sie aussperren.', 400, 'ausweise');

    // genau ein Hauptausweis
    $hauptIndex = null;
    foreach ($ausweise as $i => $a) if ($a['haupt']) { $hauptIndex = $i; break; }
    if ($hauptIndex === null && $ausweise) $hauptIndex = 0;
    foreach ($ausweise as $i => &$a) $a['haupt'] = $i === $hauptIndex;
    unset($a);
    $hauptCode = $hauptIndex !== null ? $ausweise[$hauptIndex]['rfid'] : null;

    $eingabe = is_array($data['rechte'] ?? null) ? $data['rechte'] : [];
    $rechte = [];
    foreach (array_keys(VW_RECHTE) as $spalte) {
        $rechte[$spalte] = !empty($eingabe[$spalte]) ? 1 : 0;
    }

    // Niemand soll sich selbst oder das System aussperren können
    if (!$neu && intval($alt['isAdmin']) === 1 && $rechte['isAdmin'] === 0) {
        if ($id === intval($admin['id'])) fehler('Das eigene Administratorrecht kann nicht entzogen werden.', 400, 'isAdmin');
        if (vw_anzahl_admins($pdo) <= 1) fehler('Es muss mindestens ein Administrator bestehen bleiben.', 400, 'isAdmin');
    }

    try {
        $pdo->beginTransaction();

        if ($neu) {
            $spalten = array_merge(['name', 'rfid', 'schicht', 'adminUserId'], array_keys($rechte));
            $werte = array_merge([$name, $hauptCode, $schicht, intval($admin['id'])], array_values($rechte));
            $sql = "INSERT INTO mitarbeiter (`" . implode('`, `', $spalten) . "`) VALUES (" . implode(', ', array_fill(0, count($spalten), '?')) . ")";
            $pdo->prepare($sql)->execute($werte);
            $id = intval($pdo->lastInsertId());

            $vergeben = [];
            foreach ($rechte as $spalte => $wert) if ($wert) $vergeben[] = VW_RECHTE[$spalte];
            $stmt = $pdo->prepare("INSERT INTO mitarbeiter_ausweise (mitarbeiter_id, rfid, bezeichnung, hauptausweis, erstellt_von) VALUES (?, ?, ?, ?, ?)");
            foreach ($ausweise as $a) $stmt->execute([$id, $a['rfid'], $a['bezeichnung'], $a['haupt'] ? 1 : 0, (string)$admin['name']]);

            $liste = implode(', ', array_map(fn($a) => $a['bezeichnung'], $ausweise));
            vw_log($pdo, $admin, 'ANGELEGT', $id, $name, 'Schicht ' . $schicht . '; Ausweise: ' . $liste . ($vergeben ? '; Rechte: ' . implode(', ', $vergeben) : ''));
        } else {
            $aenderungen = [];
            if ((string)$alt['name'] !== $name) $aenderungen[] = 'Name: ' . $alt['name'] . ' → ' . $name;
            if ((string)$alt['schicht'] !== $schicht) $aenderungen[] = 'Schicht: ' . $alt['schicht'] . ' → ' . $schicht;

            // Ausweise: entfernen, umbenennen, Hauptausweis wechseln, neue hinterlegen
            $behalten = [];
            foreach ($ausweise as $a) if ($a['id']) $behalten[$a['id']] = $a;
            foreach ($bisher as $aid => $b) {
                if (isset($behalten[$aid])) continue;
                $pdo->prepare("DELETE FROM mitarbeiter_ausweise WHERE id = ?")->execute([$aid]);
                $aenderungen[] = 'Ausweis entfernt: ' . $b['bezeichnung'];
            }
            $hauptAlt = null;
            foreach ($bisher as $b) if (intval($b['hauptausweis']) === 1) $hauptAlt = intval($b['id']);
            $stmtNeu = $pdo->prepare("INSERT INTO mitarbeiter_ausweise (mitarbeiter_id, rfid, bezeichnung, hauptausweis, erstellt_von) VALUES (?, ?, ?, ?, ?)");
            $stmtAlt = $pdo->prepare("UPDATE mitarbeiter_ausweise SET bezeichnung = ?, hauptausweis = ? WHERE id = ?");
            foreach ($ausweise as $a) {
                if ($a['id']) {
                    $b = $bisher[$a['id']];
                    if ((string)$b['bezeichnung'] !== $a['bezeichnung']) $aenderungen[] = 'Ausweis umbenannt: ' . $b['bezeichnung'] . ' → ' . $a['bezeichnung'];
                    $stmtAlt->execute([$a['bezeichnung'], $a['haupt'] ? 1 : 0, $a['id']]);
                    if ($a['haupt'] && $hauptAlt !== $a['id']) $aenderungen[] = 'Hauptausweis: ' . $a['bezeichnung'];
                } else {
                    $stmtNeu->execute([$id, $a['rfid'], $a['bezeichnung'], $a['haupt'] ? 1 : 0, (string)$admin['name']]);
                    $aenderungen[] = 'Ausweis hinzugefügt: ' . $a['bezeichnung'] . ($a['haupt'] && $bisher ? ' (als Hauptausweis)' : '');
                }
            }
            if ((string)($alt['rfid'] ?? '') !== (string)($hauptCode ?? '')) {
                $pdo->prepare("UPDATE mitarbeiter SET rfid = ? WHERE id = ?")->execute([$hauptCode, $id]);
            }
            if (!$ausweise && $bisher) $aenderungen[] = 'Kein Ausweis mehr hinterlegt – Anmeldung nicht mehr möglich';

            $plus = [];
            $minus = [];
            foreach ($rechte as $spalte => $wert) {
                $vorher = intval($alt[$spalte] ?? 0) === 1 ? 1 : 0;
                if ($vorher === $wert) continue;
                if ($wert) $plus[] = VW_RECHTE[$spalte]; else $minus[] = VW_RECHTE[$spalte];
            }
            if ($plus) $aenderungen[] = 'Erteilt: ' . implode(', ', $plus);
            if ($minus) $aenderungen[] = 'Entzogen: ' . implode(', ', $minus);

            if ($aenderungen) {
                $set = ['name = ?', 'schicht = ?', 'adminUserId = ?'];
                $werte = [$name, $schicht, intval($admin['id'])];

                foreach ($rechte as $spalte => $wert) { $set[] = "`$spalte` = ?"; $werte[] = $wert; }
                $werte[] = $id;
                $pdo->prepare("UPDATE mitarbeiter SET " . implode(', ', $set) . " WHERE id = ?")->execute($werte);
                vw_log($pdo, $admin, 'GEAENDERT', $id, $name, implode('; ', $aenderungen));
            }
        }

        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Speichern fehlgeschlagen', 500);
    }

    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
    $stmt->execute([$id]);
    $gespeichert = vw_public($stmt->fetch());
    $gespeichert['ausweise'] = array_map('vw_ausweis_public', vw_ausweise_von($pdo, $id));
    respond(['success' => true, 'benutzer' => $gespeichert, 'neu' => $neu]);
}

if ($action === 'benutzer_loeschen') {
    $id = intval($data['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
    $stmt->execute([$id]);
    $ziel = $stmt->fetch();
    if (!$ziel) fehler('Benutzer nicht gefunden.', 404);

    if ($id === intval($admin['id'])) fehler('Das eigene Benutzerkonto kann nicht gelöscht werden.', 400, 'self');
    if (intval($ziel['isAdmin']) === 1 && vw_anzahl_admins($pdo) <= 1) fehler('Es muss mindestens ein Administrator bestehen bleiben.', 400, 'isAdmin');

    try {
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM mitarbeiter WHERE id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM mitarbeiter_ausweise WHERE mitarbeiter_id = ?")->execute([$id]);
        // Offene Bearbeitungssperren und Sitzungsmarker des gelöschten Benutzers entfernen
        try {
            $pdo->prepare("DELETE FROM wochenplan_lock WHERE user_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM wochenplan_session WHERE user_id = ?")->execute([$id]);
        } catch (Exception $e) {}
        try { $pdo->prepare("DELETE FROM startseite_gelesen WHERE user_id = ?")->execute([$id]); } catch (Exception $e) {}
        vw_log($pdo, $admin, 'GELOESCHT', $id, (string)$ziel['name'], 'Schicht ' . $ziel['schicht']);
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fehler('Löschen fehlgeschlagen', 500);
    }
    respond(['success' => true]);
}

// ============================================================================
// PROTOKOLL
// ============================================================================
if ($action === 'protokoll') {
    $rows = $pdo->query("SELECT id, admin_name, aktion, benutzer_name, details, zeitpunkt FROM benutzer_log ORDER BY zeitpunkt DESC, id DESC LIMIT 200")->fetchAll();
    foreach ($rows as &$r) $r['id'] = intval($r['id']);
    unset($r);
    respond(['success' => true, 'data' => $rows]);
}

fehler('Unbekannte Aktion');
