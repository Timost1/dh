(() => {
    'use strict';

    // --- Konstanten ---
    const API = 'verwaltung_api.php';
    const WOCHENPLAN_API = 'Wochenplan/api.php';
    const STARTSEITE_API = 'Startseite/api.php';

    // Rollen und Rechte: Schlüssel = Spalte in der Tabelle mitarbeiter (siehe VW_RECHTE in verwaltung_api.php)
    const ROLLEN = [
        { key: 'isAdmin', titel: 'Administrator', text: 'Voller Zugriff auf alle Module und auf diese Benutzerverwaltung.', chip: 'chip-accent' },
        { key: 'Meister', titel: 'Meister', text: 'Darf Meldungen am Schwarzen Brett anpinnen, archivieren und löschen.', chip: 'chip-success' },
        { key: 'Vertreter', titel: 'Vertreter', text: 'Vertretung des Meisters, z. B. im Urlaubsplaner.', chip: 'chip-warning' },
        { key: 'Lagermensch', titel: 'Lagermitarbeiter', text: 'Bearbeitet Bestellungen in der Lagerverwaltung.', chip: '' },
    ];
    const RECHTE_GRUPPEN = [
        { modul: 'Wochenplan', rechte: [
            { key: 'kannWochenplanBearbeiten', titel: 'Wochenplan bearbeiten', text: 'Einträge, KW-Infos und Quick-Texte ändern.' },
        ] },
        { modul: 'Fahrtenbuch', rechte: [
            { key: 'kannFahrtenBearbeiten', titel: 'Fahrten bearbeiten', text: 'Bestehende Fahrten korrigieren.' },
            { key: 'kannFahrtenLoeschen', titel: 'Fahrten löschen', text: 'Fahrten aus dem Fahrtenbuch entfernen.' },
        ] },
        { modul: 'Projektplaner', rechte: [
            { key: 'kannProjektplanerBearbeiten', titel: 'Projektplaner bearbeiten', text: 'Projekte anlegen und ändern.' },
        ] },
        { modul: 'Schaltanweisungen', rechte: [
            { key: 'kannSAWSehen', titel: 'Schaltanweisungen sehen', text: 'Zugriff auf das Modul Schaltanweisungen.', standard: true },
            { key: 'kannSAWBearbeiten', titel: 'Schaltanweisungen bearbeiten', text: 'Schaltanweisungen anlegen und ändern.' },
            { key: 'kannSAWBearbeitenPlus', titel: 'Schaltanweisungen verwalten', text: 'Anlagen, Zellen und Textbausteine pflegen.' },
        ] },
    ];
    const ALLE_RECHTE = [...ROLLEN, ...RECHTE_GRUPPEN.flatMap((g) => g.rechte)];
    const SCHICHT_NEU = '__neu__';
    const MAX_AUSWEISE = 10;   // wie VW_MAX_AUSWEISE in verwaltung_api.php

    const state = {
        user: null,
        ich: 0,
        benutzer: [],
        schichten: [],
        filter: { suche: '', schicht: '', recht: '' },
        sort: { feld: 'name', richtung: 1 },
        tab: 'benutzer',
        bearbeitet: null,   // Benutzer im Dialog (null = neuer Benutzer)
        ausweise: [],       // Ausweise im Dialog: vorhandene (mit id) und noch nicht gespeicherte (mit Code)
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
            return { success: false, error: 'Keine Verbindung zum Server.' };
        }
        try {
            const result = await res.json();
            // Sitzung abgelaufen oder Adminrecht entzogen: zurück zur Anmeldung
            if (url === API && (result.code === 'auth' || result.code === 'forbidden')) await pruefeAnmeldung();
            return result;
        } catch (err) {
            return { success: false, error: 'Ungültige Antwort vom Server.' };
        }
    }

    const fmtDatum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    function formatDatum(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
        return m ? fmtDatum.format(new Date(+m[1], +m[2] - 1, +m[3])) : '';
    }
    const fmtZeit = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
    function formatDatumZeit(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value || '');
        if (!m) return '';
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
        return `${fmtDatum.format(d)}, ${fmtZeit.format(d)} Uhr`;
    }

    function initialen(name) {
        const teile = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!teile.length) return '?';
        return (teile[0][0] + (teile.length > 1 ? teile[teile.length - 1][0] : '')).toUpperCase();
    }

    function toast(text, type = 'info') {
        const node = el('div', { class: 'toast ' + type },
            icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info'),
            el('span', { text }));
        $('toasts').append(node);
        setTimeout(() => {
            node.classList.add('leaving');
            setTimeout(() => node.remove(), 300);
        }, type === 'error' ? 5000 : 3200);
    }

    // --- Dialoge ---
    document.querySelectorAll('dialog').forEach((dlg) => {
        dlg.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) dlg.close();
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

    // --- Theme ---
    function initShell() {
        const updateThemeIcon = () => {
            $('theme-icon').setAttribute('href', document.documentElement.classList.contains('dark') ? '#i-sun' : '#i-moon');
        };
        updateThemeIcon();
        $('theme-toggle').addEventListener('click', () => {
            localStorage.theme = document.documentElement.classList.toggle('dark') ? 'dark' : 'light';
            updateThemeIcon();
        });
    }

    // --- Anmeldung & Zugang ---
    function zeigeZugang() {
        const u = state.user;
        const istAdmin = !!u && u.isAdmin == 1;

        $('login-btn').hidden = !!u;
        $('user-profile').hidden = !u;
        if (u) {
            $('user-name').textContent = u.name || 'Mitarbeiter';
            $('user-initials').textContent = initialen(u.name);
            $('user-role').textContent = istAdmin ? 'Administrator' : (u.Meister == 1 ? 'Meister' : 'Mitarbeiter');
        }

        $('gate').hidden = istAdmin;
        $('admin-area').hidden = !istAdmin;
        if (!istAdmin) {
            $('gate-title').textContent = u ? 'Kein Zugriff' : 'Anmeldung erforderlich';
            $('gate-text').textContent = u
                ? `${u.name} ist angemeldet, hat aber kein Administratorrecht. Die Benutzerverwaltung ist Administratoren vorbehalten.`
                : 'Die Benutzerverwaltung ist Administratoren vorbehalten. Bitte mit dem Werksausweis anmelden.';
            $('gate-login').hidden = !!u;
            if ($('dlg-benutzer').open) $('dlg-benutzer').close();
        }
        return istAdmin;
    }

    async function pruefeAnmeldung() {
        let res;
        try {
            res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'check_auth' }) });
            const r = await res.json();
            state.user = r.success ? r.user : null;
        } catch (err) {
            state.user = null;
        }
        return zeigeZugang();
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
                state.user = r.user;
                if (zeigeZugang()) await ladeUebersicht();
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
            state.user = null;
            state.benutzer = [];
            zeigeZugang();
        });
    }

    // --- Übersicht ---
    async function ladeUebersicht() {
        const r = await api('uebersicht');
        if (!r.success) {
            if (r.code !== 'auth' && r.code !== 'forbidden') toast(r.error || 'Benutzer konnten nicht geladen werden.', 'error');
            return;
        }
        state.ich = r.ich;
        state.benutzer = r.benutzer;
        state.schichten = r.schichten;
        renderFilter();
        renderBenutzer();
    }


    function renderFilter() {
        const schicht = $('filter-schicht');
        const recht = $('filter-recht');
        setChildren(schicht,
            el('option', { value: '', text: 'Alle Schichten' }),
            state.schichten.map((s) => el('option', { value: s, text: 'Schicht ' + s })));
        schicht.value = state.schichten.includes(state.filter.schicht) ? state.filter.schicht : '';
        state.filter.schicht = schicht.value;

        if (!recht.options.length) {
            setChildren(recht,
                el('option', { value: '', text: 'Alle Rollen und Rechte' }),
                el('optgroup', { label: 'Rollen' }, ROLLEN.map((r) => el('option', { value: r.key, text: r.titel }))),
                RECHTE_GRUPPEN.map((g) => el('optgroup', { label: g.modul }, g.rechte.map((r) => el('option', { value: r.key, text: r.titel })))));
        }
    }

    // Rechte kompakt für die Tabelle: je Modul die höchste Stufe
    function rechteKurz(u) {
        const chips = [];
        if (u.kannWochenplanBearbeiten == 1) chips.push('Wochenplan');
        if (u.kannFahrtenBearbeiten == 1 && u.kannFahrtenLoeschen == 1) chips.push('Fahrten: bearbeiten, löschen');
        else if (u.kannFahrtenBearbeiten == 1) chips.push('Fahrten: bearbeiten');
        else if (u.kannFahrtenLoeschen == 1) chips.push('Fahrten: löschen');
        if (u.kannProjektplanerBearbeiten == 1) chips.push('Projektplaner');
        if (u.kannSAWBearbeitenPlus == 1) chips.push('SAW: verwalten');
        else if (u.kannSAWBearbeiten == 1) chips.push('SAW: bearbeiten');
        else if (u.kannSAWSehen == 1) chips.push('SAW: sehen');
        return chips;
    }

    function gefilterteBenutzer() {
        const { suche, schicht, recht } = state.filter;
        const begriff = suche.toLowerCase();
        const liste = state.benutzer.filter((u) =>
            (!begriff || u.name.toLowerCase().includes(begriff))
            && (!schicht || u.schicht === schicht)
            && (!recht || u[recht] == 1));

        const { feld, richtung } = state.sort;
        return liste.sort((a, b) => {
            const erst = String(a[feld] || '').localeCompare(String(b[feld] || ''), 'de', { sensitivity: 'base', numeric: true });
            return (erst || a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })) * richtung;
        });
    }

    function renderBenutzer() {
        const liste = gefilterteBenutzer();

        setChildren($('benutzer-tbody'), liste.map((u) => {
            const rollen = ROLLEN.filter((r) => u[r.key] == 1);
            const rechte = rechteKurz(u);
            return el('tr', { class: 'clickable', onclick: () => openBenutzer(u) },
                el('td', {},
                    el('div', { class: 'user-cell' },
                        el('span', { class: 'avatar', text: initialen(u.name) }),
                        el('span', { class: 'user-name' }, u.name, u.id === state.ich ? el('span', { class: 'user-you', text: '(Sie)' }) : null))),
                el('td', { class: 'nowrap' }, u.schicht ? el('span', { class: 'chip', text: u.schicht }) : el('span', { class: 'dash', text: '–' })),
                el('td', { class: 'nowrap' }, u.ausweise.length
                    ? el('span', { class: 'ausweis-anzahl', title: u.ausweise.map((a) => a.bezeichnung + (a.haupt ? ' (Hauptausweis)' : '')).join('\n') },
                        icon('badge', 'ic-sm'), String(u.ausweise.length))
                    : el('span', { class: 'chip chip-danger', text: 'keiner' })),
                el('td', {}, rollen.length
                    ? el('div', { class: 'chips' }, rollen.map((r) => el('span', { class: ('chip ' + r.chip).trim(), text: r.titel })))
                    : el('span', { class: 'dash', text: '–' })),
                el('td', {}, rechte.length
                    ? el('div', { class: 'chips' }, rechte.map((text) => el('span', { class: 'chip', text })))
                    : el('span', { class: 'dash', text: '–' })),
                el('td', { class: 'actions' },
                    el('button', { class: 'icon-btn', type: 'button', title: 'Bearbeiten', 'aria-label': `${u.name} bearbeiten`, onclick: (e) => { e.stopPropagation(); openBenutzer(u); } }, icon('pencil', 'ic-sm'))));
        }));

        $('benutzer-empty').hidden = liste.length > 0;
        const gesamt = state.benutzer.length;
        $('benutzer-count').textContent = liste.length === gesamt ? `${gesamt} Benutzer` : `${liste.length} von ${gesamt} Benutzern`;

        for (const feld of ['name', 'schicht']) {
            $('sort-' + feld).textContent = state.sort.feld === feld ? (state.sort.richtung === 1 ? '▲' : '▼') : '';
        }
    }

    function initBenutzerListe() {
        let timer = null;
        $('filter-suche').addEventListener('input', (e) => {
            clearTimeout(timer);
            timer = setTimeout(() => { state.filter.suche = e.target.value.trim(); renderBenutzer(); }, 150);
        });
        $('filter-schicht').addEventListener('change', (e) => { state.filter.schicht = e.target.value; renderBenutzer(); });
        $('filter-recht').addEventListener('change', (e) => { state.filter.recht = e.target.value; renderBenutzer(); });

        document.querySelectorAll('[data-sort]').forEach((btn) => btn.addEventListener('click', () => {
            const feld = btn.dataset.sort;
            state.sort = state.sort.feld === feld ? { feld, richtung: -state.sort.richtung } : { feld, richtung: 1 };
            renderBenutzer();
        }));

        $('benutzer-neu').addEventListener('click', () => openBenutzer(null));
    }

    // --- Benutzer anlegen / bearbeiten ---
    function rechtSchalter(r) {
        return el('label', { class: 'perm' },
            el('input', { type: 'checkbox', 'data-recht': r.key }),
            el('span', {},
                el('span', { class: 'perm-title', text: r.titel }), el('br'),
                el('span', { class: 'perm-desc', text: r.text })));
    }

    function initBenutzerDialog() {
        setChildren($('rollen-grid'), ROLLEN.map(rechtSchalter));
        setChildren($('rechte-gruppen'), RECHTE_GRUPPEN.flatMap((g) => [
            el('div', { class: 'perm-module', text: g.modul }),
            el('div', { class: 'perm-grid' }, g.rechte.map(rechtSchalter)),
        ]));

        const adminBox = document.querySelector('[data-recht="isAdmin"]');
        adminBox.addEventListener('change', () => { $('admin-note').hidden = !adminBox.checked; });

        $('benutzer-schicht').addEventListener('change', (e) => {
            const neu = e.target.value === SCHICHT_NEU;
            $('benutzer-schicht-neu').hidden = !neu;
            if (neu) $('benutzer-schicht-neu').focus();
        });

        // Lesegeräte schicken nach dem Code ein Enter – das fügt den Ausweis der Liste hinzu,
        // statt das Formular vorzeitig abzusenden
        $('ausweis-code').addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (e.target.value.trim()) fuegeAusweisHinzu();
        });
        $('ausweis-bezeichnung').addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if ($('ausweis-code').value.trim()) fuegeAusweisHinzu(); else $('ausweis-code').focus();
        });
        $('ausweis-hinzufuegen').addEventListener('click', () => {
            if ($('ausweis-code').value.trim()) fuegeAusweisHinzu();
            else { $('ausweis-code').classList.add('invalid'); $('ausweis-code').focus(); }
        });

        ['benutzer-name', 'ausweis-code', 'benutzer-schicht-neu'].forEach((id) =>
            $(id).addEventListener('input', (e) => e.target.classList.remove('invalid')));

        $('benutzer-form').addEventListener('submit', speichereBenutzer);
        $('benutzer-loeschen').addEventListener('click', loescheBenutzer);
    }

    function openBenutzer(u) {
        state.bearbeitet = u;
        const neu = !u;

        $('benutzer-title').textContent = neu ? 'Neuer Benutzer' : `${u.name} bearbeiten`;
        $('benutzer-submit').textContent = neu ? 'Benutzer anlegen' : 'Speichern';
        $('benutzer-name').value = neu ? '' : u.name;

        const schicht = $('benutzer-schicht');
        const bekannte = [...state.schichten];
        if (!neu && u.schicht && !bekannte.includes(u.schicht)) bekannte.push(u.schicht);
        setChildren(schicht,
            el('option', { value: '', text: 'Bitte wählen …' }),
            bekannte.map((s) => el('option', { value: s, text: s })),
            el('option', { value: SCHICHT_NEU, text: 'Andere Schicht …' }));
        schicht.value = neu ? '' : (u.schicht || '');
        $('benutzer-schicht-neu').value = '';
        $('benutzer-schicht-neu').hidden = true;

        state.ausweise = neu ? [] : u.ausweise.map((a) => ({ ...a }));
        $('ausweis-code').value = '';
        $('ausweis-bezeichnung').value = '';
        renderAusweise();

        for (const r of ALLE_RECHTE) {
            document.querySelector(`[data-recht="${r.key}"]`).checked = neu ? !!r.standard : u[r.key] == 1;
        }
        $('admin-note').hidden = !document.querySelector('[data-recht="isAdmin"]').checked;

        ['benutzer-name', 'ausweis-code', 'benutzer-schicht-neu'].forEach((id) => $(id).classList.remove('invalid'));
        showError('benutzer-error', '');
        $('benutzer-loeschen').hidden = neu || u.id === state.ich;

        $('dlg-benutzer').showModal();
        $('benutzer-name').focus();
    }

    async function speichereBenutzer(e) {
        e.preventDefault();
        showError('benutzer-error', '');
        const u = state.bearbeitet;

        const name = $('benutzer-name').value.trim();
        let schicht = $('benutzer-schicht').value;
        if (schicht === SCHICHT_NEU) schicht = $('benutzer-schicht-neu').value.trim();
        const fehler = (text, feldId) => {
            showError('benutzer-error', text);
            if (feldId) { $(feldId).classList.add('invalid'); $(feldId).focus(); }
        };
        if (name.length < 2) return fehler('Bitte einen Namen angeben (mindestens 2 Zeichen).', 'benutzer-name');
        if (!schicht) return fehler('Bitte eine Schicht wählen.', $('benutzer-schicht').value === SCHICHT_NEU ? 'benutzer-schicht-neu' : 'benutzer-schicht');

        // gescannt, aber nicht auf „Hinzufügen“ geklickt? Dann gehört der Code trotzdem dazu.
        if ($('ausweis-code').value.trim() && !fuegeAusweisHinzu()) return;

        const aktiv = state.ausweise.filter((a) => !a.entfernt);
        if (!u && !aktiv.length) return fehler('Bitte mindestens einen Ausweis oder Chip scannen.', 'ausweis-code');
        if (u && !aktiv.length) {
            if (u.id === state.ich) return fehler('Den eigenen letzten Ausweis zu entfernen würde Sie aussperren.', 'ausweis-code');
            const ok = await bestaetigen({
                titel: 'Keinen Ausweis mehr hinterlegt',
                text: `Ohne Ausweis kann sich ${u.name} in keinem Modul mehr anmelden. Trotzdem speichern?`,
                ok: 'Trotzdem speichern',
                gefahr: true,
            });
            if (!ok) return;
        }
        const ausweise = aktiv.map((a) => (a.id
            ? { id: a.id, bezeichnung: a.bezeichnung, haupt: a.haupt }
            : { rfid: a.rfid, bezeichnung: a.bezeichnung, haupt: a.haupt }));

        const rechte = {};
        for (const r of ALLE_RECHTE) rechte[r.key] = document.querySelector(`[data-recht="${r.key}"]`).checked ? 1 : 0;

        $('benutzer-submit').disabled = true;
        const r = await api('benutzer_speichern', { id: u ? u.id : 0, name, schicht, ausweise, rechte });
        $('benutzer-submit').disabled = false;

        if (!r.success) {
            const feld = { name: 'benutzer-name', ausweise: 'ausweis-code' }[r.code];
            return fehler(r.error || 'Speichern fehlgeschlagen.', feld);
        }

        $('dlg-benutzer').close();
        toast(r.neu ? `${r.benutzer.name} wurde angelegt.` : 'Änderungen gespeichert.', 'success');
        await ladeUebersicht();
        if (state.tab === 'protokoll') ladeProtokoll();
    }

    // --- Ausweise und Chips im Dialog ---
    // Alles wird erst mit „Speichern“ übernommen; bis dahin lässt sich jede Änderung zurücknehmen.
    function stelleHauptausweisSicher() {
        const aktiv = state.ausweise.filter((a) => !a.entfernt);
        state.ausweise.forEach((a) => { if (a.entfernt) a.haupt = false; });
        if (aktiv.length && !aktiv.some((a) => a.haupt)) aktiv[0].haupt = true;
    }

    function fuegeAusweisHinzu() {
        const codeFeld = $('ausweis-code');
        const code = codeFeld.value.trim();
        const melde = (text) => { showError('benutzer-error', text); codeFeld.classList.add('invalid'); codeFeld.focus(); return false; };

        if (!code) return melde('Bitte den Ausweis oder Chip am Lesegerät scannen.');
        if (/\s/.test(code) || code.length > 64) return melde('Der Code ist ungültig (keine Leerzeichen, höchstens 64 Zeichen).');
        if (state.ausweise.some((a) => !a.id && a.rfid.toLowerCase() === code.toLowerCase())) {
            codeFeld.value = '';
            return melde('Dieser Ausweis steht schon in der Liste.');
        }
        if (state.ausweise.filter((a) => !a.entfernt).length >= MAX_AUSWEISE) return melde(`Höchstens ${MAX_AUSWEISE} Ausweise je Benutzer.`);

        const aktiv = state.ausweise.filter((a) => !a.entfernt);
        const bezeichnung = $('ausweis-bezeichnung').value.trim().replace(/\s+/g, ' ').slice(0, 40)
            || (aktiv.length ? 'Zusatzchip' : 'Werksausweis');
        state.ausweise.push({ id: 0, rfid: code, bezeichnung, haupt: !aktiv.length, ende: code.length > 5 ? code.slice(-3) : '', neu: true });

        codeFeld.value = '';
        $('ausweis-bezeichnung').value = '';
        showError('benutzer-error', '');
        renderAusweise();
        codeFeld.focus();
        return true;
    }

    function renderAusweise() {
        const liste = state.ausweise;
        const aktiv = liste.filter((a) => !a.entfernt);

        setChildren($('ausweis-liste'), liste.map((a) => {
            let meta;
            if (a.entfernt) meta = a.neu ? 'Wird nicht hinterlegt' : 'Wird beim Speichern entfernt';
            else if (a.neu) meta = 'Neu – wird beim Speichern hinterlegt';
            else if (a.erstellt_von === 'Übernahme') meta = 'aus der bisherigen Verwaltung übernommen';
            else meta = [a.erstellt_am ? 'seit ' + formatDatum(a.erstellt_am) : '', a.erstellt_von ? 'von ' + a.erstellt_von : ''].filter(Boolean).join(' ');

            const name = el('input', {
                class: 'ausweis-name', type: 'text', maxlength: '40', value: a.bezeichnung,
                'aria-label': 'Bezeichnung des Ausweises', list: 'ausweis-vorschlaege', disabled: a.entfernt,
            });
            name.addEventListener('input', () => { a.bezeichnung = name.value.replace(/\s+/g, ' ').trim() || 'Ausweis'; });
            name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });

            const aktionen = [];
            if (a.entfernt) {
                aktionen.push(el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { a.entfernt = false; stelleHauptausweisSicher(); renderAusweise(); } },
                    icon('undo', 'ic-sm'), 'Rückgängig'));
            } else {
                aktionen.push(a.haupt
                    ? el('span', { class: 'chip chip-accent', title: 'Gilt in allen Modulen', text: 'Hauptausweis' })
                    : el('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'Zum Hauptausweis machen', onclick: () => {
                        state.ausweise.forEach((b) => { b.haupt = b === a; });
                        renderAusweise();
                    } }, icon('star', 'ic-sm'), 'Als Hauptausweis'));
                aktionen.push(el('button', {
                    class: 'icon-btn', type: 'button', title: 'Ausweis entfernen', 'aria-label': `${a.bezeichnung} entfernen`,
                    onclick: () => {
                        if (a.neu) state.ausweise.splice(state.ausweise.indexOf(a), 1);
                        else a.entfernt = true;
                        stelleHauptausweisSicher();
                        renderAusweise();
                    },
                }, icon('trash', 'ic-sm')));
            }

            return el('li', { class: ['ausweis', a.haupt ? 'haupt' : '', a.neu ? 'neu' : '', a.entfernt ? 'entfernt' : ''].filter(Boolean).join(' ') },
                el('span', { class: 'ausweis-icon' }, icon('badge', 'ic-sm')),
                el('span', { class: 'ausweis-text' },
                    name,
                    el('span', { class: 'ausweis-meta' },
                        a.ende ? ['endet auf ', el('code', { text: '…' + a.ende })] : null,
                        a.ende && meta ? ' · ' : null,
                        meta)),
                el('span', { class: 'ausweis-aktionen' }, aktionen));
        }));

        $('ausweis-leer').hidden = aktiv.length > 0 || (!state.bearbeitet && !liste.length);
        $('ausweis-zahl').textContent = aktiv.length ? (aktiv.length === 1 ? '1 hinterlegt' : `${aktiv.length} hinterlegt`) : '';
        $('ausweise-pflicht').hidden = !!state.bearbeitet;
        $('ausweis-hinzufuegen').disabled = aktiv.length >= MAX_AUSWEISE;
    }

    async function loescheBenutzer() {
        const u = state.bearbeitet;
        if (!u) return;
        const ok = await bestaetigen({
            titel: 'Benutzer löschen',
            text: `${u.name} wird endgültig gelöscht und kann sich danach in keinem Modul mehr anmelden. Das kann nicht rückgängig gemacht werden.`,
            ok: 'Endgültig löschen',
            gefahr: true,
        });
        if (!ok) return;

        const r = await api('benutzer_loeschen', { id: u.id });
        if (!r.success) { showError('benutzer-error', r.error || 'Löschen fehlgeschlagen.'); return; }
        $('dlg-benutzer').close();
        toast(`${u.name} wurde gelöscht.`, 'success');
        await ladeUebersicht();
        if (state.tab === 'protokoll') ladeProtokoll();
    }

    // --- Reiter ---
    function initTabs() {
        document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => {
            state.tab = btn.dataset.tab;
            document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
            for (const name of ['benutzer', 'protokoll', 'import']) $('tab-' + name).hidden = name !== state.tab;
            if (state.tab === 'protokoll') ladeProtokoll();
        }));
    }

    // --- Änderungsprotokoll ---
    const AKTIONEN = {
        ANGELEGT: { text: 'Angelegt', chip: 'chip-success' },
        GEAENDERT: { text: 'Geändert', chip: 'chip-accent' },
        GELOESCHT: { text: 'Gelöscht', chip: 'chip-danger' },
    };

    async function ladeProtokoll() {
        const r = await api('protokoll');
        if (!r.success) return;
        setChildren($('protokoll-tbody'), r.data.map((p) => {
            const aktion = AKTIONEN[p.aktion] || { text: p.aktion, chip: '' };
            return el('tr', {},
                el('td', { class: 'nowrap', text: formatDatumZeit(p.zeitpunkt) }),
                el('td', {}, el('span', { class: ('chip ' + aktion.chip).trim(), text: aktion.text })),
                el('td', { class: 'nowrap' }, el('strong', { text: p.benutzer_name })),
                el('td', { text: p.details || '–' }),
                el('td', { class: 'nowrap', text: p.admin_name }));
        }));
        $('protokoll-empty').hidden = r.data.length > 0;
    }

    // --- Datenübernahme aus den JSON-Dateien der früheren Version ---
    async function leseJson(id, label) {
        const file = $(id).files[0];
        if (!file) return undefined;
        try {
            return JSON.parse(await file.text());
        } catch (err) {
            throw new Error(`${label} ist keine gültige JSON-Datei.`);
        }
    }

    function initImport() {
        $('import-start').addEventListener('click', async () => {
            const box = $('import-result');
            const zeige = (text, fehler = false) => {
                box.textContent = text;
                box.classList.toggle('error', fehler);
                box.hidden = false;
            };

            let wochenplan, quicktexte, brett, telefon;
            try {
                wochenplan = await leseJson('import-wochenplan', 'wochenplan.json');
                quicktexte = await leseJson('import-quick', 'Quickbearbeitung.json');
                brett = await leseJson('import-brett', 'schwarzesbrett.json');
                telefon = await leseJson('import-telefon', 'telefonbuch.json');
            } catch (err) {
                zeige(err.message, true);
                return;
            }

            const istObjekt = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
            if ([wochenplan, quicktexte, brett, telefon].every((v) => v === undefined)) return zeige('Bitte mindestens eine Datei auswählen.', true);
            if (wochenplan !== undefined && !istObjekt(wochenplan)) return zeige('wochenplan.json hat nicht das erwartete Format (Jahr → KW → Tag → Schicht).', true);
            if (quicktexte !== undefined && !Array.isArray(quicktexte)) return zeige('Quickbearbeitung.json hat nicht das erwartete Format (Liste von Texten).', true);
            if (brett !== undefined && !(istObjekt(brett) && typeof brett.text === 'string')) return zeige('schwarzesbrett.json hat nicht das erwartete Format ({ "text": … }).', true);
            if (telefon !== undefined && !istObjekt(telefon)) return zeige('telefonbuch.json hat nicht das erwartete Format (Nummer → Name).', true);

            const btn = $('import-start');
            btn.disabled = true;
            const zeilen = [];
            let fehlerhaft = false;

            if (wochenplan !== undefined || quicktexte !== undefined) {
                const payload = { ueberschreiben: $('import-ueberschreiben').checked };
                if (wochenplan !== undefined) payload.wochenplan = wochenplan;
                if (quicktexte !== undefined) payload.quicktexte = quicktexte;
                const r = await api('import_json', payload, WOCHENPLAN_API);
                if (r.success) {
                    const s = r.statistik;
                    if (wochenplan !== undefined) zeilen.push(`Wochenplan: ${s.eintraege_neu} Einträge und ${s.kwinfos} KW-Infos übernommen, ${s.eintraege_uebersprungen} bereits vorhanden.`);
                    if (quicktexte !== undefined) zeilen.push(`Quick-Texte: ${s.quicktexte_neu} übernommen, ${s.quicktexte_uebersprungen} bereits vorhanden.`);
                } else {
                    fehlerhaft = true;
                    zeilen.push('Wochenplan: ' + (r.error || 'Übernahme fehlgeschlagen.'));
                }
            }

            if (brett !== undefined || telefon !== undefined) {
                const payload = {};
                if (brett !== undefined) payload.schwarzesbrett = brett;
                if (telefon !== undefined) payload.telefonbuch = telefon;
                const r = await api('import_altdaten', payload, STARTSEITE_API);
                if (r.success) {
                    const s = r.statistik;
                    if (brett !== undefined) zeilen.push(`Schwarzes Brett: ${s.meldungen_neu} Meldung übernommen, ${s.meldungen_uebersprungen} bereits vorhanden.`);
                    if (telefon !== undefined) zeilen.push(`Telefonnummern: ${s.telefone_neu} übernommen, ${s.telefone_uebersprungen} bereits in der Datenbank belegt.`);
                } else {
                    fehlerhaft = true;
                    zeilen.push('Startseite: ' + (r.error || 'Übernahme fehlgeschlagen.'));
                }
            }

            btn.disabled = false;
            zeige(zeilen.join('\n'), fehlerhaft);
        });
    }

    async function init() {
        initShell();
        initAuth();
        initBenutzerListe();
        initBenutzerDialog();
        initTabs();
        initImport();

        if (await pruefeAnmeldung()) await ladeUebersicht();

        // In einem anderen Reiter ab- oder umgemeldet? Beim Zurückkehren neu prüfen.
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden || $('dlg-benutzer').open) return;
            const warAdmin = !$('admin-area').hidden;
            const istAdmin = await pruefeAnmeldung();
            if (istAdmin && !warAdmin) await ladeUebersicht();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
