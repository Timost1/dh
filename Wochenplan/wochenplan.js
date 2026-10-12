const API = 'api.php';
let currentUser = null;
let currentYear = new Date().getFullYear();
let currentKw = getWeekNumberLocal(new Date());
let editMode = false;
let lockInterval = null, lockCheckInterval = null, heartbeatInterval = null;
let weekData = {}; // { "0": {frueh:"", mittag:"", nacht:""}, ... }
let lastActiveElement = null;

function getWeekNumberLocal(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function getWeeksInYear(year) {
    const d = new Date(year, 11, 31);
    const w = getWeekNumberLocal(d);
    return w === 1 ? getWeekNumberLocal(new Date(year, 11, 24)) : w;
}
function getDateOfISOWeek(week, year) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const start = simple;
    if (dow <= 4) start.setDate(simple.getDate() - simple.getDay() + 1);
    else start.setDate(simple.getDate() + 8 - simple.getDay());
    return start;
}

function markdownToHtml(md) {
    if (!md) return "";
    let html = md.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    html = html.replace(/^# (.*)$/gm, '<b style="font-size:1.1em;">$1</b>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    html = html.replace(/__(.*?)__/g, '<u>$1</u>');
    html = html.replace(/_(.*?)_/g, '<i>$1</i>');
    html = html.replace(/---+/g, '<div style="border-top:2px solid #666;margin:4px 0;"></div>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/&lt;span (.*?)&gt;(.*?)&lt;\/span&gt;/g, '<span $1>$2</span>');
    return html;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', warning: 'bg-amber-500' };
    const el = document.createElement('div');
    el.className = `pointer-events-auto px-5 py-3 rounded-xl text-white font-semibold text-sm shadow-lg animate-fade-in-up ${colors[type] || colors.success}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

async function apiCall(action, payload = {}, method = 'POST') {
    let url = API;
    let opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (method === 'GET') {
        const params = new URLSearchParams({ action, ...payload });
        url += '?' + params.toString();
    } else {
        opts.body = JSON.stringify({ action, ...payload });
    }
    try {
        const res = await fetch(url, opts);
        const text = await res.text();
        if (!text) {
            console.warn(`Leere Antwort von API (action: ${action})`);
            return { success: false, error: 'Leere Antwort vom Server' };
        }
        try {
            return JSON.parse(text);
        } catch (parseErr) {
            console.error(`Ungültiges JSON von API (action: ${action}):`, text);
            return { success: false, error: 'Ungültige Server-Antwort' };
        }
    } catch (networkErr) {
        console.error(`Netzwerkfehler bei API-Aufruf (action: ${action}):`, networkErr);
        return { success: false, error: 'Netzwerkfehler' };
    }
}

// --- AUTH ---
async function checkAuth() {
    const r = await apiCall('check_auth', {}, 'GET');
    if (r.success) {
        currentUser = r.user;
        updateAuthUI(true);
    } else {
        currentUser = null;
        updateAuthUI(false);
    }
}
async function login(rfid) {
    const r = await apiCall('login', { rfid });
    if (r.success) {
        currentUser = r.user;
        document.getElementById('login-modal').classList.add('hidden');
        updateAuthUI(true);
        showToast(`Willkommen, ${r.user.name}!`);
        startHeartbeat();
    } else {
        document.getElementById('login-error').textContent = r.error || 'Fehler';
        document.getElementById('login-error').classList.remove('hidden');
    }
}
async function logout() {
    if (editMode) await releaseLock();
    await apiCall('logout');
    currentUser = null;
    updateAuthUI(false);
    document.getElementById('logout-modal').classList.add('hidden');
    stopHeartbeat();
    stopLockCheck();
    showToast('Abgemeldet.', 'warning');
}
function updateAuthUI(isLoggedIn) {
    const loginBtn = document.getElementById('login-btn');
    const profile = document.getElementById('user-profile');
    const editBtn = document.getElementById('btn-edit-toggle');
    const loginPlaceholder = document.getElementById('login-placeholder');
    const mainContent = document.getElementById('main-content-container');

    try {
        if (isLoggedIn && currentUser) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (profile) {
                profile.classList.remove('hidden');
                profile.classList.add('flex');
            }
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) userNameEl.textContent = currentUser.name;

            if (editBtn) {
                if (currentUser.kannWochenplanBearbeiten == 1 || currentUser.isAdmin == 1) {
                    editBtn.style.display = '';
                } else {
                    editBtn.style.display = 'none';
                }
            }
            startLockCheck();

            if (loginPlaceholder) loginPlaceholder.style.display = 'none';
            if (mainContent) mainContent.style.display = '';

            // Wochenplan erst jetzt laden, da Auth vorausgesetzt wird
            loadWeek();
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (profile) {
                profile.classList.add('hidden');
                profile.classList.remove('flex');
            }
            if (editBtn) editBtn.style.display = 'none';
            stopLockCheck();

            if (loginPlaceholder) loginPlaceholder.style.display = 'flex';
            if (mainContent) mainContent.style.display = 'none';
        }
    } catch (err) {
        console.error('Fehler in updateAuthUI:', err);
    }
}

function startHeartbeat() {
    stopHeartbeat();
    apiCall('session_heartbeat', { userId: currentUser.id, userName: currentUser.name });
    heartbeatInterval = setInterval(() => {
        if (currentUser) apiCall('session_heartbeat', { userId: currentUser.id, userName: currentUser.name });
    }, 60000);
}
function stopHeartbeat() { if (heartbeatInterval) clearInterval(heartbeatInterval); heartbeatInterval = null; }

function startLockCheck() {
    stopLockCheck();
    lockCheckInterval = setInterval(async () => {
        const status = await apiCall('lock_status', {}, 'GET');
        const pill = document.getElementById('lock-pill');
        if (status.isLocked) {
            pill.classList.remove('hidden'); pill.classList.add('flex');
            document.getElementById('lock-pill-text').textContent = status.userName;
            if (editMode && currentUser && status.userId !== currentUser.id) {
                showToast(`${status.userName} bearbeitet jetzt. Bearbeitung beendet.`, 'error');
                exitEditMode(false);
            }
        } else {
            pill.classList.add('hidden'); pill.classList.remove('flex');
        }
    }, 3000);
}
function stopLockCheck() { if (lockCheckInterval) clearInterval(lockCheckInterval); lockCheckInterval = null; }

async function acquireLock() {
    if (!currentUser) { showToast('Bitte anmelden.', 'error'); return false; }
    const r = await apiCall('lock_acquire', { userId: currentUser.id, userName: currentUser.name });
    if (!r.success) { showToast(r.message, 'error'); return false; }
    lockInterval = setInterval(() => apiCall('lock_acquire', { userId: currentUser.id, userName: currentUser.name }), 20000);
    return true;
}
async function releaseLock() {
    if (lockInterval) clearInterval(lockInterval);
    if (currentUser) await apiCall('lock_release', { userId: currentUser.id });
}

// --- WEEK RENDERING ---
async function loadWeek() {
    const r = await apiCall('get_week', { jahr: currentYear, kw: currentKw }, 'GET');
    weekData = r.data || {};
    document.getElementById('kwinfo').innerHTML = r.kwinfo || '';
    renderWeek();
}

function renderWeek() {
    document.getElementById('week-title').textContent = `KW ${currentKw} / ${currentYear}`;
    const weekStart = getDateOfISOWeek(currentKw, currentYear);
    const tageLang = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

    let kopf = `<th class="p-2 w-24"></th>`;
    for (let i = 0; i < 7; i++) kopf += `<th class="p-2 text-center">${tageLang[i]}</th>`;
    document.getElementById('wochenkopf').innerHTML = kopf;

    let reihe = `<td class="p-2"></td>`;
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        let cls = [];
        const isFeiertag = (typeof istFeiertag === 'function' && istFeiertag(d));
        const isFerien = (typeof istFerienTag === 'function' && istFerienTag(d));
        if (isFeiertag) cls.push('feiertag-col');
        if (d.getDay() === 0 || d.getDay() === 6) cls.push('wochenende-col');
        if (isFerien) cls.push('ferien-col');
        const isToday = d.toDateString() === new Date().toDateString();
        if (isToday) cls.push('today-col');
        const feiertagName = isFeiertag ? `<div class="text-[10px] text-rose-500 font-bold">${getFeiertagsName(d)}</div>` : '';
        const schichtLabel = (typeof getSchichtForDate === 'function') ? getSchichtForDate(d) : '';
        reihe += `<td class="p-2 text-center rounded-lg ${cls.join(' ')}">
            <div class="font-bold">${d.toLocaleDateString('de-DE', {day:'numeric', month:'numeric'})}</div>
            ${feiertagName}
            <div class="text-[10px] text-slate-500 mt-0.5 font-semibold">${schichtLabel}</div>
        </td>`;
    }
    document.getElementById('wochenreihe').innerHTML = reihe;

    function makeRow(label, key) {
        let row = `<tr><td class="p-2 font-bold align-top text-sm">${label}</td>`;
        for (let i = 0; i < 7; i++) {
            const value = weekData?.[i]?.[key] || '';
            const dayBg = (i % 2 === 0) ? '' : 'bg-slate-50/60 dark:bg-white/[0.02]';
            row += `<td class="p-2 align-top ${dayBg}">
                <div class="schichtfeld-container" data-day="${i}" data-shift="${key}">
                    <div class="schichtfeld editable-field" contenteditable="false" oninput="onFieldInput(this)" onfocus="onFieldFocus(this)" placeholder="${editMode ? 'Text eingeben...' : ''}">${value}</div>
                </div>
            </td>`;
        }
        return row + `</tr>`;
    }

    document.getElementById('schicht-body').innerHTML =
        makeRow('Frühschicht', 'frueh') +
        makeRow('Mittagsschicht', 'mittag') +
        makeRow('Nachtschicht', 'nacht');

    if (editMode) {
        document.querySelectorAll('.schichtfeld').forEach(el => {
            el.setAttribute('contenteditable', 'true');
        });
    }
}

function onFieldFocus(el) {
    lastActiveElement = el;
}
window.onFieldFocus = onFieldFocus;

function onFieldInput(el) {
    lastActiveElement = el;
    showAutofillSuggestions(el);
}

// --- Autofill / Dropdown-Vorschläge für Quick-Texte ---
let autofillBox = null;
let autofillActiveIndex = -1;

function ensureAutofillBox() {
    if (autofillBox) return autofillBox;
    autofillBox = document.createElement('div');
    autofillBox.id = 'autofill-suggestions';
    autofillBox.className = 'fixed z-[90] bg-surface dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-2xl overflow-hidden hidden max-h-56 overflow-y-auto custom-scrollbar';
    document.body.appendChild(autofillBox);
    return autofillBox;
}

function hideAutofillSuggestions() {
    if (autofillBox) {
        autofillBox.classList.add('hidden');
        autofillBox.innerHTML = '';
    }
    autofillActiveIndex = -1;
}
window.hideAutofillSuggestions = hideAutofillSuggestions;

function getCaretTextBefore(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    try {
        const range = sel.getRangeAt(0).cloneRange();
        range.selectNodeContents(el);
        range.setEnd(sel.anchorNode, sel.anchorOffset);
        return range.toString();
    } catch (e) {
        return el.textContent || '';
    }
}

async function showAutofillSuggestions(el) {
    if (!el || !el.classList.contains('schichtfeld') || el.getAttribute('contenteditable') !== 'true') { hideAutofillSuggestions(); return; }

    const textBeforeCursor = getCaretTextBefore(el);
    const lastLine = textBeforeCursor.split('\n').pop().trim();

    if (lastLine.length < 2) { hideAutofillSuggestions(); return; }

    if (!quickTextsCache || !quickTextsCache.length) {
        quickTextsCache = await getQuickTexts();
    }

    const term = lastLine.toLowerCase();
    const matches = quickTextsCache.filter(q => q.text.toLowerCase().includes(term)).slice(0, 6);

    if (!matches.length) { hideAutofillSuggestions(); return; }

    const box = ensureAutofillBox();
    box.innerHTML = matches.map((q, i) => `
        <div class="autofill-item px-3 py-2 text-sm cursor-pointer hover:bg-brand/10 dark:hover:bg-brand/20 border-b last:border-0 border-border-light dark:border-border-dark whitespace-pre-wrap ${i === 0 ? 'bg-brand/5' : ''}"
             data-idx="${i}">
            ${escapeHtml(q.text.length > 80 ? q.text.substring(0, 80) + '…' : q.text)}
        </div>
    `).join('');

    const rect = el.getBoundingClientRect();
    box.style.left = rect.left + 'px';
    box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    box.style.width = Math.max(220, rect.width) + 'px';
    box.classList.remove('hidden');
    autofillActiveIndex = 0;

    box.querySelectorAll('.autofill-item').forEach(item => {
        item.onmousedown = (e) => {
            e.preventDefault();
            const idx = parseInt(item.getAttribute('data-idx'));
            applyAutofillSuggestion(el, matches[idx].text, lastLine);
        };
    });

    el._autofillMatches = matches;
    el._autofillLastLine = lastLine;
}

function applyAutofillSuggestion(el, suggestionText, lastLine) {
    el.focus();
    // getippten Suchbegriff löschen
    for (let i = 0; i < lastLine.length; i++) {
        document.execCommand('delete', false);
    }
    document.execCommand('insertText', false, suggestionText);
    onFieldInput(el);
    hideAutofillSuggestions();
}

document.addEventListener('keydown', (e) => {
    if (!autofillBox || autofillBox.classList.contains('hidden')) return;
    const items = Array.from(autofillBox.querySelectorAll('.autofill-item'));
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autofillActiveIndex = Math.min(autofillActiveIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('bg-brand/5', i === autofillActiveIndex));
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autofillActiveIndex = Math.max(autofillActiveIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('bg-brand/5', i === autofillActiveIndex));
    } else if (e.key === 'Tab' || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        const el = document.activeElement;
        if (el && el._autofillMatches && el._autofillMatches[autofillActiveIndex]) {
            applyAutofillSuggestion(el, el._autofillMatches[autofillActiveIndex].text, el._autofillLastLine);
        }
    } else if (e.key === 'Escape') {
        hideAutofillSuggestions();
    }
});

document.addEventListener('click', (e) => {
    if (autofillBox && !autofillBox.contains(e.target) && !(e.target.classList && e.target.classList.contains('schichtfeld'))) {
        hideAutofillSuggestions();
    }
});

// --- Formatierung (WYSIWYG wie in Word) ---
function formatText(cmd, value = null) {
    if (!lastActiveElement) { showToast('Bitte zuerst ein Feld auswählen.', 'error'); return; }
    lastActiveElement.focus();
    document.execCommand(cmd, false, value);
    onFieldInput(lastActiveElement);
}
window.formatText = formatText;

function makeSelectionHyperlink() {
    if (!lastActiveElement) { showToast('Bitte zuerst ein Eingabefeld auswählen.', 'error'); return; }
    const urlBase = document.getElementById('link-url-input').value.trim();
    if (!urlBase) { showToast('Bitte Hyperlink-Adresse eingeben.', 'error'); return; }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { showToast('Bitte Text markieren.', 'error'); return; }
    let fullUrl = urlBase;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) fullUrl = 'http://' + fullUrl;
    lastActiveElement.focus();
    document.execCommand('createLink', false, fullUrl);
    onFieldInput(lastActiveElement);
}
window.makeSelectionHyperlink = makeSelectionHyperlink;

// Markdown: auch Links rendern
const _origMarkdownToHtml = markdownToHtml;
markdownToHtml = function(md) {
    let html = _origMarkdownToHtml(md);
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-brand underline">$1</a>');
    return html;
};

// --- Quick-Texte (vereinheitlichtes, intuitives Panel) ---
async function getQuickTexts() {
    const r = await apiCall('get_quicktexte', {}, 'GET');
    return r.success ? r.data : [];
}
async function setQuickTexts(arr) {
    await apiCall('save_quicktexte', { quicktexte: arr });
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
}
window.closeModal = closeModal;

let quickTextsCache = [];
let quickEditingIndex = null;
let quickTargetDay = null;
let quickTargetShift = null;

async function openQuickPanel() {
    quickTextsCache = await getQuickTexts();
    quickEditingIndex = null;

    const firstContainer = document.querySelector('.schichtfeld-container');
    if (lastActiveElement && lastActiveElement.isConnected && lastActiveElement.closest) {
        const c = lastActiveElement.closest('.schichtfeld-container');
        quickTargetDay = c?.getAttribute('data-day') ?? (firstContainer?.getAttribute('data-day') ?? '0');
        quickTargetShift = c?.getAttribute('data-shift') ?? (firstContainer?.getAttribute('data-shift') ?? 'frueh');
    } else if (firstContainer) {
        quickTargetDay = firstContainer.getAttribute('data-day');
        quickTargetShift = firstContainer.getAttribute('data-shift');
    } else {
        quickTargetDay = null;
        quickTargetShift = null;
    }

    renderQuickPanel('');
}
window.openQuickPanel = openQuickPanel;

function getTargetTextarea() {
    if (quickTargetDay === null || quickTargetShift === null) return null;
    const container = document.querySelector(`.schichtfeld-container[data-day="${quickTargetDay}"][data-shift="${quickTargetShift}"]`);
    return container ? container.querySelector('.schichtfeld') : null;
}
window.getTargetTextarea = getTargetTextarea;

function setQuickTarget(day, shift) {
    quickTargetDay = day;
    quickTargetShift = shift;
    renderQuickPanel(document.getElementById('quick-search')?.value || '');
}
window.setQuickTarget = setQuickTarget;

function renderQuickPanel(searchTerm) {
    const modalRoot = document.getElementById('modal-root');
    const term = (searchTerm || '').toLowerCase();
    const filtered = quickTextsCache
        .map((q, i) => ({ ...q, _idx: i }))
        .filter(q => !term || q.text.toLowerCase().includes(term));

    const groupOf = (text) => {
        const firstLine = (text.split('\n')[0] || '').replace(/^#+\s*/, '').replace(/\*\*|__/g, '').trim();
        return firstLine ? firstLine.substring(0, 30) : 'Allgemein';
    };
    const groups = ['Alle', ...new Set(quickTextsCache.map(q => groupOf(q.text)))];

    const dayNames = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
    const shiftNames = { frueh: 'Frühschicht', mittag: 'Mittagsschicht', nacht: 'Nachtschicht' };
    const canInsert = editMode && quickTargetDay !== null && quickTargetShift !== null;

    let targetSelector = '';
    if (editMode) {
        targetSelector = `
            <div class="mx-6 mt-3 p-3 rounded-xl bg-brand/5 border border-brand/20 flex items-center gap-2 flex-wrap">
                <span class="material-symbols-outlined text-brand text-[16px]">edit_note</span>
                <span class="text-xs font-bold text-brand">Einfügen in:</span>
                <select id="quick-target-day" onchange="setQuickTarget(this.value, document.getElementById('quick-target-shift').value)"
                    class="bg-white dark:bg-surface-dark border border-border-light dark:border-white/10 rounded-lg px-2 py-1 text-xs font-bold outline-none">
                    ${dayNames.map((d, i) => `<option value="${i}" ${String(i) === String(quickTargetDay) ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
                <select id="quick-target-shift" onchange="setQuickTarget(document.getElementById('quick-target-day').value, this.value)"
                    class="bg-white dark:bg-surface-dark border border-border-light dark:border-white/10 rounded-lg px-2 py-1 text-xs font-bold outline-none">
                    ${Object.entries(shiftNames).map(([k, v]) => `<option value="${k}" ${k === quickTargetShift ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
            </div>`;
    } else {
        targetSelector = `
            <div class="mx-6 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px]">info</span>
                Aktiviere zuerst den Bearbeitungsmodus, um Quick-Texte einzufügen. Verwalten (bearbeiten/löschen) ist trotzdem möglich.
            </div>`;
    }

    modalRoot.innerHTML = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-bg-dark/70 backdrop-blur-sm" onclick="closeModal()"></div>
            <div class="relative bg-surface dark:bg-surface-dark w-full max-w-xl max-h-[85vh] rounded-2xl shadow-2xl border border-border-light dark:border-border-dark flex flex-col overflow-hidden">
                <div class="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center gap-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-brand">bolt</span>
                        <h3 class="text-lg font-bold">Quick-Texte</h3>
                    </div>
                    <button onclick="closeModal()" class="w-9 h-9 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center hover:bg-slate-200">&times;</button>
                </div>

                ${targetSelector}

                <div class="px-6 pt-4 space-y-2">
                    <div class="relative">
                        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                        <input type="text" id="quick-search" placeholder="Quick-Text suchen..." value="${escapeHtml(searchTerm || '')}"
                            oninput="filterQuickPanelBySearch(this.value)"
                            class="w-full bg-slate-50 dark:bg-bg-dark border-none rounded-xl pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-brand outline-none">
                    </div>
                    <select id="quick-group-select" onchange="filterQuickPanelByGroup(this.value)" class="w-full bg-slate-50 dark:bg-bg-dark border-none rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-brand outline-none cursor-pointer">
                        ${groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
                    </select>
                    <p class="text-[11px] text-slate-400 mt-1">Klicke auf einen Text, um ihn in das oben gewählte Feld einzufügen.</p>
                </div>

                <div class="p-6 pt-3 space-y-2 overflow-y-auto custom-scrollbar flex-1" id="quick-panel-list">
                    ${filtered.length ? filtered.map(q => renderQuickItem(q, canInsert)).join('') : '<p class="text-sm text-slate-500 text-center py-6">Keine Quick-Texte gefunden.</p>'}
                </div>

                <div class="p-6 border-t border-border-light dark:border-border-dark bg-slate-50 dark:bg-bg-dark/50 space-y-2">
                    <textarea id="quick-new-text" rows="2" placeholder="Neuen Quick-Text eingeben und hinzufügen..." class="w-full bg-white dark:bg-surface-dark border border-border-light dark:border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand outline-none resize-y"></textarea>
                    <button onclick="addQuickTextInline()" class="w-full py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-hover transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">add</span> Quick-Text hinzufügen
                    </button>
                </div>
            </div>
        </div>
    `;
}
window.renderQuickPanel = renderQuickPanel;

function filterQuickPanelBySearch(term) {
    const groupSelect = document.getElementById('quick-group-select');
    const group = groupSelect ? groupSelect.value : 'Alle';
    filterQuickPanelByGroup(group, term);
}
window.filterQuickPanelBySearch = filterQuickPanelBySearch;

function filterQuickPanelByGroup(group, searchTermOverride) {
    const searchInput = document.getElementById('quick-search');
    const term = (searchTermOverride !== undefined ? searchTermOverride : (searchInput?.value || '')).toLowerCase();
    const groupOf = (text) => {
        const firstLine = (text.split('\n')[0] || '').replace(/^#+\s*/, '').replace(/\*\*|__/g, '').trim();
        return firstLine ? firstLine.substring(0, 30) : 'Allgemein';
    };
    const canInsert = editMode && quickTargetDay !== null && quickTargetShift !== null;
    const filtered = quickTextsCache
        .map((q, i) => ({ ...q, _idx: i }))
        .filter(q => (!term || q.text.toLowerCase().includes(term)) && (group === 'Alle' || groupOf(q.text) === group));

    const listEl = document.getElementById('quick-panel-list');
    if (listEl) {
        listEl.innerHTML = filtered.length ? filtered.map(q => renderQuickItem(q, canInsert)).join('') : '<p class="text-sm text-slate-500 text-center py-6">Keine Quick-Texte gefunden.</p>';
    }
}
window.filterQuickPanelByGroup = filterQuickPanelByGroup;

function renderQuickItem(q, canInsert) {
    const isEditing = quickEditingIndex === q._idx;
    if (isEditing) {
        return `
            <div class="p-3 bg-slate-50 dark:bg-bg-dark rounded-xl border border-brand/30">
                <textarea id="quick-edit-textarea-${q._idx}" rows="3" oninput="autoExpandTextarea(this)" class="w-full bg-white dark:bg-surface-dark border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-brand outline-none resize-none overflow-hidden">${escapeHtml(q.text)}</textarea>
                <div class="flex gap-2 mt-2">
                    <button onclick="saveQuickEditInline(${q._idx})" class="flex-1 py-1.5 rounded-lg bg-brand text-white text-xs font-bold">Speichern</button>
                    <button onclick="quickEditingIndex=null; renderQuickPanel(document.getElementById('quick-search')?.value||'')" class="flex-1 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 text-xs font-bold">Abbrechen</button>
                </div>
            </div>
        `;
    }
    const clickHandler = canInsert ? `insertQuickTextDirect(${q._idx})` : `showToast('Bitte zuerst den Bearbeitungsmodus aktivieren.', 'error')`;
    const cursorClass = canInsert ? 'cursor-pointer hover:bg-brand/5 dark:hover:bg-brand/10 hover:border-brand/30' : 'cursor-not-allowed opacity-70';
    return `
        <div class="group flex items-start gap-2 p-3 bg-slate-50 dark:bg-bg-dark rounded-xl border border-transparent transition-all ${cursorClass}"
             onclick="${clickHandler}" title="${canInsert ? 'Klicken zum Einfügen' : 'Bearbeitungsmodus nötig'}">
            <span class="material-symbols-outlined text-slate-300 group-hover:text-brand text-[18px] mt-0.5 shrink-0">chevron_right</span>
            <span class="flex-1 text-sm whitespace-pre-wrap leading-snug">${escapeHtml(q.text)}</span>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onclick="event.stopPropagation(); quickEditingIndex=${q._idx}; renderQuickPanel(document.getElementById('quick-search')?.value||''); setTimeout(()=>{const ta=document.getElementById('quick-edit-textarea-${q._idx}'); if(ta) autoExpandTextarea(ta);}, 0)" class="w-7 h-7 rounded-lg bg-white dark:bg-white/5 flex items-center justify-center hover:text-brand" title="Bearbeiten">
                    <span class="material-symbols-outlined text-[15px]">edit</span>
                </button>
                <button onclick="event.stopPropagation(); removeQuickTextInline(${q._idx})" class="w-7 h-7 rounded-lg bg-white dark:bg-white/5 flex items-center justify-center hover:text-rose-500" title="Löschen">
                    <span class="material-symbols-outlined text-[15px]">delete</span>
                </button>
            </div>
        </div>
    `;
}
window.renderQuickItem = renderQuickItem;

function insertQuickTextDirect(idx) {
    const el = getTargetTextarea();
    if (!el) {
        showToast('Zielfeld nicht gefunden. Bitte Tag/Schicht oben wählen.', 'error');
        return;
    }
    const q = quickTextsCache[idx];
    if (!q) return;
    el.focus();
    const needsNewline = el.textContent.trim().length > 0;
    if (needsNewline) document.execCommand('insertHTML', false, '<br>');
    document.execCommand('insertText', false, q.text);
    onFieldInput(el);
    showToast('Text eingefügt.');
    closeModal();
}
window.insertQuickTextDirect = insertQuickTextDirect;

async function addQuickTextInline() {
    const ta = document.getElementById('quick-new-text');
    const text = ta.value.trim();
    if (!text) { showToast('Bitte Text eingeben.', 'error'); return; }
    quickTextsCache.push({ text });
    await setQuickTexts(quickTextsCache);
    quickTextsCache = await getQuickTexts();
    showToast('Quick-Text hinzugefügt.');
    renderQuickPanel(document.getElementById('quick-search')?.value || '');
}
window.addQuickTextInline = addQuickTextInline;

async function saveQuickEditInline(idx) {
    const ta = document.getElementById(`quick-edit-textarea-${idx}`);
    const text = ta.value.trim();
    if (!text) { showToast('Text darf nicht leer sein.', 'error'); return; }
    quickTextsCache[idx].text = text;
    await setQuickTexts(quickTextsCache);
    quickTextsCache = await getQuickTexts();
    quickEditingIndex = null;
    showToast('Quick-Text gespeichert.');
    renderQuickPanel(document.getElementById('quick-search')?.value || '');
}
window.saveQuickEditInline = saveQuickEditInline;

async function removeQuickTextInline(idx) {
    quickTextsCache.splice(idx, 1);
    await setQuickTexts(quickTextsCache);
    quickTextsCache = await getQuickTexts();
    showToast('Quick-Text gelöscht.', 'warning');
    renderQuickPanel(document.getElementById('quick-search')?.value || '');
}
window.removeQuickTextInline = removeQuickTextInline;

// --- SAVE ---
function collectWeekDataFromUI() {
    const entries = {};
    document.querySelectorAll('.schichtfeld-container').forEach(c => {
        const day = c.getAttribute('data-day');
        const shift = c.getAttribute('data-shift');
        const el = c.querySelector('.schichtfeld');
        if (!entries[day]) entries[day] = {};
        entries[day][shift] = el ? el.innerHTML : '';
    });
    return entries;
}

async function saveWeek() {
    const entries = collectWeekDataFromUI();
    const kwinfoEl = document.getElementById('kwinfo');
    const kwinfo = kwinfoEl ? kwinfoEl.innerHTML : '';
    const r = await apiCall('save_week', {
        jahr: currentYear, kw: currentKw, entries, kwinfo, user: currentUser?.name || 'System'
    });
    if (!r || !r.success) {
        throw new Error(r?.error || 'Speichern fehlgeschlagen');
    }
    weekData = entries;
}

async function enterEditMode() {
    const ok = await acquireLock();
    if (!ok) return;
    editMode = true;
    const editBtnText = document.getElementById('btn-edit-toggle-text');
    if (editBtnText) editBtnText.textContent = 'Speichern';
    const kwinfoEl = document.getElementById('kwinfo');
    if (kwinfoEl) kwinfoEl.setAttribute('contenteditable', 'true');
    const toolbar = document.getElementById('format-toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.style.display = '';
    document.querySelectorAll('.schichtfeld').forEach(el => {
        el.setAttribute('contenteditable', 'true');
    });
}
window.enterEditMode = enterEditMode;

async function exitEditMode(shouldSave = true) {
    if (shouldSave) {
        try {
            await saveWeek();
            showToast('Wochenplan gespeichert.');
        } catch (err) {
            console.error('Fehler beim Speichern:', err);
            showToast('Fehler beim Speichern: ' + (err?.message || 'Unbekannter Fehler'), 'error');
            return;
        }
    }
    editMode = false;
    try {
        await releaseLock();
    } catch (err) {
        console.error('Fehler beim Freigeben des Locks:', err);
    }
    const editBtnText = document.getElementById('btn-edit-toggle-text');
    if (editBtnText) editBtnText.textContent = 'Bearbeiten';
    const kwinfoEl = document.getElementById('kwinfo');
    if (kwinfoEl) kwinfoEl.setAttribute('contenteditable', 'false');
    const toolbar = document.getElementById('format-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.style.display = 'none';
    renderWeek();
}
window.exitEditMode = exitEditMode;

async function toggleEditMode() {
    try {
        if (!editMode) {
            await enterEditMode();
        } else {
            await exitEditMode(true);
        }
    } catch (err) {
        console.error('Fehler in toggleEditMode:', err);
        showToast('Unerwarteter Fehler: ' + (err?.message || 'Unbekannt'), 'error');
    }
}
window.toggleEditMode = toggleEditMode;

async function changeWeek(delta) {
    if (editMode) {
        try {
            await saveWeek();
        } catch (err) {
            console.error('Fehler beim Speichern vor Wochenwechsel:', err);
            showToast('Fehler beim Speichern: ' + (err?.message || 'Unbekannt'), 'error');
            return;
        }
    }
    let kw = currentKw + delta, year = currentYear;
    if (kw < 1) { year--; kw = getWeeksInYear(year); }
    if (kw > getWeeksInYear(year)) { kw = 1; year++; }
    currentKw = kw; currentYear = year;
    await loadWeek();
    if (editMode) reapplyEditModeUI();
}
window.changeWeek = changeWeek;

async function goToday() {
    if (editMode) {
        try {
            await saveWeek();
        } catch (err) {
            console.error('Fehler beim Speichern vor Wochenwechsel:', err);
            showToast('Fehler beim Speichern: ' + (err?.message || 'Unbekannt'), 'error');
            return;
        }
    }
    currentYear = new Date().getFullYear();
    currentKw = getWeekNumberLocal(new Date());
    await loadWeek();
    if (editMode) reapplyEditModeUI();
}
window.goToday = goToday;

function reapplyEditModeUI() {
    const kwinfoEl = document.getElementById('kwinfo');
    document.querySelectorAll('.schichtfeld').forEach(el => {
        el.setAttribute('contenteditable', 'true');
    });
    if (kwinfoEl) kwinfoEl.setAttribute('contenteditable', 'true');
}
window.reapplyEditModeUI = reapplyEditModeUI;

function getPrintableTable() {
    const table = document.querySelector('#schicht-body').closest('table');
    if (!table) return '';
    const clone = table.cloneNode(true);
    clone.querySelectorAll('.schichtfeld').forEach(el => {
        el.removeAttribute('contenteditable');
    });
    return clone.outerHTML;
}

// --- ROBUSTE BUTTON-BINDUNG (Event-Delegation) ---
// Funktioniert unabhängig davon, ob DOMContentLoaded fehlerfrei durchläuft.
document.addEventListener('click', function(e) {
    const loginBtnClicked = e.target.closest('#login-btn');
    if (loginBtnClicked) {
        const loginModalEl = document.getElementById('login-modal');
        const loginRfidEl = document.getElementById('login-rfid');
        const loginErrorEl = document.getElementById('login-error');
        if (loginModalEl) {
            loginModalEl.classList.remove('hidden');
            if (loginRfidEl) { loginRfidEl.value = ''; loginRfidEl.focus(); }
            if (loginErrorEl) loginErrorEl.classList.add('hidden');
        } else {
            console.error('login-modal Element nicht im DOM gefunden!');
        }
        return;
    }

    const cancelLoginClicked = e.target.closest('#btn-cancel-login');
    if (cancelLoginClicked) {
        const loginModalEl = document.getElementById('login-modal');
        if (loginModalEl) loginModalEl.classList.add('hidden');
        return;
    }

    const submitLoginClicked = e.target.closest('#btn-submit-login');
    if (submitLoginClicked) {
        const loginRfidEl = document.getElementById('login-rfid');
        if (loginRfidEl) login(loginRfidEl.value.trim());
        return;
    }

    // NEU: Bearbeiten-Button ebenfalls per Delegation, unabhängig vom Rest der Initialisierung
    const editToggleClicked = e.target.closest('#btn-edit-toggle');
    if (editToggleClicked) {
        toggleEditMode();
        return;
    }

    const settingsClicked = e.target.closest('#btn-settings');
    if (settingsClicked) {
        openQuickPanel();
        return;
    }

    const printClicked = e.target.closest('#btn-print');
    if (printClicked) {
        printWochenplan();
        return;
    }

    const prevWeekClicked = e.target.closest('#btn-prev-week');
    if (prevWeekClicked) { changeWeek(-1); return; }

    const nextWeekClicked = e.target.closest('#btn-next-week');
    if (nextWeekClicked) { changeWeek(1); return; }

    const todayWeekClicked = e.target.closest('#btn-today-week');
    if (todayWeekClicked) { goToday(); return; }

    const userProfileClicked = e.target.closest('#user-profile');
    if (userProfileClicked) {
        const logoutModalEl = document.getElementById('logout-modal');
        if (logoutModalEl) logoutModalEl.classList.remove('hidden');
        return;
    }

    const cancelLogoutClicked = e.target.closest('#btn-cancel-logout');
    if (cancelLogoutClicked) {
        const logoutModalEl = document.getElementById('logout-modal');
        if (logoutModalEl) logoutModalEl.classList.add('hidden');
        return;
    }

    const confirmLogoutClicked = e.target.closest('#btn-confirm-logout');
    if (confirmLogoutClicked) {
        logout();
        return;
    }
});

// Enter-Taste im RFID-Feld ebenfalls delegiert behandeln
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'login-rfid') {
        e.preventDefault();
        login(e.target.value.trim());
    }
});

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
    if (sidebar && btnToggleSidebar) {
        const applySidebarState = (collapsed) => {
            sidebar.classList.toggle('collapsed', collapsed);
            if (sidebarToggleIcon) sidebarToggleIcon.textContent = collapsed ? 'menu' : 'menu_open';
        };
        const savedState = localStorage.getItem('sidebarCollapsed') === 'true';
        applySidebarState(savedState);
        btnToggleSidebar.onclick = () => {
            const collapsed = !sidebar.classList.contains('collapsed');
            applySidebarState(collapsed);
            localStorage.setItem('sidebarCollapsed', collapsed);
        };
    }

    // Theme-Toggle: initial Icon setzen + Umschaltfunktion
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        const themeIcon = themeToggleBtn.querySelector('.material-symbols-outlined');
        function updateThemeIcon() {
            const isDark = document.documentElement.classList.contains('dark');
            if (themeIcon) themeIcon.textContent = isDark ? 'dark_mode' : 'light_mode';
        }
        updateThemeIcon();
        themeToggleBtn.onclick = () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.theme = isDark ? 'dark' : 'light';
            updateThemeIcon();
        };
    }

    const kwinfoEl = document.getElementById('kwinfo');
    if (kwinfoEl) {
        kwinfoEl.addEventListener('input', e => {
            const preview = document.getElementById('kwinfo-preview');
            if (preview) preview.innerHTML = markdownToHtml(e.target.value);
        });
    }

    // Jetzt erst Auth prüfen - Fehler hier blockieren die Buttons oben nicht mehr,
    // da alle Klicks bereits per Event-Delegation außerhalb dieses Blocks funktionieren.
    try {
        await checkAuth();
    } catch (err) {
        console.error('Fehler bei checkAuth:', err);
    }

    if (currentUser) startHeartbeat();
});
