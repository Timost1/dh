document.addEventListener('DOMContentLoaded', () => {
    // API URL relative to this file
    const API_URL = 'api.php';

    // --- DOM Elements ---
    const tableBody = document.querySelector('tbody');
    // Passe den Selektor an, um das Input-Feld in beiden HTML-Versionen zu finden
    const searchInput = document.querySelector('input[placeholder="Suche nach EM-HS Nr, Bezeichnung, Typ..."]') || document.querySelector('input[placeholder="Allgemeine Suche..."]');
    
    // Filter Elements (Updated ID references)
    const filterIds = [
        'filter-emhsnr', 'filter-sapnr', 'filter-bezeichnung', 
        'filter-typ', 'filter-hersteller', 'filter-bestnr', 'filter-dhnr',
        'filter-bemerkung', 'filter-lagerort', 'filter-lagerplatz', 'filter-status'
    ];
    
    // Auth Elements
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    const loginModal = document.getElementById('login-modal');
    const loginRfidInput = document.getElementById('login-rfid');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const btnCancelLogin = document.getElementById('btn-cancel-login');
    const loginError = document.getElementById('login-error');
    
    const logoutModal = document.getElementById('logout-modal');
    const btnConfirmLogout = document.getElementById('btn-confirm-logout');
    const btnCancelLogout = document.getElementById('btn-cancel-logout');
    
    // Notification Elements (Glocke & Modal)
    const btnNotifications = document.getElementById('btn-notifications');
    const notificationModal = document.getElementById('notifications-modal');
    const notificationList = document.getElementById('notification-list');
    const notificationBadge = document.getElementById('notification-badge');

    const userNameDisplay = userProfile.querySelector('p.text-sm');
    const userRoleDisplay = userProfile.querySelector('p.text-xs');

    // State
    let currentUser = null;
    let fullInventoryData = [];
    let filteredInventoryData = [];
    let currentPage = 1;
    const itemsPerPage = 8;
    let inventorySearchTerm = '';
    let searchTerm = '';
    let isSortedByRecent = false;

    // Check Auth on Load
    checkAuth();

    // --- Sidebar Toggle Logic ---
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
    const sidebarTexts = document.querySelectorAll('.sidebar-text');

    let isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';

    function applySidebarState() {
        if (!sidebar) return;
        const sidebarHeader = document.getElementById('sidebar-header');
        
        if (isSidebarCollapsed) {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-[80px]'); 
            sidebarTexts.forEach(el => el.classList.add('opacity-0', 'invisible', 'w-0', 'h-0', 'overflow-hidden'));
            
            if (sidebarHeader) {
                sidebarHeader.classList.remove('px-6', 'justify-between');
                sidebarHeader.classList.add('px-4', 'justify-center');
            }
            if(sidebarToggleIcon) sidebarToggleIcon.textContent = 'menu';
        } else {
            sidebar.classList.remove('w-[80px]');
            sidebar.classList.add('w-64');
            sidebarTexts.forEach(el => el.classList.remove('opacity-0', 'invisible', 'w-0', 'h-0', 'overflow-hidden'));
            
            if (sidebarHeader) {
                sidebarHeader.classList.add('px-6', 'justify-between');
                sidebarHeader.classList.remove('px-4', 'justify-center');
            }
            if(sidebarToggleIcon) sidebarToggleIcon.textContent = 'menu_open';
        }
    }
    
    applySidebarState(); 

    if(btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            isSidebarCollapsed = !isSidebarCollapsed;
            localStorage.setItem('sidebar_collapsed', isSidebarCollapsed);
            applySidebarState();
        });
    }

    // --- Column Toggle Logic ---
    const colDropdown = document.getElementById('col-dropdown');
    const btnColToggle = document.getElementById('btn-col-toggle');
    const colDropdownContent = document.getElementById('col-dropdown-content');

    let colVisible = {
        emhsnr: true,
        sapnr: true,
        bezeichnung: true,
        typ: true,
        bestnr: true,
        dhnr: true,
        bemerkung: true,
        bestand: true,
        lagerort: true
    };

    const colLabels = {
        emhsnr: 'EM-HS Nr.',
        sapnr: 'SAP Nr.',
        bezeichnung: 'Bezeichnung',
        typ: 'Typ',
        bestnr: 'Bestellnr.',
        dhnr: 'DH Nr.',
        bemerkung: 'Bemerkung',
        bestand: 'Bestand',
        lagerort: 'Lagerort'
    };

    try {
        const savedCols = JSON.parse(localStorage.getItem('inventar_col_vis'));
        // Nur übernehmen, wenn die gespeicherte Struktur exakt zu den aktuellen Spalten passt.
        // Andernfalls (z.B. nach Hinzufügen der "DH Nr." Spalte) verwerfen wir den alten Stand,
        // damit Header und Zellen niemals auseinanderlaufen können.
        if (savedCols && Object.keys(colVisible).every(k => Object.prototype.hasOwnProperty.call(savedCols, k))) {
            Object.keys(savedCols).forEach(k => {
                if (colVisible.hasOwnProperty(k)) {
                    colVisible[k] = savedCols[k];
                }
            });
        } else {
            // Veraltetes/unvollständiges Schema: Defaults übernehmen und sofort neu speichern
            localStorage.setItem('inventar_col_vis', JSON.stringify(colVisible));
        }
    } catch(e) {}

    function renderColDropdown() {
        if(!colDropdownContent) return;
        colDropdownContent.innerHTML = '';
        Object.keys(colVisible).forEach(key => {
            const lbl = document.createElement('label');
            lbl.className = 'flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-background-dark rounded cursor-pointer text-sm mb-1';
            lbl.innerHTML = `
                <input type="checkbox" class="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4" ${colVisible[key] ? 'checked' : ''} onchange="toggleColumn('${key}')">
                <span class="text-slate-700 dark:text-slate-300 font-medium">${colLabels[key]}</span>
            `;
            colDropdownContent.appendChild(lbl);
        });
    }

    window.toggleColumn = function(key) {
        colVisible[key] = !colVisible[key];
        localStorage.setItem('inventar_col_vis', JSON.stringify(colVisible));
        applyColumnVisibility();
        renderTable(filteredInventoryData); 
    }

    function applyColumnVisibility() {
        Object.keys(colVisible).forEach(key => {
            // Spalten verbergen
            const th = document.querySelector(`th[data-col="${key}"]`);
            if (th) {
                th.style.display = colVisible[key] ? '' : 'none';
            }
            
            // Zugehörige Filter verbergen
            const filters = document.querySelectorAll(`[data-col-filter="${key}"]`);
            filters.forEach(f => {
                f.style.display = colVisible[key] ? '' : 'none';
            });
        });
    }

    if(btnColToggle && colDropdown) {
        btnColToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            colDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if(!colDropdown.contains(e.target)) colDropdown.classList.add('hidden');
        });
    }

    applyColumnVisibility();
    renderColDropdown();

    function loadStats() {
        // Stats Logic updates counters on page
        fetch(`${API_URL}?action=get_inventory_stats`)
        .then(res => res.json())
        .then (data => {
            if(data.success) {
                const elTotal = document.getElementById('stat-total');
                const elLow = document.getElementById('stat-low');
                const elEmpty = document.getElementById('stat-empty');
                
                if(elTotal) elTotal.textContent = data.total;
                if(elLow) elLow.textContent = data.low;
                if(elEmpty) elEmpty.textContent = data.empty;
            }
        })
        .catch(err => console.error("Stats loading failed", err));

        // Trigger Notification Check (Unified Logic)
        checkNotifications();
    }

    // --- Unified Notification Logic (Same as index.js) ---
    function checkNotifications() {
        if (!currentUser) {
            if (notificationBadge) notificationBadge.classList.add('hidden');
            if (notificationList) notificationList.innerHTML = '<p class="text-sm text-slate-500 font-medium text-center py-6 border-2 border-dashed border-border-light dark:border-white/10 rounded-2xl">Bitte anmelden</p>';
            return;
        }

        const isMeister = currentUser.Meister == 1 || currentUser.isAdmin == 1;
        // NUR echte Lagermenschen erhalten die "Neue Bestellung" Notifikation
        const isLagermensch = currentUser.Lagermensch == 1;
        
        // Immer die im Profil hinterlegte Schicht auslesen. 
        // '?' wird nur verwendet, um für Admins ALLE Bestände *abzufragen*.
        const profileShift = currentUser.schicht || currentUser.Schicht || 'Unbekannt';
        const stockShiftToFetch = (currentUser.isAdmin == 1) ? '?' : profileShift;
        
        const userName = currentUser.name || currentUser.Name || ((currentUser.vorname || '') + ' ' + (currentUser.nachname || '')).trim();

        let allNotifications = [];

        // Stock fetch (only Meister/Admin sees empty stock alerts)
        const fetchStock = isMeister 
            ? fetch(`${API_URL}?action=get_shift_inventory&schicht=${encodeURIComponent(stockShiftToFetch)}`).then(r => r.json()).catch(() => [])
            : Promise.resolve([]);

        // Orders fetch (always)
        const fetchOrders = fetch(`${API_URL}?action=get_open_orders`).then(r => r.json()).catch(() => []);

        Promise.all([fetchStock, fetchOrders]).then(([stockData, orders]) => {
            // -- Leere Bestände (Meister) --
            if(Array.isArray(stockData)) {
                let criticalItems = stockData.filter(item => parseInt(item.bestand) <= 0);
                const seenNames = new Set();
                criticalItems = criticalItems.filter(item => {
                    if(seenNames.has(item.name)) return false;
                    seenNames.add(item.name);
                    return true;
                });
                criticalItems.forEach(item => {
                    allNotifications.push({
                        id: 's_' + item.id, type: 'stock', data: item, 
                        prio: 9, title: 'Bestand leer', message: `Bestand leer: ${item.name}`,
                        actionHtml: `<button onclick="openOrderModal(${item.id}, '${(item.name||'').replace(/'/g, "\\'")}', '${(item.sku||'').replace(/'/g, "\\'")}', ${item.bestand}, ${item.soll}); document.getElementById('notifications-modal').classList.add('hidden');" class="text-xs font-bold underline hover:text-primary">Nachbestellen</button>`
                    });
                });
            }

            // -- Bestellungen (Lagermensch und Besteller) --
            if(Array.isArray(orders)) {
                const now = new Date().getTime();
                const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

                orders.forEach(o => {
                    // Filter: Bestellungs-Notifikationen, die älter als 2 Tage sind (bei geleertem Cache), nicht neu anzeigen
                    let orderTime = 0;
                    if(o.zeitpunkt) {
                        const safeDateStr = o.zeitpunkt.replace(' ', 'T');
                        orderTime = new Date(safeDateStr).getTime();
                    }
                    const isOld = (orderTime > 0) && (now - orderTime > TWO_DAYS_MS);

                    if(!isOld) {
                        let displayStatus = o.status;
                        if (o.status === 'IN_BEARBEITUNG') displayStatus = 'In Bearbeitung';
                        else if (o.status === 'ABGESCHLOSSEN') displayStatus = 'Abgeschlossen';
                        else if (o.status === 'ANGENOMMEN') displayStatus = 'Angenommen';

                        // Lagermensch: Benachrichtigen über NEUE Bestellungen
                        if(isLagermensch && o.status === 'NEU') {
                            allNotifications.push({
                                id: 'o_neu_' + o.id, type: 'order', data: o, prio: 8, title: 'Neue Bestellung',
                                message: `Neue Bestellung von Schicht ${o.schicht}`,
                                actionHtml: `<span class="text-xs text-slate-500">In Übersicht bearbeiten</span>`
                            });
                        }
                        // Besteller: Benachrichtigen über Statusänderungen
                        if(!isLagermensch && o.status !== 'NEU' && (o.user_name === userName || o.schicht === profileShift)) {
                            allNotifications.push({
                                id: 'o_status_' + o.id + '_' + o.status, type: 'status', data: o, prio: 5, title: `Status-Update (#${o.id}): ${displayStatus}`,
                                message: `Status-Update (#${o.id}): ${displayStatus}`,
                                actionHtml: `<span class="text-xs text-slate-500">Ihre Bestellung ${o.status === 'ABGESCHLOSSEN' ? 'wurde abgeschlossen.' : 'wird bearbeitet.'}</span>`
                            });
                        }
                    }
                });
            }

            // Read state
            const storageKey = `lager_read_notifs_${currentUser.id}`;
            let readIds = [];
            try { readIds = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (e) { readIds = []; }
            const currentIds = allNotifications.map(n => n.id);
            readIds = readIds.filter(id => currentIds.includes(id));
            localStorage.setItem(storageKey, JSON.stringify(readIds));

            const unreadCount = allNotifications.filter(n => !readIds.includes(n.id)).length;
            if (notificationBadge) {
                if (unreadCount > 0) notificationBadge.classList.remove('hidden');
                else notificationBadge.classList.add('hidden');
            }

            if (!notificationList) return;
            notificationList.innerHTML = '';

            if (unreadCount === 0) {
                notificationList.innerHTML = '<p class="text-sm text-slate-500 font-medium text-center py-6 border-2 border-dashed border-border-light dark:border-white/10 rounded-2xl">Keine offenen Meldungen</p>';
                return;
            }

            allNotifications.sort((a, b) => b.prio - a.prio).forEach(notif => {
                const isRead = readIds.includes(notif.id);
                if (isRead) return; // Gelesene Benachrichtigungen ausblenden
                
                let iconName = 'info';
                let colorClass = 'bg-brand/10 text-brand';
                if (notif.type === 'stock') { iconName = 'error'; colorClass = 'bg-rose-500/10 text-rose-500'; }
                else if (notif.type === 'order' || notif.type === 'status') { 
                    // "status" für Besteller, "order" für Lager
                    iconName = notif.type === 'status' ? 'check_circle' : 'shopping_cart'; 
                    colorClass = notif.type === 'status' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'; 
                }

                const div = document.createElement('div');
                div.dataset.notifId = notif.id;
                div.className = `notification-item bg-white dark:bg-bg-dark border border-border-light dark:border-border-dark p-4 rounded-xl shadow-sm transition-all`;
                
                // Kompatibilität mit dem alten Modal beim Klick
                let titleFallback = '';
                if (notif.type === 'stock') titleFallback = 'Bestand leer';
                else if (notif.type === 'order') titleFallback = 'Neue Bestellung';
                else titleFallback = 'Status-Update';

                let displayTitle = notif.title || titleFallback;
                let meta = '';
                if (notif.type === 'order' || notif.type === 'status') {
                    meta = notif.data && notif.data.zeitpunkt ? new Date(notif.data.zeitpunkt).toLocaleString('de-DE') : 'Unbekannt';
                } else {
                    let schichtVal = notif.data && notif.data.schicht ? notif.data.schicht : profileShift;
                    meta = (schichtVal === '?' || schichtVal === '' || schichtVal == null) ? 'Schichtübergreifend' : `Schicht ${schichtVal}`;
                }

                div.innerHTML = `
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-full ${colorClass} flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[20px]">${iconName}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start gap-2">
                                <p class="text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">${displayTitle || 'Meldung'}</p>
                                <button class="text-slate-400 hover:text-brand transition-colors p-0.5 shrink-0" title="Als gelesen markieren" onclick="markNotificationRead('${notif.id}', event)">
                                    <span class="material-symbols-outlined text-[16px]">done</span>
                                </button>
                            </div>
                            <p class="text-xs text-slate-500 mt-1 truncate">${notif.message || ''}</p>
                            <p class="text-[10px] text-slate-400 font-mono mt-2">${meta}</p>
                            <div class="mt-2">${notif.actionHtml || ''}</div>
                        </div>
                    </div>
                `;

                notificationList.appendChild(div);
            });
        }).catch(err => {
            console.error('Fehler beim Laden der Benachrichtigungen', err);
            if (notificationList) {
                notificationList.innerHTML = '<p class="text-sm text-rose-500 font-medium text-center py-6">Fehler beim Laden.</p>';
            }
        });
    }

    window.markNotificationRead = function(itemId, event) {
        if(event) event.stopPropagation();
        
        const storageUserId = (currentUser && (currentUser.id || currentUser.Id)) || 'guest';
        const storageKey = `lager_read_notifs_${storageUserId}`;
        let readIds = [];
        try { readIds = JSON.parse(localStorage.getItem(storageKey)) || []; } catch(e) {}
        
        if(!readIds.includes(itemId)) {
            readIds.push(itemId);
            localStorage.setItem(storageKey, JSON.stringify(readIds));
        }
        
        // Element animieren und dann entfernen
        const el = event ? event.target.closest('.notification-item') : null;
        if (el) {
            el.classList.add('opacity-0', 'scale-95'); // Tailwind Klassen für Fade/Scale-Out
            setTimeout(() => {
                el.remove();
                checkNotifications(); // Läd den Counter/Badge neu
            }, 300);
        } else {
            checkNotifications();
        }
    }

    window.clearAllNotifications = function() {
        const items = document.querySelectorAll('#notification-list .notification-item');
        items.forEach(el => el.classList.add('opacity-0', 'scale-95'));

        setTimeout(() => {
            // Mark ALL current displayed as read logic nach Animation
            const currentShift = (currentUser && currentUser.isAdmin != 1) ? (currentUser.schicht || 'A') : '?';
            
            fetch(`${API_URL}?action=get_shift_inventory&schicht=${encodeURIComponent(currentShift)}`)
            .then(res => res.json())
            .then(data => {
                if(!Array.isArray(data)) return;
                const criticalItems = data.filter(item => parseInt(item.bestand) <= 0 || parseInt(item.bestand) < parseInt(item.soll) / 2);
                const ids = criticalItems.map(i => 's_' + i.id); // 's_' Prefix für stock
                
                // Bestellungen auch mit als gelesen markieren
                fetch(`${API_URL}?action=get_open_orders`)
                .then(r=>r.json())
                .then(orders => {
                    const orderIds = [];
                    if (Array.isArray(orders)) {
                        orders.forEach(o => {
                            orderIds.push('o_neu_' + o.id);
                            orderIds.push('o_status_' + o.id + '_' + o.status);
                        });
                    }

                    const storageUserId = (currentUser && (currentUser.id || currentUser.Id)) || 'guest';
                    const storageKey = `lager_read_notifs_${storageUserId}`;
                    let currentReads = [];
                    try { currentReads = JSON.parse(localStorage.getItem(storageKey)) || []; } catch(e) {}
                    
                    const newSet = new Set([...currentReads, ...ids, ...orderIds]);
                    localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
                    
                    showNotification("Alle als gelesen markiert");
                    checkNotifications();
                });
            });
        }, 300);
    }

    // --- Auth Functions ---
    function checkAuth() {
        fetch(`${API_URL}?action=check_auth`)
            .then(res => res.json())
            .then(data => {
                if(data.success && data.user) {
                    currentUser = data.user;
                    updateAuthUI(true);
                } else {
                    currentUser = null;
                    updateAuthUI(false);
                }
            })
            .catch(err => {
                console.error("Auth check failed", err);
                updateAuthUI(false);
            });
    }

    function updateAuthUI(isLoggedIn) {
        const loginPlaceholder = document.getElementById('login-placeholder');
        const mainContent = document.getElementById('main-content-container');

        if (isLoggedIn && currentUser) {
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userProfile) {
                userProfile.classList.remove('hidden');
                userProfile.classList.add('flex');
            }
            if(userNameDisplay) userNameDisplay.textContent = currentUser.name || (currentUser.vorname + ' ' + currentUser.nachname);
            if(userRoleDisplay) userRoleDisplay.textContent = currentUser.Meister == 1 ? "Meister/Admin" : "Mitarbeiter";
            
            if(loginPlaceholder) loginPlaceholder.classList.add('hidden');
            if(mainContent) mainContent.classList.remove('hidden');

            // --- NEU: Import-Button für Admins einblenden ---
            const btnImport = document.getElementById('btn-import');
            // Erweitern der Prüfung um den "Meister" Status, falls in der DB keine explizite "isAdmin" Spalte für dich auf 1 gesetzt ist
            const userIsAdmin = (currentUser.isAdmin == 1 || currentUser.Admin == 1 || currentUser.admin == 1 || currentUser.role === 'admin' || currentUser.Meister == 1);
            if (btnImport) {
                if (userIsAdmin) {
                    btnImport.classList.remove('hidden');
                } else {
                    btnImport.classList.add('hidden');
                }
            }
            
            // Load inventory now that auth passes
            loadInventory(searchTerm);
            
        } else {
            if(loginBtn) loginBtn.classList.remove('hidden');
            if(userProfile) {
                userProfile.classList.add('hidden');
                userProfile.classList.remove('flex');
            }
            currentUser = null;
            
            if(loginPlaceholder) loginPlaceholder.classList.remove('hidden');
            if(mainContent) mainContent.classList.add('hidden');

            const btnImport = document.getElementById('btn-import');
            if (btnImport) btnImport.classList.add('hidden');
            
            // Optional: Daten aus dem Speicher löschen, wenn ausgeloggt
            fullInventoryData = [];
            filteredInventoryData = [];
            if(tableBody) tableBody.innerHTML = '';
        }
    }

    function performLogin() {
        const rfid = loginRfidInput.value.trim();
        if (!rfid) return;

        loginError.classList.add('hidden');
        btnSubmitLogin.disabled = true;
        btnSubmitLogin.textContent = '...';

        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'login', rfid: rfid})
        })
        .then(res => res.json())
        .then(data => {
            btnSubmitLogin.disabled = false;
            btnSubmitLogin.textContent = 'Anmelden';

            if(data.success) {
                currentUser = data.user;
                updateAuthUI(true);
                hideModal(loginModal);
                showNotification(`Willkommen, ${currentUser.name}`, "success");
            } else {
                loginError.textContent = data.error || "Anmeldung fehlgeschlagen";
                loginError.classList.remove('hidden');
                loginRfidInput.value = '';
                loginRfidInput.focus();
            }
        })
        .catch(err => {
            btnSubmitLogin.disabled = false;
            btnSubmitLogin.textContent = 'Anmelden';
            loginError.textContent = "Verbindungsfehler";
            loginError.classList.remove('hidden');
        });
    }

    // --- Inventory Logic ---
    
    // Search Handler
    let timeout = null;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                searchTerm = e.target.value.toLowerCase().trim();
                currentPage = 1;
                loadInventory(searchTerm);
            }, 300);
        });
    }

    // Auto-Run Import ONCE just to seed data if empty (Optional helper)
    window.runImport = function() {
        if(!currentUser || currentUser.isAdmin != 1) {
            showNotification("Nur Admins können importieren", "error");
            return;
        }
        if(!confirm("Möchten Sie den Import aus material.dat starten?")) return;

        fetch(`${API_URL}?action=import_material`)
        .then(res => res.json())
        .then (data => {
            if(data.success) {
                showNotification(data.message, "success");
                loadInventory();
            } else {
                showNotification("Fehler: " + data.error, "error");
            }
        })
        .catch(err => {
            console.error(err);
            showNotification("Import Fehler: " + err.message, "error");
        });
    };

    function loadInventory(search = '') {
        // Show loading state (Mit modernem und animiertem Spinner) - Colspan auf 9 angepasst
        if(tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="px-6 py-16 text-center text-slate-500"><div class="flex flex-col items-center justify-center gap-3 animate-pulse"><span class="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 animate-[spin_2s_linear_infinite]">refresh</span><span class="text-sm font-medium">Lade Bestände...</span></div></td></tr>';
        
        // Refresh Stats whenever inventory is loaded
        loadStats();

        // Ein Zeitstempel (&_t=...) zwingt den Browser absolut frische Dateien aus der DB zu laden
        return fetch(`${API_URL}?action=get_inventory&search=${encodeURIComponent(search)}&_t=${new Date().getTime()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    fullInventoryData = data.data; // Striktes Backend-Array übernehmen
                    
                    populateFilters(); // Neu: Dropdowns befüllen
                    applyFilters();    // Neu: Initiale Filterung anwenden
                } else {
                    console.error("Fehler:", data.error);
                    if(tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="px-6 py-4 text-center text-sm text-red-500">Fehler beim Laden der Daten.</td></tr>';
                }
            })
            .catch(err => {
                console.error(err);
                if(tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="px-6 py-4 text-center text-sm text-red-500">Verbindungsfehler.</td></tr>';
            });
    }

    // --- Filter Logic ---
    function populateFilters() {
        if(!fullInventoryData) return;
        
        // Define which fields correspond to which object properties
        const mapping = {
            'filter-emhsnr': 'emhsnr',
            'filter-sapnr': 'sapnr',
            'filter-bezeichnung': 'bezeichnung',
            'filter-typ': 'typ',
            'filter-hersteller': 'hersteller',
            'filter-bestnr': 'bestnr',
            'filter-dhnr': 'dhnr',
            'filter-bemerkung': 'bemerkung',
            'filter-lagerort': 'lagerort',
            'filter-lagerplatz': 'lagerplatz'
        };

        Object.entries(mapping).forEach(([inputId, prop]) => {
            const input = document.getElementById(inputId);
            if(!input) return;
            
            // Extract unique, truthy values
            const values = [...new Set(fullInventoryData.map(i => i[prop]).filter(v => v && v.toString().trim() !== ''))].sort();
            
            setupCustomDropdown(input, values);
        });
        
        // Status hat feste Werte
        const statusInput = document.getElementById('filter-status');
        if (statusInput) {
            setupCustomDropdown(statusInput, ['Leer', 'Knapp', 'OK']);
        }
    }

    function setupCustomDropdown(input, values) {
        input.removeAttribute('list'); // Deaktiviert hässliches natives Datalist Dropdown
        input.setAttribute('autocomplete', 'off');
        input.parentElement.classList.add('relative'); 

        let dropdownId = `custom-dropdown-${input.id}`;
        let dropdown = document.getElementById(dropdownId);
        
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = dropdownId;
            // Modernes Styling analog zum V3-Design
            dropdown.className = 'absolute left-0 top-full mt-2 w-full min-w-[200px] max-h-64 overflow-y-auto bg-surface dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-xl shadow-2xl z-50 hidden custom-scrollbar p-1.5 flex flex-col gap-0.5 text-left animate-fade-in-up';
            input.parentElement.appendChild(dropdown);

            const render = () => {
                const term = input.value.toLowerCase().trim();
                const filtered = values.filter(v => typeof v === 'string' && String(v).toLowerCase().includes(term));
                
                if (filtered.length === 0) {
                    dropdown.classList.add('hidden');
                    return;
                }
                
                dropdown.innerHTML = '';
                // Limit auf 50 um DOM nicht zu überlasten
                filtered.slice(0, 50).forEach(v => {
                    const item = document.createElement('div');
                    item.className = 'px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-brand/10 hover:text-brand dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors break-words leading-snug';
                    
                    if (term) {
                        const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                        item.innerHTML = String(v).replace(regex, '<span class="text-brand font-black">$1</span>');
                    } else {
                        item.textContent = v;
                    }

                    // onmousedown triggert vor input blur
                    item.onmousedown = (e) => { 
                        e.preventDefault();
                        input.value = v;
                        dropdown.classList.add('hidden');
                        applyFilters();
                    };
                    dropdown.appendChild(item);
                });
                dropdown.classList.remove('hidden');
            };

            input.addEventListener('focus', render);
            input.addEventListener('input', render);
            input.addEventListener('blur', () => {
                dropdown.classList.add('hidden');
            });
        }
    }

    function applyFilters() {
        let result = fullInventoryData;
        
        // Helper to get input value safely
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.toLowerCase().trim() : '';
        };

        // Filter Logic for each field
        const fEmhs = getVal('filter-emhsnr');
        const fSap = getVal('filter-sapnr');
        const fBez = getVal('filter-bezeichnung');
        const fTyp = getVal('filter-typ');
        const fHersteller = getVal('filter-hersteller');
        const fBestnr = getVal('filter-bestnr');
        const fDhnr = getVal('filter-dhnr');
        const fBemerkung = getVal('filter-bemerkung');
        const fOrt = getVal('filter-lagerort');
        const fStatus = getVal('filter-status');

        if(fEmhs) result = result.filter(i => i.emhsnr && i.emhsnr.toLowerCase().includes(fEmhs));
        if(fSap) result = result.filter(i => i.sapnr && i.sapnr.toLowerCase().includes(fSap));
        if(fBez) result = result.filter(i => i.bezeichnung && i.bezeichnung.toLowerCase().includes(fBez));
        if(fTyp) result = result.filter(i => i.typ && i.typ.toLowerCase().includes(fTyp));
        if(fHersteller) result = result.filter(i => i.hersteller && i.hersteller.toLowerCase().includes(fHersteller));
        if(fBestnr) result = result.filter(i => {
            if (!i.bestnr) return false;
            try {
                const parsed = JSON.parse(i.bestnr);
                if (Array.isArray(parsed)) {
                    return parsed.some(b => b.nr && String(b.nr).toLowerCase().includes(fBestnr));
                }
            } catch(e) {}
            return i.bestnr.toLowerCase().includes(fBestnr);
        });
        if(fDhnr) result = result.filter(i => i.dhnr && i.dhnr.toLowerCase().includes(fDhnr));
        if(fBemerkung) result = result.filter(i => i.bemerkung && i.bemerkung.toLowerCase().includes(fBemerkung));
        
        // --- Durchsucht Ort UND Platz gleichzeitig, wenn etwas bei Ort/Platz eingegeben wird ---
        if(fOrt) {
            result = result.filter(i => 
                (i.lagerort && i.lagerort.toLowerCase().includes(fOrt)) || 
                (i.lagerplatz && i.lagerplatz.toLowerCase().includes(fOrt))
            );
        }
        
        if(fStatus) {
            result = result.filter(i => {
                const ist = parseInt(i.ist) || 0;
                const soll = parseInt(i.soll) || 1;
                
                // Map text input to logic
                if (fStatus.includes('leer')) return ist <= 0;
                if (fStatus.includes('knapp')) return ist > 0 && ist < soll;
                if (fStatus.includes('ok') || fStatus.includes('ausreichend')) return ist >= soll;
                return true;
            });
        }
        
        // --- Neu: Anwendung der Sortierung (Verlauf oder Standard) ---
        if(isSortedByRecent) {
            result.sort((a,b) => {
                let da = a.last_updated ? new Date(a.last_updated.replace(' ', 'T')).getTime() : 0;
                let db = b.last_updated ? new Date(b.last_updated.replace(' ', 'T')).getTime() : 0;
                return db - da; // Neueste zuerst
            });
        } else {
            result.sort((a,b) => {
                let numA = parseInt(a.emhsnr) || 0;
                let numB = parseInt(b.emhsnr) || 0;
                if(numA === numB) return (a.bezeichnung||'').localeCompare(b.bezeichnung||'');
                return numA - numB;
            });
        }

        filteredInventoryData = result;
        currentPage = 1; 
        renderTable(filteredInventoryData);
    }

    // --- Neu: Button-Aktion zum Umschalten des Verlaufs ---
    window.toggleRecentSort = function() {
        isSortedByRecent = !isSortedByRecent;
        const btn = document.getElementById('btn-sort-recent');
        if(btn) {
            if(isSortedByRecent) {
                btn.classList.add('bg-primary/10', 'text-primary', 'border-primary/50');
                btn.classList.remove('bg-white', 'dark:bg-surface-dark', 'text-slate-700', 'dark:text-slate-300', 'border-slate-200', 'dark:border-border-dark');
            } else {
                btn.classList.remove('bg-primary/10', 'text-primary', 'border-primary/50');
                btn.classList.add('bg-white', 'dark:bg-surface-dark', 'text-slate-700', 'dark:text-slate-300', 'border-slate-200', 'dark:border-border-dark');
            }
        }
        applyFilters();
    };

    window.resetFilters = function() {
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = "";
        });
        
        if (isSortedByRecent) window.toggleRecentSort(); // Deaktiviert auch die Verlauf-Sortierung
        
        // Wenn eine globale Suche aktiv war, müssen wir die kompletten Daten neu laden
        if(searchInput && searchInput.value !== "") {
            searchInput.value = "";
            searchTerm = "";
            loadInventory(""); // Läuft die Daten neu und ruft automatisch applyFilters() auf
            return;
        }
        
        searchTerm = "";
        applyFilters(); 
    }
    
    // Event Listeners für alle neuen Filter
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            // 'input' event triggers on typing and selecting from datalist
            el.addEventListener('input', applyFilters);
        }
    });

    function renderTable(items) {
        if(!tableBody) return;
        tableBody.innerHTML = '';
        
        if (items.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" class="px-6 py-4 text-center text-sm text-slate-500">Keine Artikel gefunden.</td></tr>';
            renderPagination(0);
            return;
        }

        // Pagination Limit
        const totalItems = items.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        if(currentPage > totalPages) currentPage = totalPages || 1;
        if(currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const visibleItems = items.slice(startIndex, endIndex);

        // Highlight Funktion & Filter-Werte lesen
        const termGlobal = searchInput ? searchInput.value.trim() : '';
        const getVal = (id) => document.getElementById(id)?.value.trim() || '';
        const fVals = {
            emhs: getVal('filter-emhsnr'),
            sap: getVal('filter-sapnr'),
            bez: getVal('filter-bezeichnung'),
            typ: getVal('filter-typ'),
            herst: getVal('filter-hersteller'),
            bestnr: getVal('filter-bestnr'),
            dhnr: getVal('filter-dhnr'),
            bem: getVal('filter-bemerkung'),
            ort: getVal('filter-lagerort'),
            platz: getVal('filter-lagerort') // Da wir nach Ort & Platz im selben Feld suchen, markieren wir denselben Wert bei beiden
        };

        function hl(text, specificTerm = '') {
            if (text === null || text === undefined || text === '') return '-';
            let res = String(text);
            if (res.trim() === '') return '-';
            
            let terms = [];
            if (termGlobal) terms.push(termGlobal);
            if (specificTerm) terms.push(specificTerm);
            terms = [...new Set(terms.filter(t => t.trim().length > 0))];
            
            if (terms.length === 0) return res;

            // Sort descending by length to match the longest terms first
            terms.sort((a,b) => b.length - a.length);

            const escaped = terms.map(t => t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
            return res.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-500/50 text-slate-900 dark:text-white rounded-sm px-0.5 font-bold shadow-sm">$1</mark>');
        }

        // visibleItems.forEach um den "index" erweitern für gestaffelte Animation
        visibleItems.forEach((item, index) => {
            // Debug check for missing data
            if(!item.bezeichnung && !item.warned) {
                console.warn("Item missing description:", item); 
                item.warned = true; // prevent spam
            }

            const tr = document.createElement('tr');
            // NEU: Klassen für das sanfte Einblenden und einen Delay basierend auf dem Index
            tr.className = "hover:bg-slate-50 dark:hover:bg-primary/5 transition-all duration-200 ease-out group border-b border-slate-100 dark:border-border-dark last:border-0 cursor-pointer relative animate-fade-in-up opacity-0 [animation-fill-mode:forwards]";
            tr.style.animationDelay = `${index * 40}ms`;
            
            // NEW: Click Row to open Details
            tr.onclick = (e) => {
                // Ignore clicks on buttons/links inside the row
                if(e.target.closest('button') || e.target.closest('a')) return;
                openDetailsModal(item.id);
            };

            // Status Badge Logic
            const ist = (item.ist !== undefined && item.ist !== null) ? parseInt(item.ist) : 0;
            const soll = (item.soll !== undefined && item.soll !== null) ? parseInt(item.soll) : 0;
            
            let widthPct = soll > 0 ? Math.min(100, (ist/soll)*100) : 0;
            let barColor = 'bg-primary';
            let statusText = 'OK';
            let statusColor = 'text-primary';

            if (ist <= 0) {
                statusText = 'Leer';
                statusColor = 'text-red-500';
                barColor = 'bg-red-500';
            } else if (ist < soll) {
                statusText = 'Unter soll';
                statusColor = 'text-amber-500';
                barColor = 'bg-amber-500';
            }

            // NEU: Jeder angemeldete Benutzer darf vorerst bearbeiten (vorher nur Admin/Meister)
            const canEdit = currentUser !== null; 

            // Zeitstempel für "Letzte Bearbeitung" bauen, falls Filter aktiv
            let lastUpdateStr = '';
            if (isSortedByRecent && item.last_updated) {
                const dateObj = new Date(item.last_updated.replace(' ', 'T'));
                if(!isNaN(dateObj)) {
                    lastUpdateStr = `<span class="text-[10px] text-primary/80 font-medium whitespace-nowrap pl-1" title="Zuletzt bearbeitet"><span class="material-symbols-outlined text-[10px] align-middle">schedule</span> ${dateObj.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</span>`;
                }
            }

            // Bestellnummern JSON oder Legacy formatieren
            let bestnrHTML = '-';
            if (item.bestnr && item.bestnr.trim() !== '') {
                try {
                    const bestellungen = JSON.parse(item.bestnr);
                    if (Array.isArray(bestellungen)) {
                        bestnrHTML = bestellungen.map(b => {
                            // Prüfung: Nur anzeigen, wenn currentUser existiert und Lagermensch ist
                            let fileLink = (b.file && currentUser && currentUser.Lagermensch == 1) ? `<a href="${b.file}" target="_blank" onclick="event.stopPropagation()" class="ml-1 text-primary hover:text-primary/70 transition-colors" title="Dokument öffnen"><span class="material-symbols-outlined text-[14px] align-middle">description</span></a>` : '';
                            let dateStr = b.date ? `<span class="text-slate-400 font-normal ml-0.5 text-[9px] whitespace-nowrap">(${b.date})</span>` : '';
                            return `<div class="bg-slate-100 dark:bg-surface-dark px-1.5 py-0.5 rounded border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-400 text-[10px] mb-1 font-mono flex items-center shadow-sm w-fit max-w-full"><span class="font-bold truncate">${hl(b.nr, fVals.bestnr)}</span> ${dateStr} ${fileLink}</div>`;
                        }).join('');
                    } else throw new Error("not array");
                } catch(e) {
                    // Fallback alte Version
                    const bestellungen = item.bestnr.split(/[\n;]+/).filter(b => b.trim() !== '');
                    bestnrHTML = bestellungen.map(b => 
                        `<div class="bg-slate-100 dark:bg-surface-dark px-1.5 py-0.5 rounded border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-400 text-[10px] whitespace-nowrap mb-1 font-mono shadow-sm w-fit">${hl(b.trim(), fVals.bestnr)}</div>`
                    ).join('');
                }
                
                if(bestnrHTML !== '') {
                    bestnrHTML = `<div class="flex flex-col items-start">${bestnrHTML}</div>`;
                } else bestnrHTML = '-';
            }

            // Bemerkungen JSON oder Legacy formatieren
            let bemerkungHTML = '-';
            if (item.bemerkung && item.bemerkung.trim() !== '') {
                try {
                    const bemerkungen = JSON.parse(item.bemerkung);
                    if (Array.isArray(bemerkungen)) {
                        bemerkungHTML = bemerkungen.map(b => {
                            let dateStr = b.date ? `<span class="text-slate-400 font-normal ml-1 text-[9px] whitespace-nowrap">(${b.date})</span>` : '';
                            return `<div class="truncate w-full max-w-full"><span title="${b.text}">${hl(b.text, fVals.bem)}</span> ${dateStr}</div>`;
                        }).join('');
                    } else throw new Error("not array");
                } catch(e) {
                    bemerkungHTML = `<span title="${item.bemerkung}">${hl(item.bemerkung, fVals.bem)}</span>`;
                }
            }

            // Updated Columns Mapping (No Image Column):
            // 1. EM-HS Nr.
            // 2. SAP Nr.
            // 3. Bezeichnung (Hersteller)
            // 4. Typ   
            // 5. Bestellnr.
            // 6. Bemerkung
            // 7. Bestand (Soll/Ist)
            // 8. Lagerort (Lagerplatz)

            tr.innerHTML = `
                ${colVisible.emhsnr ? `<td class="px-6 py-4 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                    ${hl(item.emhsnr, fVals.emhs)}
                </td>` : ''}

                ${colVisible.sapnr ? `<td class="px-6 py-4 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                    ${hl(item.sapnr, fVals.sap)}
                </td>` : ''}

                ${colVisible.bezeichnung ? `<td class="px-6 py-4 max-w-[200px]">
                    <div class="flex flex-col">
                        <span class="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2" title="${item.bezeichnung}">
                            ${(item.bezeichnung && item.bezeichnung !== '0') ? hl(item.bezeichnung, fVals.bez) : 'Keine Bezeichnung'}
                        </span>
                        <div class="flex items-center gap-2 mt-1">
                            ${item.hersteller ? `<span class="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-surface-dark px-1.5 py-0.5 rounded border border-slate-200 dark:border-border-dark" title="Hersteller">${hl(item.hersteller, fVals.herst)}</span>` : ''}
                            ${lastUpdateStr}
                        </div>
                    </div>
                </td>` : ''}

                ${colVisible.typ ? `<td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    ${hl(item.typ, fVals.typ)}
                </td>` : ''}

                ${colVisible.bestnr ? `<td class="px-6 py-4">
                    ${bestnrHTML}
                </td>` : ''}

                ${colVisible.dhnr ? `<td class="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                    ${hl(item.dhnr, fVals.dhnr)}
                </td>` : ''}

                ${colVisible.bemerkung ? `<td class="px-6 py-4 text-xs text-slate-500 italic max-w-[150px]">
                     <div class="flex flex-col gap-1 overflow-hidden">${bemerkungHTML}</div>
                </td>` : ''}

                ${colVisible.bestand ? `<td class="px-6 py-4">
                    <div class="flex flex-col gap-1.5 min-w-[100px]">
                        <div class="flex justify-between text-[11px] font-bold">
                            <span class="${statusColor}">${statusText}</span>
                            <span class="text-slate-600 dark:text-slate-400">${ist} / ${soll}</span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-100 dark:bg-surface-dark rounded-full overflow-hidden border border-slate-100 dark:border-slate-700">
                            <div class="h-full ${barColor}" style="width: ${widthPct}%;"></div>
                        </div>
                    </div>
                </td>` : ''}

                ${colVisible.lagerort ? `<td class="px-6 py-4 text-xs">
                     <div class="flex flex-col">
                        <span class="font-bold text-slate-700 dark:text-slate-300">${hl(item.lagerort, fVals.ort)}</span>
                        ${item.lagerplatz ? `<span class="text-slate-500 block mt-0.5">Platz: ${hl(item.lagerplatz, fVals.platz)}</span>` : ''}
                     </div>
                </td>` : ''}
            `;
            tableBody.appendChild(tr);
        });

        // Pagination
        renderPagination(totalPages, totalItems);
    }
    
    // --- Detail Modal Logic ---
    window.openDetailsModal = function(id) {
        // Find item in filtered or full data. Since we might have filtered, finding in full is safer if ID is unique.
        const item = fullInventoryData.find(i => i.id == id);
        if(!item) return;

        // Populate Text Fields
        document.getElementById('detail-title').textContent = item.bezeichnung || 'Ohne Bezeichnung';
        document.getElementById('detail-manufacturer').textContent = item.hersteller || 'Kein Hersteller';
        document.getElementById('detail-emhs').textContent = item.emhsnr || '-';
        document.getElementById('detail-sap').textContent = item.sapnr || '-';
        
        // Multiline Bestellnummer Detail JSON/Legacy
        const elBestnr = document.getElementById('detail-bestnr');
        if (item.bestnr && item.bestnr.trim() !== '') {
            try {
                const bestellungen = JSON.parse(item.bestnr);
                elBestnr.innerHTML = bestellungen.map(b => {
                    // Prüfung: Auch im Detail-Modal den File-Button verbergen
                    let fileBtn = (b.file && currentUser && currentUser.Lagermensch == 1) ? `<button onclick="window.open('${b.file}', '_blank'); event.stopPropagation();" class="ml-2 text-brand hover:text-brand/70 transition-colors inline-flex items-center" title="Dokument öffnen"><span class="material-symbols-outlined text-[16px]">description</span></button>` : '';
                    let dateStr = b.date ? `<span class="text-slate-400 font-sans font-medium text-[10px] ml-2">(${b.date})</span>` : '';
                    return `<div class="bg-slate-50 dark:bg-bg-dark px-4 py-3 rounded-xl border border-border-light dark:border-border-dark font-mono shadow-sm w-full"><span class="font-bold text-slate-800 dark:text-slate-200">${b.nr}</span> ${dateStr} ${fileBtn}</div>`;
                }).join('');
            } catch(e) {
                // Fallback alte Version
                const bestellungen = item.bestnr.split(/[\n;]+/).filter(b => b.trim() !== '');
                elBestnr.innerHTML = bestellungen.map(b => `<div class="bg-slate-50 dark:bg-bg-dark px-4 py-3 rounded-xl border border-border-light dark:border-border-dark font-mono shadow-sm w-full"><span class="font-bold text-slate-800 dark:text-slate-200">${b.trim()}</span></div>`).join('');
            }
        } else {
            elBestnr.innerHTML = '<span class="text-slate-400 italic">Keine Bestellnummern</span>';
        }

        // Garantiert sichere Text-Ausgabe der DHNr in der Vorschau ohne undefinierte Stati
        const dhnrValue = item.dhnr ? String(item.dhnr).trim() : '';
        document.getElementById('detail-dhnr').textContent = dhnrValue !== '' ? dhnrValue : '-';
        
        document.getElementById('detail-badge-typ').textContent = item.typ || 'Artikel';
        
        // Location
        document.getElementById('detail-location').textContent = item.lagerort || 'Unbekannt';
        document.getElementById('detail-place').textContent = item.lagerplatz ? `Platz ${item.lagerplatz}` : '';

        // Stock
        const ist = parseInt(item.ist) || 0;
        const soll = parseInt(item.soll) || 0;
        document.getElementById('detail-stock').textContent = ist;
        document.getElementById('detail-target').textContent = soll;
        
        const pct = soll > 0 ? Math.min(100, (ist/soll)*100) : 0;
        const progressBar = document.getElementById('detail-progress');
        progressBar.style.width = `${pct}%`;
        
        // Status Badge Logic
        const statusBadge = document.getElementById('detail-badge-status');
        if (ist <= 0) {
            statusBadge.textContent = "Leer";
            statusBadge.className = "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
            progressBar.className = "bg-red-500 h-full rounded-full transition-all duration-700 ease-out";
        } else if (ist < soll) {
            statusBadge.textContent = "Unter soll";
            statusBadge.className = "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
            progressBar.className = "bg-amber-500 h-full rounded-full transition-all duration-700 ease-out";
        } else {
            statusBadge.textContent = "Auf Lager";
            statusBadge.className = "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
            progressBar.className = "bg-primary h-full rounded-full transition-all duration-700 ease-out";
        }

        // Notes (JSON or Legacy)
        const notesContainer = document.getElementById('detail-notes');
        notesContainer.innerHTML = '';
        if (item.bemerkung && item.bemerkung.trim() !== '') {
            // Container Styling Override for JSON Array display
            notesContainer.className = "flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 w-full";
            try {
                const bemerkungen = JSON.parse(item.bemerkung);
                bemerkungen.forEach(b => {
                    let dateStr = b.date ? `<span class="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 dark:bg-surface-dark px-2 py-0.5 rounded whitespace-nowrap hidden sm:block">${b.date}</span>` : '';
                    notesContainer.innerHTML += `
                        <div class="bg-slate-50 dark:bg-bg-dark border border-border-light dark:border-border-dark p-3.5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 relative overflow-hidden">
                            <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-brand/40"></div>
                            <span class="font-medium text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words pl-2">${b.text}</span>
                            ${dateStr}
                        </div>`;
                });
            } catch(e) {
                // Fallback Legacy String
                notesContainer.innerHTML = `<div class="bg-slate-50 dark:bg-bg-dark border border-border-light dark:border-border-dark p-4 rounded-2xl shadow-sm"><span class="font-medium text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">${item.bemerkung}</span></div>`;
            }
        } else {
            notesContainer.className = "text-sm text-slate-400 dark:text-slate-500 italic py-2";
            notesContainer.textContent = 'Keine Bemerkung hinterlegt.';
        }

        // Edit Button Visibility (für jeden eingeloggten User sichtbar)
        const btnEdit = document.getElementById('detail-btn-edit');
        const btnAddShift = document.getElementById('detail-btn-add-shift');

        if(currentUser) {
            btnEdit.classList.remove('hidden');
            btnEdit.onclick = () => { closeDetailsModal(); openEditModal(item.id); };
            
            // NEU: In Schicht übernehmen Button anzeigen
            btnAddShift.classList.remove('hidden');
            btnAddShift.onclick = () => { closeDetailsModal(); openAddToShiftModal(item.id); };
        } else {
            btnEdit.classList.add('hidden');
            btnAddShift.classList.add('hidden');
        }

        // Image Handling & Layout adjustment
        const imgContainer = document.getElementById('detail-image-container');
        const leftSide = document.getElementById('detail-left-side');
        const rightSide = document.getElementById('detail-right-side');
        
        imgContainer.innerHTML = ''; // Clear previous

        let filesList = [];
        if (item.bild_pfad) {
            try {
                let parsed = JSON.parse(item.bild_pfad);
                if(Array.isArray(parsed)) {
                    filesList = parsed.map(f => {
                        const path = f.pfad || f.path || f;
                        const isPdf = f.is_pdf || String(path).toLowerCase().endsWith('.pdf');
                        return { path, is_pdf: isPdf };
                    });
                } else throw new Error("not array");
            } catch(e) {
                // Fallback: Kommaseparierte Strings oder Einzel-String (alte Version)
                let paths = String(item.bild_pfad).split(',').map(s => s.trim()).filter(s => s);
                filesList = paths.map(path => ({
                    path: path,
                    is_pdf: path.toLowerCase().endsWith('.pdf') || item.is_pdf
                }));
            }
        }

        // NEU: Bereich bleibt immer sichtbar (oder zumindest für eingeloggte User)
        leftSide.style.display = 'flex';
        rightSide.classList.remove('md:w-full');
        rightSide.classList.add('md:flex-1');

        if(filesList.length > 0) {
             imgContainer.innerHTML = `
                 <div id="main-file-view" class="flex-1 w-full min-h-0 flex flex-col items-center justify-center relative overflow-hidden"></div>
                 ${filesList.length > 1 ? `<div id="file-thumbnails" class="shrink-0 flex gap-2 w-full overflow-x-auto custom-scrollbar pt-4"></div>` : ''}
             `;

             const renderMainFile = (file) => {
                 const mainView = document.getElementById('main-file-view');
                 if (file.is_pdf) {
                     mainView.innerHTML = `
                        <div class="flex flex-col items-center justify-center w-full h-full p-4 text-center text-slate-500 bg-white dark:bg-white/5 rounded-2xl border border-border-light dark:border-white/10">
                            <span class="material-symbols-outlined text-[48px] text-red-500 mb-3 opacity-90 drop-shadow-sm">picture_as_pdf</span>
                            <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">PDF Dokument</h4>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-[150px] truncate break-all">${file.path.split('/').pop()}</p>
                            <button onclick="window.open('${file.path}', '_blank')" class="px-4 py-2 bg-surface dark:bg-surface-dark border border-border-light dark:border-white/10 rounded-xl shadow-sm text-slate-700 dark:text-slate-200 font-bold hover:text-brand hover:border-brand transition-all flex items-center gap-2 text-xs">
                                <span class="material-symbols-outlined text-[16px]">open_in_new</span> Öffnen
                            </button>
                        </div>
                     `;
                 } else {
                     mainView.innerHTML = `
                        <div class="w-full h-full relative group flex items-center justify-center rounded-xl overflow-hidden shadow-sm bg-black/5 dark:bg-black/20">
                            <img src="${file.path}" class="w-full h-full object-contain cursor-zoom-in group-hover:scale-[1.02] transition-transform duration-300" onclick="window.open('${file.path}', '_blank')">
                            <p class="text-[10px] uppercase font-bold text-white bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-1.5 absolute bottom-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg"><span class="material-symbols-outlined text-[14px]">zoom_in</span> Vergrößern</p>
                        </div>
                     `;
                 }
             };

             // Initiale Anzeige (Erstes Bild)
             renderMainFile(filesList[0]);

             // Thumbnails für Galerie rendern
             if (filesList.length > 1) {
                 const thumbsContainer = document.getElementById('file-thumbnails');
                 filesList.forEach((file, index) => {
                     const thumb = document.createElement('div');
                     thumb.className = "w-12 h-12 shrink-0 rounded-xl border-2 border-transparent hover:border-brand cursor-pointer overflow-hidden bg-white dark:bg-surface-dark flex items-center justify-center shadow-sm opacity-50 hover:opacity-100 transition-all";
                     
                     thumb.onclick = () => {
                         Array.from(thumbsContainer.children).forEach(c => { c.classList.remove('border-brand', 'opacity-100'); c.classList.add('opacity-50', 'border-transparent'); });
                         thumb.classList.remove('border-transparent', 'opacity-50');
                         thumb.classList.add('border-brand', 'opacity-100');
                         renderMainFile(file);
                     };
                     

                     // Erstes Element sofort als markiert anzeigen
                     if(index === 0) {
                         thumb.classList.remove('border-transparent', 'opacity-50');
                         thumb.classList.add('border-brand', 'opacity-100');
                     }

                     if(file.is_pdf) {
                         thumb.innerHTML = `<span class="material-symbols-outlined text-red-500 text-xl">picture_as_pdf</span>`;
                     } else {
                         thumb.innerHTML = `<img src="${file.path}" class="w-full h-full object-cover">`;
                     }
                     thumbsContainer.appendChild(thumb);
                 });
             }
        } else {
             // Platzhalter, wenn noch keine Bilder existieren
             imgContainer.innerHTML = `
                <div class="flex-1 w-full min-h-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50 dark:bg-white/5 border border-dashed border-border-light dark:border-white/10 rounded-xl">
                    <span class="material-symbols-outlined text-4xl mb-2 opacity-50">image_not_supported</span>
                    <p class="text-sm font-medium">Kein Bild vorhanden</p>
                </div>
             `;
             const thumbsContainer = document.getElementById('detail-thumbnails-container');
             if(thumbsContainer) thumbsContainer.innerHTML = '';
        }

        // Bind Upload Button
        const btnUpload = document.getElementById('detail-btn-upload');
        // Upload Button nur für eingeloggte anzeigen
        if(currentUser) {
            btnUpload.style.display = 'flex';
            btnUpload.onclick = () => uploadImagePrompt(item.id);
        } else {
            btnUpload.style.display = 'none';
        }

        // Show Modal
        document.getElementById('item-details-modal').classList.remove('hidden');
    }

    // NEW: Close function exposed to window
    window.closeDetailsModal = function() {
        document.getElementById('item-details-modal').classList.add('hidden');
    }

    // --- Tab Switching Logic for Detail Modal ---
    window.switchDetailTab = function(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.detail-tab-content').forEach(el => el.classList.add('hidden'));
        // Deactivate all tab buttons
        document.querySelectorAll('.detail-tab-btn').forEach(btn => {
            btn.classList.remove('border-primary', 'text-primary');
            btn.classList.add('border-transparent', 'text-slate-500');
        });
        // Show selected tab content
        const content = document.getElementById(`detail-tab-${tabName}`);
        if(content) content.classList.remove('hidden');
        // Activate selected tab button
        const btn = document.querySelector(`[data-tab-btn="${tabName}"]`);
        if(btn) {
            btn.classList.add('border-primary', 'text-primary');
            btn.classList.remove('border-transparent', 'text-slate-500');
        }
    };

    // Wrap existing openDetailsModal to add tab reset
    const _originalOpenDetailsModal = window.openDetailsModal;
    window.openDetailsModal = function(id) {
        _originalOpenDetailsModal(id);
        // Reset to Overview tab
        window.switchDetailTab('overview');
    };

    // --- NEU: Add to Shift Logic ---
    window.openAddToShiftModal = function(id) {
        const item = fullInventoryData.find(i => i.id == id);
        if(!item) return;

        document.getElementById('shift-modal-item-name').textContent = item.bezeichnung || 'Artikel';
        document.getElementById('shift-modal-item-id').value = id;
        document.getElementById('shift-modal-ist').value = '0';
        document.getElementById('shift-modal-soll').value = '0';

        // Schicht automatisch aus dem Benutzerprofil zuweisen, falls das Dropdown diesen Wert unterstützt
        const schichtInput = document.getElementById('shift-modal-select');
        const userSchicht = currentUser ? (currentUser.schicht || currentUser.Schicht) : null;
        
        if(userSchicht) {
            // Versuche direkt den Profilwert (z.B. "A") oder als Fallback "Schicht A" zu setzen
            // Das Dropdown entscheidet, was gültig ist
            schichtInput.value = userSchicht;
            if(!schichtInput.value) {
                schichtInput.value = 'Schicht ' + userSchicht;
            }
        }

        document.getElementById('add-to-shift-modal').classList.remove('hidden');
    };

    window.submitAddToShift = function() {
        const id = document.getElementById('shift-modal-item-id').value;
        const item = fullInventoryData.find(i => i.id == id);
        if(!item) return;

        // Schicht exakt so auslesen, wie sie im Select Dropdown konfiguriert ist!
        const schichtInput = document.getElementById('shift-modal-select');
        const schicht = schichtInput ? schichtInput.value.trim() : null;
        
        if(!schicht || schicht === "" || schicht === "Keine Schicht zugewiesen") {
            showNotification("Bitte eine gültige Schicht im Dropdown auswählen.", "error");
            return;
        }

        // Als echte Zahlen parsen, da die Datenbank Integer für Bestand erwartet
        const ist = parseInt(document.getElementById('shift-modal-ist').value) || 0;
        const soll = parseInt(document.getElementById('shift-modal-soll').value) || 0;

        const btn = document.getElementById('btn-submit-add-shift');
        btn.disabled = true;
        btn.textContent = 'Wird angelegt...';

        // Die Eigenschaften analog zum Schicht-Inventar System (index.js/Frontend Shift Dashboard) übergeben
        const payload = {
            action: 'add_item', 
            name: item.bezeichnung || 'Unbenannt',
            sku: String(item.emhsnr || item.sapnr || ('HAUPT-' + item.id)),
            kategorie: item.typ || '-',
            schicht: schicht,
            ist: ist,
            soll: soll
        };

        // Sende den Request an die lokale api.php
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(async res => {
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (err) {
                console.error("Server Text-Antwort:", text);
                throw new Error("Server antwortete nicht mit JSON. Antwort: " + text.substring(0, 40) + "...");
            }
        })
        .then(data => {
            btn.disabled = false;
            btn.textContent = 'Übernehmen';
            if(data.success) {
                showNotification(`Artikel erfolgreich für ${schicht} registriert.`, "success");
                document.getElementById('add-to-shift-modal').classList.add('hidden');
            } else {
                showNotification("Fehler: " + (data.error || "Unbekannt"), "error");
            }
        })
        .catch(err => {
            console.error("Fehler bei Shift Add:", err);
            btn.disabled = false;
            btn.textContent = 'Übernehmen';
            showNotification("Verbindungsfehler: " + err.message, "error");
        });
    };

    // --- Dynamic Order Rows Logic ---
    window.renderOrderRow = function(containerId, val = '', date = '', file = '') {
        const container = document.getElementById(containerId);
        if(!container) return;

        if (!date) {
            const now = new Date();
            date = now.toLocaleString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
        }

        const row = document.createElement('div');
        row.className = 'order-row flex flex-wrap sm:flex-nowrap items-center gap-2 relative';
        row.dataset.file = file || '';

        row.innerHTML = `
            <input type="text" placeholder="Bestellnr..." value="${val}" class="order-nr flex-1 min-w-[120px] rounded-xl border-none bg-slate-50 dark:bg-bg-dark focus:ring-2 focus:ring-brand text-xs py-2.5 px-3 font-mono">
            <input type="text" placeholder="Datum/Uhrzeit" value="${date}" class="order-date w-[130px] rounded-xl border-none bg-slate-50 dark:bg-bg-dark focus:ring-2 focus:ring-brand text-xs py-2.5 px-3 shrink-0">
            <button type="button" onclick="this.closest('.order-row').remove()" class="shrink-0 w-9 h-9 flex items-center justify-center bg-surface dark:bg-white/5 border border-transparent rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Entfernen">
                <span class="material-symbols-outlined text-[18px] leading-none">delete</span>
            </button>
         `;
         container.appendChild(row);
    }

    window.uploadOrderFile = function(btn) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf,image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('action', 'upload_order_file'); // Note: Endpoint muss Pfad zurückgeben z.B. json {success:true, path:'...'}
            formData.append('file', file);
            
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none animate-spin">sync</span>';

            fetch(API_URL, { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.path) {
                    const row = btn.closest('.order-row');
                    row.dataset.file = data.path; 
                    btn.classList.add('border-emerald-500', 'text-emerald-500');
                    btn.classList.remove('border-transparent', 'text-slate-500');
                    btn.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none">task</span>';
                    showNotification("Datei erfolgreich verknüpft", "success");
                } else {
                    btn.innerHTML = originalIcon;
                    showNotification(data.error || "Upload Error", "error");
                }
            })
            .catch(() => {
                btn.innerHTML = originalIcon;
                showNotification("Verbindungsfehler beim Dateiupload", "error");
                       });
        };
        input.click();
    };

    function extractOrderData(containerId) {
        const rows = document.querySelectorAll(`#${containerId} .order-row`);
        const data = [];
        rows.forEach(r => {
            const nr = r.querySelector('.order-nr').value.trim();
            const date = r.querySelector('.order-date').value.trim();
            const file = r.dataset.file || '';
            if (nr) data.push({nr, date, file}); // Nur speichern wenn mindest Nummer da ist
        });
        return data.length ? JSON.stringify(data) : "";
    }

    // --- Dynamic Bemerkung Rows Logic ---
    window.addBemerkungRow = function(containerId, text = '', date = '') {
        const container = document.getElementById(containerId);
        if(! container) return;

        if (!date) {
            const now = new Date();
            date = now.toLocaleString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
        }

        const row = document.createElement('div');
        row.className = 'bemerkung-row flex flex-wrap sm:flex-nowrap items-start gap-2 relative';

        // Escaping for value rendering is generally recommended, but since we modify DOM directly we can inject it safely
        row.innerHTML = `
            <textarea placeholder="Notiz..." class="bem-text flex-1 min-w-[120px] rounded-xl border-none bg-slate-50 dark:bg-bg-dark focus:ring-2 focus:ring-brand text-xs py-2.5 px-3 resize-y custom-scrollbar" rows="2"></textarea>
            <input type="text" placeholder="Datum/Uhrzeit" value="${date}" class="bem-date w-[130px] rounded-xl border-none bg-slate-50 dark:bg-bg-dark focus:ring-2 focus:ring-brand text-xs py-2.5 px-3 shrink-0">
            <button type="button" onclick="this.closest('.bemerkung-row').remove()" class="shrink-0 w-9 h-9 flex items-center justify-center bg-surface dark:bg-white/5 border border-transparent rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Entfernen">
                <span class="material-symbols-outlined text-[18px] leading-none">delete</span>
            </button>
        `;
        
        // Zuweisen des Textes über die Value-Eigenschaft nach der Erstellung (vermeidet HTML-Escaping-Probleme bei Sonderzeichen in JSON)
        row.querySelector('.bem-text').value = text;
        
        container.appendChild(row);
    }

    function extractBemerkungData(containerId) {
        const rows = document.querySelectorAll(`#${containerId} .bemerkung-row`);
        const data = [];
        rows.forEach(r => {
            const text = r.querySelector('.bem-text').value.trim();
            const date = r.querySelector('.bem-date').value.trim();
            if (text) data.push({text, date});
        });
        return data.length ? JSON.stringify(data) : "";
    }

    // --- Edit Item Logic ---
    let currentEditId = null;

    window.openEditModal = function(id) {
        const item = fullInventoryData.find(i => i.id == id);
        if(!item) return;

        currentEditId = id;

        // DH-Nr robust (case-insensitive) aus dem Item lesen
        const dhnrRaw = item.dhnr ?? item.DHNR ?? item.dhNr ?? item.Dhnr ?? '';
        const dhnrValue = (dhnrRaw !== null && dhnrRaw !== undefined) ? String(dhnrRaw).trim() : '';

        // DH-Nr Feld holen und jegliche Autofill-/Datalist-Bindung entfernen,
        // die den Wert nach dem Setzen wieder leeren könnte
        const dhEl = document.getElementById('edit-dhnr');
        if (dhEl) {
            dhEl.removeAttribute('list');
            dhEl.setAttribute('autocomplete', 'off');
        }
        
        // Zwingendes Leeren ALLER Felder VOR Zuweisung (verhindert Spillover aus Cache komplett)
        const inputsToClear = ['edit-bezeichnung', 'edit-emhs', 'edit-sap', 'edit-typ', 'edit-hersteller', 'edit-lagerort', 'edit-lagerplatz', 'edit-dhnr'];
        inputsToClear.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if(el) el.value = '';
        });
        
        // Populate inputs (Garantiert immer einen String als direkten Wert, überschreibt alle vorherigen Zustände)
        document.getElementById('edit-bezeichnung').value = item.bezeichnung || '';
        document.getElementById('edit-emhs').value = item.emhsnr || '';
        document.getElementById('edit-sap').value = item.sapnr || '';
        document.getElementById('edit-typ').value = item.typ || '';
        document.getElementById('edit-hersteller').value = item.hersteller || '';
        document.getElementById('edit-lagerort').value = item.lagerort || '';
        document.getElementById('edit-lagerplatz').value = item.lagerplatz || '';
        if (dhEl) dhEl.value = dhnrValue;
        document.getElementById('edit-ist').value = parseInt(item.ist) || 0;
        document.getElementById('edit-soll').value = parseInt(item.soll) || 0;

        // Absicherung gegen Browser-Autofill/Spät-Löschung des DH-Nr Feldes
        // Mehrfaches Nachsetzen, falls der Browser das Feld verzögert leert
        [0, 50, 150].forEach(delay => {
            setTimeout(() => {
                const el = document.getElementById('edit-dhnr');
                if (el && el.value.trim() === '' && dhnrValue !== '') {
                    el.value = dhnrValue;
                }
            }, delay);
        });
        
        // Bestellbestand Liste füllen
        const listContainer = document.getElementById('edit-bestnr-list');
        listContainer.innerHTML = '';
        if (item.bestnr && item.bestnr.trim() !== '') {
            try {
                const bestellungen = JSON.parse(item.bestnr);
                bestellungen.forEach(b => window.renderOrderRow('edit-bestnr-list', b.nr, b.date, b.file));
            } catch(e) {
                // Fallback falls alter Text mit Umbrüchen geladen wird
                item.bestnr.split(/[\n;]+/).filter(b => b.trim()!== '').forEach(b => {
                   
                    window.renderOrderRow('edit-bestnr-list', b.trim(), '', '');
                });
            }
        }

        // Bemerkungen Liste füllen
        const bemListContainer = document.getElementById('edit-bem-list');
        bemListContainer.innerHTML = '';
        if (item.bemerkung && item.bemerkung.trim() !== '') {
            try {
                const bemerkungen = JSON.parse(item.bemerkung);
                bemerkungen.forEach(b => window.addBemerkungRow('edit-bem-list', b.text, b.date));
            } catch(e) {
                // Fallback alte Notation
                window.addBemerkungRow('edit-bem-list', item.bemerkung, '');
            }
        }

        document.getElementById('edit-item-modal').classList.remove('hidden');
    }

    window.saveEditItem = function() {
        if (!currentEditId) return;

        const emhsnr = document.getElementById('edit-emhs').value.trim();
        const bezeichnung = document.getElementById('edit-bezeichnung').value.trim();
        
        if(!emhsnr || !bezeichnung) {
            showNotification("EM-HS Nr. und Bezeichnung sind Pflichtfelder", "error");

            return;
        }

        const payload = {
            action: 'edit_inventory_item',
            id: currentEditId,
            emhsnr: emhsnr,
            bezeichnung: bezeichnung,
            sapnr: document.getElementById('edit-sap').value.trim(),
            typ: document.getElementById('edit-typ').value.trim(),
            hersteller: document.getElementById('edit-hersteller').value.trim(),
            lagerort: document.getElementById('edit-lagerort').value.trim(),
            lagerplatz: document.getElementById('edit-lagerplatz').value.trim(),
            dhnr: document.getElementById('edit-dhnr').value.trim(),
            ist: document.getElementById('edit-ist').value,
            soll: document.getElementById('edit-soll').value,
            bestnr: extractOrderData('edit-bestnr-list'), // JSON Auslesung
            bemerkung: extractBemerkungData('edit-bem-list') // JSON Auslesung
        };

        const btn = document.getElementById('btn-save-edit');
        if(btn) { btn.disabled = true; btn.textContent = 'Speichert...'; }

        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if(btn) { btn.disabled = false; btn.textContent = 'Änderungen speichern'; }
            
            if(data.success) {
                showNotification("Artikel erfolgreich aktualisiert", "success");
                document.getElementById('edit-item-modal').classList.add('hidden');
                loadInventory(); // Refresh data table
            } else {
                showNotification("Fehler: " + (data.error || "Unbekannt"), "error");
            }
        })
        .catch(err => {
            if(btn) { btn.disabled = false; btn.textContent = 'Änderungen speichern'; }
            console.error(err);
            showNotification("Verbindungsfehler beim Speichern", "error");
        });
    }

    // --- Add Item Logic ---
    window.openAddModal = function() {
        if(!currentUser) {
            showNotification("Bitte anmelden zum Bearbeiten", "warning");
            return;
        }
        // Optional: Check permissions
        /*
        if(currentUser.Meister != 1 && currentUser.isAdmin != 1) {
             showNotification("Keine Berechtigung", "error");
             return;
        }
        */
        
        // Reset fields
        document.getElementById('add-emhs').value = 'Lade...'; // Placeholder loading state
        document.getElementById('add-bezeichnung').value = '';
        document.getElementById('add-sap').value = '';
        document.getElementById('add-typ').value = '';
        document.getElementById('add-hersteller').value = '';
        document.getElementById('add-lagerort').value = '';
        document.getElementById('add-lagerplatz').value = '';
        document.getElementById('add-dhnr').value = '';
        document.getElementById('add-ist').value = '0';
        document.getElementById('add-soll').value = '0';
        
        // Listen zurücksetzen
        document.getElementById('add-bestnr-list').innerHTML = '';
        document.getElementById('add-bem-list').innerHTML = '';
        
        document.getElementById('add-item-modal').classList.remove('hidden');

        // NEW: Fetch Next ID automatisch
        fetch(`${API_URL}?action=get_next_emhsnr`)
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                document.getElementById('add-emhs').value = data.next;
            } else {
                document.getElementById('add-emhs').value = ''; // Fallback empty
            }
        })
        .catch(err => {
            console.error("Error fetching next ID", err);
            document.getElementById('add-emhs').value = '';
        });
    }

    window.createNewItem = function() {
        const emhsnr = document.getElementById('add-emhs').value.trim();
        const bezeichnung = document.getElementById('add-bezeichnung').value.trim();
        
        if(!emhsnr || !bezeichnung) {
            showNotification("EM-HS Nr. und Bezeichnung sind Pflichtfelder", "error");
            return;
        }
        
        const payload = {
            action: 'add_inventory_item',
            emhsnr: emhsnr,
            bezeichnung: bezeichnung,
            sapnr: document.getElementById('add-sap').value.trim(),
            typ: document.getElementById('add-typ').value.trim(),
            hersteller: document.getElementById('add-hersteller').value.trim(),
            lagerort: document.getElementById('add-lagerort').value.trim(),
            lagerplatz: document.getElementById('add-lagerplatz').value.trim(),
            dhnr: document.getElementById('add-dhnr').value.trim(),
            ist: document.getElementById('add-ist').value,
            soll: document.getElementById('add-soll').value,
            bestnr: extractOrderData('add-bestnr-list'), // JSON Auslesung
            bemerkung: extractBemerkungData('add-bem-list') // JSON Auslesung
        };
        
        const btn = document.getElementById('btn-create-item');
        if(btn) { btn.disabled = true; btn.textContent = 'Speichert...'; }

       

        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if(btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
            
            if(data.success) {
                showNotification("Artikel angelegt", "success");
                document.getElementById('add-item-modal').classList.add('hidden');
                loadInventory(); // Refresh list
            } else {
                showNotification("Fehler: " + (data.error || "Unbekannt"), "error");
            }
        })
        .catch(err => {
            if(btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
            console.error(err);
            showNotification("Verbindungsfehler", "error");
        });
    }

    // --- Pagination Function ---
    function renderPagination(totalPages, totalItems) {
        const container = document.querySelector('.pagination-container') || document.querySelector('.p-4.bg-slate-50.border-t');
        if(!container) return;

        // If there's only one (or zero) page, hide the pagination container
        if (totalPages <= 1) {
            container.classList.add('hidden');
            return;
        }

        // Standard Button Logic - schlankes Design passend zum V3 Dashboard
        const btnBase = "h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-brand dark:hover:border-brand text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all flex items-center justify-center cursor-pointer";
        const btnActive = "h-8 px-3 rounded-lg bg-brand text-white text-xs font-bold flex items-center justify-center shadow-sm shadow-brand/20";
        const btnDisabled = "h-8 px-3 rounded-lg border border-transparent bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed text-xs font-bold flex items-center justify-center";

        const startIndex = (currentPage - 1) * itemsPerPage + 1;
        const endIndex = Math.min(currentPage * itemsPerPage, totalItems);
        
        // Kein umschließendes DIV mehr, da der Container bereits flexibel ist. 'mr-auto' schiebt den Text nach links.
        let html = `<div class="text-[11px] font-medium text-slate-500 mr-auto truncate">Zeige ${startIndex}-${endIndex} von ${totalItems} Artikeln</div>`;

        // Back
        html += `<button type="button" onclick="window.changePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} class="${currentPage <= 1 ? btnDisabled : btnBase}">Zurück</button>`;
        
        // Pages (Simplified range)
        for(let i = 1; i <= totalPages; i++) {
             if(i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                 if(i === currentPage) {
                     html += `<button type="button" class="${btnActive}">${i}</button>`;
                 } else {
                     html += `<button type="button" onclick="window.setPage(${i})" class="${btnBase}">${i}</button>`;
                 }
             } else if (i === currentPage - 2 || i === currentPage + 2) {
                 html += `<span class="px-1 text-slate-400 font-bold dark:text-slate-500 flex items-center justify-center">...</span>`;
             }
        }

        // Next
        html += `<button type="button" onclick="window.changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} class="${currentPage >= totalPages ? btnDisabled : btnBase}">Vor</button>`;
        
        // Render into the container
        container.innerHTML = html;
        container.classList.remove('hidden');
    }

    // Global Pagination Helpers
    window.setPage = function(page) {
        let p = parseInt(page, 10);
        if(isNaN(p) || p < 1) return;
        currentPage = p;
        renderTable(filteredInventoryData); // Nutze gefilterte Daten statt fullInventoryData
    }

    window.changePage = function(delta) {
        let d = parseInt(delta, 10);
        if(isNaN(d)) return;
        window.setPage(currentPage + d);
    }

    // NEU: Globale Funktion zur Überprüfung, ob der Button im Warenkorb aktiviert werden soll
    window.updateCartSubmitButtonState = function() {
        const btn = document.getElementById('btn-submit-cart');
        const note = document.getElementById('cart-note');
        if(!btn) return;
        
        // Da inventar.js kein eigenes `shoppingCart` Setup hat, aber cart-note nutzen soll:
        // (Falls shoppingCart im window. object durch eine einheitliche Logik gepflegt wird, 
        // musst du evtl. `window.shoppingCart` prüfen)
        const noteText = note ? note.value.trim() : '';
        // Fallback checks, assuming you might have shoppingCart defined or imported
        let cartHasItems = false;
        if (typeof shoppingCart !== 'undefined' && shoppingCart.length > 0) {
            cartHasItems = true;
        }

        if (cartHasItems || noteText.length > 0) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    };

    // Listener für Eingaben im cart-note Textfeld
    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'cart-note') {
            window.updateCartSubmitButtonState();
        }
    });

    // Image Upload Logic

    window.uploadImagePrompt = function(id) {
        if(!currentUser) {
            showNotification("Bitte anmelden", "warning");
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf'; // Allow PDF selection
        input.multiple = true; // Erlaube Mehrfachauswahl
        
        input.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            const formData = new FormData();
            
            // Aktion zurück auf 'upload_image' geändert, damit das Backend sie erkennt
            formData.append('action', 'upload_image');
            formData.append('id', id);
            
            files.forEach(file => {
                // Bilder als Array senden
                formData.append('image[]', file);
            });
            
            showNotification(`Lädt ${files.length} Datei(en) hoch...`, "info");

            fetch(API_URL, {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification(files.length > 1 ? "Dateien hochgeladen" : "Datei hochgeladen", "success");
                    // Warten bis Inventory neu geladen ist, dann die Live-Ansicht aktualisieren
                    loadInventory(searchTerm).then(() => {
                        openDetailsModal(id);
                    }); 
                } else {
                    alert("Server meldet Fehler: " + data.error);
                }
            })
            .catch(err => {
                console.error("Netzwerk/Fetch Fehler:", err);
                alert("Verbindungsfehler beim Hochladen.");
            });
        };
        
        input.click();
    }

    // --- Modal Helpers ---
    function showModal(modal) {
        if(modal) modal.classList.remove('hidden');
    }
    function hideModal(modal) {
        if(modal) modal.classList.add('hidden');
    }

    // --- Event Listeners ---

    // Toggle Notifications
    if(btnNotifications && notificationModal) {
        btnNotifications.addEventListener('click', () => {
            checkNotifications();
            notificationModal.classList.remove('hidden');
        });
    }

    if(loginBtn) loginBtn.addEventListener('click', () => {
        showModal(loginModal);
        loginRfidInput.value = '';
        loginError.classList.add('hidden');
        loginRfidInput.focus();
    });

    if(btnCancelLogin) btnCancelLogin.addEventListener('click', () => hideModal(loginModal));
    if(btnSubmitLogin) btnSubmitLogin.addEventListener('click', performLogin);
    
    if(loginRfidInput) {
        loginRfidInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performLogin();
            }
        });
    }

    if(userProfile) userProfile.addEventListener('click', () => showModal(logoutModal));
    if(btnCancelLogout) btnCancelLogout.addEventListener('click', () => hideModal(logoutModal));
    if(btnConfirmLogout) btnConfirmLogout.addEventListener('click', () => {
        fetch(`${API_URL}?action=logout`)
       
        .then(() => {
            updateAuthUI(false);
            hideModal(logoutModal);
            showNotification("Abgemeldet", "info");
        });
    });

    // Outside clicks for modals
    [loginModal, logoutModal].forEach(modal => {
        if(modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('bg-slate-900/75')) {
                    hideModal(modal);
                }
            });
        }
    });
    
    // Ensure item details modal closes on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const detailsModal = document.getElementById('item-details-modal');
            const addModal = document.getElementById('add-item-modal');
            const editModal = document.getElementById('edit-item-modal');
            const addShiftModal = document.getElementById('add-to-shift-modal');
            
            if (detailsModal && !detailsModal.classList.contains('hidden')) closeDetailsModal();
            if (addModal && !addModal.classList.contains('hidden')) addModal.classList.add('hidden');
            if (editModal && !editModal.classList.contains('hidden')) editModal.classList.add('hidden');
            if (addShiftModal && !addShiftModal.classList.contains('hidden')) addShiftModal.classList.add('hidden');
            
            if (loginModal && !loginModal.classList.contains('hidden')) hideModal(loginModal);
            if (logoutModal && !logoutModal.classList.contains('hidden')) hideModal(logoutModal);
        }
    });

    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle');
    if(themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                localStorage.theme = 'light';
            } else {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
            }
        });
    }

    // Enhanced Notification Helper
    window.showNotification = function(text, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return; 

        // Config based on type
        let bgClass, iconName;
        switch (type) {
            case 'success':
                bgClass = 'bg-emerald-500';
                iconName = 'check_circle';
                break;
            case 'error':
                bgClass = 'bg-red-500';
                iconName = 'error';
                break;
            case 'warning':
                bgClass = 'bg-amber-500';
                iconName = 'warning';
                break;
            default: // info
                bgClass = 'bg-primary';
                iconName = 'info';
        }

        const toast = document.createElement('div');
        // NEU: animate-slide-in-right hinzugefügt
        toast.className = `notification-toast animate-slide-in-right flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white pointer-events-auto min-w-[300px] ${bgClass}`;
        
        toast.innerHTML = `
            <span class="material-symbols-outlined text-xl">${iconName}</span>
            <p class="text-sm font-medium flex-1">${text}</p>
            <button class="opacity-70 hover:opacity-100 transition-opacity p-0.5 ml-2" onclick="this.parentElement.remove()">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        `;

        container.appendChild(toast);

        // Auto Remove
        setTimeout(() => {
            toast.classList.add('hiding'); // Start fade out animation
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300); // Wait for animation finish
        }, 5000);
    }

    // Live-Aktualisierung für Benachrichtigungen (fragt alle 30 Sekunden nach neuen Status-Änderungen)
    setInterval(() => {
        if (currentUser) {
            checkNotifications();
        }
    }, 30000);
});

// --- Medien Upload für das Artikel-Modal ---
window.uploadItemMedia = function(fileInput) {
    if (!fileInput.files || fileInput.files.length === 0) return;
    
    // HINWEIS: Hier musst du sicherstellen, dass die ID des aktuell geöffneten Artikels übergeben wird!
    // Falls du den aktuell geöffneten Artikel in einer Variable (z.B. 'currentEditId' oder 'window.currentDetailItem.id') hast, setze diese hier ein:
    const itemId = window.currentDetailId || document.getElementById('edit-item-id').value; 
    
    if (!itemId) {
        showNotification("Konnte Artikel-ID nicht finden", "error");
        return;
    }

    const formData = new FormData();
    formData.append('action', 'upload_image');
    formData.append('id', itemId);
    
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('image[]', fileInput.files[i]);
    }

    // Status anzeigen
    showNotification("Lade Dateien hoch...", "info");

    fetch('api.php', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, "success");
            // Optional: Hier deine Funktion aufrufen, die die Bilder im Modal neu lädt
            // z.B. loadItemDetails(itemId); 
        } else {
            showNotification(data.error || "Fehler beim Upload", "error");
        }
    })
    .catch(err => {
        console.error("Upload Error:", err);
        showNotification("Systemfehler beim Upload", "error");
    })
    .finally(() => {
        // Reset Input, damit man die gleiche Datei nochmal auswählen kann
        fileInput.value = '';
    });
};
