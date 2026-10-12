document.addEventListener('DOMContentLoaded', async function() {
    // ===== HILFSFUNKTIONEN FÜR BERECHTIGUNGEN =====
    function isLoggedIn() {
        return localStorage.getItem("isLoggedIn") === "true";
    }

    function getPermissionsFromLocalStorage() {
        const permissionsString = localStorage.getItem("permissions");
        try {
            return permissionsString ? JSON.parse(permissionsString) : {};
        } catch (e) {
            console.error("Fehler beim Parsen der Berechtigungen aus dem LocalStorage:", e);
            return {};
        }
    }

    // ===== BERECHTIGUNGSPRÜFUNG =====
    if (!isLoggedIn()) {
        alert("Bitte anmelden, um auf diese Seite zuzugreifen.");
        window.location.href = 'index.html';
        return;
    }

    const userPermissions = getPermissionsFromLocalStorage();
    if (!userPermissions.kannProjektplanerBearbeiten) {
        alert("Zugriff verweigert. Sie haben nicht die erforderliche Berechtigung, um den Projektplaner aufzurufen.");
        window.location.href = 'index.html';
        return;
    }     
    
    // ===== DOM-ELEMENTE =====
    const ganttChart = document.getElementById('ganttChart');
    const projektForm = document.getElementById('projektForm');
    const parentProjektSelect = document.getElementById('parentProjekt');
    const submitBtn = document.getElementById('submitBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const editProjektIdField = document.getElementById('editProjektId');
    const addAsSubProjektField = document.getElementById('addAsSubProjekt');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const todayBtn = document.getElementById('todayBtn');
    const zoomToggleBtn = document.getElementById('zoomToggleBtn');
    const zoomIcon = document.getElementById('zoomIcon');
    const viewModeText = document.getElementById('viewModeText');
    const modal = document.getElementById('projektModal');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    const projektDetails = document.getElementById('projektDetails');
    const projektNotes = document.getElementById('projektNotes');
    const subprojektListe = document.getElementById('subprojektListe');
    const subprojektListeItems = document.getElementById('subprojektListeItems');
    const saveNotesBtn = document.getElementById('saveNotes');
    const addSubprojektBtn = document.getElementById('addSubprojekt');
    const editProjektBtn = document.getElementById('editProjekt');
    const deleteProjektBtn = document.getElementById('deleteProjekt');
    const confirmDeleteBtn = document.getElementById('confirmDelete');
    const cancelDeleteBtn = document.getElementById('cancelDelete');
    const cancelModalBtn = document.getElementById('cancelModal');
    const backBtn = document.getElementById('backBtn');

    // ===== GLOBALE VARIABLEN =====
    let zeitOffset = 0;
    const tageImFenster = 30;
    let aktuelleProjektID = null;
    let isMonthView = false;

    // Standardfarben für die Farbpalette
    const standardFarben = [
        "#E53E3E", "#DD6B20", "#D69E2E", "#38A169", "#3182CE", 
        "#6B46C1", "#805AD5", "#D53F8C", "#718096", "#2D3748"
    ];

    // ===== HILFSFUNKTIONEN =====
    function initializeFarbpalette() {
        const farbPalette = document.getElementById('farbPalette');
        const projektFarbe = document.getElementById('projektFarbe');
        
        if (!farbPalette || !projektFarbe) return;
        
        farbPalette.innerHTML = '';
        standardFarben.forEach(farbe => {
            const farbOption = document.createElement('div');
            farbOption.className = 'color-option';
            farbOption.style.backgroundColor = farbe;
            farbOption.title = farbe;
            farbOption.setAttribute('data-color', farbe);
            farbOption.addEventListener('click', function() {
                projektFarbe.value = farbe;
                projektFarbe.dispatchEvent(new Event('input', { bubbles: true }));
                projektFarbe.dispatchEvent(new Event('change', { bubbles: true }));
                updateActiveFarbOption(farbe);
            });
            farbPalette.appendChild(farbOption);
        });
        
        projektFarbe.addEventListener('input', function() {
            updateActiveFarbOption(this.value);
        });
        updateActiveFarbOption(projektFarbe.value);
    }

    function updateActiveFarbOption(farbe) {
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
        });
        const matchingOption = document.querySelector(`.color-option[data-color="${farbe}"]`);
        if (matchingOption) {
            matchingOption.classList.add('active');
        }
    }

    // ===== DATEN VOM SERVER LADEN =====
    async function ladeProjekte() {
        try {
            console.log('Lade Projekte vom Server...');
            const response = await fetch('/api/load_projekte');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const projekte = await response.json();
            console.log('Geladene Projekte:', projekte);
            
            // Validierung der geladenen Daten
            if (!Array.isArray(projekte)) {
                console.error('Geladene Daten sind kein Array:', projekte);
                return [];
            }
            
            // Überprüfe jedes Projekt auf notwendige Eigenschaften
            const validProjekte = projekte.filter((projekt, index) => {
                if (!projekt || typeof projekt !== 'object') {
                    console.warn(`Projekt bei Index ${index} ist ungültig:`, projekt);
                    return false;
                }
                
                if (!projekt.name || !projekt.bearbeiter || !projekt.start) {
                    console.warn(`Projekt bei Index ${index} hat fehlende Pflichtfelder:`, projekt);
                    return false;
                }
                
                return true;
            });
            
            console.log(`${validProjekte.length} von ${projekte.length} Projekten sind gültig`);
            return validProjekte;
            
        } catch (error) {
            console.error('Fehler beim Laden der Projekte:', error);
            
            // Fallback: Versuche lokale Daten zu laden
            try {
                const localData = localStorage.getItem('projektplaner_backup');
                if (localData) {
                    console.log('Verwende lokale Backup-Daten');
                    const backupProjekte = JSON.parse(localData);
                    return Array.isArray(backupProjekte) ? backupProjekte : [];
                }
            } catch (localError) {
                console.error('Fehler beim Laden der lokalen Backup-Daten:', localError);
            }
            
            return [];
        }
    }

    async function speichereProjekte(projekte) {
        try {
            console.log('Speichere Projekte auf Server:', projekte);
            
            // Lokales Backup erstellen
            try {
                localStorage.setItem('projektplaner_backup', JSON.stringify(projekte));
                console.log('Lokales Backup erstellt');
            } catch (localError) {
                console.warn('Lokales Backup konnte nicht erstellt werden:', localError);
            }
            
            const response = await fetch('/api/save_projekte', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(projekte),
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.text();
            console.log('Projekte erfolgreich gespeichert:', result);
            
        } catch (error) {
            console.error('Fehler beim Speichern der Projekte:', error);
            alert('Projekte konnten nicht auf dem Server gespeichert werden. Ein lokales Backup wurde erstellt.');
        }
    }

    // ===== DATUM HILFSFUNKTIONEN =====
    function parseDate(dateStr) {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    
    function formatDateDE(date) {
        if (!date) return '';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }
    
    function formatDateISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    function isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    }
    
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    
    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${hash % 360}, 70%, 65%)`;
    }

    // ===== GANTT-CHART FUNKTIONEN =====
    function fuegeParentProjektOptionenHinzu(select, projekte, aktuellesProjekt = null) {
        // Clear existing options first
        select.innerHTML = '<option value="">-- Kein übergeordnetes Projekt --</option>';
        
        // Track visited projects to prevent infinite loops
        const visited = new Set();
        
        function istAncestor(projektId, potentialAncestorId, depth = 0) {
            // Prevent infinite recursion with depth limit
            if (depth > 100) return false;
            
            if (visited.has(projektId)) return false;
            visited.add(projektId);
            
            if (projektId === potentialAncestorId) return true;
            
            const projekt = projekte.find(p => p.id === projektId);
            if (!projekt || !projekt.parentId) return false;
            
            return istAncestor(projekt.parentId, potentialAncestorId, depth + 1);
        }
        
        projekte.forEach(projekt => {
            // Skip current project and its descendants
            if (aktuellesProjekt && 
                (projekt.id === aktuellesProjekt.id || 
                 istAncestor(aktuellesProjekt.id, projekt.id))) {
                return;
            }
            
            // Reset visited set for each project check
            visited.clear();
            
            const option = document.createElement('option');
            option.value = projekt.id;
            option.textContent = projekt.name;
            
            // Select current parent if editing
            if (aktuellesProjekt && aktuellesProjekt.parentId === projekt.id) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
    }

    async function zeichneGanttChart(projekte) {
        if (!ganttChart) return;
        
        ganttChart.innerHTML = '';
        
        if (!projekte) {
            projekte = await ladeProjekte();
        }
        
        if (projekte.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'Keine Projekte vorhanden. Fügen Sie oben ein neues Projekt hinzu.';
            ganttChart.appendChild(emptyMessage);
            return;
        }
        
        if (isMonthView) {
            zeichneMonatsansicht(projekte);
        } else {
            zeichneTagesansicht(projekte);
        }
    }

    // Original-Funktion für die Tagesansicht
    async function zeichneTagesansicht(projekte) {
        // Datum berechnen - IMMER neues Datum verwenden
        const heutigesDatum = new Date();
        heutigesDatum.setHours(0, 0, 0, 0);
        
        const referenzDatum = new Date(heutigesDatum);
        referenzDatum.setDate(heutigesDatum.getDate() + zeitOffset);
        
        // Mitte des Fensters berechnen
        const mitte = Math.floor(tageImFenster / 2);
        
        // Erstes sichtbares Datum
        const startDatum = new Date(referenzDatum);
        startDatum.setDate(referenzDatum.getDate() - mitte);
        startDatum.setHours(0, 0, 0, 0);
        
        // Daten für Kopfzeile berechnen
        const kopfzeilenDaten = [];
        
        for (let i = 0; i < tageImFenster; i++) {
            const currentDate = new Date(startDatum);
            currentDate.setDate(startDatum.getDate() + i);
            
            kopfzeilenDaten.push({
                datum: new Date(currentDate),
                tag: String(currentDate.getDate()).padStart(2, '0'),
                monat: currentDate.toLocaleString('de-DE', { month: 'short' }),
                jahr: currentDate.getFullYear(),
                kw: getWeekNumber(currentDate)
            });
        }
        
        // Tabelle erstellen
        const table = document.createElement('table');
        table.className = 'gantt-table';
        
        // Kopfzeilen erstellen
        const thead = document.createElement('thead');
        thead.className = 'gantt-header';
        
        // --- Monatszeile ---
        const monthRow = document.createElement('tr');
        
        // Fixed columns header
        const fixedHeader = document.createElement('th');
        fixedHeader.className = 'gantt-fixed-header';
        fixedHeader.rowSpan = 3;
        
        const fixedHeaderContainer = document.createElement('div');
        fixedHeaderContainer.className = 'fixed-header-container';
        
        const bearbeiterHeader = document.createElement('div');
        bearbeiterHeader.className = 'bearbeiter-header';
        bearbeiterHeader.textContent = 'Bearbeiter';
        
        const projektHeader = document.createElement('div');
        projektHeader.className = 'projekt-header';
        projektHeader.textContent = 'Projekt';
        
        fixedHeaderContainer.appendChild(bearbeiterHeader);
        fixedHeaderContainer.appendChild(projektHeader);
        fixedHeader.appendChild(fixedHeaderContainer);
        monthRow.appendChild(fixedHeader);
        
        // Monate gruppieren
        let currentMonth = '';
        let monthSpan = 0;
        
        for (let i = 0; i < kopfzeilenDaten.length; i++) {
            const item = kopfzeilenDaten[i];
            const monthYear = `${item.monat} ${item.jahr}`;
            
            if (monthYear !== currentMonth) {
                if (monthSpan > 0) {
                    const monthCell = document.createElement('th');
                    monthCell.colSpan = monthSpan;
                    monthCell.className = 'gantt-month';
                    monthCell.textContent = currentMonth;
                    monthRow.appendChild(monthCell);
                }
                currentMonth = monthYear;
                monthSpan = 1;
            } else {
                monthSpan++;
            }
        }
        
        // Letzten Monat hinzufügen
        if (monthSpan > 0) {
            const monthCell = document.createElement('th');
            monthCell.colSpan = monthSpan;
            monthCell.className = 'gantt-month';
            monthCell.textContent = currentMonth;
            monthRow.appendChild(monthCell);
        }
        
        thead.appendChild(monthRow);
        
        // --- Kalenderwochenzeile ---
        const weekRow = document.createElement('tr');
        
        // KW gruppieren
        let currentWeek = -1;
        let weekSpan = 0;
        
        for (let i = 0; i < kopfzeilenDaten.length; i++) {
            const item = kopfzeilenDaten[i];
            
            if (item.kw !== currentWeek) {
                if (weekSpan > 0) {
                    const weekCell = document.createElement('th');
                    weekCell.colSpan = weekSpan;
                    weekCell.className = 'gantt-week';
                    weekCell.textContent = `KW ${currentWeek}`;
                    weekRow.appendChild(weekCell);
                }
                currentWeek = item.kw;
                weekSpan = 1;
            } else {
                weekSpan++;
            }
        }
        
        // Letzte KW hinzufügen
        if (weekSpan > 0) {
            const weekCell = document.createElement('th');
            weekCell.colSpan = weekSpan;
            weekCell.className = 'gantt-week';
            weekCell.textContent = `KW ${currentWeek}`;
            weekRow.appendChild(weekCell);
        }
        
        thead.appendChild(weekRow);
        
        // --- Tageszeile ---
        const dayRow = document.createElement('tr');
        
        // Tage hinzufügen
        for (let i = 0; i < kopfzeilenDaten.length; i++) {
            const item = kopfzeilenDaten[i];
            const dayCell = document.createElement('th');
            
            // Wochentag ermitteln (0 = Sonntag, 1 = Montag, ..., 6 = Samstag)
            const wochentag = item.datum.getDay();
            
            // Wochenendklasse hinzufügen
            if (wochentag === 0 || wochentag === 6) {
                dayCell.className = 'gantt-day gantt-weekend';
            } else {
                dayCell.className = 'gantt-day';
            }
            
            // Wochentagsabkürzung
            const tageName = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
            
            // Zelleninhalt: Tag + Wochentag
            dayCell.innerHTML = `${item.tag}<br><span class="weekday-name">${tageName[wochentag]}</span>`;
            
            dayCell.setAttribute('data-date', formatDateISO(item.datum));
            dayRow.appendChild(dayCell);
        }
        
        thead.appendChild(dayRow);
        table.appendChild(thead);
        
        // --- Tabellenkörper mit Projekten ---
        const tbody = document.createElement('tbody');
        
        // Aktualisiere Parentprojekt-Dropdown
        await fuegeParentProjektOptionenHinzu(parentProjektSelect, projekte);
        
        // Nur Hauptprojekte direkt rendern (ohne parentId)
        // Unterprojekte werden innerhalb der renderProjekt Funktion gerendert
        const hauptprojekte = projekte.filter(p => !p.parentId);
                        
        // Funktion zum Rekursiven Rendern von Projekten und ihren Unterprojekten
        function renderProjekt(projekt, index, isSubprojekt = false, level = 0) {
            const row = document.createElement('tr');
            
            // Unterprojekte Klasse hinzufügen
            if (isSubprojekt) {
                row.className = 'subprojekt-row';
            }
            
            // Fixed cells container (Bearbeiter + Projekt)
            const fixedCells = document.createElement('td');
            fixedCells.className = 'gantt-fixed-cells';
            fixedCells.colSpan = 2; // Logisch als eine Gruppe behandeln
            
            // Bearbeiter-Zelle
            const bearbeiterCell = document.createElement('div');
            bearbeiterCell.className = 'gantt-bearbeiter-cell';
            bearbeiterCell.textContent = projekt.bearbeiter;
            bearbeiterCell.title = projekt.bearbeiter;
            
            // Projekt-Zelle
            const projektCell = document.createElement('div');
            projektCell.className = 'gantt-projekt-cell';
            
            // Für Unterprojekte Einrückung und Symbol hinzufügen
            if (isSubprojekt) {
                const indikator = document.createElement('span');
                indikator.className = 'projekt-indikator';
                indikator.textContent = '└ ';
                projektCell.appendChild(indikator);
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = projekt.name;
            projektCell.appendChild(nameSpan);
            projektCell.title = projekt.name;
            
            fixedCells.appendChild(bearbeiterCell);
            fixedCells.appendChild(projektCell);
            row.appendChild(fixedCells);
            
            // Projektstart und -ende
            const projektStart = parseDate(projekt.start);
            const projektEnde = projekt.end ? parseDate(projekt.end) : new Date();
            
            // Zeilen mit Tagen befüllen
            for (let i = 0; i < kopfzeilenDaten.length; i++) {
                const zellDatum = kopfzeilenDaten[i].datum;
                const cell = document.createElement('td');
                
                // Wochenende markieren
                const istWochenende = zellDatum.getDay() === 0 || zellDatum.getDay() === 6;
                cell.className = istWochenende ? 'gantt-cell gantt-cell-weekend' : 'gantt-cell';
                
                // Prüfen, ob der Tag im Projektzeitraum liegt
                if (zellDatum >= projektStart && zellDatum <= projektEnde) {
                    const balken = document.createElement('div');
                    balken.className = 'projekt-balken';
                    
                    // Verwende die benutzerdefinierte Farbe, wenn vorhanden, andernfalls generiere eine Farbe
                    balken.style.backgroundColor = projekt.farbe || stringToColor(projekt.bearbeiter);
                    
                    cell.appendChild(balken);
                    cell.title = `${projekt.name} (${formatDateDE(projektStart)} - ${projekt.end ? formatDateDE(projektEnde) : 'offen'})`;
                    cell.setAttribute('data-projekt', index);
                    
                    cell.addEventListener('click', async function() {
                        await oeffneModal(index);
                    });
                }
                
                row.appendChild(cell);
            }
            
            tbody.appendChild(row);
            
            // Unterprojekte rekursiv rendern
            const unterprojekte = projekte.filter(p => p.parentId === index.toString());
            unterprojekte.forEach((unterprojekt, subIndex) => {
                const globalIndex = projekte.findIndex(p => p === unterprojekt);
                renderProjekt(unterprojekt, globalIndex, true, level + 1);
            });
        }
        
        // Alle Hauptprojekte rendern (ohne parentId)
        hauptprojekte.forEach((projekt, relativeIndex) => {
            const globalIndex = projekte.findIndex(p => p === projekt);
            renderProjekt(projekt, globalIndex);
        });
        
        table.appendChild(tbody);
        ganttChart.appendChild(table);
        
        // Neuer verbesserter Ansatz für den Heute-Marker
        // Aktuelles Datum für die Markierung des heutigen Tages
        const aktuellDatum = new Date();
        aktuellDatum.setHours(0, 0, 0, 0);
        
        // Direkt die Datumszelle markieren anstatt einen separaten Marker zu verwenden
        const tagesSpalten = document.querySelectorAll('.gantt-day');
        
        // Über alle Tageszellen iterieren und prüfen, welche dem heutigen Datum entspricht
        tagesSpalten.forEach(tagSpalte => {
            const datumStr = tagSpalte.getAttribute('data-date');
            if (datumStr) {
                const spaltenDatum = parseDate(datumStr);
                
                // Wenn es der heutige Tag ist, markieren
                if (spaltenDatum && 
                    spaltenDatum.getFullYear() === aktuellDatum.getFullYear() && 
                    spaltenDatum.getMonth() === aktuellDatum.getMonth() && 
                    spaltenDatum.getDate() === aktuellDatum.getDate()) {
                    
                    // CSS-Klasse für heutigen Tag hinzufügen
                    tagSpalte.classList.add('heutiger-tag');
                    
                    // Jede Zelle in dieser Spalte ebenfalls markieren (in allen Projektzeilen)
                    const spaltenIndex = Array.from(tagesSpalten).indexOf(tagSpalte);
                    if (spaltenIndex >= 0) {
                        const alleCellsInSpalte = document.querySelectorAll(`tbody tr td:nth-child(${spaltenIndex + 2})`);
                        alleCellsInSpalte.forEach(cell => {
                            cell.classList.add('heutiger-tag');
                        });
                    }
                }
            }
        });
    }

    // Funktion zur Darstellung der Monatsansicht
    async function zeichneMonatsansicht(projekte) {
        // Aktuelles Datum als Referenz
        const heutigesDatum = new Date();
        heutigesDatum.setHours(0, 0, 0, 0);
        
        // Referenzdatum mit Offset (zentriert auf aktuellen Monat + zeitOffset)
        const referenzDatum = new Date(heutigesDatum);
        referenzDatum.setMonth(heutigesDatum.getMonth() + zeitOffset);
        
        // Anzahl der anzuzeigenden Monate
        const monateImFenster = 12; // Ein ganzes Jahr anzeigen
        
        // Startmonat berechnen (6 Monate vor dem Referenzdatum)
        const startDatum = new Date(referenzDatum);
        startDatum.setMonth(referenzDatum.getMonth() - Math.floor(monateImFenster / 2));
        startDatum.setDate(1); // Erster Tag des Monats
        
        // Kopfzeilendaten für die Monate erstellen
        const kopfzeilenDaten = [];
        
        for (let i = 0; i < monateImFenster; i++) {
            const currentDate = new Date(startDatum);
            currentDate.setMonth(startDatum.getMonth() + i);
            
            // Letzter Tag des Monats bestimmen
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            
            kopfzeilenDaten.push({
                datum: new Date(currentDate), // Erster Tag des Monats
                monat: currentDate.toLocaleString('de-DE', { month: 'long' }),
                jahr: currentDate.getFullYear(),
                tageImMonat: lastDay.getDate() // Anzahl Tage im Monat
            });
        }
        
        // Tabelle erstellen
        const table = document.createElement('table');
        table.className = 'gantt-table monatsansicht';
        
        // Tabellenkopf erstellen
        const thead = document.createElement('thead');
        thead.className = 'gantt-header';
        
        // --- Kopfzeile 1: Jahr ---
        const yearRow = document.createElement('tr');
        
        // Fixierte Spalten für Bearbeiter & Projektname
        const fixedHeaderCell = document.createElement('th');
        fixedHeaderCell.className = 'gantt-fixed-header';
        fixedHeaderCell.colSpan = 2;
        fixedHeaderCell.rowSpan = 2;
        fixedHeaderCell.textContent = 'Projekt / Bearbeiter';
        yearRow.appendChild(fixedHeaderCell);
        
        // Jahre gruppieren
        let currentYear = -1;
        let yearSpan = 0;
        
        for (let i = 0; i < kopfzeilenDaten.length; i++) {
            const item = kopfzeilenDaten[i];
            
            if (item.jahr !== currentYear) {
                if (yearSpan > 0) {
                    const yearCell = document.createElement('th');
                    yearCell.colSpan = yearSpan;
                    yearCell.className = 'gantt-year';
                    yearCell.textContent = currentYear;
                    yearRow.appendChild(yearCell);
                }
                currentYear = item.jahr;
                yearSpan = 1;
            } else {
                yearSpan++;
            }
        }
        
        // Letztes Jahr hinzufügen
        if (yearSpan > 0) {
            const yearCell = document.createElement('th');
            yearCell.colSpan = yearSpan;
            yearCell.className = 'gantt-year';
            yearCell.textContent = currentYear;
            yearRow.appendChild(yearCell);
        }
        
        thead.appendChild(yearRow);
        
        // --- Kopfzeile 2: Monate ---
        const monthRow = document.createElement('tr');
        
        // Monate hinzufügen
        for (let i = 0; i < kopfzeilenDaten.length; i++) {
            const item = kopfzeilenDaten[i];
            const monthCell = document.createElement('th');
            
            monthCell.className = 'gantt-month';
            monthCell.textContent = item.monat;
            monthCell.setAttribute('data-month', `${item.jahr}-${String(item.datum.getMonth() + 1).padStart(2, '0')}`);
            monthRow.appendChild(monthCell);
        }
        
        thead.appendChild(monthRow);
        table.appendChild(thead);
        
        // --- Tabellenkörper mit Projekten ---
        const tbody = document.createElement('tbody');
        
        // Aktualisiere Parentprojekt-Dropdown
        await fuegeParentProjektOptionenHinzu(parentProjektSelect, projekte);
        
        // Nur Hauptprojekte direkt rendern (ohne parentId)
        // Unterprojekte werden innerhalb der renderProjekt Funktion gerendert
        const hauptprojekte = projekte.filter(p => !p.parentId);
        
        // Funktion zum Rekursiven Rendern von Projekten und ihren Unterprojekten
        function renderProjektMonatsansicht(projekt, index, isSubprojekt = false, level = 0, renderedProjects = new Set()) {
            // Endlosschleifen-Schutz
            if (level > 10 || renderedProjects.has(index)) {
                console.warn(`Mögliche Endlosschleife erkannt bei Projekt ${index}, Level ${level}`);
                return;
            }
            
            renderedProjects.add(index);
            
            const row = document.createElement('tr');
            
            // Unterprojekte Klasse hinzufügen
            if (isSubprojekt) {
                row.className = 'subprojekt-row';
            }
            
            // Fixed cells container (Bearbeiter + Projekt)
            const fixedCells = document.createElement('td');
            fixedCells.className = 'gantt-fixed-cells';
            fixedCells.colSpan = 2; // Logisch als eine Gruppe behandeln
            
            // Bearbeiter-Zelle
            const bearbeiterCell = document.createElement('div');
            bearbeiterCell.className = 'gantt-bearbeiter-cell';
            bearbeiterCell.textContent = projekt.bearbeiter;
            bearbeiterCell.title = projekt.bearbeiter;
            
            // Projekt-Zelle
            const projektCell = document.createElement('div');
            projektCell.className = 'gantt-projekt-cell';
            
            // Für Unterprojekte Einrückung und Symbol hinzufügen
            if (isSubprojekt) {
                const indikator = document.createElement('span');
                indikator.className = 'projekt-indikator';
                indikator.textContent = '└ ';
                projektCell.appendChild(indikator);
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = projekt.name;
            projektCell.appendChild(nameSpan);
            projektCell.title = projekt.name;
            
            fixedCells.appendChild(bearbeiterCell);
            fixedCells.appendChild(projektCell);
            row.appendChild(fixedCells);
            
            // Projektstart und -ende
            const projektStart = parseDate(projekt.start);
            const projektEnde = projekt.end ? parseDate(projekt.end) : new Date();
            
            // Für jeden Monat eine Zelle erstellen
            for (let i = 0; i < kopfzeilenDaten.length; i++) {
                const cell = document.createElement('td');
                const monatsDatum = kopfzeilenDaten[i].datum;
                cell.className = 'gantt-cell';
                
                // Monatszeitraum bestimmen (erster bis letzter Tag)
                const monatStart = new Date(monatsDatum.getFullYear(), monatsDatum.getMonth(), 1);
                const monatEnde = new Date(monatsDatum.getFullYear(), monatsDatum.getMonth() + 1, 0);
                
                if (projektStart <= monatEnde && projektEnde >= monatStart) {
                    // Balken-Container für exakte Positionierung erstellen
                    const balkenContainer = document.createElement('div');
                    balkenContainer.className = 'projekt-balken-container';
                    
                    // Balken erstellen
                    const balken = document.createElement('div');
                    balken.className = 'projekt-balken';
                    
                    // Verwende die benutzerdefinierte Farbe, wenn vorhanden, andernfalls generiere eine Farbe
                    balken.style.backgroundColor = projekt.farbe || stringToColor(projekt.bearbeiter);
                    
                    // Berechne die Breite und Position des Balkens als Prozentsatz des Monats
                    const tageImMonat = monatEnde.getDate(); // Anzahl Tage im Monat
                    let startProzent = 0;
                    let endeProzent = 100;
                    
                    // Wenn das Projekt nach dem Monatsanfang startet und im aktuellen Monat
                    if (projektStart > monatStart && 
                        projektStart.getMonth() === monatStart.getMonth() &&
                        projektStart.getFullYear() === monatStart.getFullYear()) {
                        // Berechne, wie viel Prozent des Monats bereits vergangen sind
                        const tagImMonat = projektStart.getDate();
                        startProzent = Math.max(0, (tagImMonat - 1) / tageImMonat * 100);
                    }
                    
                    // Wenn das Projekt vor dem Monatsende endet und im aktuellen Monat
                    if (projektEnde < monatEnde && 
                        projektEnde.getMonth() === monatStart.getMonth() &&
                        projektEnde.getFullYear() === monatStart.getFullYear()) {
                        // Berechne, bei wie viel Prozent des Monats das Projekt endet
                        const tagImMonat = projektEnde.getDate();
                        endeProzent = Math.min(100, tagImMonat / tageImMonat * 100);
                    }
                    
                    // Balken entsprechend positionieren und dimensionieren
                    balken.style.left = startProzent + '%';
                    balken.style.width = Math.max(1, (endeProzent - startProzent)) + '%';
                    
                    balkenContainer.appendChild(balken);
                    cell.appendChild(balkenContainer);
                    cell.title = `${projekt.name} (${formatDateDE(projektStart)} - ${projekt.end ? formatDateDE(projektEnde) : 'offen'})`;
                    cell.setAttribute('data-projekt', index);
                    
                    cell.addEventListener('click', async function() {
                        await oeffneModal(index);
                    });
                }
                
                row.appendChild(cell);
            }
            
            tbody.appendChild(row);
            
            // Unterprojekte rekursiv rendern mit verbessertem Schutz
            const unterprojekte = projekte.filter(p => p.parentId === index.toString());
            unterprojekte.forEach((unterprojekt) => {
                const globalIndex = projekte.findIndex(p => p === unterprojekt);
                if (globalIndex !== -1 && !renderedProjects.has(globalIndex)) {
                    renderProjektMonatsansicht(unterprojekt, globalIndex, true, level + 1, new Set(renderedProjects));
                }
            });
        }
        
        // Alle Hauptprojekte rendern (ohne parentId)
        hauptprojekte.forEach((projekt, relativeIndex) => {
            const globalIndex = projekte.findIndex(p => p === projekt);
            renderProjektMonatsansicht(projekt, globalIndex);
        });
        
        table.appendChild(tbody);
        ganttChart.appendChild(table);
        
        // Heutigen Monat markieren
        const aktuellerMonat = `${heutigesDatum.getFullYear()}-${String(heutigesDatum.getMonth() + 1).padStart(2, '0')}`;
        const monatsSpalten = document.querySelectorAll('.gantt-month');
        
        monatsSpalten.forEach(monatSpalte => {
            const monatStr = monatSpalte.getAttribute('data-month');
            if (monatStr === aktuellerMonat) {
                monatSpalte.classList.add('aktueller-monat');
                
                // Entsprechende Zellen in Projektzeilen markieren
                const spaltenIndex = Array.from(monatsSpalten).indexOf(monatSpalte);
                if (spaltenIndex >= 0) {
                    const alleCellsInSpalte = document.querySelectorAll(`tbody tr td:nth-child(${spaltenIndex + 3})`); // +3 wegen der zwei festen Spalten
                    alleCellsInSpalte.forEach(cell => {
                        cell.classList.add('aktueller-monat');
                    });
                }
            }
        });
    }

    // ===== MODAL FUNKTIONEN =====
    async function oeffneModal(projektIndex) {
        const projekte = await ladeProjekte();
        const projekt = projekte[projektIndex];
        aktuelleProjektID = projektIndex;
        
        if (!modal || !projektDetails || !projektNotes) return;
        
        const start = parseDate(projekt.start);
        const ende = projekt.end ? parseDate(projekt.end) : null;
        
        let parentInfo = '';
        if (projekt.parentId) {
            const parentProjekt = projekte[projekt.parentId];
            if (parentProjekt) {
                parentInfo = `<div style="margin-top: 5px; font-style: italic;">Unterprojekt von: ${parentProjekt.name}</div>`;
            }
        }
        
        const farbeAnzeige = projekt.farbe ? 
            `<div style="display: inline-block; width: 12px; height: 12px; background-color: ${projekt.farbe}; border-radius: 50%; margin-right: 5px;"></div>` : '';
        
        projektDetails.innerHTML = `
            <strong>${projekt.name}</strong><br>
            Bearbeiter: ${projekt.bearbeiter}<br>
            ${farbeAnzeige} Zeitraum: ${formatDateDE(start)} - ${ende ? formatDateDE(ende) : 'offen'}
            ${parentInfo}
        `;
        
        const unterprojekte = projekte.filter(p => p.parentId === projektIndex.toString());
        
        if (unterprojekte.length > 0 && subprojektListe && subprojektListeItems) {
            subprojektListe.style.display = 'block';
            subprojektListeItems.innerHTML = '';
            
            unterprojekte.forEach((unterprojekt) => {
                const unterprojektIndex = projekte.findIndex(p => p === unterprojekt);
                const li = document.createElement('li');
                
                const colorDot = unterprojekt.farbe ? 
                    `<div style="display: inline-block; width: 8px; height: 8px; background-color: ${unterprojekt.farbe}; border-radius: 50%; margin-right: 5px;"></div>` : '';
                
                li.innerHTML = `${colorDot}${unterprojekt.name}`;
                li.style.cursor = 'pointer';
                li.addEventListener('click', async function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    await oeffneModal(unterprojektIndex);
                });
                
                subprojektListeItems.appendChild(li);
            });
        } else if (subprojektListe) {
            subprojektListe.style.display = 'none';
        }
        
        projektNotes.value = projekt.notizen || '';
        modal.style.display = 'block';
    }
    
    function schliesseModal() {
        if (modal) {
            modal.style.display = 'none';
        }
        aktuelleProjektID = null;
    }

    async function projektBearbeiten(projektIndex) {
        const projekte = await ladeProjekte();
        const projekt = projekte[projektIndex];
        
        await fuegeParentProjektOptionenHinzu(parentProjektSelect, projekte, projekt);
        
        const projektNameField = document.getElementById('projektName');
        const bearbeiterField = document.getElementById('bearbeiter');
        const startDatumField = document.getElementById('startDatum');
        const endDatumField = document.getElementById('endDatum');
        const projektFarbeField = document.getElementById('projektFarbe');
        const parentProjektField = document.getElementById('parentProjekt');
        
        if (projektNameField) projektNameField.value = projekt.name;
        if (bearbeiterField) bearbeiterField.value = projekt.bearbeiter;
        if (startDatumField) startDatumField.value = projekt.start;
        if (endDatumField) endDatumField.value = projekt.end || '';
        if (projektFarbeField) projektFarbeField.value = projekt.farbe || '#4299e1';
        if (parentProjektField) parentProjektField.value = projekt.parentId || '';
        
        if (editProjektIdField) editProjektIdField.value = projektIndex;
        if (addAsSubProjektField) addAsSubProjektField.value = '';
        
        updateActiveFarbOption(projekt.farbe || '#4299e1');
        
        if (submitBtn) submitBtn.textContent = 'Aktualisieren';
        if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
        
        schliesseModal();
    }

    async function abbrechenBearbeitung() {
        if (projektForm) projektForm.reset();
        if (editProjektIdField) editProjektIdField.value = '';
        if (addAsSubProjektField) addAsSubProjektField.value = '';
        if (submitBtn) submitBtn.textContent = 'Hinzufügen';
        if (cancelEditBtn) cancelEditBtn.style.display = 'none';
        
        const projektFarbeField = document.getElementById('projektFarbe');
        if (projektFarbeField) {
            updateActiveFarbOption(projektFarbeField.value);
        }
        
        await fuegeParentProjektOptionenHinzu(parentProjektSelect, await ladeProjekte());
    }
    
    function startAddSubprojekt() {
        if (aktuelleProjektID !== null) {
            if (projektForm) projektForm.reset();
            
            if (addAsSubProjektField) addAsSubProjektField.value = aktuelleProjektID;
            
            if (editProjektIdField) editProjektIdField.value = '';
            if (submitBtn) submitBtn.textContent = 'Unterprojekt hinzufügen';
            if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
            
            schliesseModal();
            
            const projektNameField = document.getElementById('projektName');
            if (projektNameField) projektNameField.focus();
        }
    }

    async function projektLoeschen(projektIndex) {
        const projekte = await ladeProjekte();
        const zuLoeschendeIndizes = new Set();
        
        function sammleZuLoeschendeProjekte(index) {
            zuLoeschendeIndizes.add(index);
            
            projekte.forEach((projekt, idx) => {
                if (projekt.parentId === index.toString() && !zuLoeschendeIndizes.has(idx)) {
                    sammleZuLoeschendeProjekte(idx);
                }
            });
        }
        
        sammleZuLoeschendeProjekte(projektIndex);
        
        if (zuLoeschendeIndizes.size > 1) {
            const unterprojektNamen = Array.from(zuLoeschendeIndizes)
                .filter(idx => idx !== projektIndex)
                .map(idx => projekte[idx].name)
                .join(", ");
            
            const confirmation = confirm(`Achtung: Das Projekt hat ${zuLoeschendeIndizes.size - 1} Unterprojekt(e): ${unterprojektNamen}. Diese werden ebenfalls gelöscht. Fortfahren?`);
            
            if (!confirmation) {
                schliesseDeleteModal();
                return;
            }
        }
        
        const sortierteIndizes = Array.from(zuLoeschendeIndizes).sort((a, b) => b - a);
        
        for (const index of sortierteIndizes) {
            projekte.splice(index, 1);
        }
        
        projekte.forEach(projekt => {
            if (projekt.parentId) {
                const parentIndex = parseInt(projekt.parentId);
                if (zuLoeschendeIndizes.has(parentIndex)) {
                    projekt.parentId = null;
                }
            }
        });
        
        await speichereProjekte(projekte);
        schliesseDeleteModal();
        await zeichneGanttChart();
    }
    
    function oeffneDeleteModal() {
        if (deleteConfirmModal) deleteConfirmModal.style.display = 'block';
        if (modal) modal.style.display = 'none';
    }
    
    function schliesseDeleteModal() {
        if (deleteConfirmModal) deleteConfirmModal.style.display = 'none';
        aktuelleProjektID = null;
    }

    // ===== EVENT LISTENERS =====
    if (projektForm) {
        projektForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const nameField = document.getElementById('projektName');
            const bearbeiterField = document.getElementById('bearbeiter');
            const startField = document.getElementById('startDatum');
            const endField = document.getElementById('endDatum');
            const farbeField = document.getElementById('projektFarbe');
            const parentField = document.getElementById('parentProjekt');
            
            const name = nameField ? nameField.value : '';
            const bearbeiter = bearbeiterField ? bearbeiterField.value : '';
            const start = startField ? startField.value : '';
            const end = endField ? endField.value || null : null;
            const farbe = farbeField ? farbeField.value : '#4299e1';
            const editId = editProjektIdField ? editProjektIdField.value : '';
            
            if (!name || !bearbeiter || !start) {
                alert('Bitte füllen Sie die Pflichtfelder aus (Name, Bearbeiter, Startdatum).');
                return;
            }
            
            const projekte = await ladeProjekte();
            const parentId = parentField ? parentField.value : '';
            const addAsSubId = addAsSubProjektField ? addAsSubProjektField.value : '';
            
            const effectiveParentId = addAsSubId !== '' ? addAsSubId : parentId;
            
            const projektDaten = {
                name,
                bearbeiter,
                start,
                end,
                farbe,
                notizen: '',
                parentId: effectiveParentId || null,
                subprojekte: []
            };
            
            if (editId !== '') {
                const index = parseInt(editId, 10);
                projektDaten.notizen = projekte[index].notizen || '';
                projekte[index] = projektDaten;
            } else {
                projekte.push(projektDaten);
            }
            
            await speichereProjekte(projekte);
            
            projektForm.reset();
            if (editProjektIdField) editProjektIdField.value = '';
            if (submitBtn) submitBtn.textContent = 'Hinzufügen';
            if (cancelEditBtn) cancelEditBtn.style.display = 'none';
            await zeichneGanttChart();
        });
    }

    // Navigation Event Listeners
    if (prevBtn) {
        prevBtn.addEventListener('click', async function() {
            zeitOffset -= isMonthView ? 1 : 7;
            await zeichneGanttChart();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', async function() {
            zeitOffset += isMonthView ? 1 : 7;
            await zeichneGanttChart();
        });
    }
    
    if (todayBtn) {
        todayBtn.addEventListener('click', async function() {
            zeitOffset = 0;
            await zeichneGanttChart();
        });
    }

    if (zoomToggleBtn) {
        zoomToggleBtn.addEventListener('click', async function() {
            isMonthView = !isMonthView;
            zeitOffset = 0;
            
            if (viewModeText && zoomIcon) {
                if (isMonthView) {
                    viewModeText.textContent = "Tagesansicht";
                    zoomIcon.textContent = "🔍+";
                } else {
                    viewModeText.textContent = "Monatsansicht";
                    zoomIcon.textContent = "🔍";
                }
            }
            
            await zeichneGanttChart();
        });
    }

    // Modal Event Listeners
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', async function() {
            if (aktuelleProjektID !== null) {
                const projekte = await ladeProjekte();
                projekte[aktuelleProjektID].notizen = projektNotes ? projektNotes.value : '';
                await speichereProjekte(projekte);
                schliesseModal();
            }
        });
    }
    
    if (addSubprojektBtn) {
        addSubprojektBtn.addEventListener('click', function() {
            if (aktuelleProjektID !== null) {
                startAddSubprojekt();
            }
        });
    }
    
    if (editProjektBtn) {
        editProjektBtn.addEventListener('click', async function() {
            if (aktuelleProjektID !== null) {
                await projektBearbeiten(aktuelleProjektID);
            }
        });
    }
    
    if (deleteProjektBtn) {
        deleteProjektBtn.addEventListener('click', function() {
            if (aktuelleProjektID !== null) {
                oeffneDeleteModal();
            }
        });
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async function() {        
            if (aktuelleProjektID !== null) {
                await projektLoeschen(aktuelleProjektID);
            }
        });
    }
    
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', schliesseDeleteModal);
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', async () => await abbrechenBearbeitung());
    }
    
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', schliesseModal);
    }

    // Backdrop Event Listeners
    const projektModalBackdrop = document.querySelector('#projektModal .modal-backdrop');
    const deleteModalBackdrop = document.querySelector('#deleteConfirmModal .modal-backdrop');
    
    if (projektModalBackdrop) {
        projektModalBackdrop.addEventListener('click', schliesseModal);
    }
    
    if (deleteModalBackdrop) {
        deleteModalBackdrop.addEventListener('click', schliesseDeleteModal);
    }
    
    // Modal content click prevention
    document.querySelectorAll('.modal-content').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });

    // Zurück zur Startseite Button Event Listener
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'index.html';
        });
        
        // Hover-Effekt für den Button
        backBtn.addEventListener('mouseenter', function() {
            this.style.background = 'linear-gradient(135deg, #8b5cf6, #6b46c1)';
            this.style.transform = 'translateY(-1px)';
            this.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
        });
        
        backBtn.addEventListener('mouseleave', function() {
            this.style.background = 'linear-gradient(135deg, #6b46c1, #8b5cf6)';
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
    }

    // ===== INITIALISIERUNG =====
    try {
        console.log('Initialisiere Projektplaner...');
        initializeFarbpalette();
        
        // Lade Projekte mit erweiterten Debugging-Informationen
        console.log('Lade Projekte für Initialisierung...');
        const projekte = await ladeProjekte();
        console.log('Projekte erfolgreich geladen für Initialisierung:', projekte);
        
        // Zusätzliche Validierung der Projektstruktur
        if (projekte && projekte.length > 0) {
            console.log(`${projekte.length} Projekte gefunden`);
            
            // Zeige Details über jedes Projekt
            projekte.forEach((projekt, index) => {
                console.log(`Projekt ${index}:`, {
                    name: projekt.name,
                    bearbeiter: projekt.bearbeiter,
                    start: projekt.start,
                    end: projekt.end,
                    parentId: projekt.parentId,
                    farbe: projekt.farbe
                });
            });
            
            // Prüfe auf Probleme mit Parent-Child-Beziehungen
            const parentIds = new Set();
            const projectIds = new Set();
            
            projekte.forEach((projekt, index) => {
                projectIds.add(index.toString());
                if (projekt.parentId) {
                    parentIds.add(projekt.parentId);
                }
            });
            
            // Finde verwaiste Parent-IDs
            const orphanedParents = [...parentIds].filter(parentId => !projectIds.has(parentId));
            if (orphanedParents.length > 0) {
                console.warn('Gefundene verwaiste Parent-IDs:', orphanedParents);
            }
            
        } else {
            console.log('Keine Projekte gefunden - Chart wird leer angezeigt');
        }
        
        await zeichneGanttChart(projekte);
        console.log('Gantt-Chart erfolgreich gezeichnet');
        
    } catch (error) {
        console.error('Fehler bei der Initialisierung:', error);
        console.error('Error Stack:', error.stack);
        
        if (ganttChart) {
            ganttChart.innerHTML = `
                <div class="error-message">
                    <h3>Fehler beim Laden der Anwendung</h3>
                    <p>Details: ${error.message}</p>
                    <button onclick="window.location.reload()">Seite neu laden</button>
                </div>
            `;
        }
        
        // Versuche Fallback-Daten zu verwenden
        try {
            console.log('Versuche Fallback mit leeren Daten...');
            await zeichneGanttChart([]);
        } catch (fallbackError) {
            console.error('Auch Fallback gescheitert:', fallbackError);
        }
    }
});