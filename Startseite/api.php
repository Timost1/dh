<?php
session_start();

// Error Reporting enabled for debugging
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// --- DB CONNECTION ---
$db_host = 'localhost';
$db_name = 'db_emhs';
$db_user = 'emhs';
$db_pass = 'dQ34TkmsMWRTUuwh';

try {
    $dsn = "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4";
    $pdo = new PDO($dsn, $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4" // Ensure connection is UTF-8
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankverbindung fehlgeschlagen: ' . $e->getMessage()]);
    exit;
}


   // NEU: Tabelle für Telefonnummern auf der Startseite
    $pdo->exec("CREATE TABLE IF NOT EXISTS telefon_zuweisungen (
        num VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255)
    )");

// Daten aus Request oder JSON-Body auslesen
$data = $_REQUEST;
$jsonInput = file_get_contents('php://input');
if (!empty($jsonInput)) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) {
        $data = array_merge($data, $decoded);
    }
}
$action = $data['action'] ?? '';

// NEU: GET PHONE ASSIGNMENTS
if ($action === 'get_phones') {
    $stmt = $pdo->query("SELECT num, name FROM telefon_zuweisungen");
    $data = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

// NEU: SET PHONE ASSIGNMENT
if ($action === 'set_phone') {
    $num = trim($data['num'] ?? '');
    $name = trim($data['name'] ?? '');
    if (!empty($num)) {
        $stmt = $pdo->prepare("INSERT INTO telefon_zuweisungen (num, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = ?");
        $stmt->execute([$num, $name, $name]);
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Nummer fehlt']);
    }
    exit;
}
?>