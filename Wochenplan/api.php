<?php
// filepath: c:\Users\di38885\Desktop\Webseite\public\Wochenplan\api.php
session_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Serverfehler: ' . $error['message']]);
    }
});

// --- DB CONNECTION (gleiche Zugangsdaten wie Lagerverwaltung) ---
$db_host = 'localhost';
$db_name = 'db_emhs';
$db_user = 'emhs';
$db_pass = 'dQ34TkmsMWRTUuwh';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB-Verbindung fehlgeschlagen: ' . $e->getMessage()]);
    exit;
}

// --- TABELLEN ANLEGEN ---
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mitarbeiter (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255),
        rfid VARCHAR(255),
        schicht VARCHAR(10),
        isAdmin INTEGER DEFAULT 0,
        Meister INTEGER DEFAULT 0,
        Lagermensch INTEGER DEFAULT 0
    )");
} catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN kannWochenplanBearbeiten INTEGER DEFAULT 0"); } catch(Exception $e) {}

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

$pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_kwinfo (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    jahr INT NOT NULL,
    kw INT NOT NULL,
    inhalt TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_kwinfo (jahr, kw)
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_lock (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    user_name VARCHAR(255),
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_session (
    user_id INT PRIMARY KEY,
    user_name VARCHAR(255),
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_quicktexte (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    text TEXT
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS wochenplan_log (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    user_name VARCHAR(255),
    beschreibung VARCHAR(500),
    zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP
)");

// --- INPUT LESEN ---
$data = $_REQUEST;
$jsonInput = file_get_contents('php://input');
if (!empty($jsonInput)) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) $data = array_merge($data, $decoded);
}
$action = $data['action'] ?? ($_GET['action'] ?? '');

function logAction($pdo, $user, $desc) {
    $stmt = $pdo->prepare("INSERT INTO wochenplan_log (user_name, beschreibung) VALUES (?, ?)");
    $stmt->execute([$user, $desc]);
}

// 1. LOGIN
if ($action === 'login') {
    $rfid = trim($data['rfid'] ?? '');
    if (empty($rfid)) { echo json_encode(['success' => false, 'error' => 'Kein Code eingegeben']); exit; }

    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE rfid = ?");
    $stmt->execute([$rfid]);
    $user = $stmt->fetch();

    if ($user) {
        $_SESSION['user'] = $user;
        echo json_encode(['success' => true, 'user' => $user]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Ungültiger Code']);
    }
    exit;
}

// 2. CHECK AUTH
if ($action === 'check_auth') {
    if (isset($_SESSION['user'])) {
        $userId = $_SESSION['user']['id'] ?? 0;
        if ($userId > 0) {
            $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
            $stmt->execute([$userId]);
            $fresh = $stmt->fetch();
            if ($fresh) $_SESSION['user'] = $fresh;
        }
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['success' => false]);
    }
    exit;
}

// 3. LOGOUT
if ($action === 'logout') {
    $user = $_SESSION['user']['name'] ?? '';
    if (!empty($user)) {
        $stmt = $pdo->prepare("DELETE FROM wochenplan_lock WHERE user_name = ?");
        $stmt->execute([$user]);
    }
    session_unset();
    session_destroy();
    echo json_encode(['success' => true]);
    exit;
}

// 4. GET WEEK DATA
if ($action === 'get_week') {
    $jahr = intval($data['jahr'] ?? date('Y'));
    $kw = intval($data['kw'] ?? 1);

    $stmt = $pdo->prepare("SELECT tag, schicht, inhalt FROM wochenplan_eintraege WHERE jahr = ? AND kw = ?");
    $stmt->execute([$jahr, $kw]);
    $rows = $stmt->fetchAll();

    $result = [];
    foreach ($rows as $r) {
        $result[strval($r['tag'])][$r['schicht']] = $r['inhalt'];
    }

    $stmtInfo = $pdo->prepare("SELECT inhalt FROM wochenplan_kwinfo WHERE jahr = ? AND kw = ?");
    $stmtInfo->execute([$jahr, $kw]);
    $kwinfo = $stmtInfo->fetchColumn();

    echo json_encode(['success' => true, 'data' => $result, 'kwinfo' => $kwinfo ?: '']);
    exit;
}

// 5. SAVE WEEK DATA
if ($action === 'save_week') {
    $jahr = intval($data['jahr'] ?? 0);
    $kw = intval($data['kw'] ?? 0);
    $entries = $data['entries'] ?? [];
    $kwinfo = $data['kwinfo'] ?? '';
    $user = $data['user'] ?? 'System';

    if ($jahr <= 0 || $kw <= 0) {
        echo json_encode(['success' => false, 'error' => 'Jahr/KW fehlt']);
        exit;
    }

    $stmtUps = $pdo->prepare("INSERT INTO wochenplan_eintraege (jahr, kw, tag, schicht, inhalt) 
        VALUES (?, ?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE inhalt = VALUES(inhalt)");

    foreach ($entries as $tag => $schichten) {
        foreach ($schichten as $schicht => $inhalt) {
            $stmtUps->execute([$jahr, $kw, intval($tag), $schicht, $inhalt]);
        }
    }

    $stmtInfo = $pdo->prepare("INSERT INTO wochenplan_kwinfo (jahr, kw, inhalt) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE inhalt = VALUES(inhalt)");
    $stmtInfo->execute([$jahr, $kw, $kwinfo]);

    logAction($pdo, $user, "Wochenplan KW $kw/$jahr gespeichert");

    echo json_encode(['success' => true]);
    exit;
}

// 6. LOCK ACQUIRE/HEARTBEAT
if ($action === 'lock_acquire') {
    $userId = intval($data['userId'] ?? 0);
    $userName = $data['userName'] ?? '';

    $stmt = $pdo->query("SELECT * FROM wochenplan_lock ORDER BY id DESC LIMIT 1");
    $lock = $stmt->fetch();

    if ($lock && $lock['user_id'] != $userId) {
        $age = time() - strtotime($lock['locked_at']);
        if ($age < 60) {
            echo json_encode(['success' => false, 'message' => $lock['user_name'] . ' bearbeitet den Wochenplan bereits.']);
            exit;
        } else {
            $pdo->exec("DELETE FROM wochenplan_lock");
        }
    }

    $pdo->exec("DELETE FROM wochenplan_lock WHERE user_id != $userId");
    $stmtCheck = $pdo->prepare("SELECT id FROM wochenplan_lock WHERE user_id = ?");
    $stmtCheck->execute([$userId]);
    if ($stmtCheck->fetch()) {
        $stmtUpd = $pdo->prepare("UPDATE wochenplan_lock SET locked_at = NOW() WHERE user_id = ?");
        $stmtUpd->execute([$userId]);
    } else {
        $stmtIns = $pdo->prepare("INSERT INTO wochenplan_lock (user_id, user_name) VALUES (?, ?)");
        $stmtIns->execute([$userId, $userName]);
    }

    echo json_encode(['success' => true]);
    exit;
}

// 7. LOCK RELEASE
if ($action === 'lock_release') {
    $userId = intval($data['userId'] ?? 0);
    $stmt = $pdo->prepare("DELETE FROM wochenplan_lock WHERE user_id = ?");
    $stmt->execute([$userId]);
    echo json_encode(['success' => true]);
    exit;
}

// 8. LOCK STATUS
if ($action === 'lock_status') {
    $stmt = $pdo->query("SELECT * FROM wochenplan_lock ORDER BY id DESC LIMIT 1");
    $lock = $stmt->fetch();

    if ($lock) {
        $age = time() - strtotime($lock['locked_at']);
        if ($age > 60) {
            $pdo->exec("DELETE FROM wochenplan_lock");
            echo json_encode(['isLocked' => false]);
            exit;
        }
        echo json_encode(['isLocked' => true, 'userId' => intval($lock['user_id']), 'userName' => $lock['user_name']]);
    } else {
        echo json_encode(['isLocked' => false]);
    }
    exit;
}

// 9. SESSION HEARTBEAT
if ($action === 'session_heartbeat') {
    $userId = intval($data['userId'] ?? 0);
    $userName = $data['userName'] ?? '';
    if ($userId > 0) {
        $stmt = $pdo->prepare("INSERT INTO wochenplan_session (user_id, user_name, last_seen) VALUES (?, ?, NOW())
            ON DUPLICATE KEY UPDATE last_seen = NOW(), user_name = VALUES(user_name)");
        $stmt->execute([$userId, $userName]);
    }
    echo json_encode(['success' => true]);
    exit;
}

// 10. SESSION STATUS
if ($action === 'session_status') {
    $userId = intval($data['userId'] ?? ($_GET['userId'] ?? 0));
    $stmt = $pdo->prepare("SELECT * FROM wochenplan_session WHERE user_id = ?");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) { echo json_encode(['isValid' => false, 'reason' => 'no_session']); exit; }
    $age = time() - strtotime($row['last_seen']);
    if ($age > 600) { echo json_encode(['isValid' => false, 'reason' => 'timeout']); exit; }
    echo json_encode(['isValid' => true]);
    exit;
}

// 11. QUICK TEXTE LADEN
if ($action === 'get_quicktexte') {
    $rows = $pdo->query("SELECT id, text FROM wochenplan_quicktexte ORDER BY id ASC")->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

// 12. QUICK TEXTE SPEICHERN
if ($action === 'save_quicktexte') {
    $arr = $data['quicktexte'] ?? [];
    $pdo->exec("TRUNCATE TABLE wochenplan_quicktexte");
    $stmt = $pdo->prepare("INSERT INTO wochenplan_quicktexte (text) VALUES (?)");
    foreach ($arr as $q) {
        $text = is_array($q) ? ($q['text'] ?? '') : $q;
        if (trim($text) !== '') $stmt->execute([$text]);
    }
    echo json_encode(['success' => true]);
    exit;
}

// 13. AKTIVITÄTEN
if ($action === 'get_activities') {
    $rows = $pdo->query("SELECT * FROM wochenplan_log ORDER BY zeitpunkt DESC LIMIT 30")->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Invalid action']);