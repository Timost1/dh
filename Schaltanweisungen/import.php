<?php
// Einstellungen
ini_set('display_errors', 1);
set_time_limit(600); // Zeitlimit erhöhen (10 Minuten)

// Pfad zu den SAW-Dateien (aktuelles Verzeichnis)
$sourceDir = __DIR__ . '/';

// Datenbank-Verbindung
$host = 'localhost';
$db   = 'db_emhs';
$user = 'emhs';
$pass = 'dQ34TkmsMWRTUuwh';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
    echo "<h1>Import der SAW-Dateien in saw_daten2</h1>";

    // 1. Tabelle saw_daten2 erstellen
    // Spalte 'filename' wurde zu 'saw_nr' umbenannt, da dies die Schaltanweisungsnummer ist
    $pdo->exec("CREATE TABLE IF NOT EXISTS saw_daten2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        saw_nr VARCHAR(50),
        ersteller VARCHAR(100),
        kopf TEXT,
        filetime INT,
        status VARCHAR(50),
        maxanl INT,
        step_nr INT,
        ecol INT,
        etext TEXT,
        anlagen_json TEXT,
        INDEX (saw_nr)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    echo "Tabelle 'saw_daten2' wurde geprüft/erstellt.<br>";

    // 2. Dateien suchen
    $files = glob($sourceDir . '*.SAW');
    if (!$files) {
        die("Keine .SAW Dateien im Verzeichnis '$sourceDir' gefunden.");
    }

    echo count($files) . " Dateien gefunden. Import startet...<br>";

    // Statement vorbereiten
    $stmt = $pdo->prepare("INSERT INTO saw_daten2 
        (saw_nr, ersteller, kopf, filetime, status, maxanl, step_nr, ecol, etext, anlagen_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    $count = 0;

    foreach ($files as $filePath) {
        // Dateinamen ohne Pfad und Endung als ID nutzen (Das ist die SAW-Nr)
        $saw_nr = basename($filePath, '.SAW');
        
        // Variable zurücksetzen und Datei einbinden
        $saw_daten = null;
        include $filePath;

        if (!isset($saw_daten) || !is_array($saw_daten)) {
            // Datei überspringen, wenn keine gültigen Daten
            continue;
        }

        // Transaktion pro Datei starten
        $pdo->beginTransaction();

        // Alte Einträge für diese Datei löschen (um Duplikate zu vermeiden)
        $pdo->exec("DELETE FROM saw_daten2 WHERE saw_nr = '$saw_nr'");

        // Daten vorbereiten
        $userStr = isset($saw_daten['user']) ? $saw_daten['user'] : '';
        $kopfStr = isset($saw_daten['kopf']) ? $saw_daten['kopf'] : '';
        $timeInt = isset($saw_daten['filetime']) ? (int)$saw_daten['filetime'] : 0;
        $statStr = isset($saw_daten['status']) ? $saw_daten['status'] : '';
        $maxAnl  = isset($saw_daten['maxanl']) ? (int)$saw_daten['maxanl'] : 0;
        
        // Anlagen als JSON verpacken
        $anlagenJson = '';
        if (isset($saw_daten['anlbez']) && is_array($saw_daten['anlbez'])) {
            $anlagenCombined = [];
            foreach ($saw_daten['anlbez'] as $idx => $bez) {
                $nr = isset($saw_daten['anlnr'][$idx]) ? $saw_daten['anlnr'][$idx] : 0;
                $anlagenCombined[$idx] = ['bez' => $bez, 'nr' => $nr];
            }
            $anlagenJson = json_encode($anlagenCombined, JSON_UNESCAPED_UNICODE);
        }

        // Einträge durchgehen und speichern
        if (isset($saw_daten['entrys']) && is_array($saw_daten['entrys'])) {
            foreach ($saw_daten['entrys'] as $idx => $entry) {
                // Leere Einträge überspringen
                if ($entry['ecol'] == 0 && empty(trim($entry['etext']))) {
                    continue;
                }

                $stmt->execute([
                    $saw_nr,
                    $userStr,
                    $kopfStr,
                    $timeInt,
                    $statStr,
                    $maxAnl,
                    $idx,               // step_nr
                    (int)$entry['ecol'],
                    $entry['etext'],
                    $anlagenJson
                ]);
            }
        }

        $pdo->commit();
        $count++;
        
        // Kleines Feedback alle 100 Dateien
        if ($count % 100 == 0) {
            echo "$count Dateien verarbeitet...<br>";
            flush();
        }
    }

    echo "<h2>Fertig! $count Dateien erfolgreich in saw_daten2 importiert.</h2>";

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "<h3 style='color:red'>Fehler: " . $e->getMessage() . "</h3>";
}
?>
