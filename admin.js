// admin.js
// Hauptdatei für die Administrationsseite der Webseite
// Verwaltet Mitarbeiter, deren Berechtigungen und Authentifizierung

// Tab Visibility Tracking
let tabInactiveTimer;
const TAB_INACTIVE_LOGOUT_TIME = 10 * 60 * 1000; // 10 Minuten wenn Tab inaktiv
let visibilityListenersAdded = false;

/**
 * Überprüft, ob ein Benutzer angemeldet ist
 * @returns {boolean} - True wenn der Benutzer angemeldet ist, false sonst
 */
function isLoggedIn() {
    // Überprüft den Login-Status im localStorage
    // Der Wert wird als String gespeichert, daher Vergleich mit "true"
    return localStorage.getItem("isLoggedIn") === "true";
}

/**
 * Gibt die ID des angemeldeten Benutzers zurück
 * @returns {number|null} - Die Benutzer-ID als Zahl oder null wenn nicht angemeldet
 */
function getLoggedInUserId() {
    // Holt die Benutzer-ID aus dem localStorage und konvertiert sie zu einer Zahl
    // parseInt() mit Basis 10 für sichere Zahlkonvertierung
    return localStorage.getItem("userId") ? parseInt(localStorage.getItem("userId"), 10) : null;
}

/**
 * Hilfsfunktion zum sicheren Parsen von Benutzerberechtigungen aus dem LocalStorage
 * @returns {Object} - Objekt mit Berechtigungen oder Standard-Fallback-Werte
 */
function getPermissionsFromLocalStorage() {
    // Holt den JSON-String der Berechtigungen aus dem localStorage
    const permissionsString = localStorage.getItem("permissions");
    
    try {
        // Versucht den JSON-String zu parsen
        // Wenn erfolgreich, gibt das geparste Objekt zurück
        // Wenn kein String vorhanden, gibt Standard-Berechtigungen zurück
        return permissionsString ? JSON.parse(permissionsString) : { 
            isAdmin: false, 
            kannFahrtenLoeschen: false, 
            kannFahrtenBearbeiten: false 
        };
    } catch (e) {
        // Fehlerbehandlung bei ungültigem JSON
        console.error("Error parsing permissions from localStorage:", e);
        // Gibt sichere Standard-Berechtigungen zurück bei Parsing-Fehlern
        return { 
            isAdmin: false, 
            kannFahrtenLoeschen: false, 
            kannFahrtenBearbeiten: false 
        };
    }
}

/**
 * Asynchrone Funktion zum Abrufen der Benutzerdetails
 * @returns {Promise<Object>} - Promise mit Benutzername und Berechtigungen
 */
async function getUserDetails() {
    return {
        // Benutzername aus dem localStorage holen
        name: localStorage.getItem("username"),
        // Berechtigungen über die Hilfsfunktion sicher abrufen
        permissions: getPermissionsFromLocalStorage()
    };
}

/**
 * Initialisierung der Seite nach dem Laden des DOM
 * Überprüft Authentifizierung und Admin-Berechtigung
 */
document.addEventListener('DOMContentLoaded', function() {
    // Überprüfung ob der Benutzer angemeldet ist
    if (isLoggedIn()) {
        // Benutzerdetails abrufen und Admin-Berechtigung prüfen
        getUserDetails().then(userData => {
            // Überprüfung der Admin-Berechtigung
            if (userData.permissions && userData.permissions.isAdmin) {
                // Passwort-Container verstecken (falls vorhanden)
                document.getElementById("passwortContainer").classList.add("hidden");
                // Admin-Bereich sichtbar machen
                document.getElementById("adminEbene").classList.remove("hidden");
                // Speziellen CSS-Stil für Admin-Modus hinzufügen
                document.body.classList.add("admin-mode");
                // Mitarbeiterliste laden
                loadMitarbeiter();
                // Visibility Listeners hinzufügen
                addVisibilityListeners();
                // Activity Listeners hinzufügen
                addActivityListeners();
            } else {
                // Zugriff verweigern bei fehlender Admin-Berechtigung
                alert("Zugriff verweigert, fehlende Admin-Berechtigung!");
                // Weiterleitung zur Hauptseite
                window.location.href = "index.html";
            }
        });
    } else {
        // Meldung für nicht angemeldete Benutzer
        alert("Netter Versuch. Bitte anmelden!");
        // Weiterleitung zur Hauptseite
        window.location.href = "index.html";
    }

    // Event-Listener für Benutzerinteraktionen einrichten
    setupEventListeners();
});

/**
 * Richtet alle Event-Listener für die Benutzerinteraktionen ein
 * Verhindert mehrfache Bindung durch zentrale Verwaltung
 */
function setupEventListeners() {
    // Referenzen zu den DOM-Elementen holen
    const speichernButton = document.getElementById("speichernButton");
    const savePermissionsButton = document.getElementById("savePermissionsButton");
    const mitarbeiterSearchInput = document.getElementById("mitarbeiterSearch");

    // Event-Listener für Speichern-Button (neuer Mitarbeiter)
    if (speichernButton) {
        speichernButton.addEventListener("click", function(e) {
            // Verhindert Standard-Verhalten des Buttons
            e.preventDefault();
            // Verhindert Event-Bubbling
            e.stopPropagation();
            // Aufruf der Speicherfunktion
            saveMitarbeiter(e);
        });
    }

    // Event-Listener für Berechtigungen-Speichern-Button
    if (savePermissionsButton) {
        savePermissionsButton.addEventListener("click", function(e) {
            // Verhindert Standard-Verhalten des Buttons
            e.preventDefault();
            // Verhindert Event-Bubbling
            e.stopPropagation();
            // Aufruf der Berechtigungen-Speicherfunktion
            saveUserPermissions();
        });
    }

    // Event-Listener für Suchfeld (Live-Suche)
    if (mitarbeiterSearchInput) {
        mitarbeiterSearchInput.addEventListener("input", function(e) {
            // Verhindert Event-Bubbling
            e.stopPropagation();
            // Mitarbeiterliste bei jeder Eingabe neu laden (mit Filter)
            loadMitarbeiter();
        });
    }
}

/**
 * Speichert die Daten eines neuen Mitarbeiters in die Datenbank
 * @param {Event} event - Das Event-Objekt des Formular-Submit-Vorgangs
 */
async function saveMitarbeiter(event) {
    // Verhindert Standard-Formular-Submit-Verhalten
    event.preventDefault();
    // Verhindert Event-Bubbling
    event.stopPropagation();

    // Eingabewerte aus den Formularfeldern extrahieren
    const name = document.getElementById("name").value;
    const rfid = document.getElementById("rfid").value;
    
    // Standard-Berechtigungen für neue Mitarbeiter definieren
    // Neue Benutzer erhalten minimale Berechtigungen aus Sicherheitsgründen
    const defaultPermissions = {
        isAdmin: false,                        // Keine Admin-Rechte
        kannFahrtenLoeschen: false,           // Kann keine Fahrten löschen
        kannFahrtenBearbeiten: false,         // Kann keine Fahrten bearbeiten
        kannWochenplanBearbeiten: false,      // Kann Wochenplan nicht bearbeiten
        kannProjektplanerBearbeiten: false    // Kann Projektplaner nicht bearbeiten
    };
    
    // Standard-Schicht (leer = keine Schicht zugewiesen)
    const defaultSchicht = "";
    
    // ID des aktuell angemeldeten Admins für Logging-Zwecke
    const adminUserId = getLoggedInUserId();
    
    // Validierung der Eingaben
    if (!name || !rfid) {
        alert("Bitte Name und RFID eingeben!");
        return; // Funktion beenden bei ungültigen Eingaben
    }

    try {
        // HTTP-POST-Request an den Server senden
        const response = await fetch('/api/save_mitarbeiter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' // JSON-Format für Datenübertragung
            },
            // Mitarbeiterdaten als JSON-String im Request-Body
            body: JSON.stringify({ 
                name, 
                rfid, 
                permissions: defaultPermissions, 
                schicht: defaultSchicht, 
                adminUserId: adminUserId 
            })
        });

        // Überprüfung ob die Server-Antwort erfolgreich war
        if (response.ok) {
            // Erfolgreiche Antwort vom Server parsen
            const data = await response.json();
            // Erfolgsnachricht an den Benutzer
            alert(data.message);
            // Formular zurücksetzen für nächste Eingabe
            document.getElementById("mitarbeiterForm").reset();
            // Mitarbeiterliste aktualisieren um neuen Eintrag anzuzeigen
            loadMitarbeiter();
        } else {
            // Fehlerfall: Fehlerdetails vom Server holen
            const errorData = await response.json();
            // Fehlermeldung an den Benutzer
            alert("Fehler beim Speichern: " + (errorData.message || "Unbekannter Fehler"));
        }
    } catch (error) {
        // Behandlung von Netzwerk- oder anderen Fehlern
        console.error("Fehler beim Speichern:", error);
        alert("Fehler beim Speichern der Mitarbeiterdaten.");
    }
}

/**
 * Lädt die Liste aller Mitarbeiter vom Server und zeigt sie in einer Tabelle an
 * Unterstützt Live-Suche durch Filterung der Ergebnisse
 */
async function loadMitarbeiter() {
    // Suchbegriff aus dem Suchfeld holen (in Kleinbuchstaben für case-insensitive Suche)
    const searchTerm = document.getElementById("mitarbeiterSearch")?.value.toLowerCase() || '';

    try {
        // HTTP-GET-Request an den Server für Mitarbeiterdaten
        const response = await fetch('/api/load_mitarbeiter');
        
        // Überprüfung ob die Anfrage erfolgreich war
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Mitarbeiterdaten vom Server als JSON parsen
        let mitarbeiterData = await response.json();

        // Filterung der Mitarbeiterdaten basierend auf dem Suchbegriff
        if (searchTerm) {
            mitarbeiterData = mitarbeiterData.filter(mitarbeiter => {
                // Suche in Name und RFID (case-insensitive)
                return mitarbeiter.name.toLowerCase().includes(searchTerm) ||
                       mitarbeiter.rfid.toLowerCase().includes(searchTerm);
            });
        }

        // Referenz zur Tabelle im DOM holen
        const tableBody = document.querySelector('#mitarbeiterTabelle tbody');
        // Sicherheitscheck ob Tabelle existiert
        if (!tableBody) return;

        // Tabelle leeren vor dem Neubefüllen
        tableBody.innerHTML = '';

        // Für jeden Mitarbeiter eine Tabellenzeile erstellen
        mitarbeiterData.forEach(mitarbeiter => {
            // Neue Tabellenzeile erstellen
            const row = tableBody.insertRow();
            
            // Tabellenzellen für verschiedene Daten erstellen
            const nameCell = row.insertCell();     // Spalte für Namen
            const rfidCell = row.insertCell();     // Spalte für RFID
            const actionCell = row.insertCell();   // Spalte für Aktions-Buttons

            // Zellinhalt setzen
            nameCell.textContent = mitarbeiter.name;
            rfidCell.textContent = mitarbeiter.rfid;

            // Container für Aktions-Buttons erstellen
            const actionContainer = document.createElement('div');
            actionContainer.className = 'action-button-container';

            // "Bearbeiten"-Button erstellen
            const editButton = document.createElement('button');
            editButton.className = 'edit-btn';
            editButton.textContent = 'Bearbeiten';
            // Event-Listener für Bearbeiten-Button
            // Mitarbeiterdaten werden als JSON-String übergeben
            editButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Öffnet Modal zur Bearbeitung der Berechtigungen
                openEditPermissionsModal(JSON.stringify(mitarbeiter));
            });

            // "Löschen"-Button erstellen
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-btn';
            deleteButton.textContent = 'Löschen';
            // Event-Listener für Löschen-Button
            deleteButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Aufrufe der Löschfunktion mit Mitarbeiter-ID
                deleteMitarbeiter(mitarbeiter.id);
            });

            // Buttons zum Container hinzufügen
            actionContainer.appendChild(editButton);
            actionContainer.appendChild(deleteButton);
            // Container zur Aktions-Zelle hinzufügen
            actionCell.appendChild(actionContainer);
        });
    } catch (error) {
        // Fehlerbehandlung bei Problemen beim Laden
        console.error("Fehler beim Laden der Mitarbeiter:", error);
        alert("Fehler beim Laden der Mitarbeiterdaten.");
    }
}

/**
 * Öffnet das Modal zur Bearbeitung der Mitarbeiter-Berechtigungen
 * @param {string} mitarbeiterString - JSON-String mit Mitarbeiterdaten
 */
function openEditPermissionsModal(mitarbeiterString) {
    // JSON-String zurück in Objekt konvertieren
    const mitarbeiter = JSON.parse(mitarbeiterString);
    
    // Referenzen zu den Modal-Elementen holen
    const modalUserId = document.getElementById("modalUserId");
    const modalUserName = document.getElementById("modalUserName");
    const permissionsModal = document.getElementById("permissionsModal");

    // Sicherheitscheck ob alle Modal-Elemente existieren
    if (!modalUserId || !modalUserName || !permissionsModal) return;

    // Mitarbeiter-ID im versteckten Feld speichern
    modalUserId.value = mitarbeiter.id;
    // Mitarbeitername im Modal anzeigen
    modalUserName.textContent = mitarbeiter.name;

    // Aktuelle Berechtigungen des Mitarbeiters holen (mit Fallback)
    const permissions = mitarbeiter.permissions || {};
    
    // Mapping von Berechtigung zu Checkbox-ID
    const checkboxes = {
        'permIsAdmin': permissions.isAdmin || false,
        'permKannFahrtenLoeschen': permissions.kannFahrtenLoeschen || false,
        'permKannFahrtenBearbeiten': permissions.kannFahrtenBearbeiten || false,
        'kannWochenplanBearbeiten': permissions.kannWochenplanBearbeiten || false,
        'kannProjektplanerBearbeiten': permissions.kannProjektplanerBearbeiten || false
    };

    // Checkboxen entsprechend der aktuellen Berechtigungen setzen
    Object.keys(checkboxes).forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = checkboxes[id];
        }
    });

    // Schicht-Dropdown mit aktueller Schicht vorbelegen
    const schichtSelect = document.getElementById('schichtSelect');
    if (schichtSelect) {
        schichtSelect.value = mitarbeiter.schicht || "";
    }

    // Modal sichtbar machen
    permissionsModal.classList.remove('hidden');
    permissionsModal.style.display = 'block';
}

/**
 * Schließt das Berechtigungsmodal und versteckt es
 */
function closePermissionsModal() {
    // Referenz zum Modal holen
    const permissionsModal = document.getElementById("permissionsModal");
    
    if (permissionsModal) {
        // Modal verstecken durch CSS-Klasse
        permissionsModal.classList.add('hidden');
        // Modal verstecken durch direktes Styling
        permissionsModal.style.display = 'none';
    }
}

/**
 * Speichert die aktualisierten Berechtigungen eines Mitarbeiters
 * Liest die Checkbox-Werte aus und sendet sie an den Server
 */
async function saveUserPermissions() {
    // Benutzer-ID aus dem versteckten Modal-Feld holen
    const modalUserId = document.getElementById("modalUserId");
    if (!modalUserId) return;

    const userId = modalUserId.value;
    
    // Neue Berechtigungen aus den Checkboxen lesen
    const newPermissions = {
        isAdmin: document.getElementById('permIsAdmin')?.checked || false,
        kannFahrtenLoeschen: document.getElementById('permKannFahrtenLoeschen')?.checked || false,
        kannFahrtenBearbeiten: document.getElementById('permKannFahrtenBearbeiten')?.checked || false,
        kannWochenplanBearbeiten: document.getElementById('kannWochenplanBearbeiten')?.checked || false,
        kannProjektplanerBearbeiten: document.getElementById('kannProjektplanerBearbeiten')?.checked || false
    };

    // Ausgewählte Schicht aus dem Dropdown holen
    const selectedSchicht = document.getElementById('schichtSelect')?.value || '';
    // ID des aktuell angemeldeten Admins für Logging
    const adminUserId = getLoggedInUserId();

    try {
        // HTTP-PUT-Request an den Server zur Aktualisierung der Berechtigungen
        const response = await fetch(`/api/update_mitarbeiter_permissions/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            // Neue Berechtigungen und Schicht als JSON senden
            body: JSON.stringify({ 
                permissions: newPermissions, 
                schicht: selectedSchicht, 
                adminUserId: adminUserId 
            })
        });

        // Fehlerbehandlung bei Server-Antwort
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            // Versuche Fehlerdetails aus der Antwort zu extrahieren
            const responseText = await response.text();
            try {
                // Versuche die Antwort als JSON zu parsen
                const errorData = JSON.parse(responseText);
                errorMessage += `, message: ${errorData.error || 'Unbekannter Serverfehler (aus JSON)'}`;
            } catch (e) {
                // Falls JSON-Parsing fehlschlägt, verwende Rohtext
                errorMessage += `, server response: ${responseText.substring(0, 200)}`;
            }
            throw new Error(errorMessage);
        }
        
        // Erfolgsmeldung bei erfolgreicher Aktualisierung
        alert("Berechtigungen erfolgreich aktualisiert!");
        // Modal schließen
        closePermissionsModal();
        // Mitarbeiterliste neu laden um Änderungen anzuzeigen
        loadMitarbeiter();
    } catch (error) {
        // Fehlerbehandlung bei Problemen
        console.error("Fehler beim Aktualisieren der Berechtigungen:", error);
        alert(`Fehler beim Aktualisieren der Berechtigungen: ${error.message}`);
    }
}

/**
 * Löscht einen Mitarbeiter aus der Datenbank
 * @param {number} id - Die eindeutige ID des zu löschenden Mitarbeiters
 */
async function deleteMitarbeiter(id) {
    // Sicherheitsabfrage vor dem Löschen
    if (!confirm("Bist du sicher, dass du diesen Mitarbeiter löschen möchtest?")) return;
    
    // ID des aktuell angemeldeten Admins für Logging-Zwecke
    const adminUserId = getLoggedInUserId();

    try {
        // HTTP-DELETE-Request an den Server
        const response = await fetch(`/api/delete_mitarbeiter/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            // Admin-ID im Request-Body für Logging
            body: JSON.stringify({ adminUserId: adminUserId })
        });

        // Fehlerbehandlung bei Server-Antwort
        if (!response.ok) {
            // Versuche Fehlerdetails zu extrahieren
            let errorText = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorText += `, message: ${errorData.error || 'Serverfehler'}`;
            } catch (e) { 
                // JSON-Parse-Fehler ignorieren (Server sendet möglicherweise kein JSON)
            }
            throw new Error(errorText);
        }

        // Erfolgsmeldung bei erfolgreicher Löschung
        alert("Mitarbeiter erfolgreich gelöscht!");
        // Mitarbeiterliste neu laden um Änderungen anzuzeigen
        loadMitarbeiter();
    } catch (error) {
        // Fehlerbehandlung bei Problemen
        console.error("Fehler beim Löschen des Mitarbeiters:", error);
        alert(`Fehler beim Löschen des Mitarbeiters: ${error.message}`);
    }
}

/**
 * Fügt Event-Listener für Tab-Sichtbarkeit hinzu
 */
function addVisibilityListeners() {
    if (visibilityListenersAdded) return;
    
    // Tab Sichtbarkeits-Events
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // KEIN beforeunload Event - verursacht Probleme bei Navigation und Reload
    
    visibilityListenersAdded = true;
}

/**
 * Entfernt Event-Listener für Tab-Sichtbarkeit
 */
function removeVisibilityListeners() {
    if (!visibilityListenersAdded) return;
    
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
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
                alert("Automatisch abgemeldet aufgrund von Inaktivität in anderem Tab.");
                window.location.href = "index.html";
            }
        }, TAB_INACTIVE_LOGOUT_TIME);
    } else {
        // Tab wurde wieder sichtbar - stoppe inaktiven Timer
        clearTimeout(tabInactiveTimer);
    }
}

/**
 * Fügt Event-Listener für Benutzeraktivität hinzu
 */
function addActivityListeners() {
    // Liste der Ereignisse, die als Benutzeraktivität gelten
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.addEventListener(event, function() {
            // Tracking für Navigation-Erkennung
            if (event.type === 'click') {
                window.lastClickTime = Date.now();
            }
        }, true);
    });
}

/**
 * Entfernt Event-Listener für Benutzeraktivität
 */
function removeActivityListeners() {
    // Diese Funktion wird für Konsistenz bereitgestellt
    // Die Event-Listener werden automatisch entfernt, wenn die Seite verlassen wird
}

// Funktionen global verfügbar machen für HTML-Event-Handler
// Dies ermöglicht es, die Funktionen direkt aus HTML-Elementen aufzurufen
window.openEditPermissionsModal = openEditPermissionsModal;
window.closePermissionsModal = closePermissionsModal;

// Sichtbarkeits-Listener hinzufügen
addVisibilityListeners();
// Activity Listener hinzufügen
addActivityListeners();
