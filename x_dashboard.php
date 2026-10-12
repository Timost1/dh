<?php
/**
 * Dashboard Seite (PHP Version)
 */
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fremdfirmen-Management - Dashboard</title>
    <link rel="stylesheet" href="startseite.css">
    <link rel="stylesheet" href="mb_compatibility.css">
    <style>
        /* Modernes Corporate-Theme */
        :root {
            --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            --color-accent: #0d6efd;           /* Primär-Akzent (Corporate Blau) */
            --color-accent-hover: #0b5ed7;
            --color-primary: #1f2937;          /* Primärtext */
            --color-secondary: #6b7280;        /* Sekundärtext */
            --bg-primary: #ffffff;             /* Seiten-Hintergrund */
            --bg-secondary: #f8fafc;           /* Karten/Container */
            --border-color: #e5e7eb;           /* Rahmen/Füller */
            --border-radius: 12px;
            --border-radius-small: 8px;
            --shadow: 0 1px 2px rgba(0,0,0,0.05);
            --shadow-hover: 0 8px 24px rgba(0,0,0,0.12);
            --transition: all .2s ease;
            --header-h: 64px;                  /* konsistente Headerhöhe */
        }
        [data-theme="dark"] {
            --color-primary: #e5e7eb;
            --color-secondary: #9ca3af;
            --bg-primary: #0f172a;
            --bg-secondary: #111827;
            --border-color: rgba(255,255,255,0.08);
            --shadow: 0 1px 2px rgba(0,0,0,0.4);
            --shadow-hover: 0 8px 24px rgba(0,0,0,0.35);
        }

        /* Basis */
        *, *::before, *::after { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
            font-family: var(--font-sans);
            color: var(--color-primary);
            background: var(--bg-primary);
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            margin: 0;
        }
        a { color: inherit; text-decoration: none; }

        /* Header */
        header {
            position: sticky;
            top: 0;
            z-index: 50;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: var(--header-h);
            padding: 0 24px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            box-shadow: var(--shadow);
        }
        header h1 { font-size: 1.25rem; font-weight: 700; margin: 0; letter-spacing: .2px; }
        .theme-toggle {
            background: var(--bg-primary);
            color: var(--color-primary);
            border: 1px solid var(--border-color);
            border-radius: 9999px;
            width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
            cursor: pointer; transition: var(--transition);
            box-shadow: var(--shadow);
        }
        .theme-toggle:hover { transform: translateY(-1px); box-shadow: var(--shadow-hover); }

        /* Sidebar/Layout */
        .sidebar {
            position: fixed;
            top: var(--header-h);
            bottom: 0;
            width: 260px;
            padding: 16px 12px;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            overflow-y: auto;
        }
        .sidebar h2 {
            font-size: .85rem; text-transform: uppercase; letter-spacing: .6px; color: var(--color-secondary);
            margin: 4px 8px 12px;
        }
        .sidebar ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
        .sidebar a {
            color: var(--color-primary);
            transition: var(--transition);
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
            border-radius: 8px;
        }
        .sidebar a:hover { background: rgba(13,110,253,0.08); }
        .sidebar a.active {
            background: rgba(13,110,253,0.10);
            border-left: 3px solid var(--color-accent);
        }

        main {
            margin-left: 260px;
            padding: 24px;
        }

        /* Statistiken */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 24px;
            text-align: center;
            box-shadow: var(--shadow);
            transition: var(--transition);
            position: relative;
            overflow: hidden;
        }
        .stat-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, var(--color-accent), var(--color-accent-hover));
        }
        .stat-number { font-size: 2.4rem; font-weight: 700; color: var(--color-accent); margin-bottom: 6px; display: block; }
        .stat-label { color: var(--color-secondary); font-size: .95em; font-weight: 500; }

        /* Karten/Container */
        .card { background: transparent; }
        .card-inner {
            padding: 24px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
        }
        h2.page-title { color: var(--color-primary); margin: 0 0 16px; font-size: 1.25rem; font-weight: 700; }

        /* Tabelle */
        .tickets-table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--bg-secondary); border-radius: var(--border-radius); overflow: hidden; box-shadow: var(--shadow); }
        .tickets-table th, .tickets-table td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
        .tickets-table th { background: var(--bg-secondary); color: var(--color-primary); font-weight: 700; font-size: .8rem; text-transform: uppercase; letter-spacing: .4px; border-bottom: 2px solid var(--border-color); }
        .tickets-table tbody tr { cursor: pointer; transition: var(--transition); }
        .tickets-table tbody tr:hover { background: rgba(13,110,253,0.08); }
        .tickets-table td .ticket-actions { white-space: nowrap; }

        /* Aktionen/Buttons */
        .ticket-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn-small {
            padding: 8px 12px; font-size: .85rem; border: 1px solid transparent; border-radius: var(--border-radius-small);
            cursor: pointer; transition: var(--transition); text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-primary { background: var(--color-accent); color: #fff; }
        .btn-primary:hover { background: var(--color-accent-hover); transform: translateY(-1px); }
        .btn-danger { background: #dc3545; color: #fff; }
        .btn-danger:hover { background: #c82333; transform: translateY(-1px); }

        /* Badges */
        .status-badge { padding: 4px 8px; border-radius: 999px; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; border: 1px solid transparent; }
        .status-angemeldet, .status-offen { background: rgba(25,135,84,0.1); color: #198754; border-color: rgba(25,135,84,0.25); }
        .status-abgemeldet, .status-geschlossen { background: rgba(220,53,69,0.08); color: #dc3545; border-color: rgba(220,53,69,0.25); }

        /* Modals */
        .modal { display: none; position: fixed; z-index: 1000; inset: 0; background-color: rgba(0,0,0,0.45); }
        .modal-content {
            background-color: var(--bg-secondary);
            margin: 8vh auto; padding: 24px; border: 1px solid var(--border-color);
            border-radius: var(--border-radius); width: 92%; max-width: 640px; box-shadow: var(--shadow-hover);
        }

        /* Formulare */
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--color-primary); }
        .form-group input, .form-group textarea {
            width: 100%; padding: 12px 14px; background: var(--bg-primary); color: var(--color-primary);
            border: 1px solid var(--border-color); border-radius: var(--border-radius-small); outline: none; transition: var(--transition);
        }
        .form-group input:focus, .form-group textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px rgba(13,110,253,0.15); }

        /* Primäre/sekundäre Buttons */
        .primary-btn { background: var(--color-accent); color: #fff; padding: 12px 20px; border: none; border-radius: var(--border-radius-small); cursor: pointer; font-size: 1rem; font-weight: 700; transition: var(--transition); }
        .primary-btn:hover { background: var(--color-accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-hover); }
        .secondary-btn { background: var(--bg-primary); color: var(--color-primary); padding: 12px 20px; border: 1px solid var(--border-color); border-radius: var(--border-radius-small); cursor: pointer; font-size: 1rem; transition: var(--transition); }
        .secondary-btn:hover { background: rgba(0,0,0,0.03); }

        /* Responsive */
        @media (max-width: 900px) {
            .sidebar { position: static; width: auto; border-right: 0; border-bottom: 1px solid var(--border-color); }
            main { margin-left: 0; padding: 16px; }
        }
    </style>
</head>
<body>

<header>
    <h1>Fremdfirmen Management</h1>
    <div class="header-controls">
        <button id="themeToggle" class="theme-toggle" title="Theme wechseln">
            <span class="theme-icon">🌙</span>
        </button>
    </div>
</header>

<div class="sidebar">
    <h2>Navigation</h2>
    <ul>
        <li><a href="index.html">🏠 Startseite</a></li>
        <li><a href="x_dashboard.php" class="active">📊 Dashboard</a></li>
        <li><a href="x_anmelden.php">➕ Anmelden</a></li>
        <li><a href="x_archiv.php">📁 Archiv</a></li>
        <li><a href="x_firmen.php">🏢 Firmenverwaltung</a></li>
    </ul>
</div>

<main>
    <!-- Statistiken -->
    <section class="stats-grid">
        <div class="stat-card">
            <span class="stat-number" id="currentPersonsCount">0</span>
            <span class="stat-label">Personen im Betrieb</span>
        </div>
        <div class="stat-card">
            <span class="stat-number" id="currentCompaniesCount">0</span>
            <span class="stat-label">Firmen im Betrieb</span>
        </div>
    </section>

    <!-- Aktive Tickets -->
    <section class="card">
        <div class="card-inner">
            <h2 class="page-title">Aktive Fremdfirmen</h2>
            <div style="overflow-x: auto;">
                <table class="tickets-table">
                    <thead>
                        <tr>
                            <th>Firma</th>
                            <th>Arbeiten</th>
                            <th>Ansprechpartner</th>
                            <th>Personen</th>
                            <th>Status</th>
                            <th>Erstellt</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody id="ticketsTableBody">
                        <!-- Tickets werden hier eingefügt -->
                    </tbody>
                </table>
            </div>
        </div>
    </section>
</main>

<!-- Ticket Details Modal -->
<div id="ticketDetailsModal" class="modal" style="display: none;">
    <div class="modal-content" style="max-width: 650px; margin: 5vh auto; max-height: 85vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--color-accent); padding-bottom: 12px;">
            <h3 style="color: var(--color-accent); margin: 0; font-size: 1.4em;">📋 Ticket Details</h3>
            <button onclick="closeDetailsModal()" style="background: var(--color-accent); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 1em; display: flex; align-items: center; justify-content: center; transition: var(--transition); min-width: 28px; max-width: 28px; min-height: 28px; max-height: 28px; flex-shrink: 0; padding: 0;" onmouseover="this.style.background='var(--color-accent-hover)'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='var(--color-accent)'; this.style.transform='scale(1)'">✕</button>
        </div>
        <div id="ticketDetailsContent" style="line-height: 1.5;">
            <!-- Details werden hier eingefügt -->
        </div>
        <div style="margin-top: 25px; text-align: center; border-top: 1px solid var(--border-color); padding-top: 15px;">
            <button class="primary-btn" onclick="closeDetailsModal()" style="padding: 10px 25px;">Schließen</button>
        </div>
    </div>
</div>

<!-- Modal für Ticket beenden -->
<div id="closeTicketModal" class="modal">
    <div class="modal-content">
        <h3 style="color: var(--color-accent); margin-bottom: 20px;">Ticket beenden</h3>
        <form id="closeTicketForm">
            <input type="hidden" id="closeTicketId" name="ticketId">
            
            <div class="form-group">
                <label for="arbeitsende">Arbeitsende*</label>
                <input type="time" id="arbeitsende" name="arbeitsende" required>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="materialZurueck" name="materialZurueck"> 
                    Material zurückgegeben
                </label>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="schluesselZurueck" name="schluesselZurueck"> 
                    Schlüssel zurückgegeben
                </label>
            </div>
            
            <div style="margin-top: 20px; text-align: right;">
                <button type="button" class="secondary-btn" onclick="closeModal()">Abbrechen</button>
                <button type="submit" class="primary-btn">Ticket beenden</button>
            </div>
        </form>
    </div>
</div>

<script>
// Theme Toggle
document.addEventListener('DOMContentLoaded', function(){
    const root = document.documentElement;
    const toggle = document.getElementById('themeToggle');
    const saved = localStorage.getItem('theme') || 'dark';
    root.setAttribute('data-theme', saved);
    if (toggle) {
        toggle.addEventListener('click', () => {
            const current = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            root.setAttribute('data-theme', current);
            localStorage.setItem('theme', current);
        });
    }
});

// Dashboard Funktionalität
document.addEventListener('DOMContentLoaded', function() {
    // Initial laden
    loadTickets();
    
    // Close Ticket Form Handler
    document.getElementById('closeTicketForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const ticketId = formData.get('ticketId');
        const closeData = {
            status: 'geschlossen',
            arbeitsende: formData.get('arbeitsende'),
            materialZurueck: formData.has('materialZurueck'),
            schluesselZurueck: formData.has('schluesselZurueck')
        };
        
        try {
            const response = await fetch(`x_mb_api.php?action=tickets&id=${ticketId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(closeData)
            });
            if (response.ok) {
                showNotification('Ticket erfolgreich beendet', 'success');
                closeModal();
                loadTickets(); // Lädt Tickets neu und aktualisiert Statistiken
            } else {
                showNotification('Fehler beim Beenden des Tickets', 'error');
            }
        } catch (error) {
            showNotification('Fehler: ' + error.message, 'error');
        }
    });
});

async function loadTickets() {
    try {
        const response = await fetch('x_mb_api.php?action=tickets');
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        const tickets = await response.json();
        
        displayTickets(tickets);
        
        // Statistiken für offene Tickets berechnen
        const openTickets = tickets.filter(t => t.status === 'offen' || t.status === 'angemeldet');
        updateStatistics(openTickets);
    } catch (error) {
        console.error('Fehler beim Laden der Tickets:', error);
        showNotification('Fehler beim Laden der Tickets: ' + error.message, 'error');
    }
}

function updateStatistics(openTickets) {
    // Gesamtanzahl Personen im Betrieb (nur aus offenen Tickets)
    const totalPersons = openTickets.reduce((sum, ticket) => {
        const persons = parseInt(ticket.anzahlPersonen) || 0;
        return sum + persons;
    }, 0);
    
    // Anzahl verschiedener Firmen (nur aus offenen Tickets)
    const firmaNamen = openTickets
        .map(ticket => ticket.firma)
        .filter(firma => firma && firma.trim() !== '')
        .map(firma => firma.toLowerCase().trim());
    
    const uniqueCompanies = new Set(firmaNamen);
    
    const personsElement = document.getElementById('currentPersonsCount');
    const companiesElement = document.getElementById('currentCompaniesCount');
    
    if (personsElement) personsElement.textContent = totalPersons;
    if (companiesElement) companiesElement.textContent = uniqueCompanies.size;
}

function viewTicketDetails(ticketId) {
    // Tickets aus dem aktuellen displayTickets-Aufruf holen
    fetch('x_mb_api.php?action=tickets')
        .then(response => response.json())
        .then(tickets => {
            const ticket = tickets.find(t => t.id === ticketId);
            if (ticket) showTicketDetailsModal(ticket);
        })
        .catch(error => {
            console.error('Fehler beim Laden der Ticket-Details:', error);
            showNotification('Fehler beim Laden der Ticket-Details', 'error');
        });
}

function showTicketDetailsModal(ticket) {
    const detailsContent = document.getElementById('ticketDetailsContent');
    
    // Hilfsfunktion um leere Werte zu handhaben
    const formatValue = (value) => value && value.trim() !== '' ? escapeHtml(value) : '';
    const hasValue = (value) => value && value.trim() !== '';
    
    detailsContent.innerHTML = `
        <div style="display: grid; gap: 15px;">
            <div style="background: var(--bg-primary); padding: 15px; border-radius: var(--border-radius); border-left: 4px solid var(--color-accent);">
                <h4 style="color: var(--color-accent); margin: 0 0 12px 0; font-size: 1.1em;">🏢 Firmen-Informationen</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div><strong style="color: var(--color-accent);">Firma:</strong><br>${formatValue(ticket.firma) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
                    <div><strong style="color: var(--color-accent);">Arbeiten:</strong><br>${formatValue(ticket.arbeiten) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
                </div>
                <div style="margin-top: 12px;">
                    <strong style="color: var(--color-accent);">Arbeitsbereich:</strong><br>${formatValue(ticket.arbeitsbereich) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}
                </div>
            </div>
            
            <div style="background: var(--bg-primary); padding: 15px; border-radius: var(--border-radius); border-left: 4px solid #28a745;">
                <h4 style="color: #28a745; margin: 0 0 12px 0; font-size: 1.1em;">👥 Kontakt-Informationen</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div><strong style="color: #28a745;">Ansprechpartner:</strong><br>${formatValue(ticket.ansprechpartner) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
                    <div><strong style="color: #28a745;">Rufnummer:</strong><br>${formatValue(ticket.rufnummer) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div><strong style="color: #28a745;">Anzahl Personen:</strong><br>${ticket.anzahlPersonen || 1}</div>
                    <div><strong style="color: #28a745;">Status:</strong><br><span class="status-badge status-${ticket.status}">${ticket.status || 'offen'}</span></div>
                </div>
            </div>
            
            <div style="background: var(--bg-primary); padding: 15px; border-radius: var(--border-radius); border-left: 4px solid #17a2b8;">
                <h4 style="color: #17a2b8; margin: 0 0 12px 0; font-size: 1.1em;">⏰ Zeit-Informationen</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div><strong style="color: #17a2b8;">Arbeitsanfang:</strong><br>${formatValue(ticket.arbeitsanfang) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
                    <div><strong style="color: #17a2b8;">Erstellt am:</strong><br>${formatDate(ticket.erstelltAm || ticket.erstellungsdatum)}</div>
                </div>
            </div>
            
            ${hasValue(ticket.ausgegebenesMaterial) || hasValue(ticket.ausgegebeneSchluessel) ? `
            <div style="background: var(--bg-primary); padding: 15px; border-radius: var(--border-radius); border-left: 4px solid #ffc107;">
                <h4 style="color: #ffc107; margin: 0 0 12px 0; font-size: 1.1em;">📦 Ausgegebene Gegenstände</h4>
                ${hasValue(ticket.ausgegebenesMaterial) ? `<div style="margin-bottom: 12px;"><strong style="color: #ffc107;">Material:</strong><br>${formatValue(ticket.ausgegebenesMaterial)}</div>` : ''}
                ${hasValue(ticket.ausgegebeneSchluessel) ? `<div><strong style="color: #ffc107;">Schlüssel:</strong><br>${formatValue(ticket.ausgegebeneSchluessel)}</div>` : ''}
            </div>` : ''}
            
            ${hasValue(ticket.bemerkung) || hasValue(ticket.absenderName) ? `
            <div style="background: var(--bg-primary); padding: 15px; border-radius: var(--border-radius); border-left: 4px solid #6f42c1;">
                <h4 style="color: #6f42c1; margin: 0 0 12px 0; font-size: 1.1em;">📝 Zusätzliche Informationen</h4>
                ${hasValue(ticket.bemerkung) ? `<div style="margin-bottom: 12px;"><strong style="color: #6f42c1;">Bemerkungen:</strong><br>${formatValue(ticket.bemerkung)}</div>` : ''}
                ${hasValue(ticket.absenderName) ? `<div><strong style="color: #6f42c1;">Absender:</strong><br>${formatValue(ticket.absenderName)}</div>` : ''}
            </div>` : ''}
        </div>
    `;
    
    document.getElementById('ticketDetailsModal').style.display = 'block';
}

function closeDetailsModal() {
    document.getElementById('ticketDetailsModal').style.display = 'none';
}

function displayTickets(tickets) {
    const tbody = document.getElementById('ticketsTableBody');
    tbody.innerHTML = '';
    
    const activeTickets = tickets.filter(t => t.status === 'offen' || t.status === 'angemeldet');
    
    // Sortierung: Neueste zuerst (nach erstelltAm oder erstellungsdatum)
    activeTickets.sort((a, b) => {
        const dateA = new Date(a.erstelltAm || a.erstellungsdatum || 0);
        const dateB = new Date(b.erstelltAm || b.erstellungsdatum || 0);
        return dateB - dateA; // Neueste zuerst
    });
    
    if (activeTickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--color-secondary);">Keine angemeldeten Fremdfirmen</td></tr>';
        return;
    }
    
    activeTickets.forEach(ticket => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.addEventListener('click', function(e) {
            // Nur bei Klick auf Zelle, nicht auf Buttons
            if (!e.target.closest('button')) {
                viewTicketDetails(ticket.id);
            }
        });
        row.innerHTML = `
            <td><strong>${ticket.firma || 'N/A'}</strong></td>
            <td>${ticket.arbeiten || 'N/A'}</td>
            <td>${ticket.ansprechpartner || 'N/A'}</td>
            <td>${ticket.anzahlPersonen || 1}</td>
            <td><span class="status-badge status-angemeldet">Angemeldet</span></td>
            <td>${formatDate(ticket.erstelltAm || ticket.erstellungsdatum)}</td>
            <td class="ticket-actions">
                <button class="btn-small btn-danger" onclick="signOffCompany('${ticket.id}')">Abmelden</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
    } catch {
        return dateString;
    }
}

function closeTicket(ticketId) {
    const modal = document.getElementById('closeTicketModal');
    document.getElementById('closeTicketId').value = ticketId;
    
    // Aktuelle Zeit setzen
    const now = new Date();
    document.getElementById('arbeitsende').value = now.toTimeString().slice(0, 5);
    
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('closeTicketModal').style.display = 'none';
    document.getElementById('closeTicketForm').reset();
}

async function signOffCompany(ticketId) {
    if (!confirm('Sind Sie sicher, dass Sie diese Fremdfirma abmelden möchten?')) return;
    
    try {
        // Aktuelles Ticket für E-Mail-Daten holen
        const ticketsResponse = await fetch('x_mb_api.php?action=tickets');
        if (!ticketsResponse.ok) throw new Error('Fehler beim Laden der Ticket-Daten');
        const tickets = await ticketsResponse.json();
        const ticket = tickets.find(t => t.id === ticketId);
        
        if (!ticket) {
            showNotification('Ticket nicht gefunden', 'error');
            return;
        }
        
        // Ticket ins Archiv verschieben (neue CLOSE-API verwenden)
        const now = new Date();
        const closeData = {
            arbeitsende: now.toTimeString().slice(0, 5),
            materialZurueck: false,
            schluesselZurueck: false,
            materialBemerkung: '',
            schluesselBemerkung: '',
            closeAbsenderName: ticket.absenderName || ''
        };
        
        // API-Aufruf zum Archivieren
        const response = await fetch(`x_mb_api.php?action=close&id=${ticketId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(closeData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result && result.success) {
            showNotification('Fremdfirma erfolgreich abgemeldet!', 'success');
        } else {
            showNotification('Fehler beim Abmelden: ' + (result.error || 'Unbekannter Fehler'), 'error');
            return;
        }
        
        // E-Mail für Abmeldung generieren
        try {
            const emailResponse = await fetch('x_mb_api.php?action=send-email', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ ticketId: ticketId, isStart: false })
            });
            
            if (!emailResponse.ok) {
                const errorText = await emailResponse.text();
                showNotification('Abmeldung erfolgreich, aber E-Mail-Vorlage konnte nicht generiert werden (HTTP ' + emailResponse.status + ').', 'error');
            } else {
                const emailResult = await emailResponse.json();
                showEmailOptions(ticketId, emailResult, 'Abmeldung');
            }
        } catch (emailError) {
            showNotification('Abmeldung erfolgreich, aber E-Mail-Vorlage konnte nicht generiert werden.', 'error');
        }
        
        // Dashboard neu laden
        loadTickets();
        
    } catch (error) {
        console.error('Fehler beim Abmelden:', error);
        showNotification('Fehler beim Abmelden: ' + error.message, 'error');
    }
}

function showEmailOptions(ticketId, emailResult, emailType = 'Anmeldung') {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:1000;';
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background:var(--bg-secondary);color:var(--color-primary);padding:30px;border-radius:10px;max-width:500px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.3);border:1px solid var(--border-color);';
    modalContent.innerHTML = `
        <h3 style="margin-bottom:20px;color:var(--color-accent);">E-Mail-Versand (${emailType})</h3>
        <p style="margin-bottom:20px;color:var(--color-primary);">${emailType}-E-Mail erstellt. Wählen Sie eine Option:</p>
        <div style="display:flex;gap:10px;flex-direction:column;">
            <button id="openOutlookWeb" class="email-modal-btn" style="width:100%;background-color:#8e44ad;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-size:1em;">🌐 Im Outlook Web öffnen</button>
            <button id="openOutlook" class="email-modal-btn" style="width:100%;background-color:#0078d4;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-size:1em;">📧 In Outlook öffnen</button>
            <button id="downloadEmail" class="email-modal-btn" style="width:100%;background-color:#27ae60;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-size:1em;">💾 E-Mail-Datei herunterladen</button>
            <button id="closeModal" class="email-modal-btn" style="width:100%;background-color:#95a5a6;color:white;padding:12px;border:none;border-radius:6px;cursor:pointer;font-size:1em;">✕ Schließen</button>
        </div>`;
    modal.appendChild(modalContent); 
    document.body.appendChild(modal);
    
    document.getElementById('openOutlookWeb').addEventListener('click', function() {
        if (emailResult.owaLink) {
            window.open(emailResult.owaLink, '_blank');
        } else {
            showNotification('Outlook-Web-Link nicht verfügbar.', 'error');
        }
        modal.remove();
    });
    
    document.getElementById('openOutlook').addEventListener('click', function() {
        if (emailResult.mailtoLink) {
            window.location.href = emailResult.mailtoLink;
        } else {
            showNotification('Mailto-Link nicht verfügbar.', 'error');
        }
        modal.remove();
    });
    
    document.getElementById('downloadEmail').addEventListener('click', function() {
        if (emailResult.downloadUrl) {
            window.open(emailResult.downloadUrl, '_blank');
        } else {
            showNotification('Keine Download-URL vorhanden.', 'error');
        }
        modal.remove();
    });
    
    document.getElementById('closeModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function deleteTicket(ticketId) {
    if (!confirm('Sind Sie sicher, dass Sie dieses Ticket löschen möchten?')) return;
    
    try {
        const response = await fetch(`x_mb_api.php?action=tickets&id=${ticketId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Ticket erfolgreich gelöscht', 'success');
            loadTickets(); // Lädt Tickets neu und aktualisiert Statistiken
        } else {
            showNotification('Fehler beim Löschen des Tickets', 'error');
        }
    } catch (error) {
        showNotification('Fehler: ' + error.message, 'error');
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 1000;
        font-weight: 500;
        ${type === 'success' ? 'background: rgba(35,134,54,0.15); color: #28a745; border: 1px solid rgba(35,134,54,0.3);' : 'background: rgba(248,81,73,0.15); color: #dc3545; border: 1px solid rgba(248,81,73,0.3);'}
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function escapeHtml(text) {
    if (!text || text.trim() === '') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal schließen bei Klick außerhalb
window.onclick = function(event) {
    const closeModal = document.getElementById('closeTicketModal');
    const detailsModal = document.getElementById('ticketDetailsModal');
    
    if (event.target === closeModal) {
        closeModal.style.display = 'none';
        document.getElementById('closeTicketForm').reset();
    }
    
    if (event.target === detailsModal) {
        closeDetailsModal();
    }
}
</script>

</body>
</html>
