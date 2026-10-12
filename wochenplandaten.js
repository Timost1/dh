window.wochenplanDaten = {}; // year -> kw -> dayIndex -> shiftKey

// Daten vom Server laden
async function ladeWochenplan() {
    const res = await fetch('/api/wochenplan');
    window.wochenplanDaten = await res.json() || {};
    return window.wochenplanDaten;
}

// Daten zum Server speichern (überschreibt die Datei!)
async function speichereWochenplan() {
    await fetch('/api/wochenplan', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(window.wochenplanDaten, null, 2) // <-- schön formatiert!
    });
}

// Speichert einen Schichtwert
function saveShift(year, kw, dayIndex, shift, value) {
    if (!window.wochenplanDaten[year]) window.wochenplanDaten[year] = {};
    if (!window.wochenplanDaten[year][kw]) window.wochenplanDaten[year][kw] = {};
    if (!window.wochenplanDaten[year][kw][dayIndex]) window.wochenplanDaten[year][kw][dayIndex] = {};
    window.wochenplanDaten[year][kw][dayIndex][shift] = value;
    // Entfernt: automatisches speichern - wird jetzt durch das Live-Update System verwaltet
}

// Lädt einen Schichtwert
function loadShift(year, kw, dayIndex, shift) {
    return (
        window.wochenplanDaten?.[year]?.[kw]?.[dayIndex]?.[shift] || ""
    );
}

// Speichert die KW-Info für eine Woche
function saveKwInfo(year, kw, value) {
    if (!window.wochenplanDaten[year]) window.wochenplanDaten[year] = {};
    if (!window.wochenplanDaten[year][kw]) window.wochenplanDaten[year][kw] = {};
    window.wochenplanDaten[year][kw].kwinfo = value;
    // Entfernt: automatisches speichern - wird jetzt durch das Live-Update System verwaltet
}

// Lädt die KW-Info für eine Woche
function loadKwInfo(year, kw) {
    return window.wochenplanDaten?.[year]?.[kw]?.kwinfo || "";
}