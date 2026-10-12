<?php
/**
 * Fremdfirmen-Management API Server (PHP Version)
 * Ersetzt mb_server.js mit identischen Funktionen
 */

// Zeitzone auf Deutschland setzen (automatisch CET/CEST)
date_default_timezone_set('Europe/Berlin');

// Headers für CORS und Content-Type
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Für OPTIONS-Requests (CORS Preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Konfiguration
define('DATA_DIR', __DIR__);
// Tickets / Daten
define('TICKETS_FILE', DATA_DIR . '/mb_tickets.json');
define('RECIPIENTS_FILE', DATA_DIR . '/x_recipients.json');
define('FIRMEN_FILE', DATA_DIR . '/x_firmen.json');

// TEMP E-Mails direkt im public Verzeichnis ablegen (KEIN Unterordner mehr)
if (!defined('EMAIL_TEMP_DIR')) {
    define('EMAIL_TEMP_DIR', DATA_DIR); // Root
}

// Migration: Falls alter Ordner noch existiert -> EML-Dateien hochholen
$legacyDir = DATA_DIR . '/mb_temp_emails';
if (is_dir($legacyDir)) {
    $moved = 0;
    foreach (scandir($legacyDir) as $f) {
        if ($f === '.' || $f === '..') continue;
        $src = $legacyDir . '/' . $f;
        if (is_file($src) && preg_match('/\.eml$/i', $f)) {
            $dest = EMAIL_TEMP_DIR . '/' . $f;
            if (!file_exists($dest)) {
                @rename($src, $dest);
                $moved++;
            }
        }
    }
    // Optional: Ordner entfernen wenn leer
    $remaining = array_diff(scandir($legacyDir), ['.','..']);
    if (empty($remaining)) { @rmdir($legacyDir); }
    if ($moved > 0) { error_log("EML Migration: $moved Dateien in Root verschoben"); }
}

// Stelle sicher, dass das temp-email Verzeichnis existiert
if (!is_dir(EMAIL_TEMP_DIR)) {
    mkdir(EMAIL_TEMP_DIR, 0755, true);
}

// Initialisiere Dateien wenn sie nicht existieren
if (!file_exists(TICKETS_FILE)) {
    file_put_contents(TICKETS_FILE, json_encode([]));
}

if (!file_exists(RECIPIENTS_FILE)) {
    $defaultRecipients = [
        [
            'id' => (string)time(),
            'name' => 'Hauptempfänger',
            'email' => 'beispiel@firma.de'
        ]
    ];
    file_put_contents(RECIPIENTS_FILE, json_encode($defaultRecipients, JSON_PRETTY_PRINT));
}

if (!file_exists(FIRMEN_FILE)) {
    file_put_contents(FIRMEN_FILE, json_encode([], JSON_PRETTY_PRINT));
    error_log("Created empty firmen file: " . FIRMEN_FILE);
}

/**
 * Hilfsfunktionen
 */

function sendResponse($statusCode, $data, $contentType = 'application/json') {
    http_response_code($statusCode);
    if ($contentType === 'application/json') {
        echo json_encode($data);
    } else {
        echo $data;
    }
    exit();
}

function readTickets() {
    if (!file_exists(TICKETS_FILE)) {
        return [];
    }
    $data = file_get_contents(TICKETS_FILE);
    return json_decode($data, true) ?: [];
}

// +++ NEU: UTF-8 / JSON Robustheits-Helfer (fehlten -> 500 Fehler) +++
if (!function_exists('ensureUtf8')) {
    function ensureUtf8($value) {
        if (is_string($value)) {
            // Bereits UTF-8?
            if (!mb_detect_encoding($value, 'UTF-8', true)) {
                // Versuche gängige Quellen nach UTF-8 zu konvertieren
                $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8, ISO-8859-1, ISO-8859-15, Windows-1252, ASCII');
            }
            // Entferne ungültige Codepoints (Control Characters außer CR/LF/TAB)
            $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);
        } elseif (is_array($value)) {
            foreach ($value as $k => $v) { $value[$k] = ensureUtf8($v); }
        } elseif (is_object($value)) {
            foreach ($value as $k => $v) { $value->$k = ensureUtf8($v); }
        }
        return $value;
    }
}

if (!function_exists('safeJsonEncode')) {
    function safeJsonEncode($data, $options = 0, $depth = 512) {
        $data = ensureUtf8($data);
        $json = json_encode($data, $options, $depth);
        if ($json === false) {
            $err = json_last_error();
            if ($err === JSON_ERROR_UTF8) {
                // Letzter Versuch: rekursiv erneut bereinigen
                $data = ensureUtf8($data);
                $json = json_encode($data, $options, $depth);
            }
            if ($json === false) {
                $msg = function_exists('json_last_error_msg') ? json_last_error_msg() : 'Unbekannter JSON Fehler';
                error_log('safeJsonEncode Fehler: ' . $msg . ' Code=' . $err);
                return false;
            }
        }
        return $json;
    }
}
// +++ ENDE NEU +++

// NEU: Multibyte-sicheres Padding und Label-Helfer für stabile Abstände in Mailto/Plain-Text
if (!function_exists('mb_str_pad')) {
    function mb_str_pad($input, $pad_length, $pad_string = ' ', $pad_type = STR_PAD_RIGHT, $encoding = 'UTF-8') {
        $input_len = mb_strlen($input, $encoding);
        if ($pad_length <= $input_len) {
            return $input;
        }
        $pad_len = $pad_length - $input_len;
        switch ($pad_type) {
            case STR_PAD_LEFT:
                return str_repeat($pad_string, $pad_len) . $input;
            case STR_PAD_BOTH:
                $left = (int) floor($pad_len / 2);
                $right = $pad_len - $left;
                return str_repeat($pad_string, $left) . $input . str_repeat($pad_string, $right);
            case STR_PAD_RIGHT:
            default:
                return $input . str_repeat($pad_string, $pad_len);
        }
    }
}

if (!function_exists('labelPad')) {
    function labelPad($label, $width = 25) {
        $nbsp = "\xC2\xA0"; // NBSP verhindert Zusammenziehen mehrerer Leerzeichen
        $label = rtrim($label);
        return mb_str_pad($label, $width, $nbsp, STR_PAD_RIGHT, 'UTF-8');
    }
}

if (!function_exists('labelPadText')) {
    function labelPadText($label, $width = 25) {
        $label = rtrim($label);
        return mb_str_pad($label, $width, ' ', STR_PAD_RIGHT, 'UTF-8');
    }
}

function saveTickets($tickets) {
    foreach ($tickets as &$t) {
        if (is_array($t)) {
            foreach ($t as $k => $v) { $t[$k] = ensureUtf8($v); }
        }
    }
    $json = safeJsonEncode($tickets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new Exception('Tickets konnten nicht JSON-kodiert werden.');
    }
    $tmpFile = TICKETS_FILE . '.tmp';
    if (file_put_contents($tmpFile, $json) === false) {
        throw new Exception('Temporäre Datei konnte nicht geschrieben werden.');
    }
    if (!@rename($tmpFile, TICKETS_FILE)) { // @ um Windows-Lock Warnung zu vermeiden
        if (file_put_contents(TICKETS_FILE, $json) === false) {
            throw new Exception('Tickets-Datei konnte nicht aktualisiert werden.');
        }
    }
}

function readRecipients() {
    if (!file_exists(RECIPIENTS_FILE)) {
        return [];
    }
    $data = file_get_contents(RECIPIENTS_FILE);
    $recipients = json_decode($data, true) ?: [];
    
    // Migration: Füge fehlende IDs hinzu
    $hasChanges = false;
    foreach ($recipients as &$recipient) {
        if (!isset($recipient['id'])) {
            $recipient['id'] = time() . '_' . substr(md5(uniqid()), 0, 8);
            $hasChanges = true;
        }
    }
    
    if ($hasChanges) {
        saveRecipients($recipients);
    }
    
    return $recipients;
}

function saveRecipients($recipients) {
    // UTF-8 bereinigen
    foreach ($recipients as &$recipient) {
        if (is_array($recipient)) {
            foreach ($recipient as $k => $v) { $recipient[$k] = ensureUtf8($v); }
        }
    }
    
    $json = safeJsonEncode($recipients, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new Exception('Recipients konnten nicht JSON-kodiert werden.');
    }
    
    $tmpFile = RECIPIENTS_FILE . '.tmp';
    if (file_put_contents($tmpFile, $json, LOCK_EX) === false) {
        throw new Exception('Temporäre Recipients-Datei konnte nicht geschrieben werden.');
    }
    
    if (!@rename($tmpFile, RECIPIENTS_FILE)) {
        if (file_put_contents(RECIPIENTS_FILE, $json, LOCK_EX) === false) {
            throw new Exception('Recipients-Datei konnte nicht aktualisiert werden.');
        }
    }
    
    error_log("Recipients saved successfully: " . count($recipients) . " recipients");
}

function readFirmen() {
    error_log("readFirmen: Reading from " . FIRMEN_FILE);
    
    if (!file_exists(FIRMEN_FILE)) {
        error_log("readFirmen: File does not exist, creating empty file");
        file_put_contents(FIRMEN_FILE, json_encode([], JSON_PRETTY_PRINT));
        return [];
    }
    
    $data = file_get_contents(FIRMEN_FILE);
    error_log("readFirmen: Raw file content: " . $data);
    
    if (empty($data) || trim($data) === '') {
        error_log("readFirmen: File is empty, returning empty array");
        return [];
    }
    
    $firmen = json_decode($data, true);
    if ($firmen === null) {
        error_log("readFirmen: JSON decode failed, error: " . json_last_error_msg());
        return [];
    }
    
    if (!is_array($firmen)) {
        error_log("readFirmen: Decoded data is not array, returning empty array");
        return [];
    }
    
    error_log("readFirmen: Loaded " . count($firmen) . " firmen");
    
    // Migration: Füge fehlende IDs hinzu
    $hasChanges = false;
    foreach ($firmen as &$firma) {
        if (!isset($firma['id'])) {
            $firma['id'] = time() . '_' . substr(md5(uniqid()), 0, 8);
            $hasChanges = true;
            error_log("readFirmen: Added missing ID to firma: " . $firma['id']);
        }
    }
    
    if ($hasChanges) {
        error_log("readFirmen: Saving firmen with added IDs");
        saveFirmen($firmen);
    }
    
    return $firmen;
}

function saveFirmen($firmen) {
    // Sicherstellen, dass $firmen ein Array ist
    if (!is_array($firmen)) {
        $firmen = [];
    }
    // UTF-8 bereinigen
    foreach ($firmen as &$firma) {
        if (is_array($firma)) {
            foreach ($firma as $k => $v) { $firma[$k] = ensureUtf8($v); }
        }
    }
    $json = safeJsonEncode($firmen, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new Exception('Firmen konnten nicht JSON-kodiert werden.');
    }
    $tmp = FIRMEN_FILE . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new Exception('Temporäre Datei konnte nicht geschrieben werden.');
    }
    if (!@rename($tmp, FIRMEN_FILE)) {
        if (file_put_contents(FIRMEN_FILE, $json, LOCK_EX) === false) {
            throw new Exception('Firmen-Datei konnte nicht aktualisiert werden.');
        }
    }
}

function cleanupTicketEmails($ticketId) {
    if (!is_dir(EMAIL_TEMP_DIR)) {
        return;
    }
    
    $files = scandir(EMAIL_TEMP_DIR);
    foreach ($files as $file) {
        if ($file !== '.' && $file !== '..' && strpos($file, $ticketId) !== false) {
            $filePath = EMAIL_TEMP_DIR . '/' . $file;
            if (file_exists($filePath)) {
                unlink($filePath);
                error_log("Gelöschte E-Mail-Datei: $file");
            }
        }
    }
}

function createMailtoLink($recipients, $subject, $body) {
    // Empfänger mit Semikolon + Leerzeichen trennen (Outlook-Standard)
    $cleanRecipients = implode('; ', array_filter(array_map('trim', preg_split('/[;,]/', $recipients))));
    
    // RFC3986-encoding: Leerzeichen als %20 statt +
    $encodedSubject = rawurlencode($subject);
    $encodedBody = rawurlencode($body);
    
    error_log("Mailto-Link Empfänger: $cleanRecipients");
    error_log("Mailto-Link Body Länge: " . strlen($encodedBody));
    
    return "mailto:$cleanRecipients?subject=$encodedSubject&body=$encodedBody";
}

// NEU: Outlook Web (OWA) Compose-Link erstellen
function createOwaLink($recipients, $subject, $body, $isHtml = false) {
    // OWA akzeptiert mehrere Empfänger mit Semikolon
    $cleanRecipients = implode(';', array_filter(array_map('trim', preg_split('/[;,]/', $recipients))));

    // Compose-Link
    $base = 'https://outlook.office.com/owa/';
    $params = [
        'path' => '/mail/action/compose',
        'to' => $cleanRecipients,
        'subject' => $subject,
        'body' => $body,
    ];
    if ($isHtml) {
        $params['bodyIsHtml'] = 'true';
        $params['isHtmlBody'] = 'true';
        $params['contentType'] = 'HTML';
    }

    $query = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    $link = $base . '?' . $query;
    error_log('OWA-Link Länge: ' . strlen($link));
    return $link;
}

// Erzeugt den HTML-Mailbody (Tabelle) für Anmeldung/Abmeldung
function buildEmailHtmlBody(array $ticket, bool $isStart): string {
    $actionText = $isStart ? 'Anmeldung' : 'Abmeldung';
    $body = "<!DOCTYPE html>\r\n<html><head><meta charset='UTF-8'></head><body style='font-family: Arial, sans-serif; background-color: #f8f9fa; padding: 20px;'>\r\n";
    $body .= "<div style='max-width: 800px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);'>\r\n";
    $body .= "<p style='font-size: 16px; margin-bottom: 20px;'>Sehr geehrte Damen und Herren,</p>\r\n";
    $body .= "<p style='font-size: 16px; margin-bottom: 30px;'>hiermit teile ich Ihnen die $actionText einer Fremdfirma mit:</p>\r\n\r\n";
    $body .= "<div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 30px;'>\r\n";
    $body .= "<h2 style='margin: 0; font-size: 24px; font-weight: bold;'>FREMDFIRMENEINSATZ - " . strtoupper($actionText) . "</h2>\r\n";
    $body .= "</div>\r\n\r\n";
    $body .= "<table border='0' cellpadding='15' cellspacing='0' style='width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>\r\n";
    $body .= "<tbody>\r\n";
    $body .= "<tr style='background-color: #f8f9fa;'><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Firma</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['firma']}</td></tr>\r\n";
    $body .= "<tr><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Arbeiten</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['arbeiten']}</td></tr>\r\n";
    $body .= "<tr style='background-color: #f8f9fa;'><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Arbeitsbereich</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>" . ($ticket['arbeitsbereich'] ?? 'Nicht angegeben') . "</td></tr>\r\n";
    $body .= "<tr><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Ansprechpartner</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['ansprechpartner']}</td></tr>\r\n";
    $body .= "<tr style='background-color: #f8f9fa;'><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Rufnummer</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['rufnummer']}</td></tr>\r\n";
    $body .= "<tr><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Anzahl Personen</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['anzahlPersonen']}</td></tr>\r\n";
    $body .= "<tr style='background-color: #f8f9fa;'><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Arbeitsanfang</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['arbeitsanfang']} Uhr</td></tr>\r\n";
    // Zähler für Zebrastreifen
    $rowCount = 7; // Bisherige Zeilen: Firma, Arbeiten, Arbeitsbereich, Ansprechpartner, Rufnummer, Anzahl Personen, Arbeitsanfang
    
    if ($isStart && isset($ticket['arbeitsende'])) {
        $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
        $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Arbeitsende</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['arbeitsende']} Uhr</td></tr>\r\n";
        $rowCount++;
    }
    if (!empty($ticket['ausgegebenesMaterial'])) {
        $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
        $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Ausgegebenes Material</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['ausgegebenesMaterial']}</td></tr>\r\n";
        $rowCount++;
    }
    if (!empty($ticket['ausgegebeneSchluessel'])) {
        $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
        $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Ausgegebene Schlüssel</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['ausgegebeneSchluessel']}</td></tr>\r\n";
        $rowCount++;
    }
    if (!$isStart) {
        if (!empty($ticket['ausgegebenesMaterial'])) {
            $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
            $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Material zurückgegeben</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>" . ($ticket['materialZurueck'] ? 'Ja' : 'Nein') . "</td></tr>\r\n";
            $rowCount++;
            if (!empty($ticket['materialBemerkung'])) {
                $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
                $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Bemerkung Material</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['materialBemerkung']}</td></tr>\r\n";
                $rowCount++;
            }
        }
        if (!empty($ticket['ausgegebeneSchluessel'])) {
            $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
            $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Schlüssel zurückgegeben</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>" . ($ticket['schluesselZurueck'] ? 'Ja' : 'Nein') . "</td></tr>\r\n";
            $rowCount++;
            if (!empty($ticket['schluesselBemerkung'])) {
                $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
                $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Bemerkung Schlüssel</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['schluesselBemerkung']}</td></tr>\r\n";
                $rowCount++;
            }
        }
    }
    if (!empty($ticket['bemerkung'])) {
        $bgStyle = ($rowCount % 2 === 0) ? "style='background-color: #f8f9fa;'" : "style=''";
        $body .= "<tr $bgStyle><td style='width: 30%; font-weight: bold; color: #495057; border-bottom: 1px solid #dee2e6;'>Bemerkungen</td><td style='border-bottom: 1px solid #dee2e6; color: #495057;'>{$ticket['bemerkung']}</td></tr>\r\n";
    }
    $body .= "</tbody></table>\r\n\r\n";
    $body .= "<div style='margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;'>\r\n";
    $body .= "<p style='margin-bottom: 10px;'>Mit freundlichen Grüßen</p>\r\n";
    $absenderName = trim($ticket['absenderName'] ?? '');
    if (!empty($absenderName)) {
        $body .= "<p style='font-weight: bold; margin-bottom: 20px;'>$absenderName</p>\r\n";
    }
    $body .= "<hr style='margin: 20px 0; border: none; border-top: 1px solid #ddd;'>\r\n";
    $body .= "<p style='font-size: 12px; color: #666; margin: 0;'>Fremdfirmen-Management System<br>Automatische Benachrichtigung vom " . date('d.m.Y H:i') . " Uhr</p>\r\n";
    $body .= "</div>\r\n";
    $body .= "</div>\r\n";
    $body .= "</body></html>\r\n";
    return $body;
}

// NEU: Reiner Text für OWA-Compose (KEINE HTML-Tags)
function buildEmailHtmlFragment(array $ticket, bool $isStart): string {
    $actionText = $isStart ? 'Anmeldung' : 'Abmeldung';
    $items = [];
    
    // Helper-Funktion für Datensammlung
    $add = function(string $label, $value) use (&$items) {
        if ($value === null || $value === '') return;
        $items[] = [$label, (string)$value];
    };
    
    // Basisfelder sammeln
    $add('Firma:', $ticket['firma'] ?? '');
    $add('Arbeiten:', $ticket['arbeiten'] ?? '');
    $add('Arbeitsbereich:', $ticket['arbeitsbereich'] ?? 'Nicht angegeben');
    $add('Ansprechpartner:', $ticket['ansprechpartner'] ?? '');
    $add('Rufnummer:', $ticket['rufnummer'] ?? '');
    $add('Anzahl Personen:', isset($ticket['anzahlPersonen']) ? (string)$ticket['anzahlPersonen'] : '');
    $add('Arbeitsanfang:', isset($ticket['arbeitsanfang']) && $ticket['arbeitsanfang']!=='' ? ($ticket['arbeitsanfang'] . ' Uhr') : '');
    
    // Bei Abmeldung: Arbeitsende mit aktueller Zeit anzeigen
    if (!$isStart) {
        $currentTime = date('H:i');
        $add('Arbeitsende:', $currentTime . ' Uhr');
    }
    // Bei Anmeldung: Arbeitsende nur falls schon gesetzt
    if ($isStart && !empty($ticket['arbeitsende'])) {
        $add('Arbeitsende:', $ticket['arbeitsende'] . ' Uhr');
    }
    if (!empty($ticket['ausgegebenesMaterial'])) {
        $add('Ausgegebenes Material:', $ticket['ausgegebenesMaterial']);
    }
    if (!empty($ticket['ausgegebeneSchluessel'])) {
        $add('Ausgegebene Schlüssel:', $ticket['ausgegebeneSchluessel']);
    }
    if (!$isStart) {
        if (!empty($ticket['ausgegebenesMaterial'])) {
            $add('Material zurückgegeben:', ($ticket['materialZurueck'] ?? false) ? 'Ja' : 'Nein');
            if (!empty($ticket['materialBemerkung'])) {
                $add('Bemerkung Material:', $ticket['materialBemerkung']);
            }
        }
        if (!empty($ticket['ausgegebeneSchluessel'])) {
            $add('Schlüssel zurückgegeben:', ($ticket['schluesselZurueck'] ?? false) ? 'Ja' : 'Nein');
            if (!empty($ticket['schluesselBemerkung'])) {
                $add('Bemerkung Schlüssel:', $ticket['schluesselBemerkung']);
            }
        }
    }
    if (!empty($ticket['bemerkung'])) {
        $add('Bemerkungen:', $ticket['bemerkung']);
    }
    
    // Professioneller Text-Body ohne HTML-Tags
    $body = "Sehr geehrte Damen und Herren,\n\n";
    $body .= "hiermit teile ich Ihnen die $actionText einer Fremdfirma mit:\n\n";
    $body .= "════════════════════════════════════\n";
    $body .= "              FREMDFIRMENEINSATZ - " . strtoupper($actionText) . "\n";
    $body .= "════════════════════════════════════\n\n";
    
    // Daten mit fester Spaltenbreite für Ausrichtung
    $labelWidth = 25;
    foreach ($items as $pair) {
        $label = $pair[0];
        $value = $pair[1];
        $paddedLabel = mb_str_pad($label, $labelWidth, ' ', STR_PAD_RIGHT, 'UTF-8');
        $body .= $paddedLabel . $value . "\n";
    }
    
    $body .= "\n \n" . str_repeat('─', 35) . "\n";
    $body .= "\nMit freundlichen Grüßen\n";

    $body .= "\n";
    
    $absenderName = trim($ticket['absenderName'] ?? '');
    if (!empty($absenderName)) {
        $body .= $absenderName . "\n";
    }
    
    $body .= "\n \n";
    return $body;
}

if (!function_exists('buildPlainTextBody')) {
    function buildPlainTextBody(array $ticket, bool $isStart): string {
        $actionText = $isStart ? 'Anmeldung' : 'Abmeldung';
        $items = [];
        $add = function(string $label, $value) use (&$items) {
            if ($value === null || $value === '') return;
            $items[] = [$label, (string)$value];
        };
        // Basisfelder
        $add('Firma:', $ticket['firma'] ?? '');
        $add('Arbeiten:', $ticket['arbeiten'] ?? '');
        $add('Arbeitsbereich:', $ticket['arbeitsbereich'] ?? 'Nicht angegeben');
        $add('Ansprechpartner:', $ticket['ansprechpartner'] ?? '');
        $add('Rufnummer:', $ticket['rufnummer'] ?? '');
        $add('Anzahl Personen:', isset($ticket['anzahlPersonen']) ? (string)$ticket['anzahlPersonen'] : '');
        $add('Arbeitsanfang:', isset($ticket['arbeitsanfang']) && $ticket['arbeitsanfang']!=='' ? ($ticket['arbeitsanfang'] . ' Uhr') : '');
        
        // Bei Abmeldung: Arbeitsende mit aktueller Zeit anzeigen
        if (!$isStart) {
            $currentTime = date('H:i');
            $add('Arbeitsende:', $currentTime . ' Uhr');
        }
        // Bei Anmeldung: Arbeitsende nur falls schon gesetzt
        if ($isStart && !empty($ticket['arbeitsende'])) {
            $add('Arbeitsende:', $ticket['arbeitsende'] . ' Uhr');
        }
        if (!empty($ticket['ausgegebenesMaterial'])) {
            $add('Ausgegebenes Material:', $ticket['ausgegebenesMaterial']);
        }
        if (!empty($ticket['ausgegebeneSchluessel'])) {
            $add('Ausgegebene Schlüssel:', $ticket['ausgegebeneSchluessel']);
        }
        if (!$isStart) {
            if (!empty($ticket['ausgegebenesMaterial'])) {
                $add('Material zurückgegeben:', ($ticket['materialZurueck'] ?? false) ? 'Ja' : 'Nein');
                if (!empty($ticket['materialBemerkung'])) {
                    $add('Bemerkung Material:', $ticket['materialBemerkung']);
                }
            }
            if (!empty($ticket['ausgegebeneSchluessel'])) {
                $add('Schlüssel zurückgegeben:', ($ticket['schluesselZurueck'] ?? false) ? 'Ja' : 'Nein');
                if (!empty($ticket['schluesselBemerkung'])) {
                    $add('Bemerkung Schlüssel:', $ticket['schluesselBemerkung']);
                }
            }
        }
        if (!empty($ticket['bemerkung'])) {
            $add('Bemerkungen:', $ticket['bemerkung']);
        }
        // Feste Spaltenbreite für alle Labels - perfekte Ausrichtung
        $labelWidth = 25; // Optimale Breite für längste Labels
        
        // Verwende identische Formatierung wie OWA-Version (keine TAB-Trennung mehr)
        // Professioneller E-Mail-Body (identisch zur OWA-Version)
        $body = "Sehr geehrte Damen und Herren,\r\n\r\n";
        $body .= "hiermit teile ich Ihnen die $actionText einer Fremdfirma mit:\r\n\r\n";
        $body .= "══════════════════════════════════════════\r\n";
        $body .= "              FREMDFIRMENEINSATZ - " . strtoupper($actionText) . "\r\n";
        $body .= "══════════════════════════════════════════\r\n\r\n";
        
        // Daten mit fester Spaltenbreite für Ausrichtung (wie in OWA-Version)
        foreach ($items as $pair) {
            $label = $pair[0];
            $value = $pair[1];
            $paddedLabel = mb_str_pad($label, $labelWidth, ' ', STR_PAD_RIGHT, 'UTF-8');
            $body .= $paddedLabel . $value . "\r\n";
        }
        
        $body .= "\r\n \r\n" . str_repeat('─', 41) . "\r\n";
        $body .= "\r\nMit freundlichen Grüßen\r\n";
        $body .= "\r\n";
        
        $absenderName = trim($ticket['absenderName'] ?? '');
        if (!empty($absenderName)) {
            $body .= $absenderName . "\r\n";
        }
        
        $body .= "\r\n \r\n";
        return $body;
    }
}

function createMsgFile($ticket, $isStart, $recipients) {
    try {
        $actionText = $isStart ? 'Anmeldung' : 'Abmeldung';
        $subject = "Fremdfirmeneinsatz im Bereich EM-HS Firma: {$ticket['firma']}";
        $recipientEmails = implode('; ', array_column($recipients, 'email'));
        
        // Bodies erzeugen
        $plainTextBody = buildPlainTextBody($ticket, $isStart);
        $htmlBody = buildEmailHtmlBody($ticket, $isStart);

        // HTML-Part Encoding (quoted-printable bevorzugt)
        if (function_exists('quoted_printable_encode')) {
            $htmlEncoded = quoted_printable_encode($htmlBody);
            $htmlEncodingHeader = 'quoted-printable';
        } else {
            $htmlEncoded = $htmlBody;
            $htmlEncodingHeader = '8bit';
        }
        
        $timestamp = date('Y-m-d-H-i-s');
        $safeFirma = preg_replace('/[^A-Za-z0-9_-]+/','_', $ticket['firma']);
        $fileName = $ticket['id'] . '_Fremdfirma_' . $safeFirma . '_' . $actionText . '_' . $timestamp . '.eml';
        $filePath = EMAIL_TEMP_DIR . '/' . $fileName;
        
        // HTML-only EML (erzwingt HTML-Verfassen in Outlook)
        $emlContent = "From: " . ($ticket['absenderName'] ?? 'System') . " <noreply@localhost>\r\n";
        $emlContent .= "To: $recipientEmails\r\n";
        $emlContent .= "Subject: $subject\r\n";
        $emlContent .= "Date: " . date('r') . "\r\n";
        $emlContent .= "MIME-Version: 1.0\r\n";
        $emlContent .= "X-Unsent: 1\r\n";
        $emlContent .= "Content-Type: text/html; charset=UTF-8\r\n";
        $emlContent .= "Content-Transfer-Encoding: $htmlEncodingHeader\r\n\r\n";
        $emlContent .= $htmlEncoded . "\r\n";
        
        file_put_contents($filePath, $emlContent);
        
        // Links generieren: mailto (Text), OWA (auch Text, keine HTML-Tags)
        $mailtoLink = createMailtoLink($recipientEmails, $subject, $plainTextBody);
        $owaText = buildEmailHtmlFragment($ticket, $isStart);
        $owaLink = createOwaLink($recipientEmails, $subject, $owaText, false);
        
        return [
            'success' => true,
            'filePath' => $filePath,
            'fileName' => $fileName,
            'mailtoLink' => $mailtoLink,
            'owaLink' => $owaLink
        ];
        
    } catch (Exception $e) {
        error_log("Fehler beim Erstellen der MSG-Datei: " . $e->getMessage());
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Request Parsing
 */
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$query = parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY);
parse_str($query ?? '', $queryParams);

// Handle ?action= parameter requests (Frontend compatibility)
$action = $queryParams['action'] ?? '';
$id = $queryParams['id'] ?? '';

// Normalize path (remove /public prefix if present)
if ($path === '/public') {
    $path = '/';
} elseif (strpos($path, '/public/') === 0) {
    $path = substr($path, 7);
}

// Parse JSON body for POST/PUT requests
$input = null;
if (in_array($method, ['POST', 'PUT'])) {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true) ?? [];
}

/**
 * Route Handling
 */

// Debug log
error_log(date('Y-m-d H:i:s') . " - $method $path - Action: $action - Input: " . json_encode($input));

/**
 * Handle ?action= parameters for backwards compatibility
 */
if ($action) {
    // Debug log für Action-Requests
    error_log("Processing action: $action with method: $method");
    
    switch ($action) {
        case 'tickets':
            if ($method === 'GET') {
                $tickets = readTickets();
                sendResponse(200, $tickets);
            } elseif ($method === 'POST') {
                try {
                    $tickets = readTickets();
                    // Debug Eingangs-JSON
                    error_log('POST /action=tickets INPUT: ' . json_encode($input));
                    // NEU: Client-ID übernehmen, falls eindeutig und gültig
                    $requestedId = isset($input['id']) ? trim((string)$input['id']) : '';
                    $ticketId = '';
                    if ($requestedId !== '') {
                        $exists = false;
                        foreach ($tickets as $t) { if (($t['id'] ?? '') === $requestedId) { $exists = true; break; } }
                        if (!$exists) { $ticketId = $requestedId; }
                    }
                    if ($ticketId === '') { $ticketId = 't_' . uniqid() . '_' . time(); }
                    $newTicket = [
                        'id' => $ticketId,
                        'firma' => $input['firma'] ?? '',
                        'arbeiten' => $input['arbeiten'] ?? '',
                        'arbeitsbereich' => $input['arbeitsbereich'] ?? '',
                        'ansprechpartner' => $input['ansprechpartner'] ?? '',
                        'rufnummer' => $input['rufnummer'] ?? '',
                        'anzahlPersonen' => (int)($input['anzahlPersonen'] ?? 1),
                        'arbeitsanfang' => $input['arbeitsanfang'] ?? '',
                        'ausgegebenesMaterial' => $input['ausgegebenesMaterial'] ?? '',
                        'ausgegebeneSchluessel' => $input['ausgegebeneSchluessel'] ?? '',
                        'bemerkung' => $input['bemerkung'] ?? '',
                        'absenderName' => $input['absenderName'] ?? '',
                        'status' => 'offen',
                        'erstelltAm' => date('c'),
                        'clientRaw' => $input // Debug-Referenz (kann später entfernt werden)
                    ];
                    $tickets[] = $newTicket;
                    saveTickets($tickets);
                    error_log('Ticket gespeichert: ' . $newTicket['id']);
                    sendResponse(200, $newTicket);
                } catch (Exception $ex) {
                    error_log('Fehler Tickets POST: ' . $ex->getMessage());
                    sendResponse(500, ['error' => 'Ticket konnte nicht gespeichert werden', 'details' => $ex->getMessage()]);
                }
            } elseif ($method === 'PUT' && !empty($id)) {
                $tickets = readTickets();
                foreach ($tickets as &$ticket) {
                    if ($ticket['id'] === $id) {
                        // Check if we're closing the ticket
                        if (isset($input['status']) && $input['status'] === 'geschlossen') {
                            $ticket['arbeitsende'] = $input['arbeitsende'] ?? '';
                            $ticket['anzahlPersonen'] = (int)($input['anzahlPersonen'] ?? $ticket['anzahlPersonen']);
                            $ticket['ansprechpartner'] = $input['ansprechpartner'] ?? $ticket['ansprechpartner'];
                            $ticket['rufnummer'] = $input['rufnummer'] ?? $ticket['rufnummer'];
                            $ticket['materialZurueck'] = $input['materialZurueck'] ?? false;
                            $ticket['materialBemerkung'] = $input['materialBemerkung'] ?? '';
                            $ticket['schluesselZurueck'] = $input['schluesselZurueck'] ?? false;
                            $ticket['schluesselBemerkung'] = $input['schluesselBemerkung'] ?? '';
                            $ticket['closeAbsenderName'] = $input['closeAbsenderName'] ?? '';
                            $ticket['status'] = 'geschlossen';
                            $ticket['geschlossenAm'] = date('c');
                        } else {
                            // Regular update
                            foreach ($input as $key => $value) {
                                if ($key !== 'id') {
                                    $ticket[$key] = $value;
                                }
                            }
                        }
                        
                        saveTickets($tickets);
                        sendResponse(200, $ticket);
                    }
                }
                sendResponse(404, ['error' => 'Ticket nicht gefunden']);
            } elseif ($method === 'DELETE' && !empty($id)) {
                cleanupTicketEmails($id);
                $tickets = readTickets();
                $filteredTickets = array_filter($tickets, function($t) use ($id) {
                    return $t['id'] !== $id;
                });
                saveTickets(array_values($filteredTickets));
                sendResponse(200, ['success' => true]);
            }
            break;
            
        case 'recipients':
            if ($method === 'GET') {
                $recipients = readRecipients();
                error_log("Recipients GET: Loaded " . count($recipients) . " recipients");
                error_log("Recipients File Path: " . RECIPIENTS_FILE);
                error_log("Recipients File Exists: " . (file_exists(RECIPIENTS_FILE) ? 'Yes' : 'No'));
                sendResponse(200, $recipients);
            } elseif ($method === 'POST') {
                try {
                    error_log("Recipients POST: Input data: " . json_encode($input));
                    $recipients = readRecipients();
                    error_log("Recipients POST: Current count before add: " . count($recipients));
                    
                    $newRecipient = [
                        'id' => (string)time() . rand(100, 999),
                        'name' => $input['name'] ?? '',
                        'email' => $input['email'] ?? ''
                    ];
                    
                    $recipients[] = $newRecipient;
                    error_log("Recipients POST: New count after add: " . count($recipients));
                    
                    saveRecipients($recipients);
                    error_log("Recipients POST: Successfully added recipient with ID " . $newRecipient['id']);
                    
                    // Direktes Empfänger-Objekt zurückgeben (wie das Frontend es erwartet)
                    sendResponse(200, $newRecipient);
                } catch (Exception $e) {
                    error_log("Recipients POST Error: " . $e->getMessage());
                    error_log("Recipients POST Stack: " . $e->getTraceAsString());
                    sendResponse(500, ['error' => 'Empfänger konnte nicht gespeichert werden', 'details' => $e->getMessage()]);
                }
            } elseif ($method === 'DELETE' && !empty($id)) {
                try {
                    error_log("Recipients DELETE: Attempting to delete ID: " . $id);
                    $recipients = readRecipients();
                    $originalCount = count($recipients);
                    error_log("Recipients DELETE: Current count: " . $originalCount);
                    
                    // Debug: Alle IDs anzeigen
                    $currentIds = array_map(function($r) { return $r['id'] ?? 'NO_ID'; }, $recipients);
                    error_log("Recipients DELETE: Current IDs: " . implode(', ', $currentIds));
                    
                    $filteredRecipients = array_filter($recipients, function($r) use ($id) {
                        return $r['id'] !== $id;
                    });
                    
                    $newCount = count($filteredRecipients);
                    error_log("Recipients DELETE: Count after filter: " . $newCount);
                    
                    if ($newCount < $originalCount) {
                        saveRecipients(array_values($filteredRecipients));
                        error_log("Recipients DELETE: Successfully removed recipient with ID " . $id);
                        sendResponse(200, ['success' => true]);
                    } else {
                        error_log("Recipients DELETE: Recipient with ID " . $id . " not found");
                        sendResponse(404, ['success' => false, 'error' => 'Empfänger nicht gefunden']);
                    }
                } catch (Exception $e) {
                    error_log("Recipients DELETE Error: " . $e->getMessage());
                    error_log("Recipients DELETE Stack: " . $e->getTraceAsString());
                    sendResponse(500, ['success' => false, 'error' => 'Empfänger konnte nicht gelöscht werden', 'details' => $e->getMessage()]);
                }
            }
            break;
            
        case 'debug_recipients':
            if ($method === 'GET') {
                $info = [
                    'recipients_file' => RECIPIENTS_FILE,
                    'file_exists' => file_exists(RECIPIENTS_FILE),
                    'file_readable' => is_readable(RECIPIENTS_FILE),
                    'file_writable' => is_writable(RECIPIENTS_FILE),
                    'dir_writable' => is_writable(dirname(RECIPIENTS_FILE)),
                    'file_size' => file_exists(RECIPIENTS_FILE) ? filesize(RECIPIENTS_FILE) : 0,
                    'file_content' => file_exists(RECIPIENTS_FILE) ? file_get_contents(RECIPIENTS_FILE) : 'File not found'
                ];
                sendResponse(200, $info);
            }
            break;
            
        case 'init_firmen_json':
            error_log("Manual JSON initialization requested");
            try {
                // Force recreate the JSON file
                $emptyArray = [];
                $json = json_encode($emptyArray, JSON_PRETTY_PRINT);
                $result = file_put_contents(FIRMEN_FILE, $json);
                
                if ($result !== false) {
                    error_log("JSON file initialized successfully: $result bytes written");
                    sendResponse(200, [
                        'success' => true, 
                        'message' => 'JSON-Datei erfolgreich initialisiert',
                        'file' => FIRMEN_FILE,
                        'bytes' => $result
                    ]);
                } else {
                    error_log("Failed to initialize JSON file");
                    sendResponse(500, ['error' => 'Konnte JSON-Datei nicht erstellen']);
                }
            } catch (Exception $e) {
                error_log("Exception during JSON initialization: " . $e->getMessage());
                sendResponse(500, ['error' => 'Fehler: ' . $e->getMessage()]);
            }
            break;
            
        case 'firmen':
            error_log("Firmen action - Method: $method, ID: $id");
            error_log("Input data: " . json_encode($input));
            
            if ($method === 'GET') {
                $firmen = readFirmen();
                error_log("GET Firmen - Count: " . count($firmen));
                sendResponse(200, $firmen);
            } elseif ($method === 'POST') {
                try {
                    $firmen = readFirmen();
                    $newFirma = [
                        'id' => time() . '_' . substr(md5(uniqid()), 0, 8),
                        'name' => $input['name'] ?? '',
                        'ansprechpartner' => $input['ansprechpartner'] ?? '',
                        'rufnummer' => $input['rufnummer'] ?? '',
                        'email' => $input['email'] ?? '',
                        'adresse' => $input['adresse'] ?? '',
                        'bemerkung' => $input['bemerkung'] ?? '',
                        'erstelltAm' => date('c')
                    ];
                    $firmen[] = $newFirma;
                    saveFirmen($firmen);
                    sendResponse(200, ['success' => true, 'firma' => $newFirma]);
                } catch (Exception $e) {
                    error_log('POST Firmen Fehler: ' . $e->getMessage());
                    sendResponse(500, ['error' => 'Firma konnte nicht gespeichert werden', 'details' => $e->getMessage()]);
                }
            } elseif ($method === 'PUT' && !empty($id)) {
                try {
                    $firmen = readFirmen();
                    $found = false;
                    foreach ($firmen as &$firma) {
                        if ($firma['id'] === $id) {
                            $firma['name'] = $input['name'] ?? $firma['name'];
                            $firma['ansprechpartner'] = $input['ansprechpartner'] ?? $firma['ansprechpartner'];
                            $firma['rufnummer'] = $input['rufnummer'] ?? $firma['rufnummer'];
                            $firma['email'] = $input['email'] ?? $firma['email'];
                            $firma['adresse'] = $input['adresse'] ?? $firma['adresse'];
                            $firma['bemerkung'] = $input['bemerkung'] ?? $firma['bemerkung'];
                            $firma['aktualisiertAm'] = date('c');
                            $found = true;
                            break;
                        }
                    }
                    if ($found) {
                        saveFirmen($firmen);
                        sendResponse(200, ['success' => true]);
                    } else {
                        sendResponse(404, ['error' => 'Firma nicht gefunden']);
                    }
                } catch (Exception $e) {
                    error_log('PUT Firmen Fehler: ' . $e->getMessage());
                    sendResponse(500, ['error' => 'Firma konnte nicht aktualisiert werden', 'details' => $e->getMessage()]);
                }
            } elseif ($method === 'DELETE' && !empty($id)) {
                try {
                    $firmen = readFirmen();
                    $originalCount = count($firmen);
                    $filteredFirmen = array_filter($firmen, function($f) use ($id) { return $f['id'] !== $id; });
                    if (count($filteredFirmen) < $originalCount) {
                        saveFirmen(array_values($filteredFirmen));
                        sendResponse(200, ['success' => true, 'message' => 'Firma erfolgreich gelöscht']);
                    } else {
                        sendResponse(404, ['error' => 'Firma nicht gefunden']);
                    }
                } catch (Exception $e) {
                    error_log('DELETE Firmen Fehler: ' . $e->getMessage());
                    sendResponse(500, ['error' => 'Firma konnte nicht gelöscht werden', 'details' => $e->getMessage()]);
                }
            }
            break;
            
        case 'send-email':
            error_log("Processing send-email action - Method: $method");
            error_log("Input data: " . json_encode($input));
            if ($method === 'POST') {
                // Akzeptiere sowohl ticketId als auch id als Fallback
                $ticketId = $input['ticketId'] ?? $input['id'] ?? '';
                $isStart = $input['isStart'] ?? true;
                error_log("Send-email: ticketId=$ticketId, isStart=$isStart");
                if (empty($ticketId)) {
                    sendResponse(400, ['error' => 'Ticket-ID erforderlich']);
                }
                $tickets = readTickets();
                $ticket = null;
                foreach ($tickets as $t) {
                    if (($t['id'] ?? '') === $ticketId) { $ticket = $t; break; }
                }
                if (!$ticket) {
                    // Debug-Hinweis mit vorhandenen IDs
                    $availableIds = array_map(function($t){return $t['id'] ?? '';}, $tickets);
                    error_log("Ticket not found: $ticketId. Available: " . implode(',', $availableIds));
                    sendResponse(404, ['error' => 'Ticket nicht gefunden', 'hint' => 'ID nicht in Datei', 'availableIds' => $availableIds]);
                }
                $recipients = readRecipients();
                if (empty($recipients)) {
                    error_log("No recipients found");
                    sendResponse(400, ['error' => 'Keine E-Mail-Empfänger definiert']);
                }
                $emlResult = createMsgFile($ticket, $isStart, $recipients);
                if (!$emlResult['success']) {
                    error_log("EML creation failed: " . $emlResult['error']);
                    sendResponse(500, ['error' => 'E-Mail-Datei konnte nicht erstellt werden: ' . $emlResult['error']]);
                }
                error_log("EML creation successful: " . $emlResult['fileName']);
                sendResponse(200, [
                    'success' => true,
                    'filename' => $emlResult['fileName'],
                    'downloadUrl' => 'x_mb_api.php?action=download&filename=' . urlencode($emlResult['fileName']),
                    'mailtoLink' => $emlResult['mailtoLink'] ?? null,
                    'owaLink' => $emlResult['owaLink'] ?? null
                ]);
            }
            break;
            
        case 'archived':
            if ($method === 'GET') {
                $tickets = readTickets();
                $archivedTickets = array_filter($tickets, function($t) {
                    return ($t['status'] ?? '') === 'geschlossen';
                });
                error_log("Archiv-Abfrage: " . count($archivedTickets) . " geschlossene Tickets gefunden von " . count($tickets) . " gesamt");
                sendResponse(200, array_values($archivedTickets));
            }
            break;
            
        case 'restore':
            if ($method === 'POST' && !empty($id)) {
                $tickets = readTickets();
                foreach ($tickets as &$ticket) {
                    if ($ticket['id'] === $id) {
                        $ticket['status'] = 'offen';
                        unset($ticket['geschlossenAm'], $ticket['arbeitsende'], $ticket['abgemeldetAm']);
                        unset($ticket['materialZurueck'], $ticket['materialBemerkung']);
                        unset($ticket['schluesselZurueck'], $ticket['schluesselBemerkung']);
                        unset($ticket['closeAbsenderName']);
                        saveTickets($tickets);
                        sendResponse(200, ['success' => true, 'ticket' => $ticket]);
                    }
                }
                sendResponse(404, ['error' => 'Ticket nicht gefunden']);
            }
            break;
            
        case 'close':
            if ($method === 'POST' && !empty($id)) {
                $tickets = readTickets();
                foreach ($tickets as &$ticket) {
                    if ($ticket['id'] === $id) {
                        // Arbeitsende mit aktueller Zeit setzen falls nicht vorhanden
                        $ticket['arbeitsende'] = $input['arbeitsende'] ?? date('H:i');
                        $ticket['anzahlPersonen'] = (int)($input['anzahlPersonen'] ?? $ticket['anzahlPersonen']);
                        $ticket['ansprechpartner'] = $input['ansprechpartner'] ?? $ticket['ansprechpartner'];
                        $ticket['rufnummer'] = $input['rufnummer'] ?? $ticket['rufnummer'];
                        
                        // Material/Schlüssel-Rückgabe
                        $ticket['materialZurueck'] = $input['materialZurueck'] ?? false;
                        $ticket['materialBemerkung'] = $input['materialBemerkung'] ?? '';
                        $ticket['schluesselZurueck'] = $input['schluesselZurueck'] ?? false;
                        $ticket['schluesselBemerkung'] = $input['schluesselBemerkung'] ?? '';
                        $ticket['closeAbsenderName'] = $input['closeAbsenderName'] ?? '';
                        
                        // Status ändern und Zeitstempel setzen
                        $ticket['status'] = 'geschlossen';
                        $ticket['geschlossenAm'] = date('c');
                        $ticket['abgemeldetAm'] = date('c');
                        
                        saveTickets($tickets);
                        error_log("Ticket {$ticket['id']} wurde ins Archiv verschoben");
                        sendResponse(200, ['success' => true, 'ticket' => $ticket]);
                    }
                }
                sendResponse(404, ['error' => 'Ticket nicht gefunden']);
            }
            break;
            
        case 'download':
            $filename = $queryParams['filename'] ?? '';
            if (empty($filename)) {
                sendResponse(400, ['error' => 'Dateiname erforderlich']);
            }
            
            $filePath = EMAIL_TEMP_DIR . '/' . basename($filename);
            if (!file_exists($filePath)) {
                sendResponse(404, ['error' => 'Datei nicht gefunden']);
            }
            
            header('Content-Type: message/rfc822');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . filesize($filePath));
            readfile($filePath);
            exit();
            break;
            
        default:
            error_log("Unknown action: $action");
            sendResponse(400, ['error' => 'Unbekannte Aktion: ' . $action]);
    }
}

// Continue with original path-based routing for backward compatibility

// Download route
if (strpos($path, '/download/') === 0 && $method === 'GET') {
    $fileName = substr($path, 10);
    $filePath = EMAIL_TEMP_DIR . '/' . basename($fileName);
    
    if (file_exists($filePath)) {
        header('Content-Type: application/vnd.ms-outlook');
        header("Content-Disposition: attachment; filename=\"$fileName\"");
        header('Content-Length: ' . filesize($filePath));
        readfile($filePath);
        exit();
    } else {
        sendResponse(404, 'Datei nicht gefunden', 'text/plain');
    }
}

// API Routes
$apiPath = $path;
if (strpos($path, '/public/api/') === 0) {
    $apiPath = substr($path, 7); // Remove '/public'
}

// Health check
if ($apiPath === '/api/health' && $method === 'GET') {
    sendResponse(200, [
        'status' => 'OK',
        'timestamp' => date('c'),
        'version' => '1.0.0',
        'environment' => 'production'
    ]);
}

// Tickets API
if ($apiPath === '/api/tickets' || $apiPath === '/tickets') {
    if ($method === 'GET') {
        $tickets = readTickets();
        sendResponse(200, $tickets);
    } elseif ($method === 'POST') {
        try {
            $tickets = readTickets();
            error_log('POST /api/tickets INPUT: ' . json_encode($input));
            $requestedId = isset($input['id']) ? trim((string)$input['id']) : '';
            $ticketId = '';
            if ($requestedId !== '') {
                $exists = false;
                foreach ($tickets as $t) { if (($t['id'] ?? '') === $requestedId) { $exists = true; break; } }
                if (!$exists) { $ticketId = $requestedId; }
            }
            if ($ticketId === '') { $ticketId = (string)time(); }
            $newTicket = [
                'id' => $ticketId,
                'firma' => $input['firma'] ?? '',
                'arbeiten' => $input['arbeiten'] ?? '',
                'arbeitsbereich' => $input['arbeitsbereich'] ?? '',
                'ansprechpartner' => $input['ansprechpartner'] ?? '',
                'rufnummer' => $input['rufnummer'] ?? '',
                'anzahlPersonen' => (int)($input['anzahlPersonen'] ?? 1),
                'arbeitsanfang' => $input['arbeitsanfang'] ?? '',
                'ausgegebenesMaterial' => $input['ausgegebenesMaterial'] ?? '',
                'ausgegebeneSchluessel' => $input['ausgegebeneSchluessel'] ?? '',
                'bemerkung' => $input['bemerkung'] ?? '',
                'absenderName' => $input['absenderName'] ?? '',
                'status' => 'offen',
                'erstelltAm' => date('c'),
                'clientRaw' => $input
            ];
            $tickets[] = $newTicket;
            saveTickets($tickets);
            error_log('Ticket gespeichert (API): ' . $newTicket['id']);
            sendResponse(200, ['success' => true, 'ticket' => $newTicket, 'note' => ($requestedId && $ticketId!==$requestedId) ? 'Client-ID belegt, neue ID generiert' : 'ID übernommen']);
        } catch (Exception $ex) {
            error_log('Fehler /api/tickets POST: ' . $ex->getMessage());
            sendResponse(500, ['error' => 'Ticket konnte nicht gespeichert werden', 'details' => $ex->getMessage()]);
        }
    }
}

// Archived tickets
if (($apiPath === '/api/tickets/archived' || $apiPath === '/tickets/archived') && $method === 'GET') {
    $tickets = readTickets();
    $archivedTickets = array_filter($tickets, function($t) {
        return $t['status'] === 'geschlossen';
    });
    sendResponse(200, array_values($archivedTickets));
}

// Restore ticket
if (preg_match('/^\/api\/tickets\/(.+)\/restore$/', $apiPath, $matches) && $method === 'PUT') {
    $ticketId = $matches[1];
    $tickets = readTickets();
    
    foreach ($tickets as &$ticket) {
        if ($ticket['id'] === $ticketId) {
            $ticket['status'] = 'offen';
            unset($ticket['arbeitsende'], $ticket['geschlossenAm']);
            saveTickets($tickets);
            sendResponse(200, ['success' => true, 'ticket' => $ticket]);
        }
    }
    
    sendResponse(404, ['error' => 'Ticket nicht gefunden']);
}

// Close ticket
if (preg_match('/^\/api\/tickets\/(.+)\/close$/', $apiPath, $matches) && $method === 'PUT') {
    $ticketId = $matches[1];
    $tickets = readTickets();
    
    foreach ($tickets as &$ticket) {
        if ($ticket['id'] === $ticketId) {
            $ticket['arbeitsende'] = $input['arbeitsende'] ?? '';
            $ticket['anzahlPersonen'] = (int)($input['anzahlPersonen'] ?? $ticket['anzahlPersonen']);
            if (isset($input['ansprechpartner'])) $ticket['ansprechpartner'] = $input['ansprechpartner'];
            if (isset($input['rufnummer'])) $ticket['rufnummer'] = $input['rufnummer'];
            if (isset($input['absenderName'])) $ticket['absenderName'] = $input['absenderName'];
            $ticket['materialZurueck'] = $input['materialZurueck'] ?? false;
            $ticket['schluesselZurueck'] = $input['schluesselZurueck'] ?? false;
            if (isset($input['materialBemerkung'])) $ticket['materialBemerkung'] = $input['materialBemerkung'];
            if (isset($input['schluesselBemerkung'])) $ticket['schluesselBemerkung'] = $input['schluesselBemerkung'];
            $ticket['status'] = 'geschlossen';
            $ticket['geschlossenAm'] = date('c');
            
            saveTickets($tickets);
            
            sendResponse(200, ['success' => true, 'ticket' => $ticket]);
        }
    }
    
    sendResponse(404, ['error' => 'Ticket nicht gefunden']);
}

// Delete ticket
if (preg_match('/^\/api\/tickets\/(.+)$/', $apiPath, $matches) && $method === 'DELETE') {
    $ticketId = $matches[1];
    
    cleanupTicketEmails($ticketId);
    
    $tickets = readTickets();
    $filteredTickets = array_filter($tickets, function($t) use ($ticketId) {
        return $t['id'] !== $ticketId;
    });
    
    saveTickets(array_values($filteredTickets));
    sendResponse(200, ['success' => true]);
}

// Create email
if ($apiPath === '/api/create-email' && $method === 'POST') {
    $ticketId = $input['ticketId'] ?? '';
    $isStart = $input['isStart'] ?? true;
    
    $tickets = readTickets();
    $ticket = null;
    foreach ($tickets as $t) {
        if ($t['id'] === $ticketId) {
            $ticket = $t;
            break;
        }
    }
    
    if (!$ticket) {
        sendResponse(404, ['error' => 'Ticket nicht gefunden']);
    }
    
    $recipients = readRecipients();
    $emlResult = createMsgFile($ticket, $isStart, $recipients);
    
    if (!$emlResult['success']) {
        sendResponse(500, ['error' => 'MSG-Datei konnte nicht erstellt werden: ' . $emlResult['error']]);
    }
    
    sendResponse(200, [
        'success' => true,
        'filePath' => $emlResult['filePath'],
        'fileName' => $emlResult['fileName'],
        'downloadUrl' => '/download/' . $emlResult['fileName'],
        'mailtoLink' => $emlResult['mailtoLink'],
        'owaLink' => $emlResult['owaLink'],
        'message' => 'MSG-Datei erfolgreich erstellt'
    ]);
}

// Mailto API
if ($apiPath === '/api/mailto' && $method === 'POST') {
    $ticketId = $input['ticketId'] ?? '';
    $isStart = $input['isStart'] ?? true;
    
    $tickets = readTickets();
    $ticket = null;
    foreach ($tickets as $t) {
        if ($t['id'] === $ticketId) {
            $ticket = $t;
            break;
        }
    }
    
    if (!$ticket) {
        sendResponse(404, ['error' => 'Ticket nicht gefunden']);
    }
    
    $recipients = readRecipients();
    if (empty($recipients)) {
        sendResponse(400, ['error' => 'Keine E-Mail-Empfänger definiert']);
    }
    
    // Einheitlich ausgerichteter Plain-Text-Body per Helper
    $body_text = buildPlainTextBody($ticket, $isStart);
    $subject = "Fremdfirmeneinsatz im Bereich EM-HS Firma: {$ticket['firma']}";
    $recipientEmails = implode('; ', array_column($recipients, 'email'));

    $mailtoLink = createMailtoLink($recipientEmails, $subject, $body_text);
    // Für OWA Text-Fragment verwenden (kein HTML)
    $owa_text = buildEmailHtmlFragment($ticket, $isStart);
    $owaLink = createOwaLink($recipientEmails, $subject, $owa_text, false);

    sendResponse(200, [
        'success' => true,
        'mailtoLink' => $mailtoLink,
        'owaLink' => $owaLink,
        'message' => 'Mailto-/OWA-Link wurde erstellt'
    ]);
}

// Recipients API
if ($apiPath === '/api/recipients') {
    if ($method === 'GET') {
        $recipients = readRecipients();
        sendResponse(200, $recipients);
    } elseif ($method === 'POST') {
        $recipients = readRecipients();
        $newRecipient = [
            'id' => (string)time(),
            'name' => $input['name'] ?? '',
            'email' => $input['email'] ?? ''
        ];
        
        $recipients[] = $newRecipient;
        saveRecipients($recipients);
        
        sendResponse(200, ['success' => true, 'recipient' => $newRecipient]);
    }
}

// Delete recipient
if (preg_match('/^\/api\/recipients\/(.+)$/', $apiPath, $matches) && $method === 'DELETE') {
    $recipientId = $matches[1];
    $recipients = readRecipients();
    $filteredRecipients = array_filter($recipients, function($r) use ($recipientId) {
        return $r['id'] !== $recipientId;
    });
    
    saveRecipients(array_values($filteredRecipients));
    sendResponse(200, ['success' => true]);
}

// Firmen API
if ($apiPath === '/api/firmen') {
    if ($method === 'GET') {
        $firmen = readFirmen();
        sendResponse(200, $firmen);
    } elseif ($method === 'POST') {
        $firmen = readFirmen();
        $newFirma = [
            'id' => time() . '_' . substr(md5(uniqid()), 0, 8),
            'name' => $input['name'] ?? '',
            'ansprechpartner' => $input['ansprechpartner'] ?? '',
            'rufnummer' => $input['rufnummer'] ?? '',
            'email' => $input['email'] ?? '',
            'adresse' => $input['adresse'] ?? '',
            'bemerkung' => $input['bemerkung'] ?? '',
            'erstelltAm' => date('c')
        ];
        
        $firmen[] = $newFirma;
        saveFirmen($firmen);
        
        sendResponse(200, ['success' => true, 'firma' => $newFirma]);
    }
}

// Update firma
if (preg_match('/^\/api\/firmen\/(.+)$/', $apiPath, $matches) && $method === 'PUT') {
    $firmaId = $matches[1];
    try {
        $firmen = readFirmen();
        foreach ($firmen as &$firma) {
            if ($firma['id'] === $firmaId) {
                $firma['name'] = $input['name'] ?? $firma['name'];
                $firma['ansprechpartner'] = $input['ansprechpartner'] ?? $firma['ansprechpartner'];
                $firma['rufnummer'] = $input['rufnummer'] ?? $firma['rufnummer'];
                $firma['email'] = $input['email'] ?? $firma['email'];
                $firma['adresse'] = $input['adresse'] ?? $firma['adresse'];
                $firma['bemerkung'] = $input['bemerkung'] ?? $firma['bemerkung'];
                $firma['aktualisiertAm'] = date('c');
                saveFirmen($firmen);
                sendResponse(200, ['success' => true, 'firma' => $firma]);
            }
        }
        sendResponse(404, ['error' => 'Firma nicht gefunden']);
    } catch (Exception $e) {
        sendResponse(500, ['error' => 'Firma konnte nicht aktualisiert werden', 'details' => $e->getMessage()]);
    }
}
// Delete firma (path-based)
if (preg_match('/^\/api\/firmen\/(.+)$/', $apiPath, $matches) && $method === 'DELETE') {
    $firmaId = $matches[1];
    try {
        $firmen = readFirmen();
        $originalCount = count($firmen);
        $filteredFirmen = array_filter($firmen, function($f) use ($firmaId) { return $f['id'] !== $firmaId; });
        if (count($filteredFirmen) < $originalCount) {
            saveFirmen(array_values($filteredFirmen));
            sendResponse(200, ['success' => true, 'message' => 'Firma erfolgreich gelöscht']);
        } else {
            sendResponse(404, ['error' => 'Firma nicht gefunden']);
        }
    } catch (Exception $e) {
        sendResponse(500, ['error' => 'Firma konnte nicht gelöscht werden', 'details' => $e->getMessage()]);
    }
}

// Firmen suggestions
if ($apiPath === '/api/firmen/suggestions' && $method === 'GET') {
    $query = $queryParams['q'] ?? '';
    $firmen = readFirmen();
    
    if (empty($query)) {
        sendResponse(200, ['suggestions' => []]);
    }
    
    $suggestions = [];
    $queryLower = strtolower($query);
    
    foreach ($firmen as $firma) {
        $name = strtolower($firma['name'] ?? '');
        $ansprechpartner = strtolower($firma['ansprechpartner'] ?? '');
        
        if (strpos($name, $queryLower) !== false || strpos($ansprechpartner, $queryLower) !== false) {
            $suggestions[] = [
                'id' => $firma['id'],
                'name' => $firma['name'],
                'ansprechpartner' => $firma['ansprechpartner'],
                'rufnummer' => $firma['rufnummer'],
                'arbeiten' => $firma['arbeiten']
            ];
        }
        
        if (count($suggestions) >= 10) break;
    }
    
    sendResponse(200, ['suggestions' => $suggestions]);
}

// Email files for ticket
if ($apiPath === '/api/tickets/emails' && $method === 'GET') {
    $ticketId = $queryParams['ticketId'] ?? $queryParams['id'] ?? '';
    
    if (empty($ticketId)) {
        sendResponse(400, ['error' => 'ticketId Parameter fehlt']);
    }
    
    if (!is_dir(EMAIL_TEMP_DIR)) {
        mkdir(EMAIL_TEMP_DIR, 0755, true);
    }
    
    $files = [];
    $dir = opendir(EMAIL_TEMP_DIR);
    while (($fileName = readdir($dir)) !== false) {
        if ($fileName !== '.' && $fileName !== '..' && preg_match('/^' . preg_quote($ticketId,'/') . '_.*\.eml$/i', $fileName)) {
            $filePath = EMAIL_TEMP_DIR . '/' . $fileName;
            $fileInfo = [
                'fileName' => $fileName,
                'size' => filesize($filePath),
                'createdAt' => date('c', filemtime($filePath)),
                'downloadUrl' => '/download/' . $fileName
            ];
            $files[] = $fileInfo;
        }
    }
    closedir($dir);
    
    sendResponse(200, ['emailFiles' => $files]);
}

// Nur 404 senden wenn keine Action gefunden wurde
if (empty($action) && !headers_sent()) {
    // Nur 404 wenn bisher nichts gematcht hat
    sendResponse(404, ['error' => 'API Endpoint nicht gefunden']);
}
?>
