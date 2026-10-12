<?php
// filepath: c:/Users/di38885/Desktop/Webseite/public/Formulare/formulare_uploads.php
// Einfache Upload/List-API. Speichert Dateien in ./uploads und listet sie.
// Methode:
//  - GET  -> Liste der Dateien als JSON [{name, url, size, mtime}]
//  - POST -> erwartet multipart/form-data mit Feld "files[]"

$baseDir = __DIR__;
$uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
if (!is_dir($uploadDir)) { mkdir($uploadDir, 0775, true); }
if (!is_writable($uploadDir)) { @chmod($uploadDir, 0777); }

function perms($path){ clearstatcache(true, $path); return @substr(sprintf('%o', @fileperms($path)), -4) ?: null; }

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function json($data, $code = 200){ http_response_code($code); header('Content-Type: application/json; charset=utf-8'); echo json_encode($data); exit; }

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $files = [];
    foreach (scandir($uploadDir) as $f) {
        if ($f === '.' || $f === '..') continue;
        $path = $uploadDir . DIRECTORY_SEPARATOR . $f;
        if (!is_file($path)) continue;
        $files[] = [
            'name' => $f,
            'url'  => 'uploads/' . rawurlencode($f),
            'size' => filesize($path),
            'mtime'=> filemtime($path)
        ];
    }
    // Neueste oben
    usort($files, fn($a,$b) => $b['mtime'] <=> $a['mtime']);
    json($files);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_FILES) || !isset($_FILES['files'])) { json(['error' => 'Keine Dateien übermittelt.'], 400); }
    if (!is_writable($uploadDir)) {
        json([
            'error' => 'Upload-Verzeichnis nicht beschreibbar',
            'dir'   => $uploadDir,
            'perm'  => perms($uploadDir),
            'hints' => 'Stellen Sie sicher, dass der Webserver-Benutzer Schreibrechte hat (chown/chgrp auf www-data; chmod 775/777).'
        ], 500);
    }

    $allowed = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','jpg','jpeg','png'];
    $maxSize = 20 * 1024 * 1024; // 20MB
    $saved = [];
    $errors = [];

    // $_FILES normalisieren
    $names = $_FILES['files']['name'];
    $tmpns = $_FILES['files']['tmp_name'];
    $sizes = $_FILES['files']['size'];
    $errs  = $_FILES['files']['error'];

    // Einzeldatei vs. multiple
    $count = is_array($names) ? count($names) : 1;

    for ($i=0; $i<$count; $i++) {
        $name = is_array($names) ? ($names[$i] ?? '') : $names;
        $tmp  = is_array($tmpns) ? ($tmpns[$i] ?? '') : $tmpns;
        $size = is_array($sizes) ? (int)($sizes[$i] ?? 0) : (int)$sizes;
        $err  = is_array($errs)  ? ($errs[$i] ?? UPLOAD_ERR_NO_FILE) : $errs;

        if ($err !== UPLOAD_ERR_OK) { $errors[] = "$name: Upload-Fehlercode $err"; continue; }
        if (!$tmp || !is_uploaded_file($tmp)) { $errors[] = "$name: keine gültige Upload-Quelle"; continue; }
        if ($size <= 0) { $errors[] = "$name: leere Datei"; continue; }
        if ($size > $maxSize) { $errors[] = "$name: größer als 20MB"; continue; }

        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed, true)) { $errors[] = "$name: Dateityp nicht erlaubt ($ext)"; continue; }

        $base = pathinfo($name, PATHINFO_FILENAME);
        $safe = preg_replace('/[^A-Za-z0-9._-]+/','_', $base);
        $final = $safe . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $dest = $uploadDir . DIRECTORY_SEPARATOR . $final;

        if (move_uploaded_file($tmp, $dest)) {
            $saved[] = [
                'name' => $final,
                'url'  => 'uploads/' . rawurlencode($final),
                'size' => $size,
                'mtime'=> filemtime($dest)
            ];
        } else {
            // Fallback: wenn move_uploaded_file fehlschlägt, mit rename oder copy versuchen
            $moved = @rename($tmp, $dest);
            if (!$moved) { $moved = @copy($tmp, $dest); }
            if ($moved) {
                $saved[] = [
                    'name' => $final,
                    'url'  => 'uploads/' . rawurlencode($final),
                    'size' => $size,
                    'mtime'=> filemtime($dest)
                ];
            } else {
                $errors[] = sprintf(
                    '%s: konnte nicht gespeichert werden (tmp: %s, dest: %s, dest_dir_perm: %s, tmp_exists: %s, tmp_readable: %s)',
                    $name,
                    $tmp,
                    $dest,
                    perms($uploadDir) ?: 'unbekannt',
                    file_exists($tmp) ? 'ja' : 'nein',
                    is_readable($tmp) ? 'ja' : 'nein'
                );
            }
        }
    }

    json(['uploaded' => $saved, 'errors' => $errors]);
}

json(['error' => 'Methode nicht erlaubt'], 405);
