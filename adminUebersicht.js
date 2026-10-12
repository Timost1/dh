// Admin Dashboard JavaScript
// Neue Übersicht ohne Log-Funktionen, fokussiert auf Statistiken und Benutzerverwaltung
class AdminDashboard {
    constructor() {
        this.employees = [];
        this.shifts = ['A', 'B', 'C', 'D', 'E', 'F', 'Buero'];
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadDashboardData();
        this.initTheme();
    }

    checkAuthentication() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const permissions = JSON.parse(localStorage.getItem('permissions') || '{}');
        
        if (!isLoggedIn || !permissions.isAdmin) {
            window.location.href = 'index.html';
            return;
        }
    }

    setupEventListeners() {
        document.getElementById('backButton').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const themeIcon = document.querySelector('.theme-icon');
        themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    async loadDashboardData() {
        try {
            const response = await fetch('/api/load_mitarbeiter');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            this.employees = await response.json();
            this.updateStatistics();
            this.updateShiftsOverview();
            this.updateRecentEvents();
        } catch (error) {
            console.error('Fehler beim Laden der Dashboard-Daten:', error);
        }
    }

    updateStatistics() {
        // Kombiniere Mitarbeiter mit gleichen Namen
        const uniqueEmployees = this.combineEmployeesByName(this.employees);
        
        const totalEmployees = uniqueEmployees.length;
        const totalAdmins = uniqueEmployees.filter(emp => emp.permissions?.isAdmin).length;
        const totalRfidChips = this.employees.length; // Gesamtanzahl aller RFID-Chips
        const activeShifts = new Set(uniqueEmployees.map(emp => emp.schicht).filter(s => s)).size;

        document.getElementById('totalEmployees').textContent = totalEmployees.toLocaleString();
        document.getElementById('totalAdmins').textContent = totalAdmins.toLocaleString();
        document.getElementById('totalRfidChips').textContent = totalRfidChips.toLocaleString();
        document.getElementById('totalShifts').textContent = activeShifts.toLocaleString();
    }

    combineEmployeesByName(employees) {
        const employeeMap = new Map();
        
        employees.forEach(emp => {
            const key = emp.name.toLowerCase().trim();
            if (employeeMap.has(key)) {
                // Füge RFID zu existierendem Mitarbeiter hinzu
                const existing = employeeMap.get(key);
                if (!existing.rfids) existing.rfids = [existing.rfid];
                existing.rfids.push(emp.rfid);
            } else {
                // Neuer Mitarbeiter
                const combined = { ...emp };
                combined.rfids = [emp.rfid];
                employeeMap.set(key, combined);
            }
        });
        
        return Array.from(employeeMap.values());
    }

    updateShiftsOverview() {
        const shiftsGrid = document.getElementById('shiftsGrid');
        const uniqueEmployees = this.combineEmployeesByName(this.employees);
        
        shiftsGrid.innerHTML = '';
        
        this.shifts.forEach(shift => {
            const employeesInShift = uniqueEmployees.filter(emp => emp.schicht === shift);
            
            const shiftCard = document.createElement('div');
            shiftCard.className = 'shift-card';
            shiftCard.innerHTML = `
                <div class="shift-header">
                    <h3>Schicht ${shift}</h3>
                    <span class="shift-count">${employeesInShift.length}</span>
                </div>
                <div class="shift-details">
                    <p>Mitarbeiter: ${employeesInShift.length}</p>
                    <p>Admins: ${employeesInShift.filter(emp => emp.permissions?.isAdmin).length}</p>
                </div>
            `;
            
            shiftsGrid.appendChild(shiftCard);
        });
    }
/*
    updateRecentEvents() {
        const recentEvents = document.getElementById('recentEvents');
        const now = new Date();
        
        // Simulierte letzte Ereignisse (ohne detaillierte Logs)
        const events = [
            {
                type: 'user_added',
                message: 'Neuer Mitarbeiter hinzugefügt',
                time: new Date(now - 2 * 60 * 60 * 1000), // 2 Stunden her
                icon: 'fas fa-user-plus'
            },
            {
                type: 'permissions_updated',
                message: 'Berechtigungen aktualisiert',
                time: new Date(now - 5 * 60 * 60 * 1000), // 5 Stunden her
                icon: 'fas fa-user-shield'
            },
            {
                type: 'system_backup',
                message: 'Automatisches Backup durchgeführt',
                time: new Date(now - 24 * 60 * 60 * 1000), // 1 Tag her
                icon: 'fas fa-database'
            }
        ];
        
        recentEvents.innerHTML = events.map(event => `
            <div class="recent-item">
                <div class="recent-icon">
                    <i class="${event.icon}"></i>
                </div>
                <div class="recent-content">
                    <div class="recent-message">${event.message}</div>
                    <div class="recent-time">${this.getTimeAgo(event.time)}</div>
                </div>
            </div>
        `).join('');
    }

    */

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
        if (diffHours > 0) return `vor ${diffHours} Stunde${diffHours > 1 ? 'n' : ''}`;
        return 'vor wenigen Minuten';
    }
}

// === Automatisches Logout-System ===
let logoutTimer;
let tabInactiveTimer;
const AUTO_LOGOUT_TIME = 5 * 60 * 1000; // 5 Minuten
const TAB_INACTIVE_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten bei Tab-Inaktivität
let activityListenersAdded = false;
let visibilityListenersAdded = false;

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

// Globale Funktionen für Schnellzugriff-Karten

function showReports() {
    alert('Berichte - Noch nicht implementiert');
}

function showBackup() {
    alert('Backup & Export - Noch nicht implementiert');
}

// Globale Instanz erstellen
let adminDashboard;

// Initialisierung wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    adminDashboard = new AdminDashboard();
    // Starte automatisches Logout-System
    addActivityListeners();
    addVisibilityListeners();
    resetLogoutTimer();
});