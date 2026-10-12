// Modernized Fahrtenbuch JavaScript with Login System and Vehicle Status
document.addEventListener('DOMContentLoaded', async () => {
    // === DOM ELEMENTS ===
    const fahrtenForm = document.getElementById('fahrtenForm');
    const fahrzeugSelect = document.getElementById('fahrzeug');
    const kilometerInput = document.getElementById('kilometer');
    const fahrerInput = document.getElementById('fahrer');
    const fahrzeugstatusSelect = document.getElementById('fahrzeugstatus');
    const statusDetailsGroup = document.getElementById('statusDetailsGroup');
    const statusDetailsTextarea = document.getElementById('statusDetails');
    const vehicleStatusContainer = document.getElementById('vehicleStatusContainer');
    
    // Login Elements
    const anmeldenButton = document.getElementById("anmeldenButton");
    const loginModal = document.getElementById("login-modal");
    const closeButton = loginModal ? loginModal.querySelector('.close-button') : null;
    const anmeldenForm = document.getElementById("anmeldeForm");
    const rfidInput = document.getElementById("rfidInput");
    const loginMessage = document.getElementById("loginMessage");
    const notificationContainer = document.getElementById('notification-container');
    const notificationMessage = document.getElementById('notification-message');
    const fahrzeugVerwaltungNav = document.getElementById("fahrzeugVerwaltungNav");
    
    // === AUTO-LOGOUT SYSTEM ===
    let logoutTimer;
    let tabInactiveTimer;
    const AUTO_LOGOUT_TIME = 5 * 60 * 1000; // 5 Minuten
    const TAB_INACTIVE_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten bei Tab-Inaktivität
    let activityListenersAdded = false;
    let visibilityListenersAdded = false;
    
    // === VEHICLE DATA ===
    let vehicleData = {};
    
    // === HELPER FUNCTIONS ===
    function isLoggedIn() {
        return localStorage.getItem("isLoggedIn") === "true";
    }
    
    function getPermissionsFromLocalStorage() {
        const permissionsString = localStorage.getItem("permissions");
        try {
            return permissionsString ? JSON.parse(permissionsString) : { isAdmin: false };
        } catch (e) {
            console.error("Error parsing permissions:", e);
            return { isAdmin: false };
        }
    }
    
    function showNotification(message, type = 'success', duration = 3000) {
        if (notificationContainer && notificationMessage) {
            notificationMessage.textContent = message;
            notificationContainer.classList.remove('notification-success', 'notification-error');
            
            if (type === 'success') {
                notificationContainer.classList.add('notification-success');
            } else if (type === 'error') {
                notificationContainer.classList.add('notification-error');
            }
            
            notificationContainer.classList.add('show');
            setTimeout(() => {
                notificationContainer.classList.remove('show');
            }, duration);
        }
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
                if (anmeldenButton) anmeldenButton.style.display = "none";
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
                
                // Load vehicle data
                await loadVehicleData();
                await loadVehicleStatus();
                
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
        loginStatusDiv.innerHTML = `<span style="color:green;">Willkommen, ${username}!</span>`;
        loginStatusDiv.innerHTML += `<button id="abmeldenButton">Abmelden</button>`;
        document.getElementById("abmeldenButton").addEventListener("click", logout);
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
            
            if (fahrzeugVerwaltungNav) fahrzeugVerwaltungNav.style.display = "none";
            localStorage.clear();
            location.reload();
        }, 3000);
    }
    
    // === VEHICLE FUNCTIONS ===
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
            
            populateVehicleSelect();
        } catch (error) {
            console.error('Fehler beim Laden der Fahrzeugdaten:', error);
            // Use fallback data
            vehicleData = {
                "LKW DH158": { name: "LKW DH-158", status: "ok" },
                "Schwarzer Peugeot": { name: "Schwarzer Peugeot DH-82", status: "ok" },
                "Weisser Peugeot": { name: "Weißer Peugeot DH-322", status: "ok" },
                "VW": { name: "VW Caddy", status: "ok" }
            };
            populateVehicleSelect();
        }
    }
    
    function populateVehicleSelect() {
        if (fahrzeugSelect) {
            fahrzeugSelect.innerHTML = '<option value="">-- Bitte auswählen --</option>';
            Object.entries(vehicleData).forEach(([key, vehicle]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = vehicle.name;
                fahrzeugSelect.appendChild(option);
            });
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
                ${status.details ? `<p class="status-details">${status.details}</p>` : ''}
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
        const vehicleStatusModal = document.getElementById('vehicle-status-modal');
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
                ${status.details ? `<p><strong>Details:</strong> ${status.details}</p>` : ''}
                ${status.lastUpdate ? `<p><strong>Letzte Aktualisierung:</strong> ${new Date(status.lastUpdate).toLocaleString('de-DE')}</p>` : ''}
            </div>
        `;
        
        // Set form values
        modalStatusSelect.value = status.status || 'ok';
        modalStatusDetails.value = status.details || '';
        updateStatusForm.dataset.vehicleKey = vehicleKey;
        
        // Show/hide details based on status
        if (modalStatusSelect.value === 'ok') {
            modalStatusDetailsGroup.style.display = 'none';
        } else {
            modalStatusDetailsGroup.style.display = 'block';
        }
        
        vehicleStatusModal.style.display = 'block';
        document.body.classList.add('modal-open');
    }
    
    async function saveVehicleStatus(vehicleKey, statusInfo) {
        try {
            const response = await fetch('/api/vehicle-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicle: vehicleKey,
                    status: statusInfo.status,
                    details: statusInfo.details,
                    userId: localStorage.getItem("userId")
                })
            });
            
            if (response.ok) {
                await loadVehicleStatus(); // Reload status display
            }
        } catch (error) {
            console.error('Fehler beim Speichern des Fahrzeugstatus:', error);
        }
    }
    
    // === FORM HANDLING ===
    async function getLastKilometerstand(fahrzeug) {
        try {
            const response = await fetch(`/api/load_data?fahrzeug=${fahrzeug}`);
            if (response.ok) {
                const fahrten = await response.json();
                if (fahrten.length > 0) {
                    return fahrten[0].kilometer;
                }
            }
        } catch (error) {
            console.error('Fehler beim Laden der Daten:', error);
        }
        return 0;
    }
    
    // === EVENT LISTENERS ===
    
    // Vehicle status details toggle
    if (fahrzeugstatusSelect) {
        fahrzeugstatusSelect.addEventListener('change', () => {
            if (fahrzeugstatusSelect.value === 'ok') {
                statusDetailsGroup.style.display = 'none';
            } else {
                statusDetailsGroup.style.display = 'block';
            }
        });
    }
    
    // Vehicle Status Modal Elements
    const vehicleStatusModal = document.getElementById('vehicle-status-modal');
    const closeButtonStatus = document.querySelector('.close-button-status');
    const statusModalTitle = document.getElementById('statusModalTitle');
    const currentStatusDisplay = document.getElementById('currentStatusDisplay');
    const updateStatusForm = document.getElementById('updateStatusForm');
    const modalStatusSelect = document.getElementById('modalStatusSelect');
    const modalStatusDetailsGroup = document.getElementById('modalStatusDetailsGroup');
    const modalStatusDetails = document.getElementById('modalStatusDetails');
    
    // Modal status select change handler
    if (modalStatusSelect) {
        modalStatusSelect.addEventListener('change', () => {
            if (modalStatusSelect.value === 'ok') {
                modalStatusDetailsGroup.style.display = 'none';
            } else {
                modalStatusDetailsGroup.style.display = 'block';
            }
        });
    }
    
    // Close status modal
    if (closeButtonStatus) {
        closeButtonStatus.addEventListener('click', () => {
            vehicleStatusModal.style.display = 'none';
            document.body.classList.remove('modal-open');
        });
    }
    
    // Update status form submission
    if (updateStatusForm) {
        updateStatusForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const vehicleKey = updateStatusForm.dataset.vehicleKey;
            const status = modalStatusSelect.value;
            const details = modalStatusDetails.value.trim();
            
            try {
                const response = await fetch('/api/vehicle-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicle: vehicleKey,
                        status: status,
                        details: details,
                        userId: localStorage.getItem("userId") || 'anonymous'
                    })
                });
                
                if (response.ok) {
                    showNotification('Fahrzeugstatus erfolgreich aktualisiert!', 'success');
                    vehicleStatusModal.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    await loadVehicleStatus();
                } else {
                    showNotification('Fehler beim Aktualisieren des Status', 'error');
                }
            } catch (error) {
                console.error('Fehler beim Aktualisieren des Status:', error);
                showNotification('Fehler beim Aktualisieren des Status', 'error');
            }
        });
    }
    
    // Vehicle selection change
    if (fahrzeugSelect) {
        fahrzeugSelect.addEventListener('change', async () => {
            const selectedFahrzeug = fahrzeugSelect.value;
            if (selectedFahrzeug) {
                const lastKilometerstand = await getLastKilometerstand(selectedFahrzeug);
                if (!isNaN(lastKilometerstand)) {
                    kilometerInput.value = lastKilometerstand;
                }
            } else {
                kilometerInput.value = '';
            }
        });
    }

    // RFID recognition for driver input
    if (fahrerInput) {
        fahrerInput.addEventListener('input', async (event) => {
            const currentValue = event.target.value.trim();
            if (currentValue && currentValue.length >= 4 && !currentValue.includes(' ')) {
                try {
                    const response = await fetch('/api/load_mitarbeiter');
                    if (!response.ok) return;
                    const mitarbeiterData = await response.json();
                    const foundMitarbeiter = mitarbeiterData.find(m => String(m.rfid).trim() === currentValue);
                    if (foundMitarbeiter) {
                        event.target.value = foundMitarbeiter.name;
                    }
                } catch (error) {
                    console.error("Fehler bei der RFID-Namenssuche:", error);
                }
            }
        });
        fahrerInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
            }
        });
    }
    
    // Form submission
    if (fahrtenForm) {
        fahrtenForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            console.log('Fahrten-Formular wurde abgeschickt');
            // Check all required elements
            if (!fahrzeugSelect) { console.error('fahrzeugSelect fehlt!'); return; }
            if (!kilometerInput) { console.error('kilometerInput fehlt!'); return; }
            if (!fahrerInput) { console.error('fahrerInput fehlt!'); return; }
            if (!fahrzeugstatusSelect) { console.error('fahrzeugstatusSelect fehlt!'); return; }
            if (!statusDetailsTextarea) { console.error('statusDetailsTextarea fehlt!'); return; }
            // Entferne Login-Pflicht
            // if (!isLoggedIn()) {
            //     showNotification('Bitte melden Sie sich an, um eine Fahrt zu speichern.', 'error');
            //     return;
            // }
            const datum = new Date().toISOString();
            const fahrzeug = fahrzeugSelect.value;
            const kilometer = parseInt(kilometerInput.value);
            const ort = document.getElementById('ort') ? document.getElementById('ort').value : '';
            const anmerkung = document.getElementById('anmerkung') ? document.getElementById('anmerkung').value : '';
            const fahrer = fahrerInput.value;
            const fahrzeugstatus = fahrzeugstatusSelect.value;
            const statusDetails = statusDetailsTextarea.value;
            // Debug: Log Form Values
            console.log({datum, fahrzeug, kilometer, ort, anmerkung, fahrer, fahrzeugstatus, statusDetails});
            // Validation
            const lastKilometerstand = await getLastKilometerstand(fahrzeug);
            if (kilometer <= lastKilometerstand) {
                showNotification(`Der Kilometerstand muss größer sein als der letzte Eintrag für dieses Fahrzeug (${lastKilometerstand}).`, 'error');
                return;
            }
            try {
                // Save trip
                const tripResponse = await fetch('/api/save_data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        datum,
                        fahrzeug,
                        fahrer,
                        kilometer,
                        ort,
                        anmerkung,
                        fahrzeugstatus,
                        statusDetails,
                        userId: localStorage.getItem("userId") || 'anonymous'
                    }),
                });
                // Debug: Log Response Status
                console.log('Response status:', tripResponse.status);
                const tripResult = await tripResponse.json().catch(() => null);
                // Debug: Log Response Body
                console.log('Response body:', tripResult);
                if (tripResponse.ok && (!tripResult || !tripResult.error)) {
                    if (fahrzeugstatus !== 'ok') {
                        await saveVehicleStatus(fahrzeug, {
                            status: fahrzeugstatus,
                            details: statusDetails
                        });
                    }
                    showNotification('Fahrt erfolgreich hinzugefügt!', 'success');
                    fahrtenForm.reset();
                    kilometerInput.value = kilometer;
                    statusDetailsGroup.style.display = 'none';
                } else {
                    showNotification('Fehler beim Speichern der Daten. ' + (tripResult && tripResult.error ? tripResult.error : 'Bitte versuchen Sie es erneut.'), 'error');
                }
            } catch (error) {
                console.error('Fehler beim Speichern der Daten:', error);
                showNotification('Fehler beim Speichern der Daten. Bitte versuchen Sie es erneut.', 'error');
            }
        });
    }
    
    // Login modal events
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
            if (loginModal) loginModal.style.display = "none";
            document.body.classList.remove('modal-open');
            if (rfidInput) rfidInput.value = "";
            if (loginMessage) loginMessage.textContent = "";
        });
    }
    if (anmeldenForm) {
        anmeldenForm.addEventListener("submit", (event) => {
            event.preventDefault();
            if (rfidInput) login(rfidInput.value.trim());
        });
    }
    
    // Mobile navigation
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('show');
        });
    }
    
    // === THEME TOGGLE FUNKTIONALITÄT === (wie auf der Startseite)
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    // Lade das gespeicherte Theme oder verwende dunkel als Standard
    const savedTheme = localStorage.getItem('theme') || 'dark';
    body.setAttribute('data-theme', savedTheme);
    
    // Event-Listener für Theme-Wechsel
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            // Setze neues Theme
            body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // Füge Animations-Effekt hinzu
            themeToggle.style.transform = 'scale(0.9) rotate(180deg)';
            setTimeout(() => {
                themeToggle.style.transform = '';
            }, 200);
        });
    }
    
    await loadVehicleData();
    
    // Check login status and configure UI
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
        
        await loadVehicleStatus();
    }
});
