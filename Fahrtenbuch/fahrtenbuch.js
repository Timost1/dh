document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'api.php';
    let currentVehicle = '';
    let highestKm = 0;
    let currentUser = null; 
    
    // Pagination State
    let currentEntries = [];
    let currentPage = 1;
    const itemsPerPage = 15;
    
    // Elements
    const vehicleSelect = document.getElementById('vehicle-select');
    const addFahrzeugSel = document.getElementById('add-fahrzeug'); 
    const tableBody = document.getElementById('table-body');
    const modal = document.getElementById('add-modal');
    const editModal = document.getElementById('edit-modal'); 
    const addForm = document.getElementById('add-form');
    const editForm = document.getElementById('edit-form'); 

    // Add Vehicle Elements
    const addVehicleModal = document.getElementById('add-vehicle-modal');
    const addVehicleForm = document.getElementById('add-vehicle-form');
    const btnAddVehicle = document.getElementById('btn-add-vehicle');

    // Auth Elements
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    const userNameDisplay = document.getElementById('user-name-display');
    const userRoleDisplay = document.getElementById('user-role-display');
    const loginModal = document.getElementById('login-modal');
    const loginRfidInput = document.getElementById('login-rfid');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const btnCancelLogin = document.getElementById('btn-cancel-login');
    const loginError = document.getElementById('login-error');
    const logoutModal = document.getElementById('logout-modal');
    const btnConfirmLogout = document.getElementById('btn-confirm-logout');
    const btnCancelLogout = document.getElementById('btn-cancel-logout');
    
    // Form Input Elements
    const fahrerInput = document.getElementById('add-fahrer');

    // --- Sidebar & Theme Logic ---
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
    // ----------------------------

    // Init: Auth checken & danach Fahrzeuge laden
    checkAuth();

    // Event Listeners
    vehicleSelect.addEventListener('change', (e) => {
        currentVehicle = e.target.value;
        loadData();
    });

    window.toggleMangel = function(prefix) {
        const isOk = document.querySelector(`input[name="${prefix === 'add' ? 'status' : 'edit-status'}"][value="ok"]`).checked;
        const container = document.getElementById(`${prefix}-mangel-container`);
        const input = document.getElementById(`${prefix}-status-details`);
        
        if (isOk) {
            container.classList.add('hidden');
            input.removeAttribute('required');
            input.value = '';
        } else {
            container.classList.remove('hidden');
            input.setAttribute('required', 'required');
            setTimeout(() => input.focus(), 100);
        }
    }

    addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveEntry();
    });

    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveEditEntry();
    });

    if (addVehicleForm) {
        addVehicleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveNewVehicle();
        });
    }

    if(addFahrzeugSel) {
        addFahrzeugSel.addEventListener('change', () => {
            fetchLastKmForAddModal(addFahrzeugSel.value);
        });
    }

    if (fahrerInput) {
        fahrerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                resolveRfidToName(fahrerInput.value.trim());
            }
        });

        fahrerInput.addEventListener('change', (e) => {
            resolveRfidToName(fahrerInput.value.trim());
        });
    }

    function resolveRfidToName(val) {
        if (!val || val.includes(' ')) return;

        fetch(`${API_URL}?action=lookup_rfid&rfid=${encodeURIComponent(val)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.name) {
                    fahrerInput.value = data.name;
                    document.getElementById('add-km').focus();
                }
            })
            .catch(err => console.error("RFID Resolve Error:", err));
    }

    function loadVehicles() {
        fetch(`${API_URL}?action=get_vehicles`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data.length > 0) {
                vehicleSelect.innerHTML = '<option value="all" class="font-bold text-primary">Alle Fahrzeuge</option>'; 
                addFahrzeugSel.innerHTML = ''; 

                data.data.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    vehicleSelect.appendChild(opt);

                    const opt2 = document.createElement('option');
                    opt2.value = v;
                    opt2.textContent = v;
                    addFahrzeugSel.appendChild(opt2);
                });
                
                currentVehicle = 'all';
                vehicleSelect.value = currentVehicle;
                loadData();
            } else {
                vehicleSelect.innerHTML = '<option value="">Keine Fahrzeuge gefunden</option>';
            }
        })
        .catch(err => console.error("Fehler beim Laden der Fahrzeuge", err));
    }

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
                loadVehicles(); 
            })
            .catch(err => {
                console.error("Auth check failed", err);
                updateAuthUI(false);
                loadVehicles();
            });
    }

    function updateAuthUI(isLoggedIn) {
        const adminEbeneNav = document.getElementById('adminEbene');
        if (isLoggedIn && currentUser) {
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userProfile) {
                userProfile.classList.remove('hidden');
                userProfile.classList.add('flex');
            }
            if(userNameDisplay) userNameDisplay.textContent = currentUser.name || (currentUser.vorname + ' ' + currentUser.nachname);
            if(userRoleDisplay) userRoleDisplay.textContent = currentUser.Meister == 1 ? "Meister/Admin" : "Mitarbeiter";
            
            if (document.getElementById('add-fahrer')) {
                document.getElementById('add-fahrer').value = currentUser.name || (currentUser.vorname + ' ' + currentUser.nachname);
            }
            
            if(adminEbeneNav) {
                if (currentUser.Meister == 1 || currentUser.isAdmin == 1) {
                    adminEbeneNav.classList.remove('hidden');
                    if (btnAddVehicle) btnAddVehicle.classList.remove('hidden');
                } else {
                    adminEbeneNav.classList.add('hidden');
                    if (btnAddVehicle) btnAddVehicle.classList.add('hidden');
                }
            }
        } else {
            if(loginBtn) loginBtn.classList.remove('hidden');
            if(userProfile) {
                userProfile.classList.add('hidden');
                userProfile.classList.remove('flex');
            }
            if(adminEbeneNav) adminEbeneNav.classList.add('hidden');
            if(btnAddVehicle) btnAddVehicle.classList.add('hidden');
            currentUser = null;
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
                showToast(`Willkommen, ${currentUser.name || currentUser.vorname}`, "success");
                loadData(); 
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

    if(loginBtn) loginBtn.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
        loginRfidInput.value = '';
        loginError.classList.add('hidden');
        loginRfidInput.focus();
    });
    if(btnCancelLogin) btnCancelLogin.addEventListener('click', () => hideModal(loginModal));
    if(btnSubmitLogin) btnSubmitLogin.addEventListener('click', performLogin);
    if(loginRfidInput) {
        loginRfidInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); performLogin(); }
        });
    }

    if(userProfile) userProfile.addEventListener('click', () => logoutModal.classList.remove('hidden'));
    if(btnCancelLogout) btnCancelLogout.addEventListener('click', () => hideModal(logoutModal));
    if(btnConfirmLogout) btnConfirmLogout.addEventListener('click', () => {
        fetch(`${API_URL}?action=logout`)
        .then(() => {
            updateAuthUI(false);
            hideModal(logoutModal);
            showToast("Abgemeldet", "info");
            loadData();
        });
    });

    function hideModal(m) {
        if(m) m.classList.add('hidden');
    }

    function loadData() {
        if (!currentVehicle) return; 
        tableBody.innerHTML = `<tr><td colspan="9" class="px-6 py-8 text-center text-slate-500 animate-pulse">Lade Daten für ${currentVehicle === 'all' ? 'Alle Fahrzeuge' : currentVehicle}...</td></tr>`;
        
        fetch(`${API_URL}?action=get_entries&fahrzeug=${encodeURIComponent(currentVehicle)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    currentEntries = data.data;
                    currentPage = 1; 
                    renderTable();
                    updateStats(currentEntries);
                } else {
                    showToast(data.error || 'Fehler beim Laden', 'error');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Verbindungsfehler zur Datenbank', 'error');
            });
    }

    function updateStats(entries) {
        if (currentVehicle === 'all') {
            document.getElementById('stat-km').textContent = '-';
            document.getElementById('stat-status').innerHTML = '<span class="text-slate-500 text-sm font-medium">Alle Fahrzeuge</span>';
            highestKm = 0;
            return;
        }

        if (entries.length === 0) {
            document.getElementById('stat-km').textContent = '0';
            highestKm = 0;
            document.getElementById('stat-status').innerHTML = '-';
            return;
        }

        const latest = entries[0];
        highestKm = parseInt(latest.kilometer);
        document.getElementById('stat-km').textContent = highestKm;

        const isOk = latest.fahrzeugstatus === 'ok';
        let detailsHtml = '';
        if (!isOk && latest.status_details) {
            detailsHtml = `<div class="mt-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg animate-fade-in-up">
                            <p class="text-xs font-bold text-red-700 dark:text-red-400 mb-0.5">Letzter Mangelbericht:</p>
                            <p class="text-sm text-red-600 dark:text-red-300 italic">${latest.status_details}</p>
                           </div>`;
        }
        
        document.getElementById('stat-status').innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isOk ? 'bg-emerald-100 text-emerald-700 border-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-700 border-red-200/50 dark:bg-red-500/10 dark:text-red-400'} border"><span class="material-symbols-outlined text-[14px]">${isOk ? 'check_circle' : 'build'}</span>${isOk ? 'Einsatzbereit' : 'Mängel gemeldet'}</span>${detailsHtml}`;
    }

    function renderTable() {
        tableBody.innerHTML = '';
        
        if (currentEntries.length === 0) {
            document.getElementById('pagination-container').classList.add('hidden');
            tableBody.innerHTML = `<tr><td colspan="9" class="px-6 py-8 text-center text-slate-500 italic">Noch keine Fahrten für diese Auswahl registriert.</td></tr>`;
            return;
        }

        const totalItems = currentEntries.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        const latestIds = new Set();
        const seenFahrzeuge = new Set();
        currentEntries.forEach(e => {
            if (!seenFahrzeuge.has(e.fahrzeug)) {
                seenFahrzeuge.add(e.fahrzeug);
                latestIds.add(e.id);
            }
        });

        if (currentPage > totalPages) currentPage = totalPages || 1;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const visibleItems = currentEntries.slice(startIndex, startIndex + itemsPerPage);

        visibleItems.forEach((entry, idx) => {
            let driven = '-';
            const globalIndex = startIndex + idx;
            
            const prevEntry = currentEntries.slice(globalIndex + 1).find(e => e.fahrzeug === entry.fahrzeug);
            
            if (prevEntry) {
                const prevKm = parseInt(prevEntry.kilometer);
                const currKm = parseInt(entry.kilometer);
                if (currKm >= prevKm) driven = `+${currKm - prevKm} km`;
            }

            const dateStr = new Date(entry.datum).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
            const isOk = entry.fahrzeugstatus === 'ok';
            
            const badgeColor = isOk ? 'bg-emerald-100 text-emerald-700 border-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-700 border-red-200/50 dark:bg-red-500/10 dark:text-red-400';
            const badge = `<span class="inline-flex px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${badgeColor}">${isOk ? 'OK' : 'Mangel'}</span>`;

            const isAdmin = currentUser && (currentUser.Meister == 1 || currentUser.isAdmin == 1);
            const canEdit = isAdmin || latestIds.has(entry.id);
            const editBtn = canEdit ? `<button onclick="window.openEditModal(${entry.id})" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-primary transition-colors" title="Eintrag bearbeiten"><span class="material-symbols-outlined text-[18px]">edit</span></button>` : '';

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-primary/5 transition-all duration-200 ease-out border-b border-slate-100 dark:border-border-dark last:border-0 relative animate-fade-in-up opacity-0 [animation-fill-mode:forwards]";
            tr.style.animationDelay = `${(idx % itemsPerPage) * 30}ms`;

            tr.innerHTML = `
                <td class="px-6 py-4 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">${dateStr}</td>
                <td class="px-6 py-4 text-xs font-bold text-primary whitespace-nowrap">${entry.fahrzeug}</td>
                <td class="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">${entry.fahrer}</td>
                <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">${entry.ort}</td>
                <td class="px-6 py-4 font-mono text-sm font-bold text-slate-800 dark:text-slate-200">${entry.kilometer}</td>
                <td class="px-6 py-4 text-xs text-primary font-bold">${driven}</td>
                <td class="px-6 py-4">${badge}</td>
                <td class="px-6 py-4 text-xs text-slate-500 italic max-w-[200px] truncate" title="${entry.anmerkung || ''}">${entry.anmerkung || '-'}</td>
                <td class="px-4 py-4 text-right">${editBtn}</td>
            `;
            tableBody.appendChild(tr);
        });

        renderPagination(totalPages, totalItems, startIndex, visibleItems.length);
    }

    function renderPagination(totalPages, totalItems, startIndex, shownItems) {
        const container = document.getElementById('pagination-container');
        const infoP = document.getElementById('pagination-info');
        const controls = document.getElementById('pagination-controls');

        container.classList.remove('hidden');
        infoP.textContent = `Zeige ${totalItems > 0 ? startIndex + 1 : 0}-${startIndex + shownItems} von ${totalItems} Einträgen`;

        const btnBase = "px-2 py-1 rounded bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark transition-colors";
        const btnActive = "px-2 py-1 rounded bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark font-bold text-primary ring-1 ring-primary/20";
        const btnDisabled = "px-2 py-1 rounded bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark opacity-50 cursor-not-allowed";

        let html = `<button onclick="window.changePage(-1)" ${currentPage===1?'disabled':''} class="${currentPage===1?btnDisabled:btnBase} hover:bg-slate-50 dark:hover:bg-primary/5">Zurück</button>`;
        
        for(let i=1; i<=totalPages; i++) {
             if(i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                 if(i === currentPage) html += `<button class="${btnActive}">${i}</button>`;
                 else html += `<button onclick="window.setPage(${i})" class="${btnBase} hover:bg-slate-50 dark:hover:bg-primary/5">${i}</button>`;
             } else if (i === currentPage - 2 || i === currentPage + 2) {
                 html += `<span class="px-1 text-slate-400">..</span>`;
             }
        }

        html += `<button onclick="window.changePage(1)" ${currentPage===totalPages?'disabled':''} class="${currentPage===totalPages?btnDisabled:btnBase} hover:bg-slate-50 dark:hover:bg-primary/5">Vor</button>`;
        controls.innerHTML = html;
    }

    window.setPage = function(page) {
        if(!page || isNaN(page)) return;
        currentPage = page;
        renderTable();
    }
    window.changePage = function(delta) {
        window.setPage(currentPage + delta);
    }

    window.openAddModal = function() {
        // Die Blockierung wurde entfernt, Modal öffnet sich nun immer.
        
        if (currentVehicle && currentVehicle !== 'all') {
            addFahrzeugSel.value = currentVehicle;
        } else if (addFahrzeugSel.options.length > 0) {
            addFahrzeugSel.selectedIndex = 0;
        }

        if (currentUser) {
            document.getElementById('add-fahrer').value = currentUser.name || (currentUser.vorname + ' ' + currentUser.nachname);
        } else {
            document.getElementById('add-fahrer').value = '';
        }
        
        document.getElementById('add-ort').value = '';
        document.getElementById('add-anmerkung').value = '';
        document.getElementById('add-status-details').value = '';
        document.querySelector('input[name="status"][value="ok"]').checked = true;
        window.toggleMangel('add');
        document.getElementById('modal-error').classList.add('hidden');
        
        fetchLastKmForAddModal(addFahrzeugSel.value);
        
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('add-km').focus(), 100);
    }

    function fetchLastKmForAddModal(fahrzeugObj) {
        if(!fahrzeugObj) return;
        fetch(`${API_URL}?action=get_last_km&fahrzeug=${encodeURIComponent(fahrzeugObj)}`)
            .then(r => r.json())
            .then(data => {
                const kmInput = document.getElementById('add-km');
                const lastK = data.success ? parseInt(data.last_km) : 0;
                
                highestKm = lastK;
                kmInput.value = lastK > 0 ? lastK : '';
                kmInput.min = lastK;
                document.getElementById('hint-last-km').textContent = lastK > 0 ? `Bisher: ${lastK}` : '';

                // Übergabe des vorherigen Fahrzeugzustands (sofern vorhanden)
                if (data.success && data.last_status === 'not_ok') {
                    document.querySelector('input[name="status"][value="not_ok"]').checked = true;
                    document.getElementById('add-status-details').value = data.last_status_details || '';
                    window.toggleMangel('add');
                } else if (data.success) {
                    document.querySelector('input[name="status"][value="ok"]').checked = true;
                    document.getElementById('add-status-details').value = '';
                    window.toggleMangel('add');
                }
            })
            .catch(err => console.error(err));
    }

    window.closeModal = function() {
        modal.classList.add('hidden');
    }

    window.openEditModal = function(id) {
        const entry = currentEntries.find(e => e.id == id);
        if(!entry) return;

        document.getElementById('edit-id').value = entry.id;
        document.getElementById('edit-fahrzeug').value = entry.fahrzeug;
        document.getElementById('edit-fahrer').value = entry.fahrer;
        document.getElementById('edit-km').value = entry.kilometer;
        document.getElementById('edit-ort').value = entry.ort;
        document.getElementById('edit-anmerkung').value = entry.anmerkung || '';
        document.querySelector(`input[name="edit-status"][value="${entry.fahrzeugstatus}"]`).checked = true;
        document.getElementById('edit-status-details').value = entry.status_details || '';

        window.toggleMangel('edit');
        document.getElementById('edit-modal-error').classList.add('hidden');
        editModal.classList.remove('hidden');
    };

    window.closeEditModal = function() {
        editModal.classList.add('hidden');
    };

    window.openAddVehicleModal = function() {
        document.getElementById('new-vehicle-name').value = '';
        document.getElementById('new-vehicle-km').value = '0';
        document.getElementById('new-vehicle-error').classList.add('hidden');
        addVehicleModal.classList.remove('hidden');
        setTimeout(() => document.getElementById('new-vehicle-name').focus(), 100);
    }

    window.closeAddVehicleModal = function() {
        addVehicleModal.classList.add('hidden');
    }

    function saveNewVehicle() {
        const btn = document.getElementById('btn-save-vehicle');
        const errEl = document.getElementById('new-vehicle-error');
        errEl.classList.add('hidden');
        
        const payload = {
            action: 'add_vehicle',
            fahrzeug: document.getElementById('new-vehicle-name').value,
            kilometer: document.getElementById('new-vehicle-km').value
        };

        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span>...`;

        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            btn.innerHTML = `Speichern`;

            if (data.success) {
                showToast('Fahrzeug erfolgreich angelegt!', 'success');
                closeAddVehicleModal();
                loadVehicles(); // Aktualisiert das Dropdown direkt
            } else {
                errEl.textContent = data.error || 'Ein Fehler ist aufgetreten.';
                errEl.classList.remove('hidden');
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = `Speichern`;
            errEl.textContent = 'Netzwerkfehler.';
            errEl.classList.remove('hidden');
        });
    }

    function saveEntry() {
        const btn = document.getElementById('btn-save');
        const errEl = document.getElementById('modal-error');
        errEl.classList.add('hidden');
        
        const newKm = parseInt(document.getElementById('add-km').value);
        
        // Plausibilitätsprüfung (Distanz > 2000 km)
        if (highestKm > 0) {
            const diff = newKm - highestKm;
            if (diff > 2000) {
                if (!confirm(`Möglicher Tippfehler erkannt!\n\nDie Strecke der eingetragenen Fahrt beträgt ${diff} km.\nIst dieser Wert korrekt?`)) {
                    return; // Speichern abbrechen
                }
            }
        }
        
        const payload = {
            action: 'add_entry',
            fahrzeug: addFahrzeugSel.value,
            fahrer: document.getElementById('add-fahrer').value,
            kilometer: document.getElementById('add-km').value,
            ort: document.getElementById('add-ort').value,
            anmerkung: document.getElementById('add-anmerkung').value,
            fahrzeugstatus: document.querySelector('input[name="status"]:checked').value,
            status_details: document.getElementById('add-status-details').value
        };

        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Speichert...`;

        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then (data => {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Speichern`;

            if (data.success) {
                showToast('Fahrt erfolgreich eingetragen!', 'success');
                closeModal();
                loadData();
            } else {
                errEl.textContent = data.error || 'Ein Fehler ist aufgetreten.';
                errEl.classList.remove('hidden');
            }
        })
        .catch(err => {
            console.error(err);
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Speichern`;
            errEl.textContent = 'Netzwerkfehler. Bitte prüfen.';
            errEl.classList.remove('hidden');
        });
    }

    function saveEditEntry() {
        const btn = document.getElementById('btn-save-edit');
        const errEl = document.getElementById('edit-modal-error');
        errEl.classList.add('hidden');
        
        const payload = {
            action: 'edit_entry',
            id: document.getElementById('edit-id').value,
            fahrer: document.getElementById('edit-fahrer').value,
            kilometer: document.getElementById('edit-km').value,
            ort: document.getElementById('edit-ort').value,
            anmerkung: document.getElementById('edit-anmerkung').value,
            fahrzeugstatus: document.querySelector('input[name="edit-status"]:checked').value,
            status_details: document.getElementById('edit-status-details').value
        };

        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Speichert...`;

        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Speichern`;

            if (data.success) {
                showToast('Änderungen erfolgreich gespeichert!', 'success');
                closeEditModal();
                loadData();
            } else {
                errEl.textContent = data.error || 'Ein Fehler ist aufgetreten.';
                errEl.classList.remove('hidden');
            }
        })
        .catch(err => {
            console.error(err);
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">save</span> Speichern`;
            errEl.textContent = 'Netzwerkfehler. Bitte prüfen.';
            errEl.classList.remove('hidden');
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeEditModal();
            if (typeof window.closeAddVehicleModal === 'function') window.closeAddVehicleModal();
            hideModal(loginModal);
            hideModal(logoutModal);
        }
    });

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const div = document.createElement('div');
        div.className = `flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white transform transition-all duration-300 translate-y-10 opacity-0 ${type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-primary'}`;
        
        const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
        
        div.innerHTML = `
            <span class="material-symbols-outlined">${icon}</span>
            <p class="text-sm font-medium mr-4">${message}</p>
        `;
        
        container.appendChild(div);
        
        requestAnimationFrame(() => {
            div.classList.remove('translate-y-10', 'opacity-0');
            div.classList.add('translate-y-0', 'opacity-100');
        });

        setTimeout(() => {
            div.classList.remove('translate-y-0', 'opacity-100');
            div.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => div.remove(), 300);
        }, 4000);
    }
});
