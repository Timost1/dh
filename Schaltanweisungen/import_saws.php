<?php
// Skript zum Importieren alter .SAW Dateien in die Datenbank

// DB Konfiguration (anpassen falls nötig)
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
    die("Datenbankverbindung fehlgeschlagen: " . $e->getMessage());
}

// Helper Funktion zum sicheren Laden der SAW-Daten via include
function loadSawData($filepath) {
    // Isolierter Scope für das Include
    $saw_daten = [];
    include $filepath;
    return isset($saw_daten) ? $saw_daten : null;
}

// Helper für Encoding-Korrektur (Array rekursiv)
function fixEncoding($data) {
    if (is_array($data)) {
        foreach ($data as $k => $v) {
            $data[$k] = fixEncoding($v);
        }
        return $data;
    } elseif (is_string($data)) {
        // Wenn String nicht UTF-8 ist, konvertieren wir von Windows-1252/ISO-8859-1
        if (!mb_check_encoding($data, 'UTF-8')) {
            return mb_convert_encoding($data, 'UTF-8', 'Windows-1252');
        }
        return $data;
    }
    return $data;
}

// Dateien finden
$dir = __DIR__; 
$files = glob($dir . '/*.{SAW,saw}', GLOB_BRACE);
// Fallback für Systeme ohne GLOB_BRACE
if (empty($files)) {
    $files = array_merge(glob($dir . '/*.SAW'), glob($dir . '/*.saw'));
}
$files = array_unique($files);

echo "Gefundene SAW-Dateien: " . count($files) . "<br><hr>";

$countSuccess = 0;
$countError = 0;

// Anlagen Mapping laden
$anlMap = [];
try {
    $stmt = $pdo->query("SELECT anlID, bez FROM anlagen");
    foreach($stmt as $row) {
        $anlMap[mb_strtolower(trim($row['bez']))] = $row['anlID'];
    }
} catch (Exception $e) { /* ignore */ }

// TABELLE LEEREN VOR DEM IMPORT
try {
    echo "Leere Tabelle 'schaltanweisungen'...<br>";
    $pdo->exec("TRUNCATE TABLE schaltanweisungen");
    echo "Tabelle geleert.<br><hr>";
} catch (Exception $e) {
    die("Fehler beim Leeren der Tabelle: " . $e->getMessage());
}

// SQL Vorbereitung
$sql = "INSERT INTO schaltanweisungen 
        (saw_nr, zellen_id, ersteller, kopf, original, status, datum, anlagen, schritte, anlage_text) 
        VALUES (:nr, :zid, :user, :kopf, :orig, :stat, FROM_UNIXTIME(:ft), :anl, :steps, :atxt)
        ON DUPLICATE KEY UPDATE 
            ersteller = VALUES(ersteller),
            kopf = VALUES(kopf),
            original = VALUES(original),
            status = VALUES(status),
            datum = VALUES(datum),
            anlagen = VALUES(anlagen),
            schritte = VALUES(schritte),
            anlage_text = VALUES(anlage_text)";

$stmt = $pdo->prepare($sql);
$stmtUpdateZelle = $pdo->prepare("UPDATE schaltanweisungen SET zellen_id = :zid WHERE saw_nr = :nr");

foreach ($files as $file) {
    $filename = basename($file);
    $pi = pathinfo($filename);
    $sawNrFromFile = $pi['filename']; 

    // VERSION 2: Include statt eval()
    // Das ist viel robuster, da PHP das Parsing übernimmt
    $saw_daten = loadSawData($file);

    if (!isset($saw_daten) || !is_array($saw_daten)) {
        echo "<span style='color:red'>Fehler:</span> Keine gültigen Daten in $filename<br>";
        $countError++;
        continue;
    }

    // Encoding des gesamten Arrays korrigieren
    $saw_daten = fixEncoding($saw_daten);

    // --- DATEN EXTRAKTION ---

    $ersteller = isset($saw_daten['user']) ? $saw_daten['user'] : '';
    $kopf = isset($saw_daten['kopf']) ? $saw_daten['kopf'] : '';
    $status = isset($saw_daten['status']) ? $saw_daten['status'] : 'VORHANDENE';
    $original = (!empty($saw_daten['original'])) ? 1 : 0;
    $filetime = isset($saw_daten['filetime']) ? intval($saw_daten['filetime']) : time();

    // Anlagen Struktur aufbauen
    $anlagenArr = [];
    $firstAnlageText = '';

    for ($i = 1; $i <= 6; $i++) {
        $pBez = '';
        if (isset($saw_daten['anlbez']) && isset($saw_daten['anlbez'][$i])) {
            $pBez = trim($saw_daten['anlbez'][$i]);
        }
        
        $pNr = 0;
        if ($pBez !== '') {
            if ($firstAnlageText === '') $firstAnlageText = $pBez;
            $key = mb_strtolower($pBez);
            if (isset($anlMap[$key])) {
                $pNr = $anlMap[$key];
            }
        }
        
        $anlagenArr[] = [
            'bez' => $pBez,
            'nr' => (string)$pNr 
        ];
    }
    
    // Schritte Struktur aufbauen
    $schritteArr = [];
    if (isset($saw_daten['entrys']) && is_array($saw_daten['entrys'])) {
        foreach ($saw_daten['entrys'] as $entry) {
            $ecol = isset($entry['ecol']) ? intval($entry['ecol']) : 0;
            $etext = isset($entry['etext']) ? trim($entry['etext']) : '';
            
            if ($ecol > 0 && $ecol <= 6 && $etext !== '') {
                $schritteArr[] = [
                    'ecol' => $ecol,
                    'etext' => $etext
                ];
            }
        }
    }
    
    // JSON Encode
    $jsonAnlagen = json_encode($anlagenArr, JSON_UNESCAPED_UNICODE);
    if ($jsonAnlagen === false) { 
        echo "<span style='color:orange'>JSON Fehler Anlagen bei $filename</span><br>"; 
        $jsonAnlagen = '[]'; 
    }

    $jsonSchritte = json_encode($schritteArr, JSON_UNESCAPED_UNICODE);
    if ($jsonSchritte === false) { 
        echo "<span style='color:orange'>JSON Fehler Schritte bei $filename</span><br>"; 
        $jsonSchritte = '[]'; 
    }

    // Zellen ID finden
    $zellen_id = 0;
    if (strlen($sawNrFromFile) >= 6) {
        $masterAnl = intval(substr($sawNrFromFile, 0, 2));
        $masterZel = intval(substr($sawNrFromFile, 2, 4));
        
        $zStmt = $pdo->prepare("SELECT zelID FROM zellen WHERE masterAnl = ? AND masterZel = ? LIMIT 1");
        $zStmt->execute([$masterAnl, $masterZel]);
        $zRow = $zStmt->fetch();
        if ($zRow) {
            $zellen_id = $zRow['zelID'];
        }
    }
    // Fallback: Wert aus Datei
    if ($zellen_id == 0 && isset($saw_daten['zelnr'])) {
         $val = intval($saw_daten['zelnr']);
         if ($val > 0) $zellen_id = $val;
    }

    try {
        // Insert (mit ON DUPLICATE KEY UPDATE für alles außer zelID)
        $stmt->execute([
            ':nr' => $sawNrFromFile,
            ':zid' => $zellen_id, // Wird beim Update ignoriert (siehe SQL oben)
            ':user' => $ersteller,
            ':kopf' => $kopf,
            ':orig' => $original,
            ':stat' => $status,
            ':ft' => $filetime,
            ':anl' => $jsonAnlagen,
            ':steps' => $jsonSchritte,
            ':atxt' => $firstAnlageText
        ]);
        
        // Separates Update für Zelle, falls wir jetzt eine gefunden haben
        if ($zellen_id > 0) {
            $stmtUpdateZelle->execute([':zid' => $zellen_id, ':nr' => $sawNrFromFile]);
        }

        echo "Importiert: $sawNrFromFile <span style='color:green'>OK</span> (Zelle: $zellen_id)<br>";
        $countSuccess++;
    } catch (Exception $e) {
        echo "DB Fehler bei $sawNrFromFile: " . $e->getMessage() . "<br>";
        $countError++;
    }
}

echo "<hr>";
echo "Fertig. Erfolgreich: $countSuccess, Fehler: $countError";
?>