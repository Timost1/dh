// Importiere die notwendigen Node.js-Module
const http = require('http'); // HTTP-Server-Modul für die Erstellung eines Webservers
const fs = require('fs'); // Dateisystem-Modul für Dateioperationen (Lesen/Schreiben)
const path = require('path'); // Pfad-Modul für plattformübergreifende Pfadoperationen
const url = require('url'); // URL-Modul zum Parsen und Bearbeiten von URLs

// Definiere die wichtigsten Pfade und Konstanten
const port = 3000; // Port, auf dem der Server lauscht
const dataDirectory = path.join(__dirname, 'public'); // Verzeichnis für öffentliche Dateien
const telefonbuchFile = path.join(dataDirectory, 'telefonbuch.json'); // Telefonbuch-Datei
const schwarzesBrettFile = path.join(dataDirectory, 'schwarzesbrett.json'); // Schwarzes Brett-Datei
const mitarbeiterFile = path.join(dataDirectory, 'mitarbeiter.json'); // Mitarbeiter-Datei
// const LOG_FILE_PATH = path.join(dataDirectory, 'activity.log'); // Logdatei für Aktivitäten
const wochenplanDataFile = path.join(dataDirectory, 'wochenplan.json'); // Wochenplan-Datei
const schichtoptionenFile = path.join(dataDirectory, 'schichtoptionen.json'); // Schichtoptionen-Datei
const quickbearbeitungFile = path.join(dataDirectory, 'Quickbearbeitung.json'); // Quickbearbeitung-Datei
const projektplanerFile = path.join(dataDirectory, 'projektplaner.json'); // Projektplaner-Datei
const vacationFile = path.join(dataDirectory, 'urlaubData.json'); // Urlaubsdaten-Datei
const logTelefonbuchFile = path.join(dataDirectory, 'telefonbuch_log.json'); // internes Log für Handy/Co-Warner

// Collaborative editing lock system
let wochenplanEditLock = {
    isLocked: false,
    userId: null,
    userName: null,
    lockTime: null,
    lockTimeout: null
};

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 Minuten in Millisekunden
const SESSION_TIMEOUT = 30 * 1000; // 15 Minuten Inaktivitäts-Timeout für Sessions

// User session tracking for automatic logout
let userSessions = new Map(); // userId -> { lastHeartbeat: timestamp, userName: string }
const SESSION_HEARTBEAT_TIMEOUT = 10 * 60 * 1000; // 10 Minuten (länger als vorher)

// Cleanup expired sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of userSessions.entries()) {
        if (now - session.lastHeartbeat > SESSION_HEARTBEAT_TIMEOUT) {
            console.log(`[${new Date().toISOString()}] Session expired for user ${session.userName} (ID: ${userId})`);
            
            // Release wochenplan lock if this user has it
            if (wochenplanEditLock.isLocked && wochenplanEditLock.userId === parseInt(userId)) {
                console.log(`[${new Date().toISOString()}] Releasing wochenplan lock for expired session: ${session.userName}`);
                clearTimeout(wochenplanEditLock.lockTimeout);
                wochenplanEditLock.isLocked = false;
                wochenplanEditLock.userId = null;
                wochenplanEditLock.userName = null;
                wochenplanEditLock.lockTime = null;
                wochenplanEditLock.lockTimeout = null;
            }
            
            userSessions.delete(userId);
        }
    }
}, 60000); // Check every minute

// Funktion zur "PDF"-Generierung (eigentlich HTML mit Druck-Styles)
function generateSimplePDF(htmlContent, title) {
    // Baut ein HTML-Dokument mit speziellen Druck-Styles für die PDF-Ausgabe
    const pdfContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        @page { 
            size: A4 landscape; 
            margin: 1cm; 
        }
        @media print {
            body { 
                margin: 0; 
                padding: 20px;
                font-family: Arial, sans-serif;
                font-size: 12px;
                line-height: 1.2;
            }
            .no-print { display: none !important; }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                page-break-inside: auto;
                page-break-before: auto;
            }
            thead {
                display: table-header-group;
            }
            tbody {
                display: table-row-group;
            }
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            th, td { 
                border: 2px solid #000; 
                padding: 8px 4px; 
                text-align: center; 
                vertical-align: top;
                font-size: 10px;
            }
            th { 
                background-color: #e0e0e0 !important; 
                font-weight: bold;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            .schichtkopf { 
                background-color: #f0f0f0 !important; 
                text-align: left; 
                font-weight: bold;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            .wochenende { 
                background-color: #fff3cd !important; 
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            .feiertag { 
                background-color: #f8d7da !important; 
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            .today { 
                background-color: #d4edda !important; 
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            .trennlinie {
                border-top: 3px solid #000 !important;
                margin: 6px 0 !important;
                height: 3px !important;
                background-color: #000 !important;
                display: block !important;
                width: 100% !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            .print-header {
                text-align: center;
                margin-bottom: 15px;
                border-bottom: 3px solid #000;
                padding-bottom: 10px;
                page-break-after: avoid;
                page-break-inside: avoid;
            }
            .print-header h1 {
                margin: 0;
                font-size: 24px;
                color: #000;
                font-weight: bold;
            }
            .kw-info-section {
                margin-bottom: 15px;
                padding: 15px;
                background-color: #f5f5f5 !important;
                border-radius: 8px;
                border: 2px solid #ddd;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                page-break-after: avoid;
                page-break-inside: avoid;
            }
            .kw-info-section h3 {
                margin: 0 0 10px 0;
                font-size: 16px;
                color: #000;
                font-weight: bold;
            }
            .schichtfeld-content {
                white-space: pre-wrap;
                word-wrap: break-word;
                font-size: 10px;
                line-height: 1.3;
                text-align: left;
                padding: 4px;
                color: #000;
            }
        }
        body { 
            margin: 0; 
            padding: 20px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.2;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            page-break-inside: auto;
        }
        thead {
            display: table-header-group;
        }
        tbody {
            display: table-row-group;
        }
        tr {
            page-break-inside: avoid;
        }
        th, td { 
            border: 2px solid #000; 
            padding: 8px 4px; 
            text-align: center; 
            vertical-align: top;
            font-size: 10px;
        }
        th { 
            background-color: #e0e0e0; 
            font-weight: bold;
        }
        .schichtkopf { 
            background-color: #f0f0f0; 
            text-align: left; 
            font-weight: bold;
            width: 120px;
            min-width: 120px;
        }
        .tagkopf {
            width: auto;
            min-width: 100px;
            background-color: #e0e0e0;
        }
        .kw {
            width: 80px;
            min-width: 80px;
            background-color: #e0e0e0;
        }
        .wochenende { background-color: #fff3cd; }
        .feiertag { background-color: #f8d7da; }
        .today { background-color: #d4edda; }
        .trennlinie {
            border-top: 3px solid #000;
            margin: 6px 0;
            height: 3px;
            background-color: #000;
            display: block;
            width: 100%;
        }
        .print-header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 3px solid #000;
            padding-bottom: 10px;
        }
        .print-header h1 {
            margin: 0;
            font-size: 24px;
            color: #000;
            font-weight: bold;
        }
        .kw-info-section {
            margin-bottom: 15px;
            padding: 15px;
            background-color: #f5f5f5;
            border-radius: 8px;
            border: 2px solid #ddd;
        }
        .kw-info-section h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #000;
            font-weight: bold;
        }
        .schichtfeld-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 10px;
            line-height: 1.3;
            text-align: left;
            padding: 4px;
            color: #000;
        }
        .no-print { display: block; }
    </style>
</head>
<body>
    ${htmlContent}
    <script>
        // Automatisches Drucken und Schließen des Fensters nach dem Laden
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
    return pdfContent;
}

// Funktion zur Bestimmung des Content-Types anhand der Dateiendung
function getContentType(filePath) {
    const extname = path.extname(filePath).toLowerCase(); // Holt die Dateiendung
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain'
    };
    return mimeTypes[extname] || 'application/octet-stream';
}

// --- Projektplaner Funktionen ---
// Liest die Projektplaner-Daten aus der Datei
function readProjekte() {
    try {
        const fileData = fs.readFileSync(projektplanerFile, 'utf8');
        return JSON.parse(fileData);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return []; // Gibt ein leeres Array zurück, wenn die Datei nicht gefunden wird
        } else {
            console.error("Fehler beim Lesen der Projekte:", err);
            return [];
        }
    }
}

// Schreibt die Projektplaner-Daten in die Datei
function writeProjekte(data) {
    try {
        fs.writeFileSync(projektplanerFile, JSON.stringify(data, null, 2));
        console.log("Projekte erfolgreich gespeichert!");
    } catch (err) {
        console.error("Fehler beim Schreiben der Projekte:", err);
    }
}

// --- Deep Merge Funktion ---
// Verschmilzt zwei Objekte rekursiv (für z.B. Wochenplan-Updates)
function deepMerge(target, source) {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                // If target[key] is not an object or is an array, overwrite it with an empty object
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    return target;
}

// --- Logging Funktion ---

/*
// Holt den Benutzernamen anhand der ID (für Logging)
function getUsernameById(userId) {
    if (!userId && userId !== 0) return null; // Akzeptiere ID 0, falls gültig
    try {
        const mitarbeiterListe = readMitarbeiter(); // Annahme: readMitarbeiter ist verfügbar und liest die aktuelle Mitarbeiterliste
        const user = mitarbeiterListe.find(m => m.id === parseInt(userId, 10));
        return user ? user.name : null;
    } catch (error) {
        console.error("Fehler beim Abrufen des Benutzernamens anhand der ID für das Logging:", error);
        return null;
    }
}

// Schreibt einen Log-Eintrag in die Logdatei
function logActivity(userIdentifier, origin, action, details = '') {
    const now = new Date();
    const timestamp = `[${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]`;

    let userName = userIdentifier;
    // Versuche, die ID zu einem Namen aufzulösen, wenn userIdentifier eine Zahl oder ein String ist, der nur aus Ziffern besteht
    if (typeof userIdentifier === 'number' || (typeof userIdentifier === 'string' && /^\d+$/.test(userIdentifier))) {
        userName = getUsernameById(userIdentifier) || `Benutzer-ID ${userIdentifier}`;
    }
    userName = userName || 'System'; // Fallback, falls kein Benutzer identifiziert werden konnte

    const logEntry = `${timestamp} Benutzer: ${userName} | Herkunft: ${origin} | Aktion: ${action}${details ? ' | Details: ' + details : ''}\n`;

    fs.appendFile(LOG_FILE_PATH, logEntry, (err) => {
        if (err) console.error('Fehler beim Schreiben der Log-Datei:', err);
    });
}

*/

// --- Telefonbuch Funktionen ---
// Liest das Telefonbuch aus der Datei
function readTelefonbuch() {
    try {
        const fileData = fs.readFileSync(telefonbuchFile, 'utf8');
        const parsed = JSON.parse(fileData);

        // Abw e4rtskompatibilit e4t: falls alte Struktur (nur Objekt mit Nummern) vorliegt
        if (!parsed || typeof parsed !== 'object' || parsed.telefonbuch === undefined) {
            return { telefonbuch: parsed || {}, cowarner: {} };
        }
        if (!parsed.cowarner) parsed.cowarner = {};
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { telefonbuch: {}, cowarner: {} };
        } else {
            console.error('Fehler beim Lesen des Telefonbuchs:', err);
            return { telefonbuch: {}, cowarner: {} };
        }
    }
}

// Schreibt das Telefonbuch in die Datei
function writeTelefonbuch(data) {
    try {
        // Sicherstellen, dass beide Bereiche existieren
        const payload = {
            telefonbuch: data.telefonbuch || {},
            cowarner: data.cowarner || {}
        };
        fs.writeFileSync(telefonbuchFile, JSON.stringify(payload, null, 2));
        console.log('Telefonbuch (inkl. Co-Warner) erfolgreich gespeichert!');
    } catch (err) {
        console.error('Fehler beim Schreiben des Telefonbuchs:', err);
    }
}

function appendTelefonbuchLog(entry) {
    try {
        let log = [];
        if (fs.existsSync(logTelefonbuchFile)) {
            const raw = fs.readFileSync(logTelefonbuchFile, 'utf8');
            log = raw.trim() ? JSON.parse(raw) : [];
        }
        log.push(entry);
        fs.writeFileSync(logTelefonbuchFile, JSON.stringify(log, null, 2));
    } catch (err) {
        console.error('Fehler beim Schreiben des Telefonbuch-Logs:', err);
    }
}

// --- Schwarzes Brett Funktionen ---
// Liest den Text vom Schwarzen Brett
function readSchwarzesBrett() {
    try {
        const fileData = fs.readFileSync(schwarzesBrettFile, 'utf8'); // Liest die Datei 'schwarzesbrett.json' synchron
        return JSON.parse(fileData).text; // Gibt den Text aus dem Schwarzes Brett zurück
    } catch (err) {
        if (err.code === 'ENOENT') {
            return ""; // Gibt einen leeren String zurück, wenn die Datei nicht gefunden wird
        } else {
            console.error("Fehler beim Lesen des Schwarzen Bretts:", err);
            return ""; // Gibt einen leeren String zurück, wenn ein anderer Fehler auftritt
        }
    }
}

// Schreibt den Text auf das Schwarze Brett
function writeSchwarzesBrett(text) {
    try {
        const data = { text }; // Erstellt ein Objekt mit dem übergebenen Text
        fs.writeFileSync(schwarzesBrettFile, JSON.stringify(data, null, 2)); // Speichert den Text in der Datei 'schwarzesbrett.json'
        console.log("Schwarzes Brett erfolgreich gespeichert!");
    } catch (err) {
        console.error("Fehler beim Schreiben des Schwarzen Bretts:", err); // Fehlerbehandlung bei Schreibfehlern
    }
}

// --- Mitarbeiter Funktionen ---
// Liest die Mitarbeiterdaten aus der Datei
function readMitarbeiter() {
    try {
        const fileData = fs.readFileSync(mitarbeiterFile, 'utf8'); // Liest die Datei 'mitarbeiter.json' synchron
        let mitarbeiterData = JSON.parse(fileData); // Parst die JSON-Daten

        // Stellt sicher, dass IDs Zahlen sind und das permissions-Objekt existiert (optional, da die Client-Seite Fallbacks hat)
        mitarbeiterData = mitarbeiterData.map((mitarbeiter, index) => ({
            ...mitarbeiter,
            id: mitarbeiter.id ? parseInt(mitarbeiter.id, 10) : index + 1,
            permissions: mitarbeiter.permissions || {}, // Stellt ein leeres Objekt bereit, falls es fehlt
            schicht: mitarbeiter.schicht || "" // Stellt eine Standard-Schicht bereit
        }));

        // Stellt sicher, dass alle Berechtigungs-Flags existieren und einen Standardwert haben
        mitarbeiterData = mitarbeiterData.map(mitarbeiter => {
            mitarbeiter.permissions.isAdmin = mitarbeiter.permissions.isAdmin || false;
            mitarbeiter.permissions.kannFahrtenLoeschen = mitarbeiter.permissions.kannFahrtenLoeschen || false;
            mitarbeiter.permissions.kannFahrtenBearbeiten = mitarbeiter.permissions.kannFahrtenBearbeiten || false;
            mitarbeiter.permissions.kannWochenplanBearbeiten = mitarbeiter.permissions.kannWochenplanBearbeiten || false;
            mitarbeiter.permissions.kannProjektplanerBearbeiten = mitarbeiter.permissions.kannProjektplanerBearbeiten || mitarbeiter.permissions.projektplaner || false; 
            return mitarbeiter;
        });

        return mitarbeiterData;
    } catch (err) {
        if (err.code === 'ENOENT') return []; // Gibt ein leeres Array zurück, wenn die Datei nicht gefunden wird
        console.error("Fehler beim Lesen der Mitarbeiter:", err);
        return []; // Gibt bei anderen Fehlern ebenfalls ein leeres Array zurück
    }
}

// Schreibt die Mitarbeiterdaten in die Datei
function writeMitarbeiter(data) {
    try {
        fs.writeFileSync(mitarbeiterFile, JSON.stringify(data, null, 2)); // Speichert die Mitarbeiterdaten in der Datei 'mitarbeiter.json'
        console.log("Mitarbeiter erfolgreich gespeichert!");
    } catch (err) {
        console.error("Fehler beim Schreiben der Mitarbeiter:", err); // Fehlerbehandlung bei Schreibfehlern
    }
}

// --- Fahrzeug Funktionen (Hilfsfunktionen und Datenverarbeitung) ---
// Formatiert den Fahrzeugnamen für Dateinamen
function formatFahrzeugName(fahrzeug) {
    return fahrzeug.split(' ').join('_'); // Ersetzt Leerzeichen durch Unterstriche im Fahrzeugnamen
}

// Lädt Fahrten-Daten (entweder für ein bestimmtes Fahrzeug oder alle)
function loadData(selectedFahrzeug) {
    return new Promise((resolve, reject) => {
        if (!selectedFahrzeug) {
            const fahrzeugDateien = fs.readdirSync(dataDirectory) // Liest alle Dateien im 'public' Verzeichnis
                .filter(datei => datei.startsWith('fahrzeug_') && datei.endsWith('.json')); // Filtert nach 'fahrzeug_'-Dateien

            let alleFahrten = [];
            fahrzeugDateien.forEach(datei => {
                try {
                    const filePath = path.join(dataDirectory, datei); // Ermittelt den Pfad der Datei
                    const fileData = fs.readFileSync(filePath, 'utf8'); // Liest die Datei synchron
                    const jsonData = JSON.parse(fileData); // Parst die JSON-Daten
                    alleFahrten = alleFahrten.concat(jsonData); // Fügt die Daten zu einem Array hinzu
                } catch (err) {
                    console.error(`Fehler beim Laden der Daten aus ${datei}:`, err);
                }
            });

            alleFahrten.sort((a, b) => new Date(b.datum) - new Date(a.datum)); // Sortiert die Daten nach Datum
            resolve(alleFahrten); // Gibt die zusammengefassten Fahrten zurück
        } else {
            const filename = `fahrzeug_${formatFahrzeugName(selectedFahrzeug)}.json`; // Ermittelt den Dateinamen für das ausgewählte Fahrzeug
            const filePath = path.join(dataDirectory, filename);

            fs.readFile(filePath, 'utf8', (err, fileData) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        resolve([]); // Gibt ein leeres Array zurück, wenn die Datei nicht gefunden wird
                    } else {
                        console.error("Fehler beim Lesen der Datei:", err);
                        reject("Fehler beim Laden der Daten");
                    }
                } else {
                    try {
                        const jsonData = JSON.parse(fileData); // Parst die JSON-Daten
                        jsonData.sort((a, b) => b.kilometer - a.kilometer); // Sortiert nach Kilometerstand
                        resolve(jsonData); // Gibt die Daten zurück
                    } catch (parseError) {
                        console.error("Fehler beim Parsen der JSON-Daten:", parseError);
                        reject("Fehler beim Laden der Daten");
                    }
                }
            });
        }
    });
}

// Speichert eine neue Fahrt für ein Fahrzeug
function saveData(data) {
    return new Promise((resolve, reject) => {
        const fahrzeug = data.fahrzeug;
        if (!fahrzeug) {
            reject("Fahrzeugdaten fehlen.");
            return;
        }
        const filename = `fahrzeug_${formatFahrzeugName(fahrzeug)}.json`; // Ermittelt den Dateinamen
        const filePath = path.join(dataDirectory, filename);

        fs.readFile(filePath, 'utf8', (err, fileData) => {
            let jsonData = [];
            if (!err && fileData) { // Prüfen ob fileData existiert, um leere Datei Fehler zu vermeiden
                try {
                    jsonData = JSON.parse(fileData); // Parst die vorhandenen Daten
                } catch (parseError) {
                    console.error("Fehler beim Parsen der JSON-Daten:", parseError, "Datei:", filename, "Inhalt:", fileData);
                    // Optional: jsonData als leeres Array belassen oder Fehler werfen
                    // reject("Fehler beim Speichern der Daten aufgrund von Parse-Error");
                    return;
                }
            } else if (err && err.code !== 'ENOENT') { // Fehler, der nicht "Datei nicht gefunden" ist
                console.error("Fehler beim Lesen der Datei:", err);
                reject("Fehler beim Speichern der Daten");
                return;
            }

            // Weist eine neue ID zu, indem die maximale bestehende ID ermittelt und um 1 erhöht wird
            const existingIds = jsonData.map(item => parseInt(item.id, 10)).filter(id => !isNaN(id)); // Filtere NaNs
            const newId = (existingIds.length > 0 ? Math.max(...existingIds) : 0) + 1;
            data.id = newId;

            // Validierung Kilometer: Bei neuen Einträgen muss der Kilometerstand höher als der bisherige Maximalwert sein
            if (data.kilometer !== undefined && jsonData.length > 0) {
                const newKm = Number(data.kilometer);
                const maxExistingKm = jsonData.reduce((max, item) => {
                    const km = Number(item.kilometer) || 0;
                    return km > max ? km : max;
                }, 0);

                if (!Number.isFinite(newKm) || newKm < 0) {
                    reject("Ungültiger Kilometerstand");
                    return;
                }
                
                if (newKm < maxExistingKm) {
                    reject(`Kilometerstand darf nicht unter ${maxExistingKm} fallen.`);
                    return;
                }
                
                console.log(`[DEBUG] New entry: kilometer ${newKm} is valid (max existing: ${maxExistingKm})`);
            }

            jsonData.push(data); // Fügt die neuen Daten hinzu
            jsonData.sort((a, b) => new Date(b.datum) - new Date(a.datum)); // Sortiert nach Datum

            fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), err => {
                if (err) {
                    console.error("Fehler beim Schreiben der Datei:", err);
                    reject("Fehler beim Speichern der Daten");
                } else {
                    resolve("Daten erfolgreich gespeichert!"); // Erfolgreiches Speichern
                }
            });
        });
    });
}

// --- HTTP Server ---
// Erstelle den HTTP-Server und reagiere auf Anfragen
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    let body = '';

    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

        try {
            if (req.method === 'GET' && pathname === '/api/load_telefonbuch') {
                const data = readTelefonbuch();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
                return;
            }

            if (req.method === 'POST' && (pathname === '/api/save_telefonbuch' || pathname === '/save_telefonbuch')) {
                const payload = body ? JSON.parse(body) : {};
                const existing = readTelefonbuch();

                const merged = {
                    telefonbuch: { ...existing.telefonbuch, ...(payload.telefonbuch || {}) },
                    cowarner: { ...existing.cowarner, ...(payload.cowarner || {}) }
                };

                writeTelefonbuch(merged);

                if (payload.logAction) {
                    const now = new Date();
                    appendTelefonbuchLog({
                        timestamp: now.toISOString(),
                        type: payload.logAction.entryType || payload.logAction.type || 'unknown',
                        action: payload.logAction.type || 'update',
                        key: payload.logAction.key || null,
                        userId: payload.userId || null,
                        userName: payload.logAction.userName || null
                    });
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Telefonbuch und Co-Warner gespeichert.' }));
                return;
            }

            // --- API-Routen ---
            // Jede Route behandelt eine bestimmte Funktionalität (Telefonbuch, Mitarbeiter, Fahrten, etc.)
            // Die meisten Routen prüfen Methode (GET/POST/PUT/DELETE) und Pfad
            if (req.method === 'GET' && pathname === '/load_schwarzesbrett') {
                // Lädt den Text vom "Schwarzen Brett"
                const text = readSchwarzesBrett();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text }));
            } else if (req.method === 'GET' && pathname === '/load_projekte') {
                const projekte = readProjekte();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(projekte));
            } else if (req.method === 'GET' && pathname === '/vehicles') {
                // API-Route für Fahrzeugdaten - lädt alle verfügbaren Fahrzeuge aus JSON-Dateien
                try {
                    const vehicleFiles = {
                        "LKW DH158": "fahrzeug_LKW_DH158.json",
                        "Schwarzer Peugeot": "fahrzeug_Schwarzer_Peugeot.json", 
                        "Weisser Peugeot": "fahrzeug_Weisser_Peugeot.json",
                        "VW": "fahrzeug_VW.json"
                    };
                    
                    const vehicleData = {};
                    for (const [vehicleName, fileName] of Object.entries(vehicleFiles)) {
                        try {
                            const filePath = path.join(dataDirectory, fileName);
                            if (fs.existsSync(filePath)) {
                                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                                vehicleData[vehicleName] = { 
                                    name: vehicleName === "Weisser Peugeot" ? "Weißer Peugeot DH-322" : 
                                          vehicleName === "Schwarzer Peugeot" ? "Schwarzer Peugeot DH-82" :
                                          vehicleName === "LKW DH158" ? "LKW DH-158" :
                                          vehicleName === "VW" ? "VW Caddy" : vehicleName,
                                    status: "ok",
                                    trips: data
                                };
                            }
                        } catch (error) {
                            console.error(`Fehler beim Laden von ${fileName}:`, error);
                        }
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(vehicleData));
                } catch (error) {
                    console.error('Fehler beim Laden der Fahrzeugdaten:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fehler beim Laden der Fahrzeugdaten' }));
                }
                
            } else if (req.method === 'GET' && (pathname === '/vehicle-status' || pathname === '/api/vehicle-status')) {
                // API-Route für Fahrzeugstatus - lädt Status-Informationen
                try {
                    const statusFile = path.join(dataDirectory, 'vehicle-status.json');
                    let statusData = {};
                    
                    if (fs.existsSync(statusFile)) {
                        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(statusData));
                } catch (error) {
                    console.error('Fehler beim Laden des Fahrzeugstatus:', error);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
                
            } else if (req.method === 'POST' && (pathname === '/vehicle-status' || pathname === '/api/vehicle-status')) {
                // API-Route zum Speichern des Fahrzeugstatus
                try {
                    const data = JSON.parse(body);
                    const { vehicle, status, details, userId } = data;
                    
                    const statusFile = path.join(dataDirectory, 'vehicle-status.json');
                    const historyFile = path.join(dataDirectory, 'vehicle-history.json');
                    
                    let statusData = {};
                    let historyData = [];
                    
                    if (fs.existsSync(statusFile)) {
                        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
                    }
                    
                    if (fs.existsSync(historyFile)) {
                        historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
                    }
                    
                    // Update status
                    statusData[vehicle] = {
                        status: status,
                        details: details || '',
                        lastUpdate: new Date().toISOString(),
                        updatedBy: userId
                    };
                    
                    // Add to history
                    historyData.push({
                        vehicle: vehicle,
                        status: status,
                        details: details || '',
                        timestamp: new Date().toISOString(),
                        user: userId || 'anonymous'
                    });
                    
                    // Keep only last 100 history entries
                    if (historyData.length > 100) {
                        historyData = historyData.slice(-100);
                    }
                    
                    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
                    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Status erfolgreich aktualisiert' }));
                } catch (error) {
                    console.error('Fehler beim Speichern des Fahrzeugstatus:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fehler beim Speichern des Status' }));
                }
                
            } else if (req.method === 'GET' && pathname === '/vehicle-history') {
                // API-Route für Fahrzeughistorie - lädt die Änderungshistorie
                try {
                    const historyFile = path.join(dataDirectory, 'vehicle-history.json');
                    let historyData = [];
                    
                    if (fs.existsSync(historyFile)) {
                        historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(historyData));
                } catch (error) {
                    console.error('Fehler beim Laden der Fahrzeughistorie:', error);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify([]));
                }

            } else if (req.method === 'POST' && pathname === '/save_projekte') {
                const projekte = JSON.parse(body);
                writeProjekte(projekte);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: "Projekte gespeichert!" }));
            } else if (pathname === '/wochenplan' && req.method === 'GET') {
                res.writeHead(200, {'Content-Type': 'application/json'});
                if (fs.existsSync(wochenplanDataFile)) {
                    res.end(fs.readFileSync(wochenplanDataFile, 'utf8'));
                } else {
                    res.end(JSON.stringify({})); // Sicherstellen, dass es valides JSON ist
                }
            } else if (pathname === '/wochenplan' && req.method === 'POST') {
                let newData = {};
                try {
                    newData = JSON.parse(body);
                } catch (e) {
                    res.writeHead(400, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({status:"error",msg:"Invalid JSON"}));
                    return; 
                }
                let oldData = {};
                if (fs.existsSync(wochenplanDataFile)) {
                    try {
                        const fileContent = fs.readFileSync(wochenplanDataFile, 'utf8');
                        if (fileContent.trim() === "") { // Leere Datei behandeln
                            oldData = {};
                        } else {
                            oldData = JSON.parse(fileContent);
                        }
                    } catch (e) {
                        console.error("Error reading or parsing wochenplan.json:", e);
                        oldData = {}; // Fallback auf leeres Objekt bei Fehler
                    }
                }
                const merged = deepMerge(oldData, newData);
                fs.writeFileSync(wochenplanDataFile, JSON.stringify(merged, null, 2), 'utf8');
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({status:"ok"}));
            } else if (pathname === '/schichtoptionen' && req.method === 'GET') {
                res.writeHead(200, {'Content-Type': 'application/json'});
                if (fs.existsSync(schichtoptionenFile)) {
                    res.end(fs.readFileSync(schichtoptionenFile, 'utf8'));
                } else {
                    res.end(JSON.stringify([])); // Sicherstellen, dass es valides JSON ist
                }
            } else if (pathname === '/schichtoptionen' && req.method === 'POST') {
                fs.writeFileSync(schichtoptionenFile, body, 'utf8'); // 'body' ist bereits aus dem äußeren Scope verfügbar
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({status:"ok"}));
            } else if (pathname === '/Quickbearbeitung.json' && req.method === 'GET') {
                fs.readFile(quickbearbeitungFile, (err, data) => {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify([])); // Sicherstellen, dass es valides JSON ist
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(data);
                    }
                });
            } else if (pathname === '/Quickbearbeitung.json' && req.method === 'POST') {
                fs.writeFile(quickbearbeitungFile, body, err => { // 'body' ist bereits aus dem äußeren Scope verfügbar
                    if (err) {
                        console.error("Error writing Quickbearbeitung.json:", err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Fehler beim Speichern' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                    }
                });
            } else if (req.method === 'GET' && (pathname === '/api/vacation' || pathname === '/vacation')) {
                try {
                    let data = {};
                    if (fs.existsSync(vacationFile)) {
                        const content = fs.readFileSync(vacationFile, 'utf8');
                        data = content.trim() ? JSON.parse(content) : {};
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } catch (error) {
                    console.error('Fehler beim Laden der Urlaubsdaten:', error);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({}));
                }
            } else if ((req.method === 'PUT' || req.method === 'POST') && (pathname === '/api/vacation' || pathname === '/vacation')) {
                try {
                    const payload = body ? JSON.parse(body) : {};
                    let data = {};
                    if (fs.existsSync(vacationFile)) {
                        const content = fs.readFileSync(vacationFile, 'utf8');
                        data = content.trim() ? JSON.parse(content) : {};
                    }

                    if (payload && Object.prototype.hasOwnProperty.call(payload, 'key')) {
                        const key = String(payload.key);
                        const ids = Array.isArray(payload.ids) ? payload.ids : [];
                        data[key] = Array.from(new Set(ids));
                    } else if (payload && typeof payload === 'object') {
                        data = payload;
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Ungültiger Body' }));
                        return;
                    }

                    fs.writeFileSync(vacationFile, JSON.stringify(data, null, 2), 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (error) {
                    console.error('Fehler beim Speichern der Urlaubsdaten:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fehler beim Speichern' }));
                }

            } else if (req.method === 'POST' && pathname === '/save_schwarzesbrett') {
                // Speichert neuen Text auf dem "Schwarzen Brett"
                const data = JSON.parse(body); // Erwartet { text: "...", userId: ID_DES_BENUTZERS }
                writeSchwarzesBrett(data.text);
                //logActivity(data.userId || 'System (Schwarzes Brett)', 'Schwarzes Brett', 'Text aktualisiert');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: "Schwarzes Brett gespeichert!" }));

            } else if (req.method === 'GET' && (pathname === '/api/load_telefonbuch' || pathname === '/load_telefonbuch')) {
                // Lädt das Telefonbuch
                const telefonbuch = readTelefonbuch();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(telefonbuch));

            } else if (req.method === 'POST' && (pathname === '/api/save_telefonbuch' || pathname === '/save_telefonbuch')) {
                // Speichert Daten ins Telefonbuch
                const newData = JSON.parse(body); // Erwartet { telefonbuch: {...}, userId: ID_DES_BENUTZERS, logDetails: boolean, changedNumber: string, oldName: string, newName: string }
                
                // Lade das aktuelle Telefonbuch für Vergleiche
                const currentTelefonbuch = readTelefonbuch();
                
                // Speichere das neue Telefonbuch
                writeTelefonbuch(newData.telefonbuch);
                
                // Erstelle detaillierte Log-Nachricht
                /*
                let logMessage = 'Telefonbuch gespeichert';
                let logDetails = '';
                
                if (newData.logDetails && newData.changedNumber) {
                    const nummer = newData.changedNumber;
                    const oldName = newData.oldName || currentTelefonbuch[nummer] || '';
                    const newName = newData.newName || '';
                    
                    if (newName && oldName && newName !== oldName) {
                        logDetails = `Nummer ${nummer}: "${oldName}" → "${newName}"`;
                    } else if (newName && !oldName) {
                        logDetails = `Nummer ${nummer}: Name hinzugefügt: "${newName}"`;
                    } else if (!newName && oldName) {
                        logDetails = `Nummer ${nummer}: Name entfernt: "${oldName}"`;
                    } else {
                        logDetails = `Nummer ${nummer} bearbeitet`;
                    }
                } else if (newData.logDetails) {
                    // Fallback: Vergleiche alle Nummern um Änderungen zu finden
                    const changes = [];
                    for (const nummer in newData.telefonbuch) {
                        const oldName = currentTelefonbuch[nummer] || '';
                        const newName = newData.telefonbuch[nummer] || '';
                        if (oldName !== newName) {
                            if (newName && oldName) {
                                changes.push(`${nummer}: "${oldName}" → "${newName}"`);
                            } else if (newName && !oldName) {
                                changes.push(`${nummer}: hinzugefügt "${newName}"`);
                            } else if (!newName && oldName) {
                                changes.push(`${nummer}: entfernt "${oldName}"`);
                            }
                        }
                    }
                    if (changes.length > 0) {
                        logDetails = changes.join(', ');
                    }
                }
                
                logActivity(newData.userId || 'System (Telefonbuch)', 'Telefonbuch', logMessage, logDetails);
                */
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: "Telefonbuch gespeichert!" }));

            } else if (req.method === 'POST' && pathname === '/save_mitarbeiter') {
                // Fügt einen neuen Mitarbeiter hinzu
                const newData = JSON.parse(body); // Erwartet { name, rfid, permissions, schicht, adminUserId }

                // Validiert die Eingabe
                if (!newData.name || !newData.rfid) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: "Name und RFID sind erforderlich." }));
                    return;
                }

                const existingMitarbeiter = readMitarbeiter(); // Lädt bestehende Mitarbeiterdaten
                // ID-Vergabe, falls nicht vorhanden
                if (newData.id === undefined) {
                    const existingIds = existingMitarbeiter.map(item => parseInt(item.id, 10)).filter(id => !isNaN(id));
                    newData.id = (existingIds.length > 0 ? Math.max(...existingIds) : 0) + 1;
                }
                newData.permissions = newData.permissions || { isAdmin: false, kannFahrtenLoeschen: false, kannFahrtenBearbeiten: false };
                newData.schicht = newData.schicht || "";
                existingMitarbeiter.push(newData); // Fügt den neuen Mitarbeiter hinzu
                writeMitarbeiter(existingMitarbeiter); // Speichert die aktualisierten Daten
                //logActivity(newData.adminUserId || 'Admin (Mitarbeiter erstellen, ID nicht gesendet)', 'Adminbereich', 'Mitarbeiter hinzugefügt', `Neuer Mitarbeiter: ${newData.name}, RFID: ${newData.rfid}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: "Mitarbeiterdaten gespeichert!" }));

            } else if (req.method === 'GET' && (pathname === '/load_mitarbeiter' || pathname === '/api/load_mitarbeiter')) {
                const mitarbeiter = readMitarbeiter();
                const referer = req.headers.referer; //Get the referer header
            
                if(mitarbeiter){
                    // Check the referer to see if the request came from index.js
                    if (referer && referer.includes('index.html')) {
                        res.setHeader('Set-Cookie', `loggedInUser=${mitarbeiter.id}; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 1000}`); // 1 hour, only set if referer is index.html
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(mitarbeiter));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                }

            } else if (req.method === 'DELETE' && pathname.startsWith('/delete_mitarbeiter/')) {
                // Löscht einen Mitarbeiter anhand seiner ID
                const id = parseInt(pathname.substring('/delete_mitarbeiter/'.length), 10);
                const requestData = body ? JSON.parse(body) : {}; // Erwartet { adminUserId } im Body

                try {
                    let mitarbeiter = readMitarbeiter();
                    const mitarbeiterToDelete = mitarbeiter.find(m => m.id === id);
                    const indexToDelete = mitarbeiter.findIndex(m => m.id === id);

                    if (indexToDelete === -1) { // Überprüft, ob die ID existiert
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Mitarbeiter nicht gefunden' }));
                        return;
                    }

                    mitarbeiter.splice(indexToDelete, 1); // Entfernt den Eintrag aus der Liste
                    writeMitarbeiter(mitarbeiter); // Speichert die aktualisierte Liste
                    //logActivity(requestData.adminUserId || 'Admin (Mitarbeiter löschen, ID nicht gesendet)', 'Adminbereich', 'Mitarbeiter gelöscht', `Mitarbeiter: ${mitarbeiterToDelete ? mitarbeiterToDelete.name : `ID ${id}`}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Mitarbeiter gelöscht' }));
                } catch (error) {
                    console.error("Error deleting Mitarbeiter:", error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fehler beim Löschen' }));
                }

            } else if (req.method === 'PUT' && pathname.startsWith('/update_mitarbeiter_permissions/')) {
                // Aktualisiert die Berechtigungen eines Mitarbeiters
                const userId = parseInt(pathname.substring('/update_mitarbeiter_permissions/'.length), 10);
                const data = JSON.parse(body); // Erwartet { permissions, schicht, adminUserId }

                try {
                    let mitarbeiter = readMitarbeiter();
                    const mitarbeiterIndex = mitarbeiter.findIndex(m => m.id === userId);

                    if (mitarbeiterIndex === -1) { // Überprüft, ob die ID existiert
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Mitarbeiter nicht gefunden' }));
                        return;
                    }

                    // Aktualisiert das gesamte permissions-Objekt
                    mitarbeiter[mitarbeiterIndex].permissions = data.permissions;
                    mitarbeiter[mitarbeiterIndex].schicht = data.schicht; // Schicht aktualisieren
                    writeMitarbeiter(mitarbeiter);
                    //logActivity(data.adminUserId || 'Admin (Berechtigungen, ID nicht gesendet)', 'Adminbereich', 'Mitarbeiterberechtigungen aktualisiert', `Mitarbeiter-ID: ${userId}, Permissions: ${JSON.stringify(data.permissions)}, Schicht: ${data.schicht}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Berechtigungen erfolgreich aktualisiert' }));
                } catch (error) {
                    console.error("Error updating Mitarbeiter permissions:", error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fehler beim Aktualisieren der Berechtigungen' }));
                }
            
            } else if (req.method === 'GET' && pathname.startsWith('/get_user_permissions/')) { // Diese Route wird nicht mehr aktiv genutzt, kann entfernt oder überarbeitet werden.
                const userId = parseInt(pathname.substring('/get_user_permissions/'.length), 10);
                const user = readMitarbeiter().find(u => u.id === userId); // find the user in your mitarbeiter array
                if (user) {
                  res.writeHead(200, {'Content-Type': 'application/json'});
                  res.end(JSON.stringify({ delete_entries: user.berechtigung >= 3 })); //Example permission check. Adjust as needed.
                } else {
                  res.writeHead(404, {'Content-Type': 'application/json'});
                  res.end(JSON.stringify({error: 'User not found'}));
                }
                
            } else if (req.method === 'GET' && (pathname === '/load_data' || pathname === '/api/load_data')) {
                // Lädt Fahrzeugdaten basierend auf dem Namen des Fahrzeugs
                const selectedFahrzeug = parsedUrl.query.fahrzeug;
                const data = await loadData(selectedFahrzeug);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));

            } else if (req.method === 'DELETE' && (pathname.startsWith('/delete_fahrt/') || pathname.startsWith('/api/delete_fahrt/'))) {
                // Löscht eine Fahrt aus den Fahrzeugdaten
                const fahrzeugName = pathname.startsWith('/api/delete_fahrt/') ? 
                    pathname.substring('/api/delete_fahrt/'.length) : 
                    pathname.substring('/delete_fahrt/'.length);
                const idToDelete = parseInt(parsedUrl.query.id, 10);
                const adminUserId = parsedUrl.query.adminUserId; // Für Logging, kommt vom Client (tabelle.js)
                const filename = `fahrzeug_${fahrzeugName}.json`;
                const filePath = path.join(dataDirectory, filename);

                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        console.error("Error reading file:", err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Fehler beim Lesen der Datei: ' + err.message }));
                        return;
                    }

                    try {
                        let jsonData = JSON.parse(data);
                        jsonData = jsonData.filter(item => parseInt(item.id, 10) !== idToDelete);

                        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), err => {
                            if (err) {
                                console.error("Error writing file:", err);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Fehler beim Schreiben der Datei: ' + err.message }));
                            } else {
                                //logActivity(adminUserId || 'Admin (Fahrt löschen, ID nicht gesendet)', 'Fahrtenbuch Tabelle', 'Fahrt gelöscht', `Fahrzeugdatei: ${filename}, ID: ${idToDelete}`);
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Eintrag erfolgreich gelöscht' }));
                            }
                        });
                    } catch (error) {
                        console.error("Error parsing or processing JSON data:", error);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Fehler beim Verarbeiten der Daten: ' + error.message }));
                    }
                });

            } else if (req.method === 'PUT' && pathname === '/api/test') {
                // Test route to verify server is working
                console.log('[DEBUG] Test route hit successfully');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Test route working' }));

            } else if (req.method === 'PUT' && (pathname.startsWith('/api/update_fahrt/') || pathname.startsWith('/update_fahrt/') || pathname.includes('update_fahrt'))) {
                // Aktualisiert die Daten einer Fahrt – nur der neueste Eintrag pro Fahrzeug darf bearbeitet werden
                console.log(`[DEBUG] Handling update_fahrt request: ${pathname}`);
                
                let fahrzeugNameRaw;
                if (pathname.startsWith('/api/update_fahrt/')) {
                    fahrzeugNameRaw = pathname.substring('/api/update_fahrt/'.length);
                } else if (pathname.startsWith('/update_fahrt/')) {
                    fahrzeugNameRaw = pathname.substring('/update_fahrt/'.length);
                } else {
                    // Handle any other variation
                    const parts = pathname.split('/');
                    const updateIndex = parts.findIndex(part => part === 'update_fahrt');
                    if (updateIndex !== -1 && updateIndex < parts.length - 1) {
                        fahrzeugNameRaw = parts[updateIndex + 1];
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid path format' }));
                        return;
                    }
                }
                
                console.log(`[DEBUG] Raw fahrzeug name: ${fahrzeugNameRaw}`);
                const fahrzeugName = decodeURIComponent(fahrzeugNameRaw)
                    .replace(/^fahrzeug_/, '')
                    .replace(/\.json$/i, '');
                console.log(`[DEBUG] Processed fahrzeug name: ${fahrzeugName}`);

                const idToUpdate = parseInt(parsedUrl.query.id, 10);
                const userId = parsedUrl.query.userId; // optional für Logging

                if (!Number.isFinite(idToUpdate)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Ungültige ID' }));
                    return;
                }

                const filename = `fahrzeug_${fahrzeugName}.json`;
                const filePath = path.join(dataDirectory, filename);
                console.log(`[DEBUG] Constructed filename: ${filename}`);
                console.log(`[DEBUG] Full file path: ${filePath}`);

                let payload = {};
                try {
                    payload = body ? JSON.parse(body) : {};
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Ungültiger JSON-Body' }));
                    return;
                }

                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        if (err.code === 'ENOENT') {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Fahrzeugdatei nicht gefunden' }));
                        } else {
                            console.error('Fehler beim Lesen der Datei:', err);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Fehler beim Lesen der Datei' }));
                        }
                        return;
                    }

                    try {
                        const jsonData = JSON.parse(data);
                        const index = jsonData.findIndex(item => parseInt(item.id, 10) === idToUpdate);
                        if (index === -1) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Eintrag nicht gefunden' }));
                            return;
                        }

                        // Prüfen, ob dies der neueste Eintrag (nach Datum) ist
                        let latestEntry = null;
                        for (const item of jsonData) {
                            if (!latestEntry) {
                                latestEntry = item;
                            } else {
                                const dItem = new Date(item.datum);
                                const dLatest = new Date(latestEntry.datum);
                                if (dItem > dLatest) latestEntry = item;
                            }
                        }

                        if (!latestEntry || parseInt(latestEntry.id, 10) !== idToUpdate) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Nur der neueste Eintrag darf bearbeitet werden.' }));
                            return;
                        }

                        // Validierung Kilometer: Beim Bearbeiten des neuesten Eintrags nur grundlegende Validierung
                        if (payload.kilometer !== undefined) {
                            const newKm = Number(payload.kilometer);
                            if (!Number.isFinite(newKm) || newKm < 0) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Ungültiger Kilometerstand' }));
                                return;
                            }
                            // Beim Bearbeiten erlauben wir jeden gültigen Kilometerstand (auch niedrigere Werte)
                            console.log(`[DEBUG] Updating kilometer from ${jsonData[index].kilometer} to ${newKm} for latest entry (editing mode)`);
                        }

                        // Erlaubte Felder aktualisieren
                        const allowed = ['fahrer', 'kilometer', 'ort', 'anmerkung'];
                        for (const key of allowed) {
                            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                                jsonData[index][key] = payload[key];
                            }
                        }

                        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (wErr) => {
                            if (wErr) {
                                console.error('Fehler beim Schreiben der Datei:', wErr);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Fehler beim Speichern' }));
                                return;
                            }

                            //logActivity(userId || 'Benutzer (Fahrt bearbeiten, ID nicht gesendet)', 'Fahrtenbuch Tabelle', 'Fahrt bearbeitet', `Fahrzeugdatei: ${filename}, ID: ${idToUpdate}`);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, message: 'Eintrag aktualisiert' }));
                        });
                    } catch (parseErr) {
                        console.error('Fehler beim Verarbeiten/Parsing:', parseErr);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Fehler beim Verarbeiten der Datei' }));
                    }
                });

            } else if (req.method === 'POST' && pathname === '/save_data') {
                // Speichert Daten (allgemein)
                const data = JSON.parse(body); // Enthält { datum, fahrzeug, fahrer, kilometer, ort, anmerkung }
                const message = await saveData(data);
                //logActivity(data.fahrer, 'Fahrtenbuch (Formular)', 'Fahrt hinzugefügt', `Fahrzeug: ${data.fahrzeug}, Kilometer: ${data.kilometer}, Ort: ${data.ort}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: message }));

            } else if (req.method === 'POST' && (pathname === '/log_login' || pathname === '/api/log_login')) {
                // Loggt einen Benutzer-Login
                const data = JSON.parse(body); // Erwartet { userId: ID_DES_BENUTZERS }
                //logActivity(data.userId, 'Authentifizierung', 'angemeldet');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: "Login geloggt" }));

            } else if (req.method === 'POST' && (pathname === '/log_logout' || pathname === '/api/log_logout')) {
                // Loggt einen Benutzer-Logout
                const data = JSON.parse(body); // Erwartet { userId: ID_DES_BENUTZERS }
                
                // Gebe automatisch die Bearbeitungssperre frei wenn der Benutzer sich abmeldet
                if (wochenplanEditLock.isLocked && wochenplanEditLock.userId === data.userId) {
                    console.log(`[${new Date().toISOString()}] Automatically releasing edit lock for logged out user ${data.userId}`);
                    clearTimeout(wochenplanEditLock.lockTimeout);
                    wochenplanEditLock.isLocked = false;
                    wochenplanEditLock.userId = null;
                    wochenplanEditLock.userName = null;
                    wochenplanEditLock.lockTime = null;
                    wochenplanEditLock.lockTimeout = null;
                }
                
                //logActivity(data.userId, 'Authentifizierung', 'abgemeldet');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: "Logout geloggt" }));

            } /* else if (req.method === 'GET' && pathname === '/activities') {
                // Lädt Activity Logs für die Admin Übersicht
                try {
                    if (!fs.existsSync(LOG_FILE_PATH)) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify([]));
                        return;
                    }

                    const logData = fs.readFileSync(LOG_FILE_PATH, 'utf8');
                    const lines = logData.split('\n').filter(line => line.trim() !== '');
                    
                    const activities = lines.map(line => {
                        const match = line.match(/^\[([^\]]+)\] Benutzer: ([^|]+) \| Herkunft: ([^|]+) \| Aktion: ([^|]+)(?:\s*\|\s*Details:\s*(.+))?$/);
                        if (match) {
                            return {
                                timestamp: match[1].trim(),
                                user: match[2].trim(),
                                source: match[3].trim(),
                                action: match[4].trim(),
                                details: match[5] ? match[5].trim() : ''
                            };
                        }
                        return null;
                    }).filter(activity => activity !== null);

                    // Sortiere nach Zeitstempel (neueste zuerst)
                    activities.reverse();

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(activities));
                } catch (error) {
                    console.error("Fehler beim Laden der Activity Logs:", error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fehler beim Laden der Logs' }));
                } 

            } */else if (req.method === 'POST' && pathname === '/generate-pdf') {
                // PDF-Generierung Route
                try {
                    const data = JSON.parse(body);
                    const { htmlContent, filename } = data;
                    
                    if (!htmlContent || !filename) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'HTML-Inhalt und Dateiname sind erforderlich' }));
                        return;
                    }
                    
                    // Generiere PDF-optimierten HTML-Inhalt
                    const pdfContent = generateSimplePDF(htmlContent, filename);
                    
                    // Erstelle Downloads-Ordner falls nicht vorhanden
                    const downloadsDir = path.join(__dirname, 'downloads');
                    if (!fs.existsSync(downloadsDir)) {
                        fs.mkdirSync(downloadsDir, { recursive: true });
                    }
                    
                    // Speichere die PDF-HTML-Datei
                    const pdfFilePath = path.join(downloadsDir, `${filename}.html`);
                    fs.writeFileSync(pdfFilePath, pdfContent, 'utf8');
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true, 
                        message: 'PDF erfolgreich erstellt',
                        downloadUrl: `/downloads/${filename}.html`
                    }));
                    
                } catch (error) {
                    console.error('Fehler bei PDF-Generierung:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Fehler bei der PDF-Generierung' 
                    }));
                }

            } else if (req.method === 'GET' && pathname === '/wochenplan-lock-status') {
                // Gibt den aktuellen Bearbeitungsstatus zurück
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    isLocked: wochenplanEditLock.isLocked,
                    userId: wochenplanEditLock.userId,
                    userName: wochenplanEditLock.userName,
                    lockTime: wochenplanEditLock.lockTime
                }));

            } else if (req.method === 'POST' && pathname === '/wochenplan-lock') {
                // Versucht, eine Bearbeitungssperre zu erhalten
                const data = JSON.parse(body);
                const { userId, userName } = data;

                if (!userId || !userName) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Benutzer-ID und Name sind erforderlich' }));
                    return;
                }

                // === NEU: Session-Timeout-Check ===
                if (wochenplanEditLock.isLocked && wochenplanEditLock.lockTime) {
                    const now = Date.now();
                    if (now - wochenplanEditLock.lockTime > SESSION_TIMEOUT) {
                        // Lock ist abgelaufen, automatisch freigeben
                        clearTimeout(wochenplanEditLock.lockTimeout);
                        wochenplanEditLock.isLocked = false;
                        wochenplanEditLock.userId = null;
                        wochenplanEditLock.userName = null;
                        wochenplanEditLock.lockTime = null;
                        wochenplanEditLock.lockTimeout = null;
                        console.log(`[${new Date().toISOString()}] Wochenplan-Lock automatisch wegen Inaktivität freigegeben.`);
                    }
                }

                // Prüfe, ob bereits gesperrt
                if (wochenplanEditLock.isLocked) {
                    if (wochenplanEditLock.userId === userId) {
                        // Gleicher Benutzer - erneuere die Sperre
                        clearTimeout(wochenplanEditLock.lockTimeout);
                        wochenplanEditLock.lockTime = Date.now();
                        wochenplanEditLock.lockTimeout = setTimeout(() => {
                            wochenplanEditLock.isLocked = false;
                            wochenplanEditLock.userId = null;
                            wochenplanEditLock.userName = null;
                            wochenplanEditLock.lockTime = null;
                            wochenplanEditLock.lockTimeout = null;
                        }, LOCK_TIMEOUT);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Sperre erneuert' }));
                    } else {
                        // Anderer Benutzer - Sperre verweigern
                        res.writeHead(409, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            message: `Wochenplan wird bereits von ${wochenplanEditLock.userName} bearbeitet`,
                            lockedBy: wochenplanEditLock.userName
                        }));
                    }
                } else {
                    // Keine Sperre - neue Sperre erstellen
                    wochenplanEditLock.isLocked = true;
                    wochenplanEditLock.userId = userId;
                    wochenplanEditLock.userName = userName;
                    wochenplanEditLock.lockTime = Date.now();
                    wochenplanEditLock.lockTimeout = setTimeout(() => {
                        wochenplanEditLock.isLocked = false;
                        wochenplanEditLock.userId = null;
                        wochenplanEditLock.userName = null;
                        wochenplanEditLock.lockTime = null;
                        wochenplanEditLock.lockTimeout = null;
                    }, LOCK_TIMEOUT);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Sperre erhalten' }));
                }

            } else if (req.method === 'POST' && pathname === '/wochenplan-unlock') {
                // Gibt die Bearbeitungssperre frei
                const data = JSON.parse(body);
                const { userId, userName } = data;

                if (wochenplanEditLock.isLocked && wochenplanEditLock.userId === userId) {
                    clearTimeout(wochenplanEditLock.lockTimeout);
                    wochenplanEditLock.isLocked = false;
                    wochenplanEditLock.userId = null;
                    wochenplanEditLock.userName = null;
                    wochenplanEditLock.lockTime = null;
                    wochenplanEditLock.lockTimeout = null;
                    
                    //logActivity(userId, 'Wochenplan', 'Bearbeitung beendet', `Benutzer ${userName} hat die Bearbeitung des Wochenplans beendet`);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Sperre freigegeben' }));
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Keine Berechtigung zum Freigeben der Sperre' }));
                }

            } else if (req.method === 'GET' && pathname === '/api/wochenplan-lock-status') {
                // Gibt den aktuellen Bearbeitungsstatus zurück
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    isLocked: wochenplanEditLock.isLocked,
                    userId: wochenplanEditLock.userId,
                    userName: wochenplanEditLock.userName,
                    lockTime: wochenplanEditLock.lockTime
                }));

            } else if (req.method === 'POST' && pathname === '/api/wochenplan-lock') {
                // Versucht, eine Bearbeitungssperre zu erhalten
                const data = JSON.parse(body);
                const { userId, userName } = data;

                if (!userId || !userName) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Benutzer-ID und Name sind erforderlich' }));
                    return;
                }

                // === NEU: Session-Timeout-Check ===
                if (wochenplanEditLock.isLocked && wochenplanEditLock.lockTime) {
                    const now = Date.now();
                    if (now - wochenplanEditLock.lockTime > SESSION_TIMEOUT) {
                        // Lock ist abgelaufen, automatisch freigeben
                        clearTimeout(wochenplanEditLock.lockTimeout);
                        wochenplanEditLock.isLocked = false;
                        wochenplanEditLock.userId = null;
                        wochenplanEditLock.userName = null;
                        wochenplanEditLock.lockTime = null;
                        wochenplanEditLock.lockTimeout = null;
                        console.log(`[${new Date().toISOString()}] Wochenplan-Lock automatisch wegen Inaktivität freigegeben.`);
                    }
                }

                // Prüfe, ob bereits gesperrt
                if (wochenplanEditLock.isLocked) {
                    if (wochenplanEditLock.userId === userId) {
                        // Gleicher Benutzer - erneuere die Sperre
                        clearTimeout(wochenplanEditLock.lockTimeout);
                        wochenplanEditLock.lockTime = Date.now();
                        wochenplanEditLock.lockTimeout = setTimeout(() => {
                            wochenplanEditLock.isLocked = false;
                            wochenplanEditLock.userId = null;
                            wochenplanEditLock.userName = null;
                            wochenplanEditLock.lockTime = null;
                            wochenplanEditLock.lockTimeout = null;
                        }, LOCK_TIMEOUT);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Sperre erneuert' }));
                    } else {
                        // Anderer Benutzer - Sperre verweigern
                        res.writeHead(409, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            message: `Wochenplan wird bereits von ${wochenplanEditLock.userName} bearbeitet`,
                            lockedBy: wochenplanEditLock.userName
                        }));
                    }
                } else {
                    // Keine Sperre - neue Sperre erstellen
                    wochenplanEditLock.isLocked = true;
                    wochenplanEditLock.userId = userId;
                    wochenplanEditLock.userName = userName;
                    wochenplanEditLock.lockTime = Date.now();
                    wochenplanEditLock.lockTimeout = setTimeout(() => {
                        wochenplanEditLock.isLocked = false;
                        wochenplanEditLock.userId = null;
                        wochenplanEditLock.userName = null;
                        wochenplanEditLock.lockTime = null;
                        wochenplanEditLock.lockTimeout = null;
                    }, LOCK_TIMEOUT);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Sperre erhalten' }));
                }

            } else if (req.method === 'POST' && pathname === '/api/wochenplan-unlock') {
                // Gibt die Bearbeitungssperre frei
                const data = JSON.parse(body);
                const { userId, userName } = data;

                if (wochenplanEditLock.isLocked && wochenplanEditLock.userId === userId) {
                    clearTimeout(wochenplanEditLock.lockTimeout);
                    wochenplanEditLock.isLocked = false;
                    wochenplanEditLock.userId = null;
                    wochenplanEditLock.userName = null;
                    wochenplanEditLock.lockTime = null;
                    wochenplanEditLock.lockTimeout = null;
                    
                    //logActivity(userId, 'Wochenplan', 'Bearbeitung beendet', `Benutzer ${userName} hat die Bearbeitung des Wochenplans beendet`);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Sperre freigegeben' }));
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Keine Berechtigung zum Freigeben der Sperre' }));
                }

            } else if (req.method === 'POST' && pathname === '/session-heartbeat') {
                // User session heartbeat to track active sessions
                const data = JSON.parse(body);
                const { userId, userName } = data;

                if (userId && userName) {
                    userSessions.set(userId.toString(), {
                        lastHeartbeat: Date.now(),
                        userName: userName
                    });
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Heartbeat received' }));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'UserId and userName required' }));
                }

            } else if (req.method === 'GET' && pathname === '/session-status') {
                // Check if user session is still valid
                const userId = parsedUrl.query.userId;
                
                if (userId && userSessions.has(userId)) {
                    const session = userSessions.get(userId);
                    const now = Date.now();
                    
                    if (now - session.lastHeartbeat <= SESSION_HEARTBEAT_TIMEOUT) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            isValid: true, 
                            lastHeartbeat: session.lastHeartbeat,
                            userName: session.userName 
                        }));
                    } else {
                        // Session expired
                        userSessions.delete(userId);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ isValid: false, reason: 'Session expired' }));
                    }
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ isValid: false, reason: 'Session not found' }));
                }

            } else if (req.method === 'GET' && pathname.startsWith('/downloads/')) {
                // Statische Downloads-Route
                const downloadFile = pathname.substring('/downloads/'.length);
                const downloadPath = path.join(__dirname, 'downloads', downloadFile);
                
                // Sicherheitscheck
                if (!downloadPath.startsWith(path.join(__dirname, 'downloads'))) {
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('Forbidden');
                    return;
                }
                
                fs.readFile(downloadPath, (err, data) => {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('File not found');
                    } else {
                        res.writeHead(200, { 'Content-Type': getContentType(downloadPath) });
                        res.end(data);
                    }
                });

            } else if (req.method === 'GET' && pathname.startsWith('/')) {
                // Liefert statische Dateien aus dem "public"-Ordner
                let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
                // Sicherheitscheck: Verhindere Path Traversal
                if (!filePath.startsWith(path.join(__dirname, 'public'))) {
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('Forbidden');
                    return;
                }


                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        if (err.code === 'ENOENT') {
                            // Wenn die Datei nicht gefunden wird, versuche es mit .html am Ende (für saubere URLs)
                            fs.readFile(filePath + '.html', (err2, data2) => {
                                if (err2) {
                                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                                    res.end('File not found');
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'text/html' });
                                    res.end(data2);
                                }
                            });
                        } else {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end('Internal server error');
                        }
                    } else {
                        res.writeHead(200, { 'Content-Type': getContentType(filePath) });
                        res.end(data);
                    }
                });
            } else {
                // Debug: Log all unmatched requests
                if (req.method === 'PUT') {
                    console.log(`[DEBUG] Unmatched PUT request: ${pathname}`);
                    console.log(`[DEBUG] Request headers:`, req.headers);
                }
                
                // Gibt eine 404-Fehlermeldung zurück, wenn keine Route gefunden wurde
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found', message: `The requested URL ${pathname} was not found on this server.` }));
            }
        } catch (error) {
            // Allgemeiner Fehler-Handler für alle Anfragen
            console.error("Error handling request:", error, "Path:", pathname, "Method:", req.method);
            // Sende keine JSON-Antwort, wenn Header bereits gesendet wurden
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Server error' }));
            } else {
                res.end(); // Schließe die Verbindung, wenn Header bereits gesendet wurden
            }
        }
    });

});

// Starte den Server und gib die URL auf der Konsole aus
server.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}/`);
});
