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

// --- INITIALIZATION ---
// Ensure 'mitarbeiter' table exists (usually handled by other modules, but safekeeping here)
// Also add 'Lagermensch' column if missing
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

try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN Lagermensch INTEGER DEFAULT 0"); } catch(Exception $e) {}

// Create 'schichtmaterial' table
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS schichtmaterial (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255),
        sku VARCHAR(50),
        kategorie VARCHAR(100),
        bestand INT DEFAULT 0,
        soll INT DEFAULT 0,
        schicht VARCHAR(10),
        status VARCHAR(50) DEFAULT 'OK'
    )");
    
    // NEU: Spalte last_updated hinzufügen falls nicht vorhanden
    try { $pdo->exec("ALTER TABLE schichtmaterial ADD COLUMN last_updated DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch(Exception $e) {}

    // DUMMY DATEN LOGIK ENTFERNT, damit Tabelle nicht automatisch neu befüllt wird.
    /* 
    $res = $pdo->query("SELECT COUNT(*) FROM schichtmaterial");
    if ($res && $res->fetchColumn() == 0) {
        ...
    } 
    */

    // NEU: Tabelle für Aktivitäten-Log
    $pdo->exec("CREATE TABLE IF NOT EXISTS lager_log (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        user_name VARCHAR(255),
        aktion VARCHAR(50), -- z.B. 'ENTNAHME', 'NEU', 'ORDER'
        beschreibung VARCHAR(255),
        schicht VARCHAR(10),
        zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    
    // NEU: Tabelle für Bestellungen
    $pdo->exec("CREATE TABLE IF NOT EXISTS bestellungen (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        user_name VARCHAR(255),
        schicht VARCHAR(10),
        items TEXT, -- JSON Array der bestellten Items
        status VARCHAR(20) DEFAULT 'NEU', -- NEU, ANGENOMMEN
        zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // NEU: Bemerkungsfeld zur Tabelle hinzufügen falls nicht vorhanden
    try { $pdo->exec("ALTER TABLE bestellungen ADD COLUMN bemerkung TEXT AFTER items"); } catch(Exception $e) {}

    // NEU: Haupt-Inventar Tabelle (importiert aus material.dat)
    $pdo->exec("CREATE TABLE IF NOT EXISTS lagerbestand (
        id INT AUTO_INCREMENT PRIMARY KEY,
        emhsnr VARCHAR(50) UNIQUE,
        sapnr VARCHAR(50),
        bezeichnung TEXT,
        typ TEXT,
        hersteller TEXT,
        bemerkung TEXT,
        lagerort VARCHAR(50),
        lagerplatz VARCHAR(50),
        soll INT DEFAULT 0,
        ist INT DEFAULT 0,
        dhnr VARCHAR(50),
        bestnr TEXT,
        bild_pfad VARCHAR(255) DEFAULT '',
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    
    // Automatisch bestehende Struktur patchen, falls 'bestnr' noch zu klein ist
    try { $pdo->exec("ALTER TABLE lagerbestand MODIFY bestnr TEXT"); } catch(Exception $e) {}

    // Sicherstellen, dass die Spalte 'dhnr' existiert (falls die Tabelle vor Einführung
    // dieses Features bereits angelegt wurde, fügt CREATE TABLE IF NOT EXISTS die Spalte nicht hinzu)
    try { $pdo->exec("ALTER TABLE lagerbestand ADD COLUMN dhnr VARCHAR(50)"); } catch(Exception $e) {}

    // NEU: dhnr auf TEXT vergrößern, damit längere Werte nicht verworfen/abgeschnitten werden
    try { $pdo->exec("ALTER TABLE lagerbestand MODIFY dhnr TEXT"); } catch(Exception $e) {}

    // NEU: Spalte für Bild-Daten (BLOB) hinzufügen
    try { $pdo->exec("ALTER TABLE lagerbestand ADD COLUMN bild_blob LONGBLOB"); } catch(Exception $e) {}

    // NEU: Tabelle für Bestell-Dokumente
    $pdo->exec("CREATE TABLE IF NOT EXISTS bestell_dateien (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        datei_blob LONGBLOB,
        mime_type VARCHAR(100),
        zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // NEU: Tabelle für Artikel-Dateien (Mehrere Bilder/PDFs pro Artikel)
    $pdo->exec("CREATE TABLE IF NOT EXISTS artikel_dateien (
        id INTEGER PRIMARY KEY AUTO_INCREMENT,
        datei_blob LONGBLOB,
        mime_type VARCHAR(100),
        zeitpunkt DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

} catch (Exception $e) {}

// --- HANDLERS ---
$method = $_SERVER['REQUEST_METHOD'];
$data = $_REQUEST; 

// Read JSON input if sent
$jsonInput = file_get_contents('php://input');
if (!empty($jsonInput)) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) {
        $data = array_merge($data, $decoded);
    }
}

$action = isset($data['action']) ? $data['action'] : '';

// 1. Auth Check
if ($action === 'check_auth') {
    if (isset($_SESSION['user'])) {
        // Reload user from DB to get latest permissions (like Lagermensch)
        $userId = $_SESSION['user']['id'] ?? 0;
        if($userId > 0) {
             $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE id = ?");
             $stmt->execute([$userId]);
             $freshUser = $stmt->fetch();
             if($freshUser) $_SESSION['user'] = $freshUser;
        }
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['success' => false]);
    }
    exit;
}

// 2. Login
if ($action === 'login') {
    $rfid = trim($data['rfid'] ?? '');

    if (empty($rfid)) {
        echo json_encode(['success' => false, 'error' => 'Kein Code eingegeben']);
        exit;
    }

    // Prepare statement to find user
    $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE rfid = ?");
    $stmt->execute([$rfid]);
    $user = $stmt->fetch();

    /* Fallback logic if you use password_verify (hashed RFIDs) in production:
    if (!$user) {
        // Try fetching all and verifying hash if direct match failed
        $stmt = $pdo->query("SELECT * FROM mitarbeiter");
        while($row = $stmt->fetch()) {
            if (password_verify($rfid, $row['rfid'])) {
                $user = $row;
                break;
            }
        }
    }
    */

    if ($user) {
        // Session starting
        if (session_status() === PHP_SESSION_NONE) session_start();
        
        // Normalize user data structure
        if (!isset($user['name'])) {
            $user['name'] = trim(($user['vorname'] ?? '') . ' ' . ($user['nachname'] ?? ''));
        }
        
        $_SESSION['user'] = $user;
        echo json_encode(['success' => true, 'user' => $user]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Ungültiger Code oder Benutzer nicht gefunden']);
    }
    exit;
}

// 3. Logout
if ($action === 'logout') {
    session_unset();
    session_destroy();
    echo json_encode(['success' => true]);
    exit;
}

// NEU: MATERIAL IMPORT
if ($action === 'import_material') {
    $file = __DIR__ . '/material.dat';
    
    if (!file_exists($file)) {
        echo json_encode(['success' => false, 'error' => 'material.dat nicht gefunden']);
        exit;
    }

    // Datei einbinden. Da sie $matdaten definiert.
    include $file;

    if (!isset($matdaten) || !is_array($matdaten)) {
        echo json_encode(['success' => false, 'error' => '$matdaten Array nicht gefunden']);
        exit;
    }

    // --- NEU: Gesamte Tabelle vor dem Import leeren ---
    try {
        $pdo->exec("TRUNCATE TABLE lagerbestand");
    } catch(Exception $e) {
        // Fallback falls TRUNCATE (z.B. wegen Rechten) nicht klappt
        $pdo->exec("DELETE FROM lagerbestand");
    }

    $count = 0;
    // Prepared Statement nur noch für Insert
    $stmtIns = $pdo->prepare("INSERT INTO lagerbestand (emhsnr, sapnr, bezeichnung, typ, hersteller, bemerkung, lagerort, lagerplatz, soll, ist, dhnr, bestnr) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    foreach ($matdaten as $item) {
        // Helper to get value case-insensitively
        $getVal = function($arr, $key) {
            // Direct match
            if(isset($arr[$key])) return $arr[$key];
            // Case insensitive match
            $lowerKey = strtolower($key);
            foreach($arr as $k => $v) {
                if(strtolower($k) === $lowerKey) return $v;
            }
            return null;
        };

        $emhsnr = trim($getVal($item, 'emhsnr') ?? '');
        if (empty($emhsnr)) continue;

        // Daten bereinigen (emhsnr direkt an erster Stelle)
        $p = [
            $emhsnr,
            $getVal($item, 'sapnr') ?? '',
            $getVal($item, 'bezeichnung') ?? 'Unbekannter Artikel', // Default value if missing
            $getVal($item, 'typ') ?? '',
            $getVal($item, 'hersteller') ?? '',
            $getVal($item, 'bemerkung') ?? '',
            $getVal($item, 'lagerort') ?? '',
            $getVal($item, 'lagerplatz') ?? '',
            intval($getVal($item, 'soll') ?? 0),
            intval($getVal($item, 'ist') ?? 0),
            $getVal($item, 'dhnr') ?? '',
            $getVal($item, 'bestnr') ?? ''
        ];

        // Insert
        $stmtIns->execute($p);
        $count++;
    }

    echo json_encode(['success' => true, 'message' => "$count Artikel erfolgreich neu importiert"]);
    exit;
}

// NEU: GET INVENTORY (Hauptlager)
if ($action === 'get_inventory') {
    $search = $_GET['search'] ?? '';
    $sql = "SELECT * FROM lagerbestand";
    $params = [];
    
    if (!empty($search)) {
        $sql .= " WHERE bezeichnung LIKE ? OR typ LIKE ? OR sapnr LIKE ? OR emhsnr LIKE ? OR lagerplatz LIKE ? OR bestnr LIKE ?";
        $term = "%$search%";
        $params = [$term, $term, $term, $term, $term, $term];
    }
    
    // Limit entfernt, damit alle Artikel geladen werden
    $sql .= " ORDER BY CAST(emhsnr AS UNSIGNED) ASC, bezeichnung ASC"; 

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rawData = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Alle Spaltennamen (Keys) einheitlich in Kleinschreibung übersetzen,
    // damit das Frontend die Werte (z.B. dhnr) verlässlich findet.
    $data = [];
    foreach ($rawData as $row) {
        $data[] = array_change_key_case($row, CASE_LOWER);
    }

    // Helper to force UTF-8 if database has mixed encoding
    array_walk_recursive($data, function(&$item, $key){
        // Exclude binary data from encoding checks if accidentaly fetched (though we select *)
        // Note: fetchAll selects bild_blob too. We should convert it to URL logic here or exclude it to save bandwidth
        // Better: modify select in get_inventory to not select * or transform blob to boolean flag
        if($key === 'bild_blob') return; // Do nothing to blob
        
        if(is_string($item) && !mb_detect_encoding($item, 'utf-8', true)){
                $item = utf8_encode($item);
        }
    });
    
    // Inject image URL if blob exists
    foreach($data as &$row) {
        if (!empty($row['bild_pfad'])) {
            // Schon ein Pfad vorhanden - Frontend kümmert sich darum
        } elseif (!empty($row['bild_blob'])) {
            // Nur alter einzelner Blob vorhanden: als JSON-Array für das Frontend einfügen
            $isPdf = (strncmp($row['bild_blob'], "%PDF", 4) === 0);
            $row['bild_pfad'] = json_encode([
                [
                    "path" => "api.php?action=get_image&id=" . $row['id'] . "&t=" . time(),
                    "is_pdf" => $isPdf
                ]
            ]);
        }
        unset($row['bild_blob']); // Don't send MBs of binary data in JSON list
    }

    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

// NEU: Get Inventory Stats (für die Karten oben)
if ($action === 'get_inventory_stats') {
    $total = $pdo->query("SELECT COUNT(*) FROM lagerbestand")->fetchColumn();
    // Low: weniger als Soll, aber noch was da
    $low = $pdo->query("SELECT COUNT(*) FROM lagerbestand WHERE ist < soll AND ist > 0")->fetchColumn();
    // Empty: Leer oder negativ
    $empty = $pdo->query("SELECT COUNT(*) FROM lagerbestand WHERE ist <= 0")->fetchColumn();
    
    echo json_encode([
        'success' => true,
        'total' => $total,
        'low' => $low,
        'empty' => $empty
    ]);
    exit;
}

// NEU: BILD SERVING (Aus DB lesen)
if ($action === 'get_image') {
    $id = $_GET['id'] ?? 0;
    if ($id > 0) {
        // Wir holen jetzt auch typ/path infos wenn möglich, aber hier reicht blob erkennung
        // Um PDF korrekt anzuzeigen, müssen wir erkennen ob der Blob ein PDF ist.
        $stmt = $pdo->prepare("SELECT bild_blob FROM lagerbestand WHERE id = ?");
        $stmt->execute([$id]);
        $data = $stmt->fetchColumn();
        
        if ($data) {
            // Einfache Signatur-Prüfung für PDF Header "%PDF"
            if (strncmp($data, "%PDF", 4) === 0) {
                header("Content-Type: application/pdf");
                header("Content-Disposition: inline; filename=document.pdf");
            } else {
                header("Content-Type: image/jpeg"); // Default für Bilder
            }
            echo $data;
            exit;
        }
    }
    // Fallback: Empty 1x1 GIF
    header("Content-Type: image/gif");
    echo base64_decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    exit;
}

// NEU: DOKUMENT SERVING (Bestell-Dokumente aus DB lesen)
if ($action === 'get_order_file') {
    $id = intval($_GET['id'] ?? 0);
    if ($id > 0) {
        $stmt = $pdo->prepare("SELECT datei_blob, mime_type FROM bestell_dateien WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        
        if ($row && $row['datei_blob']) {
            $mime = $row['mime_type'] ?: "application/octet-stream";
            header("Content-Type: " . $mime);
            if ($mime === "application/pdf") {
                header("Content-Disposition: inline; filename=bestellung_" . $id . ".pdf");
            }
            echo $row['datei_blob'];
            exit;
        }
    }
    http_response_code(404);
    echo "Datei nicht gefunden.";
    exit;
}

// NEU: DOKUMENT SERVING (Artikel-Dateien von Mehrfach-Uploads aus DB ausgeben)
if ($action === 'get_artikel_datei') {
    $id = intval($_GET['id'] ?? 0);
    if ($id > 0) {
        $stmt = $pdo->prepare("SELECT datei_blob, mime_type FROM artikel_dateien WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        
        if ($row && $row['datei_blob']) {
            $mime = $row['mime_type'] ?: "application/octet-stream";
            header("Content-Type: " . $mime);
            if ($mime === "application/pdf") {
                header("Content-Disposition: inline; filename=dokument_" . $id . ".pdf");
            }
            echo $row['datei_blob'];
            exit;
        }
    }
    http_response_code(404);
    exit;
}

// NEU: BILD UPLOAD (In DB speichern)
if ($action === 'upload_image') {
    ini_set('display_errors', 0); // Verhindert PHP-Warnungen, die das JSON zerstören
    header('Content-Type: application/json');

    $id = intval($_POST['id'] ?? 0);
    if ($id == 0 || !isset($_FILES['image'])) {
        echo json_encode(['success' => false, 'error' => 'Parameter fehlen: ID oder Bild']);
        exit;
    }

    // Alten DB-Eintrag holen (Wichtig um alte Bilder zu behalten)
    $stmt = $pdo->prepare("SELECT bild_pfad, bild_blob FROM lagerbestand WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $alte_bilder = [];
    if ($row) {
        if (!empty($row['bild_pfad'])) {
            $decoded = json_decode($row['bild_pfad'], true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $alte_bilder = $decoded;
            } else {
                // Fallback für veraltetes Format
                $paths = array_filter(array_map('trim', explode(',', $row['bild_pfad'])));
                foreach($paths as $p) {
                    $alte_bilder[] = ["path" => $p, "is_pdf" => str_ends_with(strtolower($p), '.pdf')];
                }
            }
        } elseif (!empty($row['bild_blob'])) {
            // Fallback: Einzel-Blob war vorhanden, noch nicht in Array umgewandelt
            $isPdf = (strncmp($row['bild_blob'], "%PDF", 4) === 0);
            $alte_bilder[] = [
                "path" => "api.php?action=get_image&id=" . $id,
                "is_pdf" => $isPdf
            ];
        }
    }

    // Neu hochgeladene Dateien verarbeiten
    $uploaded_files = $_FILES['image'];
    $is_array = is_array($uploaded_files['name']);
    $file_count = $is_array ? count($uploaded_files['name']) : 1;
    $erfolg_count = 0;

    try {
        for ($i = 0; $i < $file_count; $i++) {
            $tmp_name = $is_array ? $uploaded_files['tmp_name'][$i] : $uploaded_files['tmp_name'];
            $name     = $is_array ? $uploaded_files['name'][$i] : $uploaded_files['name'];
            $error    = $is_array ? $uploaded_files['error'][$i] : $uploaded_files['error'];

            if ($error === UPLOAD_ERR_OK && !empty($tmp_name)) {
                $fileData = file_get_contents($tmp_name);
                $mimeType = mime_content_type($tmp_name);
                $isPdf = (strncmp($fileData, "%PDF", 4) === 0);
                if ($isPdf) {
                    $mimeType = "application/pdf";
                }

                // Daten in die NEUE Mehrfach-Dateien-Tabelle speichern
                $stmtIns = $pdo->prepare("INSERT INTO artikel_dateien (datei_blob, mime_type) VALUES (?, ?)");
                $stmtIns->execute([$fileData, $mimeType]);
                $newId = $pdo->lastInsertId();

                // In das Galerie-Array packen
                $alte_bilder[] = [
                    "path" => "api.php?action=get_artikel_datei&id=" . $newId,
                    "is_pdf" => $isPdf
                ];
                $erfolg_count++;
            }
        }

        if ($erfolg_count > 0) {
            $neuer_pfad_json = json_encode(array_values($alte_bilder));
            
            // Speichert die zusammengefasste Liste an Bildern
            $stmtUpd = $pdo->prepare("UPDATE lagerbestand SET bild_pfad = ? WHERE id = ?");
            if ($stmtUpd->execute([$neuer_pfad_json, $id])) {
                echo json_encode(['success' => true, 'message' => "$erfolg_count Dateien gespeichert."]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Datenbank Tabellenupdate fehlgeschlagen.']);
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Keine intakten Dateien empfangen.']);
        }
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Datenbankfehler: ' . $e->getMessage()]);
    }
    exit;
}

// NEU: DATEI UPLOAD (Bestellformular oder andere Dokumente)
if ($action === 'upload_order_file') {
    ini_set('display_errors', 0); // Verhindert HTML-Warnungen im JSON-Response
    
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $errCode = isset($_FILES['file']) ? $_FILES['file']['error'] : 'Keine Datei gesendet';
        echo json_encode(["success" => false, "error" => "Fehler beim Upload. Code: " . $errCode]);
        exit;
    }

    $fileData = file_get_contents($_FILES['file']['tmp_name']);
    
    // MIME-Typ ermitteln
    $mimeType = mime_content_type($_FILES['file']['tmp_name']);
    if (strncmp($fileData, "%PDF", 4) === 0) {
        $mimeType = "application/pdf";
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO bestell_dateien (datei_blob, mime_type) VALUES (?, ?)");
        $stmt->execute([$fileData, $mimeType]);
        $fileId = $pdo->lastInsertId();
        
        // Direkte API URL zurückgeben, mit der das Frontend das Dokument laden kann
        echo json_encode(["success" => true, "path" => "api.php?action=get_order_file&id=" . $fileId]);
    } catch (PDOException $e) {
        echo json_encode(["success" => false, "error" => "Datenbankfehler beim Speichern der Datei."]);
    }
    exit;
}

// 4. Get Inventory
if ($action === 'get_shift_inventory') {
    $schicht = $_GET['schicht'] ?? '';
    
    if ($schicht === '' || $schicht === '?') {
        // Admin / Lagermensch sieht alles
        $stmt = $pdo->query("SELECT * FROM schichtmaterial ORDER BY schicht, name");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM schichtmaterial WHERE schicht = ? ORDER BY name");
        $stmt->execute([$schicht]);
    }
    
    $items = $stmt->fetchAll();
    echo json_encode($items);
    exit;
}

// 5. Add Item
if ($action === 'add_item') {
    $name = $data['name'] ?? '';
    $sku = $data['sku'] ?? '';
    $kategorie = $data['kategorie'] ?? 'Allgemein';
    $bestand = intval($data['bestand'] ?? 0);
    $soll = intval($data['soll'] ?? 0);
    $schicht = $data['schicht'] ?? 'A';
    $user = $data['user'] ?? 'System';

    if(empty($name) || empty($schicht)) { echo json_encode(['success'=>false, 'error'=>'Name/Schicht fehlt']); exit; }

    $stmt = $pdo->prepare("INSERT INTO schichtmaterial (name, sku, kategorie, bestand, soll, schicht, last_updated) VALUES (?, ?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$name, $sku, $kategorie, $bestand, $soll, $schicht]);

    // Log
    $stmtLog = $pdo->prepare("INSERT INTO lager_log (user_name, aktion, beschreibung, schicht) VALUES (?, 'NEU', ?, ?)");
    $stmtLog->execute([$user, "Artikel $name hinzugefügt", $schicht]);

    echo json_encode(['success' => true]);
    exit;
}

// 6. Delete Item
if ($action === 'delete_item') {
    $id = intval($data['id']);
    $user = $data['user'] ?? 'System';
    $schicht = $data['schicht'] ?? 'A'; // Nur für Log Kontext

    $stmt = $pdo->prepare("DELETE FROM schichtmaterial WHERE id = ?");
    $stmt->execute([$id]);

    // Log
    $stmtLog = $pdo->prepare("INSERT INTO lager_log (user_name, aktion, beschreibung, schicht) VALUES (?, 'LOESCHEN', ?, ?)");
    $stmtLog->execute([$user, "Artikel ID $id gelöscht", $schicht]);

    echo json_encode(['success' => true]);
    exit;
}

// 7. Update Stock (Entnahme/Korrektur)
if ($action === 'update_stock') {
    $id = intval($data['id']);
    $delta = intval($data['delta']); // z.B. -1 oder +5
    $soll = isset($data['soll']) ? $data['soll'] : null; // Hole den neuen Soll-Wert
    $user = $data['user'] ?? 'System';
    $schicht = $data['schicht'] ?? 'A'; 
    if ($schicht === '?') $schicht = 'Büro/Admin';
    $itemName = $data['name'] ?? 'Artikel';

    // Aktuellen Bestand holen
    $stmt = $pdo->prepare("SELECT bestand FROM schichtmaterial WHERE id = ?");
    $stmt->execute([$id]);
    $current = $stmt->fetchColumn();
    $newStock = max(0, $current + $delta);

    // Update Query dynamisch aufbauen, je nachdem ob Soll geändert wurde
    if ($soll !== null) {
        $stmtUpd = $pdo->prepare("UPDATE schichtmaterial SET bestand = ?, soll = ?, last_updated = NOW() WHERE id = ?");
        $stmtUpd->execute([$newStock, intval($soll), $id]);
        $desc = "$itemName: Bestand auf $newStock, Soll auf " . intval($soll) . " geändert";
    } else {
        $stmtUpd = $pdo->prepare("UPDATE schichtmaterial SET bestand = ?, last_updated = NOW() WHERE id = ?");
        $stmtUpd->execute([$newStock, $id]);
        $desc = "$itemName: Bestand geändert um $delta (Neu: $newStock)";
    }

    // Log
    $actionType = ($delta < 0) ? 'ENTNAHME' : 'KORREKTUR';
    
    $stmtLog = $pdo->prepare("INSERT INTO lager_log (user_name, aktion, beschreibung, schicht) VALUES (?, ?, ?, ?)");
    $stmtLog->execute([$user, $actionType, $desc, $schicht]);

    echo json_encode(['success' => true]);
    exit;
}

// NEU: Artikel zum Hauptinventar hinzufügen
if ($action === 'add_inventory_item') {
    $emhsnr = trim($data['emhsnr'] ?? '');
    $bezeichnung = trim($data['bezeichnung'] ?? '');
    
    if (empty($emhsnr) || empty($bezeichnung)) {
        echo json_encode(['success' => false, 'error' => 'EM-HS Nr. und Bezeichnung sind Pflichtfelder.']);
        exit;
    }

    // Prüfen auf Duplikate
    $stmtCheck = $pdo->prepare("SELECT id FROM lagerbestand WHERE emhsnr = ?");
    $stmtCheck->execute([$emhsnr]);
    if ($stmtCheck->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Diese EM-HS Nr. existiert bereits.']);
        exit;
    }

    $sql = "INSERT INTO lagerbestand (
        emhsnr, sapnr, bezeichnung, typ, hersteller, bestnr, 
        lagerort, lagerplatz, soll, ist, bemerkung, dhnr
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $params = [
        $emhsnr,
        $data['sapnr'] ?? '',
        $bezeichnung,
        $data['typ'] ?? '',
        $data['hersteller'] ?? '',
        $data['bestnr'] ?? '',
        $data['lagerort'] ?? '',
        $data['lagerplatz'] ?? '',
        intval($data['soll'] ?? 0),
        intval($data['ist'] ?? 0),
        $data['bemerkung'] ?? '',
        $data['dhnr'] ?? ''
    ];

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Datenbankfehler: ' . $e->getMessage()]);
    }
    exit;
}

// NEU: Artikel im Hauptinventar bearbeiten
if ($action === 'edit_inventory_item') {
    $id = intval($data['id'] ?? 0);
    $emhsnr = trim($data['emhsnr'] ?? '');
    $bezeichnung = trim($data['bezeichnung'] ?? '');
    
    if ($id <= 0 || empty($emhsnr) || empty($bezeichnung)) {
        echo json_encode(['success' => false, 'error' => 'ID, EM-HS Nr. und Bezeichnung sind Pflichtfelder.']);
        exit;
    }

    // Prüfen, ob die gewählte EM-HS Nr. bereits einem ANDEREN Artikel gehört
    $stmtCheck = $pdo->prepare("SELECT id FROM lagerbestand WHERE emhsnr = ? AND id != ?");
    $stmtCheck->execute([$emhsnr, $id]);
    if ($stmtCheck->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Diese EM-HS Nr. wird bereits von einem anderen Artikel verwendet.']);
        exit;
    }

    // SICHERHEIT: Bestehenden Datensatz laden, damit nur tatsächlich
    // mitgesendete Felder überschrieben werden. So kann z.B. die DH-Nr.
    // nicht versehentlich gelöscht werden, wenn nur der Bestand geändert wird.
    $stmtOld = $pdo->prepare("SELECT * FROM lagerbestand WHERE id = ?");
    $stmtOld->execute([$id]);
    $old = $stmtOld->fetch(PDO::FETCH_ASSOC);

    if (!$old) {
        echo json_encode(['success' => false, 'error' => 'Artikel nicht gefunden.']);
        exit;
    }

    $old = array_change_key_case($old, CASE_LOWER);

    // Helper für ALLE Felder (inkl. dhnr): 
    // Nutzt den neuen Wert, wenn er gesendet wurde, sonst bleibt der alte DB-Wert erhalten.
    $keep = function($field, $isInt = false) use ($data, $old) {
        if (array_key_exists($field, $data)) {
            $val = $data[$field];
            return $isInt ? intval($val) : $val;
        }
        return $old[$field] ?? '';
    };

    $sql = "UPDATE lagerbestand SET 
        emhsnr = ?, sapnr = ?, bezeichnung = ?, typ = ?, hersteller = ?, bestnr = ?, 
        lagerort = ?, lagerplatz = ?, soll = ?, ist = ?, bemerkung = ?, dhnr = ?
        WHERE id = ?";

    $params = [
        $emhsnr,
        $keep('sapnr'),
        $bezeichnung,
        $keep('typ'),
        $keep('hersteller'),
        $keep('bestnr'),
        $keep('lagerort'),
        $keep('lagerplatz'),
        $keep('soll', true),
        $keep('ist', true),
        $keep('bemerkung'),
        // dhnr immer aus dem gesendeten Payload übernehmen (auch leerer String erlaubt)
        array_key_exists('dhnr', $data) ? (string)$data['dhnr'] : ($old['dhnr'] ?? ''),
        $id
    ];

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => 'Datenbankfehler: ' . $e->getMessage()]);
    }
    exit;
}

// NEU: Create Order (Warenkorb absenden)
if ($action === 'create_order') {
    $cart = $data['cart'] ?? [];
    $bemerkung = trim($data['bemerkung'] ?? '');
    $user = $data['user'] ?? 'System';
    $schicht = $data['schicht'] ?? 'A';

    if ($schicht === '?' || $schicht === '') {
        $schicht = 'Büro/Admin';
    }

    if (empty($cart) && empty($bemerkung)) {
        echo json_encode(['success' => false, 'error' => 'Warenkorb und Bemerkungsfeld sind leer']);
        exit;
    }

    $itemsJson = json_encode($cart);
    
    // Bestellung speichern
    $stmt = $pdo->prepare("INSERT INTO bestellungen (user_name, schicht, items, bemerkung, status, zeitpunkt) VALUES (?, ?, ?, ?, 'NEU', NOW())");
    $stmt->execute([$user, $schicht, $itemsJson, $bemerkung]);
    
    // Log entry
    $count = count($cart);
    $desc = "Bestellung aufgegeben ($count Positionen" . ($bemerkung ? " + Bemerkung" : "") . ")";
    $stmtLog = $pdo->prepare("INSERT INTO lager_log (user_name, aktion, beschreibung, schicht) VALUES (?, 'ORDER', ?, ?)");
    $stmtLog->execute([$user, $desc, $schicht]);

    // E-Mail an Lagermitarbeiter senden
    $configFile = __DIR__ . '/config.php';
    if (file_exists($configFile)) {
        $config = include $configFile;
        $emails = $config['lager_emails'] ?? [];
        if (!empty($emails)) {
            $to = implode(', ', $emails);
            $subject = "Neue Bestellung von Schicht " . $schicht . " (" . $user . ")";
            
            $message = "Es ist eine neue Bestellung eingegangen.\n\n";
            $message .= "Besteller: " . $user . "\n";
            $message .= "Schicht: " . $schicht . "\n";
            $message .= "Zeitpunkt: " . date('d.m.Y H:i:s') . "\n\n";
            
            if (!empty($cart)) {
                $message .= "-- ARTIKEL --\n";
                foreach ($cart as $item) {
                    $name = $item['name'] ?? $item['bezeichnung'] ?? 'Unbekannter Artikel';
                    // Fallbacks, falls dein Frontend "menge", "qty" oder "bestand" schickt
                    $qty = $item['menge'] ?? $item['qty'] ?? $item['anzahl'] ?? 1;
                    $message .= $qty . "x " . $name . "\n";
                }
                $message .= "\n";
            }
            
            if (!empty($bemerkung)) {
                $message .= "-- BEMERKUNG --\n";
                $message .= $bemerkung . "\n\n";
            }
            
            //$message .= "Bitte im System einloggen, um Details zu sehen und den Status anzupassen.";
            
            $headers = "From: Lagerverwaltung@dillinger.biz\r\n";
            $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
            
            @mail($to, $subject, $message, $headers);
        }
    }

    echo json_encode(['success' => true]);
    exit;
}

// NEU: Get Open Orders (Für Lagermensch)
if ($action === 'get_open_orders') {
    // Wir laden jetzt alle Bestellungen der letzten 30 Tage, damit wir auch Status-Updates tracken können
    $stmt = $pdo->query("SELECT * FROM bestellungen WHERE zeitpunkt >= DATE_SUB(NOW(), INTERVAL 30 DAY) ORDER BY zeitpunkt DESC");
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($orders as &$o) {
        if ($o['schicht'] === '?') {
            $o['schicht'] = 'Büro/Admin';
        }
    }
    
    echo json_encode($orders);
    exit;
}

// NEU: Get My Notifications (Spezifisch für Rolle)
if ($action === 'get_my_notifications') {
    $userName = $data['user_name'] ?? '';
    $schicht = $data['schicht'] ?? '';
    $isLagermensch = isset($data['is_lagermensch']) && $data['is_lagermensch'] == 1;

    if ($isLagermensch) {
        // Lagermensch sieht offene, neue Bestellungen
        $stmt = $pdo->query("SELECT * FROM bestellungen WHERE status = 'NEU' ORDER BY zeitpunkt DESC");
        $notifs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        // Regulärer Schichtmitarbeiter sieht seine bearbeiteten Bestellungen (Status wurde geändert)
        $stmt = $pdo->prepare("SELECT * FROM bestellungen WHERE schicht = ? AND status != 'NEU' ORDER BY zeitpunkt DESC");
        $stmt->execute([$schicht]);
        $notifs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    foreach ($notifs as &$o) {
        if (isset($o['schicht']) && $o['schicht'] === '?') {
            $o['schicht'] = 'Büro/Admin';
        }
    }
    
    echo json_encode(['success' => true, 'data' => $notifs]);
    exit;
}

// NEU: Mark Order Seen (Schichtmitarbeiter hat Benachrichtigung gelesen)
if ($action === 'mark_order_seen') {
    $id = intval($data['id']);
    $stmt = $pdo->prepare("UPDATE bestellungen SET status = 'ABGESCHLOSSEN' WHERE id = ? AND status = 'ANGENOMMEN'");
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

// NEU: Update Order Status
if ($action === 'update_order_status') {
    $id = intval($data['id']);
    $status = $data['status'] ?? 'IN_BEARBEITUNG';
    $user = $data['user'] ?? 'System';
    $userSchicht = !empty($data['schicht']) && $data['schicht'] !== '?' ? $data['schicht'] : 'Admin/System'; 
    
    // Hole die Schicht der Bestellung für den Text
    $stmtOrder = $pdo->prepare("SELECT schicht FROM bestellungen WHERE id = ?");
    $stmtOrder->execute([$id]);
    $orderSchicht = $stmtOrder->fetchColumn();
    if (empty($orderSchicht) || $orderSchicht === '?') {
        $orderSchicht = 'Alle';
    }

    $stmt = $pdo->prepare("UPDATE bestellungen SET status = ? WHERE id = ?");
    $stmt->execute([$status, $id]);

    // Status leserlich machen für das Log
    $dispStatus = $status;
    if ($status === 'IN_BEARBEITUNG') $dispStatus = 'In Bearbeitung';
    if ($status === 'ABGESCHLOSSEN') $dispStatus = 'Abgeschlossen';

    // Log-Eintrag für diese Aktion (in der Schicht des Ausführenden protokollieren)
    $desc = "Bestellung #$id (von Schicht $orderSchicht) Status: '$dispStatus'";
    $stmtLog = $pdo->prepare("INSERT INTO lager_log (user_name, aktion, beschreibung, schicht) VALUES (?, 'STATUS', ?, ?)");
    $stmtLog->execute([$user, $desc, $userSchicht]);

    echo json_encode(['success' => true]);
    exit;
}

// NEU: Accept Order
if ($action === 'accept_order') {
    $id = intval($data['id']);
    
    $stmt = $pdo->prepare("UPDATE bestellungen SET status = 'ANGENOMMEN' WHERE id = ?");
    $stmt->execute([$id]);

    echo json_encode(['success' => true]);
    exit;
}

// NEU: Get Recent Items
if ($action === 'get_recent_items') {
    $schicht = $_GET['schicht'] ?? '';
    
    // Hole die 5 zuletzt bearbeiteten Artikel
    // Wenn Schicht spezifiziert, filter danach
    if ($schicht === '' || $schicht === '?') {
        $stmt = $pdo->query("SELECT * FROM schichtmaterial ORDER BY last_updated DESC LIMIT 5");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM schichtmaterial WHERE schicht = ? ORDER BY last_updated DESC LIMIT 5");
        $stmt->execute([$schicht]);
    }
    
    echo json_encode($stmt->fetchAll());
    exit;
}

// NEU: Get Stock Trends (Percentage of Fill Rate: Total Stock / Total Target)
if ($action === 'get_stock_trends') {
    $schicht = $_GET['schicht'] ?? '';
    $range = $_GET['range'] ?? 'week'; // 'week', 'month', 'today'

    // 1. Berechne AKTUELLES Total Soll & Ist
    $sqlCurrent = "SELECT SUM(bestand) as total_ist, SUM(soll) as total_soll FROM schichtmaterial";
    if ($schicht !== '' && $schicht !== '?') {
        $sqlCurrent .= " WHERE schicht = '$schicht'";
    }
    
    $stmtCur = $pdo->query($sqlCurrent);
    $totals = $stmtCur->fetch(PDO::FETCH_ASSOC);
    
    $currentIst = intval($totals['total_ist'] ?? 0);
    $currentSoll = intval($totals['total_soll'] ?? 1); // Avoid div by zero
    if ($currentSoll == 0) $currentSoll = 1;

    // Aktuelle Prozentzahl (0-100)
    $currentPct = ($currentIst / $currentSoll) * 100;

    // 2. Historische Daten rekonstruieren (Rückwärtsrechnung basierend auf Logs)
    // Wir holen die Logs um abzuschätzen, wie sich der Bestand verändert hat.
    // Da wir keine exakten Deltas in separaten Spalten haben, nutzen wir eine Heuristik:
    // ENTNAHME = +1 (Rückwärts gesehen war Bestand höher)
    // NEU/LIEFERUNG = -1 (Rückwärts gesehen war Bestand niedriger)
    // Das ist eine Annäherung.

    if ($range === 'month') {
        $interval = "30 DAY";
        $points = 30;
        $dateFormat = "Y-m-d";
        $stepArg = "-1 day";
    } elseif ($range === 'today') {
        $interval = "24 HOUR";
        $points = 24;
        $dateFormat = "Y-m-d H:00"; // Pseudo format logging key
        $stepArg = "-1 hour";
    } else { // week
        $interval = "7 DAY";
        $points = 7;
        $dateFormat = "Y-m-d";
        $stepArg = "-1 day";
    }

    $sqlLog = "SELECT zeitpunkt, aktion, beschreibung FROM lager_log 
               WHERE zeitpunkt >= DATE_SUB(NOW(), INTERVAL $interval) ";
    if ($schicht !== '' && $schicht !== '?') {
        $sqlLog .= " AND schicht = '$schicht' ";
    }
    $sqlLog .= " ORDER BY zeitpunkt DESC"; // Neueste zuerst für Rückwärtsrechnung
    
    $stmtLog = $pdo->query($sqlLog);
    $logs = $stmtLog->fetchAll(PDO::FETCH_ASSOC);

    // Datenpunkte generieren
    // Wir starten bei "Jetzt" und gehen zurück.
    $dataPoints = [];
    $simulatedIst = $currentIst;

    // Bucket Logs by Time Slot
    $logsBySlot = [];
    foreach($logs as $log) {
        $ts = strtotime($log['zeitpunkt']);
        if ($range === 'today') {
            $slot = date('Y-m-d H:00', $ts);
        } else {
            $slot = date('Y-m-d', $ts);
        }
        $logsBySlot[$slot][] = $log;
    }

    // Loop backwards from NOW
    for ($i = 0; $i < $points; $i++) {
        $timeTarget = ($range === 'today') ? strtotime("-$i hours") : strtotime("-$i days");
        
        if ($range === 'today') {
            $slotKey = date('Y-m-d H:00', $timeTarget);
            $label = date('H:00', $timeTarget);
        } else {
            $slotKey = date('Y-m-d', $timeTarget);
            $label = date('d.m', $timeTarget);
        }

        // Prozent berechnen für diesen Punkt
        $pct = ($simulatedIst / $currentSoll) * 100;
        // Clamp 0-100 (optional visual overshoot allowed?)
        $pct = max(0, min(100, $pct));

        // Add to result (Reverse order later)
        $dataPoints[] = ['date' => $label, 'value' => round($pct, 1)];

        // Wende Änderungen dieses Zeitslots RÜCKWÄRTS an um den Bestand VORHER zu bekommen
        if (isset($logsBySlot[$slotKey])) {
            foreach($logsBySlot[$slotKey] as $l) {
                // Versuch Delta aus Beschreibung zu parsen "... um -5 ..."
                // Fallback: Annahme 1
                $delta = 0;
                if (preg_match('/um\s(-?\d+)/', $l['beschreibung'], $matches)) {
                    $delta = intval($matches[1]);
                } else {
                    // Fallback anhand Aktion
                    if ($l['aktion'] === 'ENTNAHME') $delta = -1;
                    if ($l['aktion'] === 'NEU' || $l['aktion'] === 'ORDER') $delta = 10; // Annahme
                }
                
                // Rückwärtsrechnung: Wenn im Log "-5" steht, war es vorher "+5" mehr.
                // Log: Bestand geändert um -5. -> Alter Bestand = Neuer Bestand - (-5) = Neuer + 5.
                $simulatedIst -= $delta;
            }
        }
    }
    
    // Reverse to chronological order
    echo json_encode(array_reverse($dataPoints));
    exit;
}

// NEU: Nächste freie EM-HS Nummer abrufen
if ($action === 'get_next_emhsnr') {
    // Wir casten zu UNSIGNED, damit die Sortierung numerisch korrekt ist (1, 2, 10 statt 1, 10, 2)
    // Wenn alphanumerische Werte existieren, wird versucht den numerischen Teil zu nehmen oder 0
    $stmt = $pdo->query("SELECT MAX(CAST(emhsnr AS UNSIGNED)) as max_nr FROM lagerbestand");
    $row = $stmt->fetch();
    $next = ($row['max_nr'] ?? 0) + 1;
    
    echo json_encode(['success' => true, 'next' => $next]);
    exit;
}

// 8. Get Activities
if ($action === 'get_activities') {
    $schicht = $_GET['schicht'] ?? '';
    
    if ($schicht === '' || $schicht === '?') {
        $stmt = $pdo->query("SELECT * FROM lager_log ORDER BY zeitpunkt DESC LIMIT 20");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM lager_log WHERE schicht = ? ORDER BY zeitpunkt DESC LIMIT 20");
        $stmt->execute([$schicht]);
    }
    
    $activities = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($activities as &$act) {
        if ($act['schicht'] === '?') {
            $act['schicht'] = 'Büro/Admin';
        }
    }
    
    echo json_encode($activities);
    exit;
}

// NEU: Get Dashboard Stats
if ($action === 'get_stats') {
    $schicht = $_GET['schicht'] ?? '';
    
    // 1. Kritische Items (Nur Leerstand zählt als kritisch für Widget 4)
    $sqlCritical = "SELECT COUNT(*) FROM schichtmaterial WHERE bestand <= 0";
    if ($schicht !== '' && $schicht !== '?') {
        $sqlCritical .= " AND schicht = '$schicht'";
    }
    $criticalCount = $pdo->query($sqlCritical)->fetchColumn();
    
    // 2. Offene Aufträge (Simuliert als Items mit Bestand <= 0) = Card 2
    $sqlOrders = "SELECT COUNT(*) FROM schichtmaterial WHERE bestand <= 0";
    if ($schicht !== '' && $schicht !== '?') {
        $sqlOrders .= " AND schicht = '$schicht'";
    }
    $ordersCount = $pdo->query($sqlOrders)->fetchColumn();

    // 3. Verbrauch (Summe aller Entnahmen heute) = Card 1
    // Wir schauen ins Log nach 'ENTNAHME'
    $sqlConsumption = "SELECT COUNT(*) FROM lager_log WHERE aktion = 'ENTNAHME' AND zeitpunkt >= DATE(NOW())";
    if ($schicht !== '' && $schicht !== '?') {
        $sqlConsumption .= " AND schicht = '$schicht'";
    }
    $consumptionCount = $pdo->query($sqlConsumption)->fetchColumn();

    // 4. Bestellungen aufgegeben (Card 3 - ehemals Team)
    // Zählt eindeutige Artikel, die heute bestellt wurden (Aktion 'ORDER' oder Beschreibung enthält 'bestell')
    $sqlPlacedOrders = "SELECT COUNT(DISTINCT beschreibung) FROM lager_log 
                        WHERE (aktion = 'ORDER' OR beschreibung LIKE '%bestell%') 
                        AND zeitpunkt >= DATE(NOW())";
    if ($schicht !== '' && $schicht !== '?') {
        $sqlPlacedOrders .= " AND schicht = '$schicht'";
    }
    $placedOrdersCount = $pdo->query($sqlPlacedOrders)->fetchColumn();

    echo json_encode([
        'consumption' => $consumptionCount,
        'orders' => $ordersCount,
        'placed_orders' => $placedOrdersCount, // Updated key
        'team' => 'Online', // Keep for backward compatibility if needed, but UI uses placed_orders
        'critical' => $criticalCount
    ]);
    exit;
}

// NEU: DATEI UPLOAD (Bestellformular oder andere Dokumente)
if ($action === 'upload_order_file') {
    ini_set('display_errors', 0); // Verhindert HTML-Warnungen im JSON-Response
    
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $errCode = isset($_FILES['file']) ? $_FILES['file']['error'] : 'Keine Datei gesendet';
        echo json_encode(["success" => false, "error" => "Fehler beim Upload. Code: " . $errCode]);
        exit;
    }

    $fileData = file_get_contents($_FILES['file']['tmp_name']);
    
    // MIME-Typ ermitteln
    $mimeType = mime_content_type($_FILES['file']['tmp_name']);
    if (strncmp($fileData, "%PDF", 4) === 0) {
        $mimeType = "application/pdf";
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO bestell_dateien (datei_blob, mime_type) VALUES (?, ?)");
        $stmt->execute([$fileData, $mimeType]);
        $fileId = $pdo->lastInsertId();
        
        // Direkte API URL zurückgeben, mit der das Frontend das Dokument laden kann
        echo json_encode(["success" => true, "path" => "api.php?action=get_order_file&id=" . $fileId]);
    } catch (PDOException $e) {
        echo json_encode(["success" => false, "error" => "Datenbankfehler beim Speichern der Datei."]);
    }
    exit;
}

// Default
echo json_encode(['error' => 'Invalid action']);
?>
