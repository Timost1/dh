<?php
// Start Session at the very beginning
session_start();

// WICHTIG: Fehler anzeigen, um "leere Antwort" zu debuggen
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// JSON Input lesen (Fetch API sendet JSON im Body)
$rawInput = file_get_contents('php://input');
if ($rawInput) {
    $jsonData = json_decode($rawInput, true);
    if (is_array($jsonData)) {
        $_REQUEST = array_merge($_REQUEST, $jsonData);
        $_POST = array_merge($_POST, $jsonData);
    }
}

// JSON Input verarbeiten (Fügen Sie dies am Anfang des Skripts ein)
$jsonInput = file_get_contents('php://input');
if ($jsonInput) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) {
        if (!isset($data)) $data = [];
        $data = array_merge($data, $decoded);
        // Action aus JSON übernehmen, falls in GET/POST nicht gesetzt
        if (isset($decoded['action'])) $action = $decoded['action'];
    }
}

// --- DATENBANK VERBINDUNG ---
$db_host = 'localhost';
$db_name = 'db_emhs';
$db_user = 'emhs';
$db_pass = 'dQ34TkmsMWRTUuwh';

try {
    $dsn = "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4";
    $pdo = new PDO($dsn, $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Datenbankverbindung fehlgeschlagen: ' . $e->getMessage()]);
    exit;
}

// --- EINGABE EINSAMMELN (JSON + POST/GET) ---
$data = $_REQUEST; 
$jsonInput = file_get_contents('php://input');
if (!empty($jsonInput)) {
    $decoded = json_decode($jsonInput, true);
    if (is_array($decoded)) {
        $data = array_merge($data, $decoded);
    }
}

$action = isset($data['action']) ? $data['action'] : '';

// ------------------------------------------------------------------
try {
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    
    // JSON Body lesen für POST Requests
    $input = [];
    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?: [];
        
        // Action aus Body holen falls nicht in URL
        if (empty($action) && isset($input['action'])) {
            $action = $input['action'];
        }
    }

    // ------------------------------------------------------------------
    // GET_META
    // ------------------------------------------------------------------
    if ($action === 'get_meta') {
        $anlagen = $pdo->query("SELECT anlID, bez FROM anlagen ORDER BY bez")->fetchAll();
        $zellen = $pdo->query("SELECT zelID, zelNr, zelBez, zelAnl, masterAnl, masterZel FROM zellen")->fetchAll();
        
        // NEU: Verknüpfungen laden
        $links = $pdo->query("SELECT zelID_1, zelID_2 FROM zellen_verknuepfung")->fetchAll();
        
        // NEU: Textbausteine laden und Defaults einfügen falls leer
        $textbausteine = [];
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS textbausteine (id INT AUTO_INCREMENT PRIMARY KEY, inhalt VARCHAR(255) NOT NULL)");
            
            // Prüfen ob Tabelle leer ist
            $res = $pdo->query("SELECT COUNT(*) FROM textbausteine");
            if ($res && $res->fetchColumn() == 0) {
                // Defaults einfügen
                $defaults = [
                    "Außerbetriebnahme", "Inbetriebnahme", "Wechselw. Freischalten", "Umlegen",
                    "Frequenzrelaisprüfung", "Zelle/Feld +A06", "Baustelle EAF Trafo 5 1600kVA",
                    "Trafo beidreihen", "Zuleitung entfernen und 5kV-Lasttrenner EIN",
                    "Isolation messen", "400V Leistungsschalter einfahren", "Erdfrenel AUS"
                ];
                $stmtIns = $pdo->prepare("INSERT INTO textbausteine (inhalt) VALUES (?)");
                foreach($defaults as $d) {
                    $stmtIns->execute([$d]);
                }
            }
            
            $stmt = $pdo->query("SELECT id, inhalt FROM textbausteine ORDER BY inhalt ASC");
            if($stmt) {
                 $textbausteine = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
        } catch(Exception $e) { 
            // Fehler ignorieren
        }

        // JSON Ausgabe mit allen Daten
        echo json_encode([
            'anlagen' => isset($anlagen) ? $anlagen : [],
            'zellen' => isset($zellen) ? $zellen : [],
            'links' => isset($links) ? $links : [], // NEU
            'textbausteine' => $textbausteine 
        ]);
        exit;
    }

    // ------------------------------------------------------------------
    // GET_SAWS
    // ------------------------------------------------------------------
    if ($action === 'get_saws') {
        // Double-Join: 
        // zOld = Alter Weg über Nummer-Parsing (für Bestand)
        // zNew = Neuer Weg über zellen_id (für neu erstellte/kopierte)
        
        $sql = "SELECT 
                    s.saw_nr, 
                    s.datum, 
                    s.ersteller, 
                    s.kopf, 
                    s.status, 
                    s.original,
                    s.zellen_id,
                    COALESCE(zNew.zelID, zOld.zelID) as matched_zelID,
                    COALESCE(zNew.zelAnl, zOld.zelAnl, CAST(SUBSTRING(s.saw_nr, 1, 2) AS UNSIGNED), 0) as zelAnl,
                    COALESCE(zNew.zelBez, zOld.zelBez, 'Unbekannt') as zelBez,
                    UNIX_TIMESTAMP(s.datum) as filetime,
                    -- Alte lokale Verknüpfungen (Optional behalten oder ignorieren)
                    (SELECT GROUP_CONCAT(sz.zelID) FROM saw_zellen sz WHERE sz.saw_nr = s.saw_nr) as all_cell_ids,
                    (SELECT GROUP_CONCAT(sa.anlID) FROM saw_anlagen_verknuepfung sa WHERE sa.saw_nr = s.saw_nr) as all_anl_ids
                FROM schaltanweisungen s 
                LEFT JOIN zellen zOld ON zOld.masterAnl = CAST(SUBSTRING(s.saw_nr, 1, 2) AS UNSIGNED) 
                                     AND zOld.masterZel = CAST(SUBSTRING(s.saw_nr, 3, 4) AS UNSIGNED)
                LEFT JOIN zellen zNew ON s.zellen_id > 0 AND zNew.zelID = s.zellen_id
                -- LEFT JOIN saw_zellen sz ON s.saw_nr = sz.saw_nr -- Entfernt um Duplikate zu vermeiden, Subselect reicht
                GROUP BY s.saw_nr
                ORDER BY s.saw_nr DESC";

        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll();

        // Globale Links abrufen für PHP-seitige Verarbeitung oder dem Client überlassen.
        // Hier überlassen wir Matching dem Client (via get_meta links), aber wir bereinigen die row data
        
        echo json_encode($rows);
        exit;
    }

    // ------------------------------------------------------------------
    // GET_DETAIL
    // ------------------------------------------------------------------
    if ($action === 'get_detail') {
        $nr = $_GET['nr'] ?? '';
        
        $stmt = $pdo->prepare("SELECT * FROM schaltanweisungen WHERE saw_nr = ?");
        $stmt->execute([$nr]);
        $saw = $stmt->fetch();

        if ($saw) {
            $anlMap = [];
            foreach($pdo->query("SELECT anlID, bez FROM anlagen") as $row) {
                $anlMap[strval($row['anlID'])] = $row['bez'];
            }

            // NEU: Verknüpfte Zellen laden
            $linkedZellen = [];
            $lzStmt = $pdo->prepare("SELECT sz.zelID, z.zelNr, z.zelBez 
                                     FROM saw_zellen sz 
                                     LEFT JOIN zellen z ON sz.zelID = z.zelID 
                                     WHERE sz.saw_nr = ?");
            $lzStmt->execute([$saw['saw_nr']]);
            $linkedZellen = $lzStmt->fetchAll(PDO::FETCH_ASSOC);

            // Falls leer, aber zellen_id gesetzt ist (Migration/Kompatibilität), füge diese hinzu
            if (empty($linkedZellen) && !empty($saw['zellen_id']) && $saw['zellen_id'] > 0) {
                // Zelle nachladen für Details
                $zCheck = $pdo->prepare("SELECT zelID, zelNr, zelBez FROM zellen WHERE zelID = ?");
                $zCheck->execute([$saw['zellen_id']]);
                $zRes = $zCheck->fetch(PDO::FETCH_ASSOC);
                if($zRes) {
                    $linkedZellen[] = $zRes;
                }
            }
            
            // NEU: Verknüpfte Anlagen laden
            $linkedAnlagen = [];
            $laStmt = $pdo->prepare("SELECT sa.anlID, a.bez 
                                     FROM saw_anlagen_verknuepfung sa 
                                     LEFT JOIN anlagen a ON sa.anlID = a.anlID 
                                     WHERE sa.saw_nr = ?");
            $laStmt->execute([$saw['saw_nr']]);
            $linkedAnlagen = $laStmt->fetchAll(PDO::FETCH_ASSOC);

            // AUTO-FILL ANLAGEN FALLBACK: Wenn keine verknüpften Anlagen da sind,
            // versuchen wir die Anlage über die verknüpfte Text-Info oder die Zelle zu finden.
            if (empty($linkedAnlagen)) {
                // 1. Versuch: Über Textfeld 'anlage_text' (falls vorhanden und passend zu Stammdaten)
                if (!empty($saw['anlage_text'])) {
                    $txt = trim($saw['anlage_text']);
                    // Exakte Suche
                    $aCheck = $pdo->prepare("SELECT anlID, bez FROM anlagen WHERE bez = ? LIMIT 1");
                    $aCheck->execute([$txt]);
                    $aRes = $aCheck->fetch(PDO::FETCH_ASSOC);
                    if ($aRes) {
                         $linkedAnlagen[] = $aRes;
                    }
                }
            }
            // 2. Versuch: Wenn immer noch leer, über die Haupt-Zelle
            if (empty($linkedAnlagen) && !empty($saw['zellen_id']) && $saw['zellen_id'] > 0) {
                $zCheck2 = $pdo->prepare("SELECT zelAnl FROM zellen WHERE zelID = ?");
                $zCheck2->execute([$saw['zellen_id']]);
                $zA = $zCheck2->fetchColumn();
                if ($zA > 0) {
                    $aCheck = $pdo->prepare("SELECT anlID, bez FROM anlagen WHERE anlID = ?");
                    $aCheck->execute([$zA]);
                    $aRes = $aCheck->fetch(PDO::FETCH_ASSOC);
                    if ($aRes) {
                         $linkedAnlagen[] = $aRes;
                    }
                }
            }

            // ROBUSTE JSON DECODIERUNG FÜR SCHRITTE
            $schritte = [];
            if (!empty($saw['schritte'])) {
                $decoded = json_decode($saw['schritte'], true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $schritte = $decoded;
                } else {
                    // Fallback: Manchmal ist es doppelt codiert
                    $decoded2 = json_decode(html_entity_decode($saw['schritte']), true);
                     if (is_array($decoded2)) {
                        $schritte = $decoded2;
                    }
                }
            }

            // ROBUSTE JSON DECODIERUNG FÜR ANLAGEN
            $rawAnlagen = [];
            if (!empty($saw['anlagen'])) {
                $decoded = json_decode($saw['anlagen'], true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $rawAnlagen = $decoded;
                }
            }

            $anlagenCols = [];
            for ($i = 0; $i < 6; $i++) {
                $entry = isset($rawAnlagen[$i]) ? $rawAnlagen[$i] : null;
                $bez = "";
                $anlId = 0;

                if (is_array($entry)) {
                    $bez = isset($entry['bez']) ? $entry['bez'] : "";
                    $anlId = isset($entry['nr']) ? intval($entry['nr']) : 0;
                } elseif (is_numeric($entry)) {
                    $anlId = intval($entry);
                } elseif (is_string($entry)) {
                    $bez = $entry;
                }

                if (($bez === "" || $bez === null) && $anlId > 0 && isset($anlMap[strval($anlId)])) {
                    $bez = $anlMap[strval($anlId)];
                }

                $anlagenCols[] = ['bez' => $bez, 'nr' => $anlId];
            }

            $response = [
                'saw_nr' => $saw['saw_nr'],
                'zellen_id' => $saw['zellen_id'],
                'linked_zellen' => $linkedZellen,
                'linked_anlagen' => $linkedAnlagen, // NEU
                'ersteller' => $saw['ersteller'],
                'datum' => $saw['datum'] ? date("d.m.Y H:i", strtotime($saw['datum'])) : '',
                'status' => $saw['status'],
                'original' => $saw['original'],
                'kopf' => $saw['kopf'],
                'anlage_text' => $saw['anlage_text'] ?? '', // NEU
                'anlagen' => $anlagenCols, 
                'schritte' => $schritte
            ];
            echo json_encode($response);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Schaltanweisung nicht gefunden']);
        }
        exit;
    }

    // ------------------------------------------------------------------
    // SAVE
    // ------------------------------------------------------------------
    if ($action === 'save') {
        $saw_nr = $input['saw_nr'] ?? '';
        if (!$saw_nr) { echo json_encode(['error' => 'Keine SAW Nummer']); exit; }
        
        $zellen_id = intval($input['zellen_id'] ?? 0);
        
        // WICHTIG: Wenn zellen_id 0 oder leer ist, versuche aus saw_nr zu ermitteln
        if ($zellen_id <= 0 && strlen($saw_nr) >= 6) {
            // Versuche Zelle über masterAnl/masterZel zu finden
            $masterAnl = intval(substr($saw_nr, 0, 2));
            $masterZel = intval(substr($saw_nr, 2, 4));
            
            $stmt = $pdo->prepare("SELECT zelID FROM zellen WHERE masterAnl = ? AND masterZel = ? LIMIT 1");
            $stmt->execute([$masterAnl, $masterZel]);
            $result = $stmt->fetch();
            if ($result) {
                $zellen_id = intval($result['zelID']);
            }
        }
        
        $ersteller = $input['ersteller'] ?? '';
        $status = $input['status'] ?? 'BEARBEITET';
        $kopf = $input['kopf'] ?? '';
        $original = ($status === 'ORIGINAL') ? 1 : 0;
        
        // Anlagen
        $nameToIdMap = [];
        foreach($pdo->query("SELECT anlID, bez FROM anlagen") as $row) {
            $nameToIdMap[mb_strtolower(trim($row['bez']))] = $row['anlID'];
        }

        $anlToSave = [];
        $inputAnlagen = $input['anlagen'] ?? [];
        for ($i = 0; $i < 6; $i++) {
            $bez = isset($inputAnlagen[$i]['bez']) ? trim($inputAnlagen[$i]['bez']) : '';
            $nr = 0;
            if ($bez !== '' && isset($nameToIdMap[mb_strtolower($bez)])) {
                $nr = $nameToIdMap[mb_strtolower($bez)];
            }
            $anlToSave[] = ['bez' => $bez, 'nr' => (string)$nr];
        }

        $anlagenJson = json_encode($anlToSave, JSON_UNESCAPED_UNICODE);
        $schritteJson = json_encode($input['schritte'] ?? [], JSON_UNESCAPED_UNICODE);

        // Prüfen ob existiert
        $stmt = $pdo->prepare("SELECT count(*) FROM schaltanweisungen WHERE saw_nr = ?");
        $stmt->execute([$saw_nr]);
        $exists = $stmt->fetchColumn() > 0;

        if ($exists) {
            $sql = "UPDATE schaltanweisungen SET 
                    datum = NOW(), ersteller = ?, status = ?, kopf = ?, original = ?, zellen_id = ?, 
                    anlagen = ?, schritte = ?
                    WHERE saw_nr = ?";
            $params = [$ersteller, $status, $kopf, $original, $zellen_id, $anlagenJson, $schritteJson, $saw_nr];
            $pdo->prepare($sql)->execute($params);
        } else {
            $sql = "INSERT INTO schaltanweisungen 
                    (saw_nr, datum, ersteller, status, kopf, original, zellen_id, anlagen, schritte) 
                    VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?)";
            $params = [$saw_nr, $ersteller, $status, $kopf, $original, $zellen_id, $anlagenJson, $schritteJson];
            $pdo->prepare($sql)->execute($params);
        }

        echo json_encode(['success' => true]);
        exit;
    }

    // ------------------------------------------------------------------
    // DELETE SAW
    // ------------------------------------------------------------------
    if ($action === 'delete_saw') {
        $nr = isset($data['nr']) ? $data['nr'] : '';
        
        if (empty($nr)) {
            echo json_encode(['success' => false, 'error' => 'Keine Nummer erhalten.']);
            exit;
        }

        try {
            if(!isset($pdo)) { 
                // Falls Connection nicht global, hier aufbauen (anpassen wenn nötig)
                $pdo = new PDO('mysql:host=localhost;dbname=schaltanweisungen_db;charset=utf8mb4', 'root', '');
                $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            }

            $pdo->beginTransaction();
            
            // KORREKTUR: Wir löschen nur aus der Haupttabelle.
            // Falls abhängige Tabellen (Schritte) existieren, sollten sie über
            // Foreign Keys (ON DELETE CASCADE) automatisch gelöscht werden.
            // Die Tabellen 'sa_schritte' und 'sa_anlagen' existieren laut Fehler nicht.

            $stmt = $pdo->prepare("DELETE FROM schaltanweisungen WHERE saw_nr = ?");
            $stmt->execute([$nr]);
            
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        exit;
    }

    // ------------------------------------------------------------------
    // VERWALTUNG
    // ------------------------------------------------------------------
    if ($action === 'save_anlage') {
        // Clean Buffer to prevent PHP Notices breaking JSON
        while (ob_get_level()) ob_end_clean();

        $id = intval($input['id']);
        $bez = $input['bez'];
        
        // FIX: anlID explizit auslesen
        $anlID = isset($input['anlID']) ? intval($input['anlID']) : 0;

        if ($id == 0) {
            // FIX: anlID in den INSERT-Befehl aufnehmen!
            $pdo->prepare("INSERT INTO anlagen (anlID, bez) VALUES (?, ?)")->execute([$anlID, $bez]);
        } else {
            $pdo->prepare("UPDATE anlagen SET bez = ? WHERE anlID = ?")->execute([$bez, $id]);
        }
        echo json_encode(['success' => true]); exit;
    }
    
    if ($action === 'delete_anlage') {
        $pdo->prepare("DELETE FROM anlagen WHERE anlID = ?")->execute([intval($input['id'])]);
        echo json_encode(['success' => true]); exit;
    }

    if ($action === 'save_zelle') {
        // Clean Buffer to prevent PHP Notices breaking JSON
        while (ob_get_level()) ob_end_clean();
        
        $id = intval($input['id']);
        $zelID = isset($input['zelID']) ? intval($input['zelID']) : 0;
        
        // Safe access
        $nr = isset($input['nr']) ? $input['nr'] : '';
        $bez = isset($input['bez']) ? $input['bez'] : '';
        $anl = isset($input['anl']) ? intval($input['anl']) : 0;
        $masterAnl = isset($input['masterAnl']) ? intval($input['masterAnl']) : 0;
        $masterZel = isset($input['masterZel']) ? intval($input['masterZel']) : 0;

        if ($id == 0) {
            $p = [$zelID, $nr, $bez, $anl, $masterAnl, $masterZel];
            $pdo->prepare("INSERT INTO zellen (zelID, zelNr, zelBez, zelAnl, masterAnl, masterZel) VALUES (?, ?, ?, ?, ?, ?)")->execute($p);
        } else {
            $p = [$nr, $bez, $anl, $masterAnl, $masterZel, $id];
            $pdo->prepare("UPDATE zellen SET zelNr=?, zelBez=?, zelAnl=?, masterAnl=?, masterZel=? WHERE zelID=?")->execute($p);
        }
        echo json_encode(['success' => true]); exit;
    }
    
    if ($action === 'delete_zelle') {
        $pdo->prepare("DELETE FROM zellen WHERE zelID = ?")->execute([intval($input['id'])]);
        // Auch Verknüpfungen löschen
        $pdo->prepare("DELETE FROM zellen_verknuepfung WHERE zelID_1 = ? OR zelID_2 = ?")->execute([intval($input['id']), intval($input['id'])]);
        echo json_encode(['success' => true]); exit;
    }

    // NEU: Link speichern
    if ($action === 'save_cell_link') {
        $z1 = intval($input['z1']);
        $z2 = intval($input['z2']);
        if ($z1 > 0 && $z2 > 0 && $z1 !== $z2) {
            // Bidirektional speichern oder Normalisieren (kleinere ID zuerst)
            // Wir speichern einfach A->B. Client Logik muss A<->B behandeln oder wir speichern beide.
            // Einfachheitshalber speichern wir (min, max) um Duplikate zu vermeiden
            $min = min($z1, $z2);
            $max = max($z1, $z2);
            
            // Check exists
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM zellen_verknuepfung WHERE zelID_1 = ? AND zelID_2 = ?");
            $stmt->execute([$min, $max]);
            if ($stmt->fetchColumn() == 0) {
                $pdo->prepare("INSERT INTO zellen_verknuepfung (zelID_1, zelID_2) VALUES (?, ?)")->execute([$min, $max]);
            }
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Ungültige IDs']);
        }
        exit;
    }

    // NEU: Link löschen
    if ($action === 'delete_cell_link') {
        $z1 = intval($input['z1']);
        $z2 = intval($input['z2']);
        $min = min($z1, $z2);
        $max = max($z1, $z2);
        
        $pdo->prepare("DELETE FROM zellen_verknuepfung WHERE zelID_1 = ? AND zelID_2 = ?")->execute([$min, $max]);
        echo json_encode(['success' => true]);
        exit;
    }

    // ------------------------------------------------------------------
    // INITIALISIERUNG & TABELLEN
    // ------------------------------------------------------------------
    
    // Tabelle 'mitarbeiter' erstellen, falls nicht vorhanden
    $pdo->exec("CREATE TABLE IF NOT EXISTS mitarbeiter (
        id INTEGER PRIMARY KEY,
        name TEXT,
        rfid TEXT,
        schicht TEXT,
        isAdmin INTEGER DEFAULT 0,
        kannFahrtenLoeschen INTEGER DEFAULT 0,
        kannFahrtenBearbeiten INTEGER DEFAULT 0,
        kannWochenplanBearbeiten INTEGER DEFAULT 0,
        kannProjektplanerBearbeiten INTEGER DEFAULT 0,
        Meister INTEGER DEFAULT 0,
        Vertreter INTEGER DEFAULT 0,
        adminUserId INTEGER DEFAULT 0,
        kannSAWSehen INTEGER DEFAULT 1,
        kannSAWBearbeiten INTEGER DEFAULT 0,
        kannSAWBearbeitenPlus INTEGER DEFAULT 0
    )");

    // Falls Sie die Tabelle bereits erstellt haben, müssten Sie theoretisch ALTER TABLE ausführen
    // oder die Datenbank neu aufbauen. Damit der Import nicht fehlschlägt, versuchen wir
    // die Spalten hinzuzufügen (quick & dirty migration für SQLite/MariaDB):
    try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN kannSAWSehen INTEGER DEFAULT 1"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN kannSAWBearbeiten INTEGER DEFAULT 0"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE mitarbeiter ADD COLUMN kannSAWBearbeitenPlus INTEGER DEFAULT 0"); } catch(Exception $e) {}
    
    // NEU: Spalte anlage_text hinzufügen
    try { $pdo->exec("ALTER TABLE schaltanweisungen ADD COLUMN anlage_text VARCHAR(255) DEFAULT ''"); } catch(Exception $e) {}

    // NEU: Verknüpfungstabelle für Mehrfach-Zellen
    $pdo->exec("CREATE TABLE IF NOT EXISTS saw_zellen (
        saw_nr VARCHAR(50), 
        zelID INT, 
        PRIMARY KEY (saw_nr, zelID)
    )");

    // NEU: Verknüpfungstabelle für Mehrfach-Anlagen
    $pdo->exec("CREATE TABLE IF NOT EXISTS saw_anlagen_verknuepfung (
        saw_nr VARCHAR(50), 
        anlID INT, 
        PRIMARY KEY (saw_nr, anlID)
    )");

    // NEU: Globale Zellen-Verknüpfungstabelle (Zelle A -> Zelle B)
    // Bidirektionale Logik muss im Code behandelt werden oder doppelt eingetragen werden
    $pdo->exec("CREATE TABLE IF NOT EXISTS zellen_verknuepfung (
        zelID_1 INT, 
        zelID_2 INT, 
        PRIMARY KEY (zelID_1, zelID_2)
    )");

    // ------------------------------------------------------------------
    // API ENDPOINTS
    // ------------------------------------------------------------------
    
    // --- HANDLER: SCHALTANWEISUNG SPEICHERN (SQL) ---
    if (isset($_REQUEST['action']) && $_REQUEST['action'] === 'save_saw') {
        while (ob_get_level()) ob_end_clean();
        header('Content-Type: application/json');

        // Prüfen ob DB Verbindung existiert
        if (!isset($pdo) && isset($db)) $pdo = $db;
        if (!isset($pdo)) {
            echo json_encode(['success' => false, 'error' => 'Keine DB-Verbindung ($pdo) in api.php gefunden.']);
            exit;
        }

        try {
            $data = isset($_REQUEST['data']) ? $_REQUEST['data'] : null;
            if (!$data || empty($data['saw_nr'])) throw new Exception("Keine gültigen Daten/Nummer empfangen.");

            // Daten für Speicherung vorbereiten (Alles in eine Tabelle 'schaltanweisungen')
            $sawNr = $data['saw_nr'];

            // NEU: Mehrere Zellen verarbeiten
            // Wir nehmen die erste Zelle als "Hauptzelle" für die Tabelle schaltanweisungen
            $linkedZellenIDs = isset($data['linked_zellen_ids']) ? $data['linked_zellen_ids'] : [];
            
            // NEU: Mehrere Anlagen verarbeiten
            $linkedAnlagenIDs = isset($data['linked_anlagen_ids']) ? $data['linked_anlagen_ids'] : [];

            // Falls Client das Array noch nicht sendet (altes JS), Fallback auf zellen_id
            if (empty($linkedZellenIDs) && !empty($data['zellen_id'])) {
                $linkedZellenIDs = [(int)$data['zellen_id']];
            }

            $mainZellenID = !empty($linkedZellenIDs) ? (int)$linkedZellenIDs[0] : 0;

            $anlagenJson = json_encode($data['anlagen'] ?? []);
            $schritteJson = json_encode($data['schritte'] ?? [], JSON_UNESCAPED_UNICODE);

            // Wir vermuten, dass die Tabelle 'schaltanweisungen' heißt und Spalten für JSON-Daten hat
            // sowie die Metadaten-Spalten.
            // Spaltenannahme: saw_nr, zellen_id, ersteller, kopf, original, status, datum, anlagen, schritte
            // NEU: anlage_text
            
            $sql = "INSERT INTO schaltanweisungen (saw_nr, zellen_id, ersteller, kopf, original, status, datum, anlagen, schritte, anlage_text) 
                    VALUES (:nr, :zid, :user, :kopf, :orig, :stat, NOW(), :anl, :steps, :atxt)
                    ON DUPLICATE KEY UPDATE 
                        zellen_id = VALUES(zellen_id),
                        ersteller = VALUES(ersteller),
                        kopf = VALUES(kopf),
                        original = VALUES(original),
                        status = VALUES(status),
                        datum = NOW(),
                        anlagen = VALUES(anlagen),
                        schritte = VALUES(schritte),
                        anlage_text = VALUES(anlage_text)";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ':nr' => $sawNr,
                ':zid' => $mainZellenID, // Die Hauptzelle
                ':user' => $data['ersteller'],
                ':kopf' => $data['kopf'],
                ':orig' => (int)$data['original'],
                ':stat' => $data['status'],
                ':anl' => $anlagenJson,
                ':steps' => $schritteJson,
                ':atxt' => $data['anlage_text'] ?? ''
            ]);

            // NEU: Verknüpfungstabelle ZELLEN aktualisieren
            // 1. Alle alten Einträge löschen
            $pdo->prepare("DELETE FROM saw_zellen WHERE saw_nr = ?")->execute([$sawNr]);
            
            // 2. Neue eintragen
            $insLink = $pdo->prepare("INSERT INTO saw_zellen (saw_nr, zelID) VALUES (?, ?)");
            foreach($linkedZellenIDs as $zid) {
                if($zid > 0) {
                    try { $insLink->execute([$sawNr, $zid]); } catch(Exception $ex) {} 
                }
            }
            
            // NEU: Verknüpfungstabelle ANLAGEN aktualisieren
            // 1. Alle alten Einträge löschen
            $pdo->prepare("DELETE FROM saw_anlagen_verknuepfung WHERE saw_nr = ?")->execute([$sawNr]);
            
            // 2. Neue eintragen
            $insAnl = $pdo->prepare("INSERT INTO saw_anlagen_verknuepfung (saw_nr, anlID) VALUES (?, ?)");
            foreach($linkedAnlagenIDs as $aid) {
                if($aid > 0) {
                    try { $insAnl->execute([$sawNr, $aid]); } catch(Exception $ex) {} 
                }
            }

            echo json_encode(['success' => true]);

        } catch (PDOException $e) {
            // Falls Spalten fehlen, geben wir das zurück damit man es sieht
            // SQLSTATE[42S22]: Column not found ...
            echo json_encode(['success' => false, 'error' => 'DB Fehler: ' . $e->getMessage()]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        exit;
    }

    // --- LÖSCHEN (DELETE) ---
    if (isset($_REQUEST['action']) && $_REQUEST['action'] === 'delete_saw') {
        while (ob_get_level()) ob_end_clean();
        header('Content-Type: application/json');
        
        $nr = $_REQUEST['nr'] ?? '';
        try {
            if (!isset($pdo) && isset($db)) $pdo = $db;
            if (!isset($pdo)) throw new Exception("DB Verbindung fehlt");

            $stmt = $pdo->prepare("DELETE FROM schaltanweisungen WHERE saw_nr = ?");
            $stmt->execute([$nr]);
            
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        exit;
    }

    // ------------------------------------------------------------------
    // AUTHENTIFIZIERUNG
    // ------------------------------------------------------------------

    if ($action === 'login') {
        $rfid = isset($data['rfid']) ? trim($data['rfid']) : '';

        if (empty($rfid)) {
            echo json_encode(['success' => false, 'error' => 'Kein Code übergeben']);
            exit;
        }

        try {
            if(!isset($pdo)) { 
                 $pdo = new PDO('mysql:host=localhost;dbname=db_emhs;charset=utf8mb4', 'root', '');
                 $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            }

            // KORREKTUR: Direkte Suche nach dem RFID Code (Klartext)
            // Die vorherige Logik mit password_verify() war falsch, da die RFIDs nicht gehasht sind.
            $stmt = $pdo->prepare("SELECT * FROM mitarbeiter WHERE rfid = ? LIMIT 1");
            $stmt->execute([$rfid]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            /* VORHERIGE LOGIK (ENTFERNT)
            $stmt = $pdo->prepare("SELECT * FROM mitarbeiter");
            $stmt->execute();
            $allUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $user = null;
            foreach ($allUsers as $u) {
                if (isset($u['rfid']) && password_verify($rfid, $u['rfid'])) {
                    $user = $u;
                    break; 
                }
            }
            */

            if ($user) {
                if (session_status() === PHP_SESSION_NONE) session_start();
                
                // Namen zusammenbauen falls nötig
                if (!isset($user['name'])) {
                     $user['name'] = trim((isset($user['vorname']) ? $user['vorname'] . ' ' : '') . (isset($user['nachname']) ? $user['nachname'] : 'Mitarbeiter'));
                }
                
                $_SESSION['user'] = $user;
                // unset($user['rfid']); // Hash entfernen (Sicherheit) -> Hier unnötig/optional bei Klartext
                
                echo json_encode(['success' => true, 'user' => $user]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Code ungültig oder Mitarbeiter nicht gefunden.']);
            }

        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => 'DB Fehler: ' . $e->getMessage()]);
        }
        exit;
    }

    // --- LOGOUT ---
    if ($action === 'logout') {
        if (session_status() === PHP_SESSION_NONE) session_start();
        session_unset();
        session_destroy();
        echo json_encode(['success' => true]);
        exit;
    }

    // --- CHECK AUTH ---
    // Hier session checken
    if ($action == 'check_auth') {
        if (session_status() === PHP_SESSION_NONE) session_start();
        
        if (isset($_SESSION['user'])) {
            echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
        } else {
            echo json_encode(['success' => false]);
        }
        exit;
    }
    
    // ------------------------------------------------------------------
    // ANLAGEN
    // ------------------------------------------------------------------
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
