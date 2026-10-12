// Warten, bis der DOM vollständig geladen ist, bevor der Code ausgeführt wird
document.addEventListener('DOMContentLoaded', () => {
  // Mobile Navigation Toggle
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

  const gesamtForm = document.getElementById('telefonbuchGesamtForm');
  const notificationContainer = document.getElementById('notification-container-telefonbuch');
  const notificationMessage = document.getElementById('notification-message-telefonbuch');

  const overviewTableBody = document.querySelector('#telefonbuch-uebersicht tbody');

  // IDs der Namens-Eingabefelder im Telefonbuch
  const nameInputIds = [
    'name_Vertreter',
    'name_6747',
    'name_6749',
    'name_6721',
    'name_6012'
  ];

  const telefonNummern = [
    { key: 'Vertreter', label: 'Vertreter' },
    { key: '6747', label: '6747' },
    { key: '6749', label: '6749' },
    { key: '6721', label: '6721' },
    { key: '6012', label: '6012' }
  ];

  // Co-Warner-Nummern laut Tabelle
  const cowarnerNumbers = ['7004', '1737', '2306', '0509', 'ARTD1836', '6979', '0511', '5705', '7005', '1824'];
  const cowarnerInputIds = cowarnerNumbers.map(num => `cowarner_${num}`);

  function showTelefonbuchNotification(message, duration = 2000) {
    if (notificationContainer && notificationMessage) {
      notificationMessage.textContent = message;
      notificationContainer.style.backgroundColor = '#4CAF50';
      notificationContainer.classList.add('show');
      setTimeout(() => {
        notificationContainer.classList.remove('show');
      }, duration);
    }
  }

  function updateOverviewTable(telefonbuchData, cowarnerData) {
    if (!overviewTableBody) return;
    overviewTableBody.innerHTML = '';

    // Map von Name -> { handyNummer, cowarnerNummer }
    const overviewMap = new Map();

    telefonNummern.forEach(entry => {
      const name = telefonbuchData[entry.key] || '';
      if (!name) return;
      if (!overviewMap.has(name)) {
        overviewMap.set(name, { handy: [], cowarner: [] });
      }
      overviewMap.get(name).handy.push(entry.label);
    });

    cowarnerNumbers.forEach(num => {
      const name = cowarnerData[num] || '';
      if (!name) return;
      if (!overviewMap.has(name)) {
        overviewMap.set(name, { handy: [], cowarner: [] });
      }
      overviewMap.get(name).cowarner.push(num);
    });

    // Zeilen erzeugen: Name | Handys | Co-Warner | Aktion
    overviewMap.forEach((value, name) => {
      const handyText = value.handy.join(', ');
      const cowarnerText = value.cowarner.join(', ');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${name}</td>
        <td>${handyText}</td>
        <td>${cowarnerText}</td>
        <td><button class="btn-zurueckgeben" data-name="${name}">Zurückgeben</button></td>`;
      overviewTableBody.appendChild(tr);
    });
  }

  let currentTelefonbuchData = {};
  let currentCowarnerData = {};

  // Lade Telefonbuch- und Co-Warner-Daten vom Server
  fetch('/api/load_telefonbuch')
    .then(response => response.json())
    .then(data => {
      const telData = data.telefonbuch || data || {};
      currentTelefonbuchData = telData;
      for (const nummer in telData) {
        const el = document.getElementById(`name_${nummer}`);
        if (el) el.value = telData[nummer];
      }

      const cowData = data.cowarner || {};
      currentCowarnerData = cowData;
      cowarnerNumbers.forEach(num => {
        const el = document.getElementById(`cowarner_${num}`);
        if (el && cowData[num] !== undefined) el.value = cowData[num];
      });

      updateOverviewTable(currentTelefonbuchData, currentCowarnerData);
    })
    .catch(error => console.error('Fehler beim Laden des Telefonbuchs:', error));

  function collectTelefonbuchData() {
    return {
      Vertreter: document.getElementById('name_Vertreter')?.value || '',
      6747: document.getElementById('name_6747')?.value || '',
      6749: document.getElementById('name_6749')?.value || '',
      6721: document.getElementById('name_6721')?.value || '',
      6012: document.getElementById('name_6012')?.value || ''
    };
  }

  function collectCowarnerData() {
    const result = {};
    cowarnerNumbers.forEach(num => {
      const el = document.getElementById(`cowarner_${num}`);
      result[num] = el ? el.value : '';
    });
    return result;
  }

  function saveTelefonbuchAndCowarner(extraLogInfo = null) {
    const telefonbuchData = collectTelefonbuchData();
    const cowarnerData = collectCowarnerData();
    const loggedInUserId = localStorage.getItem('userId');

    currentTelefonbuchData = telefonbuchData;
    currentCowarnerData = cowarnerData;
    updateOverviewTable(currentTelefonbuchData, currentCowarnerData);

    return fetch('/api/save_telefonbuch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telefonbuch: telefonbuchData,
        cowarner: cowarnerData,
        userId: loggedInUserId ? parseInt(loggedInUserId, 10) : null,
        logDetails: true,
        logAction: extraLogInfo
      })
    });
  }

  if (gesamtForm) {
    gesamtForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveTelefonbuchAndCowarner()
        .then(response => response.json())
        .then(data => {
          showTelefonbuchNotification(data.message || 'Telefonnummern und Co-Warner gespeichert.');
        })
        .catch(error => console.error('Fehler beim Speichern der Daten:', error));
    });
  }

  // Übersicht: Rückgabe-Buttons behandeln
  if (overviewTableBody) {
    overviewTableBody.addEventListener('click', (event) => {
      const target = event.target;
      if (target.classList.contains('btn-zurueckgeben')) {
        const name = target.dataset.name;
        if (!name) return;

        // Alle passenden Handy- und Co-Warner-Felder leeren
        telefonNummern.forEach(entry => {
          if (currentTelefonbuchData[entry.key] === name) {
            const inputId = entry.key === 'Vertreter' ? 'name_Vertreter' : `name_${entry.key}`;
            const input = document.getElementById(inputId);
            if (input) input.value = '';
            currentTelefonbuchData[entry.key] = '';
          }
        });

        cowarnerNumbers.forEach(num => {
          if (currentCowarnerData[num] === name) {
            const input = document.getElementById(`cowarner_${num}`);
            if (input) input.value = '';
            currentCowarnerData[num] = '';
          }
        });

        saveTelefonbuchAndCowarner({ type: 'return', entryType: 'all', key: null, userName: name })
          .then(res => res.json())
          .then(data => {
            showTelefonbuchNotification(data.message || 'Geräte/Warner zurückgegeben.');
          })
          .catch(err => console.error('Fehler beim Zurückgeben:', err));
      }
    });
  }

  // RFID-Handling für alle relevanten Felder (Telefonbuch + Co-Warner)
  const allRfidInputs = [...nameInputIds, ...cowarnerInputIds];

  allRfidInputs.forEach(inputId => {
    const inputField = document.getElementById(inputId);
    if (inputField) {
      let debounceTimer;
      inputField.addEventListener('input', async (event) => {
        const currentValue = event.target.value.trim();
        clearTimeout(debounceTimer);
        
        debounceTimer = setTimeout(async () => {
            if (currentValue && currentValue.length >= 4 && !currentValue.includes(' ')) {
              try {
                const response = await fetch('/api/load_mitarbeiter');
                if (!response.ok) {
                  console.error('Fehler beim Laden der Mitarbeiter für die RFID-Namenssuche.');
                  return;
                }
                const mitarbeiterData = await response.json();
                const foundMitarbeiter = mitarbeiterData.find(m => String(m.rfid).trim() === currentValue);
                if (foundMitarbeiter) {
                  event.target.value = foundMitarbeiter.name;
                  const type = inputId.startsWith('cowarner_') ? 'cowarner' : 'handy';
                  const key = inputId.startsWith('cowarner_') ? inputId.replace('cowarner_', '') : (inputId === 'name_Vertreter' ? 'Vertreter' : inputId.replace('name_', ''));
                  saveTelefonbuchAndCowarner({ type: 'take', entryType: type, key, userName: foundMitarbeiter.name })
                    .then(response => response.json())
                    .then(data => {
                      showTelefonbuchNotification(data.message || 'Daten automatisch gespeichert.');
                    })
                    .catch(error => console.error('Fehler beim automatischen Speichern:', error));
                }
              } catch (error) {
                console.error('Fehler bei der RFID-Namenssuche:', error);
              }
            }
        }, 200); // 200ms warten
      });

      inputField.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
        }
      });
    }
  });

  // Clear-Buttons für alle Felder
  const clearButtons = document.querySelectorAll('.clear-input-btn');
  clearButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetInputId = button.dataset.target;
      const targetInput = document.getElementById(targetInputId);
      if (targetInput) {
        targetInput.value = '';
        targetInput.focus();
      }
    });
  });

  // Theme Toggle Funktionalität
  const themeToggle = document.getElementById('theme-toggle');
  
  // Theme aus localStorage laden oder Standard setzen
  const currentTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  
  // Theme Toggle Button Text aktualisieren
  function updateThemeToggleButton() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      if (themeToggle) {
          themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
          themeToggle.title = currentTheme === 'dark' ? 'Light Mode aktivieren' : 'Dark Mode aktivieren';
      }
  }
  
  // Initiales Update des Buttons
  updateThemeToggleButton();

  // Theme Toggle Event Listener
  if (themeToggle) {
      themeToggle.addEventListener('click', function() {
          const currentTheme = document.documentElement.getAttribute('data-theme');
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          
          document.documentElement.setAttribute('data-theme', newTheme);
          localStorage.setItem('theme', newTheme);
          updateThemeToggleButton();
      });
      
      // Hover-Effekt für Theme Toggle Button
      themeToggle.addEventListener('mouseenter', function() {
          this.style.transform = 'scale(1.1) translateY(-1px)';
          this.style.boxShadow = '0 6px 16px rgba(107, 70, 193, 0.4)';
      });
      
      themeToggle.addEventListener('mouseleave', function() {
          this.style.transform = 'scale(1) translateY(0)';
          this.style.boxShadow = '0 4px 12px rgba(107, 70, 193, 0.3)';
      });
  }
});
