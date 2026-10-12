<?php
session_start(); // Wichtig für die Anmeldung
header('Content-Type: application/json');

// --- DATENBANK KONFIGURATION (Hier anpassen!) ---
// Ändere localhost zu 127.0.0.1 um TCP Verbindung zu erzwingen
$db_host = '127.0.0.1';
$db_name = 'db_emhs';
$db_user = 'emhs';
$db_pass = 'dQ34TkmsMWRTUuwh';  

try {
    // Variablen-Namen korrigiert
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Automatisch Tabelle erstellen, falls sie fehlt (Ein Tabelle für ALLES)
    $pdo->exec("CREATE TABLE IF NOT EXISTS fahrtenbuch (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fahrzeug VARCHAR(100) NOT NULL,
        datum DATETIME NOT NULL,
        fahrer VARCHAR(100) NOT NULL,
        kilometer INT NOT NULL,
        ort VARCHAR(255) NOT NULL,
        anmerkung TEXT,
        fahrzeugstatus VARCHAR(50) DEFAULT 'ok',
        status_details TEXT,
        user_id VARCHAR(50) DEFAULT 'anonymous'
    )");

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

// Request-Methode auslesen
$action = $_GET['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if ($input) {
        $_POST = array_merge($_POST, $input);
        $action = $action ?: ($input['action'] ?? '');
    }
}

// ENDPUNKTE

// --- AUTHENTIFIZIERUNG ---
if ($action === 'check_auth') {
    if (isset($_SESSION['user'])) {
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['success' => false]);
    }
    exit;
}

if ($action === 'login') {
    $rfid = trim($_POST['rfid'] ?? '');
    if (!$rfid) {
        echo json_encode(['success' => false, 'error' => 'Kein RFID Code angegeben']);
        exit;
    }
    
    // ANPASSEN: Falls deine Benutzertabelle anders heißt, hier den Namen anpassen (z.B. von "mitarbeiter" zu "Benutzer")
    try {
        $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE rfid = ?");
        $stmt->execute([$rfid]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user) {
            $_SESSION['user'] = $user;
            echo json_encode(['success' => true, 'user' => $user]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Benutzer nicht gefunden oder RFID falsch']);
        }
    } catch(PDOException $e) {
         // Gibt nun den genauen SQL-Fehler aus, damit du weißt welche Tabelle/Spalte ihm fehlt
         echo json_encode(['success' => false, 'error' => 'System-Fehler: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'logout') {
    session_destroy();
    echo json_encode(['success' => true]);
    exit;
}

// --- RFID IN NAMEN UMWANDELN (FÜR FELD "FAHRER") ---
if ($action === 'lookup_rfid') {
    $rfid = trim($_GET['rfid'] ?? '');
    if (!$rfid) {
        echo json_encode(['success' => false]);
        exit;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE rfid = ?");
        $stmt->execute([$rfid]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user) {
            // Kombiniere Vor- und Nachname, falls "name" nicht existiert
            $name = $user['name'] ?? trim(($user['vorname'] ?? '') . ' ' . ($user['nachname'] ?? ''));
            echo json_encode(['success' => true, 'name' => $name]);
        } else {
            echo json_encode(['success' => false]);
        }
    } catch(PDOException $e) {
         echo json_encode(['success' => false]);
    }
    exit;
}

// --- FAHRZEUGAUSWAHL LADEN ---
if ($action === 'get_vehicles') {
    $stmt = $pdo->query("SELECT DISTINCT fahrzeug FROM fahrtenbuch ORDER BY fahrzeug ASC");
    $vehicles = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo json_encode(['success' => true, 'data' => $vehicles]);
    exit;
}

if ($action === 'get_entries') {
    $fahrzeug = $_GET['fahrzeug'] ?? 'LKW DH158'; // Standard-Fahrzeug
    
    if ($fahrzeug === 'all') {
        // Alle Einträge absteigend nach Datum laden
        $stmt = $pdo->prepare("SELECT * FROM fahrtenbuch ORDER BY datum DESC");
        $stmt->execute();
    } else {
        // Ein spezifisches Fahrzeug laden
        $stmt = $pdo->prepare("SELECT * FROM fahrtenbuch WHERE fahrzeug = ? ORDER BY kilometer DESC, datum DESC");
        $stmt->execute([$fahrzeug]);
    }
    
    $entries = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Optional: Letzten KM-Stand ermitteln (nur sinnvoll bei einzelnem Fahrzeug)
    $lastKm = (!empty($entries) && $fahrzeug !== 'all') ? $entries[0]['kilometer'] : 0;
    
    echo json_encode(['success' => true, 'data' => $entries, 'last_km' => $lastKm]);
    exit;
}

if ($action === 'add_entry') {
    $fahrzeug = trim($_POST['fahrzeug'] ?? '');
    $fahrer = trim($_POST['fahrer'] ?? '');
    $kilometer = intval($_POST['kilometer'] ?? 0);
    $ort = trim($_POST['ort'] ?? '');
    $anmerkung = trim($_POST['anmerkung'] ?? '');
    $status = trim($_POST['fahrzeugstatus'] ?? 'ok');
    $status_details = trim($_POST['status_details'] ?? '');
    
    if (!$fahrzeug || !$fahrer || $kilometer <= 0 || !$ort) {
        echo json_encode(['success' => false, 'error' => 'Bitte alle Pflichtfelder (inkl. gültigem KM-Stand) ausfüllen.']);
        exit;
    }
    
    // Überprüfen, ob KM-Stand plausibel (höher als bisher)
    $check = $pdo->prepare("SELECT MAX(kilometer) as max_km FROM fahrtenbuch WHERE fahrzeug = ?");
    $check->execute([$fahrzeug]);
    $maxKm = $check->fetchColumn();
    
    if ($maxKm && $kilometer < $maxKm) {
        echo json_encode(['success' => false, 'error' => "Der KM-Stand ($kilometer) darf nicht kleiner sein als der bisher höchste ($maxKm)."]);
        exit;
    }
    
    // Eintragen (Datum wird automatisch auf JETZT gesetzt)
    $stmt = $pdo->prepare("INSERT INTO fahrtenbuch (fahrzeug, datum, fahrer, kilometer, ort, anmerkung, fahrzeugstatus, status_details) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?)");
    if ($stmt->execute([$fahrzeug, $fahrer, $kilometer, $ort, $anmerkung, $status, $status_details])) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Datenbankfehler beim Speichern.']);
    }
    exit;
}

// --- NEU: FAHRZEUG ANLEGEN ---
if ($action === 'add_vehicle') {
    $fahrzeug = trim($_POST['fahrzeug'] ?? '');
    $kilometer = intval($_POST['kilometer'] ?? 0);
    
    if (!$fahrzeug) {
        echo json_encode(['success' => false, 'error' => 'Fahrzeugname erforderlich.']);
        exit;
    }
    
    // Prüfen, ob schon vorhanden
    $check = $pdo->prepare("SELECT id FROM fahrtenbuch WHERE fahrzeug = ? LIMIT 1");
    $check->execute([$fahrzeug]);
    if ($check->fetchColumn()) {
        echo json_encode(['success' => false, 'error' => 'Dieses Fahrzeug existiert bereits.']);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO fahrtenbuch (fahrzeug, datum, fahrer, kilometer, ort, anmerkung, fahrzeugstatus) VALUES (?, NOW(), ?, ?, ?, ?, ?)");
    if ($stmt->execute([$fahrzeug, 'System', $kilometer, 'System-Init', 'Fahrzeug initial angelegt', 'ok'])) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Datenbankfehler beim Anlegen.']);
    }
    exit;
}

if ($action === 'edit_entry') {
    $id = intval($_POST['id'] ?? 0);
    $fahrer = trim($_POST['fahrer'] ?? '');
    $kilometer = intval($_POST['kilometer'] ?? 0);
    $ort = trim($_POST['ort'] ?? '');
    $anmerkung = trim($_POST['anmerkung'] ?? '');
    $status = trim($_POST['fahrzeugstatus'] ?? 'ok');
    $status_details = trim($_POST['status_details'] ?? '');
    
    if (!$id || !$fahrer || $kilometer <= 0 || !$ort) {
        echo json_encode(['success' => false, 'error' => 'Bitte alle Pflichtfelder (inkl. gültigem KM-Stand) ausfüllen.']);
        exit;
    }
    
    $stmt = $pdo->prepare("UPDATE fahrtenbuch SET fahrer=?, kilometer=?, ort=?, anmerkung=?, fahrzeugstatus=?, status_details=? WHERE id=?");
    if ($stmt->execute([$fahrer, $kilometer, $ort, $anmerkung, $status, $status_details, $id])) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Datenbankfehler beim Bearbeiten.']);
    }
    exit;
}

if ($action === 'get_last_km') {
    $fahrzeug = $_GET['fahrzeug'] ?? '';
    // Holt nun auch den letzten Fahrzeugstatus und den Detail-Text
    $stmt = $pdo->prepare("SELECT kilometer, fahrzeugstatus, status_details FROM fahrtenbuch WHERE fahrzeug = ? ORDER BY kilometer DESC, datum DESC LIMIT 1");
    $stmt->execute([$fahrzeug]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($row) {
        echo json_encode([
            'success' => true, 
            'last_km' => $row['kilometer'],
            'last_status' => $row['fahrzeugstatus'],
            'last_status_details' => $row['status_details']
        ]);
    } else {
        echo json_encode(['success' => true, 'last_km' => 0, 'last_status' => 'ok', 'last_status_details' => '']);
    }
    exit;
}

echo json_encode(['success' => false, 'error' => 'Unknown action']);
?>
