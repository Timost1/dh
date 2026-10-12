document.addEventListener('DOMContentLoaded', function() {
    console.log("Fahrzeugverwaltung geladen");
    
    // === GLOBAL VARIABLES ===
    let vehicleData = {};
    let vehicleStatus = {};
    let vehicleHistory = [];
    let logoutTimer;
    let inactivityTimer;
    let lastActivity = Date.now();
    
    // === DOM ELEMENTS ===
    const anmeldenButton = document.getElementById("anmeldenButton");
    const abmeldenButton = document.getElementById("abmeldenButton");
    const loginModal = document.getElementById("login-modal");
    const closeButton = document.querySelector(".close-button");
    const anmeldeForm = document.getElementById("anmeldeForm");
    const rfidInput = document.getElementById("rfidInput");
    const loginMessage = document.getElementById("loginMessage");
    const vehicleOverviewContainer = document.getElementById("vehicleOverviewContainer");
    const vehicleHistoryContainer = document.getElementById("vehicleHistoryContainer");
    
    // === UTILITY FUNCTIONS ===
    function isLoggedIn() {
        return localStorage.getItem("isLoggedIn") === "true";
    }
    
    function getPermissionsFromLocalStorage() {
        const permissions = localStorage.getItem("permissions");
        return permissions ? JSON.parse(permissions) : {};
    }
    
    function displayLogout(username) {
        document.getElementById("login-status").innerHTML = 
            `<span>Angemeldet als: ${username}</span> <button id="abmeldenButton">Abmelden</button>`;
        
        const newAbmeldenButton = document.getElementById("abmeldenButton");
        newAbmeldenButton.addEventListener("click", logout);
        anmeldenButton.style.display = "none";
    }
    
    function logout() {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("username");
        localStorage.removeItem("userId");
        localStorage.removeItem("permissions");
        
        clearTimeout(logoutTimer);
        clearTimeout(inactivityTimer);
        
        document.getElementById("login-status").innerHTML = "";
        anmeldenButton.style.display = "inline-block";
        
        // Hide admin-only sections
        document.getElementById('admin-content').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        
        showNotification("Erfolgreich abgemeldet", "success");
    }
    
    function showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(n => n.remove());
        
        // Create new notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out;
        `;
        
        // Set background color based on type
        const colors = {
            'success': '#28a745',
            'error': '#dc3545',
            'warning': '#ffc107',
            'info': '#17a2b8'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }
        }, 3000);
    }
    
    // === VEHICLE DATA FUNCTIONS ===
    async function loadVehicleData() {
        try {
            // Load vehicle data from JSON files directly
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
            await loadVehicleHistory();
            displayVehicleOverview();
        } catch (error) {
            console.error('Fehler beim Laden der Fahrzeugdaten:', error);
            // Use fallback data
            vehicleData = {
                "LKW DH158": { name: "LKW DH-158", status: "ok", trips: [] },
                "Schwarzer Peugeot": { name: "Schwarzer Peugeot DH-82", status: "ok", trips: [] },
                "Weisser Peugeot": { name: "Weißer Peugeot DH-322", status: "ok", trips: [] },
                "VW": { name: "VW Caddy", status: "ok", trips: [] }
            };
            await loadVehicleStatus();
            await loadVehicleHistory();
            displayVehicleOverview();
        }
    }
    
    async function loadVehicleStatus() {
        try {
            const response = await fetch('/api/vehicle-status');
            if (response.ok) {
                vehicleStatus = await response.json();
            }
        } catch (error) {
            console.error('Fehler beim Laden des Fahrzeugstatus:', error);
            vehicleStatus = {};
        }
    }
    
    async function loadVehicleHistory() {
        try {
            const response = await fetch('/api/vehicle-history');
            if (response.ok) {
                vehicleHistory = await response.json();
                displayVehicleHistory();
            }
        } catch (error) {
            console.error('Fehler beim Laden der Fahrzeughistorie:', error);
            vehicleHistory = [];
            displayVehicleHistory();
        }
    }
    
    function displayVehicleOverview() {
        if (!vehicleOverviewContainer) return;
        
        vehicleOverviewContainer.innerHTML = '';
        
        Object.entries(vehicleData).forEach(([key, vehicle]) => {
            const status = vehicleStatus[key] || { status: 'ok', details: '', lastUpdate: null };
            const card = createVehicleCard(key, vehicle, status);
            vehicleOverviewContainer.appendChild(card);
        });
    }
    
    function createVehicleCard(vehicleKey, vehicle, status) {
        const card = document.createElement('div');
        card.className = `vehicle-card status-${status.status}`;
        
        const statusIcons = {
            'ok': '✅',
            'not_ok': '❌'
        };
        
        const statusTexts = {
            'ok': 'Alles in Ordnung',
            'not_ok': 'Nicht in Ordnung'
        };
        
        card.innerHTML = `
            <div class="vehicle-card-header">
                <h3>${vehicle.name}</h3>
                <span class="status-badge status-${status.status}">
                    ${statusIcons[status.status] || '✅'} ${statusTexts[status.status] || 'Alles in Ordnung'}
                </span>
            </div>
            <div class="vehicle-card-body">
                ${status.details ? `<p class="status-details"><strong>Problem:</strong> ${status.details}</p>` : ''}
                ${status.lastUpdate ? `<p class="last-update">Zuletzt aktualisiert: ${new Date(status.lastUpdate).toLocaleString('de-DE')}</p>` : ''}
                ${vehicle.trips ? `<p class="trip-count">Anzahl Fahrten: ${vehicle.trips.length}</p>` : ''}
            </div>
            <div class="vehicle-card-actions">
                <button class="btn-secondary" onclick="editVehicleStatus('${vehicleKey}')">Status bearbeiten</button>
                <button class="btn-primary" onclick="viewVehicleHistory('${vehicleKey}')">Historie anzeigen</button>
            </div>
        `;
        
        return card;
    }
    
    function displayVehicleHistory() {
        if (!vehicleHistoryContainer) return;
        
        if (vehicleHistory.length === 0) {
            vehicleHistoryContainer.innerHTML = '<p>Keine Statusänderungen verfügbar.</p>';
            return;
        }
        
        const timeline = document.createElement('div');
        timeline.className = 'timeline';
        
        // Sort history by date (newest first)
        vehicleHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        vehicleHistory.forEach(entry => {
            const timelineEntry = document.createElement('div');
            timelineEntry.className = 'timeline-entry';
            
            const vehicle = vehicleData[entry.vehicle]?.name || entry.vehicle;
            const statusTexts = {
                'ok': 'Alles in Ordnung',
                'not_ok': 'Nicht in Ordnung'
            };
            
            timelineEntry.innerHTML = `
                <div class="timeline-date">${new Date(entry.timestamp).toLocaleString('de-DE')}</div>
                <div class="timeline-content">
                    <h4>${vehicle}</h4>
                    <p><strong>Status:</strong> ${statusTexts[entry.status] || entry.status}</p>
                    ${entry.details ? `<p><strong>Details:</strong> ${entry.details}</p>` : ''}
                    <p class="timeline-user">von ${entry.user || 'System'}</p>
                </div>
            `;
            
            timeline.appendChild(timelineEntry);
        });
        
        vehicleHistoryContainer.innerHTML = '';
        vehicleHistoryContainer.appendChild(timeline);
    }
    
    // === GLOBAL FUNCTIONS FOR ONCLICK HANDLERS ===
    window.editVehicleStatus = function(vehicleKey) {
        const vehicle = vehicleData[vehicleKey];
        const status = vehicleStatus[vehicleKey] || { status: 'ok', details: '' };
        
        const newStatus = prompt(`Status für ${vehicle.name} ändern:\n\nAktueller Status: ${status.status === 'ok' ? 'Alles in Ordnung' : 'Nicht in Ordnung'}\n\nNeuer Status (ok/not_ok):`, status.status);
        
        if (newStatus !== null && (newStatus === 'ok' || newStatus === 'not_ok')) {
            let details = '';
            if (newStatus === 'not_ok') {
                details = prompt('Beschreibung der Probleme:', status.details || '') || '';
            }
            
            updateVehicleStatus(vehicleKey, newStatus, details);
        }
    };
    
    window.viewVehicleHistory = function(vehicleKey) {
        const vehicle = vehicleData[vehicleKey];
        const vehicleHistoryEntries = vehicleHistory.filter(entry => entry.vehicle === vehicleKey);
        
        if (vehicleHistoryEntries.length === 0) {
            alert(`Keine Statusänderungen für ${vehicle.name} verfügbar.`);
            return;
        }
        
        let historyText = `Statushistorie für ${vehicle.name}:\n\n`;
        vehicleHistoryEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        vehicleHistoryEntries.forEach(entry => {
            const statusTexts = {
                'ok': 'Alles in Ordnung',
                'not_ok': 'Nicht in Ordnung'
            };
            historyText += `${new Date(entry.timestamp).toLocaleString('de-DE')}\n`;
            historyText += `Status: ${statusTexts[entry.status] || entry.status}\n`;
            if (entry.details) historyText += `Details: ${entry.details}\n`;
            historyText += `von: ${entry.user || 'System'}\n\n`;
        });
        
        alert(historyText);
    };
    
    async function updateVehicleStatus(vehicleKey, status, details) {
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
                await loadVehicleStatus();
                await loadVehicleHistory();
                displayVehicleOverview();
            } else {
                showNotification('Fehler beim Aktualisieren des Status', 'error');
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren des Status:', error);
            showNotification('Fehler beim Aktualisieren des Status', 'error');
        }
    }
    
    // === LOGIN FUNCTIONS ===
    async function login(rfid) {
        try {
            const response = await fetch("/load_mitarbeiter");
            const mitarbeiterListe = await response.json();
            const user = mitarbeiterListe.find(m => m.rfid === rfid);
            
            if (user) {
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("username", user.name);
                localStorage.setItem("userId", user.id);
                localStorage.setItem("permissions", JSON.stringify(user.permissions || {}));
                
                displayLogout(user.name);
                showNotification(`Erfolgreich angemeldet, ${user.name}!`, 'success');
                
                // Show admin sections if user is admin
                const permissions = user.permissions || {};
                if (permissions.isAdmin) {
                    document.getElementById('admin-content').style.display = 'block';
                    document.getElementById('access-denied').style.display = 'none';
                } else {
                    document.getElementById('admin-content').style.display = 'none';
                    document.getElementById('access-denied').style.display = 'block';
                }
                
                loginModal.style.display = "none";
                document.body.classList.remove('modal-open');
                
                return true;
            } else {
                loginMessage.textContent = "Ungültige RFID. Bitte versuchen Sie es erneut.";
                return false;
            }
        } catch (error) {
            console.error("Fehler beim Anmelden:", error);
            loginMessage.textContent = "Fehler beim Anmelden. Bitte versuchen Sie es später erneut.";
            return false;
        }
    }
    
    // === EVENT LISTENERS ===
    
    // Theme Toggle Functionality
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        // Load saved theme or use dark as default
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        themeToggleBtn.textContent = savedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
        
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggleBtn.textContent = newTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
        });
    }
    
    // Mobile Navigation Toggle
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', (e) => {
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
    
    if (anmeldenButton) {
        anmeldenButton.addEventListener("click", () => {
            loginModal.style.display = "block";
            document.body.classList.add('modal-open');
            rfidInput.focus();
        });
    }
    
    if (closeButton) {
        closeButton.addEventListener("click", () => {
            loginModal.style.display = "none";
            document.body.classList.remove('modal-open');
            loginMessage.textContent = "";
        });
    }
    
    if (anmeldeForm) {
        anmeldeForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const rfid = rfidInput.value.trim();
            if (rfid) {
                await login(rfid);
                rfidInput.value = "";
            }
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener("click", (e) => {
        if (e.target === loginModal) {
            loginModal.style.display = "none";
            document.body.classList.remove('modal-open');
            loginMessage.textContent = "";
        }
    });
    
    // === INITIALIZATION ===
    
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    
    // Check if user has admin permissions
    if (isLoggedIn()) {
        const username = localStorage.getItem("username");
        const permissions = getPermissionsFromLocalStorage();
        displayLogout(username);
        
        if (permissions.isAdmin) {
            document.getElementById('admin-content').style.display = 'block';
            document.getElementById('access-denied').style.display = 'none';
        } else {
            document.getElementById('admin-content').style.display = 'none';
            document.getElementById('access-denied').style.display = 'block';
        }
    } else {
        document.getElementById('admin-content').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
    }
    
    // Load initial data
    loadVehicleData();
});