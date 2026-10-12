document.addEventListener('DOMContentLoaded', () => {
    const selectAnlage = document.getElementById('selectAnlage');
    const selectZelle = document.getElementById('selectZelle');
    const inpSearch = document.getElementById('inpSearch');
    const btnReset = document.getElementById('btnReset');
    const tableBody = document.getElementById('sawTableBody');
    const loading = document.getElementById('loading');
    const inpKopf = document.getElementById('inpKopf');

    let allZellen = [];
    let allAnlagen = [];
    let globalCellLinks = []; // NEU: Speichert {zelID_1, zelID_2}
    let currentSaw = null;
    let allLoadedSaws = []; 
    // NEU: Globaler Benutzerstatus
    let currentUser = null;

    const MAX_COLS = 6;
    
    // Check Link Status (Helper)
    function isCellLinked(id) {
        id = parseInt(id);
        if(!globalCellLinks) return false;
        return globalCellLinks.some(l => parseInt(l.zelID_1) === id || parseInt(l.zelID_2) === id);
    }
    
    // Textbausteine List - Initial leer, wird geladen
    let textbausteine = [];

    // Initialdaten laden
    checkAuth(); // Hier auth checken vor Meta laden
    // loadMeta(); // loadMeta wird jetzt erst nach erfolgreichem Login aufgerufen

    // NEU: Helper um zu prüfen, ob eine Zelle verknüpft ist
    function isCellLinked(zelID) {
        zelID = parseInt(zelID);
        return globalCellLinks.some(link => parseInt(link.zelID_1) === zelID || parseInt(link.zelID_2) === zelID);
    }

    // Event Listener
    if (inpKopf) {
        inpKopf.addEventListener('input', function() {
            limitLines(this, 5, 85); // Begrenzt auf 5 Zeilen und 85 Zeichen pro Zeile
            autoResize(this);
        });
    }

    if (inpSearch) {
        inpSearch.addEventListener('input', filterAndRenderSaws);
    }

    selectAnlage.addEventListener('change', () => {
        renderZellenOptions(selectAnlage.value);
        filterAndRenderSaws();
    });

    selectZelle.addEventListener('change', () => {
        filterAndRenderSaws();
    });

    btnReset.addEventListener('click', () => {
        selectAnlage.value = 0;
        renderZellenOptions(0);
        selectZelle.value = 0;
        if (inpSearch) inpSearch.value = '';
        filterAndRenderSaws();
    });

    // Modal Event Listener
    const modalSelectAnlage = document.getElementById('modalSelectAnlage');
    const modalSelectZelle = document.getElementById('modalSelectZelle');

    modalSelectAnlage.addEventListener('change', () => {
        renderModalZellenOptions(modalSelectAnlage.value);
    });

    // NEU: Enter Key auf dem Haupt-Login Screen
    const inpMainLogin = document.getElementById('inpMainLogin');
    if (inpMainLogin) {
        inpMainLogin.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                performMainLogin();
            }
        });
    }

    // Modal bei Klick außerhalb schließen
    window.onclick = function(event) {
        const modal = document.getElementById('modalNewSaw');
        if (event.target == modal) {
            closeNewSawModal();
        }
        
        const modalEdit = document.getElementById('modalEditDecision');
        if (event.target == modalEdit) {
            closeEditDecisionModal();
        }
        
        // NEU: Login Modal Close Click
        const modalLogin = document.getElementById('modalLogin');
        if (event.target == modalLogin) {
            closeLoginModal();
        }
    }
    
    // NEU: Login mit Enter im Inputfeld
    const inpLogin = document.getElementById('inpLoginRfid');
    if(inpLogin) {
        inpLogin.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                performLogin();
            }
        });
    }

    // --- API FUNCTIONS ---
    
    // NEU: AUTHENTIFIZIERUNG LADE/LOGIC MIT UI SWITCH
    function checkAuth() {
        const statusDiv = document.getElementById('loginStatus');
        if(statusDiv) statusDiv.innerText = "Prüfe Anmeldung...";

        fetch('api.php?action=check_auth')
            .then(res => res.json())
            .then(data => {
                if(data.success && data.user) {
                    // Check Permission "kannSAWSehen"
                    if (data.user.kannSAWSehen == 1) {
                        currentUser = data.user;
                        showAppContent();
                    } else {
                        // User da, aber kein Recht
                        showLoginScreen("Keine Berechtigung (kannSAWSehen fehlt).");
                        // Optional: Logout callen damit Session clean ist
                        fetch('api.php?action=logout');
                    }
                } else {
                    currentUser = null;
                    showLoginScreen(); // Zeige Login
                }
            })
            .catch(() => {
                currentUser = null;
                showLoginScreen("Verbindung zum Server fehlgeschlagen.");
            });
    }

    function showAppContent() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        
        // Jetzt erst Daten laden
        loadMeta();
        updateUIForUser();
        showNotification("Angemeldet als " + currentUser.name, "success");
    }

    function showLoginScreen(msg = "") {
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        const inp = document.getElementById('inpMainLogin');
        if(inp) {
            inp.value = '';
            inp.focus();
        }
        const statusDiv = document.getElementById('loginStatus');
        if(statusDiv) {
            statusDiv.style.color = msg ? '#e74c3c' : '#666';
            statusDiv.innerText = msg;
        }
    }

    window.performMainLogin = function() {
        const inp = document.getElementById('inpMainLogin');
        const code = inp.value;
        const statusDiv = document.getElementById('loginStatus');
        
        if(!code) {
             statusDiv.innerText = "Bitte Code eingeben.";
             return;
        }
        
        // Sicherheit: Eingabefeld sofort leeren damit der Code nicht sichtbar bleibt
        inp.value = '';
        
        statusDiv.style.color = "#333";
        statusDiv.innerText = "Anmelden...";

        fetch('api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'login', rfid: code})
        })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                if (data.user.kannSAWSehen == 1) {
                    currentUser = data.user;
                    showAppContent();
                } else {
                    statusDiv.style.color = "#e74c3c";
                    statusDiv.innerText = "Zugriff verweigert (Fehlende Berechtigung).";
                    fetch('api.php?action=logout');
                }
            } else {
                statusDiv.style.color = "#e74c3c";
                statusDiv.innerText = data.error || "Login fehlgeschlagen";
                inp.value = '';
                inp.focus();
            }
        })
        .catch(err => {
            statusDiv.style.color = "#e74c3c";
            statusDiv.innerText = "Verbindungsfehler.";
            console.error(err);
        });
    }

    // Alte Login Funktionen ersetzen/anpassen
    window.performLogin = function() {
        // Fallback für evtl. noch vorhandene Aufrufe
        performMainLogin();
    }
    
    window.openLoginPrompt = function() {
        // Wird jetzt Logout oder Login Screen
        doLogout();
    }

    window.doLogout = function() {
        if(confirm("Möchten Sie sich abmelden?")) {
            fetch('api.php?action=logout')
            .then(() => {
                currentUser = null;
                showLoginScreen("Erfolgreich abgemeldet.");
            });
        }
    }

    // Aktualisierte UI Logic (kein Login Button mehr, nur Logout)
    function updateUIForUser() {
        const btnLogout = document.getElementById('btnLogout');
        const btnCreate = document.getElementById('btnCreateNew');
        const btnManage = document.getElementById('btnToManage');
        
        if (currentUser) {
            btnLogout.innerText = "👤 " + currentUser.name + " (Abmelden)";
            
            // Berechtigungen prüfen:
            // 1. Bearbeiten / Neu erstellen (isAdmin hat immer Recht)
            if (currentUser.kannSAWBearbeiten == 1 || currentUser.isAdmin == 1) {
                btnCreate.style.display = 'inline-block';
            } else {
                btnCreate.style.display = 'none';
            }
            
            // 2. Verwaltung (STRIKT NUR mit Plus-Recht ODER Admin)
            // isAdmin wieder hinzugefügt
            const canManage = (currentUser.kannSAWBearbeitenPlus == 1 || currentUser.isAdmin == 1);
            
            if (canManage) {
                btnManage.style.display = 'inline-block';
            } else {
                btnManage.style.display = 'none';
            }
            
            const inpUser = document.getElementById('inpUser');
            if(inpUser && inpUser.value === '') {
                inpUser.value = currentUser.name;
            }
        }
        filterAndRenderSaws();
    }

    function loadMeta() {
        fetch('api.php?action=get_meta')
            .then(res => res.json())
            .then(data => {
                if (data.error) { alert("Fehler: " + data.error); return; }
                
                allZellen = data.zellen || [];
                allAnlagen = data.anlagen || [];
                globalCellLinks = data.links || []; // NEU

                // NEU: Textbausteine aus API laden
                // Falls Array leer ist (neu angelegte DB), bleibt es leer. PHP kümmert sich um Defaults.
                if (data.textbausteine && Array.isArray(data.textbausteine)) {
                    textbausteine = data.textbausteine.map(tb => tb.inhalt);
                } else {
                    textbausteine = [];
                }
                
                // Datalist für Editor füllen
                const dl = document.getElementById('anlagenList');
                if(dl) {
                    let html = '';
                    allAnlagen.forEach(a => html += `<option value="${a.bez}">`);
                    dl.innerHTML = html;
                }
                
                // Filter-Dropdowns füllen
                let options = '<option value="0">-- Alle Anlagen --</option>';
                (data.anlagen || []).forEach(anl => {
                    options += `<option value="${anl.anlID}">${anl.bez}</option>`;
                });
                selectAnlage.innerHTML = options;

                // Modal-Dropdowns füllen
                let modalOptions = '<option value="0">-- Bitte wählen --</option>';
                (data.anlagen || []).forEach(anl => {
                    modalOptions += `<option value="${anl.anlID}">${anl.bez}</option>`;
                });
                modalSelectAnlage.innerHTML = modalOptions;

                renderZellenOptions(0);
                loadSAWs();
            })
            .catch(err => console.error(err));
    }

    function renderZellenOptions(filterAnlID) {
        const currentVal = parseInt(selectZelle.value) || 0;
        const filterId = parseInt(filterAnlID) || 0;

        let filtered = filterId === 0 
            ? [...allZellen] 
            : allZellen.filter(z => parseInt(z.zelAnl) == filterId);
            
        // Sortieren alphabetisch nach zelBez (Bezeichnung) statt Nummer
        filtered.sort((a, b) => {
            return (a.zelBez || '').localeCompare((b.zelBez || ''), undefined, { sensitivity: 'base' });
        });

        let options = '<option value="0">-- Alle Zellen --</option>';
        filtered.forEach(z => {
            // WICHTIG: Markierung für verknüpft
            const mark = isCellLinked(z.zelID) ? ' 🔗' : '';
            options += `<option value="${z.zelID}">[${z.zelNr}] ${z.zelBez}${mark}</option>`;
        });
        selectZelle.innerHTML = options;
        
        // Versuche Auswahl beizubehalten, wenn möglich
        if (currentVal != 0 && filtered.find(z => z.zelID == currentVal)) {
            selectZelle.value = currentVal;
        } else {
            selectZelle.value = 0;
        }
    }

    function renderModalZellenOptions(filterAnlID) {
        const filterId = parseInt(filterAnlID) || 0;

        let filtered = filterId === 0 
            ? [] 
            : allZellen.filter(z => parseInt(z.zelAnl) == filterId);
            
        // Sortieren alphabetisch nach zelBez
        filtered.sort((a, b) => {
            return (a.zelBez || '').localeCompare((b.zelBez || ''), undefined, { sensitivity: 'base' });
        });

        let options = filterId === 0 
            ? '<option value="0">-- Bitte erst Anlage wählen --</option>'
            : '<option value="0">-- Bitte wählen --</option>';
            
        filtered.forEach(z => {
            const mark = isCellLinked(z.zelID) ? ' 🔗' : '';
            options += `<option value="${z.zelID}">[${z.zelNr}] ${z.zelBez}${mark}</option>`;
        });
        modalSelectZelle.innerHTML = options;
    }

    function loadSAWs() {
        loading.style.display = 'block';

        fetch(`api.php?action=get_saws`)
            .then(res => res.json())
            .then (data => {
                loading.style.display = 'none';
                if (Array.isArray(data)) {
                    allLoadedSaws = data;
                } else {
                    allLoadedSaws = [];
                    console.error('Invalid data format:', data);
                }
                filterAndRenderSaws();
            })
            .catch(err => {
                loading.style.display = 'none';
                console.error('Fetch error:', err);
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Verbindungsfehler</td></tr>';
            });
    }

    function filterAndRenderSaws() {
        const searchTerm = inpSearch ? inpSearch.value.toLowerCase() : '';
        const filterAnl = parseInt(selectAnlage.value) || 0;
        const filterZel = parseInt(selectZelle.value) || 0;

        // Relevante Zellen: ausgewählte Zelle + direkt verknüpft
        const relevantZelIDs = new Set();
        if (filterZel > 0) {
            relevantZelIDs.add(filterZel);
            if (Array.isArray(globalCellLinks)) {
                globalCellLinks.forEach(link => {
                    const l1 = parseInt(link.zelID_1);
                    const l2 = parseInt(link.zelID_2);
                    if (l1 === filterZel && l2 > 0) relevantZelIDs.add(l2);
                    if (l2 === filterZel && l1 > 0) relevantZelIDs.add(l1);
                });
            }
        }

        // Relevante Anlagen aus relevanten Zellen ableiten
        const relevantAnlIDs = new Set();
        if (relevantZelIDs.size > 0) {
            allZellen.forEach(z => {
                const zid = parseInt(z.zelID);
                const aid = parseInt(z.zelAnl);
                if (relevantZelIDs.has(zid) && aid > 0) relevantAnlIDs.add(aid);
            });
        }

        const filtered = allLoadedSaws.filter(row => {
            // 1. Anlage der Zeile IMMER aus Metadaten ermitteln
            let rowAnlID = 0;

            if (row.zellen_id) {
                const zVal = parseInt(row.zellen_id);
                const foundZelle = allZellen.find(z => parseInt(z.zelID) === zVal);
                if (foundZelle) rowAnlID = parseInt(foundZelle.zelAnl) || 0;
            }

            // Fallback: Wenn immer noch 0, versuche aus row.zelAnl (JOIN-Ergebnis)
            if (rowAnlID === 0 && row.zelAnl) {
                rowAnlID = parseInt(row.zelAnl) || 0;
            }

            // FILTER: Anlage
            if (filterAnl > 0) {
                let match = (rowAnlID === filterAnl);

                // Wichtig: korrektes Feld aus API ist all_anl_ids (nicht all_linked_anl_ids)
                if (!match && row.all_anl_ids) {
                    const anlIds = String(row.all_anl_ids)
                        .split(',')
                        .map(x => parseInt(x))
                        .filter(x => !isNaN(x));
                    if (anlIds.includes(filterAnl)) match = true;
                }

                // Wenn Zellenfilter aktiv ist: verknüpft Zellen-Anlagen ebenfalls zulassen
                if (!match && filterZel > 0 && relevantAnlIDs.has(rowAnlID)) {
                    match = true;
                }

                if (!match) return false;
            }

            // FILTER: Zelle
            if (filterZel > 0) {
                const rowZelIDs = new Set();

                if (row.matched_zelID && parseInt(row.matched_zelID) > 0) rowZelIDs.add(parseInt(row.matched_zelID));
                if (row.zellen_id && parseInt(row.zellen_id) > 0) rowZelIDs.add(parseInt(row.zellen_id));

                if (row.all_cell_ids) {
                    String(row.all_cell_ids).split(',').forEach(id => {
                        const v = parseInt(id);
                        if (!isNaN(v) && v > 0) rowZelIDs.add(v);
                    });
                }

                // Fallback über SAW-Nummer
                if (rowZelIDs.size === 0 && row.saw_nr && String(row.saw_nr).length >= 6) {
                    const nrStr = String(row.saw_nr);
                    const mAnl = parseInt(nrStr.substring(0, 2));
                    const mZel = parseInt(nrStr.substring(2, 6));
                    const foundZ = allZellen.find(z =>
                        parseInt(z.masterAnl) === mAnl && parseInt(z.masterZel) === mZel
                    );
                    if (foundZ) rowZelIDs.add(parseInt(foundZ.zelID));
                }

                const match = [...rowZelIDs].some(id => relevantZelIDs.has(id));
                if (!match) return false;
            }

            // FILTER: Textsuche
            if (searchTerm) {
                const nr = row.saw_nr ? String(row.saw_nr).toLowerCase() : '';
                const kopf = row.kopf ? String(row.kopf).toLowerCase() : '';
                const ersteller = row.ersteller ? String(row.ersteller).toLowerCase() : '';
                const zelBez = row.zelBez ? String(row.zelBez).toLowerCase() : '';
                
                // Anlagennamen für Suche auflösen
                let anlBez = '';
                if (rowAnlID > 0) {
                    const foundAnl = allAnlagen.find(a => parseInt(a.anlID) === rowAnlID);
                    if (foundAnl) anlBez = foundAnl.bez.toLowerCase();
                }
                
                return nr.includes(searchTerm) || 
                       kopf.includes(searchTerm) || 
                       ersteller.includes(searchTerm) ||
                       zelBez.includes(searchTerm) ||
                       anlBez.includes(searchTerm);
            }
            
            // WICHTIG: Wenn kein Filter gesetzt ist, ALLE anzeigen
            return true;
        });

        renderTable(filtered);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">Keine Schaltanweisungen gefunden.</td></tr>';
            return;
        }
        
        // Berechtigung prüfen: Hat der User das Recht zu bearbeiten?
        // Wenn currentUser null ist (Gast), darf er standardmäßig NICHT bearbeiten.
        // Admin darf immer bearbeiten.
        const canEdit = currentUser && (currentUser.kannSAWBearbeiten == 1 || currentUser.isAdmin == 1);

        data.forEach(row => {
            let statusClass = 'status-bearbeitet'; // Default
            let statusText = 'Bearbeitet';

            // Status Logik basierend auf 'original' Spalte (1 = Original, 0 = Bearbeitet)
            if (row.original == 1) {
                statusClass = 'status-original';
                statusText = 'Original';
            } else {
                statusClass = 'status-bearbeitet';
                statusText = 'Bearbeitet';
                
                // Falls Status explizit "IN ARBEIT" ist, dies anzeigen (optional)
                if (row.status === 'IN ARBEIT') {
                    statusClass = 'status-in-arbeit';
                    statusText = 'In Arbeit';
                }
            }

            // Kopftext kürzen für die Tabelle
            const kopfText = row.kopf ? (row.kopf.length > 60 ? row.kopf.substring(0, 60) + '...' : row.kopf) : '';

            // Ersteller "VORHANDENE" ausblenden
            let erstellerText = row.ersteller;
            if (erstellerText === 'VORHANDENE') erstellerText = '';

            // Bearbeiten Button nur rendern wenn berechtigt
            let actionHtml = '';
            if (canEdit) {
                actionHtml = `<button onclick="editSaw('${row.saw_nr}')" class="btn-reset btn-sm" style="background-color: #ecf0f1; color: #333; border: 1px solid #ced4da;">Bearbeiten</button>`;
            } else {
                 actionHtml = `<span style="color:#ccc; font-size:0.8em;">-</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><a href="#" onclick="viewSaw('${row.saw_nr}'); return false;" class="saw-link">${row.saw_nr}</a></td>
                <td>${row.datum}</td>
                <td style="color:#555;">${kopfText}</td>
                <td>${erstellerText}</td>
                <td style="text-align: center;"><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="action-btn-group">
                        ${actionHtml}
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // --- VIEW SWITCHING ---
    window.switchView = function(viewName) {
        
        // SECURITY CHECK: Verwaltung nur mit Berechtigung
        // Verhindert Zugriff auch wenn Button via HTML-Hack sichtbar gemacht würde
        if (viewName === 'manage') {
            const hasRight = currentUser && (currentUser.kannSAWBearbeitenPlus == 1 || currentUser.isAdmin == 1);
            if (!hasRight) {
                showNotification("Zugriff verweigert: Fehlende Berechtigung.", "error");
                return; // Abbruch
            }
        }

        document.querySelectorAll('[id^="view-"]').forEach(el => {
            el.style.display = 'none';
        });
        
        const targetView = document.getElementById('view-' + viewName);
        if(targetView) {
            targetView.style.display = 'block';
            
            // Animation neu triggern (Hack: Klasse kurz entfernen und neu hinzufügen)
            targetView.classList.remove('view-section');
            void targetView.offsetWidth; // Trigger reflow
            targetView.classList.add('view-section');
        }
        
        // Button-Sichtbarkeit anpassen
        const btnToList = document.getElementById('btnToList');
        const btnCreateNew = document.getElementById('btnCreateNew');
        const btnToManage = document.getElementById('btnToManage');
        
        // Buttons Standard-Reset
        btnToList.style.display = 'none';
        // btnLogin.style.display = 'inline-block'; // ENTFERNT
        
        // Erstellen/Verwalten werden durch updateUIForUser gesteuert
        
        if (viewName === 'list') {
            updateUIForUser(); // Stellt Create/Manage wieder her falls berechtigt
        } else if (viewName === 'detail') {
            btnToList.style.display = 'inline-block';
            btnCreateNew.style.display = 'none';
            btnToManage.style.display = 'none';
        } else if (viewName === 'editor') {
            btnToList.style.display = 'inline-block';
            btnCreateNew.style.display = 'none';
            btnToManage.style.display = 'none';
        } else if (viewName === 'manage') {
            btnToList.style.display = 'inline-block';
            btnCreateNew.style.display = 'inline-block'; // In Verwaltung darf man auch neu erstellen (optional)
            btnToManage.style.display = 'none'; // Schon drin
        }
        
        if(viewName === 'manage') loadManageData();
        if(viewName === 'list') loadSAWs();
    }

    // --- DETAIL & EDITOR LOGIC ---
    let pendingEditData = null;

    window.viewSaw = function(nr) {
        fetch(`api.php?action=get_detail&nr=${nr}`)
            .then(res => res.json())
            .then(data => {
                // Daten aus DB sind bereits normalisiert: anlagen[0..5], schritte[]
                currentSaw = data;
                populateDetailView(data);
                switchView('detail');
            });
    }

    window.editSaw = function(nr) {
        fetch(`api.php?action=get_detail&nr=${nr}`)
            .then(res => res.json())
            .then(data => {
                // START FIX: Fehlerprüfung
                if (data.error || !data.saw_nr) {
                    alert("Fehler beim Laden der Schaltanweisung:\n" + (data.error || "Daten unvollständig (Import fehlerhaft?)"));
                    // Breche ab, damit wir kein leeres Fenster anzeigen
                    return;
                }
                // END FIX

                // FIX: Falls Detail-Datensatz keine zellen_id hat (alte Daten),
                // versuche sie aus der bereits geladenen Liste zu holen (dort wurde sie berechnet/gejoint).
                if (!data.zellen_id || data.zellen_id == 0) {
                    const listEntry = allLoadedSaws.find(s => s.saw_nr == nr);
                    if (listEntry && listEntry.matched_zelID) {
                        data.zellen_id = listEntry.matched_zelID;
                    } else {
                        // Fallback: Versuche aus SAW-Nummer zu parsen
                        const masterAnl = parseInt(nr.substring(0, 2));
                        const masterZel = parseInt(nr.substring(2, 6));
                        const foundZelle = allZellen.find(z => z.masterAnl === masterAnl && z.masterZel === masterZel);
                        if (foundZelle) {
                            data.zellen_id = foundZelle.zelID;
                        }
                    }
                }

                pendingEditData = data;
                
                const modal = document.getElementById('modalEditDecision');
                const msg = document.getElementById('modalEditMsg');
                const footer = document.getElementById('modalEditFooter');

                // NEU: Berechtigung prüfen für Plus/Admin
                const canPlus = currentUser && (currentUser.kannSAWBearbeitenPlus == 1 || currentUser.isAdmin == 1);

                if (data.original == 1) {
                    if (canPlus) {
                        // Plus-User darf auch Originale bearbeiten
                        msg.innerHTML = "Dies ist ein <b>Original-Dokument</b>.<br>Als berechtigter Benutzer können Sie das Original bearbeiten oder eine Kopie erstellen.";
                        footer.innerHTML = `
                            <button class="btn-reset" onclick="closeEditDecisionModal()" style="background:#95a5a6;">Abbrechen</button>
                            <button class="btn-reset" onclick="proceedEdit('original')" style="background:#e74c3c; color:white;">Original bearbeiten / Löschen</button>
                            <button class="btn-reset" onclick="proceedEdit('copy')" style="background:#2ecc71; color:white;">Kopie erstellen</button>
                        `;
                    } else {
                        // Normale User werden zur Kopie gezwungen
                        msg.innerHTML = "Dies ist ein Original-Dokument.<br>Es wird automatisch eine Kopie zur Bearbeitung erstellt.";
                        footer.innerHTML = `
                            <button class="btn-reset" onclick="closeEditDecisionModal()" style="background:#95a5a6;">Abbrechen</button>
                            <button class="btn-reset" onclick="proceedEdit('copy')" style="background:#2ecc71; color:white;">Kopie erstellen</button>
                        `;
                    }
                } else {
                    msg.innerHTML = "Sie bearbeiten eine <b>nicht originale</b> Schaltanweisung.<br>Möchten Sie eine Kopie erstellen oder dieses Dokument direkt bearbeiten?";
                    footer.innerHTML = `
                        <button class="btn-reset" onclick="closeEditDecisionModal()" style="background:#95a5a6;">Abbrechen</button>
                        <button class="btn-reset" onclick="proceedEdit('original')" style="background:#3498db; color:white;">Bearbeiten</button>
                        <button class="btn-reset" onclick="proceedEdit('copy')" style="background:#2ecc71; color:white;">Kopie erstellen</button>
                    `;
                }
                
                modal.classList.add('show');
            });
    }

    window.closeEditDecisionModal = function() {
        document.getElementById('modalEditDecision').classList.remove('show');
        pendingEditData = null;
    }

    window.proceedEdit = function(mode) {
        const data = pendingEditData;
        closeEditDecisionModal();
        
        if (!data) return;

        let makeCopy = (mode === 'copy');
        
        if (makeCopy) {
            // Prüfe ob wir eine gültige zellen_id haben
            // FIX: Wenn wir kopieren wollen, müssen wir entweder eine Zelle haben ODER eine bestehende Nummer als Vorlage
            if ((!data.zellen_id || data.zellen_id == 0) && !data.saw_nr) {
                alert("Fehler: Kann Zelle für diese Schaltanweisung nicht ermitteln.\nBitte kontaktieren Sie den Administrator.");
                return;
            }
            
            const newNr = getNextSawNr(data.zellen_id, data.saw_nr);
            
            data.saw_nr = newNr;
            data.status = 'IN ARBEIT';
            data.original = 0;
        }

        if (!Array.isArray(data.anlagen)) data.anlagen = [];
        while (data.anlagen.length < MAX_COLS) data.anlagen.push({ bez: '', nr: 0 });

        data.anlagen.forEach(anl => {
            if (anl.bez === null || anl.bez === undefined) anl.bez = '';
        });

        currentSaw = data;
        switchView('editor');
        // FIX: populateEditor muss aufgerufen werden, damit die Felder befüllt werden!
        populateEditor();
    }

    function getNextSawNr(zelID, originNr = null) {
        let prefix = "";
        
        // Versuch 1: Zelle exakt finden via ID
        // Sicherstellen, dass allZellen existiert
        if (!allZellen) allZellen = [];
        const zelle = allZellen.find(z => z.zelID == zelID);
        
        if (zelle) {
            // Zelle gefunden -> Sauberer Weg über Stammdaten
            const anlPart = String(zelle.masterAnl).padStart(2,'0');
            const zelPart = String(zelle.masterZel).padStart(4,'0');
            prefix = anlPart + zelPart;
        } else {
            // Zelle nicht in Stammdaten gefunden (z.B. Import-Leiche)
            // Statt warnung versuchen wir es stillschweigend über die Nummer zu fixen
            
            // Versuch 2: Fallback über die bestehende Nummer (originNr)
            if (originNr && originNr.length >= 6) {
                // Prüfen ob wir die Zelle vielleicht über masterAnl/masterZel finden können
                const masterAnl = parseInt(originNr.substring(0, 2));
                const masterZel = parseInt(originNr.substring(2, 6)); // Fix für substring
                
                const foundZelle = allZellen.find(z => z.masterAnl === masterAnl && z.masterZel === masterZel);
                
                if (foundZelle) {
                    // console.log("Fallback Zelle gefunden via Nummer:", foundZelle);
                    const anlPart = String(foundZelle.masterAnl).padStart(2,'0');
                    const zelPart = String(foundZelle.masterZel).padStart(4,'0');
                    prefix = anlPart + zelPart;
                } else {
                    // Versuch 3: Hard Fallback -> Prefix direkt aus der alten Nummer kopieren
                    // console.warn("Keine passende Zelle gefunden. Nutze Prefix direkt aus Nummer:", originNr);
                    prefix = originNr.substring(0, 6);
                }
            } else {
                 alert("FEHLER: Zelle (" + zelID + ") nicht gefunden und keine Referenznummer vorhanden!\nBitte an Admin wenden.");
                 return "00000000"; // Dummy fallback
            }
        }
        
        // Nun haben wir einen Prefix (z.B. "020005" oder "851396"), jetzt höchste laufende Nummer finden
        let maxLfd = 0;
        allLoadedSaws.forEach(saw => {
            const nrStr = String(saw.saw_nr);
            if (nrStr.startsWith(prefix)) {
                // Manche Nummern könnten länger sein, wir parsen die 2 Ziffern nach dem Prefix
                const rest = nrStr.substring(6);
                const suffix = parseInt(rest.substring(0, 2)); 
                if (!isNaN(suffix) && suffix > maxLfd) maxLfd = suffix;
            }
        });
        
        // Logik: Versuche Original + 1 ("Lücke füllen"), wenn frei. Sonst Max + 1
        if (originNr) {
             const originStr = String(originNr);
             if (originStr.startsWith(prefix)) {
                 // Suffix aus originNr holen
                 const originRest = originStr.substring(6);
                 const originSuffix = parseInt(originRest.substring(0, 2)) || 0;
                 
                 const candidateSuffix = originSuffix + 1;
                 const candidateNr = prefix + String(candidateSuffix).padStart(2, '0');
                 
                 // Prüfen ob diese Nummer schon vergeben ist
                 const exists = allLoadedSaws.some(s => String(s.saw_nr) === candidateNr);
                 // Sicherheitscheck < 100 (da wir nur 2 Stellen haben)
                 if (!exists && candidateSuffix < 100) {
                     return candidateNr;
                 }
             }
        }
        
        return prefix + String(maxLfd + 1).padStart(2, '0');
    }

    window.createNew = function() {
        // Modal öffnen statt direkt zu fragen
        const modal = document.getElementById('modalNewSaw');
        modal.classList.add('show');
        
        // Modal-Felder zurücksetzen
        modalSelectAnlage.value = 0;
        renderModalZellenOptions(0);
        // NEU: Schaltart-Auswahl zurücksetzen
        const modalSchaltart = document.getElementById('modalSelectSchaltart');
        if (modalSchaltart) modalSchaltart.value = '';
    }

    window.closeNewSawModal = function() {
        const modal = document.getElementById('modalNewSaw');
        modal.classList.remove('show');
    }

    window.confirmNewSaw = function() {
        const zelID = parseInt(modalSelectZelle.value);
        const anlID = parseInt(modalSelectAnlage.value);
        
        if (!anlID || anlID === 0) {
            alert("Bitte wählen Sie eine Anlage aus.");
            return;
        }
        
        if (!zelID || zelID === 0) {
            alert("Bitte wählen Sie eine Zelle aus.");
            return;
        }
        
        // Modal schließen
        closeNewSawModal();
        
        // Neue SAW erstellen
        const nextNr = getNextSawNr(zelID);
        const nr = prompt("Bitte SAW Nummer eingeben:", nextNr);
        if (!nr) return;

        // Anlage für Spalte 1 ermitteln
        let initAnlagen = [];
        for(let i=0; i<MAX_COLS; i++) initAnlagen.push({bez:'', nr:0});

        // NEU: Generelle Anlage vorbelegen
        let anlageTextInit = '';
        let anlageBezForKopf = '';
        let zelleBezForKopf = '';

        const zelle = allZellen.find(z => z.zelID == zelID);
        if (zelle) {
            zelleBezForKopf = zelle.zelBez || '';
            const anl = allAnlagen.find(a => a.anlID == zelle.zelAnl);
            if (anl) {
                // ALT (auskommentiert): Anlage wurde bisher automatisch in die erste Spaltenüberschrift geschrieben.
                // initAnlagen[0].bez = anl.bez;
                anlageTextInit = anl.bez; // Weiterhin für Kompatibilitätsfeld genutzt
                anlageBezForKopf = anl.bez;
            }
        }

        // NEU: Kopftext basierend auf gewählter Schaltart vorbefüllen
        const modalSchaltart = document.getElementById('modalSelectSchaltart');
        const schaltart = modalSchaltart ? modalSchaltart.value : '';
        let kopfInit = '';
        if (schaltart) {
            const zelPart = zelleBezForKopf ? zelleBezForKopf : '';
            const anlPart = anlageBezForKopf ? anlageBezForKopf : '';
            kopfInit = `${schaltart} von ${zelPart}${'\u00A0'.repeat(0)}            ${anlPart}`.trim();
            kopfInit += '\nVoraussetzung: ';
        }

        currentSaw = { 
            saw_nr: nr, 
            zellen_id: zelID, 
            // NEU: Ersteller automatisch setzen
            ersteller: currentUser ? currentUser.name : '', 
            status: 'IN ARBEIT', 
            kopf: kopfInit, 
            anlage_text: anlageTextInit, // NEU
            anlagen: initAnlagen, 
            schritte: [] 
        };
        switchView('editor');
        populateEditor();
    }

    function populateDetailView(data) {
        document.getElementById('detailTitle').innerText = data.saw_nr;
        document.getElementById('detailUser').innerText = data.ersteller;
        document.getElementById('detailDate').innerText = data.datum;
        document.getElementById('detailKopf').innerText = data.kopf;
        // NEU: Detail Anzeige für Anlage (optional, falls gewünscht, aber hier Fokus auf Print/Editor)

        // Datum-Feld leeren (Benutzer muss manuell eingeben)
        document.getElementById('detailPrintDate').value = '';

        // Status Badge mit Original-Info
        let statusClass = 'status-bearbeitet';
        let statusText = 'Bearbeitet';
        
        if (data.original == 1) {
            statusClass = 'status-original';
            statusText = 'Original';
        } else if (data.status === 'IN ARBEIT') {
            statusClass = 'status-in-arbeit';
            statusText = 'In Arbeit';
        }
        
        document.getElementById('detailStatusBadge').innerHTML = 
            `<span class="status-badge ${statusClass}">${statusText}</span>`;

        document.getElementById('btnDetailEdit').onclick = () => editSaw(data.saw_nr);
        document.getElementById('btnDetailPrint').onclick = () => {
            const datum = document.getElementById('detailPrintDate').value;
            
            // NEU: Werte für Footer auslesen
            const footerData = {
                verteiler4: document.getElementById('inpFooterVert4').value,
                verteiler5: document.getElementById('inpFooterVert5').value,
                safeNr: document.getElementById('inpFooterSafeNr').value
            };
            
            // Datum ist jetzt optional -> Warnung entfernt
            printFromDetailView(data, datum, footerData);
        };

        const thead = document.getElementById('detailTableHead');
        let headHtml = '<tr><th style="width:40px;">Nr.</th>';
        const anlagen = data.anlagen || [];
        
        for(let i=0; i<MAX_COLS; i++) {
            let val = (anlagen[i] && anlagen[i].bez) ? anlagen[i].bez : '';
            headHtml += `<th>${val}</th>`;
        }
        headHtml += '</tr>';
        thead.innerHTML = headHtml;

        const tbody = document.getElementById('detailTableBody');
        tbody.innerHTML = '';
        const steps = Array.isArray(data.schritte) ? data.schritte : [];
        steps.forEach((step, idx) => {
            const tr = document.createElement('tr');
            let html = `<td style="text-align:center;">${idx+1}</td>`;
            
            for(let i=1; i<=MAX_COLS; i++) {
                const val = (step.ecol == i) ? step.etext : '';
                html += `<td>${val.replace(/\n/g, '<br>')}</td>`;
            }
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    }

    window.printFromDetailView = function(data, datumInput, footerData = null) {
        // Datum formatieren (Optional)
        let datumString = "";
        if (datumInput) {
            const date = new Date(datumInput);
            if (!isNaN(date.getTime())) {
                const datumParts = datumInput.split('-');
                const datum = `${datumParts[2]}.${datumParts[1]}.${datumParts[0]}`;
                const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
                const wochentag = wochentage[date.getDay()];
                datumString = `${wochentag} ${datum}`;
            }
        }
        
        // Schritte in Seiten aufteilen
        const schritte = data.schritte || [];
        const schritteProSeite = 4;
        const anzahlSchritte = schritte.length;
        const anzahlSeiten = Math.max(1, Math.ceil(anzahlSchritte / schritteProSeite));
        const anlagen = data.anlagen || [];
        
        // Zähle welche Anlagen tatsächlich befüllt sind (Index speichern)
        let activeCols = [];
        for(let i = 0; i < 6; i++) {
            if(anlagen[i] && anlagen[i].bez && anlagen[i].bez.trim() !== '') {
                activeCols.push(i);
            }
        }
        // Mindestens die erste Spalte anzeigen, falls alles leer
        if(activeCols.length === 0) activeCols.push(0);
        
        const colCount = activeCols.length;
        
        // Dynamische Schriftgröße berechnen
        // Wenige Spalten -> größere Schrift, Viele Spalten -> kleinere Schrift
        // FIX: Schriftgrößen leicht reduziert damit 10 Zeilen passen
        let dynamicFontSize = '7pt'; // War 7.5pt
        if (colCount <= 2) {
            dynamicFontSize = '9pt'; // War 10pt
        } else if (colCount <= 4) {
            dynamicFontSize = '8pt'; // War 9pt
        } else {
            dynamicFontSize = '7pt'; // 5 oder 6 Spalten
        }

        // Dynamische Spaltenbreite berechnen (Breiter wenn weniger Spalten)
        let colWidth = '42mm';
        if (colCount === 1) colWidth = '130mm';
        else if (colCount === 2) colWidth = '90mm';
        else if (colCount === 3) colWidth = '70mm';
        else if (colCount === 4) colWidth = '58mm';
        // Bei 5 und 6 bleibt es 42mm

        // NEU: Anlage aus Daten holen (neues Feld) oder Fallback
        const anlageText = data.anlage_text || '';

        // NEU: Wenn Original, dann "Original" statt Ersteller anzeigen
        const erstellerText = (data.original == 1) ? "Original" : data.ersteller;

        // Default Werte für Footer falls nicht übergeben
        const fVert4 = (footerData && footerData.verteiler4) ? footerData.verteiler4 : '';
        const fVert5 = (footerData && footerData.verteiler5) ? footerData.verteiler5 : '';
        const fSafeNr = (footerData && footerData.safeNr) ? footerData.safeNr : '';

        let printHTML = '';
        
        for (let seite = 0; seite < anzahlSeiten; seite++) {
            const pageBreak = (seite < anzahlSeiten - 1) ? 'page-break' : '';
            
            // NEU: Footer nur auf Seite 1 anzeigen?
            const showFullFooter = (seite === 0);

            printHTML += `
            <div class="print-page ${pageBreak}">
                <div class="header">
                    <div class="header-left">
                        <div>${escapeHtml(erstellerText)}</div>
                        <div>Seite ${seite + 1} / ${anzahlSeiten}</div>
                        <div>Nr: ${escapeHtml(data.saw_nr)}</div>
                    </div>
                    <!-- WICHTIG: Kein Whitespace/Newline im Tag, da pre-wrap aktiv ist! Sonst rutscht Text runter -->
                    <div class="header-center">${escapeHtml(data.kopf)}</div>
                    <div class="header-right">
                        <!-- margin-left:10mm schiebt den Text 1cm nach rechts vom Rand weg -->
                        <span style="margin-left: 10mm;">${escapeHtml(anlageText)}</span>
                        <span>${escapeHtml(datumString)}</span>
                    </div>
                </div>
                
                <table class="saw-table">
                    <thead>
                        <tr>
                            <th class="nr-col">Nr.</th>`;
            
            // Nur aktive Spalten anzeigen
            activeCols.forEach(colIndex => {
                const anlBez = (anlagen[colIndex] && anlagen[colIndex].bez) ? anlagen[colIndex].bez : '';
                printHTML += `<th>${escapeHtml(anlBez)}</th>`;
            });
            
            printHTML += `</tr></thead><tbody>`;
            
            const startSchritt = seite * schritteProSeite;
            for (let i = 0; i < schritteProSeite; i++) {
                const schrittIdx = startSchritt + i;
                printHTML += `<tr><td class="nr-cell">`;
                printHTML += (schrittIdx < anzahlSchritte) ? (schrittIdx + 1) : '';
                printHTML += `</td>`;
                
                activeCols.forEach(colIndex => {
                    const schemaCol = colIndex + 1; // 1-based index für Daten
                    printHTML += `<td>`;
                    if (schrittIdx < anzahlSchritte && schritte[schrittIdx].ecol == schemaCol) {
                        printHTML += `<pre>${escapeHtml(schritte[schrittIdx].etext)}</pre>`;
                    }
                    printHTML += `</td>`;
                });

                printHTML += `</tr>`;
            }
            
            printHTML += `</tbody></table>`;
            
            // Logic für Footer Anzeige
            if (showFullFooter) {
                printHTML += `
                <div class="footer">
                    <div class="footer-title">Verteiler:</div>
                    <div class="footer-items">
                        <div class="footer-col">
                            <div class="footer-item">1. Mittelwerk</div>
                            <div class="footer-item">2. Schichtmeister EM/HS</div>
                            <div class="footer-item">3. Original KK</div>
                        </div>
                        <div class="footer-col">
                            <div class="footer-item">4. <span class="footer-line">${escapeHtml(fVert4)}</span></div>
                            <div class="footer-item" style="margin-top: 6mm;">5. <span class="footer-line">${escapeHtml(fVert5)}</span></div>
                        </div>
                        <div class="footer-col" style="margin-left: auto; justify-content: flex-end;">
                            <div class="footer-item">DH-SAFE Nr: <span class="footer-line-short">${escapeHtml(fSafeNr)}</span></div>
                            <div class="footer-item" style="margin-top: 6mm;"><span style="visibility:hidden;">DH-SAFE Nr:</span> <span class="footer-line-short">&nbsp;</span></div>
                        </div>
                    </div>
                </div>`;
            } else {
                // Auf Folgeseiten kein Footer (oder minimaler Footer, hier leer gelassen laut Anforderung)
            }
            
            printHTML += `</div>`;
        }
        
        // Druckansicht in neuem Fenster öffnen
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Popup wurde blockiert. Bitte erlauben Sie Popups für diese Seite.');
            return;
        }

        printWindow.document.write(`
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>SAW ${escapeHtml(data.saw_nr)} - Druckansicht</title>
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        
        html, body {
            font-family: Verdana, Geneva, sans-serif; /* Breitere Schriftart */
            font-size: 9.5pt; /* Leicht angepasst für Lesbarkeit bei Verdana */
            margin: 0;
            padding: 0;
        }
        
        @media print {
            @page { 
                size: A4 landscape; 
                margin-top: 0mm;   /* Rand auf 0, wir steuern Abstand im Body */
                margin-bottom: 0mm;
                margin-left: 10mm;
            }
            
            html, body {
                width: 297mm;
                height: 210mm;
            }
            
            .page-break { 
                page-break-after: always;
                break-after: always;
            }
            
            .no-print { 
                display: none !important; 
            }
            
            .print-page {
                width: 100%;
                height: 210mm; /* Auf volle 210mm erhöht um den unteren Bereich komplett zu nutzen */
                padding-top: 5mm; /* Oben Platz lassen (simulierter Rand) */
                padding-left: 0;
                padding-right: 0;
                position: relative;
            }
        }
        
        @media screen {
            body { 
                background: #f5f5f5;
                padding: 10px;
            }
            
            .print-page { 
                background: white;
                width: 297mm;
                height: 210mm;
                margin: 0 auto 10px;
                padding-top: 8mm; /* Im Screen etwas mehr padding */
                padding-bottom: 8mm;
                padding-left: 20mm;
                padding-right: 5mm; 
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
                position: relative;
                page-break-after: always;
            }
        }
        
        .header { 
            display: grid;
            /* Layout angepasst: Rechte Spalte deutlich breiter für Abstand */
            grid-template-columns: 40mm 1fr 110mm; 
            gap: 5mm;
            margin-bottom: 0mm; 
            font-size: 8pt; 
            height: 20mm;
            align-items: start;
        }
        
        .header-left { 
            line-height: 1.2;
        }
        
        .header-center { 
            text-align: left;
            white-space: pre-wrap;
            overflow: hidden;
            font-weight: normal; 
            line-height: 1.1;
        }
        
        .header-right { 
            /* Flexbox für maximalen Abstand zwischen Anlage und Datum */
            display: flex;
            justify-content: space-between;
            text-align: right; /* Fallback */
            white-space: nowrap;
        }
        
        .saw-table { 
            width: auto;
            border-collapse: collapse;
            table-layout: fixed; /* Wichtig für feste Breiten */
            margin-top: 0mm; 
        }
        
        /* Dynamische Spaltenbreite */
        .saw-table th:not(.nr-col),
        .saw-table td:not(.nr-cell) {
            width: ${colWidth};
        }

        .saw-table th { 
            background-color: #dcdcf0;
            border: 1.5px solid #000 !important;
            padding: 1mm;
            text-align: center;
            font-weight: bold;
            font-size: 8pt;
            height: 8mm;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .saw-table th.nr-col,
        .saw-table td.nr-cell { 
            width: 10mm !important;
            min-width: 10mm;
            max-width: 10mm;
        }
        
        .saw-table td { 
            border: 1.5px solid #000 !important;
            padding: 1.5mm;
            vertical-align: top;
            font-size: 7.5pt;
            height: 38mm;          /* Höhe beibehalten wie gewünscht */
            max-height: 38mm;      
            overflow: hidden;      /* Überlauf abschneiden */
        }
        
        .saw-table td.nr-cell { 
            text-align: center;
            font-weight: bold;
            font-size: 8pt;
            vertical-align: middle;
        }
        
        .saw-table tbody tr {
            border: 1.5px solid #000 !important;
            height: 38mm; /* Zeilenhöhe beibehalten */
        }
        
        .saw-table thead tr,
        .saw-table tbody tr,
        .saw-table thead th,
        .saw-table tbody td {
            border-width: 1.5px !important;
            border-style: solid !important;
            border-color: #000 !important;
        }
        
        .saw-table td pre { 
            margin: 0;
            padding: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            word-break: break-all; 
            font-family: Verdana, Geneva, sans-serif; /* Breitere Schriftart auch hier */
            font-size: ${dynamicFontSize};
            line-height: 1.15; /* FIX: Zeilenhöhe reduziert (war 1.2) */
            overflow: hidden;
            max-height: 100%;
        }
        
        .footer { 
            position: absolute;
            bottom: 0mm; /* Ganz unten im Container positionieren */
            left: 20mm; 
            right: 5mm;
            font-size: 10pt; /* Schrift leicht verkleinert für Kompaktheit */
            padding-top: 0mm;
            min-height: 22mm; /* Platz für zweite DH-SAFE Zeile sicherstellen */
        }
        
        .footer-title { 
            font-weight: bold;
            margin-bottom: 1mm;
        }
        
        .footer-items { 
            display: flex;
            gap: 15mm;
            margin-bottom: 0mm;
            align-items: flex-start;
        }
        
        .footer-col {
            display: flex;
            flex-direction: column;
            /* Abstand minimiert */
            gap: 1mm; 
        }
        
        .footer-item { 
            line-height: 1.2;
            white-space: nowrap;
        }
        
        .footer-line { 
            display: inline-block;
            border-bottom: 1.5px solid #000;
            width: 70mm;
            margin-left: 2mm;
            vertical-align: bottom;
        }
        
        .footer-line-short { 
            display: inline-block;
            border-bottom: 1.5px solid #000;
            width: 40mm;
            margin-left: 2mm;
            vertical-align: bottom;
        }
        
        /* .footer-bottom entfernt, da integriert */
        
        .no-print { 
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: white;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .btn-print { 
            background: #2ecc71;
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 12pt;
            border-radius: 4px;
            cursor: pointer;
            margin: 0 5px;
        }
        
        .btn-print:hover { 
            background: #27ae60;
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button class="btn-print" onclick="window.print()">🖨️ Drucken</button>
        <button class="btn-print" onclick="window.close()" style="background:#95a5a6;">✖ Schließen</button>
    </div>
    ${printHTML}
</body>
</html>`);
        printWindow.document.close();
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    window.printSaw = function(nr, datum) {
        // Alte Funktion für Kompatibilität - lädt Detail und druckt dann
        fetch(`api.php?action=get_detail&nr=${nr}`)
            .then(res => res.json())
            .then(data => {
                // Auch hier ohne Alert, wenn Datum fehlt
                let datumISO = "";
                if (datum) {
                    const datumParts = datum.split('.');
                    if(datumParts.length === 3) {
                         datumISO = `${datumParts[2]}-${datumParts[1]}-${datumParts[0]}`;
                    }
                }
                printFromDetailView(data, datumISO);
            });
    }
    
    window.printCurrentSaw = function() {
        if(currentSaw && currentSaw.saw_nr) {
            // Live-Update: Text aus Eingabefeld holen vor dem Drucken
            const inpAnlageText = document.getElementById('inpAnlageText');
            if(inpAnlageText) {
                currentSaw.anlage_text = inpAnlageText.value;
            }
            
            const heute = new Date().toISOString().split('T')[0];
            // Footer leer lassen bei Schnelldruck aus Editor
            printFromDetailView(currentSaw, heute, null);
        }
    }

    // --- MANAGE LOGIC ---
    let manageData = null;

    function loadManageData() {
        // Event Listeners für Suche initialisieren (sicherstellen dass sie nur 1x gebunden sind oder idempotenz)
        const anlSearch = document.getElementById('manAnlSearch');
        if (anlSearch) anlSearch.oninput = () => renderManageLists(true);
        
        const zelSearch = document.getElementById('manZelSearch');
        if (zelSearch) zelSearch.oninput = () => renderManageLists(false);

        const txtSearch = document.getElementById('manTxtSearch');
        if (txtSearch) txtSearch.oninput = () => renderManageLists(false, true);

        const zelFilter = document.getElementById('manFilterZellen'); // FIX: Variable definieren
        if (zelFilter) zelFilter.onchange = () => renderManageLists(false);

        fetch('api.php?action=get_meta')
            .then(res => res.json())
            .then(data => {
                manageData = data;
                
                // (Alte Dropdown Logik entfernt) ...

                // Listen rendern (Anlagen + Texte initial)
                renderManageLists(true, true);

                // Events
                const anlSel = document.getElementById('manAnlSel');
                const zelSel = document.getElementById('manZelSel');
                const txtSel = document.getElementById('manTxtSel');

                anlSel.onchange = () => {
                    const opt = anlSel.options[anlSel.selectedIndex];
                    if(!opt) return;
                    document.getElementById('manAnlBez').value = opt.text;
                    document.getElementById('manAnlBez').dataset.id = opt.value;
                    
                    // Filterung der Zellen aktualisieren
                    const chk = document.getElementById('manFilterZellen');
                    if(chk && chk.checked) renderManageLists(false);
                };

                zelSel.onchange = () => {
                    const id = zelSel.value;
                    const z = data.zellen.find(x => x.zelID == id);
                    if(z) {
                        document.getElementById('manZelNr').value = z.zelNr;
                        document.getElementById('manZelBez').value = z.zelBez;
                        document.getElementById('manZelNr').dataset.id = z.zelID;
                        
                        // NEU: Verknüpfungen anzeigen
                        renderGlobalCellLinksFor(z.zelID);
                    }
                };

                // NEU: Textbaustein Auswahl
                if (txtSel) {
                    txtSel.onchange = () => {
                         const opt = txtSel.options[txtSel.selectedIndex];
                         if(!opt) return;
                         document.getElementById('manTxtContent').value = opt.text;
                         document.getElementById('manTxtContent').dataset.id = opt
                    };
                }
            });
    }

    function renderManageLists(renderAnlagen = true, renderTexts = false) {
        if(!manageData) return;
        
        const anlSearch = document.getElementById('manAnlSearch') ? document.getElementById('manAnlSearch').value.toLowerCase() : '';
        const zelSearch = document.getElementById('manZelSearch') ? document.getElementById('manZelSearch').value.toLowerCase() : '';
        const txtSearch = document.getElementById('manTxtSearch') ? document.getElementById('manTxtSearch').value.toLowerCase() : '';
        const filterZellen = document.getElementById('manFilterZellen') ? document.getElementById('manFilterZellen').checked : false;
        const selectedAnlId = document.getElementById('manAnlBez').dataset.id;

        // 1. Anlagen Liste
        if(renderAnlagen) {
            const anlSel = document.getElementById('manAnlSel');
            const curVal = anlSel.value;
            anlSel.innerHTML = '';
            
            const filteredAnl = (manageData.anlagen || []).filter(a => a.bez.toLowerCase().includes(anlSearch));
            filteredAnl.forEach(a => {
                anlSel.innerHTML += `<option value="${a.anlID}">${a.bez}</option>`;
            });
            anlSel.value = curVal;
        }

        // 2. Zellen Liste (bleibt gleich)
        const zelSel = document.getElementById('manZelSel');
        const curZel = zelSel.value;
        zelSel.innerHTML = '';
        
        let filteredZellen = (manageData.zellen || []);

        // Filter: Suche
        if(zelSearch) {
            filteredZellen = filteredZellen.filter(z => 
                (z.zelNr || '').toLowerCase().includes(zelSearch) || 
                (z.zelBez || '').toLowerCase().includes(zelSearch)
            );
        }

        // Filter: Zugehörigkeit
        if(filterZellen && selectedAnlId && selectedAnlId != 0) {
            filteredZellen = filteredZellen.filter(z => z.zelAnl == selectedAnlId);
        }

        // Sortierung
        filteredZellen.sort((a, b) => (a.zelNr || '').localeCompare(b.zelNr || '', undefined, { numeric: true, sensitivity: 'base' }));

        filteredZellen.forEach(z => {
            zelSel.innerHTML += `<option value="${z.zelID}">[${z.zelNr}] ${z.zelBez}</option>`;
        });
        
        zelSel.value = curZel;

        // 3. Textbausteine Liste
        if (renderTexts) {
            const txtSel = document.getElementById('manTxtSel');
            if(txtSel) {
                const curVal = txtSel.value;
                txtSel.innerHTML = '';
                
                let sourceTexts = (manageData.textbausteine || []);
                // Falls server keine Textbausteine zurückgab, nutzen wir die lokalen (simuliert)
                if (sourceTexts.length === 0 && textbausteine.length > 0) {
                     // Fake objects
                     sourceTexts = textbausteine.map((t, idx) => ({ id: "temp_"+idx, inhalt: t }));
                }

                const filteredTxt = sourceTexts.filter(t => t.inhalt.toLowerCase().includes(txtSearch));
                filteredTxt.sort((a,b) => a.inhalt.localeCompare(b.inhalt));
                
                filteredTxt.forEach(t => {
                   const id = t.id || t.inhalt; // Fallback
                   txtSel.innerHTML += `<option value="${id}">${t.inhalt}</option>`;
                });
                txtSel.value = curVal;
            }
        }
    }
    
    // NEU: Funktionen für globale Zellenverknüpfung (Verwaltung)
    window.renderGlobalCellLinksFor = function(currentZelID) {
        currentZelID = parseInt(currentZelID);
        const container = document.getElementById('manLinkedCellsList');
        const selAnlage = document.getElementById('manLinkAnlSel');
        const selCandidate = document.getElementById('manLinkCandidateSel');
        
        if(!container || !selCandidate || !selAnlage) return;

        container.innerHTML = '';
        
        // Reset selections
        selAnlage.innerHTML = '<option value="0">-- 1. Anlage wählen --</option>';
        selCandidate.innerHTML = '<option value="">-- 2. Zelle wählen --</option>';

        // 1. Bestehende Links Rendern
        const linkedIDs = [];
        globalCellLinks.forEach(link => {
            let partnerID = 0;
            if (parseInt(link.zelID_1) === currentZelID) partnerID = parseInt(link.zelID_2);
            else if (parseInt(link.zelID_2) === currentZelID) partnerID = parseInt(link.zelID_1);

            if (partnerID > 0) {
                linkedIDs.push(partnerID);
                const pObj = allZellen.find(z => z.zelID == partnerID);
                const label = pObj ? `[${pObj.zelNr}] ${pObj.zelBez}` : `ID ${partnerID}`;
                
                const chip = document.createElement('div');
                chip.style.cssText = "display:inline-block; background:#e1ecf4; color:#2c3e50; padding:2px 8px; margin:2px; border-radius:12px; font-size:0.85em; border:1px solid #b3d7ff;";
                
                chip.innerHTML = `<span>${label}</span> <span style="cursor:pointer; color:red; font-weight:bold; margin-left:4px;" class="del-link-btn">×</span>`;
                chip.querySelector('.del-link-btn').onclick = () => removeGlobalLink(currentZelID, partnerID);
                
                container.appendChild(chip);
            }
        });
        
        if (linkedIDs.length === 0) {
             container.innerHTML = '<span style="color:#999; font-style:italic;">Keine Verknüpfungen</span>';
        }

        // 2. Anlagen-Dropdown füllen
        allAnlagen.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.anlID;
            opt.text = a.bez;
            selAnlage.appendChild(opt);
        });

        // Event Listener für Anlagen-Auswahl
        // Wir clonen den Node um alte Event-Listener zu entfernen (einfacher Trick)
        const newSelAnlage = selAnlage.cloneNode(true);
        selAnlage.parentNode.replaceChild(newSelAnlage, selAnlage);
        
        newSelAnlage.addEventListener('change', () => {
             const selectedAnlID = parseInt(newSelAnlage.value);
             selCandidate.innerHTML = '<option value="">-- 2. Zelle wählen --</option>';
             

             if (selectedAnlID > 0) {
                 // Zellen dieser Anlage holen, die noch nicht verknüpft sind und nicht currentZelID sind
                 const candidates = allZellen
                    .filter(z => parseInt(z.zelAnl) === selectedAnlID && z.zelID != currentZelID && !linkedIDs.includes(parseInt(z.zelID)))
                    .sort((a,b) => (a.zelNr||'').localeCompare(b.zelNr||'', undefined, {numeric:true}));
                
                 candidates.forEach(z => {
                     const opt = document.createElement('option');
                     opt.value = z.zelID;
                     opt.text = `[${z.zelNr}] ${z.zelBez}`;
                     selCandidate.appendChild(opt);
                 });
                 


                 if (candidates.length === 0) {
                     const opt = document.createElement('option');
                     opt.text = "(Keine verfügbaren Zellen)";
                     opt.disabled = true;
                     selCandidate.appendChild(opt);
                 }
             }
        });
    }

    window.addGlobalCellLink = function() {
        const id1 = document.getElementById('manZelNr').dataset.id; // Aktuell ausgewählte Zelle
        const id2 = document.getElementById('manLinkCandidateSel').value;
        
        if (!id1 || id1 == 0) { alert("Bitte erst eine Zelle aus der Liste auswählen."); return; }
        if (!id2 || id2 == 0) { return; } // Nichts ausgewählt

        fetch('api.php', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'save_cell_link', z1: id1, z2: id2}) 
        })
        .then(res => res.json())
        .then(res => {
             if(res.success) {
                 // Metadaten neu laden damit globalCellLinks aktuell ist
                 loadMetaPromise().then(() => {
                     // Liste aktualisieren
                     renderGlobalCellLinksFor(id1);
                     showNotification("Verknüpfung gespeichert", "success");
                 });
             } else {
                 showNotification("Fehler: " + res.error, "error");
             }
        });
    }

    window.removeGlobalLink = function(id1, id2) {
        if(!confirm("Verknüpfung löschen?")) return;
        
        fetch('api.php', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'delete_cell_link', z1: id1, z2: id2}) 
        })
        .then(res => res.json())
        .then(res => {
             if(res.success) {
                 loadMetaPromise().then(() => {
                     renderGlobalCellLinksFor(id1);
                 });
             } else {
                 showNotification("Fehler: " + res.error, "error");
             }
        });
    }

    function loadMetaPromise() {
        return fetch('api.php?action=get_meta')
            .then(res => res.json())
            .then(data => {
                 allZellen = data.zellen || [];
                 allAnlagen = data.anlagen || [];
                 globalCellLinks = data.links || [];
                 manageData = data;
            });
    }

    // --- TEXTBAUSTEINE FUNCTIONS ---
    
    window.addTextbausteinPrompt = function() {
        if (!currentUser || (currentUser.kannSAWBearbeitenPlus != 1 && currentUser.isAdmin != 1)) {
            showNotification("Keine Berechtigung zum Hinzufügen.", "error");
            return;
        }
        
        const txt = prompt("Neuer Textbaustein:");
        if (txt && txt.trim() !== '') {
             fetch('api.php', { 
                 method: 'POST', 
                 headers: {'Content-Type': 'application/json'},
                 body: JSON.stringify({action: 'save_textbaustein', id: 0, inhalt: txt}) 
             })
             .then(res => res.text()) // Erst als Text anfordern
             .then(text => {
                 try {
                     return JSON.parse(text); // Dann parsen
                 } catch(e) {
                     console.error("Server Response Invalid:", text);
                     throw new Error("Ungültige Serverantwort");
                 }
             })
             .then(res => {
                  if(res.success) {
                      loadManageData();
                      clearTextbausteinForm();
                      showNotification("Gespeichert", "success");
                  } else {
                      console.warn("API Error (save_textbaustein):", res);
                      showNotification("Fehler: " + (res.error || "Unbekannt"), "error");
                  }
             })
             .catch(err => {
                 console.error(err);
                 showNotification("Fehler: " + err.message, "error");
             });
        }
    }

    window.saveTextbaustein = function() {
        const id = document.getElementById('manTxtContent').dataset.id;
        const txt = document.getElementById('manTxtContent').value;
        if(!id) return;
        
        fetch('api.php', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'save_textbaustein', id: id, inhalt: txt}) 
        })
        .then(res => res.json())
        .then((res) => {
             if(res.success) {
                 loadManageData();
                 clearTextbausteinForm();
                 showNotification("Gespeichert", "success");
             } else {
                 showNotification("Fehler: " + res.error, "error");
             }
        })
        .catch(err => console.error(err));
    }
    
    window.deleteTextbaustein = function() {
        const id = document.getElementById('manTxtContent').dataset.id;
        if(!id) return;
        if(!confirm("Diesen Textbaustein wirklich löschen?")) return;
        
        fetch('api.php', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'delete_textbaustein', id: id}) 
        })
        .then(() => {
             loadManageData();
             clearTextbausteinForm();
             showNotification("Gelöscht", "success");
        });
    }
    
    window.clearTextbausteinForm = function() {
        const el = document.getElementById('manTxtContent');
        if(el) {
            el.value = '';
            el.dataset.id = 0;
        }
        const sel = document.getElementById('manTxtSel');
        if(sel) sel.selectedIndex = -1;
    }

    // --- PROMPT FUNCTIONS FOR ADDING ---
    window.addAnlagePrompt = function() {
        // Berechtigungsprüfung für Plus-Recht
        if (!currentUser || (currentUser.kannSAWBearbeitenPlus != 1 && currentUser.isAdmin != 1)) {
            showNotification("Keine Berechtigung zum Hinzufügen von Anlagen.", "error");
            return;
        }

        const bez = prompt("Bitte Bezeichnung für die neue Anlage eingeben:");
        if (bez && bez.trim() !== '') {
            // FIX: Nächste ID berechnen (da DB offenbar kein Auto-Increment hat)
            let nextAnlID = 1;
            // Fallback auf allAnlagen, falls manageData leer ist
            const sourceArray = (manageData && manageData.anlagen) ? manageData.anlagen : allAnlagen;

            if (sourceArray && sourceArray.length > 0) {
                 const maxID = sourceArray.reduce((max, p) => {
                     const val = parseInt(p.anlID) || 0;
                     return val > max ? val : max;
                 }, 0);
                 nextAnlID = maxID + 1;
            }

            fetch('api.php', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                // Wir senden anlID explizit mit. id:0 signalisiert "Neu"
                body: JSON.stringify({action: 'save_anlage', id: 0, anlID: nextAnlID, bez: bez}) 
            })
            .then(res => res.text()) 
            .then(text => { 
                console.log("Save Anlage Response:", text);
                try {
                     const json = JSON.parse(text);
                     if(json.error) {
                         showNotification("Fehler: " + json.error, "error");
                                                 return;
                     }
                } catch(e) {
                    // Wenn kein JSON, aber Text da ist, könnte es success sein oder PHP Fehler
                    if(text.includes("error") || text.includes("Exception")) {
                        alert("Server meldet Fehler: " + text.substring(0, 100));
                        return;
                    }
                }

                // UI Updates protected against triggering the catch block
                try {
                    loadManageData(); 
                    clearAnlageForm(); 
                    showNotification("Anlage erfolgreich erstellt", "success");
                } catch(uiErr) {
                    console.error("UI Update Error:", uiErr);
                    showNotification("Anlage gespeichert (UI Refresh Fehler)", "warning");
                }
            })
            .catch(err => {
                console.error(err);
                showNotification("Fehler beim Speichern der Anlage", "error");
            });
        }
    }

    window.addZellePrompt = function() {
         // Berechtigungsprüfung für Plus-Recht
         if (!currentUser || (currentUser.kannSAWBearbeitenPlus != 1 && currentUser.isAdmin != 1)) {
            showNotification("Keine Berechtigung zum Hinzufügen von Zellen.", "error");
            return;
        }
        
        // Versuchen, eine Anlage vorzuwählen
        let anlID = 0;
        
        // 1. Aus Filter-Kontext (wenn Filter aktiv und Anlage ausgewählt)
        if (document.getElementById('manFilterZellen').checked) {
             const selectedAnlage = document.getElementById('manAnlBez').dataset.id;
             if (selectedAnlage) anlID = selectedAnlage;
        }
        
        // 2. Fallback: Aus dem Formular unten
        if (anlID == 0) {
             const formAnlVal = document.getElementById('manAnlBez').dataset.id; // Fallback auf Auswahl links
             if (formAnlVal && formAnlVal != 0) anlID = formAnlVal;
        }

        if (anlID == 0) {
            alert("Bitte wählen Sie zuerst links eine Anlage aus, zu der die Zelle hinzugefügt werden soll.");
            return;
        }

        const nr = prompt("Bitte Zellen-Nummer eingeben (z.B. +A01):");
        if (!nr) return;
        
        const bez = prompt("Bitte Zellen-Bezeichnung eingeben:", "");
        if (bez === null) return; 

        // Berechnung nächste Zelle ID (analog zu Anlage)
        let nextZelID = 1;
        // Fallback auf allZellen
        const sourceZellen = (manageData && manageData.zellen) ? manageData.zellen : allZellen;

        if (sourceZellen && sourceZellen.length > 0) {
                const maxZelID = sourceZellen.reduce((max, z) => {
                    const val = parseInt(z.zelID) || 0;
                    return val > max ? val : max;
                }, 0);
                nextZelID = maxZelID + 1;
        }

        fetch('api.php', { 
            
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'save_zelle', 
                id: 0, 
                zelID: nextZelID, 
                nr: nr, 
                bez: bez, 
                anl: anlID, 
                masterAnl: 0, 
                masterZel: 0 
            }) 
        })
        .then(res => res.text())
        .then(text => { 
            console.log("Save Zelle Response:", text);
            try {
                     const json = JSON.parse(text);
                     if(json.error) {
                         showNotification("Fehler: " + json.error, "error");
                         return; 
                     }
            } catch(e) {
                console.warn("API Response JSON Parse Error (Ignored if success implied):", e);
            } 
            
            // UI Updates in safe block to preventing triggering the "Save Failed" catch
            try {
                loadManageData(); 
                if (typeof clearZelleForm === 'function') {
                    clearZelleForm();
                }
                showNotification("Zelle erfolgreich erstellt", "success");
            } catch(uiErr) {
                console.error("UI Update Error:", uiErr);
                // Saving was successful, just UI update failed
                showNotification("Zelle gespeichert (UI Refresh Fehler)", "warning");
            }
        })
        .catch(err => {
             console.error("Save Zelle Failed:", err);
             showNotification("Fehler beim Speichern der Zelle", "error");
        });
    }

    window.saveAnlage = function() {
        const id = document.getElementById('manAnlBez').dataset.id || 0;
        const bez = document.getElementById('manAnlBez').value;
        
        // FIX: ID Berechnung auch für Formular-Speicherung
        let anlID = 0;
        if(id == 0) {
            let nextAnlID = 1;
            const sourceArray = (manageData && manageData.anlagen) ? manageData.anlagen : allAnlagen;
            if (sourceArray && sourceArray.length > 0) {
                 const maxID = sourceArray.reduce((max, p) => {
                     const val = parseInt(p.anlID) || 0;
                     return val > max ? val : max;
                 }, 0);
                 nextAnlID = maxID + 1;
            }
            anlID = nextAnlID;
        }

        fetch('api.php', { method: 'POST', body: JSON.stringify({action: 'save_anlage', id: id, anlID: anlID, bez: bez}) })
        .then(res => res.text())
        .then(text => { 
            try {
                 const json = JSON.parse(text);
                 if(json.error) { showNotification("Fehler: " + json.error, "error"); return; }
            } catch(e) {}
            
            try {
                loadManageData(); 
                // Prüfen ob Funktion existiert bevor Aufruf
                if (typeof clearAnlageForm === 'function') clearAnlageForm(); 
                showNotification("Anlage gespeichert", "success");
            } catch(uiErr) {
                console.error(uiErr);
            }
        })
        .catch(err => {
            console.error(err);
            showNotification("Fehler beim Speichern", "error");
        });
    }

    window.deleteAnlage = function() {
        const id = document.getElementById('manAnlBez').dataset.id;
        const bez = document.getElementById('manAnlBez').value;
        if(!id) return;
        if(!confirm(`Möchten Sie die Anlage "${bez}" wirklich löschen?`)) return;
        
        fetch('api.php', { method: 'POST', body: JSON.stringify({action: 'delete_anlage', id: id}) })
        .then(res => res.text())
        .then(text => { 
            loadManageData(); 
            if (typeof clearAnlageForm === 'function') clearAnlageForm(); 
            showNotification("Anlage gelöscht", "success");
        })
        .catch(err => {
            console.error(err);
            showNotification("Fehler beim Löschen", "error");
        });
    }

    // FIX: Fehlende Funktion 'clearAnlageForm' hinzufügen
    window.clearAnlageForm = function() {
        const inp = document.getElementById('manAnlBez');
        if(inp) {
            inp.value = '';
            inp.dataset.id = 0;
            inp.focus();
        }
        
        const sel = document.getElementById('manAnlSel');
        if(sel) sel.selectedIndex = -1;
        
        // Wenn Filter an, Zellenliste resetten
        const chk = document.getElementById('manFilterZellen');
        if(chk && chk.checked) renderManageLists(false);
    }

    window.saveZelle = function() {
        const id = document.getElementById('manZelNr').dataset.id || 0;
        const nr = document.getElementById('manZelNr').value;
        const bez = document.getElementById('manZelBez').value;
        
        // Anlage nehmen wir jetzt von der linken Auswahl (Kontext)
        const anl = document.getElementById('manAnlBez').dataset.id || 0;
        if(anl == 0) {
            showNotification("Bitte links eine Anlage auswählen!", "error");
            return;
        }

        const masterZel = 0; // Dropdown entfernt
        
        // Find masterAnl from masterZel - obsolet da masterZel 0
        let masterAnl = 0;
        
        // FIX: ID Berechnung auch für Formular-Speicherung
        let zelID = 0;
        if(id == 0) {
            let nextZelID = 1;
            const sourceZellen = (manageData && manageData.zellen) ? manageData.zellen : allZellen;
            if (sourceZellen && sourceZellen.length > 0) {
                 const maxZelID = sourceZellen.reduce((max, z) => {
                     const val = parseInt(z.zelID) || 0;
                     return val > max ? val : max;
                 }, 0);
                 nextZelID = maxZelID + 1;
            }
            zelID = nextZelID;
        }
        
        fetch('api.php', { method: 'POST', body: JSON.stringify({
            action: 'save_zelle', 
            id: id, 
            zelID: zelID, 
            nr: nr, 
            bez: bez, 
            anl: anl, 
            masterAnl: masterAnl, 
            masterZel: masterZel
        }) })
        .then(() => { 
            loadManageData(); 
            clearZelleForm(); 
            showNotification("Zelle gespeichert", "success");
        });
    }

    window.deleteZelle = function() {
        const id = document.getElementById('manZelNr').dataset.id;
        const nr = document.getElementById('manZelNr').value;
        const bez = document.getElementById('manZelBez').value;
        
        if(!id) return;
        if(!confirm(`Möchten Sie die Zelle "[${nr}] ${bez}" wirklich löschen?`)) return;
        
        fetch('api.php', { method: 'POST', body: JSON.stringify({action: 'delete_zelle', id: id}) })
        .then(() => { 
 
            loadManageData(); 
            clearZelleForm(); 
            showNotification("Zelle gelöscht", "success");
        });
    }

    // FIX: Fehlende Funktion 'clearZelleForm' hinzufügen
    window.clearZelleForm = function() {
        document.getElementById('manZelNr').value = '';
        document.getElementById('manZelNr').dataset.id = 0;
        document.getElementById('manZelBez').value = '';
        // Dropdowns entfernt -> keine Resets nötig
        
        const sel = document.getElementById('manZelSel');
        if(sel) sel.selectedIndex = -1;
        
        document.getElementById('manZelNr').focus();
    }

    // --- NOTIFICATION UTILS (Überarbeitet) ---
    window.showNotification = function(text, type = 'success') {
        const area = document.getElementById('notification-area');
        if(!area) return;
        
        const el = document.createElement('div');
        el.className = `notification ${type}`;
        // Text node safer for XSS, but innerText is okay here
        el.innerText = text;
        
        area.appendChild(el);
        
        // Nach 4 Sekunden entfernen
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(100%)'; // Slide out rechts
            setTimeout(() => {
                if(el.parentNode) el.remove();
            }, 300);
        }, 4000);
    }

    // Helpers
    function autoResize(textarea) {
        const maxHeight = 200; // FIX: Variable definieren (ca. 10 Zeilen)
        textarea.style.height = 'auto'; // Reset height
        // Limit to approx 10 lines (assuming line-height ~18-20px)
        if (textarea.scrollHeight > maxHeight) {
             textarea.style.height = maxHeight + 'px';
             textarea.style.overflowY = "auto";
        } else {
             textarea.style.height = (textarea.scrollHeight + 2) + 'px';
             textarea.style.overflowY = "hidden";
        }
    }
    function limitLines(textarea, maxLines, maxChars = null) {
        let lines = textarea.value.split('\n');
        
        // Zeichen pro Zeile begrenzen falls Parameter gesetzt
        if (maxChars !== null) {
            lines = lines.map(line => {
                return line.length > maxChars ? line.substring(0, maxChars) : line;
            });
        }


        if (lines.length > maxLines) lines = lines.slice(0, maxLines); // Zeilenanzahl begrenzen
        
        const newValue = lines.join('\n');
        if (textarea.value !== newValue) {
            textarea.value = newValue;
        }
    }

    // --- EDITOR FUNCTIONS ---

    function populateEditor() {
        if(!currentSaw) {
            console.error("populateEditor Fehler: currentSaw ist leer.");
            return;
        }

        // --- INIT DATA CORRECTION ---
        if (!Array.isArray(currentSaw.anlagen) || currentSaw.anlagen.length === 0) {
            currentSaw.anlagen = [];
        }
        for(let i=0; i<MAX_COLS; i++) {
             if(!currentSaw.anlagen[i]) currentSaw.anlagen[i] = {bez:'', nr:0};
        }

        if (!Array.isArray(currentSaw.schritte)) {
            currentSaw.schritte = [];
        }
        
        // REMOVED: linked_zellen logic completely from here
        // The relationship is now purely metadata check, not stored in the SAW object anymore.

        // NEU: Initialisiere linked_anlagen Array
        if (!currentSaw.linked_anlagen) {
            currentSaw.linked_anlagen = [];
        }
        
        // ROBUSTE BEFÜLLUNG ANLAGEN:
        // 1. Aus linked_anlagen (API) -> OK
        // 2. Wenn leer -> Aus 'anlage_text' versuchen
        if (currentSaw.linked_anlagen.length === 0 && currentSaw.anlage_text) {
            const found = allAnlagen.find(a => a.bez === currentSaw.anlage_text);
            if (found) {
                currentSaw.linked_anlagen.push({ anlID: found.anlID, bez: found.bez });
            }
        }
        
        // 3. Wenn immer noch leer -> Versuch über die verknüpften Zellen
        if (currentSaw.linked_anlagen.length === 0 && currentSaw.linked_zellen.length > 0) {
             // Wir sammeln alle Anlagen-IDs der verknüpften Zellen
             const relevantAnlagenIDs = new Set();
             currentSaw.linked_zellen.forEach(lz => {
                 const fullZelle = allZellen.find(az => az.zelID == lz.zelID);
                 if (fullZelle && fullZelle.zelAnl) relevantAnlagenIDs.add(fullZelle.zelAnl);
             });
             
             relevantAnlagenIDs.forEach(anlID => {
                 const a = allAnlagen.find(x => x.anlID == anlID);
                 if (a) {
                     currentSaw.linked_anlagen.push({ anlID: a.anlID, bez: a.bez });
                 }
             });
        }
        // --- END INIT DATA CORRECTION ---
        
        const inpSawNr = document.getElementById('inpSawNr');
        if(inpSawNr) inpSawNr.value = currentSaw.saw_nr || '';
        
        // FIX: Benutzerfeld abgrenzen, sperren und automatisch füllen
        const inpUser = document.getElementById('inpUser');
        if(inpUser) {
            if (currentUser && currentUser.name) {
                inpUser.value = currentUser.name;
            } else {
                inpUser.value = currentSaw.ersteller || '';
            }
            // Feld immer sperren, damit es nicht manipuliert werden kann
            inpUser.readOnly = true;
            inpUser.style.backgroundColor = "#e9ecef"; // Grau hinterlegt für "Disabled" Look
            inpUser.title = "Benutzer wird automatisch gesetzt";
        }

        // WIEDERHERGESTELLT: Zelle anzeigen (Read-Only)
        const inpZelle = document.getElementById('inpCurrentZelle');
        if (inpZelle) {
            let zelleText = "Unbekannt";
            if (currentSaw.zellen_id) {
                const z = allZellen.find(x => x.zelID == currentSaw.zellen_id);
                if (z) {
                    zelleText = `[${z.zelNr}] ${z.zelBez}`;
                }
            }
            inpZelle.value = zelleText;
        }

        // NEU: Anlagen Liste rendern
        renderEditorAnlagenList();
        
        // Anlage Feld (Text-Input zur Kompatibilität versteckt, aber füllen)
        const inpAnlageText = document.getElementById('inpAnlageText');
        if(inpAnlageText) {
            
            // AUTOFILL LOGIC: Wenn Feld leer ist, versuche Anlage über die Zelle zu finden
            if ((!currentSaw.anlage_text || currentSaw.anlage_text.trim() === '') && currentSaw.zellen_id) {
                const zVal = parseInt(currentSaw.zellen_id);
                // Finde Zelle in Stammdaten
                const foundZelle = allZellen.find(z => parseInt(z.zelID) === zVal);
                if (foundZelle) {
                     // Finde zugehörige Anlage
                     const anlVal = parseInt(foundZelle.zelAnl);
                     const foundAnl = allAnlagen.find(a => parseInt(a.anlID) === anlVal);
                     if (foundAnl) {
                         currentSaw.anlage_text = foundAnl.bez;
                     }
                }
            }

            inpAnlageText.value = currentSaw.anlage_text || '';
            // Autocomplete Setup für Anlagen-Namen
            const anlagenNames = allAnlagen.map(a => a.bez);
            setupAutocomplete(inpAnlageText, anlagenNames);
            
            // Button für Dropdown
            const btnPick = document.getElementById('btnPickAnlage');
            if(btnPick) {
                // Event Listener bereinigen (mit cloneNode trick) um mehrfach-binding zu verhindern
                const newBtn = btnPick.cloneNode(true);
                btnPick.parentNode.replaceChild(newBtn, btnPick);
                
                newBtn.onclick = function(e) {
                    e.stopPropagation(); // WICHTIG: Verhindert Schließen durch document-Klick
                    // Liste manuell öffnen mit ALLEN Optionen
                    openFullAutocomplete(inpAnlageText, anlagenNames);
                };
            }
        }

        const inpKopf = document.getElementById('inpKopf');
        if(inpKopf) {
            inpKopf.value = currentSaw.kopf || '';
            autoResize(inpKopf);
        }
        
        // Original Checkbox - Nur mit Plus Recht änderbar
        const chkOriginal = document.getElementById('chkOriginal');
        if (chkOriginal) {
            chkOriginal.checked = (currentSaw.original == 1);
            
            if (currentUser && (currentUser.kannSAWBearbeitenPlus == 1 || currentUser.isAdmin == 1)) {
                chkOriginal.disabled = false;
                chkOriginal.parentElement.title = "";
            } else {
                chkOriginal.disabled = true;
                chkOriginal.parentElement.title = "Nur mit erweiterten Rechten änderbar";
            }
        }
        
        // LÖSCHEN BUTTON LOGIK
        const btnDel = document.getElementById('btnDeleteSaw');
        if(btnDel) {
            // Logik: Button anzeigen, wenn...
            // 1. Es sich um eine existierende SAW handelt (datum ist gesetzt)
            // 2. Der User eingeloggt ist UND (Admin ODER Bearbeiten-Recht)
            const isExisting = currentSaw.datum && currentSaw.datum !== '';
            const hasRight = currentUser && (currentUser.isAdmin == 1 || currentUser.kannSAWBearbeitenPlus == 1);

            if (isExisting && hasRight) {
                // Wichtig: 'inline-block' oder 'block' erzwingen, da im HTML 'display:none' steht
                btnDel.style.display = 'inline-block'; 
                // Sicherstellen, dass er nicht disabled ist
                btnDel.disabled = false; 
                btnDel.innerText = "Löschen";
            } else {
                btnDel.style.display = 'none';
            }
        }

        // Init Data Arrays
        if (!currentSaw.anlagen) currentSaw.anlagen = [];
        for(let i=0; i<MAX_COLS; i++) {
             if(!currentSaw.anlagen[i]) currentSaw.anlagen[i] = {bez:'', nr:0};
        }
        
        // Prepare list of Anlage names for autocomplete
        const anlagenNames = allAnlagen.map(a => a.bez);

        // 1. RENDER HEADER INPUTS (Above Table)
        const colContainer = document.getElementById('colHeaderContainer');
        colContainer.innerHTML = '';

        // Spacer for Number Column
        colContainer.appendChild(createDivCls('col-spacer', ''));

        for(let i=0; i<MAX_COLS; i++) {
            const val = currentSaw.anlagen[i].bez || '';
            const wrap = createDivCls('col-header-item', '');
            
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'inp-col-header';
            inp.value = val;
            inp.placeholder = `Anlage ${i+1}`; 
            inp.id = `header-anl-${i}`;
            
            // Sync Input with Table Header & Data Model
            inp.oninput = (e) => {
                const newVal = e.target.value;
                
                // Modell direkt aktualisieren (statt updateColHeader Fehler)
                if(currentSaw && currentSaw.anlagen) {
                     if(!currentSaw.anlagen[i]) currentSaw.anlagen[i] = {bez:'', nr:0};
                     currentSaw.anlagen[i].bez = newVal;
                }
                
                const th = document.getElementById(`th-col-${i}`);
                if(th) {
                    th.innerText = newVal.trim() !== '' ? newVal : `Spalte ${i+1}`;
                }
            };
            
            // Activate Autocomplete for Header
            setupAutocomplete(inp, anlagenNames);
            
            wrap.appendChild(inp);
            colContainer.appendChild(wrap); // Grid Column
        }
        
        // Spacer for Action Column
        colContainer.appendChild(createDivCls('col-spacer', ''));


        // 2. RENDER TABLE HEADERS (Visual only)
        const thead = document.getElementById('stepTableHead');
        let headerHTML = '<tr><th class="col-num-header">#</th>'; 
        for(let i=0; i<MAX_COLS; i++) {
            // Initial Label: from Data or Default "Spalte X"
            const currentLabel = currentSaw.anlagen[i].bez || `Spalte ${i+1}`;
            headerHTML += `<th id="th-col-${i}">${currentLabel}</th>`;
        }
        // Hier Text von ✖ auf Aktion geändert
        headerHTML += '<th class="col-action-header">Aktion</th></tr>'; 
        thead.innerHTML = headerHTML;


        // 3. RENDER BODY
        const tbody = document.getElementById('stepTableBody');
        tbody.innerHTML = '';
        
        const steps = currentSaw.schritte || [];
        // Empty state or load rows
        if (steps.length === 0) {
            addEditorRow();
        } else {
            steps.forEach(step => addEditorRow(step));
        }

        initializeDragAndDrop();
    }

    function createDivCls(cls, html) {
        const d = document.createElement('div');
        d.className = cls;
        d.innerHTML = html;
        return d;
    }

    // NEU: Global verfügbar machen für HTML onclicks und interne Aufrufe
    window.renderEditorAnlagenList = function() {
        const container = document.getElementById('editorAnlagenList');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!currentSaw.linked_anlagen || currentSaw.linked_anlagen.length === 0) {
            container.innerHTML = '<span style="color: #999; font-style: italic; font-size: 0.9em; padding: 2px;">Keine Anlagen zugewiesen</span>';
            return;
        }

        // Alphabetisch sortieren
        currentSaw.linked_anlagen.sort((a,b) => (a.bez||'').localeCompare(b.bez||''));

        currentSaw.linked_anlagen.forEach((a, index) => {
            const chip = document.createElement('div');
            chip.style.cssText = "background: #fdf2e9; color: #d35400; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; display: flex; align-items: center; border: 1px solid #f5cba7;";
            
            const txt = document.createElement('span');
            txt.innerText = a.bez || 'ID:'+a.anlID;
            
            const delBtn = document.createElement('span');
            delBtn.innerText = "×";
            delBtn.style.cssText = "cursor: pointer; margin-left: 6px; font-weight: bold; color: #e74c3c;";
            delBtn.title = "Entfernen";
            delBtn.onclick = () => removeAnlageFromSaw(index);

            chip.appendChild(txt);
            chip.appendChild(delBtn);
            container.appendChild(chip);
        });
    };

    window.addAnlageToSaw = function() {
        // Overlay für Anlagen-Auswahl erstellen
        const overlay = document.createElement('div');
        overlay.style.cssText = "position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:5000; display:flex; justify-content:center; align-items:center;";
        
        const box = document.createElement('div');
        box.style.cssText = "background:white; padding:20px; border-radius:8px; width:90%; max-width:400px; box-shadow:0 5px 15px rgba(0,0,0,0.3);";
        box.innerHTML = `<h3>Anlage hinzufügen</h3>
            <input type="text" id="tempAnlSearch" placeholder="Suchen..." style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;">
            <select id="tempAnlSelect" size="10" style="width:100%; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;"></select>
            <div style="text-align:right; gap:10px; display:flex; justify-content:flex-end;">
                <button id="tempAnlCancel" class="btn-reset" style="background:#95a5a6;">Abbrechen</button>
                <button id="tempAnlConfirm" class="btn-reset" style="background:#2ecc71; color:white;">Hinzufügen</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        const search = document.getElementById('tempAnlSearch');
        const select = document.getElementById('tempAnlSelect');
        const sorted = [...allAnlagen].sort((a,b) => (a.bez || '').localeCompare(b.bez || ''));
        
        function fillList(filter = '') {
            select.innerHTML = '';
            const f = filter.toLowerCase();
            sorted.forEach(a => {
                if (!f || (a.bez||'').toLowerCase().includes(f)) {
                    const opt = document.createElement('option');
                    opt.value = a.anlID;
                    opt.text = a.bez;
                    select.appendChild(opt);
                }
            });
            
            if (sorted.length === 0) {
                 const opt = document.createElement('option');
                 opt.text = "(Keine Zellen in den gewählten Anlagen gefunden)";
                 opt.disabled = true;
                 select.appendChild(opt);
            }
        }
        
        fillList();
        search.oninput = () => fillList(search.value);
        search.focus();
        
        document.getElementById('tempAnlCancel').onclick = () => document.body.removeChild(overlay);
        
        document.getElementById('tempAnlConfirm').onclick = () => {
            const val = select.value;
            if (val) {
                const aObj = allAnlagen.find(a => a.anlID == val);
                if (aObj) {
                    if (!currentSaw.linked_anlagen) currentSaw.linked_anlagen = [];
                    // Prüfen ob schon vorhanden
                    if (!currentSaw.linked_anlagen.some(la => la.anlID == val)) {
                        currentSaw.linked_anlagen.push({
                            anlID: aObj.anlID,
                            bez: aObj.bez
                        });
                        window.renderEditorAnlagenList();
                    }
                }
            }
            document.body.removeChild(overlay);
        };
    };

    window.removeAnlageFromSaw = function(index) {
        if (!currentSaw.linked_anlagen) return;
        currentSaw.linked_anlagen.splice(index, 1);
        window.renderEditorAnlagenList();
    };

    window.addZelleToSaw = function() {
        // Overlay für Zell-Auswahl erstellen
        const overlay = document.createElement('div');
        overlay.style.cssText = "position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:5000; display:flex; justify-content:center; align-items:center;";
        
        const box = document.createElement('div');
        box.style.cssText = "background:white; padding:20px; border-radius:8px; width:90%; max-width:400px; box-shadow:0 5px 15px rgba(0,0,0,0.3);";
        box.innerHTML = `<h3>Zelle hinzufügen</h3>
            <input type="text" id="tempZellSearch" placeholder="Suchen..." style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;">
            <select id="tempZellSelect" size="10" style="width:100%; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;"></select>
            <div style="text-align:right; gap:10px; display:flex; justify-content:flex-end;">
                <button id="tempZellCancel" class="btn-reset" style="background:#95a5a6;">Abbrechen</button>
                <button id="tempZellConfirm" class="btn-reset" style="background:#2ecc71; color:white;">Hinzufügen</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        const search = document.getElementById('tempZellSearch');
        const select = document.getElementById('tempZellSelect');
        
        // NEU: Filtern nach ALLEN ausgewählten Anlagen
        let selectedAnlagenIDs = [];

        // 1. Aus der Liste der verknüpften Anlagen im Editor-Objekt
        if (currentSaw.linked_anlagen && currentSaw.linked_anlagen.length > 0) {
            selectedAnlagenIDs = currentSaw.linked_anlagen.map(a => parseInt(a.anlID));
        }

        // 2. Fallback: Versuch Textfeld (falls User manuell was getippt hat und noch nicht bestätigt)
        const inpAnlageText = document.getElementById('inpAnlageText');
        if (selectedAnlagenIDs.length === 0 && inpAnlageText && inpAnlageText.value) {
             const txt = inpAnlageText.value.trim();
             const found = allAnlagen.find(a => a.bez === txt);
             if(found) selectedAnlagenIDs.push(found.anlID);
        }

        // 3. Fallback: Wenn Liste leer, über Haupt-Zelle (falls vorhanden)
        if (selectedAnlagenIDs.length === 0 && currentSaw && currentSaw.zellen_id) {
             const z = allZellen.find(x => x.zelID == currentSaw.zellen_id);
             if (z && z.zelAnl) {
                 selectedAnlagenIDs.push(parseInt(z.zelAnl));
             }
        }

        let availableZellen = [];
        
        if (selectedAnlagenIDs.length > 0) {
            // Zellen filtern: Muss zu EINER der ausgewählten Anlagen gehören
            availableZellen = allZellen.filter(z => selectedAnlagenIDs.includes(parseInt(z.zelAnl)));
            
            // Titel update
            const h3 = box.querySelector('h3');
            if(h3) {
                 if(selectedAnlagenIDs.length === 1) {
                     const a = allAnlagen.find(x => x.anlID == selectedAnlagenIDs[0]);
                     if(a) h3.innerText = "Zelle hinzufügen zu: " + a.bez;
                 } else {
                     h3.innerText = "Zelle hinzufügen (Alle - Keine Anlage zugewiesen)";
                 }
            }
        } else {
            // Keine Anlage ausgewählt, daher alle Zellen anzeigen (oder keine, falls gefiltert)
            availableZellen = [...allZellen];
            const h3 = box.querySelector('h3');
            if(h3) h3.innerText = "Zelle hinzufügen (Alle - Keine Anlage zugewiesen)";
        }

        const sorted = availableZellen.sort((a,b) => (a.zelNr || '').localeCompare(b.zelNr || '', undefined, {numeric:true}));
        
        function fillList(filter = '') {
            select.innerHTML = '';
            const f = filter.toLowerCase();
            sorted.forEach(z => {
                if (!f || (z.zelNr || '').toLowerCase().includes(f) || (z.zelBez || '').toLowerCase().includes(f)) {
                    const opt = document.createElement('option');
                    opt.value = z.zelID;
                    opt.text = `[${z.zelNr}] ${z.zelBez}`;
                    select.appendChild(opt);
                }
            });
            
            if (sorted.length === 0) {
                 const opt = document.createElement('option');
                 opt.text = "(Keine Zellen in den gewählten Anlagen gefunden)";
                 opt.disabled = true;
                 select.appendChild(opt);
            }
        }
        
        fillList();
        search.oninput = () => fillList(search.value);
        search.focus();
        
        document.getElementById('tempZellCancel').onclick = () => document.body.removeChild(overlay);
        
        document.getElementById('tempZellConfirm').onclick = () => {
            const val = select.value;
            if (val) {
                const zObj = allZellen.find(z => z.zelID == val);
                if (zObj) {
                    if (!currentSaw.linked_zellen) currentSaw.linked_zellen = [];
                    // Prüfen ob schon vorhanden
                    if (!currentSaw.linked_zellen.some(lz => lz.zelID == val)) {
                        currentSaw.linked_zellen.push({
                            zelID: zObj.zelID,
                            zelNr: zObj.zelNr,
                            zelBez: zObj.zelBez
                        });
                        window.renderEditorZellenList();
                        
                        // Haupt-Zell-ID im Objekt aktualisieren falls es die erste ist
                        if(currentSaw.linked_zellen.length === 1) {
                            currentSaw.zellen_id = zObj.zelID;
                        }
                    }
                }
            }
            document.body.removeChild(overlay);
        };
    };

    // Helper Function um Dropdown komplett zu öffnen (FIX für ReferenceError)
    function openFullAutocomplete(input, dataArray) {
        // Schließe andere Listen zuerst
        var x = document.getElementsByClassName("autocomplete-suggestions");
        for (var i = 0; i < x.length; i++) { 
             if(x[i].id !== input.id + "autocomplete-list") {
                 x[i].parentNode.removeChild(x[i]); 
             }
        }
        
        // Prüfen, ob für DIESES Input schon offen ist -> Toggle Effekt (Schließen)
        const existing = document.getElementById(input.id + "autocomplete-list");
        if(existing) {
            existing.parentNode.removeChild(existing);
            return;
        }
        
        // Container finden
        let container = document.getElementById('anlageDropdownContainer');
        if(!container) container = input.parentNode;

        let a = document.createElement("DIV");
        a.setAttribute("id", input.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-suggestions");
        
        // Alle Items hinzufügen
        // Sortieren alphabetisch
        const sortedData = [...dataArray].sort((a,b) => a.localeCompare(b));

        for (let i = 0; i < sortedData.length; i++) {
            const item = sortedData[i];
            let b = document.createElement("DIV");
            b.className = "autocomplete-suggestion";
            
            b.innerHTML = item; 
            b.innerHTML += "<input type='hidden' value='" + item + "'>";
            
            b.addEventListener("click", function(e) {
                input.value = this.getElementsByTagName("input")[0].value;
                input.dispatchEvent(new Event('input'));
                
                // Liste entfernen
                if(a.parentNode) a.parentNode.removeChild(a);
                input.focus();
            });
            a.appendChild(b);
        }
        
        container.appendChild(a);
    }


    // --- CUSTOM AUTOCOMPLETE ---
    function setupAutocomplete(input, dataArray) {
        let currentFocus = -1;
        
        input.addEventListener("input", function(e) {
            // NEU: Autocomplete basierend auf der aktuellen Zeile / Kontext beim Cursor
            const cursorPosition = this.selectionStart;
            const fullText = this.value;
            // Text bis zum Cursor holen
            const textUntilCursor = fullText.substring(0, cursorPosition);
            // Finde den letzten Zeilenumbruch vor dem Cursor
            const lastNewLineIndex = textUntilCursor.lastIndexOf('\n');
            
            // Der Suchbegriff ist alles in der aktuellen Zeile bis zum Cursor
            // Wenn lastNewLineIndex -1 ist (kein Umbruch), wird ab Index 0 (Anfang) genommen
            let val = textUntilCursor.substring(lastNewLineIndex + 1);

            closeAllLists();
            if (!val) { return false; }
            currentFocus = -1;
            
            let a = document.createElement("DIV");
            a.setAttribute("id", this.id + "autocomplete-list");
            a.setAttribute("class", "autocomplete-suggestions");
            this.parentNode.appendChild(a);
            
            const valLower = val.toLowerCase();

            for (let i = 0; i < dataArray.length; i++) {
                const item = dataArray[i];
                const itemLower = item.toLowerCase();
                const idx = itemLower.indexOf(valLower);

                // Filter logic
                if (idx > -1) {
                    // PRECISE SEARCH CHECK:
                    // If search term starts with a digit (e.g. "5kv"), 
                    // ensure the character before match is NOT a digit.
                    // This prevents "5kv" matching "35kv".
                    if (/^\d/.test(valLower)) {
                        if (idx > 0) {
                            const prevChar = itemLower[idx - 1];
                            if (/\d/.test(prevChar)) {
                                continue; // Skip match (e.g. found '5' inside '35')
                            }
                        }
                    }

                    let b = document.createElement("DIV");
                    b.className = "autocomplete-suggestion";
                    
                    // Highlight match
                    const regex = new RegExp(`(${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    b.innerHTML = item.replace(regex, "<strong>$1</strong>");
                    
                    b.innerHTML += "<input type='hidden' value='" + item + "'>";
                    
                    b.addEventListener("click", function(e) {
                        const selectedValue = this.getElementsByTagName("input")[0].value;

                        // ZUSAMMENBAU DES NEUEN TEXTES (Einfügen an Cursor-Position unter Beibehaltung des Rests)
                        
                        // Alles vor der aktuellen Eingabe (Prefix vor der aktuellen Zeile)
                        const prefix = textUntilCursor.substring(0, lastNewLineIndex + 1);
                        // Alles nach dem Cursor (Suffix)
                        const suffix = fullText.substring(cursorPosition);
                        
                        // Neuer Wert: Prefix + Ausgewählter Baustein + Suffix
                        input.value = prefix + selectedValue + suffix;
                        
                        // Trigger events
                        input.dispatchEvent(new Event('input'));
                        closeAllLists();
                        input.focus();
                    });
                    a.appendChild(b);
                }
            }
        });
        
        input.addEventListener("keydown", function(e) {
            let x = document.getElementById(this.id + "autocomplete-list");
            if (x) x = x.querySelectorAll(".autocomplete-suggestion");
            if (e.keyCode == 40) { // DOWN
                currentFocus++;
                addActive(x);
            } else if (e.keyCode == 38) { // UP
                currentFocus--;
                addActive(x);
            } else if (e.keyCode == 13) { // ENTER
                // FIX: Enter nur verhindern, wenn tatsächlich ein Eintrag im Dropdown markiert ist
                if (currentFocus > -1) {
                    e.preventDefault();
                    if (x) x[currentFocus].click();
                }
                // Ansonsten Standardverhalten (Neue Zeile im Textarea) zulassen!
            }
        });
        
        function addActive(x) {
            if (!x) return false;
            removeActive(x);
            if (currentFocus >= x.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (x.length - 1);
            x[currentFocus].classList.add("autocomplete-active");
            x[currentFocus].scrollIntoView({block: "nearest"});
        }
        
        function removeActive(x) {
            for (let i = 0; i < x.length; i++) {
                x[i].classList.remove("autocomplete-active");
            }
        }
        
        function closeAllLists(elmnt) {
            var x = document.getElementsByClassName("autocomplete-suggestions");
            for (var i = 0; i < x.length; i++) {
                if (elmnt != x[i] && elmnt != input) {
                    x[i].parentNode.removeChild(x[i]);
                }
            }
        }
        
        document.addEventListener("click", function (e) {
            closeAllLists(e.target);
        });
    }

    window.addEditorRow = function(stepData = null) {
        const tbody = document.getElementById('stepTableBody');
        const rowIndex = tbody.children.length + 1;
        const tr = document.createElement('tr');
        
        tr.setAttribute('draggable', 'false'); 
        tr.dataset.rowId = Date.now() + Math.random(); 

        let activeCol = 1;
        let textValue = '';
        if (stepData) {
            activeCol = parseInt(stepData.ecol) || 1;
            textValue = stepData.etext || '';
        }

        let tds = `<td class="col-num-cell" style="cursor:move;" title="Ziehen zum Verschieben">${rowIndex}</td>`;

        for(let i=1; i<=MAX_COLS; i++) {
            const isColActive = (i === activeCol);
            const val = isColActive ? textValue.replace(/"/g, '&quot;') : '';
            const uniqueId = `row-${Math.floor(tr.dataset.rowId)}-col-${i}`;

            tds += `
                <td>
                    <div class="step-input-wrapper">
                        <span class="cell-lock-icon">🔒</span>
                        
                        <!-- NEU: Button Icon geändert zu ▼ -->
                        <button class="cell-picker-btn" tabindex="-1" onclick="openCellPicker(this, ${i})" title="Zelle aus Liste einfügen">▼</button>
                        
                        <textarea class="step-input" 
                                  id="${uniqueId}"
                                  data-col="${i}" 
                                  onfocus="handleCellFocus(this)"
                                  autocomplete="off"
                                  placeholder="" 
                        >${val}</textarea>
                    </div>
                </td>
            `;
        }
        
        // Spacer for Action Column
        tds += `
            <td class="col-action-cell" style="vertical-align: middle;">
                <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
                    <button onclick="removeStep(this)" class="action-btn btn-delete-row" title="Zeile löschen">✖</button>
                </div>
            </td>
        `;

        tr.innerHTML = tds;
        tbody.appendChild(tr);
        
        // Init height and Autocomplete
        tr.querySelectorAll('textarea').forEach(t => {
            t.addEventListener('input', function() {
                limitLines(this, 9, 60); 
                autoResize(this);
            });
            autoResize(t);
            setupAutocomplete(t, textbausteine); 
        });

        // Initialize Locking State for this row
        updateRowLocks(tr);

        updateRowNumbers();
    }

    // --- NEU: LOGIK FÜR ZELLEN PICKER ---
    window.openCellPicker = function(btn, colIndex) {
        const wrapper = btn.closest('.step-input-wrapper');
        
        // Toggle-Logik: Prüfen ob genau hier schon eine Liste offen ist
        const isAlreadyOpen = wrapper.querySelector(".cell-picker-list");

        // Alte Listen schließen (immer aufräumen)
        document.querySelectorAll(".cell-picker-list").forEach(l => l.remove());
        
        // Wenn es hier schon offen war, brechen wir ab -> Liste bleibt zu
        if (isAlreadyOpen) return;
        
        const textarea = wrapper.querySelector('textarea');
        
        // 1. Anlagen-Namen aus dem Header dieser Spalte holen
        // Header Inputs haben IDs header-anl-0 bis header-anl-5 (0-basiert)
        // colIndex ist 1-basiert (1..6)
        const headerId = `header-anl-${colIndex - 1}`;
        const headerInput = document.getElementById(headerId);
        const anlagenName = headerInput ? headerInput.value.trim().toLowerCase() : '';

        // 2. Anlage ID ermitteln
        let foundAnlID = 0;
        let foundAnlName = "Keine Anlage im Kopf";

        if (anlagenName) {
            const anlObj = allAnlagen.find(a => a.bez.toLowerCase() === anlagenName);
            if (anlObj) {
                foundAnlID = anlObj.anlID;
                foundAnlName = anlObj.bez;
            } else {
                foundAnlName = "Anlage '" + headerInput.value + "' unbekannt";
            }
        }

        // 3. Liste erstellen
        const listDiv = document.createElement("div");
        listDiv.className = "cell-picker-list";
        
        // Header Info
        const info = document.createElement("div");
        info.className = "cell-picker-header";
        info.innerText = foundAnlName;
        listDiv.appendChild(info);

        // Zellen filtern
        let matchingZellen = [];
        if (foundAnlID > 0) {
            // Nur Zellen dieser Anlage anzeigen
            matchingZellen = allZellen.filter(z => z.zelAnl == foundAnlID);
             // Sortieren alphanumerisch nach Nummer
            matchingZellen.sort((a, b) => (a.zelNr || '').localeCompare(b.zelNr || '', undefined, {numeric:true}));
        }

        if (matchingZellen.length === 0) {
            const item = document.createElement("div");
            item.className = "cell-picker-item";
            item.style.color = "#999";
            item.style.fontStyle = "italic";
            item.innerText = (foundAnlID > 0) ? "Keine Zellen gefunden" : "Wählen Sie erst eine gültige Anlage im Spaltenkopf";
            listDiv.appendChild(item);
        } else {
            matchingZellen.forEach(z => {
                const item = document.createElement("div");
                item.className = "cell-picker-item";
                item.innerHTML = `<strong>${z.zelNr}</strong> <span style="font-size:0.9em; color:#666;">${z.zelBez}</span>`;
                
                item.onclick = function() {
                    // FIX: Formatierung geändert: Zelle/Feld NR \n BEZEICHNUNG
                    const insertText = `Zelle/Feld ${z.zelNr}\n${z.zelBez}`;
                    
                    // NEU: Einfach anhängen, wenn Feld nicht leer ist (kein Confirm mehr)
                    if (textarea.value && textarea.value.trim() !== "") {
                        textarea.value += "\n" + insertText;
                    } else {
                        textarea.value = insertText;
                    }
                    
                    // Trigger Input Event für AutoResize und Locks
                    textarea.dispatchEvent(new Event('input'));
                    listDiv.remove();
                    textarea.focus();
                };
                listDiv.appendChild(item);
            });
        }

        wrapper.appendChild(listDiv);
    }

    // Logic: When a cell receives focus
    window.handleCellFocus = function(textarea) {
        const tr = textarea.closest('tr');
        // Styling auf Wrapper anwenden
        tr.querySelectorAll('.step-input-wrapper').forEach(div => div.classList.remove('active-step-cell'));
        
        const wrapper = textarea.closest('.step-input-wrapper');
        if(wrapper) wrapper.classList.add('active-step-cell');
    }
    
    // --- LOCKING SYSTEM ---

    function updateRowLocks(tr) {
        const inputs = tr.querySelectorAll('.step-input');
        let hasContent = false;

        // Check if row has any content
        inputs.forEach(inp => {
            if(inp.value.trim() !== '') hasContent = true;
        });

        inputs.forEach(inp => {
            const td = inp.closest('td');
            const lockIcon = td.querySelector('.cell-lock-icon');
            // Check if this specific cell was manually unlocked
            const isManuallyUnlocked = (inp.dataset.manualUnlock === "true");

            if (hasContent) {
                if (inp.value.trim() === '') {
                    // Zelle ist leer in einer gefüllten Zeile
                    if (!isManuallyUnlocked) {
                        // --> SPERREN (Standard)
                        inp.classList.add('locked');
                        inp.setAttribute('readonly', 'true');
                        td.classList.add('cell-locked'); // Grauer Hintergrund via CSS
                        td.classList.remove('cell-manually-unlocked');
                        
                        inp.title = "Gesperrt. Klick auf Schloss zum Entsperren.";
                        if(lockIcon) lockIcon.innerText = "🔒";
                    } else {
                        // --> MANUELL ENTSPERRT
                        inp.classList.remove('locked');
                        inp.removeAttribute('readonly');
                        td.classList.remove('cell-locked');
                        td.classList.add('cell-manually-unlocked'); // Weißer Hintergrund
                        
                        inp.title = "";
                        if(lockIcon) lockIcon.innerText = "🔓";
                    }
                } else {
                    // Zelle hat Inhalt -> Normalzustand
                    inp.classList.remove('locked');
                    inp.removeAttribute('readonly');
                    td.classList.remove('cell-locked');
                    td.classList.remove('cell-manually-unlocked');
                    inp.title = "";
                    // Icon wird per CSS meist ausgeblendet, falls nicht gesperrt/manuell
                    if(lockIcon) lockIcon.innerText = "🔒"; 
                }
            } else {
                // Zeile ist komplett leer -> Alles offen
                inp.classList.remove('locked');
                inp.removeAttribute('readonly');
                td.classList.remove('cell-locked');
                td.classList.remove('cell-manually-unlocked');
                inp.title = "";
                inp.dataset.manualUnlock = "false"; 
                if(lockIcon) lockIcon.innerText = "🔒";
            }
        });
    }

    // LISTENER: Update locks on typing
    document.addEventListener('input', function(e) {
        if(e.target.classList.contains('step-input')) {
            updateRowLocks(e.target.closest('tr'));
        }
    });

    // NEU: Klick auf das Schloss-Icon toggelt den Status (Sperren <-> Entsperren)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('cell-lock-icon')) {
            const td = e.target.closest('td');
            if(!td) return;
            const input = td.querySelector('.step-input');
            
            // Wenn die Zeile leer ist, macht Sperren keinen Sinn, daher prüfen:
            // (Optional, aber logisch besser)
            const tr = td.closest('tr');
            let hasRowContent = false;
            tr.querySelectorAll('.step-input').forEach(i => { if(i.value.trim() !== '') hasRowContent = true; });

            if(input && hasRowContent) {
                 if (input.dataset.manualUnlock === "true") {
                    // War offen -> Wieder ZUsperren
                    input.dataset.manualUnlock = "false";
                } else {
                    // War zu (oder normal) -> AUFsperren
                    input.dataset.manualUnlock = "true";
                }
                
                updateRowLocks(tr);
                
                // Fokus setzen, wenn wir gerade entsperrt haben
                if (input.dataset.manualUnlock === "true") {
                    input.focus();
                }
            }
        }
    });

    // LISTENER: Manual Unlock via Double Click (Beibehalten als Shortcut)
    document.addEventListener('dblclick', function(e) {
        let target = e.target;
        
        // Wenn auf das Icon oder den TD Hintergrund geklickt wurde, das Textarea finden
        if (target.classList.contains('cell-lock-icon') || target.tagName === 'TD') {
            const td = target.closest('td');
            if(td) target = td.querySelector('.step-input');
        }

        if(target && target.classList.contains('step-input')) {
            if (target.classList.contains('locked')) {
                // Manual override setzen
                target.dataset.manualUnlock = "true";
                // Update auslösen
                updateRowLocks(target.closest('tr'));
                // Fokus setzen, damit man direkt schreiben kann
                target.focus();
            }
        }
    });

    window.removeStep = function(btn) {
        const tr = btn.closest('tr');
        tr.remove();
        updateRowNumbers();
    }
    
    function updateRowNumbers() {
        const rows = document.querySelectorAll('#stepTableBody tr');
        rows.forEach((row, idx) => {
            row.querySelector('.col-num-cell').innerText = idx + 1;
        });
    }

    // --- Intuitive Drag & Drop ---
    function initializeDragAndDrop() {
        const tbody = document.getElementById('stepTableBody');
        let draggedRow = null;

        // Mousedown Listener für den Handle (Nummer-Zelle)
        tbody.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('col-num-cell')) {
                const tr = e.target.closest('tr');
                if(tr) tr.setAttribute('draggable', 'true');
            }
        });

        // Mouseup Listener um draggable wieder zu entfernen (Cleanup)

        document.addEventListener('mouseup', () => {
             // Kurze Verzögerung damit DragEnd feuern kann falls nötig
             setTimeout(() => {
                const rows = tbody.querySelectorAll('tr[draggable="true"]');
                rows.forEach(r => r.setAttribute('draggable', 'false'));
             }, 100);
        });

        tbody.addEventListener('dragstart', (e) => {
            // Nur erlauben wenn wir wirklich im Draggable Mode sind (via Mousedown auf Handle)
            if (e.target.getAttribute('draggable') !== 'true') {
                e.preventDefault();
                return;
            }

            draggedRow = e.target.closest('tr');
            if(!draggedRow) return;

            e.dataTransfer.effectAllowed = 'move';
            // Setzt Ghost Image
            e.dataTransfer.setDragImage(draggedRow, 10, 10);
            
            setTimeout(() => {
                 draggedRow.classList.add('dragging');
            }, 0);
        });

        tbody.addEventListener('dragend', () => {
            if (draggedRow) {
                draggedRow.classList.remove('dragging');
                // Wichtig: Draggable Status zurücksetzen
                draggedRow.setAttribute('draggable', 'false');
                draggedRow = null;
            }
            // Cleanup visual markers
            tbody.querySelectorAll('tr').forEach(tr => {
                tr.classList.remove('drop-target-top', 'drop-target-bottom');
            });
            
            // Re-calc numbers
            updateRowNumbers();
        });

        tbody.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetRow = e.target.closest('tr');
            if(!targetRow || targetRow === draggedRow) return;

            // Calculate where we are relative to the row center
            const rect = targetRow.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const isTop = e.clientY < midY;

            // Visual feedback
            tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('drop-target-top', 'drop-target-bottom'));
            
            if(isTop) {
                targetRow.classList.add('drop-target-top');
            } else {
                targetRow.classList.add('drop-target-bottom');
            }
        });

        tbody.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetRow = e.target.closest('tr');
            if (draggedRow && targetRow && draggedRow !== targetRow) {
                const rect = targetRow.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (e.clientY < midY) {
                    tbody.insertBefore(draggedRow, targetRow);
                } else {
                    tbody.insertBefore(draggedRow, targetRow.nextSibling);
                }
            }
        });
    }

    window.saveSaw = function() {
        // ... (Header saving logic same as before) ...
        const inpSawNr = document.getElementById('inpSawNr');
        if(inpSawNr) currentSaw.saw_nr = inpSawNr.value;

        // WICHTIG: Ersteller IMMER auf den aktuell angemeldeten User zwingen beim Speichern
        if(currentUser && currentUser.name) {
            currentSaw.ersteller = currentUser.name;
        } else {
            // Fallback: Nur wenn kein User eingeloggt ist (Sollte nicht passieren)
            const inpUser = document.getElementById('inpUser');
            if(inpUser) currentSaw.ersteller = inpUser.value;
        }
        
        // NEU: Anlage Text für Kompatibilität speichern (aus erster Anlage)
        if (currentSaw.linked_anlagen && currentSaw.linked_anlagen.length > 0) {
            currentSaw.anlage_text = currentSaw.linked_anlagen[0].bez;
        } else {
             const inpAnlageText = document.getElementById('inpAnlageText');
             if(inpAnlageText) currentSaw.anlage_text = inpAnlageText.value;
        }

        const inpKopf = document.getElementById('inpKopf');
        if(inpKopf) currentSaw.kopf = inpKopf.value;
        
        const chkOrig = document.getElementById('chkOriginal');
        if (chkOrig) currentSaw.original = chkOrig.checked ? 1 : 0;
        
        // Status Update, außer es ist neu
        if (!currentSaw.status || currentSaw.status !== 'NEU' ) {
             currentSaw.status = 'BEARBEITET'; 
        }
        
        // CHANGED: linked_zellen_ids wird leer übergeben oder nur mit Haupt-ID
        // Da wir nun globale Links nutzen, speichert das SAW Objekt keine Links mehr.
        // Die API save_saw erwartet linked_zellen um die Legacy Tabelle saw_zellen zu füllen.
        // Wir übergeben NUR noch die Hauptzelle, damit alte Relationen gelöscht werden (Clean up).
        
        let zellenIDs = [];
        if (currentSaw.zellen_id > 0) {
            zellenIDs.push(currentSaw.zellen_id);
        }

        // NEU: Anlagen IDs
        let anlagenIDs = [];
        if (currentSaw.linked_anlagen) {
            anlagenIDs = currentSaw.linked_anlagen.map(a => a.anlID);
        }
        
        currentSaw.schritte = [];
        const rows = document.querySelectorAll('#stepTableBody tr');
        rows.forEach(row => {
            let foundText = false;
            // Iterate inputs
            row.querySelectorAll('.step-input').forEach(ta => {
                if (ta.value.trim() !== '') {
                    currentSaw.schritte.push({
                        ecol: parseInt(ta.dataset.col),
                        etext: ta.value
                    });
                    foundText = true;
                }
            });
            
            // Keep empty rows as placeholders if desired? 
            if (!foundText) {
                // Determine if we save empty rows. Let's save them to keep layout.
                currentSaw.schritte.push({
                    ecol: 1,
                    etext: ''
                });
            }
        });
        
        // FIX: Auch die Anlagen-Header (Spaltenüberschriften) aus den Inputs holen!
        for(let i=0; i<MAX_COLS; i++) {
             const inp = document.getElementById(`header-anl-${i}`);
             if(inp) {
                 if(!currentSaw.anlagen[i]) currentSaw.anlagen[i] = {};
                 currentSaw.anlagen[i].bez = inp.value;
             }
        }

        fetch('api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'save_saw',
                data: {
                    ...currentSaw,
                    linked_zellen_ids: zellenIDs,
                    linked_anlagen_ids: anlagenIDs // NEU
                }
            })
        })
        .then(res => res.text()) // Erst als Text, damit wir Fehler sehen
        .then(text => {
            if(!text) throw new Error("Server antwortete leer (PHP Error?)");
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error("Server Response:", text);
                throw new Error("Ungültige Server-Antwort: " + text.substring(0, 50) + "...");
            }
        })
        .then(res => {
            if(res.success) {
                switchView('list');
            } else {
                alert("Fehler beim Speichern (DB): " + res.error);
            }
        })
        .catch(err => alert("Netzwerkfehler: " + err.message));
    }

    window.deleteCurrentSaw = function() {
        // Sicherheitshalber Nummer direkt aus dem Input-Feld holen, falls Objekt nicht aktuell
        let nrToDelete = null;
        const inpSawNr = document.getElementById('inpSawNr');
        
        if (inpSawNr && inpSawNr.value) {
            nrToDelete = inpSawNr.value;
        } else if (currentSaw && currentSaw.saw_nr) {
            nrToDelete = currentSaw.saw_nr;
        }

        if(!nrToDelete) {
            alert("Fehler: Keine SAW-Nummer gefunden. Bitte öffnen Sie die Schaltanweisung erneut.");
            return;
        }

        if(!confirm("Möchten Sie Schaltanweisung " + nrToDelete + " wirklich LÖSCHEN?\nDies kann nicht rückgängig gemacht werden!")) return;
        
        // Button Feedback
        const btnDelete = document.getElementById('btnDeleteSaw');
        if(btnDelete) { btnDelete.disabled = true; btnDelete.innerText = "Lösche..."; }

        fetch('api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'delete_saw',
                nr: nrToDelete
            })
        })
        .then(res => res.text()) // Erst als Text, um HTML-Fehler von PHP to sehen
        .then(text => {
            try {
                return JSON.parse(text);
            } catch(e) {
                console.error("Server Response (kein JSON):", text);
                throw new Error("Server-Fehler: " + text.substring(0, 100));
            }
        })
        .then(res => {
            if(res.success) {
                showNotification("Schaltanweisung " + nrToDelete + " gelöscht", "success");
                switchView('list');
            } else {
                alert("Löschen fehlgeschlagen: " + res.error);
                if(btnDelete) { btnDelete.disabled = false; btnDelete.innerText = "Löschen"; }
            }
        })
        .catch(err => {
            console.error(err);
            alert("Netzwerkfehler beim Löschen: " + err.message);
            if(btnDelete) { btnDelete.disabled = false; btnDelete.innerText = "Löschen"; }
        });
    }

    // NEU: Haupt-Zelle (und damit Anlage) einer bestehenden SAW ändern
    window.changeMainZelle = function() {
        if (!currentSaw) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:5000; display:flex; justify-content:center; align-items:center;";

        const box = document.createElement('div');
        box.style.cssText = "background:white; padding:20px; border-radius:8px; width:90%; max-width:450px; box-shadow:0 5px 15px rgba(0,0,0,0.3);";
        box.innerHTML = `
            <h3>Zelle / Anlage ändern</h3>
            <p style="font-size:0.85em; color:#666; margin-bottom:10px;">
                Wählen Sie zuerst eine Anlage und anschließend eine Zelle aus.
            </p>
            <label for="tempMainAnlSelect" style="display:block; margin-bottom:4px; font-weight:bold;">1. Anlage:</label>
            <select id="tempMainAnlSelect" style="width:100%; padding:8px; margin-bottom:12px; border:1px solid #ddd; border-radius:4px;">
                <option value="0">-- Anlage wählen --</option>
            </select>

            <label for="tempMainZellSelect" style="display:block; margin-bottom:4px; font-weight:bold;">2. Zelle:</label>
            <select id="tempMainZellSelect" size="10" disabled style="width:100%; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;">
                <option value="">-- Bitte zuerst Anlage wählen --</option>
            </select>

            <div style="text-align:right; gap:10px; display:flex; justify-content:flex-end;">
                <button id="tempMainZellCancel" class="btn-reset" style="background:#95a5a6;">Abbrechen</button>
                <button id="tempMainZellConfirm" class="btn-reset" style="background:#2ecc71; color:white;">Übernehmen</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const anlageSelect = box.querySelector('#tempMainAnlSelect');
        const zelleSelect = box.querySelector('#tempMainZellSelect');

        [...allAnlagen]
            .sort((a, b) => (a.bez || '').localeCompare(b.bez || '', undefined, { sensitivity: 'base' }))
            .forEach(anlage => {
                const option = document.createElement('option');
                option.value = anlage.anlID;
                option.text = anlage.bez;
                anlageSelect.appendChild(option);
            });

        anlageSelect.onchange = () => {
            const anlageId = parseInt(anlageSelect.value) || 0;

            zelleSelect.innerHTML = '';
            zelleSelect.disabled = anlageId === 0;

            if (!anlageId) {
                zelleSelect.innerHTML = '<option value="">-- Bitte zuerst Anlage wählen --</option>';
                return;
            }

            const zellen = allZellen
                .filter(z => parseInt(z.zelAnl) === anlageId)
                .sort((a, b) => (a.zelNr || '').localeCompare(b.zelNr || '', undefined, { numeric: true }));

            zelleSelect.innerHTML = '<option value="">-- Zelle wählen --</option>';
            zellen.forEach(zelle => {
                const option = document.createElement('option');
                option.value = zelle.zelID;
                option.text = `[${zelle.zelNr}] ${zelle.zelBez}`;
                zelleSelect.appendChild(option);
            });

            if (zellen.length === 0) {
                zelleSelect.innerHTML = '<option value="">-- Keine Zellen vorhanden --</option>';
                zelleSelect.disabled = true;
            }
        };

        box.querySelector('#tempMainZellCancel').onclick = () => document.body.removeChild(overlay);

        box.querySelector('#tempMainZellConfirm').onclick = () => {
            const zellenId = parseInt(zelleSelect.value) || 0;
            if (!zellenId) {
                showNotification("Bitte zuerst eine Zelle auswählen.", "error");
                return;
            }

            const zObj = allZellen.find(z => parseInt(z.zelID) === zellenId);
            if (zObj) {
                currentSaw.zellen_id = zObj.zelID;

                const inpZelle = document.getElementById('inpCurrentZelle');
                if (inpZelle) inpZelle.value = `[${zObj.zelNr}] ${zObj.zelBez}`;

                if (!currentSaw.linked_anlagen) currentSaw.linked_anlagen = [];

                const anlObj = allAnlagen.find(a => parseInt(a.anlID) === parseInt(zObj.zelAnl));
                if (anlObj && !currentSaw.linked_anlagen.some(la => parseInt(la.anlID) === parseInt(anlObj.anlID))) {
                    currentSaw.linked_anlagen.push({ anlID: anlObj.anlID, bez: anlObj.bez });
                    window.renderEditorAnlagenList();
                }

                showNotification("Zelle/Anlage geändert. Bitte speichern nicht vergessen!", "success");
            }

            document.body.removeChild(overlay);
        };
    };

    // Helper Function um Dropdown komplett zu öffnen (FIX für ReferenceError)
    function openFullAutocomplete(input, dataArray) {
        // Schließe andere Listen zuerst
        var x = document.getElementsByClassName("autocomplete-suggestions");
        for (var i = 0; i < x.length; i++) { 
             if(x[i].id !== input.id + "autocomplete-list") {
                 x[i].parentNode.removeChild(x[i]); 
             }
        }
        
        // Prüfen, ob für DIESES Input schon offen ist -> Toggle Effekt (Schließen)
        const existing = document.getElementById(input.id + "autocomplete-list");
        if(existing) {
            existing.parentNode.removeChild(existing);
            return;
        }
        
        // Container finden
        let container = document.getElementById('anlageDropdownContainer');
        if(!container) container = input.parentNode;

        let a = document.createElement("DIV");
        a.setAttribute("id", input.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-suggestions");
        
        // Alle Items hinzufügen
        // Sortieren alphabetisch
        const sortedData = [...dataArray].sort((a,b) => a.localeCompare(b));

        for (let i = 0; i < sortedData.length; i++) {
            const item = sortedData[i];
            let b = document.createElement("DIV");
            b.className = "autocomplete-suggestion";
            
            b.innerHTML = item; 
            b.innerHTML += "<input type='hidden' value='" + item + "'>";
            
            b.addEventListener("click", function(e) {
                input.value = this.getElementsByTagName("input")[0].value;
                input.dispatchEvent(new Event('input'));
                
                // Liste entfernen
                if(a.parentNode) a.parentNode.removeChild(a);
                input.focus();
            });
            a.appendChild(b);
        }
        
        container.appendChild(a);
    }


    // --- CUSTOM AUTOCOMPLETE ---
    function setupAutocomplete(input, dataArray) {
        let currentFocus = -1;
        
        input.addEventListener("input", function(e) {
            // NEU: Autocomplete basierend auf der aktuellen Zeile / Kontext beim Cursor
            const cursorPosition = this.selectionStart;
            const fullText = this.value;
            // Text bis zum Cursor holen
            const textUntilCursor = fullText.substring(0, cursorPosition);
            // Finde den letzten Zeilenumbruch vor dem Cursor
            const lastNewLineIndex = textUntilCursor.lastIndexOf('\n');
            
            // Der Suchbegriff ist alles in der aktuellen Zeile bis zum Cursor
            // Wenn lastNewLineIndex -1 ist (kein Umbruch), wird ab Index 0 (Anfang) genommen
            let val = textUntilCursor.substring(lastNewLineIndex + 1);

            closeAllLists();
            if (!val) { return false; }
            currentFocus = -1;
            
            let a = document.createElement("DIV");
            a.setAttribute("id", this.id + "autocomplete-list");
            a.setAttribute("class", "autocomplete-suggestions");
            this.parentNode.appendChild(a);
            
            const valLower = val.toLowerCase();

            for (let i = 0; i < dataArray.length; i++) {
                const item = dataArray[i];
                const itemLower = item.toLowerCase();
                const idx = itemLower.indexOf(valLower);

                // Filter logic
                if (idx > -1) {
                    // PRECISE SEARCH CHECK:
                    // If search term starts with a digit (e.g. "5kv"), 
                    // ensure the character before match is NOT a digit.
                    // This prevents "5kv" matching "35kv".
                    if (/^\d/.test(valLower)) {
                        if (idx > 0) {
                            const prevChar = itemLower[idx - 1];
                            if (/\d/.test(prevChar)) {
                                continue; // Skip match (e.g. found '5' inside '35')
                            }
                        }
                    }

                    let b = document.createElement("DIV");
                    b.className = "autocomplete-suggestion";
                    
                    // Highlight match
                    const regex = new RegExp(`(${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    b.innerHTML = item.replace(regex, "<strong>$1</strong>");
                    
                    b.innerHTML += "<input type='hidden' value='" + item + "'>";
                    
                    b.addEventListener("click", function(e) {
                        const selectedValue = this.getElementsByTagName("input")[0].value;

                        // ZUSAMMENBAU DES NEUEN TEXTES (Einfügen an Cursor-Position unter Beibehaltung des Rests)
                        
                        // Alles vor der aktuellen Eingabe (Prefix vor der aktuellen Zeile)
                        const prefix = textUntilCursor.substring(0, lastNewLineIndex + 1);
                        // Alles nach dem Cursor (Suffix)
                        const suffix = fullText.substring(cursorPosition);
                        
                        // Neuer Wert: Prefix + Ausgewählter Baustein + Suffix
                        input.value = prefix + selectedValue + suffix;
                        
                        // Trigger events
                        input.dispatchEvent(new Event('input'));
                        closeAllLists();
                        input.focus();
                    });
                    a.appendChild(b);
                }
            }
        });
        
        input.addEventListener("keydown", function(e) {
            let x = document.getElementById(this.id + "autocomplete-list");
            if (x) x = x.querySelectorAll(".autocomplete-suggestion");
            if (e.keyCode == 40) { // DOWN
                currentFocus++;
                addActive(x);
            } else if (e.keyCode == 38) { // UP
                currentFocus--;
                addActive(x);
            } else if (e.keyCode == 13) { // ENTER
                // FIX: Enter nur verhindern, wenn tatsächlich ein Eintrag im Dropdown markiert ist
                if (currentFocus > -1) {
                    e.preventDefault();
                    if (x) x[currentFocus].click();
                }
                // Ansonsten Standardverhalten (Neue Zeile im Textarea) zulassen!
            }
        });
        
        function addActive(x) {
            if (!x) return false;
            removeActive(x);
            if (currentFocus >= x.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (x.length - 1);
            x[currentFocus].classList.add("autocomplete-active");
            x[currentFocus].scrollIntoView({block: "nearest"});
        }
        
        function removeActive(x) {
            for (let i = 0; i < x.length; i++) {
                x[i].classList.remove("autocomplete-active");
            }
        }
        
        function closeAllLists(elmnt) {
            var x = document.getElementsByClassName("autocomplete-suggestions");
            for (var i = 0; i < x.length; i++) {
                if (elmnt != x[i] && elmnt != input) {
                    x[i].parentNode.removeChild(x[i]);
                }
            }
        }
        
        document.addEventListener("click", function (e) {
            closeAllLists(e.target);
        });
    }

    window.addEditorRow = function(stepData = null) {
        const tbody = document.getElementById('stepTableBody');
        const rowIndex = tbody.children.length + 1;
        const tr = document.createElement('tr');
        
        tr.setAttribute('draggable', 'false'); 
        tr.dataset.rowId = Date.now() + Math.random(); 

        let activeCol = 1;
        let textValue = '';
        if (stepData) {
            activeCol = parseInt(stepData.ecol) || 1;
            textValue = stepData.etext || '';
        }

        let tds = `<td class="col-num-cell" style="cursor:move;" title="Ziehen zum Verschieben">${rowIndex}</td>`;

        for(let i=1; i<=MAX_COLS; i++) {
            const isColActive = (i === activeCol);
            const val = isColActive ? textValue.replace(/"/g, '&quot;') : '';
            const uniqueId = `row-${Math.floor(tr.dataset.rowId)}-col-${i}`;

            tds += `
                <td>
                    <div class="step-input-wrapper">
                        <span class="cell-lock-icon">🔒</span>
                        
                        <!-- NEU: Button Icon geändert zu ▼ -->
                        <button class="cell-picker-btn" tabindex="-1" onclick="openCellPicker(this, ${i})" title="Zelle aus Liste einfügen">▼</button>
                        
                        <textarea class="step-input" 
                                  id="${uniqueId}"
                                  data-col="${i}" 
                                  onfocus="handleCellFocus(this)"
                                  autocomplete="off"
                                  placeholder="" 
                        >${val}</textarea>
                    </div>
                </td>
            `;
        }
        
        // Spacer for Action Column
        tds += `
            <td class="col-action-cell" style="vertical-align: middle;">
                <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
                    <button onclick="removeStep(this)" class="action-btn btn-delete-row" title="Zeile löschen">✖</button>
                </div>
            </td>
        `;

        tr.innerHTML = tds;
        tbody.appendChild(tr);
        
        // Init height and Autocomplete
        tr.querySelectorAll('textarea').forEach(t => {
            t.addEventListener('input', function() {
                limitLines(this, 9, 60); 
                autoResize(this);
            });
            autoResize(t);
            setupAutocomplete(t, textbausteine); 
        });

        // Initialize Locking State for this row
        updateRowLocks(tr);

        updateRowNumbers();
    }

    // --- NEU: LOGIK FÜR ZELLEN PICKER ---
    window.openCellPicker = function(btn, colIndex) {
        const wrapper = btn.closest('.step-input-wrapper');
        
        // Toggle-Logik: Prüfen ob genau hier schon eine Liste offen ist
        const isAlreadyOpen = wrapper.querySelector(".cell-picker-list");

        // Alte Listen schließen (immer aufräumen)
        document.querySelectorAll(".cell-picker-list").forEach(l => l.remove());
        
        // Wenn es hier schon offen war, brechen wir ab -> Liste bleibt zu
        if (isAlreadyOpen) return;
        
        const textarea = wrapper.querySelector('textarea');
        
        // 1. Anlagen-Namen aus dem Header dieser Spalte holen
        // Header Inputs haben IDs header-anl-0 bis header-anl-5 (0-basiert)
        // colIndex ist 1-basiert (1..6)
        const headerId = `header-anl-${colIndex - 1}`;
        const headerInput = document.getElementById(headerId);
        const anlagenName = headerInput ? headerInput.value.trim().toLowerCase() : '';

        // 2. Anlage ID ermitteln
        let foundAnlID = 0;
        let foundAnlName = "Keine Anlage im Kopf";

        if (anlagenName) {
            const anlObj = allAnlagen.find(a => a.bez.toLowerCase() === anlagenName);
            if (anlObj) {
                foundAnlID = anlObj.anlID;
                foundAnlName = anlObj.bez;
            } else {
                foundAnlName = "Anlage '" + headerInput.value + "' unbekannt";
            }
        }

        // 3. Liste erstellen
        const listDiv = document.createElement("div");
        listDiv.className = "cell-picker-list";
        
        // Header Info
        const info = document.createElement("div");
        info.className = "cell-picker-header";
        info.innerText = foundAnlName;
        listDiv.appendChild(info);

        // Zellen filtern
        let matchingZellen = [];
        if (foundAnlID > 0) {
            // Nur Zellen dieser Anlage anzeigen
            matchingZellen = allZellen.filter(z => z.zelAnl == foundAnlID);
             // Sortieren alphanumerisch nach Nummer
            matchingZellen.sort((a, b) => (a.zelNr || '').localeCompare(b.zelNr || '', undefined, {numeric:true}));
        }

        if (matchingZellen.length === 0) {
            const item = document.createElement("div");
            item.className = "cell-picker-item";
            item.style.color = "#999";
            item.style.fontStyle = "italic";
            item.innerText = (foundAnlID > 0) ? "Keine Zellen gefunden" : "Wählen Sie erst eine gültige Anlage im Spaltenkopf";
            listDiv.appendChild(item);
        } else {
            matchingZellen.forEach(z => {
                const item = document.createElement("div");
                item.className = "cell-picker-item";
                item.innerHTML = `<strong>${z.zelNr}</strong> <span style="font-size:0.9em; color:#666;">${z.zelBez}</span>`;
                
                item.onclick = function() {
                    // FIX: Formatierung geändert: Zelle/Feld NR \n BEZEICHNUNG
                    const insertText = `Zelle/Feld ${z.zelNr}\n${z.zelBez}`;
                    
                    // NEU: Einfach anhängen, wenn Feld nicht leer ist (kein Confirm mehr)
                    if (textarea.value && textarea.value.trim() !== "") {
                        textarea.value += "\n" + insertText;
                    } else {
                        textarea.value = insertText;
                    }
                    
                    // Trigger Input Event für AutoResize und Locks
                    textarea.dispatchEvent(new Event('input'));
                    listDiv.remove();
                    textarea.focus();
                };
                listDiv.appendChild(item);
            });
        }

        wrapper.appendChild(listDiv);
    }

    // Logic: When a cell receives focus
    window.handleCellFocus = function(textarea) {
        const tr = textarea.closest('tr');
        // Styling auf Wrapper anwenden
        tr.querySelectorAll('.step-input-wrapper').forEach(div => div.classList.remove('active-step-cell'));
        
        const wrapper = textarea.closest('.step-input-wrapper');
        if(wrapper) wrapper.classList.add('active-step-cell');
    }
    
    // --- LOCKING SYSTEM ---

    function updateRowLocks(tr) {
        const inputs = tr.querySelectorAll('.step-input');
        let hasContent = false;

        // Check if row has any content
        inputs.forEach(inp => {
            if(inp.value.trim() !== '') hasContent = true;
        });

        inputs.forEach(inp => {
            const td = inp.closest('td');
            const lockIcon = td.querySelector('.cell-lock-icon');
            // Check if this specific cell was manually unlocked
            const isManuallyUnlocked = (inp.dataset.manualUnlock === "true");

            if (hasContent) {
                if (inp.value.trim() === '') {
                    // Zelle ist leer in einer gefüllten Zeile
                    if (!isManuallyUnlocked) {
                        // --> SPERREN (Standard)
                        inp.classList.add('locked');
                        inp.setAttribute('readonly', 'true');
                        td.classList.add('cell-locked'); // Grauer Hintergrund via CSS
                        td.classList.remove('cell-manually-unlocked');
                        
                        inp.title = "Gesperrt. Klick auf Schloss zum Entsperren.";
                        if(lockIcon) lockIcon.innerText = "🔒";
                    } else {
                        // --> MANUELL ENTSPERRT
                        inp.classList.remove('locked');
                        inp.removeAttribute('readonly');
                        td.classList.remove('cell-locked');
                        td.classList.add('cell-manually-unlocked'); // Weißer Hintergrund
                        
                        inp.title = "";
                        if(lockIcon) lockIcon.innerText = "🔓";
                    }
                } else {
                    // Zelle hat Inhalt -> Normalzustand
                    inp.classList.remove('locked');
                    inp.removeAttribute('readonly');
                    td.classList.remove('cell-locked');
                    td.classList.remove('cell-manually-unlocked');
                    inp.title = "";
                    // Icon wird per CSS meist ausgeblendet, falls nicht gesperrt/manuell
                    if(lockIcon) lockIcon.innerText = "🔒"; 
                }
            } else {
                // Zeile ist komplett leer -> Alles offen
                inp.classList.remove('locked');
                inp.removeAttribute('readonly');
                td.classList.remove('cell-locked');
                td.classList.remove('cell-manually-unlocked');
                inp.title = "";
                inp.dataset.manualUnlock = "false"; 
                if(lockIcon) lockIcon.innerText = "🔒";
            }
        });
    }

    // LISTENER: Update locks on typing
    document.addEventListener('input', function(e) {
        if(e.target.classList.contains('step-input')) {
            updateRowLocks(e.target.closest('tr'));
        }
    });

    // NEU: Klick auf das Schloss-Icon toggelt den Status (Sperren <-> Entsperren)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('cell-lock-icon')) {
            const td = e.target.closest('td');
            if(!td) return;
            const input = td.querySelector('.step-input');
            
            // Wenn die Zeile leer ist, macht Sperren keinen Sinn, daher prüfen:
            // (Optional, aber logisch besser)
            const tr = td.closest('tr');
            let hasRowContent = false;
            tr.querySelectorAll('.step-input').forEach(i => { if(i.value.trim() !== '') hasRowContent = true; });

            if(input && hasRowContent) {
                 if (input.dataset.manualUnlock === "true") {
                    // War offen -> Wieder ZUsperren
                    input.dataset.manualUnlock = "false";
                } else {
                    // War zu (oder normal) -> AUFsperren
                    input.dataset.manualUnlock = "true";
                }
                
                updateRowLocks(tr);
                
                // Fokus setzen, wenn wir gerade entsperrt haben
                if (input.dataset.manualUnlock === "true") {
                    input.focus();
                }
            }
        }
    });

    // LISTENER: Manual Unlock via Double Click (Beibehalten als Shortcut)
    document.addEventListener('dblclick', function(e) {
        let target = e.target;
        
        // Wenn auf das Icon oder den TD Hintergrund geklickt wurde, das Textarea finden
        if (target.classList.contains('cell-lock-icon') || target.tagName === 'TD') {
            const td = target.closest('td');
            if(td) target = td.querySelector('.step-input');
        }

        if(target && target.classList.contains('step-input')) {
            if (target.classList.contains('locked')) {
                // Manual override setzen
                target.dataset.manualUnlock = "true";
                // Update auslösen
                updateRowLocks(target.closest('tr'));
                // Fokus setzen, damit man direkt schreiben kann
                target.focus();
            }
        }
    });

    window.removeStep = function(btn) {
        const tr = btn.closest('tr');
        tr.remove();
        updateRowNumbers();
    }
    
    function updateRowNumbers() {
        const rows = document.querySelectorAll('#stepTableBody tr');
        rows.forEach((row, idx) => {
            row.querySelector('.col-num-cell').innerText = idx + 1;
        });
    }

    // --- Intuitive Drag & Drop ---
    function initializeDragAndDrop() {
        const tbody = document.getElementById('stepTableBody');
        let draggedRow = null;

        // Mousedown Listener für den Handle (Nummer-Zelle)
        tbody.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('col-num-cell')) {
                const tr = e.target.closest('tr');
                if(tr) tr.setAttribute('draggable', 'true');
            }
        });

        // Mouseup Listener um draggable wieder zu entfernen (Cleanup)

        document.addEventListener('mouseup', () => {
             // Kurze Verzögerung damit DragEnd feuern kann falls nötig
             setTimeout(() => {
                const rows = tbody.querySelectorAll('tr[draggable="true"]');
                rows.forEach(r => r.setAttribute('draggable', 'false'));
             }, 100);
        });

        tbody.addEventListener('dragstart', (e) => {
            // Nur erlauben wenn wir wirklich im Draggable Mode sind (via Mousedown auf Handle)
            if (e.target.getAttribute('draggable') !== 'true') {
                e.preventDefault();
                return;
            }

            draggedRow = e.target.closest('tr');
            if(!draggedRow) return;

            e.dataTransfer.effectAllowed = 'move';
            // Setzt Ghost Image
            e.dataTransfer.setDragImage(draggedRow, 10, 10);
            
            setTimeout(() => {
                 draggedRow.classList.add('dragging');
            }, 0);
        });

        tbody.addEventListener('dragend', () => {
            if (draggedRow) {
                draggedRow.classList.remove('dragging');
                // Wichtig: Draggable Status zurücksetzen
                draggedRow.setAttribute('draggable', 'false');
                draggedRow = null;
            }
            // Cleanup visual markers
            tbody.querySelectorAll('tr').forEach(tr => {
                tr.classList.remove('drop-target-top', 'drop-target-bottom');
            });
            
            // Re-calc numbers
            updateRowNumbers();
        });

        tbody.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetRow = e.target.closest('tr');
            if(!targetRow || targetRow === draggedRow) return;

            // Calculate where we are relative to the row center
            const rect = targetRow.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const isTop = e.clientY < midY;

            // Visual feedback
            tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('drop-target-top', 'drop-target-bottom'));
            
            if(isTop) {
                targetRow.classList.add('drop-target-top');
            } else {
                targetRow.classList.add('drop-target-bottom');
            }
        });

        tbody.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetRow = e.target.closest('tr');
            if (draggedRow && targetRow && draggedRow !== targetRow) {
                const rect = targetRow.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (e.clientY < midY) {
                    tbody.insertBefore(draggedRow, targetRow);
                } else {
                    tbody.insertBefore(draggedRow, targetRow.nextSibling);
                }
            }
        });
    }

    window.saveSaw = function() {
        // ... (Header saving logic same as before) ...
        const inpSawNr = document.getElementById('inpSawNr');
        if(inpSawNr) currentSaw.saw_nr = inpSawNr.value;

        // WICHTIG: Ersteller IMMER auf den aktuell angemeldeten User zwingen beim Speichern
        if(currentUser && currentUser.name) {
            currentSaw.ersteller = currentUser.name;
        } else {
            // Fallback: Nur wenn kein User eingeloggt ist (Sollte nicht passieren)
            const inpUser = document.getElementById('inpUser');
            if(inpUser) currentSaw.ersteller = inpUser.value;
        }
        
        // NEU: Anlage Text für Kompatibilität speichern (aus erster Anlage)
        if (currentSaw.linked_anlagen && currentSaw.linked_anlagen.length > 0) {
            currentSaw.anlage_text = currentSaw.linked_anlagen[0].bez;
        } else {
             const inpAnlageText = document.getElementById('inpAnlageText');
             if(inpAnlageText) currentSaw.anlage_text = inpAnlageText.value;
        }

        const inpKopf = document.getElementById('inpKopf');
        if(inpKopf) currentSaw.kopf = inpKopf.value;
        
        const chkOrig = document.getElementById('chkOriginal');
        if (chkOrig) currentSaw.original = chkOrig.checked ? 1 : 0;
        
        // Status Update, außer es ist neu
        if (!currentSaw.status || currentSaw.status !== 'NEU' ) {
             currentSaw.status = 'BEARBEITET'; 
        }
        
        // CHANGED: linked_zellen_ids wird leer übergeben oder nur mit Haupt-ID
        // Da wir nun globale Links nutzen, speichert das SAW Objekt keine Links mehr.
        // Die API save_saw erwartet linked_zellen um die Legacy Tabelle saw_zellen zu füllen.
        // Wir übergeben NUR noch die Hauptzelle, damit alte Relationen gelöscht werden (Clean up).
        
        let zellenIDs = [];
        if (currentSaw.zellen_id > 0) {
            zellenIDs.push(currentSaw.zellen_id);
        }

        // NEU: Anlagen IDs
        let anlagenIDs = [];
        if (currentSaw.linked_anlagen) {
            anlagenIDs = currentSaw.linked_anlagen.map(a => a.anlID);
        }
        
        currentSaw.schritte = [];
        const rows = document.querySelectorAll('#stepTableBody tr');
        rows.forEach(row => {
            let foundText = false;
            // Iterate inputs
            row.querySelectorAll('.step-input').forEach(ta => {
                if (ta.value.trim() !== '') {
                    currentSaw.schritte.push({
                        ecol: parseInt(ta.dataset.col),
                        etext: ta.value
                    });
                    foundText = true;
                }
            });
            
            // Keep empty rows as placeholders if desired? 
            if (!foundText) {
                // Determine if we save empty rows. Let's save them to keep layout.
                currentSaw.schritte.push({
                    ecol: 1,
                    etext: ''
                });
            }
        });
        
        // FIX: Auch die Anlagen-Header (Spaltenüberschriften) aus den Inputs holen!
        for(let i=0; i<MAX_COLS; i++) {
             const inp = document.getElementById(`header-anl-${i}`);
             if(inp) {
                 if(!currentSaw.anlagen[i]) currentSaw.anlagen[i] = {};
                 currentSaw.anlagen[i].bez = inp.value;
             }
        }

        fetch('api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'save_saw',
                data: {
                    ...currentSaw,
                    linked_zellen_ids: zellenIDs,
                    linked_anlagen_ids: anlagenIDs // NEU
                }
            })
        })
        .then(res => res.text()) // Erst als Text, damit wir Fehler sehen
        .then(text => {
            if(!text) throw new Error("Server antwortete leer (PHP Error?)");
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error("Server Response:", text);
                throw new Error("Ungültige Server-Antwort: " + text.substring(0, 50) + "...");
            }
        })
        .then(res => {
            if(res.success) {
                switchView('list');
            } else {
                alert("Fehler beim Speichern (DB): " + res.error);
            }
        })
        .catch(err => alert("Netzwerkfehler: " + err.message));
    }

    window.deleteCurrentSaw = function() {
        // Sicherheitshalber Nummer direkt aus dem Input-Feld holen, falls Objekt nicht aktuell
        let nrToDelete = null;
        const inpSawNr = document.getElementById('inpSawNr');
        
        if (inpSawNr && inpSawNr.value) {
            nrToDelete = inpSawNr.value;
        } else if (currentSaw && currentSaw.saw_nr) {
            nrToDelete = currentSaw.saw_nr;
        }

        if(!nrToDelete) {
            alert("Fehler: Keine SAW-Nummer gefunden. Bitte öffnen Sie die Schaltanweisung erneut.");
            return;
        }

        if(!confirm("Möchten Sie Schaltanweisung " + nrToDelete + " wirklich LÖSCHEN?\nDies kann nicht rückgängig gemacht werden!")) return;
        
        // Button Feedback
        const btnDelete = document.getElementById('btnDeleteSaw');
        if(btnDelete) { btnDelete.disabled = true; btnDelete.innerText = "Lösche..."; }

        fetch('api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'delete_saw',
                nr: nrToDelete
            })
        })
        .then(res => res.text()) // Erst als Text, um HTML-Fehler von PHP to sehen
        .then(text => {
            try {
                return JSON.parse(text);
            } catch(e) {
                console.error("Server Response (kein JSON):", text);
                throw new Error("Server-Fehler: " + text.substring(0, 100));
            }
        })
        .then(res => {
            if(res.success) {
                showNotification("Schaltanweisung " + nrToDelete + " gelöscht", "success");
                switchView('list');
            } else {
                alert("Löschen fehlgeschlagen: " + res.error);
                if(btnDelete) { btnDelete.disabled = false; btnDelete.innerText = "Löschen"; }
            }
        })
        .catch(err => {
            console.error(err);
            alert("Netzwerkfehler beim Löschen: " + err.message);
            if(btnDelete) { btnDelete.disabled = false; btnDelete.innerText = "Löschen"; }
        });
    }

}); // End DOMContentLoaded
