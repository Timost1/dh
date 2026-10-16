(() => {
    'use strict';

    // --- Konstanten ---
    const API = 'api.php';
    const SCHICHTEN = [
        { key: 'frueh', name: 'Frühschicht' },
        { key: 'mittag', name: 'Mittagsschicht' },
        { key: 'nacht', name: 'Nachtschicht' },
    ];
    const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    // Schichtbeginn in vollen Stunden (wie auf der Startseite): markiert die laufende Schicht
    const SCHICHTBEGINN = { frueh: 6, mittag: 14, nacht: 22 };

    const ABGLEICH_MS = 4000;        // so oft werden Änderungen der anderen geholt
    const LEBENSZEICHEN_MS = 10000;  // so oft wird die eigene Feld-Sperre verlängert (verfällt serverseitig nach 30 s)
    const MAX_VORSCHLAEGE = 6;

    // Alle Felder einer Woche in Tab-Reihenfolge: KW-Info, dann Schicht für Schicht von Montag bis Sonntag
    const FELDER = ['kwinfo', ...SCHICHTEN.flatMap((s) => TAGE.map((_, tag) => `${tag}:${s.key}`))];

    const state = {
        user: null,
        darf: false,           // darf der angemeldete Benutzer bearbeiten?
        jahr: 0,
        kw: 0,
        montag: null,          // Montag der angezeigten Woche
        felder: {},            // feld -> { inhalt, version, von, am }
        sperren: {},           // feld -> { user_id, name } (wer bearbeitet gerade was)
        stand: '',             // Fingerabdruck des zuletzt geladenen Stands
        geladen: false,
        edit: null,            // laufende Bearbeitung
        bausteine: [],
        bausteineGeladen: false,
        vorschlaege: null,     // häufige Zeilen früherer Wochen (einmal je Seitenaufruf geladen)
        autofill: null,        // geöffnete Vorschlagsliste
        bausteinDialog: null,
    };

    // --- DOM-Helfer ---
    const $ = (id) => document.getElementById(id);

    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (value === null || value === undefined || value === false) continue;
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else if (value === true) node.setAttribute(key, '');
            else node.setAttribute(key, value);
        }
        for (const child of children.flat()) {
            if (child === null || child === undefined || child === false) continue;
            node.append(child.nodeType ? child : document.createTextNode(String(child)));
        }
        return node;
    }

    function icon(name, cls = '') {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', ('ic ' + cls).trim());
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(ns, 'use');
        use.setAttribute('href', '#i-' + name);
        svg.append(use);
        return svg;
    }

    // Wie replaceChildren, überspringt aber leere Einträge
    function setChildren(node, ...children) {
        node.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
    }

    function showError(id, text) {
        const box = $(id);
        box.textContent = text || '';
        box.hidden = !text;
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // --- Server ---
    async function api(action, payload = {}) {
        let res;
        try {
            res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action, ...payload }),
            });
        } catch (err) {
            return { success: false, error: 'Keine Verbindung zum Server.', offline: true };
        }
        let result;
        try {
            result = await res.json();
        } catch (err) {
            return { success: false, error: 'Ungültige Antwort vom Server.' };
        }
        // Sitzung abgelaufen oder in einem anderen Modul abgemeldet
        if (result.code === 'auth' && state.user) setUser(null);
        return result;
    }

    // --- Datum ---
    const fmtDatum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtKurz = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
    const fmtZeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
    const fmtZeitSek = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fmtMonat = new Intl.DateTimeFormat('de-DE', { month: 'long' });

    function parseDbDate(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value || '');
        return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null;
    }
    function formatDatumZeit(value) {
        const d = parseDbDate(value);
        return d ? `${fmtDatum.format(d)}, ${fmtZeit.format(d)} Uhr` : '';
    }

    // ISO-Kalenderwoche mit zugehörigem Jahr
    function isoWoche(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return { jahr: d.getUTCFullYear(), kw: Math.ceil(((d - jahresbeginn) / 86400000 + 1) / 7) };
    }
    // Montag einer ISO-Woche (Woche 1 ist die mit dem 4. Januar)
    function montagVon(jahr, kw) {
        const jan4 = new Date(jahr, 0, 4);
        const versatz = (jan4.getDay() + 6) % 7;
        return new Date(jahr, 0, 4 - versatz + (kw - 1) * 7);
    }
    function plusTage(date, tage) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + tage);
    }
    function gleicherTag(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    function isoDatum(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function initialen(name) {
        const teile = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!teile.length) return '?';
        return (teile[0][0] + (teile.length > 1 ? teile[teile.length - 1][0] : '')).toUpperCase();
    }

    function feldName(feld) {
        if (feld === 'kwinfo') return 'KW-Info';
        const [tag, schicht] = feld.split(':');
        return `${TAGE[+tag]}, ${SCHICHTEN.find((s) => s.key === schicht).name}`;
    }

    // --- Hinweise & Dialoge ---
    function toast(text, type = 'info') {
        const node = el('div', { class: 'toast ' + type },
            icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info'),
            el('span', { text }));
        $('toasts').append(node);
        setTimeout(() => {
            node.classList.add('leaving');
            setTimeout(() => node.remove(), 300);
        }, type === 'error' ? 6000 : 3200);
    }

    document.querySelectorAll('dialog').forEach((dlg) => {
        dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
    });

    function bestaetigen({ titel, text, ok = 'OK', abbrechen = 'Abbrechen', gefahr = false }) {
        return new Promise((resolve) => {
            const dlg = $('dlg-confirm');
            const okBtn = $('confirm-ok');
            const cancelBtn = $('confirm-cancel');
            let ergebnis = false;

            $('confirm-title').textContent = titel;
            $('confirm-text').textContent = text;
            okBtn.textContent = ok;
            cancelBtn.textContent = abbrechen;
            okBtn.className = 'btn ' + (gefahr ? 'btn-danger' : 'btn-primary');

            const onOk = () => { ergebnis = true; dlg.close(); };
            const onCancel = () => dlg.close();
            const onClose = () => {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                dlg.removeEventListener('close', onClose);
                resolve(ergebnis);
            };
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            dlg.addEventListener('close', onClose);
            dlg.showModal();
        });
    }

    // --- Formatierter Text ---
    // Angezeigt wird nur, was die Formatierungsleiste erzeugen kann (der Server bereinigt beim Speichern genauso).
    const ERLAUBTE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'SPAN', 'FONT', 'UL', 'OL', 'LI', 'HR', 'A']);
    const VERBOTENE_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'BASE', 'TEMPLATE', 'NOSCRIPT']);
    const ERLAUBTE_STILE = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-align'];

    function bereinigeKnoten(node) {
        for (const child of [...node.childNodes]) {
            if (child.nodeType === Node.TEXT_NODE) continue;
            if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }

            const tag = child.tagName.toUpperCase();
            if (VERBOTENE_TAGS.has(tag)) { child.remove(); continue; }

            bereinigeKnoten(child);

            if (!ERLAUBTE_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }

            const stile = [];
            for (const prop of ERLAUBTE_STILE) {
                const wert = child.style.getPropertyValue(prop);
                if (wert && /^[#a-zA-Z0-9 .,%()-]{1,60}$/.test(wert) && !/url|expression/i.test(wert)) stile.push(`${prop}: ${wert}`);
            }
            for (const attr of [...child.attributes]) {
                const name = attr.name.toLowerCase();
                let behalten = false;
                if (tag === 'FONT' && name === 'color') behalten = /^(#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(attr.value);
                else if (tag === 'FONT' && name === 'size') behalten = /^[1-7]$/.test(attr.value);
                else if (tag === 'A' && name === 'href') behalten = /^(https?:\/\/|mailto:)/i.test(attr.value.trim());
                if (!behalten) child.removeAttribute(attr.name);
            }
            if (stile.length) child.setAttribute('style', stile.join('; '));

            if (tag === 'A') {
                if (!child.hasAttribute('href')) { child.replaceWith(...child.childNodes); continue; }
                child.setAttribute('target', '_blank');
                child.setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    // Bereinigte Knoten aus HTML erzeugen
    function bereinigt(html) {
        const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
        bereinigeKnoten(doc.body);
        const hatInhalt = doc.body.textContent.replace(/ /g, ' ').trim() !== '' || doc.body.querySelector('hr') !== null;
        return hatInhalt ? [...doc.body.childNodes] : [];
    }
    function bereinigtesHtml(html) {
        const box = document.createElement('div');
        box.append(...bereinigt(html));
        return box.innerHTML;
    }
    function textAus(html) {
        const box = document.createElement('div');
        box.append(...bereinigt(String(html || '').replace(/<\/?(br|hr|div|p|li)\b[^>]*>/gi, '$&\n')));
        return box.textContent.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    function textZuHtml(text) {
        return escapeHtml(text).replace(/\r?\n/g, '<br>');
    }

    // --- Theme ---
    function initTheme() {
        const updateIcon = () => {
            $('theme-icon').setAttribute('href', document.documentElement.classList.contains('dark') ? '#i-sun' : '#i-moon');
        };
        updateIcon();
        $('theme-toggle').addEventListener('click', () => {
            localStorage.theme = document.documentElement.classList.toggle('dark') ? 'dark' : 'light';
            updateIcon();
        });
    }

    // --- Anmeldung ---
    function setUser(user, darf = false) {
        state.user = user || null;
        state.darf = !!user && !!darf;

        $('login-btn').hidden = !!state.user;
        $('user-profile').hidden = !state.user;
        $('nav-verwaltung').hidden = !(state.user && state.user.isAdmin == 1);
        $('gate').hidden = !!state.user;
        $('wp-plan').hidden = !state.user;

        if (state.user) {
            const u = state.user;
            $('user-name').textContent = u.name || 'Mitarbeiter';
            $('user-initials').textContent = initialen(u.name);
            $('user-role').textContent = u.isAdmin == 1 ? 'Administrator' : (u.Meister == 1 ? 'Meister' : 'Mitarbeiter');
        } else {
            // Abgemeldet: nichts vom Plan stehen lassen
            verwerfeBearbeitung();
            schliessePanel();
            state.felder = {};
            state.sperren = {};
            state.stand = '';
            state.geladen = false;
        }
        aktualisiereRechte();
    }

    function aktualisiereRechte() {
        document.querySelectorAll('.wp-cell').forEach((zelle) => zelle.classList.toggle('editable', state.darf));
        $('wp-hilfe').hidden = !state.darf;
        $('baustein-neu').hidden = !state.darf;
    }

    function initAuth() {
        const dlg = $('dlg-login');
        const input = $('login-rfid');
        const oeffnen = () => {
            input.value = '';
            showError('login-error', '');
            dlg.showModal();
            input.focus();
        };
        $('login-btn').addEventListener('click', oeffnen);
        $('gate-login').addEventListener('click', oeffnen);

        $('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = input.value.trim();
            if (!code) { input.focus(); return; }

            $('login-submit').disabled = true;
            const r = await api('login', { rfid: code });
            $('login-submit').disabled = false;

            if (r.success && r.user) {
                dlg.close();
                setUser(r.user, r.darf_bearbeiten);
                await ladeWoche({ voll: true });
            } else {
                showError('login-error', r.error || 'Anmeldung fehlgeschlagen.');
                input.value = '';
                input.focus();
            }
        });

        $('user-profile').addEventListener('click', async () => {
            if (!state.user) return;
            const ok = await bestaetigen({ titel: 'Abmelden', text: `${state.user.name} wirklich abmelden?`, ok: 'Abmelden' });
            if (!ok) return;
            await beendeBearbeitung(true);
            await api('logout');
            setUser(null);
        });
    }

    // --- Woche wählen ---
    function woechenAdresse() {
        return `#${state.jahr}-W${String(state.kw).padStart(2, '0')}`;
    }

    async function zeigeWoche(datum) {
        // Erst die laufende Bearbeitung sichern, dann wechseln
        if (!(await beendeBearbeitung(true))) return;

        const woche = isoWoche(datum);
        state.jahr = woche.jahr;
        state.kw = woche.kw;
        state.montag = montagVon(woche.jahr, woche.kw);
        state.felder = {};
        state.sperren = {};
        state.stand = '';
        state.geladen = false;

        const sonntag = plusTage(state.montag, 6);
        const jahrDazu = state.montag.getFullYear() !== sonntag.getFullYear() ? ` ${state.montag.getFullYear()}` : '';
        const zeitraum = state.montag.getMonth() === sonntag.getMonth()
            ? `${state.montag.getDate()}. – ${sonntag.getDate()}. ${fmtMonat.format(sonntag)} ${sonntag.getFullYear()}`
            : `${state.montag.getDate()}. ${fmtMonat.format(state.montag)}${jahrDazu} – ${sonntag.getDate()}. ${fmtMonat.format(sonntag)} ${sonntag.getFullYear()}`;
        $('wp-kw').textContent = `KW ${state.kw}`;
        $('wp-zeitraum').textContent = zeitraum;
        $('wp-print-head').textContent = `Wochenplan EM-HS · KW ${state.kw}/${state.jahr} · ${fmtDatum.format(state.montag)} – ${fmtDatum.format(sonntag)}`;
        $('wp-datum').value = isoDatum(state.montag);
        $('wp-heute').disabled = gleicherTag(montagVon(isoWoche(new Date()).jahr, isoWoche(new Date()).kw), state.montag);
        document.title = `KW ${state.kw} · Wochenplan EM-HS`;
        if (location.hash !== woechenAdresse()) history.replaceState(null, '', woechenAdresse());

        baueRaster();
        if (state.user) await ladeWoche({ voll: true });
    }

    function wocheAusAdresse() {
        const m = /^#(\d{4})-W(\d{1,2})$/.exec(location.hash);
        if (!m) return null;
        const jahr = +m[1], kw = +m[2];
        if (jahr < 2000 || jahr > 2100 || kw < 1 || kw > 53) return null;
        return montagVon(jahr, kw);
    }

    function initNavigation() {
        $('wp-prev').addEventListener('click', () => zeigeWoche(plusTage(state.montag, -7)));
        $('wp-next').addEventListener('click', () => zeigeWoche(plusTage(state.montag, 7)));
        $('wp-heute').addEventListener('click', () => zeigeWoche(new Date()));
        $('wp-datum').addEventListener('change', (e) => {
            const d = parseDbDate(e.target.value);
            if (d) zeigeWoche(d);
        });
        window.addEventListener('hashchange', () => {
            const d = wocheAusAdresse();
            if (d && !gleicherTag(d, state.montag)) zeigeWoche(d);
        });
    }

    // --- Raster aufbauen ---
    // Welche Schicht läuft gerade? Vor Beginn der Frühschicht ist es noch die Nachtschicht des Vortags.
    function laufendesFeld(now = new Date()) {
        const stunde = now.getHours();
        const schicht = stunde >= SCHICHTBEGINN.frueh && stunde < SCHICHTBEGINN.mittag ? 'frueh'
            : (stunde >= SCHICHTBEGINN.mittag && stunde < SCHICHTBEGINN.nacht ? 'mittag' : 'nacht');
        const tag = stunde < SCHICHTBEGINN.frueh ? plusTage(now, -1) : now;
        return { tag, schicht };
    }

    function tagMarken(datum) {
        // Feiertage und Ferien aus ../kalenderdaten.js (mittags abfragen, die Datei rechnet in UTC)
        const mittag = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), 12);
        const marken = [];
        try {
            if (typeof istFeiertag === 'function' && istFeiertag(mittag)) {
                marken.push(el('span', { class: 'chip chip-danger', text: typeof getFeiertagsName === 'function' ? getFeiertagsName(mittag) || 'Feiertag' : 'Feiertag' }));
            }
            if (typeof istFerienTag === 'function' && istFerienTag(mittag)) marken.push(el('span', { class: 'chip chip-success', text: 'Ferien' }));
        } catch (err) { /* Kalenderdaten nicht verfügbar */ }
        return marken;
    }

    function baueRaster() {
        const heute = new Date();
        const laufend = laufendesFeld(heute);
        const knoten = [el('div', { class: 'wp-corner', 'aria-hidden': 'true' })];

        TAGE.forEach((name, tag) => {
            const datum = plusTage(state.montag, tag);
            const klassen = ['wp-day', tag >= 5 ? 'weekend' : '', gleicherTag(datum, heute) ? 'today' : ''].filter(Boolean).join(' ');
            knoten.push(el('div', { class: klassen, style: `--o: ${tag * 10}`, role: 'columnheader' },
                el('span', { class: 'wp-day-name', text: name }),
                el('span', { class: 'wp-day-date', text: fmtKurz.format(datum) }),
                el('span', { class: 'wp-day-tags' }, tagMarken(datum))));
        });

        SCHICHTEN.forEach((schicht, zeile) => {
            knoten.push(el('div', { class: 'wp-rowhead', role: 'rowheader', text: schicht.name }));
            TAGE.forEach((_, tag) => {
                const datum = plusTage(state.montag, tag);
                const klassen = ['wp-cell', tag >= 5 ? 'weekend' : '', gleicherTag(datum, heute) ? 'today' : '',
                    gleicherTag(datum, laufend.tag) && laufend.schicht === schicht.key ? 'now' : ''].filter(Boolean).join(' ');
                knoten.push(el('div', { class: klassen, 'data-feld': `${tag}:${schicht.key}`, style: `--o: ${tag * 10 + zeile + 1}`, role: 'cell' },
                    el('div', { class: 'wp-cell-label', text: schicht.name }),
                    el('div', { class: 'wp-cell-content rich', 'data-leer': '+ Eintrag' }),
                    el('div', { class: 'wp-lock', hidden: true })));
            });
        });

        setChildren($('wp-grid'), knoten);
        document.querySelectorAll('.wp-cell').forEach((zelle) => {
            zelle.querySelector('.wp-cell-content').replaceChildren();
            zelle.classList.remove('locked', 'editing', 'changed');
            zelle.querySelector('.wp-lock').hidden = true;
        });
        aktualisiereRechte();
    }

    function zelleVon(feld) {
        return document.querySelector(`.wp-cell[data-feld="${feld}"]`);
    }

    function renderFeld(feld) {
        const zelle = zelleVon(feld);
        if (!zelle) return;
        const daten = state.felder[feld] || { inhalt: '', version: 0, von: null, am: null };
        zelle.querySelector('.wp-cell-content').replaceChildren(...bereinigt(daten.inhalt));
        zelle.title = daten.von ? `Zuletzt geändert von ${daten.von}${daten.am ? ' am ' + formatDatumZeit(daten.am) : ''}` : '';
    }

    function renderSperren() {
        document.querySelectorAll('.wp-cell').forEach((zelle) => {
            const sperre = state.sperren[zelle.dataset.feld];
            const fremd = !!sperre && sperre.user_id !== state.ich;
            zelle.classList.toggle('locked', fremd);
            const marke = zelle.querySelector('.wp-lock');
            marke.hidden = !fremd;
            if (fremd) setChildren(marke, icon('lock'), `${sperre.name} schreibt …`);
        });
    }

    // --- Laden & laufender Abgleich ---
    function setStatus(text, fehlerhaft = false) {
        $('wp-status').textContent = text;
        $('wp-status').classList.toggle('fehler', fehlerhaft);
    }

    async function ladeWoche({ voll = false } = {}) {
        if (!state.user || !state.jahr) return;
        const jahr = state.jahr, kw = state.kw;
        const r = await api('woche', { jahr, kw, stand: voll ? '' : state.stand });

        if (!state.user || jahr !== state.jahr || kw !== state.kw) return;   // inzwischen gewechselt
        if (!r.success) {
            if (r.code !== 'auth') setStatus(r.offline ? 'Keine Verbindung zum Server – Änderungen anderer werden gerade nicht angezeigt.' : (r.error || 'Der Plan konnte nicht geladen werden.'), true);
            return;
        }
        setStatus(`Live-Abgleich aktiv · Stand ${fmtZeitSek.format(new Date())} Uhr`);
        if (r.unveraendert) return;

        const erstesLaden = !state.geladen;
        state.stand = r.stand;
        state.ich = r.ich;
        state.sperren = r.sperren || {};
        if (state.darf !== !!r.darf_bearbeiten) { state.darf = !!r.darf_bearbeiten; aktualisiereRechte(); }

        for (const feld of FELDER) {
            const neu = r.felder[feld] || { inhalt: '', version: 0, von: null, am: null };
            const alt = state.felder[feld];
            const geaendert = !alt || alt.version !== neu.version || alt.inhalt !== neu.inhalt;
            if (!geaendert) continue;

            // Das Feld, in dem man selbst gerade schreibt, wird nie von außen überschrieben
            if (state.edit && state.edit.feld === feld) continue;

            state.felder[feld] = neu;
            renderFeld(feld);
            if (!erstesLaden) {
                const zelle = zelleVon(feld);
                zelle.classList.remove('changed');
                void zelle.offsetWidth;   // Animation neu starten
                zelle.classList.add('changed');
            }
        }
        state.geladen = true;
        renderSperren();
    }

    // --- Bearbeiten ---
    function cursorAnsEnde(node) {
        const bereich = document.createRange();
        bereich.selectNodeContents(node);
        bereich.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(bereich);
    }

    async function starteBearbeitung(feld) {
        if (!state.darf || !state.geladen) return;
        if (state.edit) {
            if (state.edit.feld === feld) return;
            if (!(await beendeBearbeitung(true))) return;
        }
        const jahr = state.jahr, kw = state.kw;
        const zelle = zelleVon(feld);
        if (!zelle || zelle.dataset.startet) return;

        zelle.dataset.startet = '1';
        const r = await api('sperren', { jahr, kw, feld });
        delete zelle.dataset.startet;
        if (jahr !== state.jahr || kw !== state.kw || state.edit) {
            if (r.success) api('freigeben', { jahr, kw, feld });
            return;
        }
        if (!r.success) {
            toast(r.error || 'Das Feld kann gerade nicht bearbeitet werden.', r.code === 'gesperrt' ? 'info' : 'error');
            ladeWoche();
            return;
        }

        // Mit dem frischen Stand vom Server beginnen
        state.felder[feld] = r.feld;
        renderFeld(feld);

        const inhalt = zelle.querySelector('.wp-cell-content');
        inhalt.contentEditable = 'true';
        inhalt.spellcheck = true;
        zelle.classList.remove('changed');
        zelle.classList.add('editing');

        state.edit = {
            feld, jahr, kw, zelle, inhalt,
            basis: r.feld.version,
            original: inhalt.innerHTML,
            bereich: null,          // letzte Cursorposition (für Einfügen aus dem Bausteine-Panel)
            ende: null,             // läuft das Beenden schon?
            timer: setInterval(lebenszeichen, LEBENSZEICHEN_MS),
        };

        inhalt.focus();
        cursorAnsEnde(inhalt);
        zeigeToolbar();
        renderBausteine();
        ladeVorschlaege();
        ladeBausteine();
    }

    async function lebenszeichen() {
        const e = state.edit;
        if (!e) return;
        const r = await api('sperren', { jahr: e.jahr, kw: e.kw, feld: e.feld });
        if (state.edit === e && !r.success && r.code === 'gesperrt' && !e.gewarnt) {
            e.gewarnt = true;
            toast(`${r.name || 'Jemand'} hat dieses Feld inzwischen geöffnet. Bitte bald speichern.`, 'error');
        }
    }

    function geaendert(e) {
        return bereinigtesHtml(e.inhalt.innerHTML) !== bereinigtesHtml(e.original);
    }

    // Bearbeitung beenden. Liefert false, wenn das Speichern nicht geklappt hat (das Feld bleibt dann offen).
    function beendeBearbeitung(speichern) {
        const e = state.edit;
        if (!e) return Promise.resolve(true);
        if (e.ende) return e.ende;

        e.ende = (async () => {
            schliesseVorschlaege();
            const neu = bereinigtesHtml(e.inhalt.innerHTML);

            if (speichern && geaendert(e)) {
                let r = await api('speichern', { jahr: e.jahr, kw: e.kw, feld: e.feld, inhalt: neu, version: e.basis });

                if (!r.success && r.code === 'konflikt') {
                    const meine = await bestaetigen({
                        titel: 'Feld wurde inzwischen geändert',
                        text: `${r.feld.von || 'Jemand anderes'} hat „${feldName(e.feld)}“ geändert, während Sie daran geschrieben haben. Welche Fassung soll gelten? Die andere bleibt im Verlauf des Feldes erhalten.`,
                        ok: 'Meine Fassung speichern',
                        abbrechen: 'Andere Fassung behalten',
                    });
                    if (meine) {
                        r = await api('speichern', { jahr: e.jahr, kw: e.kw, feld: e.feld, inhalt: neu, version: e.basis, erzwingen: 1 });
                    } else {
                        await api('freigeben', { jahr: e.jahr, kw: e.kw, feld: e.feld });
                        r = { success: true, feld: r.feld };
                    }
                }

                if (!r.success) {
                    // Nichts verwerfen: Feld bleibt offen, der Text bleibt stehen
                    toast((r.error || 'Speichern fehlgeschlagen.') + ' Ihr Text bleibt im Feld stehen.', 'error');
                    e.ende = null;
                    return false;
                }
                if (e.jahr === state.jahr && e.kw === state.kw) state.felder[e.feld] = r.feld;
            } else {
                await api('freigeben', { jahr: e.jahr, kw: e.kw, feld: e.feld });
            }

            schliesseBearbeitung(e);
            return true;
        })();
        return e.ende;
    }

    function schliesseBearbeitung(e) {
        clearInterval(e.timer);
        e.inhalt.contentEditable = 'false';
        e.zelle.classList.remove('editing');
        if (state.edit === e) state.edit = null;
        $('wp-toolbar').hidden = true;
        schliesseVorschlaege();
        if (e.jahr === state.jahr && e.kw === state.kw) renderFeld(e.feld);
        renderBausteine();
    }

    // Ohne Speichern und ohne Rückfrage schließen (bei Abmeldung durch den Server)
    function verwerfeBearbeitung() {
        if (state.edit) schliesseBearbeitung(state.edit);
    }

    async function abbrechen() {
        const e = state.edit;
        if (!e) return;
        if (geaendert(e)) {
            const ok = await bestaetigen({ titel: 'Änderungen verwerfen?', text: `Die Änderungen an „${feldName(e.feld)}“ werden nicht gespeichert.`, ok: 'Verwerfen', abbrechen: 'Weiter bearbeiten', gefahr: true });
            if (!ok) { e.inhalt.focus(); return; }
        }
        await beendeBearbeitung(false);
    }

    function zeigeToolbar() {
        const e = state.edit;
        const leiste = $('wp-toolbar');
        if (!e) { leiste.hidden = true; return; }
        leiste.hidden = false;
        const zelle = e.zelle.getBoundingClientRect();
        const hoehe = leiste.offsetHeight || 40;
        const breite = leiste.offsetWidth || 520;
        // über dem Feld, wenn dort Platz ist – sonst darunter
        let top = zelle.top - hoehe - 8;
        if (top < 8) top = Math.min(window.innerHeight - hoehe - 8, zelle.bottom + 8);
        const left = Math.max(12, Math.min(zelle.left, window.innerWidth - breite - 12));
        leiste.style.top = Math.round(top) + 'px';
        leiste.style.left = Math.round(left) + 'px';
    }

    function merkeBereich() {
        const e = state.edit;
        if (!e) return;
        const sel = window.getSelection();
        if (sel.rangeCount && e.inhalt.contains(sel.anchorNode)) e.bereich = sel.getRangeAt(0).cloneRange();
    }

    function stelleBereichHer() {
        const e = state.edit;
        if (!e) return;
        e.inhalt.focus();
        const sel = window.getSelection();
        if (e.bereich && e.inhalt.contains(e.bereich.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(e.bereich);
        } else {
            cursorAnsEnde(e.inhalt);
        }
    }

    // Formatierten Inhalt an der Cursorposition einfügen; steht davor schon Text in der Zeile, beginnt eine neue
    function fuegeEin(html) {
        const e = state.edit;
        if (!e) return;
        stelleBereichHer();
        const eingabe = aktuelleEingabe();
        const neueZeile = (eingabe && eingabe.vor.trim() !== '') || (!eingabe && e.inhalt.textContent.trim() !== '');
        document.execCommand('insertHTML', false, (neueZeile ? '<br>' : '') + bereinigtesHtml(html));
        merkeBereich();
        zeigeToolbar();
    }

    async function uebernehmeVorwoche() {
        const e = state.edit;
        if (!e) return;
        const vorwoche = isoWoche(plusTage(montagVon(e.jahr, e.kw), -7));
        const r = await api('feld', { jahr: vorwoche.jahr, kw: vorwoche.kw, feld: e.feld });
        if (state.edit !== e) return;
        if (!r.success) { toast(r.error || 'Die Vorwoche konnte nicht gelesen werden.', 'error'); return; }
        if (!r.feld.inhalt.trim()) { toast(`In KW ${vorwoche.kw} steht in diesem Feld nichts.`); return; }
        fuegeEin(r.feld.inhalt);
        toast(`Eintrag aus KW ${vorwoche.kw} übernommen.`, 'success');
    }

    async function zeigeVerlauf() {
        const e = state.edit;
        if (!e) return;
        const r = await api('verlauf', { jahr: e.jahr, kw: e.kw, feld: e.feld });
        if (state.edit !== e) return;
        if (!r.success) { toast(r.error || 'Der Verlauf konnte nicht geladen werden.', 'error'); return; }

        $('verlauf-sub').textContent = `${feldName(e.feld)} · KW ${e.kw}/${e.jahr}`;
        setChildren($('verlauf-liste'), r.data.length
            ? r.data.map((v) => {
                const vorschau = el('div', { class: 'wp-fassung-inhalt rich' });
                const knoten = bereinigt(v.inhalt);
                if (knoten.length) vorschau.append(...knoten); else vorschau.append(el('span', { class: 'muted', text: '(leer)' }));
                return el('div', { class: 'wp-fassung' },
                    el('div', { class: 'wp-fassung-kopf' },
                        el('strong', { text: v.user_name }),
                        el('span', { text: formatDatumZeit(v.zeitpunkt) }),
                        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
                            $('dlg-verlauf').close();
                            if (state.edit !== e) return;
                            e.inhalt.replaceChildren(...bereinigt(v.inhalt));
                            e.inhalt.focus();
                            cursorAnsEnde(e.inhalt);
                            toast('Fassung ins Feld übernommen – mit „Fertig“ speichern.');
                        } }, 'Übernehmen')),
                    vorschau);
            })
            : el('p', { class: 'empty', text: 'Zu diesem Feld gibt es noch keine früheren Fassungen. Ab jetzt wird jede gespeicherte Fassung aufbewahrt.' }));
        $('dlg-verlauf').showModal();
    }

    function initBearbeiten() {
        // Klick ins Feld öffnet es
        const oeffne = (e) => {
            const zelle = e.target.closest('.wp-cell');
            if (!zelle || !state.darf || e.target.closest('a')) return;
            if (zelle.classList.contains('editing')) return;
            if (zelle.classList.contains('locked')) {
                const sperre = state.sperren[zelle.dataset.feld];
                toast(`${sperre ? sperre.name : 'Jemand'} bearbeitet dieses Feld gerade.`);
                return;
            }
            starteBearbeitung(zelle.dataset.feld);
        };
        $('wp-plan').addEventListener('click', oeffne);

        // Klick außerhalb speichert und schließt
        document.addEventListener('mousedown', (e) => {
            const edit = state.edit;
            if (!edit) return;
            const t = e.target;
            if (edit.zelle.contains(t) || $('wp-toolbar').contains(t) || $('wp-autofill').contains(t) || $('wp-panel').contains(t) || t.closest('dialog') || t.closest('.toast')) return;
            beendeBearbeitung(true);
        });

        document.addEventListener('selectionchange', () => { merkeBereich(); zeigeFormatierung(); });

        $('wp-plan').addEventListener('keydown', (e) => {
            const edit = state.edit;
            if (!edit || !edit.inhalt.contains(e.target)) return;

            if (state.autofill && behandleVorschlagTaste(e)) return;

            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                beendeBearbeitung(true);
            } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                // Zeilenumbruch immer als einfacher Umbruch (<br>), nicht als verschachtelter Absatz –
                // außer in Aufzählungen, dort beginnt Enter einen neuen Punkt
                const knoten = window.getSelection().anchorNode;
                const inListe = knoten && (knoten.nodeType === Node.ELEMENT_NODE ? knoten : knoten.parentElement).closest('li');
                if (!inListe || !edit.inhalt.contains(inListe)) {
                    e.preventDefault();
                    document.execCommand('insertLineBreak');
                    schliesseVorschlaege();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                abbrechen();
            } else if (e.key === 'Tab') {
                // wie in einer Tabelle: speichern und ins nächste bzw. vorige Feld
                e.preventDefault();
                const pos = FELDER.indexOf(edit.feld);
                const ziel = FELDER[(pos + (e.shiftKey ? -1 : 1) + FELDER.length) % FELDER.length];
                beendeBearbeitung(true).then((ok) => { if (ok) starteBearbeitung(ziel); });
            }
        });

        $('wp-plan').addEventListener('input', (e) => {
            if (!state.edit || !state.edit.inhalt.contains(e.target)) return;
            entferneFarbMarker();
            // direkt nach dem Übernehmen eines Vorschlags nicht sofort die nächste Liste aufklappen
            if (state.edit.vorschlagPause) state.edit.vorschlagPause = false; else zeigeVorschlaege();
            zeigeToolbar();
            zeigeFormatierung();
        });

        // Einfügen aus Word, Outlook usw. nur als reiner Text, damit keine fremde Formatierung in den Plan gerät
        $('wp-plan').addEventListener('paste', (e) => {
            if (!state.edit || !state.edit.inhalt.contains(e.target)) return;
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            if (text) document.execCommand('insertHTML', false, textZuHtml(text.replace(/\r\n/g, '\n').trim()));
        });

        // Formatierungsleiste: mousedown abfangen, damit die Markierung im Feld erhalten bleibt
        const leiste = $('wp-toolbar');
        leiste.addEventListener('mousedown', (e) => e.preventDefault());
        leiste.addEventListener('click', (e) => {
            const btn = e.target.closest('.wp-tb');
            if (!btn || !state.edit) return;

            if (btn.dataset.cmd) {
                state.edit.inhalt.focus();
                if (btn.dataset.cmd === 'rot') schalteRot();
                else document.execCommand(btn.dataset.cmd, false, null);
                merkeBereich();
                zeigeFormatierung();
                return;
            }
            switch (btn.dataset.aktion) {
                case 'fertig': beendeBearbeitung(true); break;
                case 'abbrechen': abbrechen(); break;
                case 'vorwoche': uebernehmeVorwoche(); break;
                case 'verlauf': zeigeVerlauf(); break;
                case 'bausteine': oeffnePanel(); break;
                case 'merken': merkeAlsBaustein(); break;
            }
        });

        window.addEventListener('resize', () => { zeigeToolbar(); schliesseVorschlaege(); });
        $('content').addEventListener('scroll', () => { zeigeToolbar(); schliesseVorschlaege(); }, { passive: true });

        // Seite wird verlassen: offenen Text noch speichern, Sperre freigeben
        window.addEventListener('pagehide', () => {
            const e = state.edit;
            if (!e || !navigator.sendBeacon) return;
            const daten = geaendert(e)
                ? { action: 'speichern', jahr: e.jahr, kw: e.kw, feld: e.feld, inhalt: bereinigtesHtml(e.inhalt.innerHTML), version: e.basis }
                : { action: 'freigeben', jahr: e.jahr, kw: e.kw, feld: e.feld };
            navigator.sendBeacon(API, new Blob([JSON.stringify(daten)], { type: 'application/json' }));
        });
    }

    // --- Formatierung: Anzeige des aktiven Zustands und Rot als Umschalter ---
    const ROT = '#d92d20';
    // Hilfsfarbe für "Farbe zurücknehmen": Der Browser kennt keinen Befehl dafür. Er färbt die Auswahl
    // deshalb mit dieser Farbe um (und löst sie dabei aus der roten Umgebung), danach wird die Hilfsfarbe entfernt.
    const FARB_MARKER = '#010203';
    const FARB_MARKER_RGB = 'rgb(1, 2, 3)';

    function farbwert(wert) {
        return String(wert || '').replace(/\s+/g, '').toLowerCase();
    }

    // Steht der Cursor bzw. die Auswahl in farbigem Text?
    function istFarbig() {
        const e = state.edit;
        if (!e) return false;
        const wert = farbwert(document.queryCommandValue('foreColor'));
        return wert !== '' && wert !== farbwert(getComputedStyle(e.inhalt).color) && wert !== farbwert(FARB_MARKER_RGB);
    }

    function schalteRot() {
        if (istFarbig()) {
            document.execCommand('foreColor', false, FARB_MARKER);
            entferneFarbMarker();
        } else {
            document.execCommand('foreColor', false, ROT);
        }
    }

    function entferneFarbMarker() {
        const e = state.edit;
        if (!e) return;
        const treffer = [...e.inhalt.querySelectorAll('font[color], [style*="color"]')].filter((n) =>
            farbwert(n.getAttribute('color')) === FARB_MARKER || farbwert(n.style.color) === farbwert(FARB_MARKER_RGB));
        if (!treffer.length) return;

        // Cursor merken: beim Auflösen der Hülle würde er sonst vor den Text springen
        const sel = window.getSelection();
        const pos = sel.rangeCount ? { a: sel.anchorNode, ao: sel.anchorOffset, f: sel.focusNode, fo: sel.focusOffset } : null;

        for (const n of treffer) {
            n.removeAttribute('color');
            n.style.removeProperty('color');
            if (!n.getAttribute('style')) n.removeAttribute('style');
            if ((n.tagName === 'FONT' || n.tagName === 'SPAN') && n.attributes.length === 0) n.replaceWith(...n.childNodes);
        }
        if (pos && e.inhalt.contains(pos.a) && e.inhalt.contains(pos.f)) {
            try { sel.setBaseAndExtent(pos.a, Math.min(pos.ao, pos.a.length ?? pos.a.childNodes.length), pos.f, Math.min(pos.fo, pos.f.length ?? pos.f.childNodes.length)); } catch (err) { /* Position nicht mehr gültig */ }
        }
        e.inhalt.normalize();   // benachbarte Textstücke zusammenführen (der Cursor wandert dabei mit)
    }

    // Knöpfe der Leiste hervorheben, deren Formatierung an der Cursorposition gerade gilt
    function zeigeFormatierung() {
        const e = state.edit;
        if (!e || $('wp-toolbar').hidden) return;
        const sel = window.getSelection();
        const imFeld = sel.rangeCount > 0 && e.inhalt.contains(sel.anchorNode);
        document.querySelectorAll('.wp-tb[data-cmd]').forEach((btn) => {
            const cmd = btn.dataset.cmd;
            let aktiv = false;
            if (imFeld) {
                try {
                    if (cmd === 'rot') aktiv = istFarbig();
                    else if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline' || cmd === 'insertUnorderedList') aktiv = document.queryCommandState(cmd);
                } catch (err) { /* Abfrage vom Browser nicht unterstützt */ }
            }
            btn.classList.toggle('active', aktiv);
            if (cmd !== 'insertHorizontalRule' && cmd !== 'removeFormat') btn.setAttribute('aria-pressed', String(aktiv));
        });
    }

    // --- Vorschläge beim Tippen ---
    // Der Text der aktuellen Zeile bis zum Cursor (innerhalb des Textknotens, in dem der Cursor steht).
    // Der Browser schreibt Leerzeichen am Zeilenende als geschütztes Leerzeichen – für die Suche zählt beides gleich.
    function aktuelleEingabe() {
        const e = state.edit;
        const sel = window.getSelection();
        if (!e || !sel.rangeCount || !sel.isCollapsed) return null;
        const node = sel.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE || !e.inhalt.contains(node)) return null;
        const vor = node.textContent.slice(0, sel.anchorOffset).replace(/\u00a0/g, ' ');
        const roh = vor.replace(/^\s+/, '');
        return { node, ende: sel.anchorOffset, vor, roh };
    }

    async function ladeVorschlaege() {
        if (state.vorschlaege !== null) return;
        state.vorschlaege = [];
        const r = await api('vorschlaege');
        if (r.success) state.vorschlaege = r.data;
    }

    function sucheVorschlaege(text) {
        const q = text.toLowerCase();
        const treffer = [];
        const gesehen = new Set([q]);
        const merke = (eintrag, rang) => {
            const key = eintrag.text.toLowerCase();
            if (gesehen.has(key)) return;
            gesehen.add(key);
            treffer.push({ ...eintrag, rang });
        };
        // Textbausteine zuerst, dann Zeilen aus früheren Wochen; Treffer am Zeilenanfang vor Treffern mitten im Text
        for (const b of state.bausteine) {
            const t = b.text.toLowerCase();
            if (t.startsWith(q)) merke({ text: b.text, html: b.html, baustein: b.id }, 0);
            else if (q.length >= 3 && t.includes(q)) merke({ text: b.text, html: b.html, baustein: b.id }, 2);
        }
        for (const v of state.vorschlaege || []) {
            const t = v.text.toLowerCase();
            if (t.startsWith(q)) merke({ text: v.text, n: v.n }, 1);
            else if (q.length >= 3 && t.includes(q)) merke({ text: v.text, n: v.n }, 3);
        }
        return treffer.sort((a, b) => a.rang - b.rang || (b.n || 0) - (a.n || 0)).slice(0, MAX_VORSCHLAEGE);
    }

    // Gesucht wird zuerst mit der ganzen Zeile. Passt dazu nichts (z.B. weil vorne schon "Mittelwerk:" steht),
    // wird Wort für Wort gekürzt, bis das zuletzt Getippte etwas findet. Ersetzt wird nur der Teil, der gepasst hat.
    function findeVorschlaege(eingabe) {
        const zeile = eingabe.roh;
        const starts = [0];
        for (const m of zeile.matchAll(/\s+(?=\S)/g)) starts.push(m.index + m[0].length);
        for (const start of starts) {
            const teil = zeile.slice(start);
            if (teil.length < 2) break;
            const treffer = sucheVorschlaege(teil);
            if (treffer.length) return { treffer, suche: teil };
        }
        return null;
    }

    function zeigeVorschlaege() {
        const eingabe = aktuelleEingabe();
        const fund = eingabe && eingabe.roh.length >= 2 ? findeVorschlaege(eingabe) : null;
        if (!fund) { schliesseVorschlaege(); return; }

        // aktiv = -1: noch nichts ausgewählt. Tab nimmt dann den ersten Vorschlag, Enter bleibt ein Zeilenumbruch.
        state.autofill = { eingabe, treffer: fund.treffer, suche: fund.suche, aktiv: -1 };
        renderVorschlaege();

        // unter dem Cursor anzeigen; liefert der Browser dort keine Position, unter dem Feld
        const box = $('wp-autofill');
        box.hidden = false;
        let anker = window.getSelection().getRangeAt(0).getBoundingClientRect();
        if (!anker || (anker.width === 0 && anker.height === 0 && anker.top === 0)) anker = state.edit.zelle.getBoundingClientRect();
        const hoehe = box.offsetHeight;
        const breite = box.offsetWidth;
        let top = anker.bottom + 6;
        if (top + hoehe > window.innerHeight - 8) top = Math.max(8, anker.top - hoehe - 6);
        box.style.top = Math.round(top) + 'px';
        box.style.left = Math.round(Math.max(12, Math.min(anker.left, window.innerWidth - breite - 12))) + 'px';
    }

    function renderVorschlaege() {
        const a = state.autofill;
        const q = a.suche.toLowerCase();
        setChildren($('wp-autofill'),
            a.treffer.map((t, i) => {
                const ersteZeile = t.text.split('\n')[0];
                const pos = ersteZeile.toLowerCase().indexOf(q);
                const text = el('span', { class: 'wp-af-text' });
                if (pos >= 0) text.append(ersteZeile.slice(0, pos), el('mark', { text: ersteZeile.slice(pos, pos + q.length) }), ersteZeile.slice(pos + q.length));
                else text.textContent = ersteZeile;
                const mehrzeilig = t.text.includes('\n');
                return el('div', { class: 'wp-af-item', role: 'option', 'data-index': String(i) },
                    text,
                    el('span', { class: 'wp-af-art', text: t.baustein ? (mehrzeilig ? 'Baustein, mehrzeilig' : 'Baustein') : `${t.n}× verwendet` }),
                    i === 0 ? el('kbd', { class: 'wp-af-taste', text: 'Tab' }) : null);
            }),
            el('div', { class: 'wp-af-hinweis', text: 'Anklicken oder Tab übernimmt · ↑ ↓ und Enter wählen aus · Esc schließt' }));
        markiereVorschlag();
    }

    // Nur die Hervorhebung umsetzen – die Liste selbst bleibt stehen, damit Mausklicks ihr Ziel treffen
    function markiereVorschlag() {
        const a = state.autofill;
        if (!a) return;
        document.querySelectorAll('#wp-autofill .wp-af-item').forEach((item, i) => {
            item.classList.toggle('active', i === a.aktiv);
            item.setAttribute('aria-selected', String(i === a.aktiv));
        });
    }

    function schliesseVorschlaege() {
        state.autofill = null;
        $('wp-autofill').hidden = true;
    }

    function initVorschlaege() {
        const box = $('wp-autofill');
        // mousedown statt click: so behält das Feld Cursor und Fokus
        box.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.wp-af-item');
            if (item) uebernehmeVorschlag(Number(item.dataset.index));
        });
        box.addEventListener('mousemove', (e) => {
            const item = e.target.closest('.wp-af-item');
            const a = state.autofill;
            if (!item || !a || a.aktiv === Number(item.dataset.index)) return;
            a.aktiv = Number(item.dataset.index);
            markiereVorschlag();
        });
    }

    // true = Taste wurde für die Vorschlagsliste verbraucht
    function behandleVorschlagTaste(e) {
        const a = state.autofill;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = a.treffer.length;
            a.aktiv = a.aktiv < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (a.aktiv + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
            markiereVorschlag();
            return true;
        }
        // Tab nimmt den ausgewählten, sonst den ersten Vorschlag. Enter übernimmt nur einen ausgewählten –
        // ohne Auswahl bleibt Enter ein Zeilenumbruch.
        if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && a.aktiv >= 0 && !e.ctrlKey && !e.metaKey)) {
            e.preventDefault();
            uebernehmeVorschlag(Math.max(0, a.aktiv));
            return true;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            schliesseVorschlaege();
            return true;
        }
        return false;
    }

    function uebernehmeVorschlag(index) {
        const a = state.autofill;
        const e = state.edit;
        if (!a || !e) return;
        const t = a.treffer[index];
        const { node, ende } = a.eingabe;
        const start = ende - a.suche.length;   // ersetzt wird genau der Teil, der zur Suche gepasst hat
        schliesseVorschlaege();
        if (!t || !e.inhalt.contains(node)) return;

        e.inhalt.focus();
        const bereich = document.createRange();
        bereich.setStart(node, Math.max(0, Math.min(start, node.textContent.length)));
        bereich.setEnd(node, Math.min(ende, node.textContent.length));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(bereich);
        e.vorschlagPause = true;
        document.execCommand('insertHTML', false, t.html ? bereinigtesHtml(t.html) : textZuHtml(t.text));
        e.vorschlagPause = false;
        merkeBereich();
        if (t.baustein) api('baustein_genutzt', { id: t.baustein });
    }
    // --- Textbausteine ---
    async function ladeBausteine({ neu = false } = {}) {
        if (state.bausteineGeladen && !neu) return;
        const r = await api('bausteine');
        if (!r.success) return;
        state.bausteine = r.data;
        state.bausteineGeladen = true;
        renderBausteine();
    }

    function renderBausteine() {
        const panel = $('wp-panel');
        if (panel.hidden) return;
        const q = $('baustein-suche').value.trim().toLowerCase();
        const liste = state.bausteine.filter((b) => !q || b.text.toLowerCase().includes(q));
        const kannEinfuegen = !!state.edit;

        $('baustein-hinweis').textContent = !state.darf
            ? 'Textbausteine können nur von Bearbeitern eingefügt werden.'
            : (kannEinfuegen
                ? `Klick fügt in „${feldName(state.edit.feld)}“ ein.`
                : 'Zum Einfügen zuerst ein Feld im Plan anklicken.');

        setChildren($('baustein-liste'), liste.length
            ? liste.map((b) => el('div', { class: 'wp-baustein' },
                el('button', {
                    class: 'wp-baustein-text', type: 'button', disabled: !kannEinfuegen, text: b.text,
                    title: kannEinfuegen ? 'In das geöffnete Feld einfügen' : 'Zuerst ein Feld im Plan anklicken',
                    onmousedown: (e) => e.preventDefault(),
                    onclick: () => {
                        if (!state.edit) return;
                        fuegeEin(b.html || textZuHtml(b.text));
                        api('baustein_genutzt', { id: b.id });
                        b.nutzung++;
                    },
                }),
                el('div', { class: 'wp-baustein-fuss' },
                    el('span', { text: (b.html ? 'mit Formatierung · ' : '') + (b.nutzung ? `${b.nutzung}× eingefügt` : 'noch nicht verwendet') }),
                    el('span', { class: 'spacer' }),
                    state.darf ? el('button', { class: 'icon-btn', type: 'button', title: 'Bearbeiten', 'aria-label': 'Textbaustein bearbeiten', onclick: () => oeffneBausteinDialog(b) }, icon('pencil', 'ic-sm')) : null,
                    state.darf ? el('button', { class: 'icon-btn', type: 'button', title: 'Löschen', 'aria-label': 'Textbaustein löschen', onclick: () => loescheBaustein(b) }, icon('trash', 'ic-sm')) : null)))
            : el('p', { class: 'empty', text: q ? 'Kein Textbaustein passt zur Suche.' : 'Noch keine Textbausteine. Mit „Neu“ oder über das Plus in der Bearbeitungsleiste anlegen.' }));
    }

    function oeffnePanel() {
        $('wp-panel').hidden = false;
        $('wp-bausteine-btn').setAttribute('aria-expanded', 'true');
        renderBausteine();
        ladeBausteine({ neu: true });
    }
    function schliessePanel() {
        $('wp-panel').hidden = true;
        $('wp-bausteine-btn').setAttribute('aria-expanded', 'false');
    }

    function oeffneBausteinDialog(baustein) {
        state.bausteinDialog = baustein;
        $('baustein-title').textContent = baustein ? 'Textbaustein bearbeiten' : 'Neuer Textbaustein';
        $('baustein-text').value = baustein ? baustein.text : '';
        $('baustein-form-hinweis').textContent = baustein && baustein.html
            ? 'Dieser Baustein enthält Formatierung. Beim Ändern des Texts hier wird er zu reinem Text.'
            : 'Mehrere Zeilen sind möglich. Der Baustein steht danach allen zur Verfügung.';
        showError('baustein-error', '');
        $('dlg-baustein').showModal();
        $('baustein-text').focus();
    }

    async function loescheBaustein(b) {
        const ok = await bestaetigen({ titel: 'Textbaustein löschen', text: `„${b.text.split('\n')[0].slice(0, 80)}“ wird für alle gelöscht.`, ok: 'Löschen', gefahr: true });
        if (!ok) return;
        const r = await api('baustein_loeschen', { id: b.id });
        if (!r.success) { toast(r.error || 'Löschen fehlgeschlagen.', 'error'); return; }
        await ladeBausteine({ neu: true });
    }

    // Den Inhalt des geöffneten Feldes als Baustein ablegen (mit Formatierung)
    async function merkeAlsBaustein() {
        const e = state.edit;
        if (!e) return;
        const html = bereinigtesHtml(e.inhalt.innerHTML);
        if (!html) { toast('Das Feld ist leer.'); return; }
        const r = await api('baustein_speichern', { html, text: textAus(html) });
        if (!r.success) { toast(r.error || 'Der Textbaustein konnte nicht gespeichert werden.', r.code === 'doppelt' ? 'info' : 'error'); return; }
        toast('Als Textbaustein gespeichert.', 'success');
        await ladeBausteine({ neu: true });
    }

    function initBausteine() {
        $('wp-bausteine-btn').addEventListener('click', () => { if ($('wp-panel').hidden) oeffnePanel(); else schliessePanel(); });
        $('wp-panel-close').addEventListener('click', schliessePanel);
        $('baustein-suche').addEventListener('input', renderBausteine);
        $('baustein-neu').addEventListener('click', () => oeffneBausteinDialog(null));

        $('baustein-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = $('baustein-text').value.trim();
            if (!text) { showError('baustein-error', 'Bitte einen Text eingeben.'); $('baustein-text').focus(); return; }
            const b = state.bausteinDialog;
            // unveränderter Text: Formatierung behalten
            const payload = b ? { id: b.id, text, html: text === b.text ? (b.html || '') : '' } : { text };
            const r = await api('baustein_speichern', payload);
            if (!r.success) { showError('baustein-error', r.error || 'Speichern fehlgeschlagen.'); return; }
            $('dlg-baustein').close();
            await ladeBausteine({ neu: true });
        });
    }

    // --- Drucken ---
    async function drucken() {
        if (!state.user) return;
        if (!(await beendeBearbeitung(true))) return;
        const root = document.documentElement;
        const warDunkel = root.classList.contains('dark');
        const zurueck = () => {
            if (warDunkel) root.classList.add('dark');
            window.removeEventListener('afterprint', zurueck);
        };
        root.classList.remove('dark');   // gedruckt wird immer hell
        window.addEventListener('afterprint', zurueck);
        window.print();
    }

    // --- Start ---
    async function init() {
        initTheme();
        initAuth();
        initNavigation();
        initBearbeiten();
        initVorschlaege();
        initBausteine();
        $('wp-drucken').addEventListener('click', drucken);

        // KW-Info ist fester Bestandteil der Seite, das Raster wird je Woche neu gebaut
        const r = await api('check_auth');
        setUser(r.success ? r.user : null, r.darf_bearbeiten);
        await zeigeWoche(wocheAusAdresse() || new Date());

        // laufender Abgleich mit dem Server
        setInterval(() => { if (!document.hidden) ladeWoche(); }, ABGLEICH_MS);
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) return;
            // in einem anderen Reiter an- oder abgemeldet?
            if (!state.edit) {
                const auth = await api('check_auth');
                const jetzt = auth.success ? String(auth.user.id) : null;
                const vorher = state.user ? String(state.user.id) : null;
                if (jetzt !== vorher) setUser(auth.success ? auth.user : null, auth.darf_bearbeiten);
            }
            ladeWoche({ voll: !state.geladen });
        });

        // um Mitternacht bzw. beim Schichtwechsel die Markierungen "heute" und "laufende Schicht" nachziehen
        let marke = '';
        setInterval(() => {
            const l = laufendesFeld();
            const neu = `${isoDatum(new Date())}|${isoDatum(l.tag)}|${l.schicht}`;
            if (marke && marke !== neu && !state.edit) { baueRaster(); for (const feld of FELDER) renderFeld(feld); renderSperren(); }
            marke = neu;
        }, 30000);

        window.addEventListener('beforeunload', (e) => {
            if (state.edit && geaendert(state.edit)) { e.preventDefault(); e.returnValue = ''; }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
