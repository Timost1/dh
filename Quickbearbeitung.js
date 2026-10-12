// Quickbearbeitung.js: Quicktexte asynchron aus JSON laden/speichern
async function ladeQuickTexte() {
    const res = await fetch('/api/Quickbearbeitung.json?_=' + Date.now());
    if (!res.ok) return [];
    return await res.json();
}
async function speichereQuickTexte(arr) {
    await fetch('/api/Quickbearbeitung.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arr, null, 2)
    });
}
