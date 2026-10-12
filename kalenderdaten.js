// Saarländische Ferien 2025-2029
const ferien = [
    // 2025
    { von: "2025-02-24", bis: "2025-02-28" }, // Winter
    { von: "2025-04-14", bis: "2025-04-25" }, // Ostern
    { von: "2025-06-10", bis: "2025-06-13" }, // Pfingsten
    { von: "2025-07-07", bis: "2025-08-15" }, // Sommer
    { von: "2025-10-20", bis: "2025-10-31" }, // Herbst
    { von: "2025-12-22", bis: "2026-01-02" }, // Weihnachten
    // 2026
    { von: "2026-02-16", bis: "2026-02-20" },
    { von: "2026-03-30", bis: "2026-04-10" },
    { von: "2026-05-26", bis: "2026-05-29" },
    { von: "2026-07-06", bis: "2026-08-14" },
    { von: "2026-10-12", bis: "2026-10-23" },
    { von: "2026-12-21", bis: "2027-01-01" },
    // 2027
    { von: "2027-02-08", bis: "2027-02-12" },
    { von: "2027-03-29", bis: "2027-04-09" },
    { von: "2027-05-18", bis: "2027-05-21" },
    { von: "2027-07-05", bis: "2027-08-13" },
    { von: "2027-10-18", bis: "2027-10-29" },
    { von: "2027-12-23", bis: "2028-01-03" },
    // 2028
    { von: "2028-02-28", bis: "2028-03-03" },
    { von: "2028-04-10", bis: "2028-04-21" },
    { von: "2028-06-06", bis: "2028-06-09" },
    { von: "2028-07-03", bis: "2028-08-11" },
    { von: "2028-10-02", bis: "2028-10-13" },
    { von: "2028-12-21", bis: "2029-01-02" },
    // 2029
    { von: "2029-02-12", bis: "2029-02-16" },
    { von: "2029-03-26", bis: "2029-04-06" },
    { von: "2029-05-22", bis: "2029-05-25" },
    { von: "2029-07-02", bis: "2029-08-10" },
    { von: "2029-10-15", bis: "2029-10-26" },
    { von: "2029-12-24", bis: "2030-01-04" }
];

// --- Feste Feiertage (monat: 0-basiert, tag: 1-basiert) ---
const festeFeiertage = [
    { monat: 0, tag: 1, name: "Neujahr" },
    { monat: 0, tag: 6, name: "Heilige Drei Könige" },
    { monat: 4, tag: 1, name: "Tag der Arbeit" },
    { monat: 7, tag: 15, name: "Mariä Himmelfahrt" },
    { monat: 9, tag: 3, name: "Tag der Deutschen Einheit" },
    { monat: 10, tag: 1, name: "Allerheiligen" },
    { monat: 11, tag: 25, name: "1. Weihnachtstag" },
    { monat: 11, tag: 26, name: "2. Weihnachtstag" }
];

// --- Bewegliche Feiertage werden dynamisch berechnet ---
function berechneBeweglicheFeiertage(jahr) {
    // Ostersonntag nach Gauß (Wikipedia, robust für alle Jahre)
    function getOstersonntag(y) {
        const a = y % 19;
        const b = Math.floor(y / 100);
        const c = y % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const n = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April (1-basiert!)
        const p = (h + l - 7 * m + 114) % 31 + 1;         // Tag (1-basiert)
        return new Date(y, n - 1, p); // JavaScript: Monat 0-basiert!
    }
    const ostersonntag = getOstersonntag(jahr);
    // Liefere wie bei festen Feiertagen: {jahr, monat, tag, name}
    function feiertag(name, offset) {
        const d = new Date(ostersonntag);
        d.setDate(d.getDate() + offset);
        return { jahr: d.getFullYear(), monat: d.getMonth(), tag: d.getDate(), name };
    }
    return [
        feiertag("Karfreitag", -2),
        feiertag("Ostersonntag", 0),
        feiertag("Ostermontag", 1),
        feiertag("Christi Himmelfahrt", 39),
        feiertag("Pfingstsonntag", 49),
        feiertag("Pfingstmontag", 50),
        feiertag("Fronleichnam", 60)
    ];
}

// Feiertage aus Einstellungen laden (fest + beweglich für das Jahr)
function getSelectedFeiertage(jahr) {
    if (!jahr) jahr = new Date().getFullYear();
    const alle = [...festeFeiertage, ...berechneBeweglicheFeiertage(jahr)];
    const selected = JSON.parse(localStorage.getItem('feiertage')) || alle.map(f=>f.name);
    return alle.filter(f => selected.includes(f.name));
}

// Ferien- und Feiertags-Check
function istFerienTag(date) {
    const d = date.toISOString().slice(0,10);
    return ferien.some(f => d >= f.von && d <= f.bis);
}
function istFeiertag(date) {
    return getSelectedFeiertage(date.getFullYear()).some(f =>
        f.monat === date.getMonth() && f.tag === date.getDate() && (!f.jahr || f.jahr === date.getFullYear())
    );
}
function getFeiertagsName(date) {
    const f = getSelectedFeiertage(date.getFullYear()).find(f =>
        f.monat === date.getMonth() && f.tag === date.getDate() && (!f.jahr || f.jahr === date.getFullYear())
    );
    return f ? f.name : "";
}

// Schicht-Helper
function getShiftKey(year, kw, dayIndex, shift) {
    return `shift_${year}_${kw}_${dayIndex}_${shift}`;
}
function saveShift(year, kw, dayIndex, shift, value) {
    localStorage.setItem(getShiftKey(year, kw, dayIndex, shift), value);
}
function loadShift(year, kw, dayIndex, shift) {
    return localStorage.getItem(getShiftKey(year, kw, dayIndex, shift)) || "";
}

// --- Test: Ausgabe der beweglichen Feiertage für die nächsten 4 Jahre ---
function testBeweglicheFeiertage() {
    for (let jahr = 2026; jahr <= 2026; jahr++) {
        const feiertage = berechneBeweglicheFeiertage(jahr);
        //console.log(`Jahr: ${jahr}`);
        feiertage.forEach(f => {
            // Korrekte Rekonstruktion des Datums aus {jahr, monat, tag}
            const d = new Date(f.jahr, f.monat, f.tag);
            const wochentag = d.toLocaleDateString('de-DE', { weekday: 'long' });
            //console.log(`${f.name}: ${d.toLocaleDateString('de-DE')} (${wochentag})`);
        });
        console.log('---');
    }
}
testBeweglicheFeiertage();