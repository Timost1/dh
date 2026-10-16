(() => {
    'use strict';

    // --- Konstanten ---
    // Die Seite liegt als index.html im Hauptordner, Skript und API im Ordner Startseite:
    // Pfade deshalb relativ zu diesem Skript auflösen, nicht zur Seite
    const BASIS = new URL('.', document.currentScript ? document.currentScript.src : location.href);
    const API = new URL('api.php', BASIS).href;
    const SEITENTITEL = document.title;

    // Durchwahlen, die auf der Startseite zugewiesen werden können
    const TELEFONE = [
        { num: '6012' },
        { num: '6721' },
        { num: '6747' },
        { num: '6749' },
        { num: 'Vertretung', label: 'Vertr.' },
    ];

    // Schichtbeginn in vollen Stunden – bestimmt, welche Schicht im Tagesplan als aktuell umrandet wird
    // und wann der Tagesplan auf den nächsten Tag wechselt (mit Beginn der Frühschicht).
    // Die Nachtschicht läuft über Mitternacht, gilt also von 22 bis 6 Uhr.
    const SCHICHTBEGINN = { frueh: 6, mittag: 14, nacht: 22 };

    // Kategorien des Schwarzen Bretts (Schlüssel müssen zu ST_KATEGORIEN in api.php passen)
    const KATEGORIEN = {
        info: { label: 'Information', chip: 'chip-accent' },
        sicherheit: { label: 'Sicherheit', chip: 'chip-danger' },
        betrieb: { label: 'Betrieb / Anlage', chip: 'chip-warning' },
        organisation: { label: 'Organisation', chip: 'chip-success' },
        sonstiges: { label: 'Sonstiges', chip: '' },
    };

    const BRETT_PRO_SEITE = 6;          // Kacheln pro Seite: die Startseite wächst nicht mit der Anzahl der Meldungen
    const INTERVALL_UEBERSICHT = 30000; // Tagesplan, Telefonnummern
    const INTERVALL_BRETT = 60000;
    const INTERVALL_WETTER = 30 * 60 * 1000;

    const state = {
        user: null,
        brett: { seite: 1, seiten: 1, q: '', kategorie: '', archiv: false, snapshot: '' },
        meldung: null,          // aktuell geöffnete Meldung
        editorMeldung: null,    // Meldung, die gerade bearbeitet wird (null = neue Meldung)
        snapshots: {},
        planTag: null,          // Schichttag, den der Tagesplan gerade zeigt
        // liste: zuletzt geladene Benachrichtigungen; bekannt: für diesen Benutzer schon einmal geladen;
        // gesehen: Schlüssel, die schon einmal geladen wurden (nur wirklich Neues wird gemeldet)
        notif: { liste: [], geladen: false, ungelesen: 0, filter: 'alle', bekannt: false, gesehen: new Set() },
        kommentarAutor: null,
        editorAutor: null,
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

    // Wie replaceChildren, überspringt aber leere Einträge (replaceChildren würde "null" als Text einfügen)
    function setChildren(node, ...children) {
        node.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
    }

    function showError(id, text) {
        const box = $(id);
        box.textContent = text || '';
        box.hidden = !text;
    }

    // --- Server ---
    async function api(action, payload = {}, url = API) {
        let res;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action, ...payload }),
            });
        } catch (err) {
            return { success: false, error: 'Keine Verbindung zum Server.', offline: true };
        }
        try {
            return await res.json();
        } catch (err) {
            return { success: false, error: 'Ungültige Antwort vom Server.' };
        }
    }

    // --- Datum & Zeit ---
    const fmtDatum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtZeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
    const fmtKopf = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtLang = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtWochentag = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });

    // Zeitstempel kommen als "JJJJ-MM-TT HH:MM:SS" aus der Datenbank
    function parseDbDate(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value || '');
        if (!m) return null;
        return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    function formatDatum(value) {
        const d = parseDbDate(value);
        return d ? fmtDatum.format(d) : '';
    }
    function formatDatumZeit(value) {
        const d = parseDbDate(value);
        return d ? `${fmtDatum.format(d)}, ${fmtZeit.format(d)} Uhr` : '';
    }
    function heuteIso() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ISO-Kalenderwoche mit zugehörigem Jahr; Tag 0 = Montag (wie im Wochenplan)
    function isoWoche(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return {
            jahr: d.getUTCFullYear(),
            kw: Math.ceil(((d - jahresbeginn) / 86400000 + 1) / 7),
            tag: (date.getDay() + 6) % 7,
        };
    }

    function initialen(name) {
        const teile = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!teile.length) return '?';
        return (teile[0][0] + (teile.length > 1 ? teile[teile.length - 1][0] : '')).toUpperCase();
    }

    // --- Hinweise ---
    // aktion: optionale Schaltfläche im Hinweis, z.B. { text: 'Rückgängig', ausfuehren: () => … }
    function toast(text, type = 'info', aktion = null) {
        const node = el('div', { class: 'toast ' + type },
            icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info'),
            el('span', { text }),
            aktion ? el('button', { class: 'toast-action', type: 'button', text: aktion.text, onclick: () => { node.remove(); aktion.ausfuehren(); } }) : null);
        $('toasts').append(node);
        setTimeout(() => {
            node.classList.add('leaving');
            setTimeout(() => node.remove(), 300);
        }, aktion ? 7000 : (type === 'error' ? 5000 : 3200));
    }

    // --- Dialoge ---
    document.querySelectorAll('dialog').forEach((dlg) => {
        let startAufHintergrund = false;
        dlg.addEventListener('mousedown', (e) => { startAufHintergrund = e.target === dlg; });
        dlg.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) { dlg.close(); return; }
            // Klick neben den Dialog schließt ihn – außer es ginge dabei eine Eingabe verloren
            if (e.target !== dlg || !startAufHintergrund) return;
            if (dlg.id === 'dlg-editor' || dlg.id === 'dlg-confirm') return;
            if (dlg.id === 'dlg-meldung' && $('kommentar-text').value.trim() !== '') return;
            dlg.close();
        });
    });

    function bestaetigen({ titel, text, ok = 'OK', gefahr = false }) {
        return new Promise((resolve) => {
            const dlg = $('dlg-confirm');
            const okBtn = $('confirm-ok');
            const cancelBtn = $('confirm-cancel');
            let ergebnis = false;

            $('confirm-title').textContent = titel;
            $('confirm-text').textContent = text;
            okBtn.textContent = ok;
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

    // --- Seitenleiste & Theme ---
    function initShell() {
        // Ausklappmenü "Mehr" in der Navigationsleiste
        const mehr = $('rail-more');
        const flyout = $('flyout');
        const setFlyout = (offen) => {
            flyout.hidden = !offen;
            mehr.setAttribute('aria-expanded', String(offen));
        };
        mehr.addEventListener('click', (e) => { e.stopPropagation(); setFlyout(flyout.hidden); });
        flyout.addEventListener('click', (e) => { if (e.target.closest('a')) setFlyout(false); });
        document.addEventListener('click', (e) => { if (!flyout.hidden && !flyout.contains(e.target)) setFlyout(false); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !flyout.hidden) { setFlyout(false); mehr.focus(); } });

        const updateThemeIcon = () => {
            const dark = document.documentElement.classList.contains('dark');
            $('theme-icon').setAttribute('href', dark ? '#i-sun' : '#i-moon');
        };
        updateThemeIcon();
        $('theme-toggle').addEventListener('click', () => {
            const dark = document.documentElement.classList.toggle('dark');
            localStorage.theme = dark ? 'dark' : 'light';
            updateThemeIcon();
        });
    }

    function updateClock() {
        const now = new Date();
        $('clock-time').textContent = fmtZeit.format(now);
        $('clock-sec').textContent = ':' + String(now.getSeconds()).padStart(2, '0');
        $('clock-date').textContent = fmtKopf.format(now);
        $('clock-kw').textContent = isoWoche(now).kw;
        updateGruss(now);
        markiereAktuelleSchicht(now);

        const tag = planTag(now);
        $('tagesplan-datum').textContent = fmtLang.format(tag.datum);
        $('tagesplan-titel').textContent = tag.vortag ? 'Tagesplan' : 'Tagesplan heute';
        // Mit Beginn der Frühschicht wechselt der Plan auf den neuen Tag
        if (state.planTag !== null && state.planTag !== tag.schluessel) refreshDashboard();
        state.planTag = tag.schluessel;
    }

    // Der Tagesplan folgt dem Schichttag: Er beginnt mit der Frühschicht und endet mit der
    // Nachtschicht am nächsten Morgen. Vor Beginn der Frühschicht gilt deshalb noch der Vortag –
    // dort steht die Nachtschicht, die gerade läuft.
    function planTag(now = new Date()) {
        const vortag = now.getHours() < SCHICHTBEGINN.frueh;
        const datum = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (vortag ? 1 : 0));
        return { datum, vortag, schluessel: `${datum.getFullYear()}-${datum.getMonth() + 1}-${datum.getDate()}` };
    }

    // Die gerade laufende Schicht im Tagesplan umranden
    function markiereAktuelleSchicht(now = new Date()) {
        const stunde = now.getHours();
        const aktuell = stunde >= SCHICHTBEGINN.frueh && stunde < SCHICHTBEGINN.mittag ? 'frueh'
            : (stunde >= SCHICHTBEGINN.mittag && stunde < SCHICHTBEGINN.nacht ? 'mittag' : 'nacht');
        document.querySelectorAll('.shift').forEach((box) => {
            const istAktuell = box.dataset.shift === aktuell;
            if (box.classList.contains('current') === istAktuell) return;
            box.classList.toggle('current', istAktuell);
            if (istAktuell) box.setAttribute('aria-current', 'true'); else box.removeAttribute('aria-current');
        });
    }

    // Begrüßung im Kopfbereich, bei Anmeldung mit Vornamen
    function updateGruss(now = new Date()) {
        const stunde = now.getHours();
        const gruss = stunde >= 5 && stunde < 11 ? 'Guten Morgen' : (stunde >= 11 && stunde < 18 ? 'Guten Tag' : 'Guten Abend');
        const vorname = state.user ? String(state.user.name || '').trim().split(/\s+/)[0] : '';
        const text = vorname ? `${gruss}, ${vorname}` : gruss;
        if ($('hero-gruss').textContent !== text) $('hero-gruss').textContent = text;
    }

    // --- Anmeldung ---
    function istVerwalter() {
        return !!state.user && (state.user.isAdmin == 1 || state.user.Meister == 1);
    }

    // Ältere Seiten (Projektplaner, Admin-Bereich, Urlaubsplaner, Tabelle …) erkennen die Anmeldung nur an
    // diesen Browser-Einträgen, die früher die alte Startseite gesetzt hat. Sie werden hier im alten Format
    // mitgeführt, damit diese Seiten nach dem Umstieg erreichbar bleiben.
    const ALTE_RECHTE = ['isAdmin', 'kannFahrtenLoeschen', 'kannFahrtenBearbeiten', 'kannWochenplanBearbeiten', 'kannProjektplanerBearbeiten', 'Meister', 'Vertreter'];
    function alteAnmeldung(u) {
        try {
            if (u) {
                const rechte = {};
                for (const k of ALTE_RECHTE) rechte[k] = u[k] == 1;
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', String(u.name || ''));
                localStorage.setItem('userId', String(u.id));
                localStorage.setItem('permissions', JSON.stringify(rechte));
            } else {
                for (const k of ['isLoggedIn', 'username', 'userId', 'permissions']) localStorage.removeItem(k);
            }
        } catch (err) { /* Speicher im Browser gesperrt – die neue Seite funktioniert trotzdem */ }
    }

    function setUser(user) {
        const vorher = state.user ? String(state.user.id) : null;
        state.user = user || null;
        const jetzt = state.user ? String(state.user.id) : null;

        // angemeldet: Einträge setzen; ab- oder ausgeloggt (Sitzung abgelaufen): wieder entfernen
        if (state.user) alteAnmeldung(state.user);
        else if (vorher !== null) alteAnmeldung(null);

        $('login-btn').hidden = !!state.user;
        $('user-profile').hidden = !state.user;
        $('btn-notifications').hidden = !state.user;
        $('nav-verwaltung').hidden = !(state.user && state.user.isAdmin == 1);
        $('nav-admin-alt').hidden = !(state.user && state.user.isAdmin == 1);
        $('nav-projektplaner').hidden = !(state.user && state.user.kannProjektplanerBearbeiten == 1);
        updateGruss();

        if (state.user) {
            const u = state.user;
            $('user-name').textContent = u.name || 'Mitarbeiter';
            $('user-initials').textContent = initialen(u.name);
            $('user-role').textContent = u.isAdmin == 1 ? 'Administrator' : (u.Meister == 1 ? 'Meister' : (u.Lagermensch == 1 ? 'Lagermitarbeiter' : 'Mitarbeiter'));
        }

        if (vorher !== jetzt) {
            // Benachrichtigungen gehören zum Benutzer: bei An-, Ab- oder Ummeldung neu beginnen
            state.notif = { liste: [], geladen: false, ungelesen: 0, filter: 'alle', bekannt: false, gesehen: new Set() };
            schliesseBenachrichtigungen();
            setUngelesen(0);
            if (state.user) ladeBenachrichtigungen().then((ok) => { if (ok) state.notif.bekannt = true; });
            // Rechte und Namensfelder hängen vom angemeldeten Benutzer ab
            if ($('dlg-meldung').open && state.meldung) {
                state.kommentarAutor = createAutorFeld($('kommentar-autor'));
                openMeldung(state.meldung.id);
            }
        }
    }

    function initAuth() {
        const dlg = $('dlg-login');
        const input = $('login-rfid');

        $('login-btn').addEventListener('click', () => {
            input.value = '';
            showError('login-error', '');
            dlg.showModal();
            input.focus();
        });

        $('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = input.value.trim();
            if (!code) { input.focus(); return; }

            const btn = $('login-submit');
            btn.disabled = true;
            const r = await api('login', { rfid: code });
            btn.disabled = false;

            if (r.success && r.user) {
                dlg.close();
                setUser(r.user);
                toast('Angemeldet als ' + (r.user.name || 'Mitarbeiter'), 'success');
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
            await api('logout');
            setUser(null);
            alteAnmeldung(null);
            toast('Abgemeldet.');
        });
    }

    // --- Tagesplan ---
    // Der Wochenplan speichert formatierten Text. Vor der Anzeige wird er auf die
    // Elemente reduziert, die die Formatierungsleiste des Wochenplans erzeugen kann.
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

    // Setzt bereinigtes HTML in das Ziel; liefert false, wenn kein sichtbarer Inhalt vorhanden ist
    function setzeFormatiertenText(ziel, html) {
        const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
        bereinigeKnoten(doc.body);
        const hatInhalt = doc.body.textContent.replace(/ /g, ' ').trim() !== '' || doc.body.querySelector('hr') !== null;
        if (hatInhalt) ziel.replaceChildren(...doc.body.childNodes);
        return hatInhalt;
    }

    function unveraendert(name, daten) {
        const snapshot = JSON.stringify(daten);
        if (state.snapshots[name] === snapshot) return true;
        state.snapshots[name] = snapshot;
        return false;
    }

    function renderTagesplan(plan, tag) {
        const woche = isoWoche(tag.datum);
        if (unveraendert('tagesplan', [plan, tag.schluessel])) return;

        let gefuellt = 0;
        for (const schicht of ['frueh', 'mittag', 'nacht']) {
            const box = $('tp-' + schicht);
            if (plan && setzeFormatiertenText(box, plan[schicht])) {
                gefuellt++;
            } else {
                box.replaceChildren(el('p', { class: 'empty', text: plan ? 'Keine Einträge' : 'Plan nicht verfügbar' }));
            }
        }
        $('kwinfo').hidden = !(plan && setzeFormatiertenText($('kwinfo-text'), plan.kwinfo));

        // Ein leerer Tag ist kein Fehler: klar sagen, dass im Wochenplan für heute nichts steht
        $('tagesplan-leer').hidden = !(plan && gefuellt === 0);
        const wann = tag.vortag ? fmtWochentag.format(tag.datum) : 'heute';
        $('tagesplan-leer').textContent = `Für ${wann} (KW ${woche.kw}/${woche.jahr}) ist im Wochenplan noch nichts eingetragen.`;
    }

    // --- Telefonnummern ---
    function renderPhones(zuweisungen) {
        if (unveraendert('telefone', zuweisungen)) return;

        $('phone-list').replaceChildren(...TELEFONE.map((t) => {
            const name = zuweisungen ? zuweisungen[t.num] : null;
            const frei = !name || name === '-';
            return el('li', {},
                el('button', { class: 'phone-item', type: 'button', title: 'Zuweisung ändern', onclick: () => openPhone(t, frei ? '' : name) },
                    el('span', { class: 'phone-num' + (t.label ? ' is-text' : ''), text: t.label || t.num }),
                    el('span', { class: 'phone-name' + (frei ? ' unset' : ''), text: frei ? 'nicht zugewiesen' : name }),
                    icon('pencil', 'ic-sm')),
                // Ein Klick leert die Nummer, ohne den Dialog zu öffnen
                frei ? null : el('button', {
                    class: 'icon-btn phone-clear', type: 'button',
                    title: 'Namen entfernen', 'aria-label': `${name} von ${t.num} entfernen`,
                    onclick: () => entfernePhone(t, name),
                }, icon('x', 'ic-sm')));
        }));
    }

    let aktuellesTelefon = null;
    let aktuellerName = '';   // Zuweisung beim Öffnen des Dialogs

    async function setzePhone(telefon, name) {
        const r = await api('set_phone', { num: telefon.num, name });
        if (r.success) await refreshDashboard();
        return r;
    }

    // Zuweisung sofort entfernen; ein versehentlicher Klick lässt sich über den Hinweis zurücknehmen
    async function entfernePhone(telefon, bisher) {
        const r = await setzePhone(telefon, '');
        if (!r.success) { toast(r.error || 'Die Zuweisung konnte nicht entfernt werden.', 'error'); return; }
        toast(`${bisher} von ${telefon.num} entfernt.`, 'success', {
            text: 'Rückgängig',
            ausfuehren: async () => {
                const zurueck = await setzePhone(telefon, bisher);
                if (!zurueck.success) toast(zurueck.error || 'Rückgängig machen ist fehlgeschlagen.', 'error');
            },
        });
    }

    function openPhone(telefon, name) {
        aktuellesTelefon = telefon;
        aktuellerName = name;
        $('phone-dlg-sub').textContent = telefon.label ? 'Für: ' + telefon.num : 'Für Durchwahl ' + telefon.num;
        $('phone-name').value = name;
        $('phone-rfid').value = '';
        $('phone-entfernen').hidden = !name;
        showError('phone-error', '');
        $('dlg-phone').showModal();
        // Fokus auf dem Ausweisfeld für schnelles Scannen
        $('phone-rfid').focus();
    }

    function initPhones() {
        $('phone-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!aktuellesTelefon) return;
            showError('phone-error', '');

            let name = $('phone-name').value.trim();
            const code = $('phone-rfid').value.trim();
            if (code) {
                const lookup = await api('lookup_rfid', { rfid: code });
                if (!lookup.success) {
                    showError('phone-error', lookup.error || 'Ausweis nicht erkannt.');
                    $('phone-rfid').value = '';
                    $('phone-rfid').focus();
                    return;
                }
                name = lookup.name;
            }

            const r = await setzePhone(aktuellesTelefon, name);
            if (!r.success) { showError('phone-error', r.error || 'Speichern fehlgeschlagen.'); return; }
            $('dlg-phone').close();
            toast('Zuweisung aktualisiert.', 'success');
        });

        $('phone-entfernen').addEventListener('click', () => {
            const telefon = aktuellesTelefon;
            const bisher = aktuellerName;
            $('dlg-phone').close();
            if (telefon && bisher) entfernePhone(telefon, bisher);
        });
    }

    // --- Namensangabe für Meldungen und Kommentare ---
    // Angemeldete schreiben unter ihrem Namen. Alle anderen müssen einen Namen
    // eintragen oder den Ausweis scannen; ohne Namen wird nichts abgeschickt.
    function createAutorFeld(container) {
        if (state.user) {
            container.replaceChildren(el('div', { class: 'author-fixed' },
                icon('user', 'ic-sm'),
                el('span', {}, 'Sie schreiben als ', el('strong', { text: state.user.name }))));
            return { payload: () => ({}), markiereFehler: () => {} };
        }

        let bestaetigterCode = null;
        const name = el('input', { class: 'input', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'Vor- und Nachname' });
        const rfid = el('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Ausweis auflegen …' });
        const status = el('div', { class: 'author-status' });

        const setStatus = (text, cls = '') => {
            status.textContent = text;
            status.className = 'author-status ' + cls;
        };

        name.addEventListener('input', () => {
            bestaetigterCode = null;
            name.classList.remove('invalid');
            setStatus('');
        });

        rfid.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const code = rfid.value.trim();
            rfid.value = '';
            if (!code) return;
            const r = await api('lookup_rfid', { rfid: code });
            if (r.success) {
                bestaetigterCode = code;
                name.value = r.name;
                name.classList.remove('invalid');
                setStatus('Ausweis erkannt: ' + r.name, 'ok');
            } else {
                bestaetigterCode = null;
                setStatus(r.error || 'Ausweis nicht erkannt.', 'err');
            }
        });

        container.replaceChildren(
            el('div', { class: 'author-box' },
                el('label', { class: 'field' },
                    el('span', { class: 'field-label' }, el('span', {}, 'Ihr Name ', el('span', { class: 'req', text: '*' }))),
                    name),
                el('label', { class: 'field' },
                    el('span', { class: 'field-label', text: 'oder Ausweis scannen' }),
                    rfid)),
            status);

        return {
            // null = Angabe fehlt (Feld wird markiert)
            payload() {
                if (bestaetigterCode) return { rfid: bestaetigterCode };
                const wert = name.value.trim();
                if (wert.length < 2) {
                    this.markiereFehler('Bitte Namen angeben.');
                    return null;
                }
                return { autor_name: wert };
            },
            markiereFehler(text) {
                name.classList.add('invalid');
                setStatus(text, 'err');
                name.focus();
            },
        };
    }

    // --- Schwarzes Brett: Übersicht ---
    function kategorieChip(schluessel) {
        const kat = KATEGORIEN[schluessel] || KATEGORIEN.sonstiges;
        return el('span', { class: ('chip ' + kat.chip).trim(), text: kat.label });
    }

    function bestaetigtMarke() {
        return el('span', { class: 'verified', title: 'Per Ausweis bzw. Anmeldung bestätigt' }, icon('check', 'ic-sm'));
    }

    function kachel(m) {
        const gekuerzt = m.laenge > m.vorschau.length;
        return el('button', {
            class: 'tile' + (m.angepinnt ? ' pinned' : '') + (state.brett.archiv ? ' archived' : ''),
            type: 'button',
            onclick: () => openMeldung(m.id),
        },
            el('span', { class: 'tile-top' },
                kategorieChip(m.kategorie),
                m.angepinnt ? el('span', { class: 'pin' }, icon('pin', 'ic-sm'), 'Angepinnt') : null),
            el('span', { class: 'tile-title', text: m.titel }),
            el('span', { class: 'tile-preview', text: m.vorschau + (gekuerzt ? ' …' : '') }),
            el('span', { class: 'tile-foot' },
                el('span', { class: 'author', text: m.autor_name }),
                el('span', { class: 'date', text: formatDatum(m.erstellt_am), title: formatDatumZeit(m.erstellt_am) }),
                el('span', { class: 'count', title: 'Kommentare' }, icon('message', 'ic-sm'), String(m.kommentare))));
    }

    async function loadBrett({ leise = false } = {}) {
        const b = state.brett;
        const r = await api('brett_list', { q: b.q, kategorie: b.kategorie, archiv: b.archiv ? 1 : 0, seite: b.seite, pro_seite: BRETT_PRO_SEITE });

        if (!r.success) {
            if (leise) return;
            b.snapshot = '';
            $('brett-tiles').replaceChildren();
            $('brett-empty').textContent = r.error || 'Meldungen konnten nicht geladen werden.';
            $('brett-empty').hidden = false;
            $('brett-count').textContent = '';
            $('brett-pager').hidden = true;
            return;
        }

        const snapshot = JSON.stringify([r, b.archiv]);
        if (snapshot === b.snapshot) return;
        b.snapshot = snapshot;
        b.seite = r.seite;
        b.seiten = r.seiten;

        $('brett-tiles').replaceChildren(...r.data.map(kachel));

        const gefiltert = b.q !== '' || b.kategorie !== '';
        $('brett-empty').hidden = r.data.length > 0;
        if (!r.data.length) {
            $('brett-empty').textContent = gefiltert
                ? 'Keine Meldungen zu dieser Suche gefunden.'
                : (b.archiv ? 'Das Archiv ist leer.' : 'Aktuell gibt es keine Meldungen. Mit „Neue Meldung“ kann die erste erstellt werden.');
        }

        const einheit = r.gesamt === 1 ? 'Meldung' : 'Meldungen';
        $('brett-count').textContent = `${r.gesamt} ${b.archiv ? 'archivierte ' : ''}${einheit}${gefiltert ? ' gefunden' : ''}`;
        $('brett-view-archiv').textContent = r.archiv_anzahl > 0 ? `Archiv (${r.archiv_anzahl})` : 'Archiv';

        $('brett-pager').hidden = r.seiten <= 1;
        $('brett-page-info').textContent = `Seite ${r.seite} von ${r.seiten}`;
        $('brett-prev').disabled = r.seite <= 1;
        $('brett-next').disabled = r.seite >= r.seiten;
    }

    function setBrettAnsicht(archiv) {
        state.brett.archiv = archiv;
        state.brett.seite = 1;
        $('brett-view-aktuell').setAttribute('aria-pressed', String(!archiv));
        $('brett-view-archiv').setAttribute('aria-pressed', String(archiv));
        loadBrett();
    }

    function initBrett() {
        const optionen = () => Object.entries(KATEGORIEN).map(([value, kat]) => el('option', { value, text: kat.label }));
        $('brett-kategorie').append(el('option', { value: '', text: 'Alle Kategorien' }), ...optionen());
        $('editor-kategorie').append(...optionen());
        $('brett-kategorie').addEventListener('change', (e) => {
            state.brett.kategorie = e.target.value;
            state.brett.seite = 1;
            loadBrett();
        });

        let suchTimer = null;
        $('brett-search').addEventListener('input', (e) => {
            clearTimeout(suchTimer);
            suchTimer = setTimeout(() => {
                state.brett.q = e.target.value.trim();
                state.brett.seite = 1;
                loadBrett();
            }, 300);
        });
        $('brett-view-aktuell').addEventListener('click', () => setBrettAnsicht(false));
        $('brett-view-archiv').addEventListener('click', () => setBrettAnsicht(true));
        $('brett-prev').addEventListener('click', () => { state.brett.seite = Math.max(1, state.brett.seite - 1); loadBrett(); });
        $('brett-next').addEventListener('click', () => { state.brett.seite = Math.min(state.brett.seiten, state.brett.seite + 1); loadBrett(); });
        $('brett-neu').addEventListener('click', () => openEditor(null));

        initMeldungDialog();
        initEditor();
    }

    // --- Schwarzes Brett: Meldung ansehen & kommentieren ---
    // Text mit anklickbaren Links ausgeben, ohne HTML aus der Datenbank zu übernehmen
    function setzeTextMitLinks(ziel, text) {
        ziel.replaceChildren();
        const muster = /https?:\/\/[^\s<>"']+/g;
        let pos = 0;
        let treffer;
        while ((treffer = muster.exec(text)) !== null) {
            const url = treffer[0].replace(/[.,;:!?)\]]+$/, '');
            if (treffer.index > pos) ziel.append(text.slice(pos, treffer.index));
            ziel.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
            pos = treffer.index + url.length;
            muster.lastIndex = pos;
        }
        if (pos < text.length) ziel.append(text.slice(pos));
    }

    function renderMeldung(m, kommentare) {
        state.meldung = m;

        setChildren($('meldung-chips'),
            kategorieChip(m.kategorie),
            m.angepinnt ? el('span', { class: 'chip chip-accent' }, icon('pin', 'ic-sm'), 'Angepinnt') : null,
            (m.archiviert || m.abgelaufen) ? el('span', { class: 'chip' }, icon('archive', 'ic-sm'), 'Archiv') : null);
        $('meldung-titel').textContent = m.titel;

        setChildren($('meldung-meta'),
            el('span', { class: 'item' }, icon('user', 'ic-sm'), el('strong', { text: m.autor_name }), m.bestaetigt ? bestaetigtMarke() : null),
            el('span', { class: 'item' }, icon('clock', 'ic-sm'), 'Erstellt am ' + formatDatumZeit(m.erstellt_am)),
            m.geaendert_am ? el('span', { class: 'item', text: 'Geändert am ' + formatDatumZeit(m.geaendert_am) }) : null,
            m.gueltig_bis ? el('span', { class: 'item' }, icon('calendar', 'ic-sm'), 'Gültig bis ' + formatDatum(m.gueltig_bis)) : null);

        const hinweis = m.archiviert ? 'Diese Meldung wurde archiviert.'
            : (m.abgelaufen ? `Diese Meldung ist am ${formatDatum(m.gueltig_bis)} abgelaufen und liegt im Archiv.` : '');
        $('meldung-note').textContent = hinweis;
        $('meldung-note').hidden = !hinweis;

        setzeTextMitLinks($('meldung-inhalt'), m.inhalt);

        const imArchiv = m.archiviert || m.abgelaufen;
        const aktionen = [];
        if (m.darf_bearbeiten) {
            aktionen.push(el('button', { class: 'btn btn-sm', type: 'button', onclick: () => openEditor(m) }, icon('pencil', 'ic-sm'), 'Bearbeiten'));
        }
        if (m.darf_verwalten && !imArchiv) {
            aktionen.push(el('button', { class: 'btn btn-sm', type: 'button', onclick: () => meldungAktion('brett_pin', { angepinnt: m.angepinnt ? 0 : 1 }, m.angepinnt ? 'Meldung gelöst.' : 'Meldung angepinnt.') },
                icon('pin', 'ic-sm'), m.angepinnt ? 'Nicht mehr anpinnen' : 'Anpinnen'));
        }
        if (m.darf_bearbeiten) {
            aktionen.push(imArchiv
                ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => meldungAktion('brett_archive', { archiviert: 0 }, 'Meldung wiederhergestellt.') }, icon('archive', 'ic-sm'), 'Wiederherstellen')
                : el('button', { class: 'btn btn-sm', type: 'button', onclick: () => meldungAktion('brett_archive', { archiviert: 1 }, 'Meldung archiviert.', true) }, icon('archive', 'ic-sm'), 'Archivieren'));
        }
        if (m.darf_verwalten) {
            aktionen.push(el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: meldungLoeschen }, icon('trash', 'ic-sm'), 'Löschen'));
        }
        $('meldung-actions').replaceChildren(...aktionen);
        $('meldung-actions').hidden = aktionen.length === 0;

        $('kommentare-title').textContent = kommentare.length ? `Kommentare (${kommentare.length})` : 'Kommentare';
        $('kommentar-liste').replaceChildren(...(kommentare.length
            ? kommentare.map((k) => el('div', { class: 'comment' },
                el('span', { class: 'avatar', text: initialen(k.autor_name) }),
                el('div', { class: 'comment-main' },
                    el('div', { class: 'comment-head' },
                        el('strong', { text: k.autor_name }),
                        k.bestaetigt ? bestaetigtMarke() : null,
                        el('span', { text: formatDatumZeit(k.erstellt_am) }),
                        k.darf_loeschen ? el('button', { class: 'btn btn-sm btn-ghost', type: 'button', title: 'Kommentar löschen', 'aria-label': 'Kommentar löschen', onclick: () => kommentarLoeschen(k.id) }, icon('trash', 'ic-sm')) : null),
                    el('div', { class: 'comment-text', text: k.inhalt }))))
            : [el('p', { class: 'muted', text: 'Noch keine Kommentare.' })]));
    }

    async function openMeldung(id) {
        const dlg = $('dlg-meldung');
        const r = await api('brett_get', { id });
        if (!r.success) {
            toast(r.error || 'Meldung konnte nicht geladen werden.', 'error');
            if (dlg.open) dlg.close();
            loadBrett({ leise: true });
            return;
        }

        const neuGeoeffnet = !dlg.open || !state.meldung || state.meldung.id !== r.meldung.id;
        renderMeldung(r.meldung, r.kommentare);

        if (neuGeoeffnet) {
            $('kommentar-text').value = '';
            showError('kommentar-error', '');
            state.kommentarAutor = createAutorFeld($('kommentar-autor'));
            $('meldung-body').scrollTop = 0;
        }
        if (!dlg.open) dlg.showModal();
        meldungGelesen(r.meldung.id);
    }

    async function meldungAktion(action, payload, erfolgText, schliessen = false) {
        if (!state.meldung) return;
        const id = state.meldung.id;
        const r = await api(action, { id, ...payload });
        if (!r.success) { toast(r.error || 'Aktion fehlgeschlagen.', 'error'); return; }
        toast(erfolgText, 'success');
        if (schliessen) $('dlg-meldung').close(); else await openMeldung(id);
        loadBrett({ leise: true });
    }

    async function meldungLoeschen() {
        if (!state.meldung) return;
        const ok = await bestaetigen({
            titel: 'Meldung löschen',
            text: `„${state.meldung.titel}“ wird mit allen Kommentaren endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`,
            ok: 'Endgültig löschen',
            gefahr: true,
        });
        if (!ok) return;
        const r = await api('brett_delete', { id: state.meldung.id });
        if (!r.success) { toast(r.error || 'Löschen fehlgeschlagen.', 'error'); return; }
        $('dlg-meldung').close();
        toast('Meldung gelöscht.', 'success');
        loadBrett({ leise: true });
    }

    async function kommentarLoeschen(id) {
        const ok = await bestaetigen({ titel: 'Kommentar löschen', text: 'Diesen Kommentar endgültig löschen?', ok: 'Löschen', gefahr: true });
        if (!ok || !state.meldung) return;
        const r = await api('kommentar_delete', { id });
        if (!r.success) { toast(r.error || 'Löschen fehlgeschlagen.', 'error'); return; }
        await openMeldung(state.meldung.id);
        loadBrett({ leise: true });
    }

    function initMeldungDialog() {
        $('dlg-meldung').addEventListener('close', () => { state.meldung = null; });

        $('kommentar-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!state.meldung) return;
            showError('kommentar-error', '');

            const textFeld = $('kommentar-text');
            const inhalt = textFeld.value.trim();
            textFeld.classList.toggle('invalid', !inhalt);
            if (!inhalt) { textFeld.focus(); return; }

            const autor = state.kommentarAutor.payload();
            if (!autor) return;

            const btn = $('kommentar-submit');
            btn.disabled = true;
            const r = await api('kommentar_create', { meldung_id: state.meldung.id, inhalt, ...autor });
            btn.disabled = false;

            if (!r.success) {
                if (r.code === 'name') state.kommentarAutor.markiereFehler(r.error);
                else showError('kommentar-error', r.error || 'Kommentar konnte nicht gespeichert werden.');
                return;
            }
            textFeld.value = '';
            await openMeldung(state.meldung.id);
            $('meldung-body').scrollTop = $('meldung-body').scrollHeight;
            loadBrett({ leise: true });
        });

        $('kommentar-text').addEventListener('input', (e) => e.target.classList.remove('invalid'));
    }

    // --- Schwarzes Brett: Meldung erstellen / bearbeiten ---
    function updateZaehler() {
        const feld = $('editor-inhalt');
        $('editor-zaehler').textContent = `${feld.value.length} / ${feld.maxLength}`;
    }

    function openEditor(meldung) {
        state.editorMeldung = meldung;
        const neu = !meldung;

        $('editor-title').textContent = neu ? 'Neue Meldung' : 'Meldung bearbeiten';
        $('editor-submit').textContent = neu ? 'Veröffentlichen' : 'Speichern';
        $('editor-titel').value = neu ? '' : meldung.titel;
        $('editor-inhalt').value = neu ? '' : meldung.inhalt;
        $('editor-kategorie').value = neu ? 'info' : (KATEGORIEN[meldung.kategorie] ? meldung.kategorie : 'sonstiges');
        $('editor-gueltig').value = neu ? '' : (meldung.gueltig_bis || '');
        $('editor-gueltig').min = neu ? heuteIso() : '';
        $('editor-pin').checked = false;
        $('editor-pin-wrap').hidden = !(neu && istVerwalter());
        $('editor-titel').classList.remove('invalid');
        $('editor-inhalt').classList.remove('invalid');
        showError('editor-error', '');
        updateZaehler();

        // Der Verfasser steht bei bestehenden Meldungen fest
        $('editor-autor').hidden = !neu;
        state.editorAutor = neu ? createAutorFeld($('editor-autor')) : null;

        $('dlg-editor').showModal();
        $('editor-titel').focus();
    }

    function initEditor() {
        $('editor-inhalt').addEventListener('input', updateZaehler);
        ['editor-titel', 'editor-inhalt'].forEach((id) => $(id).addEventListener('input', (e) => e.target.classList.remove('invalid')));

        $('editor-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            showError('editor-error', '');

            const titel = $('editor-titel').value.trim();
            const inhalt = $('editor-inhalt').value.trim();
            $('editor-titel').classList.toggle('invalid', titel.length < 3);
            $('editor-inhalt').classList.toggle('invalid', !inhalt);
            if (titel.length < 3) { showError('editor-error', 'Bitte eine Überschrift angeben (mindestens 3 Zeichen).'); $('editor-titel').focus(); return; }
            if (!inhalt) { showError('editor-error', 'Bitte einen Text eingeben.'); $('editor-inhalt').focus(); return; }

            const payload = { titel, inhalt, kategorie: $('editor-kategorie').value, gueltig_bis: $('editor-gueltig').value };
            const bearbeitet = state.editorMeldung;

            if (!bearbeitet) {
                const autor = state.editorAutor.payload();
                if (!autor) return;
                Object.assign(payload, autor, { angepinnt: $('editor-pin').checked ? 1 : 0 });
            } else {
                payload.id = bearbeitet.id;
            }

            const btn = $('editor-submit');
            btn.disabled = true;
            const r = await api(bearbeitet ? 'brett_update' : 'brett_create', payload);
            btn.disabled = false;

            if (!r.success) {
                if (r.code === 'name' && state.editorAutor) state.editorAutor.markiereFehler(r.error);
                else showError('editor-error', r.error || 'Speichern fehlgeschlagen.');
                return;
            }

            $('dlg-editor').close();
            if (bearbeitet) {
                toast('Meldung gespeichert.', 'success');
                if ($('dlg-meldung').open) await openMeldung(bearbeitet.id);
                loadBrett({ leise: true });
            } else {
                toast('Meldung veröffentlicht.', 'success');
                // Filter zurücksetzen, damit die neue Meldung sichtbar ist
                state.brett.q = '';
                state.brett.kategorie = '';
                $('brett-search').value = '';
                $('brett-kategorie').value = '';
                setBrettAnsicht(false);
            }
        });
    }

    // --- Wetter (Open-Meteo, Standort Dillingen/Saar) ---
    function wetterAnzeige(code, istTag) {
        if (code === 0) return [istTag ? 'sun' : 'moon', 'Klar'];
        if (code === 1) return ['cloud-sun', 'Leicht bewölkt'];
        if (code === 2) return ['cloud-sun', 'Teils bewölkt'];
        if (code === 3) return ['cloud', 'Bedeckt'];
        if (code === 45 || code === 48) return ['fog', 'Nebel'];
        if (code >= 51 && code <= 57) return ['rain', 'Nieselregen'];
        if (code >= 61 && code <= 67) return ['rain', 'Regen'];
        if (code >= 71 && code <= 77) return ['snow', 'Schnee'];
        if (code >= 80 && code <= 82) return ['rain', 'Regenschauer'];
        if (code >= 85 && code <= 86) return ['snow', 'Schneeschauer'];
        if (code >= 95 && code <= 99) return ['storm', 'Gewitter'];
        return ['cloud', 'Unbekannt'];
    }

    async function loadWetter() {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=49.35&longitude=6.72'
            + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day'
            + '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&wind_speed_unit=kmh&timezone=Europe%2FBerlin';
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const daten = await res.json();
            const c = daten.current;
            const [symbol, text] = wetterAnzeige(c.weather_code, c.is_day !== 0);
            const richtungen = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

            $('weather-icon').setAttribute('href', '#i-' + symbol);
            $('weather-temp').textContent = `${Math.round(c.temperature_2m)} °C`;
            $('weather-desc').textContent = text;
            $('weather-wind').textContent = `${Math.round(c.wind_speed_10m)} km/h ${richtungen[Math.round(c.wind_direction_10m / 45) % 8]}`;
            $('weather-humidity').textContent = `${Math.round(c.relative_humidity_2m)} %`;
            const d = daten.daily;
            $('weather-range').textContent = d ? `${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°` : '–';
        } catch (err) {
            // Ohne Internetzugriff bleibt die letzte Anzeige stehen; beim ersten Laden ein Hinweis
            if ($('weather-temp').textContent === '–') $('weather-desc').textContent = 'Wetterdaten nicht verfügbar';
        }
    }

    // --- Benachrichtigungen ---
    // Die Liste kommt fertig vom Server (neue Meldungen und Kommentare am Schwarzen Brett,
    // Lager-Bestellungen) samt Gelesen-Zustand des angemeldeten Benutzers. Hier wird nur
    // angezeigt und der Zustand zurückgemeldet.
    const NOTIF_SYMBOL = { meldung: 'megaphone', kommentar: 'message', bestellung_neu: 'package', bestellung_status: 'package' };

    function setUngelesen(anzahl) {
        const n = state.user ? Math.max(0, Number(anzahl) || 0) : 0;
        state.notif.ungelesen = n;

        const badge = $('notification-badge');
        badge.hidden = n === 0;
        badge.textContent = n > 9 ? '9+' : String(n);
        const text = n === 0 ? 'Benachrichtigungen' : (n === 1 ? '1 ungelesene Benachrichtigung' : `${n} ungelesene Benachrichtigungen`);
        $('btn-notifications').title = text;
        $('btn-notifications').setAttribute('aria-label', text);
        document.title = (n ? `(${n}) ` : '') + SEITENTITEL;
    }

    function anzahlUngelesen() {
        return state.notif.liste.filter((n) => !n.gelesen).length;
    }

    // melden: mit einem kurzen Hinweis auf Benachrichtigungen aufmerksam machen, die seit dem letzten Laden dazugekommen sind
    async function ladeBenachrichtigungen({ melden = false } = {}) {
        if (!state.user) return false;
        const benutzer = state.user.id;
        const r = await api('benachrichtigungen');
        if (!state.user || state.user.id !== benutzer) return false;   // inzwischen ab- oder umgemeldet
        if (!r.success) {
            if (!state.notif.geladen) setChildren($('notification-list'), el('p', { class: 'empty', text: r.error || 'Benachrichtigungen konnten nicht geladen werden.' }));
            return false;
        }

        const neu = r.data.filter((n) => !n.gelesen && !state.notif.gesehen.has(n.schluessel));
        for (const n of r.data) state.notif.gesehen.add(n.schluessel);
        if (melden && neu.length) toast(neu.length === 1 ? neu[0].titel : `${neu.length} neue Benachrichtigungen`);

        state.notif.liste = r.data;
        state.notif.geladen = true;
        setUngelesen(r.ungelesen);
        renderBenachrichtigungen();
        return true;
    }

    // Das Alter kommt in Sekunden vom Server, damit abweichende Uhren die Anzeige nicht verfälschen
    function ereignisZeit(alterSek) {
        return new Date(Date.now() - alterSek * 1000);
    }
    function tageHer(datum) {
        const heute = new Date();
        return Math.round((new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()) - new Date(datum.getFullYear(), datum.getMonth(), datum.getDate())) / 86400000);
    }
    function relativeZeit(alterSek) {
        const datum = ereignisZeit(alterSek);
        const tage = tageHer(datum);
        if (alterSek < 60) return 'gerade eben';
        if (alterSek < 3600) return `vor ${Math.floor(alterSek / 60)} Min.`;
        if (tage === 0) return `vor ${Math.floor(alterSek / 3600)} Std.`;
        if (tage === 1) return `Gestern, ${fmtZeit.format(datum)} Uhr`;
        return `${fmtDatum.format(datum)}, ${fmtZeit.format(datum)} Uhr`;
    }
    function zeitGruppe(alterSek) {
        const tage = tageHer(ereignisZeit(alterSek));
        return tage <= 0 ? 'Heute' : (tage === 1 ? 'Gestern' : (tage < 7 ? 'Diese Woche' : 'Älter'));
    }

    function notifEintrag(n) {
        return el('div', { class: 'notif-item' + (n.gelesen ? '' : ' unread') },
            el('button', { class: 'notif-main', type: 'button', onclick: () => oeffneBenachrichtigung(n) },
                el('span', { class: 'notif-icon' }, icon(NOTIF_SYMBOL[n.typ] || 'bell', 'ic-sm')),
                el('span', { class: 'notif-body' },
                    el('span', { class: 'notif-title' }, n.gelesen ? null : el('span', { class: 'sr-only', text: 'Ungelesen: ' }), n.titel),
                    n.text ? el('span', { class: 'notif-text', text: n.text }) : null,
                    el('span', { class: 'notif-time', text: relativeZeit(n.alter_sek) }))),
            // Gelesenes bleibt gelesen; nur ungelesene Einträge haben den Haken
            n.gelesen ? null : el('button', { class: 'icon-btn notif-toggle', type: 'button', title: 'Als gelesen markieren', 'aria-label': 'Als gelesen markieren', onclick: () => markiere([n.schluessel]) },
                icon('check', 'ic-sm')));
    }

    function renderBenachrichtigungen() {
        const { liste, filter } = state.notif;
        const ungelesen = anzahlUngelesen();
        const sichtbar = filter === 'ungelesen' ? liste.filter((n) => !n.gelesen) : liste;

        $('notif-filter-alle').setAttribute('aria-pressed', String(filter === 'alle'));
        $('notif-filter-alle').textContent = `Alle (${liste.length})`;
        $('notif-filter-ungelesen').setAttribute('aria-pressed', String(filter === 'ungelesen'));
        $('notif-filter-ungelesen').textContent = `Ungelesen (${ungelesen})`;
        $('notif-alle-gelesen').disabled = ungelesen === 0;

        if (!sichtbar.length) {
            setChildren($('notification-list'), el('div', { class: 'notif-empty' },
                icon(liste.length ? 'check' : 'bell', 'ic-lg'),
                el('strong', { text: liste.length ? 'Alles gelesen' : 'Keine Benachrichtigungen' }),
                el('span', { text: liste.length
                    ? 'Es gibt keine ungelesenen Benachrichtigungen.'
                    : 'Hier erscheinen neue Meldungen am Schwarzen Brett, Antworten auf Ihre Meldungen und Lager-Bestellungen.' })));
            return;
        }

        const knoten = [];
        let gruppe = null;
        for (const n of sichtbar) {
            const g = zeitGruppe(n.alter_sek);
            if (g !== gruppe) { gruppe = g; knoten.push(el('div', { class: 'notif-group', text: g })); }
            knoten.push(notifEintrag(n));
        }
        setChildren($('notification-list'), knoten);
    }

    // Zustand sofort anzeigen und im Hintergrund speichern; schlägt das fehl, gilt wieder der Serverstand
    async function markiere(schluessel) {
        const auswahl = new Set(schluessel);
        for (const n of state.notif.liste) if (auswahl.has(n.schluessel)) n.gelesen = true;
        setUngelesen(anzahlUngelesen());
        renderBenachrichtigungen();

        const r = await api('benachrichtigung_markieren', { schluessel });
        if (!r.success) {
            toast(r.error || 'Die Änderung konnte nicht gespeichert werden.', 'error');
            await ladeBenachrichtigungen();
        }
    }

    async function oeffneBenachrichtigung(n) {
        if (!n.gelesen) await markiere([n.schluessel]);
        if (n.ziel && n.ziel.art === 'meldung') {
            schliesseBenachrichtigungen();
            openMeldung(n.ziel.id);
        } else if (n.ziel && n.ziel.art === 'lager') {
            window.location.href = new URL('../Lagerverwaltung/index.html', BASIS).href;
        }
    }

    // Wer eine Meldung öffnet – egal ob über die Glocke oder das Schwarze Brett – hat sie gelesen
    async function meldungGelesen(id) {
        if (!state.user || state.notif.ungelesen === 0) return;
        if (!state.notif.geladen && !(await ladeBenachrichtigungen())) return;
        const offen = state.notif.liste
            .filter((n) => !n.gelesen && n.ziel && n.ziel.art === 'meldung' && n.ziel.id === id)
            .map((n) => n.schluessel);
        if (offen.length) markiere(offen);
    }

    function oeffneBenachrichtigungen() {
        if (!state.user) return;
        const panel = $('notif-panel');
        const glocke = $('btn-notifications').getBoundingClientRect();
        panel.style.top = Math.round(glocke.bottom + 8) + 'px';
        panel.style.right = Math.max(12, Math.round(window.innerWidth - glocke.right)) + 'px';
        panel.hidden = false;
        $('btn-notifications').setAttribute('aria-expanded', 'true');

        if (state.notif.geladen) renderBenachrichtigungen();
        else setChildren($('notification-list'), el('p', { class: 'empty', text: 'Lade Benachrichtigungen …' }));
        ladeBenachrichtigungen();
    }

    function schliesseBenachrichtigungen() {
        $('notif-panel').hidden = true;
        $('btn-notifications').setAttribute('aria-expanded', 'false');
    }

    function initNotifications() {
        const panel = $('notif-panel');
        const glocke = $('btn-notifications');

        glocke.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.hidden) oeffneBenachrichtigungen(); else schliesseBenachrichtigungen();
        });
        $('notif-close').addEventListener('click', schliesseBenachrichtigungen);
        document.addEventListener('click', (e) => {
            if (!panel.hidden && !panel.contains(e.target) && !glocke.contains(e.target)) schliesseBenachrichtigungen();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) { schliesseBenachrichtigungen(); glocke.focus(); }
        });
        window.addEventListener('resize', schliesseBenachrichtigungen);

        for (const filter of ['alle', 'ungelesen']) {
            $('notif-filter-' + filter).addEventListener('click', () => { state.notif.filter = filter; renderBenachrichtigungen(); });
        }

        $('notif-alle-gelesen').addEventListener('click', async () => {
            for (const n of state.notif.liste) n.gelesen = true;
            setUngelesen(0);
            renderBenachrichtigungen();
            const r = await api('benachrichtigungen_alle_gelesen');
            if (!r.success) {
                toast(r.error || 'Die Änderung konnte nicht gespeichert werden.', 'error');
                await ladeBenachrichtigungen();
            }
        });
    }
    // --- Regelmäßige Aktualisierung ---
    async function refreshDashboard() {
        const tag = planTag();
        const r = await api('dashboard', isoWoche(tag.datum));
        const fuss = $('page-foot');
        if (!r.success) {
            fuss.textContent = 'Keine Verbindung zum Server – die Anzeige ist möglicherweise nicht aktuell.';
            fuss.style.color = 'var(--danger)';
            return;
        }
        fuss.textContent = `Zuletzt aktualisiert: ${fmtZeit.format(new Date())} Uhr`;
        fuss.style.color = '';

        setUser(r.user);
        renderPhones(r.telefone);
        renderTagesplan(r.tagesplan, tag);

        // Weicht der Zähler vom bekannten Stand ab, hat sich etwas getan: Liste neu holen
        if (state.user && state.notif.bekannt && Number(r.ungelesen) !== state.notif.ungelesen) {
            ladeBenachrichtigungen({ melden: true });
        }
    }

    function init() {
        initShell();
        initAuth();
        initPhones();
        initBrett();
        initNotifications();

        updateClock();
        setInterval(updateClock, 1000);

        renderPhones({});
        refreshDashboard();
        loadBrett();
        loadWetter();

        setInterval(refreshDashboard, INTERVALL_UEBERSICHT);
        setInterval(() => loadBrett({ leise: true }), INTERVALL_BRETT);
        setInterval(loadWetter, INTERVALL_WETTER);

        // Nach längerer Pause (Bildschirm aus, anderer Tab) sofort auffrischen
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            refreshDashboard();
            loadBrett({ leise: true });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
