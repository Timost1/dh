document.addEventListener('DOMContentLoaded', () => {
    // --- Konstanten ---
    const API_URL = '../Lagerverwaltung/api.php';

    // --- Theme Toggle ---
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        if (document.documentElement.classList.contains('dark')) {
            localStorage.theme = 'dark';
        } else {
            localStorage.theme = 'light';
        }
    });

    // --- Modals Steuerung ---
    const loginModal = document.getElementById('login-modal');
    const logoutModal = document.getElementById('logout-modal');
    const notifModal = document.getElementById('notifications-modal');
    
    // --- Buttons ---
    const loginBtn = document.getElementById('login-btn');
    const logoutSidebarBtn = document.querySelector('a[href="#"] .text-error-rose')?.parentElement; // Sidebar Logout
    const btnCancelLogin = document.getElementById('btn-cancel-login');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const btnCancelLogout = document.getElementById('btn-cancel-logout');
    const btnConfirmLogout = document.getElementById('btn-confirm-logout');
    const notifBtn = document.getElementById('btn-notifications');
    const userProfile = document.getElementById('user-profile');
    
    const rfidInput = document.getElementById('login-rfid');
    const loginError = document.getElementById('login-error');

    // Aktueller User State
    let currentUser = null;

    // --- Badge Polling ---
    const checkNotificationsBadge = () => {
        const badge = document.getElementById('notification-badge');
        if (!currentUser) {
            badge?.classList.add('hidden');
            return;
        }

        const isLagermensch = (currentUser.Lagermensch || currentUser.isAdmin) ? 1 : 0;
        
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'get_my_notifications',
                user_name: currentUser.name,
                schicht: currentUser.schicht || 'A',
                is_lagermensch: isLagermensch
            })
        })
        .then(r => r.json())
        .then(res => {
            if(res.success && res.data && res.data.length > 0) {
                // Filtere nach ungelesenen/offenen Status
                const unread = res.data.filter(n => {
                    if (isLagermensch) return n.status === 'NEU';
                    return n.status !== 'ABGESCHLOSSEN';
                });
                
                if(unread.length > 0) {
                    badge?.classList.remove('hidden');
                } else {
                    badge?.classList.add('hidden');
                }
            } else {
                badge?.classList.add('hidden');
            }
        })
        .catch(() => {});
    };

    // Auto-Polling alle 30 Sekunden
    setInterval(checkNotificationsBadge, 30000);

    // --- Helferfunktion zur UI-Aktualisierung ---
    const setCurrentUser = (user) => {
        currentUser = user;
        loginModal.classList.add('hidden');
        loginBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        userProfile.classList.add('flex');
        
        const nameEl = userProfile.querySelector('p.text-on-surface');
        const roleEl = userProfile.querySelector('p.text-on-surface-variant');
        if(nameEl) nameEl.innerText = user.name || 'Mitarbeiter';
        if(roleEl) {
            roleEl.innerText = user.isAdmin ? 'Administrator' : (user.Meister ? 'Meister' : (user.Lagermensch ? 'Lagermitarbeiter' : 'Mitarbeiter'));
        }

        // Direkt auf Benachrichtigungen prüfen
        checkNotificationsBadge();
    };

    // --- Initialer Auth-Check ---
    fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_auth' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.user) {
            setCurrentUser(data.user);
        }
    }).catch(err => console.error("API Error (check_auth):", err));

    // --- Anmelden ---
    loginBtn?.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
        rfidInput.value = '';
        loginError.classList.add('hidden');
        setTimeout(() => rfidInput.focus(), 100);
    });

    btnCancelLogin?.addEventListener('click', () => loginModal.classList.add('hidden'));
    
    const tryLogin = () => {
        const val = rfidInput.value.trim();
        if(val.length > 0) {
            btnSubmitLogin.disabled = true;
            btnSubmitLogin.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Bitte warten...`;

            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', rfid: val })
            })
            .then(r => r.json())
            .then(data => {
                btnSubmitLogin.disabled = false;
                btnSubmitLogin.innerHTML = `Authentifizieren <span class="material-symbols-outlined text-[18px]">arrow_forward</span>`;
                
                if (data.success && data.user) {
                    setCurrentUser(data.user);
                    showToast('Erfolgreich angemeldet: ' + (data.user.name || 'Mitarbeiter'), 'success');
                } else {
                    loginError.innerText = data.error || 'Ungültiger Ausweis/PIN';
                    loginError.classList.remove('hidden');
                    rfidInput.value = '';
                    rfidInput.focus();
                }
            })
            .catch(err => {
                btnSubmitLogin.disabled = false;
                btnSubmitLogin.innerHTML = `Authentifizieren <span class="material-symbols-outlined text-[18px]">arrow_forward</span>`;
                loginError.innerText = 'Verbindungsfehler zur Datenbank.';
                loginError.classList.remove('hidden');
            });
        }
    };

    btnSubmitLogin?.addEventListener('click', tryLogin);
    rfidInput?.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') tryLogin();
    });

    // --- Abmelden ---
    const requestLogout = (e) => {
        if(e) e.preventDefault();
        if(currentUser) {
            logoutModal.classList.remove('hidden');
        }
    };

    userProfile?.addEventListener('click', requestLogout);
    logoutSidebarBtn?.addEventListener('click', requestLogout);

    btnCancelLogout?.addEventListener('click', () => logoutModal.classList.add('hidden'));
    
    btnConfirmLogout?.addEventListener('click', () => {
        btnConfirmLogout.disabled = true;
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        })
        .then(() => {
            btnConfirmLogout.disabled = false;
            currentUser = null;
            logoutModal.classList.add('hidden');
            userProfile.classList.add('hidden');
            userProfile.classList.remove('flex');
            loginBtn.classList.remove('hidden');
            showToast('Erfolgreich abgemeldet.', 'info');
        })
        .catch(() => btnConfirmLogout.disabled = false);
    });

    // --- Benachrichtigungen ---
    notifBtn?.addEventListener('click', () => {
        notifModal.classList.remove('hidden');
        populateNotifications();
    });

    const formatTimeAgo = (dateString) => {
        const d = new Date(dateString);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        
        if(diffMins < 1) return 'Gerade eben';
        if(diffMins < 60) return `Vor ${diffMins} Min.`;
        const diffHours = Math.floor(diffMins / 60);
        if(diffHours < 24) return `Vor ${diffHours} Std.`;
        const diffDays = Math.floor(diffHours / 24);
        return `Vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    };

    const populateNotifications = () => {
        const list = document.getElementById('notification-list');
        list.innerHTML = `<div class="flex items-center justify-center py-8"><span class="material-symbols-outlined animate-spin text-brand-indigo">refresh</span></div>`;
        
        if(!currentUser) {
            list.innerHTML = `
                <div class="text-center py-8 text-on-surface-variant flex flex-col items-center">
                    <span class="material-symbols-outlined text-4xl mb-2 opacity-50">lock</span>
                    <p class="text-sm">Bitte anmelden, um Meldungen zu sehen.</p>
                </div>
            `;
            return;
        }

        const isLagermensch = currentUser.Lagermensch || currentUser.isAdmin ? 1 : 0;
        
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'get_my_notifications',
                user_name: currentUser.name,
                schicht: currentUser.schicht || 'A',
                is_lagermensch: isLagermensch
            })
        })
        .then(r => r.json())
        .then(res => {
            document.getElementById('notification-badge').classList.add('hidden');
            if(!res.success || !res.data || res.data.length === 0) {
                clearAllNotifications();
                return;
            }

            // Wir zeigen nur Meldungen an, die wirklich z.B. Bestellungen / System-Alerts aus der DB sind
            list.innerHTML = res.data.map(n => {
                const color = n.status === 'NEU' ? 'text-brand-indigo' : (n.status === 'ABGESCHLOSSEN' ? 'text-success-emerald' : 'text-on-surface');
                const borderClass = n.status === 'NEU' ? 'border-l-4 border-l-brand-indigo' : '';
                return `
                <div class="bg-surface p-4 rounded-xl border border-glass-border ${borderClass}">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[10px] font-bold ${color} uppercase tracking-widest">${n.schicht || 'System'} | ${n.status}</span>
                        <span class="text-[10px] text-on-surface-variant">${formatTimeAgo(n.zeitpunkt)}</span>
                    </div>
                    <p class="text-sm text-on-surface font-medium">${n.user_name || 'Unbekannt'} hat eine Bestellung aktualisiert/getätigt.</p>
                    ${n.bemerkung ? `<p class="text-xs text-on-surface-variant mt-2 italic">"${n.bemerkung}"</p>` : ''}
                </div>
                `;
            }).join('');
        })
        .catch(err => {
            console.error(err);
            list.innerHTML = `<div class="text-center py-4 text-error-rose text-sm">Fehler beim Laden.</div>`;
        });
    };

    window.clearAllNotifications = () => {
        document.getElementById('notification-list').innerHTML = `
            <div class="text-center py-8 text-on-surface-variant flex flex-col items-center">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-50">done_all</span>
                <p class="text-sm">Keine neuen Meldungen.</p>
            </div>
        `;
    };

    // --- Toasts (Utility) ---
    window.showToast = (msg, type = 'info') => {
        const container = document.getElementById('toast-container');
        if(!container) return;

        const el = document.createElement('div');
        const isSuccess = type === 'success';
        const color = isSuccess ? 'text-success-emerald' : 'text-brand-indigo';
        const border = isSuccess ? 'border-success-emerald/30' : 'border-brand-indigo/30';
        const icon = isSuccess ? 'check_circle' : 'info';

        el.className = `bg-surface-container/90 backdrop-blur-md border ${border} p-4 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in-up w-80 pointer-events-auto`;
        el.innerHTML = `
            <span class="material-symbols-outlined ${color}">${icon}</span>
            <p class="text-sm font-medium text-on-surface flex-1">${msg}</p>
        `;
        
        container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(10px) scale(0.95)';
            el.style.transition = 'all 0.3s ease';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    };

    // --- Wetter API (Open-Meteo / DWD) ---
    const fetchWeather = async () => {
        try {
            // Koordinaten für Dillingen/Saar
            const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=49.35&longitude=6.72&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=Europe%2FBerlin');
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            const current = data.current;

            const temp = Math.round(current.temperature_2m);
            const humidity = current.relative_humidity_2m;
            const windSpeed = Math.round(current.wind_speed_10m);
            const windDir = current.wind_direction_10m;
            const code = current.weather_code;

            // Windrichtung in Himmelsrichtung umwandeln
            const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
            const dirStr = dirs[Math.round(windDir / 45) % 8];

            // WMO Wetter-Code auf Icons/Texte mappen
            let icon = 'partly_cloudy_day';
            let desc = 'Unbekannt';
            
            if (code === 0) { icon = 'sunny'; desc = 'Klar'; }
            else if (code === 1) { icon = 'partly_cloudy_day'; desc = 'Leicht bewölkt'; }
            else if (code === 2) { icon = 'partly_cloudy_day'; desc = 'Teils bewölkt'; }
            else if (code === 3) { icon = 'cloud'; desc = 'Bedeckt'; }
            else if (code === 45 || code === 48) { icon = 'foggy'; desc = 'Nebel'; }
            else if (code >= 51 && code <= 67) { icon = 'rainy'; desc = 'Regen'; }
            else if (code >= 71 && code <= 77) { icon = 'cloud_snow'; desc = 'Schnee'; }
            else if (code >= 80 && code <= 82) { icon = 'rainy'; desc = 'Regenschauer'; }
            else if (code >= 85 && code <= 86) { icon = 'cloud_snow'; desc = 'Schneeschauer'; }
            else if (code >= 95 && code <= 99) { icon = 'thunderstorm'; desc = 'Gewitter'; }

            document.getElementById('weather-temp').innerText = `${temp}°C`;
            document.getElementById('weather-desc').innerText = desc;
            document.getElementById('weather-icon').innerText = icon;
            document.getElementById('weather-wind').innerText = `${windSpeed} km/h ${dirStr}`;
            document.getElementById('weather-humidity').innerText = `${humidity}%`;
        } catch (e) {
            console.error("Wetter konnte nicht geladen werden:", e);
            document.getElementById('weather-desc').innerText = "Fehler";
        }
    };

    fetchWeather(); // Direkt beim Laden ausführen
    setInterval(fetchWeather, 30 * 60 * 1000); // Alle 30 Minuten aktualisieren

    // --- TAGESPLAN LADEN ---
    const loadTagesplan = () => {
        const d = new Date();
        const yyyy = d.getFullYear();
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        
        const heuteStrISO = `${yyyy}-${mm}-${dd}`;
        const heuteStrEU = `${dd}.${mm}.${yyyy}`;
        const heuteStrShort = `${d.getDate()}.${d.getMonth() + 1}.${yyyy}`;

        const tageNamen = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
        document.getElementById('tagesplan-datum').innerText = `${tageNamen[d.getDay()]}, ${heuteStrEU}`;

        // Versuche das JSON zuerst im Hauptverzeichnis (../wochenplan.json) und dann lokal (wochenplan.json)
        const fetchPlan = async () => {
            try {
                const res1 = await fetch('../wochenplan.json?t=' + new Date().getTime());
                if(res1.ok) return await res1.json();
            } catch(e) {}
            
            const res2 = await fetch('wochenplan.json?t=' + new Date().getTime());
            if(res2.ok) return await res2.json();
            
            throw new Error("Wochenplan JSON nicht gefunden");
        };

        fetchPlan()
            .then(data => {
                let planHeute = { F: [], M: [], N: [] };
                let gefundeneDaten = null;
                
                // Fall 1: Array (z.B. Kalender-Events)
                if (Array.isArray(data)) {
                    // Prüfen ob es eine Liste von einzelnen Events (FullCalendar Style) ist
                    if (data.length > 0 && ('title' in data[0])) {
                        const eventsToday = data.filter(e => e.start === heuteStrISO || e.date === heuteStrISO || e.datum === heuteStrISO || e.datum === heuteStrEU);
                        if (eventsToday.length > 0) {
                            gefundeneDaten = true;
                            eventsToday.forEach(e => {
                                let s = (e.schicht || e.resourceId || e.groupId || 'F').toString().toUpperCase();
                                let target = planHeute.F;
                                if (s.startsWith('M') || s.includes('MITTAG')) target = planHeute.M;
                                else if (s.startsWith('N') || s.includes('NACHT')) target = planHeute.N;
                                target.push(e.title);
                            });
                        }
                    } else {
                        // Standard Array mit Datum-Keys (Tagesobjekte)
                        const hit = data.find(item => 
                            item.datum === heuteStrISO || item.date === heuteStrISO || 
                            item.datum === heuteStrEU || item.date === heuteStrEU ||
                            item.datum === heuteStrShort || item.date === heuteStrShort
                        );
                        if (hit) gefundeneDaten = hit;
                    }
                } 
                // Fall 2: Objekt mit Datums-Keys
                else {
                    gefundeneDaten = data[heuteStrISO] || data[heuteStrEU] || data[heuteStrShort];
                }

                // Wenn Tagesobjekt gefunden wurde, entpacken wir es
                if (gefundeneDaten && typeof gefundeneDaten === 'object' && !planHeute.F.length && !planHeute.M.length && !planHeute.N.length) {
                    let obj = gefundeneDaten;
                    if (obj.schichten) obj = obj.schichten;
                    if (obj.shifts) obj = obj.shifts;
                    
                    const fVal = obj['F'] || obj['f'] || obj['Früh'] || obj['Frueh'] || obj['früh'] || obj['Frühschicht'] || obj['1'] || [];
                    const mVal = obj['M'] || obj['m'] || obj['Mittag'] || obj['mittag'] || obj['Mittagsschicht'] || obj['2'] || [];
                    const nVal = obj['N'] || obj['n'] || obj['Nacht'] || obj['nacht'] || obj['Nachtschicht'] || obj['3'] || [];
                    
                    planHeute.F = fVal;
                    planHeute.M = mVal;
                    planHeute.N = nVal;
                }

                const cFrueh = document.getElementById('tp-frueh');
                const cMittag = document.getElementById('tp-mittag');
                const cNacht = document.getElementById('tp-nacht');

                const renderSchicht = (container, schichtDaten) => {
                    container.innerHTML = '';
                    
                    // Hilfsfunktion: Text (mit \n oder <br>) oder Arrays sicher in ein Array wandeln
                    let datenArray = [];
                    if (Array.isArray(schichtDaten)) {
                        datenArray = schichtDaten;
                    } else if (typeof schichtDaten === 'string') {
                        datenArray = schichtDaten.split(/\r?\n|<br\s*\/?>/i).map(s => s.replace(/<[^>]*>?/gm, '').trim()).filter(s => s.length > 0);
                    } else if (schichtDaten) {
                        datenArray = [String(schichtDaten)];
                    }

                    if (!datenArray || datenArray.length === 0) {
                        container.innerHTML = `<div class="h-full min-h-[80px] flex flex-col items-center justify-center border-2 border-dashed border-glass-border rounded-2xl bg-white/[0.02]">
                            <p class="text-on-surface-variant italic font-body-md text-center px-4 text-[12px]">-</p>
                        </div>`;
                        return;
                    }

                    let html = '<div class="space-y-2">';
                    datenArray.forEach(task => {
                        html += `
                        <div class="group/task p-3 hover:bg-white/5 rounded-xl border border-transparent hover:border-glass-border transition-all">
                            <p class="font-medium text-sm text-on-surface flex items-start gap-2">
                                <span class="w-1.5 h-1.5 min-w-[6px] mt-1.5 rounded-full bg-primary/60"></span>
                                <span>${task}</span>
                            </p>
                        </div>`;
                    });
                    html += '</div>';
                    container.innerHTML = html;
                };

                // Wenn Daten da sind, rendern
                renderSchicht(cFrueh, planHeute.F);
                renderSchicht(cMittag, planHeute.M);
                renderSchicht(cNacht, planHeute.N);

            })
            .catch(err => {
                console.error("Wochenplan nicht gefunden oder fehlerhaft:", err);
                const msg = `<p class="text-xs text-error-rose italic text-center py-4">Kein Plan gefunden</p>`;
                document.getElementById('tp-frueh').innerHTML = msg;
                document.getElementById('tp-mittag').innerHTML = msg;
                document.getElementById('tp-nacht').innerHTML = msg;
            });
    };

    loadTagesplan();

    // --- Telefonnummern Zuweisung ---
    const phoneEditModal = document.getElementById('phone-edit-modal');
    const phoneEditId = document.getElementById('phone-edit-id');
    const phoneEditSubtitle = document.getElementById('phone-edit-subtitle');
    const phoneEditName = document.getElementById('phone-edit-name');
    const phoneEditRfid = document.getElementById('phone-edit-rfid');
    const phoneEditError = document.getElementById('phone-edit-error');
    
    let currentPhoneEl = null;

    // Gespeicherte Telefonzuweisungen aus der Datenbank laden
    const loadPhones = () => {
        fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_phones' })
        })
        .then(r => r.json())
        .then(res => {
            if (res.success && res.data) {
                document.querySelectorAll('.phone-item').forEach(item => {
                    const num = item.dataset.num;
                    if (res.data[num]) {
                        item.querySelector('.phone-name').innerText = ': ' + res.data[num];
                    }
                });
            }
        })
        .catch(err => console.error('Fehler beim Laden der Telefonnummern:', err));
    };

    // Telefonnummern beim Start laden
    loadPhones();

    document.querySelectorAll('.phone-item').forEach(item => {
        const num = item.dataset.num;
        const nameEl = item.querySelector('.phone-name');
        
        // Bei Klick: Modal öffnen
        item.addEventListener('click', () => {
            currentPhoneEl = nameEl;
            phoneEditId.value = num;
            phoneEditSubtitle.innerText = num === 'Vertretung' ? 'Für: Vertretung' : `Für Durchwahl: ${num}`;
            
            let currentName = nameEl.innerText.replace(':', '').trim();
            if (currentName === '-') currentName = '';
            
            phoneEditName.value = currentName;
            phoneEditRfid.value = '';
            phoneEditError.classList.add('hidden');
            
            phoneEditModal.classList.remove('hidden');
            // Fokus auf RFID für schnelles Scannen
            setTimeout(() => phoneEditRfid.focus(), 100);
        });
    });

    document.getElementById('btn-cancel-phone')?.addEventListener('click', () => {
        phoneEditModal.classList.add('hidden');
    });

    const savePhoneAssignment = () => {
        const num = phoneEditId.value;
        let name = phoneEditName.value.trim();
        if (!name) name = '-';
        
        fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_phone', num: num, name: name })
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                if (currentPhoneEl) {
                    currentPhoneEl.innerText = ': ' + name;
                }
                phoneEditModal.classList.add('hidden');
                showToast('Zuweisung aktualisiert.', 'success');
            } else {
                showToast('Fehler beim Speichern.', 'error');
            }
        })
        .catch(err => showToast('Verbindungsfehler.', 'error'));
    };

    document.getElementById('btn-save-phone')?.addEventListener('click', savePhoneAssignment);
    phoneEditName?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') savePhoneAssignment();
    });

    // Ausweis am Scanner lesen
    phoneEditRfid?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = phoneEditRfid.value.trim();
            if (val.length > 0) {
                phoneEditError.classList.add('hidden');
                
                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', rfid: val })
                })
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.user) {
                        // Bei erfolgreichem Scan direkt den Namen eintragen und speichern
                        phoneEditName.value = data.user.name || 'Mitarbeiter';
                        savePhoneAssignment();
                    } else {
                        phoneEditError.innerText = 'Ausweis nicht erkannt.';
                        phoneEditError.classList.remove('hidden');
                        phoneEditRfid.value = '';
                        phoneEditRfid.focus();
                    }
                })
                .catch(err => {
                    phoneEditError.innerText = 'Fehler bei der Abfrage.';
                    phoneEditError.classList.remove('hidden');
                });
            }
        }
    });

});
