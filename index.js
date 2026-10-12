// Hauptevent-Listener, der ausgeführt wird, sobald das DOM vollständig geladen ist
document.addEventListener('DOMContentLoaded', async () => {
    // === DOM-ELEMENT REFERENZEN ===
    // Holen aller wichtigen DOM-Elemente für die spätere Verwendung
    const nummernListe = document.getElementById('nummernListe'); // Liste der Telefonnummern
    const schwarzesBrettParagraph = document.getElementById('schwarzesBrettText'); // Bereich für Schwarzes Brett Text
    const anmeldenButton = document.getElementById("anmeldenButton"); // Button zum Öffnen des Login-Modals
    const modal = document.getElementById("modal"); // Login-Modal
    const closeButton = document.querySelector('.close-button'); // Schließen-Button für Modal
    const anmeldenForm = document.getElementById("anmeldeForm"); // Login-Formular
    const rfidInput = document.getElementById("rfidInput"); // RFID-Eingabefeld
    const loginMessage = document.getElementById("loginMessage"); // Login-Statusnachricht
    const notificationContainer = document.getElementById('notification-container'); // Container für Benachrichtigungen
    const notificationMessage = document.getElementById('notification-message'); // Benachrichtigungstext
    const adminEbene = document.getElementById("adminEbene"); // Admin-Navigationslink
    const projektplanerNav = document.getElementById("projektplanerNav"); // Projektplaner-Navigationslink
    const tagesplanInhaltDiv = document.getElementById("tagesplanInhalt"); // Bereich für Tagesplan-Anzeige
    const themeToggle = document.getElementById('theme-toggle'); // Button zum Umschalten des Themes
    const body = document.body; // Body-Element für Theme-Verwaltung
    
    // Modal-Elemente für Nummern-Bearbeitung
    const nummernModal = document.getElementById('nummernModal'); // Modal für Nummern-Bearbeitung
    const nummernModalClose = document.getElementById('nummernModalClose'); // Schließen-Button für Nummern-Modal
    const nummernModalForm = document.getElementById('nummernModalForm'); // Formular im Nummern-Modal
    const nummernModalLabel = document.getElementById('nummernModalLabel'); // Label im Nummern-Modal
    const nummernModalInput = document.getElementById('nummernModalInput'); // Eingabefeld im Nummern-Modal
    const nummernModalMessage = document.getElementById('nummernModalMessage'); // Statusnachricht im Nummern-Modal
    const clearNummernInput = document.getElementById('clearNummernInput'); // Button zum Leeren des Eingabefeldes
    
    // === EVENT-LISTENER FÜR NUMMERN-LISTE (EVENT DELEGATION) ===
    // Verwendet Event Delegation, um Klicks auf dynamisch erstellte Listenelemente zu behandeln
    if (nummernListe) {
        nummernListe.addEventListener('click', async (e) => {
            // Suche nach dem nächsten Listenelement
            const li = e.target.closest('.nummern-eintrag');
            if (!li) return; // Beende, wenn kein Listenelement gefunden wurde

            // Prüfe, ob auf den Löschen-Button geklickt wurde
            const deleteBtn = e.target.closest('.delete-nummer-btn');
            // Prüfe, ob auf den Namen oder Edit-Icon geklickt wurde
            const editTrigger = e.target.closest('.name-container, .edit-icon');

            if (deleteBtn) {
                // Verhindere, dass das Bearbeitungsmodal geöffnet wird
                e.stopPropagation();
                const nummerToDelete = deleteBtn.dataset.nummer;
                
                // Erstelle aktualisiertes Telefonbuch mit geleerten Eintrag
                const updatedTelefonbuch = { ...telefonbuchCache, [nummerToDelete]: '' };
                const loggedInUserId = localStorage.getItem("userId");

                try {
                    // Sende die Löschung an den Server
                    const response = await fetch('/api/save_telefonbuch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            telefonbuch: updatedTelefonbuch, 
                            userId: loggedInUserId ? parseInt(loggedInUserId, 10) : null,
                            logDetails: true, // Flag für detailliertes Logging
                            changedNumber: nummerToDelete,
                            oldName: telefonbuchCache[nummerToDelete] || '',
                            newName: ''
                        })
                    });
                    const data = await response.json();
                    // Zeige Erfolgsnachricht
                    showNotification(`Eintrag für ${nummerToDelete} geleert.`, 'success');
                    // Lade Daten neu für Konsistenz
                    await loadAndDisplayData();
                } catch (error) {
                    // Zeige Fehlernachricht
                    showNotification('Fehler beim Leeren des Eintrags!', 'error');
                    await loadAndDisplayData(); 
                }

            } else if (editTrigger) {
                // Öffne das Bearbeitungsmodal
                aktuelleNummer = li.dataset.nummer;
                if (nummernModal && nummernModalLabel && nummernModalInput) {
                    nummernModalLabel.textContent = `Name für ${aktuelleNummer}:`;
                    nummernModalInput.value = telefonbuchCache[aktuelleNummer] || '';
                    nummernModalMessage.textContent = '';
                    nummernModal.style.display = 'block';
                    nummernModalInput.focus();
                }
            }
        });
    }

    // === EVENT-LISTENER FÜR EINGABEFELD-LÖSCHEN ===
    // Button zum Leeren des Eingabefeldes im Nummern-Modal
    if (clearNummernInput && nummernModalInput) {
        clearNummernInput.addEventListener('click', () => {
            nummernModalInput.value = '';
            nummernModalInput.focus();
        });
    }

    // === KONFIGURATIONSVARIABLEN ===
    // Variablen für das Polling-System (regelmäßige Datenaktualisierung)
    let lastTelefonbuchDataString = null; // Letzter Zustand des Telefonbuchs
    let lastSchwarzesBrettText = null; // Letzter Zustand des Schwarzen Bretts
    let lastTagesplanString = null; // Letzter Zustand des Tagesplans
    const POLLING_INTERVAL = 30000; // Daten alle 30 Sekunden abrufen (30000ms = 30s)
    
    // Variablen für Tab-Blinken bei Aktualisierungen
    let originalTitle = document.title; // Originaler Seitentitel
    let blinkInterval = null; // Interval für das Blinken

    // Auto-Logout Timer
    let logoutTimer;
    const AUTO_LOGOUT_TIME = 5 * 60 * 1000; // 5 Minuten in Millisekunden
    let activityListenersAdded = false;
    
    // Tab Visibility Tracking
    let tabInactiveTimer;
    const TAB_INACTIVE_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten wenn Tab inaktiv
    let visibilityListenersAdded = false;

    // === INITIAL-KONFIGURATION ===
    // Admin- und Projektplaner-Navigation initial ausblenden
    adminEbene.style.display = "none";
    projektplanerNav.style.display = "none";

    // Cache für Telefonbuch-Daten und aktuelle Nummer
    let telefonbuchCache = {};
    let aktuelleNummer = null;

    // === HILFSFUNKTIONEN ===

    /**
     * Prüft, ob ein Benutzer eingeloggt ist
     * @returns {boolean} True wenn eingeloggt, false wenn nicht
     */
    function isLoggedIn() {
        return localStorage.getItem("isLoggedIn") === "true";
    }

    /**
     * Zeigt eine Benachrichtigung an
     * @param {string} message - Die anzuzeigende Nachricht
     * @param {string} type - Der Typ der Benachrichtigung ('success' oder 'error')
     * @param {number} duration - Anzeigedauer in Millisekunden
     */
    function showNotification(message, type = 'success', duration = 3000) {
        if (notificationContainer && notificationMessage) {
            notificationMessage.textContent = message;
            // Entferne vorherige Typ-Klassen für korrekte Styling
            notificationContainer.classList.remove('notification-success', 'notification-error');

            // Füge die entsprechende Typ-Klasse hinzu
            if (type === 'success') {
                notificationContainer.classList.add('notification-success');
            } else if (type === 'error') {
                notificationContainer.classList.add('notification-error');
            }

            // Zeige die Benachrichtigung an
            notificationContainer.classList.add('show');

            // Verstecke die Benachrichtigung nach der angegebenen Dauer
            setTimeout(() => {
                notificationContainer.classList.remove('show');
            }, duration);
        }
    }

    /**
     * Parst Benutzerberechtigungen aus dem LocalStorage
     * @returns {object} Berechtigungsobjekt mit isAdmin-Flag
     */
    function getPermissionsFromLocalStorage() {
        const permissionsString = localStorage.getItem("permissions");
        try {
            return permissionsString ? JSON.parse(permissionsString) : { isAdmin: false };
        } catch (e) {
            console.error("Error parsing permissions from localStorage in index.js:", e);
            return { isAdmin: false }; // Sicherer Fallback
        }
    }

    // === INITIAL UI SETUP BASIEREND AUF LOGIN-STATUS ===
    // Prüfe Login-Status und konfiguriere UI entsprechend
    if (isLoggedIn()){
        anmeldenButton.style.display = "none";
        const permissions = getPermissionsFromLocalStorage();
        
        // Zeige Admin-Navigation nur für Admins
        if (permissions.isAdmin){
            adminEbene.style.display = "list-item";
        }
        
        // Zeige Projektplaner-Navigation nur für berechtigte Benutzer
        if (permissions.kannProjektplanerBearbeiten) {
            projektplanerNav.style.display = "list-item";
        }
        
        // Stelle Login-Status im Header wieder her
        displayLogout(localStorage.getItem("username"));
    }

    /**
     * Lädt Mitarbeiterdaten vom Server
     * @returns {Promise<Array>} Array mit Mitarbeiterdaten
     */
    async function fetchMitarbeiterData() {
        try {
            const response = await fetch("mitarbeiter.json");
            return await response.json();
        } catch (error) {
            console.error("Fehler beim Laden der Mitarbeiterdaten:", error);
            return [];
        }
    }

    /**
     * Führt Login-Prozess durch
     * @param {string} rfid - RFID-Code des Benutzers
     */
    async function login(rfid) {
        const mitarbeiter = await fetchMitarbeiterData();
        // Suche Benutzer anhand der RFID
        const user = mitarbeiter.find(m => String(m.rfid).trim() === rfid);

        if (user) {
            // Setze Login-Status in LocalStorage
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("username", user.name);
            localStorage.setItem("permissions", JSON.stringify(user.permissions || {}));
            localStorage.setItem("userId", user.id);
            
            // Schließe Login-Modal
            modal.style.display = "none";
            anmeldenButton.style.display ="none";
            
            // Sende Login-Information an Server für Logging
            fetch('/api/log_login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            }).catch(err => console.error('Fehler beim Senden des Login-Logs:', err));

            // Entferne Modal-Styling vom Body
            document.body.classList.remove('modal-open');
            // Zeige Logout-Button und Willkommensnachricht
            displayLogout(user.name);
            showNotification(`Erfolgreich angemeldet, ${user.name}!`, 'success');
            console.log("Benutzer erfolgreich angemeldet:", user, "Permissions:", user.permissions);
            
            // Konfiguriere UI basierend auf Benutzerberechtigungen
            if (user.permissions) {
                if (user.permissions.isAdmin) {
                    adminEbene.style.display = "list-item";
                } else {
                    adminEbene.style.display = "none";
                }
                if (user.permissions.kannProjektplanerBearbeiten) {
                    projektplanerNav.style.display = "list-item";
                } else {
                    projektplanerNav.style.display = "none";
                }
            }
        } else {
            // Zeige Fehlermeldung bei ungültiger RFID
            loginMessage.textContent = "RFID ungültig. Zugriff verweigert!";
            loginMessage.style.color = "red";
        }
    }

    /**
     * Zeigt Logout-Button und Willkommensnachricht an
     * @param {string} username - Name des eingeloggten Benutzers
     */
    function displayLogout(username) {
        const loginStatusDiv = document.getElementById("login-status");
        // Erstelle Willkommensnachricht
        loginStatusDiv.innerHTML = `<span id="loginMessage" style="color:green;">Willkommen, ${username}!</span>`;
        // Füge Logout-Button hinzu
        loginStatusDiv.innerHTML += `<button id="abmeldenButton">Abmelden</button>`;
        // Verbinde Logout-Button mit Logout-Funktion
        document.getElementById("abmeldenButton").addEventListener("click", logout);
        // Starte Auto-Logout Timer, Activity Listeners und Visibility Listeners
        addActivityListeners();
        addVisibilityListeners();
        resetLogoutTimer();
    }

    /**
     * Führt Logout-Prozess durch
     */
    function logout() {
        // Hole User-ID vor dem Löschen des LocalStorage
        const userIdToLog = localStorage.getItem("userId");

        // Entferne alle Listener und stoppe Timer
        removeActivityListeners();
        removeVisibilityListeners();
        clearTimeout(logoutTimer);
        clearTimeout(tabInactiveTimer);

        // Zeige Logout-Nachricht
        showNotification('Erfolgreich abgemeldet. Die Seite wird neu geladen.', 'error', 2000);
        
        // Verzögerung für sichtbare Benachrichtigung vor Reload
        setTimeout(() => {
            // Sende Logout-Information an Server für Logging
            if (userIdToLog) {
                fetch('/api/log_logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: parseInt(userIdToLog, 10) })
                }).catch(err => console.error('Fehler beim Senden des Logout-Logs:', err));
            }
            
            // Verstecke Admin-spezifische UI-Elemente
            adminEbene.style.display = "none";
            projektplanerNav.style.display = "none";

            // Lösche alle gespeicherten Daten und lade Seite neu
            localStorage.clear();
            location.reload();
        }, 3000);
    }

    /**
     * Setzt den Auto-Logout Timer zurück
     * Wird bei jeder Benutzeraktivität aufgerufen
     */
    function resetLogoutTimer() {
        // Lösche den vorhandenen Timer
        clearTimeout(logoutTimer);
        
        // Setze neuen Timer auf 5 Minuten
        logoutTimer = setTimeout(() => {
            // Automatischer Logout nach 5 Minuten Inaktivität
            showNotification('Automatisch abgemeldet aufgrund von Inaktivität.', 'error', 2000);
            setTimeout(logout, 2000);
        }, AUTO_LOGOUT_TIME);
    }
    
    /**
     * Fügt Event-Listener für Benutzeraktivität hinzu
     * Wird nur einmal aufgerufen, um doppelte Listener zu vermeiden
     */
    function addActivityListeners() {
        if (activityListenersAdded) return;
        
        // Liste der Ereignisse, die als Benutzeraktivität gelten
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
     * Behandelt Änderungen der Tab-Sichtbarkeit
     */
    function handleVisibilityChange() {
        if (!isLoggedIn()) return;
        
        if (document.hidden) {
            // Tab wurde versteckt/verlassen - starte längeren Timer
            clearTimeout(tabInactiveTimer);
            tabInactiveTimer = setTimeout(() => {
                if (document.hidden && isLoggedIn()) {
                    // Automatischer Logout nach längerer Inaktivität in anderem Tab
                    logout();
                }
            }, TAB_INACTIVE_LOGOUT_TIME);
        } else {
            // Tab wurde wieder sichtbar - stoppe inaktiven Timer
            clearTimeout(tabInactiveTimer);
            // Setze normalen Aktivitäts-Timer zurück
            if (isLoggedIn()) {
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
     * Startet das Blinken des Browser-Tabs
     * @param {string} message - Nachricht für blinkenden Tab-Titel
     */
    function startTabBlinking(message) {
        if (blinkInterval) return; // Verhindere mehrere Intervalle
        let isOriginalTitle = true;
        blinkInterval = setInterval(() => {
            if (document.hidden) { // Blinke nur, wenn Tab nicht aktiv ist
                document.title = isOriginalTitle ? message : originalTitle;
                isOriginalTitle = !isOriginalTitle;
            } else {
                stopTabBlinking(); // Stoppe Blinken, wenn Tab aktiv wird
            }
        }, 1000); // Wechsle Titel jede Sekunde
    }

    /**
     * Stoppt das Blinken des Browser-Tabs
     */
    function stopTabBlinking() {
        clearInterval(blinkInterval);
        blinkInterval = null;
        document.title = originalTitle;
    }

    // Event Listener, um das Blinken zu stoppen, wenn der Tab sichtbar wird
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            stopTabBlinking();
        }
    });

    // === LOGIN-FORMULAR EVENT-LISTENER ===
    // Behandle Formular-Submission für Login
    anmeldenForm.addEventListener("submit", (event) => {
        event.preventDefault(); // Verhindere Standard-Formular-Verhalten
        login(rfidInput.value.trim()); // Führe Login mit eingegebener RFID durch
    });

    // === HILFSFUNKTIONEN FÜR WOCHENPLAN-DATEN ===
    
    /**
     * Berechnet die Kalenderwoche für ein gegebenes Datum
     * @param {Date} d - Das Datum
     * @returns {number} Die Kalenderwoche
     */
    function getWeekNumberForIndexJS(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Ermittelt den Index des aktuellen Wochentags (Montag = 0, Sonntag = 6)
     * @returns {number} Der Wochentag-Index
     */
    function getCurrentDayIndexForWochenplan() {
        const today = new Date();
        let day = today.getDay(); // Sonntag ist 0, Montag ist 1, ..., Samstag ist 6
        return (day === 0) ? 6 : day - 1; // Anpassung: Montag ist 0, ..., Sonntag ist 6
    }
    
    /**
     * Escaped HTML-Sonderzeichen in Strings
     * @param {string} str - Der zu escapende String
     * @returns {string} Der escaped String
     */
    function escapeHtml(str) {
        if (typeof str !== "string") return str;
        return str.replace(/[&<>"]/g, function(c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
        });
    }

    /**
     * Konvertiert Markdown-Text zu HTML
     * @param {string} md - Der Markdown-Text
     * @returns {string} Der HTML-Text
     */
    function markdownToHtml(md) {
        if (!md) return "";
        let html = escapeHtml(md);
        
        // Reihenfolge der Ersetzungen ist wichtig
        
        // Überschriften (H1, H2, H3)
        html = html.replace(/^### (.*)$/gm, '<h3 style="color: var(--color-accent); margin: 1em 0 0.5em 0; font-size: 1.2em;">$1</h3>');
        html = html.replace(/^## (.*)$/gm, '<h2 style="color: var(--color-accent); margin: 1.2em 0 0.6em 0; font-size: 1.4em;">$1</h2>');
        html = html.replace(/^# (.*)$/gm, '<h1 style="color: var(--color-accent); margin: 1.5em 0 0.8em 0; font-size: 1.6em;">$1</h1>');

        // Textformatierungen
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--color-primary); font-weight: 700;">$1</strong>'); // **fett**
        html = html.replace(/__(.*?)__/g, '<span style="text-decoration: underline; color: var(--color-primary);">$1</span>'); // __unterstrichen__
        html = html.replace(/\*(?!\*)(.*?)\*/g, '<em style="font-style: italic; color: var(--color-secondary);">$1</em>'); // *kursiv*
        html = html.replace(/_(?!_)(.*?)_/g, '<span style="text-decoration: underline; color: var(--color-primary);">$1</span>'); // _unterstrichen_

        // Listen
        html = html.replace(/^• (.*)$/gm, '<div style="margin: 0.3em 0; padding-left: 1em;">• $1</div>'); // Aufzählungspunkte
        html = html.replace(/^(\d+)\. (.*)$/gm, '<div style="margin: 0.3em 0; padding-left: 1em;">$1. $2</div>'); // Nummerierte Listen

        // Horizontale Linien
        html = html.replace(/^---+$/gm, '<hr style="border: none; border-top: 2px solid var(--border-color); margin: 1.5em 0;">');
        html = html.replace(/^_{5,}$/gm, '<hr style="border: none; border-top: 2px solid var(--border-color); margin: 1.5em 0;">');

        // Spezielle Formatierungen für Emojis
        html = html.replace(/(📢|⚠️|🚨|💡|✅|🔧|📅|🎉)/g, '<span style="font-size: 1.2em; margin-right: 0.3em;">$1</span>');
        
        // Wichtige Warnungen hervorheben
        html = html.replace(/(!.*?!)/g, '<span style="background: linear-gradient(135deg, var(--color-warning), #d73a49); color: white; padding: 0.2em 0.5em; border-radius: 4px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">$1</span>');

        // Zeilenumbrüche behandeln
        html = html.replace(/\n\n/g, '</p><p style="margin: 1em 0; line-height: 1.6;">'); // Doppelte Zeilenumbrüche zu Absätzen
        html = html.replace(/\n/g, '<br>'); // Einfache Zeilenumbrüche zu <br>
        
        // Umhüllung in Absatz-Tags, falls nicht bereits vorhanden
        if (!html.startsWith('<p') && !html.startsWith('<h') && !html.startsWith('<div')) {
            html = '<p style="margin: 0; line-height: 1.6;">' + html + '</p>';
        }

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: var(--color-accent); text-decoration: none; border-bottom: 1px solid var(--color-accent); transition: all 0.3s ease;">$1</a>');
        
        // Erlaube <span style="...">...</span> nach dem Escapen
        html = html.replace(/&lt;span (.*?)&gt;(.*?)&lt;\/span&gt;/g, '<span $1>$2</span>');
        
        return html;
    }

    // === MODAL-STEUERUNG FÜR NUMMERN-BEARBEITUNG ===
    
    // Schließen des Nummern-Modals über X-Button
    if (nummernModalClose) {
        nummernModalClose.addEventListener('click', () => {
            nummernModal.style.display = 'none';
        });
    }

    // Schließen des Nummern-Modals durch Klick außerhalb
    window.addEventListener('click', (e) => {
        if (e.target === nummernModal) {
            nummernModal.style.display = 'none';
        }
    });

    // === RFID/NAME-EINGABE UND AUTOMATISCHE NAMENSAUFLÖSUNG ===
    // Automatische Erkennung von RFID-Codes und Umwandlung in Namen
    if (nummernModalInput) {
        nummernModalInput.addEventListener('input', async (event) => {
            const currentValue = event.target.value.trim();
            // Prüfe, ob Eingabe wie eine RFID aussieht (mindestens 4 Zeichen, keine Leerzeichen)
            if (currentValue && currentValue.length >= 4 && !currentValue.includes(' ')) {
                try {
                    // Lade Mitarbeiterdaten
                    const response = await fetch('/api/load_mitarbeiter');
                    if (!response.ok) return;
                    const mitarbeiterData = await response.json();
                    
                    // Suche nach Mitarbeiter mit passender RFID
                    const foundMitarbeiter = mitarbeiterData.find(m => String(m.rfid).trim() === currentValue);
                    if (foundMitarbeiter) {
                        // Ersetze RFID durch Namen
                        nummernModalInput.value = foundMitarbeiter.name;
                        if (nummernModalMessage) {
                            nummernModalMessage.textContent = `Name erkannt: ${foundMitarbeiter.name}`;
                        }
                    }
                } catch (error) {
                    // Fehler bei der automatischen Namenserkennung ignorieren
                }
            }
        });
    }

    // === SPEICHERN DER NUMMERN-ÄNDERUNGEN ===
    // Formular-Submission für Nummern-Bearbeitung
    if (nummernModalForm) {
        nummernModalForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!aktuelleNummer) return;

            const neuerName = nummernModalInput.value.trim();
            // Erstelle aktualisiertes Telefonbuch
            const updatedTelefonbuch = { ...telefonbuchCache, [aktuelleNummer]: neuerName };
            const loggedInUserId = localStorage.getItem("userId");

            try {
                // Sende Änderung an Server
                const response = await fetch('/api/save_telefonbuch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        telefonbuch: updatedTelefonbuch, 
                        userId: loggedInUserId ? parseInt(loggedInUserId, 10) : null,
                        logDetails: true, // Flag für detailliertes Logging
                        changedNumber: aktuelleNummer,
                        oldName: telefonbuchCache[aktuelleNummer] || '',
                        newName: neuerName
                    })
                });
                const data = await response.json();
                showNotification(data.message || 'Gespeichert!', 'success');
                nummernModal.style.display = 'none';
                // Lade Daten neu für aktualisierte Ansicht
                await loadAndDisplayData();
            } catch (error) {
                if (nummernModalMessage) {
                    nummernModalMessage.textContent = 'Fehler beim Speichern!';
                }
                showNotification('Fehler beim Speichern!', 'error');
            }
        });
    }

    // === HAUPTFUNKTION ZUM LADEN UND ANZEIGEN DER DATEN ===
    /**
     * Lädt alle Daten (Telefonbuch, Schwarzes Brett, Tagesplan) und aktualisiert die Anzeige
     */
    async function loadAndDisplayData() {
        console.log('loadAndDisplayData gestartet...');
        
        // === TELEFONBUCH LADEN ===
        try {
            const telefonbuchResponse = await fetch('/api/load_telefonbuch');
            if (telefonbuchResponse.ok) {
                const fullData = await telefonbuchResponse.json();
                // WICHTIG: Da die API jetzt { telefonbuch: {...}, cowarner: {...} } zurückgibt,
                // müssen wir hier auf .telefonbuch zugreifen, um nur die Nummern anzuzeigen.
                const telefonbuchData = fullData.telefonbuch || fullData;

                telefonbuchCache = telefonbuchData; // Für spätere Bearbeitung merken
                console.log('Telefonbuch geladen:', telefonbuchData);
                const currentTelefonbuchDataString = JSON.stringify(telefonbuchData);

                // Prüfe, ob sich die Daten geändert haben
                if (lastTelefonbuchDataString === null || currentTelefonbuchDataString !== lastTelefonbuchDataString) {
                    if (nummernListe) {
                        // Erstelle HTML für Nummern-Liste
                        nummernListe.innerHTML = Object.entries(telefonbuchData)
                            .filter(([key, value]) => {
                                // Filtere 'telefonbuch' und 'cowarner' Keys sowie Objekte heraus, 
                                // damit nur die eigentlichen Telefonnummern angezeigt werden.
                                return key !== 'telefonbuch' && key !== 'cowarner' && !(value && typeof value === 'object');
                            })
                            .map(([nummer, name]) => {
                                const nameToShow = name || ''; // Zeige leeren String statt 'frei'
                                return `<li class="nummern-eintrag" data-nummer="${nummer}">
                                    <span class="name-container">${nummer}: ${nameToShow}</span>
                                    <div class="nummern-actions">
                                        <span class="delete-nummer-btn" data-nummer="${nummer}" title="Namen leeren">&times;</span>
                                        <span class="edit-icon" title="Namen bearbeiten">✎</span>
                                    </div>
                                </li>`;
                            })
                            .join('');
                    }
                    lastTelefonbuchDataString = currentTelefonbuchDataString;
                    console.log("Telefonbuch auf der Startseite aktualisiert.");
                    
                    // Blinke Tab, wenn Seite nicht sichtbar
                    if (document.hidden) {
                        startTabBlinking("🔔 Telefonbuch aktualisiert!");
                    }
                }
            } else {
                console.error('Fehler beim Laden des Telefonbuchs - Response nicht OK');
            }
        } catch (error) {
            console.error('Fehler beim Laden des Telefonbuchs für die Startseite:', error);
        }

        // === SCHWARZES BRETT LADEN ===
        try {
            const schwarzesBrettResponse = await fetch('/api/load_schwarzesbrett');
            if (schwarzesBrettResponse.ok) {
                const schwarzesBrettData = await schwarzesBrettResponse.json();
                const currentSchwarzesBrettText = schwarzesBrettData.text || "";

                // Prüfe, ob sich der Text geändert hat
                if (lastSchwarzesBrettText === null || currentSchwarzesBrettText !== lastSchwarzesBrettText) {
                    if (schwarzesBrettParagraph) {
                        // Konvertiere Markdown zu HTML und zeige an
                        schwarzesBrettParagraph.innerHTML = markdownToHtml(currentSchwarzesBrettText);
                    }
                    lastSchwarzesBrettText = currentSchwarzesBrettText;
                    console.log("Schwarzes Brett auf der Startseite aktualisiert.");
                    
                    // Blinke Tab, wenn Seite nicht sichtbar
                    if (document.hidden) {
                        startTabBlinking("🔔 Schwarzes Brett aktualisiert!");
                    }
                }
            }
        } catch (error) {
            console.error('Fehler beim Laden des Schwarzen Bretts für die Startseite:', error);
            if (schwarzesBrettParagraph) {
                schwarzesBrettParagraph.textContent = "Fehler beim Laden des Schwarzen Bretts.";
            }
        }

        // === TAGESPLAN LADEN ===
        try {
            const wochenplanResponse = await fetch('/api/wochenplan');
            if (wochenplanResponse.ok) {
                const wochenplanData = await wochenplanResponse.json();
                const heute = new Date();
                const aktuellesJahr = heute.getFullYear();
                const aktuelleKW = getWeekNumberForIndexJS(heute);
                const aktuellerTagIndex = getCurrentDayIndexForWochenplan();

                let tagesplanHtml = '<p>Keine Einträge für heute.</p>';
                const tagesEintraege = wochenplanData?.[aktuellesJahr]?.[aktuelleKW]?.[aktuellerTagIndex];

                if (tagesEintraege) {
                    tagesplanHtml = '';
                    // Standard-HTML für alle Schichten
                    let fruehHtml = '<div class="tagesplan-schicht"><strong>Frühschicht:</strong><br><em>-</em></div>';
                    let mittagHtml = '<div class="tagesplan-schicht"><strong>Mittagsschicht:</strong><br><em>-</em></div>';
                    let nachtHtml = '<div class="tagesplan-schicht"><strong>Nachtschicht:</strong><br><em>-</em></div>';

                    // Überschreibe mit tatsächlichen Daten, falls vorhanden
                    if (tagesEintraege.frueh) {
                        fruehHtml = `<div class="tagesplan-schicht"><strong>Frühschicht:</strong><br>${markdownToHtml(tagesEintraege.frueh)}</div>`;
                    }
                    if (tagesEintraege.mittag) {
                        mittagHtml = `<div class="tagesplan-schicht"><strong>Mittagsschicht:</strong><br>${markdownToHtml(tagesEintraege.mittag)}</div>`;
                    }
                    if (tagesEintraege.nacht) {
                        nachtHtml = `<div class="tagesplan-schicht"><strong>Nachtschicht:</strong><br>${markdownToHtml(tagesEintraege.nacht)}</div>`;
                    }
                    // Kombiniere alle Schichten
                    tagesplanHtml = fruehHtml + mittagHtml + nachtHtml;
                }

                // Prüfe, ob sich der Tagesplan geändert hat
                if (lastTagesplanString === null || tagesplanHtml !== lastTagesplanString) {
                    if (tagesplanInhaltDiv) {
                        tagesplanInhaltDiv.innerHTML = tagesplanHtml;
                    }
                    lastTagesplanString = tagesplanHtml;
                    console.log("Tagesplan auf der Startseite aktualisiert.");
                    
                    // Blinke Tab, wenn Seite nicht sichtbar
                    if (document.hidden) {
                        startTabBlinking("🔔 Tagesplan aktualisiert!");
                    }
                }
            }
        } catch (error) {
            console.error('Fehler beim Laden des Tagesplans für die Startseite:', error);
            if (tagesplanInhaltDiv) {
                tagesplanInhaltDiv.innerHTML = "<p>Fehler beim Laden des Tagesplans.</p>";
            }
        }
    }

    // === INITIAL-LADEN UND POLLING-SETUP ===
    // Initiales Laden der Daten beim Seitenaufruf
    console.log('Starte initiales Laden der Daten...');
    await loadAndDisplayData();
    console.log('Initialisierung abgeschlossen');

    // Starte das Polling-System für regelmäßige Updates
    setInterval(loadAndDisplayData, POLLING_INTERVAL);

    // === EVENT LISTENER FÜR MODAL UND LOGIN ===

    // Öffne Login-Modal beim Klick auf Anmelden-Button
    anmeldenButton.addEventListener("click", () => {
        modal.style.display = "block";
        document.body.classList.add('modal-open');
        rfidInput.focus(); // Fokus auf RFID-Eingabefeld
    });

    // Schließe Login-Modal über X-Button
    closeButton.addEventListener('click', () => {
        modal.style.display = "none";
        document.body.classList.remove('modal-open');
        rfidInput.value = ""; // Leere Eingabefeld
        loginMessage.textContent = ""; // Leere Fehlermeldung
    });

    // === THEME TOGGLE FUNKTIONALITÄT ===
    // Lade das gespeicherte Theme oder verwende dunkel als Standard
    const savedTheme = localStorage.getItem('theme') || 'dark';
    body.setAttribute('data-theme', savedTheme);
    
    // Event-Listener für Theme-Wechsel
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

    /**
     * Aktualisiert den Login-Status in der UI
     * (Diese Funktion wird aktuell nicht verwendet, aber für zukünftige Erweiterungen bereitgestellt)
     */
    function updateLoginStatus() {
        const loginMessage = document.getElementById('loginMessage');
        const anmeldenButton = document.getElementById('anmeldenButton');
        const abmeldenButton = document.getElementById('abmeldenButton');
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        
        if (isLoggedIn) {
            loginMessage.textContent = 'Angemeldet';
            anmeldenButton.style.display = 'none';
            abmeldenButton.style.display = 'inline-block';
        } else {
            loginMessage.textContent = '';
            anmeldenButton.style.display = 'inline-block';
            abmeldenButton.style.display = 'none';
        }
    }

    // Globale Variable für Navigation-Tracking
    window.isInternalNavigation = false;

    // Event-Listener für alle Links auf der Seite
    document.addEventListener('DOMContentLoaded', function() {
        // Überwache alle Link-Klicks
        document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href) {
                // Prüfe ob es ein interner Link ist
                const isInternal = link.href.includes(window.location.origin) || 
                                  link.href.startsWith('/') || 
                                  link.href.startsWith('./') || 
                                  link.href.startsWith('../') ||
                                  !link.href.includes('://');
                
                if (isInternal) {
                    window.isInternalNavigation = true;
                    // Setze Flag nach kurzer Zeit zurück
                    setTimeout(() => {
                        window.isInternalNavigation = false;
                    }, 2000);
                }
            }
        });
    });
});
