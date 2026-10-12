// Benutzerverwaltung JavaScript
// Neue Implementierung mit kombinierten Mitarbeitern und versteckten RFID-Codes

// Auto-logout variables
let logoutTimer;
let tabInactiveTimer;
const AUTO_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten in Millisekunden
const TAB_INACTIVE_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten wenn Tab inaktiv
let activityListenersAdded = false;
let visibilityListenersAdded = false;

/**
 * Setzt den Auto-Logout Timer zurück
 */
function resetLogoutTimer() {
    clearTimeout(logoutTimer);
    
    logoutTimer = setTimeout(() => {
        showNotification('Automatisch abgemeldet aufgrund von Inaktivität.', 'error', 2000);
        setTimeout(logout, 2000);
    }, AUTO_LOGOUT_TIME);
}

/**
 * Fügt Event-Listener für Benutzeraktivität hinzu
 */
function addActivityListeners() {
    if (activityListenersAdded) return;
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.addEventListener(event, resetLogoutTimer, true);
    });
    
    activityListenersAdded = true;
}

/**
 * Entfernt Event-Listener für Benutzeraktivität
 */
function removeActivityListeners() {
    if (!activityListenersAdded) return;
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.removeEventListener(event, resetLogoutTimer, true);
    });
    
    activityListenersAdded = false;
}

/**
 * Behandelt Änderungen der Tab-Sichtbarkeit
 */
function handleVisibilityChange() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn) return;
    
    if (document.hidden) {
        clearTimeout(tabInactiveTimer);
        tabInactiveTimer = setTimeout(() => {
            if (document.hidden && localStorage.getItem('isLoggedIn') === 'true') {
                logout();
            }
        }, TAB_INACTIVE_LOGOUT_TIME);
    } else {
        clearTimeout(tabInactiveTimer);
        if (localStorage.getItem('isLoggedIn') === 'true') {
            resetLogoutTimer();
        }
    }
}

/**
 * Behandelt das Schließen des Tabs oder Verlassen der Seite (nur Logging, kein Logout)
 */
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
        // KEIN localStorage.clear() mehr, damit Reload nicht abmeldet
    }
}

/**
 * Fügt Event-Listener für Tab-Sichtbarkeit hinzu
 */
function addVisibilityListeners() {
    if (visibilityListenersAdded) return;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    visibilityListenersAdded = true;
}

/**
 * Entfernt Event-Listener für Tab-Sichtbarkeit
 */
function removeVisibilityListeners() {
    if (!visibilityListenersAdded) return;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    visibilityListenersAdded = false;
}

/**
 * Logout-Prozess
 */
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

/**
 * Zeigt eine Benachrichtigung an
 */
function showNotification(message, type = 'success', duration = 3000) {
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

class UserManagement {
    constructor() {
        this.employees = [];
        this.combinedEmployees = [];
        this.filteredEmployees = [];
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadEmployees();
        this.displayCurrentUser();
        
        // Starte Auto-Logout Timer und Listeners
        addActivityListeners();
        addVisibilityListeners();
        resetLogoutTimer();
    }

    checkAuthentication() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const permissions = JSON.parse(localStorage.getItem('permissions') || '{}');
        
        if (!isLoggedIn || !permissions.isAdmin) {
            window.location.href = 'index.html';
            return;
        }
    }

    displayCurrentUser() {
        const username = localStorage.getItem('username');
        const currentUserElement = document.getElementById('currentUser');
        if (currentUserElement && username) {
            currentUserElement.innerHTML = `<i class="fas fa-user"></i> ${username}`;
        }
    }

    setupEventListeners() {
        // Zurück-Button
        document.getElementById('backButton').addEventListener('click', () => {
            window.location.href = 'adminUebersicht.html';
        });

        // Formular zum Hinzufügen neuer Mitarbeiter
        document.getElementById('addEmployeeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addNewEmployee();
        });

        // Suchfunktion
        document.getElementById('searchInput').addEventListener('input', () => {
            this.filterEmployees();
        });

        // Schichtfilter
        document.getElementById('schichtFilter').addEventListener('change', () => {
            this.filterEmployees();
        });

        // RFID Chip hinzufügen Button
        document.getElementById('addRfidButton').addEventListener('click', () => {
            this.addRfidChipInput();
        });
    }

    async loadEmployees() {
        try {
            const response = await fetch('/api/load_mitarbeiter');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            this.employees = await response.json();
            this.combineEmployees();
            this.filterEmployees();
        } catch (error) {
            console.error('Fehler beim Laden der Mitarbeiter:', error);
            this.showError('Fehler beim Laden der Mitarbeiterdaten');
        }
    }

    combineEmployees() {
        const employeeMap = new Map();
        
        this.employees.forEach(emp => {
            const key = emp.name.toLowerCase().trim();
            if (employeeMap.has(key)) {
                // Füge RFID zu existierendem Mitarbeiter hinzu
                const existing = employeeMap.get(key);
                if (!existing.rfids) existing.rfids = [existing.rfid];
                existing.rfids.push(emp.rfid);
                existing.allIds.push(emp.id);
            } else {
                // Neuer Mitarbeiter
                const combined = { ...emp };
                combined.rfids = [emp.rfid];
                combined.allIds = [emp.id];
                combined.primaryId = emp.id; // Erste ID als primäre ID
                employeeMap.set(key, combined);
            }
        });
        
        this.combinedEmployees = Array.from(employeeMap.values());
    }

    filterEmployees() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const schichtFilter = document.getElementById('schichtFilter').value;
        
        this.filteredEmployees = this.combinedEmployees.filter(emp => {
            const matchesSearch = emp.name.toLowerCase().includes(searchTerm);
            const matchesSchicht = !schichtFilter || emp.schicht === schichtFilter;
            return matchesSearch && matchesSchicht;
        });
        
        this.displayEmployees();
    }

    displayEmployees() {
        const grid = document.getElementById('employeesGrid');
        grid.innerHTML = '';
        
        if (this.filteredEmployees.length === 0) {
            grid.innerHTML = `
                <div class="no-employees">
                    <i class="fas fa-users"></i>
                    <h3>Keine Mitarbeiter gefunden</h3>
                    <p>Versuchen Sie andere Suchkriterien oder fügen Sie neue Mitarbeiter hinzu.</p>
                </div>
            `;
            return;
        }
        
        this.filteredEmployees.forEach(employee => {
            const employeeCard = this.createEmployeeCard(employee);
            grid.appendChild(employeeCard);
        });
    }

    createEmployeeCard(employee) {
        const card = document.createElement('div');
        card.className = 'employee-card';
        
        const permissions = employee.permissions || {};
        const chipCount = employee.rfids ? employee.rfids.length : 1;
        
        card.innerHTML = `
            <div class="employee-header">
                <div class="employee-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="employee-info">
                    <h3 class="employee-name">${employee.name}</h3>
                    <div class="employee-meta">
                        <span class="schicht-badge ${employee.schicht ? employee.schicht.toLowerCase() : 'no-schicht'}">
                            <i class="fas fa-clock"></i>
                            ${employee.schicht || 'Keine Schicht'}
                        </span>
                        <span class="chip-count">
                            <i class="fas fa-id-card"></i>
                            ${chipCount} Chip${chipCount > 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="employee-permissions">
                <div class="permission-badges">
                    ${permissions.isAdmin ? '<span class="permission-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                    ${permissions.meister ? '<span class="permission-badge meister"><i class="fas fa-user-tie"></i> Meister</span>' : ''}
                    ${permissions.vertreter ? '<span class="permission-badge vertreter"><i class="fas fa-user-shield"></i> Meistervertreter</span>' : ''}
                    ${permissions.kannFahrtenLoeschen ? '<span class="permission-badge delete"><i class="fas fa-trash"></i> Fahrt löschen</span>' : ''}
                    ${permissions.kannFahrtenBearbeiten ? '<span class="permission-badge edit"><i class="fas fa-edit"></i> Fahrtenbuch bearbeiten</span>' : ''}
                    ${permissions.kannWochenplanBearbeiten ? '<span class="permission-badge calendar"><i class="fas fa-calendar"></i> Wochenplan</span>' : ''}
                    ${permissions.kannProjektplanerBearbeiten ? '<span class="permission-badge project"><i class="fas fa-project-diagram"></i> Projektplaner</span>' : ''}
                </div>
            </div>
            
            <div class="employee-actions">
                <button class="action-button edit-button" onclick="userManagement.editEmployee('${employee.primaryId}')">
                    <i class="fas fa-edit"></i>
                    Bearbeiten
                </button>
                <button class="action-button delete-button" onclick="userManagement.deleteEmployee('${employee.primaryId}')">
                    <i class="fas fa-trash"></i>
                    Löschen
                </button>
            </div>
        `;
        
        return card;
    }

    async addNewEmployee() {
        const formData = new FormData(document.getElementById('addEmployeeForm'));
        const name = formData.get('name').trim();
        const schicht = formData.get('schicht');
        const rfid1 = formData.get('rfid1').trim();
        const rfid2 = formData.get('rfid2').trim();
        
        if (!name || !rfid1) {
            this.showError('Name und mindestens ein RFID-Chip sind erforderlich');
            return;
        }
        
        const permissions = {
            isAdmin: formData.has('isAdmin'),
            meister: formData.has('meister'),
            vertreter: formData.has('vertreter'),
            kannFahrtenLoeschen: formData.has('kannFahrtenLoeschen'),
            kannFahrtenBearbeiten: formData.has('kannFahrtenBearbeiten'),
            kannWochenplanBearbeiten: formData.has('kannWochenplanBearbeiten'),
            kannProjektplanerBearbeiten: formData.has('kannProjektplanerBearbeiten')
        };
        
        const adminUserId = parseInt(localStorage.getItem('userId'), 10);
        
        try {
            // Ersten Chip hinzufügen
            await this.saveEmployeeToServer(name, rfid1, permissions, schicht, adminUserId);
            
            // Zweiten Chip hinzufügen falls vorhanden
            if (rfid2) {
                await this.saveEmployeeToServer(name, rfid2, permissions, schicht, adminUserId);
            }
            
            this.showSuccess('Mitarbeiter erfolgreich hinzugefügt');
            document.getElementById('addEmployeeForm').reset();
            await this.loadEmployees();
        } catch (error) {
            console.error('Fehler beim Hinzufügen des Mitarbeiters:', error);
            this.showError('Fehler beim Hinzufügen des Mitarbeiters');
        }
    }

    async saveEmployeeToServer(name, rfid, permissions, schicht, adminUserId) {
        const response = await fetch('/api/save_mitarbeiter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                rfid,
                permissions,
                schicht,
                adminUserId
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Server-Fehler');
        }
        
        return response.json();
    }

    editEmployee(primaryId) {
        const employee = this.combinedEmployees.find(emp => emp.primaryId == primaryId);
        if (!employee) return;
        
        this.openEditModal(employee);
    }

    openEditModal(employee) {
        const modal = document.getElementById('editPermissionsModal');
        const permissions = employee.permissions || {};
        
        // Grunddaten setzen
        document.getElementById('editEmployeeId').value = employee.primaryId;
        document.getElementById('editEmployeeName').textContent = employee.name;
        document.getElementById('editEmployeeSchicht').textContent = employee.schicht || 'Keine Schicht';
        document.getElementById('editSchicht').value = employee.schicht || '';
        
        // Berechtigungen setzen
        document.getElementById('editIsAdmin').checked = permissions.isAdmin || false;
        document.getElementById('editMeister').checked = permissions.meister || false;
        document.getElementById('editMeisterVertreter').checked = permissions.vertreter || false;
        document.getElementById('editKannFahrtenLoeschen').checked = permissions.kannFahrtenLoeschen || false;
        document.getElementById('editKannFahrtenBearbeiten').checked = permissions.kannFahrtenBearbeiten || false;
        document.getElementById('editKannWochenplanBearbeiten').checked = permissions.kannWochenplanBearbeiten || false;
        document.getElementById('editKannProjektplanerBearbeiten').checked = permissions.kannProjektplanerBearbeiten || false;
        
        // RFID Chips anzeigen
        this.displayRfidChips(employee.rfids || [employee.rfid]);
        
        modal.style.display = 'block';
    }

    displayRfidChips(rfids) {
        const container = document.getElementById('rfidChipsList');
        container.innerHTML = '';
        
        rfids.forEach((rfid, index) => {
            const chipElement = document.createElement('div');
            chipElement.className = 'rfid-chip-item';
            chipElement.innerHTML = `
                <div class="chip-info">
                    <i class="fas fa-id-card"></i>
                    <span class="chip-label">Chip ${index + 1}</span>
                    <span class="chip-status">Aktiv</span>
                </div>
                <button type="button" class="remove-chip-button" onclick="userManagement.removeRfidChip('${rfid}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            container.appendChild(chipElement);
        });
    }

    addRfidChipInput() {
        const newRfid = prompt('Neuen RFID-Chip an das Lesegerät halten oder Code eingeben:');
        if (newRfid && newRfid.trim()) {
            // Temporär zu der Anzeige hinzufügen (wird beim Speichern verarbeitet)
            const container = document.getElementById('rfidChipsList');
            const chipElement = document.createElement('div');
            chipElement.className = 'rfid-chip-item new-chip';
            chipElement.innerHTML = `
                <div class="chip-info">
                    <i class="fas fa-id-card"></i>
                    <span class="chip-label">Neuer Chip</span>
                    <span class="chip-status">Nicht gespeichert</span>
                </div>
                <input type="hidden" class="new-rfid-value" value="${newRfid.trim()}">
                <button type="button" class="remove-chip-button" onclick="this.parentElement.remove()">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            container.appendChild(chipElement);
        }
    }

    async removeRfidChip(rfid) {
        if (!confirm('RFID-Chip wirklich entfernen?')) return;
        
        try {
            // Finde alle IDs die zu diesem RFID gehören
            const employeeToDelete = this.employees.find(emp => emp.rfid === rfid);
            if (employeeToDelete) {
                await this.deleteEmployeeFromServer(employeeToDelete.id);
                this.showSuccess('RFID-Chip erfolgreich entfernt');
                await this.loadEmployees();
                this.closeEditModal();
            }
        } catch (error) {
            console.error('Fehler beim Entfernen des Chips:', error);
            this.showError('Fehler beim Entfernen des Chips');
        }
    }

    async saveEmployeeChanges() {
        const employeeId = document.getElementById('editEmployeeId').value;
        const employee = this.combinedEmployees.find(emp => emp.primaryId == employeeId);
        if (!employee) return;
        
        const newPermissions = {
            isAdmin: document.getElementById('editIsAdmin').checked,
            meister: document.getElementById('editMeister').checked,
            vertreter: document.getElementById('editMeisterVertreter').checked,
            kannFahrtenLoeschen: document.getElementById('editKannFahrtenLoeschen').checked,
            kannFahrtenBearbeiten: document.getElementById('editKannFahrtenBearbeiten').checked,
            kannWochenplanBearbeiten: document.getElementById('editKannWochenplanBearbeiten').checked,
            kannProjektplanerBearbeiten: document.getElementById('editKannProjektplanerBearbeiten').checked
        };
        
        const newSchicht = document.getElementById('editSchicht').value;
        const adminUserId = parseInt(localStorage.getItem('userId'), 10);
        
        try {
            // Aktualisiere alle IDs die zu diesem Mitarbeiter gehören
            const updatePromises = employee.allIds.map(id => 
                this.updateEmployeeOnServer(id, newPermissions, newSchicht, adminUserId)
            );
            
            // Neue RFID Chips hinzufügen
            const newRfidInputs = document.querySelectorAll('.new-rfid-value');
            const newRfidPromises = Array.from(newRfidInputs).map(input => 
                this.saveEmployeeToServer(employee.name, input.value, newPermissions, newSchicht, adminUserId)
            );
            
            await Promise.all([...updatePromises, ...newRfidPromises]);
            
            this.showSuccess('Änderungen erfolgreich gespeichert');
            this.closeEditModal();
            await this.loadEmployees();
        } catch (error) {
            console.error('Fehler beim Speichern der Änderungen:', error);
            this.showError('Fehler beim Speichern der Änderungen');
        }
    }

    async updateEmployeeOnServer(id, permissions, schicht, adminUserId) {
        const response = await fetch(`/api/update_mitarbeiter_permissions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                permissions,
                schicht,
                adminUserId
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server-Fehler');
        }
        
        return response.json();
    }

    async deleteEmployee(primaryId) {
        const employee = this.combinedEmployees.find(emp => emp.primaryId == primaryId);
        if (!employee) return;
        
        if (!confirm(`Mitarbeiter "${employee.name}" wirklich löschen? Alle zugehörigen RFID-Chips werden entfernt.`)) return;
        
        try {
            // Lösche alle IDs die zu diesem Mitarbeiter gehören
            const deletePromises = employee.allIds.map(id => this.deleteEmployeeFromServer(id));
            await Promise.all(deletePromises);
            
            this.showSuccess('Mitarbeiter erfolgreich gelöscht');
            await this.loadEmployees();
        } catch (error) {
            console.error('Fehler beim Löschen des Mitarbeiters:', error);
            this.showError('Fehler beim Löschen des Mitarbeiters');
        }
    }

    async deleteEmployeeFromServer(id) {
        const adminUserId = parseInt(localStorage.getItem('userId'), 10);
        const response = await fetch(`/api/delete_mitarbeiter/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUserId })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server-Fehler');
        }
        
        return response.json();
    }

    closeEditModal() {
        document.getElementById('editPermissionsModal').style.display = 'none';
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type) {
        // Einfache Alert-Implementierung - kann später durch Toast-Nachrichten ersetzt werden
        alert(message);
    }
}

// Globale Funktionen
function closeEditModal() {
    userManagement.closeEditModal();
}

function saveEmployeeChanges() {
    userManagement.saveEmployeeChanges();
}

// Globale Instanz
let userManagement;

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    userManagement = new UserManagement();
});