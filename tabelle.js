// tabelle.js - Persistente Anmeldung und Fahrtenverwaltung mit Login-System

document.addEventListener('DOMContentLoaded', async () => {
    const fahrtenTabelle = document.getElementById('fahrtenTabelle').getElementsByTagName('tbody')[0];
    const fahrzeugFilter = document.getElementById('fahrzeugFilter');
    const previousKilometer = new Map();

    // Login Elements
    const anmeldenButton = document.getElementById("anmeldenButton");
    const loginModal = document.getElementById("login-modal");
    const closeButton = loginModal?.querySelector('.close-button');
    const anmeldenForm = document.getElementById("anmeldeForm");
    const rfidInput = document.getElementById("rfidInput");
    const loginMessage = document.getElementById("loginMessage");
    const vehicleStatusContainer = document.getElementById("vehicleStatusContainer");
    
    // === DATA ===
    let vehicleData = {};
    
    // === AUTO-LOGOUT SYSTEM ===
    let logoutTimer;
    let tabInactiveTimer;
    const AUTO_LOGOUT_TIME = 5 * 60 * 1000; // 5 Minuten
    const TAB_INACTIVE_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten bei Tab-Inaktivität
    let activityListenersAdded = false;
    let visibilityListenersAdded = false;

    // Mobile Navigation Toggle - Fixed
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navLinks.classList.toggle('show');
        });

        // Close navigation when clicking outside
        document.addEventListener('click', (e) => {
            if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('show');
            }
        });
    }

    // === THEME TOGGLE FUNKTIONALITÄT === (wie auf der Startseite)
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    // Lade das gespeicherte Theme oder verwende dunkel als Standard
    const savedTheme = localStorage.getItem('theme') || 'dark';
    body.setAttribute('data-theme', savedTheme);
    
    // Theme Toggle Button Text aktualisieren
    function updateThemeToggleButton() {
        const currentTheme = body.getAttribute('data-theme');
        if (themeToggle) {
            themeToggle.textContent = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
    }
    
    // Initiales Update des Buttons
    updateThemeToggleButton();
    
    // Event-Listener für Theme-Wechsel
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            // Setze neues Theme
            body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeToggleButton();
            
            // Sanfte Fade-Animation statt Rotation
            themeToggle.style.opacity = '0.6';
            themeToggle.style.transform = 'scale(0.95)';
            setTimeout(() => {
                themeToggle.style.opacity = '';
                themeToggle.style.transform = '';
            }, 150);
        });
    }

    function isLoggedIn() {
        return localStorage.getItem("isLoggedIn") === "true";
    }

    function getLoggedInUserId() {
        return localStorage.getItem("userId") ? parseInt(localStorage.getItem("userId"), 10) : null;
    }

    // Hilfsfunktion zum Parsen von Permissions aus dem LocalStorage (konsistent mit anderen Skripten)
    function getPermissionsFromLocalStorage() {
        const permissionsString = localStorage.getItem("permissions");
        try {
            return permissionsString ? JSON.parse(permissionsString) : { isAdmin: false, kannFahrtenLoeschen: false };
        } catch (e) {
            console.error("Error parsing permissions from localStorage in tabelle.js:", e);
            return { isAdmin: false, kannFahrtenLoeschen: false }; // Fallback
        }
    }

    async function getUserDetails() {
        return { name: localStorage.getItem("username"), permissions: getPermissionsFromLocalStorage() };
    }

    function showNotification(message, type = 'success', duration = 3000) {
        // Create notification container if it doesn't exist
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 600;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
                max-width: 400px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            `;
            document.body.appendChild(notificationContainer);
        }

        notificationContainer.textContent = message;
        
        if (type === 'success') {
            notificationContainer.style.background = 'linear-gradient(135deg, #238636, #1a7f37)';
        } else if (type === 'error') {
            notificationContainer.style.background = 'linear-gradient(135deg, #f85149, #da3633)';
        }

        notificationContainer.style.opacity = '1';
        notificationContainer.style.transform = 'translateX(0)';

        setTimeout(() => {
            notificationContainer.style.opacity = '0';
            notificationContainer.style.transform = 'translateX(100%)';
        }, duration);
    }

    // === AUTO-LOGOUT FUNCTIONS ===
    function resetLogoutTimer() {
        clearTimeout(logoutTimer);
        logoutTimer = setTimeout(() => {
            showNotification('Automatisch abgemeldet aufgrund von Inaktivität.', 'error', 2000);
            setTimeout(logout, 2000);
        }, AUTO_LOGOUT_TIME);
    }
    
    function addActivityListeners() {
        if (activityListenersAdded) return;
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        events.forEach(event => {
            document.addEventListener(event, resetLogoutTimer, true);
        });
        activityListenersAdded = true;
    }
    
    function removeActivityListeners() {
        if (!activityListenersAdded) return;
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        events.forEach(event => {
            document.removeEventListener(event, resetLogoutTimer, true);
        });
        activityListenersAdded = false;
    }
    
    function handleVisibilityChange() {
        if (!isLoggedIn()) return;
        if (document.hidden) {
            clearTimeout(tabInactiveTimer);
            tabInactiveTimer = setTimeout(() => {
                if (document.hidden && isLoggedIn()) {
                    logout();
                }
            }, TAB_INACTIVE_LOGOUT_TIME);
        } else {
            clearTimeout(tabInactiveTimer);
            if (isLoggedIn()) {
                resetLogoutTimer();
            }
        }
    }
    
    function handleBeforeUnload(event) {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (isLoggedIn) {
            const userIdToLog = localStorage.getItem("userId");
            if (userIdToLog) {
                const logData = JSON.stringify({ 
                    userId: parseInt(userIdToLog, 10),
                    reason: 'tab_closed'
                });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon('/api/log_logout', logData);
                } else {
                    fetch('/api/log_logout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: logData,
                        keepalive: true
                    }).catch(err => console.error('Fehler beim Senden des Logout-Logs:', err));
                }
            }
        }
    }
    
    function addVisibilityListeners() {
        if (visibilityListenersAdded) return;
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);
        visibilityListenersAdded = true;
    }
    
    function removeVisibilityListeners() {
        if (!visibilityListenersAdded) return;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        visibilityListenersAdded = false;
    }

    // === LOGIN FUNCTIONS ===
    async function login(rfid) {
        try {
            const response = await fetch("/api/load_mitarbeiter");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const mitarbeiter = await response.json();
            const user = mitarbeiter.find(m => String(m.rfid).trim() === rfid);
            
            if (user) {
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("username", user.name);
                localStorage.setItem("permissions", JSON.stringify(user.permissions || {}));
                localStorage.setItem("userId", user.id);
                
                if (loginModal) loginModal.style.display = "none";
                anmeldenButton.style.display = "none";
                document.body.classList.remove('modal-open');
                
                // Send login log
                fetch('/api/log_login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id })
                }).catch(err => console.error('Fehler beim Senden des Login-Logs:', err));
                
                displayLogout(user.name);
                showNotification(`Erfolgreich angemeldet, ${user.name}!`, 'success');
                
                // Show admin features if applicable
                const permissions = user.permissions || {};
                if (permissions.isAdmin) {
                    const fahrzeugVerwaltungNav = document.getElementById("fahrzeugVerwaltungNav");
                    if (fahrzeugVerwaltungNav) {
                        fahrzeugVerwaltungNav.style.display = "list-item";
                    }
                }
                
                // Start auto-logout system
                addActivityListeners();
                addVisibilityListeners();
                resetLogoutTimer();
                
                // Load table data
                loadFahrten();
                
            } else {
                if (loginMessage) {
                    loginMessage.textContent = "RFID ungültig. Zugriff verweigert!";
                    loginMessage.style.color = "red";
                }
            }
        } catch (error) {
            console.error("Fehler beim Login:", error);
            if (loginMessage) {
                loginMessage.textContent = "Fehler beim Login.";
            }
        }
    }
    
    function displayLogout(username) {
        const loginStatusDiv = document.getElementById("login-status");
        if (username && loginStatusDiv) {
            loginStatusDiv.innerHTML = `<span style="color:green;">Willkommen, ${username}!</span>`;
            loginStatusDiv.innerHTML += `<button id="abmeldenButton">Abmelden</button>`;
            const abmeldenButton = document.getElementById("abmeldenButton");
            if (abmeldenButton) {
                abmeldenButton.addEventListener("click", logout);
            }
        }
    }
    
    function logout() {
        const userIdToLog = localStorage.getItem("userId");
        
        removeActivityListeners();
        removeVisibilityListeners();
        clearTimeout(logoutTimer);
        clearTimeout(tabInactiveTimer);
        
        showNotification('Erfolgreich abgemeldet. Die Seite wird neu geladen.', 'error', 2000);
        
        setTimeout(() => {
            if (userIdToLog) {
                fetch('/api/log_logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: parseInt(userIdToLog, 10) })
                }).catch(err => console.error('Fehler beim Senden des Logout-Logs:', err));
            }
            
            localStorage.clear();
            location.reload();
        }, 3000);
    }

    function addRowToTable(fahrt, rowIndex, isLatestForVehicle = false) {
        const newRow = fahrtenTabelle.insertRow(rowIndex);
        const datumObj = new Date(fahrt.datum);
        const hours = datumObj.getHours().toString().padStart(2, '0');
        const minutes = datumObj.getMinutes().toString().padStart(2, '0');

        newRow.insertCell().textContent = `${datumObj.toLocaleDateString("de-DE")} ${hours}:${minutes}`;
        newRow.insertCell().textContent = fahrt.fahrzeug;
        newRow.insertCell().textContent = fahrt.fahrer;
        newRow.insertCell().textContent = fahrt.kilometer;
        newRow.insertCell().textContent = 0;
        newRow.insertCell().textContent = fahrt.ort;
        newRow.insertCell().textContent = fahrt.anmerkung;

        const actionCell = newRow.insertCell();

        // Edit button only for newest entry per vehicle (no login required)
        if (isLatestForVehicle) {
            const editButton = document.createElement('button');
            editButton.textContent = 'Bearbeiten';
            editButton.classList.add('edit-button');
            editButton.addEventListener('click', () => enterEditMode(newRow, fahrt));
            actionCell.appendChild(editButton);
        }

        getUserDetails().then(userData => {
            // Prüfe die spezifische Berechtigung 'kannFahrtenLoeschen'
            if (userData.permissions && userData.permissions.kannFahrtenLoeschen) {
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Löschen';
                deleteButton.classList.add('delete-button');
                deleteButton.addEventListener('click', async () => {
                    if (confirm("Bist du sicher, dass du diese Fahrt löschen möchtest?")) {
                        await deleteFahrt(fahrt.id, fahrt.fahrzeug.split(' ').join('_'));
                    }
                });
                actionCell.appendChild(deleteButton);
            }
        });

        previousKilometer.set(fahrt.fahrzeug + parseInt(fahrt.id, 10), { kilometer: fahrt.kilometer, row: newRow });
    }

    // Enable inline editing for the newest entry of a vehicle
    function enterEditMode(row, fahrt) {
        // Prevent multiple edit rows: reload if another edit is active by checking for save button existing
        const existingSave = row.querySelector('.save-button');
        if (existingSave) return;

        // Cells: 0 Datum (ro), 1 Fahrzeug (ro), 2 Fahrer, 3 Kilometer, 4 Strecke (ro), 5 Ort, 6 Anmerkung, 7 Aktion
        const fahrerCell = row.cells[2];
        const kilometerCell = row.cells[3];
        const ortCell = row.cells[5];
        const anmerkungCell = row.cells[6];
        const actionCell = row.cells[7];

        const fahrerInput = document.createElement('input');
        fahrerInput.type = 'text';
        fahrerInput.value = fahrt.fahrer || '';
        fahrerInput.classList.add('inline-edit-input');

        const kilometerInput = document.createElement('input');
        kilometerInput.type = 'number';
        kilometerInput.min = '0';
        kilometerInput.step = '1';
        kilometerInput.value = String(fahrt.kilometer || 0);
        kilometerInput.classList.add('inline-edit-input', 'inline-edit-number');

        const ortInput = document.createElement('input');
        ortInput.type = 'text';
        ortInput.value = fahrt.ort || '';
        ortInput.classList.add('inline-edit-input');

        const anmerkungInput = document.createElement('input');
        anmerkungInput.type = 'text';
        anmerkungInput.value = fahrt.anmerkung || '';
        anmerkungInput.classList.add('inline-edit-input');

        fahrerCell.textContent = '';
        fahrerCell.appendChild(fahrerInput);
        kilometerCell.textContent = '';
        kilometerCell.appendChild(kilometerInput);
        ortCell.textContent = '';
        ortCell.appendChild(ortInput);
        anmerkungCell.textContent = '';
        anmerkungCell.appendChild(anmerkungInput);

        // Replace action cell with Save/Cancel
        actionCell.textContent = '';
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Speichern';
        saveBtn.classList.add('save-button');
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Abbrechen';
        cancelBtn.classList.add('cancel-button');

        actionCell.appendChild(saveBtn);
        actionCell.appendChild(cancelBtn);

        const filename = fahrt.fahrzeug.split(' ').join('_');

        saveBtn.addEventListener('click', async () => {
            console.log('Save button clicked for fahrt:', fahrt);
            const updated = {
                fahrer: fahrerInput.value.trim(),
                kilometer: parseInt(kilometerInput.value, 10),
                ort: ortInput.value.trim(),
                anmerkung: anmerkungInput.value.trim()
            };

            console.log('Updated data:', updated);

            if (Number.isNaN(updated.kilometer) || updated.kilometer < 0) {
                showNotification('Kilometerstand ist ungültig.', 'error');
                return;
            }

            try {
                console.log('Calling updateFahrt with:', { id: fahrt.id, filename, updated });
                const result = await updateFahrt(fahrt.id, filename, updated);
                console.log('updateFahrt successful, result:', result);
                showNotification('Eintrag aktualisiert.', 'success');
                // Nach erfolgreicher Server-Aktualisierung Liste neu laden
                if (fahrzeugFilter) {
                    await loadFahrten(fahrzeugFilter.value);
                } else {
                    await loadFahrten();
                }
            } catch (e) {
                console.error('Error in save handler:', e);
                showNotification(`Fehler beim Aktualisieren: ${e.message}`, 'error');
            }
        });

        cancelBtn.addEventListener('click', async () => {
            // Reload current list to restore original row
            if (fahrzeugFilter) {
                await loadFahrten(fahrzeugFilter.value);
            } else {
                await loadFahrten();
            }
        });
    }

    async function loadFahrten(fahrzeug = "") {
        try {
            const response = await fetch(`/api/load_data?fahrzeug=${encodeURIComponent(fahrzeug)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const fahrten = await response.json();
            const fahrtenWithNumericIds = fahrten.map(fahrt => ({ ...fahrt, id: parseInt(fahrt.id, 10) }));
            fahrtenWithNumericIds.sort((a, b) => new Date(b.datum) - new Date(a.datum));

            // Determine newest entry id per vehicle
            const latestByVehicle = new Map();
            for (const f of fahrtenWithNumericIds) {
                if (!latestByVehicle.has(f.fahrzeug)) {
                    latestByVehicle.set(f.fahrzeug, f.id);
                }
            }

            fahrtenTabelle.innerHTML = '';
            previousKilometer.clear();
            fahrtenWithNumericIds.forEach((fahrt, index) => {
                const isLatest = latestByVehicle.get(fahrt.fahrzeug) === fahrt.id;
                addRowToTable(fahrt, index, isLatest);
            });
            calculateDistances(fahrtenWithNumericIds);

        } catch (error) {
            console.error('Error loading data:', error);
            fahrtenTabelle.innerHTML = `<tr><td colspan="8" style='color:red; text-align:center; padding:20px;'>Error loading data: ${error.message}</td></tr>`;
        }
    }

    function calculateDistances(fahrten) {
        const lastKilometerstand = new Map();
        for (let i = fahrten.length - 1; i >= 0; i--) {
            const currentFahrt = fahrten[i];
            const vehicle = currentFahrt.fahrzeug;
            const currentRow = fahrtenTabelle.rows[i];
            const distanceCell = currentRow.cells[4];

            if (lastKilometerstand.has(vehicle)) {
                const lastKilometer = lastKilometerstand.get(vehicle);
                const distance = currentFahrt.kilometer - lastKilometer;
                distanceCell.textContent = Math.max(0, distance);
            } else {
                distanceCell.textContent = 0;
            }
            lastKilometerstand.set(vehicle, currentFahrt.kilometer);
        }
    }

    async function deleteFahrt(id, filename) {
        try {
            const adminUserId = getLoggedInUserId(); // ID des Admins für Logging
            const response = await fetch(`/api/delete_fahrt/${filename}?id=${id}&adminUserId=${adminUserId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`);
            }
            showNotification("Fahrt erfolgreich gelöscht!", 'success');
            loadFahrten();
        } catch (error) {
            console.error("Error deleting trip:", error);
            showNotification(`Error deleting trip: ${error.message}`, 'error');
        }
    }

    // Update an entry (only newest per vehicle is allowed in UI)
    async function updateFahrt(id, filename, data) {
        try {
            console.log('updateFahrt called with:', { id, filename, data });
            const userId = getLoggedInUserId();
            const params = new URLSearchParams({ id: String(id) });
            if (userId !== null && userId !== undefined) params.append('userId', String(userId));

            const url = `/api/update_fahrt/${encodeURIComponent(filename)}?${params.toString()}`;
            console.log('Making PUT request to:', url);
            console.log('Request body:', JSON.stringify(data));

            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            let result = {};
            try {
                result = await response.json();
            } catch (_) {}

            console.log('Server response:', { status: response.status, ok: response.ok, result });

            if (!response.ok) {
                const message = (result && result.error) ? result.error : `HTTP ${response.status}`;
                throw new Error(message);
            }

            return result;
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Fahrt:', error);
            throw error;
        }
    }
    
    async function login(rfid) {
        try {
            const response = await fetch("/api/load_mitarbeiter");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const mitarbeiter = await response.json();
            const user = mitarbeiter.find(m => String(m.rfid).trim() === rfid);
            
            if (user) {
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("username", user.name);
                localStorage.setItem("permissions", JSON.stringify(user.permissions || {}));
                localStorage.setItem("userId", user.id);
                
                // Hide modal and button
                if (loginModal) {
                    loginModal.style.display = "none";
                    loginModal.classList.remove('show');
                }
                if (anmeldenButton) {
                    anmeldenButton.style.display = "none";
                }
                document.body.classList.remove('modal-open');
                
                // Clear form
                if (rfidInput) rfidInput.value = "";
                if (loginMessage) loginMessage.textContent = "";
                
                // Send login log
                fetch('/api/log_login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id })
                }).catch(err => console.error('Fehler beim Senden des Login-Logs:', err));
                
                displayLogout(user.name);
                showNotification(`Erfolgreich angemeldet, ${user.name}!`, 'success');
                
                // Show admin features if applicable
                const permissions = user.permissions || {};
                if (permissions.isAdmin) {
                    const fahrzeugVerwaltungNav = document.getElementById("fahrzeugVerwaltungNav");
                    if (fahrzeugVerwaltungNav) {
                        fahrzeugVerwaltungNav.style.display = "list-item";
                    }
                }
                
                // Start auto-logout system
                addActivityListeners();
                addVisibilityListeners();
                resetLogoutTimer();
                
                // Load table data
                loadFahrten();
                
            } else {
                if (loginMessage) {
                    loginMessage.textContent = "RFID ungültig. Zugriff verweigert!";
                    loginMessage.style.color = "red";
                }
            }
        } catch (error) {
            console.error("Fehler beim Login:", error);
            if (loginMessage) {
                loginMessage.textContent = "Fehler beim Login.";
            }
        }
    }
    async function loadVehicleData() {
        try {
            // Load vehicle data from JSON files
            const vehicleFiles = {
                "LKW DH158": "fahrzeug_LKW_DH158.json",
                "Schwarzer Peugeot": "fahrzeug_Schwarzer_Peugeot.json", 
                "Weisser Peugeot": "fahrzeug_Weisser_Peugeot.json",
                "VW": "fahrzeug_VW.json"
            };
            
            vehicleData = {};
            for (const [vehicleName, fileName] of Object.entries(vehicleFiles)) {
                try {
                    const response = await fetch(fileName);
                    if (response.ok) {
                        const data = await response.json();
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
            
            await loadVehicleStatus();
        } catch (error) {
            console.error('Fehler beim Laden der Fahrzeugdaten:', error);
            // Use fallback data
            vehicleData = {
                "LKW DH158": { name: "LKW DH-158", status: "ok" },
                "Schwarzer Peugeot": { name: "Schwarzer Peugeot DH-82", status: "ok" },
                "Weisser Peugeot": { name: "Weißer Peugeot DH-322", status: "ok" },
                "VW": { name: "VW Caddy", status: "ok" }
            };
            await loadVehicleStatus();
        }
    }
    
    async function loadVehicleStatus() {
        if (!vehicleStatusContainer) return;
        
        try {
            const response = await fetch('/api/vehicle-status');
            let statusData = {};
            
            if (response.ok) {
                statusData = await response.json();
            }
            
            vehicleStatusContainer.innerHTML = '';
            
            Object.entries(vehicleData).forEach(([key, vehicle]) => {
                const status = statusData[key] || { status: 'ok', details: '', lastUpdate: null };
                const statusCard = createVehicleStatusCard(key, vehicle, status);
                vehicleStatusContainer.appendChild(statusCard);
            });
            
        } catch (error) {
            console.error('Fehler beim Laden des Fahrzeugstatus:', error);
        }
    }
    
    function createVehicleStatusCard(vehicleKey, vehicle, status) {
        const card = document.createElement('div');
        card.className = `vehicle-status-card status-${status.status}`;
        card.style.cursor = 'pointer';
        
        const statusIcons = {
            'ok': '✅',
            'not_ok': '❌'
        };
        
        const statusTexts = {
            'ok': 'Alles in Ordnung',
            'not_ok': 'Nicht in Ordnung'
        };
        
        card.innerHTML = `
            <div class="vehicle-status-header">
                <h3>${vehicle.name}</h3>
                <span class="status-icon">${statusIcons[status.status] || '✅'}</span>
            </div>
            <div class="vehicle-status-info">
                <p class="status-text">${statusTexts[status.status] || 'Alles in Ordnung'}</p>
                ${status.details && status.details.trim() ? `<p class="status-details">${status.details}</p>` : ''}
                ${status.lastUpdate ? `<p class="status-updated">Zuletzt aktualisiert: ${new Date(status.lastUpdate).toLocaleString('de-DE')}</p>` : ''}
            </div>
        `;
        
        // Add click handler to open status modal
        card.addEventListener('click', () => {
            openStatusModal(vehicleKey, vehicle, status);
        });
        
        return card;
    }
    
    function openStatusModal(vehicleKey, vehicle, status) {
        // Create modal if it doesn't exist
        let vehicleStatusModal = document.getElementById('vehicle-status-modal');
        if (!vehicleStatusModal) {
            createStatusModal();
            vehicleStatusModal = document.getElementById('vehicle-status-modal');
        }
        
        const statusModalTitle = document.getElementById('statusModalTitle');
        const currentStatusDisplay = document.getElementById('currentStatusDisplay');
        const updateStatusForm = document.getElementById('updateStatusForm');
        const modalStatusSelect = document.getElementById('modalStatusSelect');
        const modalStatusDetails = document.getElementById('modalStatusDetails');
        const modalStatusDetailsGroup = document.getElementById('modalStatusDetailsGroup');
        
        statusModalTitle.textContent = `${vehicle.name} - Status`;
        
        const statusTexts = {
            'ok': 'Alles in Ordnung',
            'not_ok': 'Nicht in Ordnung'
        };
        
        const statusIcons = {
            'ok': '✅',
            'not_ok': '❌'
        };
        
        currentStatusDisplay.innerHTML = `
            <div class="current-status">
                <h3>Aktueller Status: ${statusIcons[status.status] || '✅'} ${statusTexts[status.status] || 'Alles in Ordnung'}</h3>
                ${status.details && status.details.trim() ? `<p><strong>Details:</strong> ${status.details}</p>` : ''}
                ${status.lastUpdate ? `<p><strong>Letzte Aktualisierung:</strong> ${new Date(status.lastUpdate).toLocaleString('de-DE')}</p>` : ''}
            </div>
        `;
        // Set form values
        modalStatusSelect.value = status.status || 'ok';
        modalStatusDetails.value = status.details || '';
        updateStatusForm.dataset.vehicleKey = vehicleKey;
        // Show/hide details based on initial status
        if (modalStatusSelect.value === 'ok') {
            modalStatusDetailsGroup.style.display = 'none';
        } else {
            modalStatusDetailsGroup.style.display = 'block';
        }
        // Remove previous listeners to avoid duplicates
        modalStatusSelect.onchange = null;
        updateStatusForm.onsubmit = null;
        // Add change listener for dropdown
        modalStatusSelect.addEventListener('change', function() {
            if (modalStatusSelect.value === 'ok') {
                modalStatusDetailsGroup.style.display = 'none';
                modalStatusDetails.value = '';
            } else {
                modalStatusDetailsGroup.style.display = 'block';
            }
        });
        // Add submit listener for status update
        updateStatusForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const vehicleKey = updateStatusForm.dataset.vehicleKey;
            const status = modalStatusSelect.value;
            const details = modalStatusDetails.value.trim();
            const statusData = {
                vehicle: vehicleKey,
                status: status,
                details: status === 'not_ok' ? details : '',
                userId: localStorage.getItem("userId") || 'anonymous'
            };
            try {
                const response = await fetch('/api/vehicle-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(statusData)
                });
                if (response.ok) {
                    showNotification('Fahrzeugstatus erfolgreich aktualisiert!', 'success');
                    const modal = document.getElementById('vehicle-status-modal');
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                    document.body.classList.remove('modal-open');
                    await loadVehicleStatus();
                } else {
                    const errorData = await response.json();
                    showNotification(`Fehler beim Aktualisieren: ${errorData.error || 'Unbekannter Fehler'}`, 'error');
                }
            } catch (error) {
                showNotification('Netzwerkfehler beim Aktualisieren des Status', 'error');
            }
        });
        
        vehicleStatusModal.style.display = 'block';
        vehicleStatusModal.classList.add('show');
        document.body.classList.add('modal-open');
        // Remove previous listeners to avoid duplicates
        const closeButtonStatus = document.querySelector('.close-button-status');
        closeButtonStatus.onclick = null;
        vehicleStatusModal.onclick = null;
        // Add close listener for X button
        closeButtonStatus.addEventListener('click', function() {
            vehicleStatusModal.style.display = 'none';
            vehicleStatusModal.classList.remove('show');
            document.body.classList.remove('modal-open');
        });
        // Add close listener for click outside modal-content
        vehicleStatusModal.addEventListener('click', function(e) {
            if (e.target === vehicleStatusModal) {
                vehicleStatusModal.style.display = 'none';
                vehicleStatusModal.classList.remove('show');
                document.body.classList.remove('modal-open');
            }
        });
    }
    
    function createStatusModal() {
        const modalHTML = `
            <div id="vehicle-status-modal" class="modal">
                <div class="modal-content">
                    <span class="close-button-status">&times;</span>
                    <h2 id="statusModalTitle">Fahrzeugstatus</h2>
                    <div id="statusModalContent">
                        <div class="status-display">
                            <div id="currentStatusDisplay"></div>
                        </div>
                        <form id="updateStatusForm">
                            <div class="form-group">
                                <label for="modalStatusSelect">Status ändern:</label>
                                <select id="modalStatusSelect">
                                    <option value="ok">✅ Alles in Ordnung</option>
                                    <option value="not_ok">❌ Nicht in Ordnung</option>
                                </select>
                            </div>
                            <div class="form-group" id="modalStatusDetailsGroup" style="display:none;">
                                <label for="modalStatusDetails">Beschreibung der Probleme:</label>
                                <textarea id="modalStatusDetails" rows="3" placeholder="Beschreiben Sie die Probleme..."></textarea>
                            </div>
                            <button type="submit">Status aktualisieren</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add event listeners
        const closeButtonStatus = document.querySelector('.close-button-status');
        const modalStatusSelect = document.getElementById('modalStatusSelect');
        const modalStatusDetailsGroup = document.getElementById('modalStatusDetailsGroup');
        const updateStatusForm = document.getElementById('updateStatusForm');
        
        closeButtonStatus.addEventListener('click', () => {
            const modal = document.getElementById('vehicle-status-modal');
            modal.style.display = 'none';
            modal.classList.remove('show');
            document.body.classList.remove('modal-open');
        });
        
        // Close modal when clicking outside
        const modal = document.getElementById('vehicle-status-modal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
                document.body.classList.remove('modal-open');
            }
        });
        
        modalStatusSelect.addEventListener('change', () => {
            const detailsGroup = document.getElementById('modalStatusDetailsGroup');
            const detailsTextarea = document.getElementById('modalStatusDetails');
            
            if (modalStatusSelect.value === 'ok') {
                detailsGroup.style.display = 'none';
                detailsTextarea.value = ''; // Clear text when switching to OK
            } else {
                detailsGroup.style.display = 'block';
            }
        });
        
        updateStatusForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const vehicleKey = updateStatusForm.dataset.vehicleKey;
            const status = modalStatusSelect.value;
            const details = document.getElementById('modalStatusDetails').value.trim();
            
            // Only send details if status is not_ok
            const statusData = {
                vehicle: vehicleKey,
                status: status,
                details: status === 'not_ok' ? details : '',
                userId: localStorage.getItem("userId") || 'anonymous'
            };
            
            try {
                const response = await fetch('/api/vehicle-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(statusData)
                });
                
                if (response.ok) {
                    showNotification('Fahrzeugstatus erfolgreich aktualisiert!', 'success');
                    const modal = document.getElementById('vehicle-status-modal');
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                    document.body.classList.remove('modal-open');
                    await loadVehicleStatus();
                } else {
                    const errorData = await response.json();
                    showNotification(`Fehler beim Aktualisieren: ${errorData.error || 'Unbekannter Fehler'}`, 'error');
                }
            } catch (error) {
                console.error('Fehler beim Aktualisieren des Status:', error);
                showNotification('Netzwerkfehler beim Aktualisieren des Status', 'error');
            }
        });
    }

    // Event Listeners for login
    if (anmeldenButton) {
        anmeldenButton.addEventListener("click", () => {
            if (loginModal) {
                loginModal.style.display = "block";
                document.body.classList.add('modal-open');
                if (rfidInput) rfidInput.focus();
            }
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (loginModal) {
                loginModal.style.display = "none";
                document.body.classList.remove('modal-open');
                if (rfidInput) rfidInput.value = "";
                if (loginMessage) loginMessage.textContent = "";
            }
        });
    }

    if (anmeldenForm) {
        anmeldenForm.addEventListener("submit", (event) => {
            event.preventDefault();
            if (rfidInput) login(rfidInput.value.trim());
        });
    }

    // Initial setup
    if (isLoggedIn()) {
        anmeldenButton.style.display = "none";
        const username = localStorage.getItem("username");
        const permissions = getPermissionsFromLocalStorage();
        displayLogout(username);
        
        // Show admin features if applicable
        if (permissions.isAdmin) {
            const fahrzeugVerwaltungNav = document.getElementById("fahrzeugVerwaltungNav");
            if (fahrzeugVerwaltungNav) {
                fahrzeugVerwaltungNav.style.display = "list-item";
            }
        }
        
        // Start auto-logout system
        addActivityListeners();
        addVisibilityListeners();
        resetLogoutTimer();
        
        loadFahrten();
    }

    if (fahrzeugFilter) {
        fahrzeugFilter.addEventListener('change', () => {
            loadFahrten(fahrzeugFilter.value);
        });
    } else {
        console.error("Fahrzeugfilter element not found!");
    }
    
    // Always load trips initially
    loadFahrten();
    
    // Always load vehicle status
    loadVehicleData();
    loadVehicleData();
});
