<?php
// filepath: c:\Users\di38885\Desktop\Webseite\public\Schaltanweisungen\print.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

$saw_nr = isset($_GET['nr']) ? $_GET['nr'] : '';
$datum_param = isset($_GET['datum']) ? $_GET['datum'] : '';

if (empty($saw_nr)) {
    die('Keine SAW-Nummer angegeben');
}

if (empty($datum_param)) {
    die('Kein Datum angegeben. Bitte Datum auswählen.');
}

// Datenbank-Verbindung
$conn = new mysqli('localhost', 'emhs', 'dQ34TkmsMWRTUuwh', 'db_emhs');
$conn->set_charset('utf8');

if ($conn->connect_error) {
    die("Datenbankverbindung fehlgeschlagen: " . $conn->connect_error);
}

// SAW-Hauptdaten laden
$stmt = $conn->prepare("SELECT * FROM schaltanweisungen WHERE saw_nr = ?");
$stmt->bind_param("s", $saw_nr);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $conn->close();
    die('SAW nicht gefunden: ' . $saw_nr);
}

$saw = $result->fetch_assoc();
$ersteller = $saw['ersteller'];
$kopf = $saw['kopf'];

// Anlagen laden - aus separater Tabelle (nicht JSON)
$anlagen = array_fill(0, 6, '');
$stmt_anl = $conn->prepare("SELECT anlage_1, anlage_2, anlage_3, anlage_4, anlage_5, anlage_6 FROM schaltanweisungen WHERE saw_nr = ?");
$stmt_anl->bind_param("s", $saw_nr);
$stmt_anl->execute();
$anl_result = $stmt_anl->get_result();

if ($anl_result->num_rows > 0) {
    $anl_row = $anl_result->fetch_assoc();
    for ($i = 1; $i <= 6; $i++) {
        $anlagen[$i-1] = $anl_row['anlage_' . $i] ?? '';
    }
}

// Schritte laden - aus separater Tabelle
$schritte = [];
$stmt_schr = $conn->prepare("SELECT schritt_nr, spalte, text FROM schaltanweisung_schritte WHERE saw_nr = ? ORDER BY schritt_nr");
$stmt_schr->bind_param("s", $saw_nr);
$stmt_schr->execute();
$schr_result = $stmt_schr->get_result();

while ($schr = $schr_result->fetch_assoc()) {
    $schritte[] = [
        'ecol' => intval($schr['spalte']),
        'etext' => $schr['text']
    ];
}

$conn->close();

// Datum formatieren
$datum_parts = explode('.', $datum_param);
if (count($datum_parts) != 3) {
    die('Ungültiges Datumsformat. Erwartet: TT.MM.JJJJ');
}

$date = DateTime::createFromFormat('d.m.Y', $datum_param);
if (!$date) {
    die('Ungültiges Datum: ' . $datum_param);
}

$wochentage = [
    'Monday' => 'Montag',
    'Tuesday' => 'Dienstag', 
    'Wednesday' => 'Mittwoch',
    'Thursday' => 'Donnerstag',
    'Friday' => 'Freitag',
    'Saturday' => 'Samstag',
    'Sunday' => 'Sonntag'
];
$wochentag_en = $date->format('l');
$wochentag = $wochentage[$wochentag_en] ?? $wochentag_en;
$datum_string = $wochentag . ' ' . $datum_param;

// Schritte in Seiten aufteilen (4 Schritte pro Seite)
$schritteProSeite = 4;
$anzahlSchritte = count($schritte);
$anzahlSeiten = max(1, ceil($anzahlSchritte / $schritteProSeite));
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAW <?php echo htmlspecialchars($saw_nr); ?> - Druckansicht</title>
    <style>
        @media print {
            @page {
                size: A4 landscape;
                margin: 10mm;
            }
            .page-break {
                page-break-after: always;
            }
            .no-print {
                display: none;
            }
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        
        .print-page {
            background: white;
            width: 277mm;
            min-height: 190mm;
            margin: 0 auto 20mm;
            padding: 10mm;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            position: relative;
        }
        
        .header {
            display: grid;
            grid-template-columns: 60mm 1fr 80mm;
            gap: 5mm;
            margin-bottom: 5mm;
            font-size: 9pt;
        }
        
        .header-left {
            line-height: 1.4;
        }
        
        .header-center {
            text-align: left;
            white-space: pre-wrap;
        }
        
        .header-right {
            text-align: right;
        }
        
        .saw-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 5mm;
        }
        
        .saw-table th {
            background-color: #dcdcf0;
            border: 1px solid #000;
            padding: 2mm;
            text-align: center;
            font-weight: bold;
            font-size: 9pt;
        }
        
        .saw-table th.nr-col {
            width: 10mm;
        }
        
        .saw-table td {
            border: 1px solid #000;
            padding: 2mm;
            vertical-align: top;
            height: 33mm;
            font-size: 8pt;
        }
        
        .saw-table td.nr-cell {
            text-align: center;
            font-weight: bold;
        }
        
        .saw-table td pre {
            margin: 0;
            white-space: pre-wrap;
            font-family: Arial, sans-serif;
            font-size: 8pt;
        }
        
        .footer {
            position: absolute;
            bottom: 10mm;
            left: 10mm;
            right: 10mm;
            font-size: 9pt;
        }
        
        .footer-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10mm;
        }
        
        .footer-title {
            font-weight: bold;
            margin-bottom: 2mm;
        }
        
        .footer-item {
            margin-bottom: 1mm;
        }
        
        .footer-line {
            display: inline-block;
            border-bottom: 1px solid #000;
            width: 80mm;
        }
        
        .footer-right-bottom {
            text-align: right;
            margin-top: 3mm;
        }
        
        .no-print {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
        }
        
        .btn-print {
            background: #2ecc71;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 14pt;
            border-radius: 5px;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .btn-print:hover {
            background: #27ae60;
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button class="btn-print" onclick="window.print()">🖨️ Drucken</button>
        <button class="btn-print" onclick="window.close()" style="background:#95a5a6;">✖ Schließen</button>
    </div>

    <?php for ($seite = 0; $seite < $anzahlSeiten; $seite++): ?>
        <div class="print-page <?php echo ($seite < $anzahlSeiten - 1) ? 'page-break' : ''; ?>">
            <!-- KOPFZEILE -->
            <div class="header">
                <div class="header-left">
                    <div><?php echo htmlspecialchars($ersteller); ?></div>
                    <div>Seite <?php echo $seite + 1; ?> / <?php echo $anzahlSeiten; ?></div>
                    <div>Nr: <?php echo htmlspecialchars($saw_nr); ?></div>
                </div>
                <div class="header-center"><?php echo htmlspecialchars($kopf); ?></div>
                <div class="header-right"><?php echo htmlspecialchars($datum_string); ?></div>
            </div>
            
            <!-- TABELLE -->
            <table class="saw-table">
                <thead>
                    <tr>
                        <th class="nr-col">#</th>
                        <?php for ($i = 0; $i < 6; $i++): ?>
                            <th><?php echo htmlspecialchars($anlagen[$i]); ?></th>
                        <?php endfor; ?>
                    </tr>
                </thead>
                <tbody>
                    <?php 
                    $startSchritt = $seite * $schritteProSeite;
                    for ($i = 0; $i < $schritteProSeite; $i++):
                        $schrittIdx = $startSchritt + $i;
                    ?>
                        <tr>
                            <td class="nr-cell">
                                <?php echo ($schrittIdx < $anzahlSchritte) ? ($schrittIdx + 1) : ''; ?>
                            </td>
                            <?php for ($col = 1; $col <= 6; $col++): ?>
                                <td>
                                    <?php 
                                    if ($schrittIdx < $anzahlSchritte && 
                                        isset($schritte[$schrittIdx]) && 
                                        $schritte[$schrittIdx]['ecol'] == $col): 
                                    ?>
                                        <pre><?php echo htmlspecialchars($schritte[$schrittIdx]['etext']); ?></pre>
                                    <?php endif; ?>
                                </td>
                            <?php endfor; ?>
                        </tr>
                    <?php endfor; ?>
                </tbody>
            </table>
            
            <!-- FUSSZEILE -->
            <div class="footer">
                <div class="footer-title">Verteiler:</div>
                <div class="footer-grid">
                    <div>
                        <div class="footer-item">1. Mittelwerk / Zentrale 1</div>
                        <div class="footer-item">2. Schichtmeister EM/HS Original KK</div>
                    </div>
                    <div>
                        <div class="footer-item">3. <span class="footer-line"></span></div>
                        <div class="footer-item">4. <span class="footer-line"></span></div>
                    </div>
                </div>
                <div class="footer-right-bottom">
                    DH-SAFE Nr: _______________
                </div>
            </div>
        </div>
    <?php endfor; ?>
    
    <script>
        // Automatisch Druckdialog öffnen beim Laden (optional)
        // window.onload = function() { window.print(); };
    </script>
</body>
</html>