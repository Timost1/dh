<?php
/**
 * Archiv Seite (PHP Version)
 */
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Archiv - Abgemeldete Fremdfirmen</title>
    <link rel="stylesheet" href="startseite.css">
    <link rel="stylesheet" href="mb_compatibility.css">
    <style>
        /* Modernes Corporate-Theme (wie Dashboard) */
        :root {
            --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            --color-accent: #0d6efd; --color-accent-hover: #0b5ed7;
            --color-primary: #1f2937; --color-secondary: #6b7280;
            --bg-primary: #ffffff; --bg-secondary: #f8fafc; --border-color: #e5e7eb;
            --border-radius: 12px; --border-radius-small: 8px;
            --shadow: 0 1px 2px rgba(0,0,0,0.05); --shadow-hover: 0 8px 24px rgba(0,0,0,0.12);
            --transition: all .2s ease; --header-h: 64px;
        }
        [data-theme="dark"] { --color-primary: #e5e7eb; --color-secondary: #9ca3af; --bg-primary: #0f172a; --bg-secondary: #111827; --border-color: rgba(255,255,255,0.08); --shadow: 0 1px 2px rgba(0,0,0,0.4); --shadow-hover: 0 8px 24px rgba(0,0,0,0.35); }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { height: 100%; }
        body { font-family: var(--font-sans); color: var(--color-primary); background: var(--bg-primary); margin: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        a { color: inherit; text-decoration: none; }
        header { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; min-height: var(--header-h); padding: 0 24px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); box-shadow: var(--shadow); }
        .sidebar { position: fixed; top: var(--header-h); bottom: 0; width: 260px; padding: 16px 12px; background: var(--bg-secondary); border-right: 1px solid var(--border-color); overflow-y: auto; }
        .sidebar a { color: var(--color-primary); transition: var(--transition); display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; }
        .sidebar a:hover { background: rgba(13,110,253,0.08); }
        .sidebar a.active { background: rgba(13,110,253,0.10); border-left: 3px solid var(--color-accent); }
        main { margin-left: 260px; padding: 24px; }
        .card-inner { padding: 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--border-radius); box-shadow: var(--shadow); }
        .tickets-table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--bg-secondary); border-radius: var(--border-radius); overflow: hidden; box-shadow: var(--shadow); }
        .tickets-table th, .tickets-table td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border-color); }
        .tickets-table th { background: var(--bg-secondary); color: var(--color-primary); font-weight: 700; font-size: .8rem; text-transform: uppercase; letter-spacing: .4px; border-bottom: 2px solid var(--border-color); }
        .tickets-table tbody tr { cursor: pointer; transition: var(--transition); }
        .tickets-table tbody tr:hover { background: rgba(13,110,253,0.08); }
        .btn-small { padding: 8px 12px; font-size: .85rem; border-radius: var(--border-radius-small); border: 1px solid transparent; cursor: pointer; transition: var(--transition); }
        .btn-primary { background: var(--color-accent); color: #fff; }
        .btn-danger { background: #dc3545; color: #fff; }
        .status-badge { padding: 4px 8px; border-radius: 999px; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; border: 1px solid transparent; }
        .status-angemeldet, .status-offen { background: rgba(25,135,84,0.1); color: #198754; border-color: rgba(25,135,84,0.25); }
        .status-abgemeldet, .status-geschlossen { background: rgba(220,53,69,0.08); color: #dc3545; border-color: rgba(220,53,69,0.25); }
        .modal { display: none; position: fixed; z-index: 1000; inset: 0; background-color: rgba(0,0,0,0.45); }
        .modal-content { background: var(--bg-secondary); margin: 8vh auto; padding: 24px; border: 1px solid var(--border-color); border-radius: var(--border-radius); width: 92%; max-width: 640px; box-shadow: var(--shadow-hover); }
        @media (max-width: 900px) { .sidebar { position: static; width: auto; border-right: 0; border-bottom: 1px solid var(--border-color); } main { margin-left: 0; padding: 16px; } }

        /* Archiv-spezifische Styles */
        .search-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 24px;
            margin-bottom: 30px;
            box-shadow: var(--shadow);
        }
        .search-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .search-group {
            display: flex;
            flex-direction: column;
        }
        .search-group label {
            margin-bottom: 6px;
            font-weight: 600;
            color: var(--color-primary);
            font-size: 0.9em;
        }
        .search-group input,
        .search-group select {
            padding: 10px 12px;
            background: var(--bg-primary);
            color: var(--color-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-small);
            outline: none;
            transition: var(--transition);
        }
        .search-group input:focus,
        .search-group select:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 2px rgba(88,166,255,0.1);
        }
        .search-actions {
            display: flex;
            gap: 10px;
            align-items: end;
        }
        /* Dashboard-ähnliches Design für Archiv */
        .tickets-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--bg-secondary);
            border-radius: var(--border-radius);
            overflow: hidden;
            box-shadow: var(--shadow);
        }
        .tickets-table th,
        .tickets-table td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }
        .tickets-table th {
            background: var(--bg-primary);
            color: var(--color-accent);
            font-weight: 600;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .tickets-table tr:hover {
            background: rgba(88, 166, 255, 0.05);
        }
        .tickets-table tbody tr {
            cursor: pointer;
            transition: var(--transition);
        }
        .tickets-table tbody tr:hover {
            background: rgba(88, 166, 255, 0.1);
            transform: translateX(2px);
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: var(--border-radius-small);
            font-size: 0.8em;
            font-weight: 500;
            text-transform: uppercase;
        }
        .status-geschlossen {
            background: rgba(40, 167, 69, 0.2);
            color: #28a745;
            border: 1px solid rgba(40, 167, 69, 0.3);
        }
        .status-abgemeldet {
            background: rgba(220, 53, 69, 0.2);
            color: #dc3545;
            border: 1px solid rgba(220, 53, 69, 0.3);
        }
        .status-angemeldet {
            background: rgba(40, 167, 69, 0.2);
            color: #28a745;
            border: 1px solid rgba(40, 167, 69, 0.3);
        }
        .btn-small {
            padding: 6px 12px;
            font-size: 0.85em;
            border: none;
            border-radius: var(--border-radius-small);
            cursor: pointer;
            transition: var(--transition);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .btn-primary {
            background: var(--color-accent);
            color: white;
        }
        .btn-primary:hover {
            background: var(--color-accent-hover);
            transform: translateY(-1px);
        }
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        .btn-danger:hover {
            background: #c82333;
            transform: translateY(-1px);
        }
        .card-inner {
            padding: 28px;
        }
        h2.page-title {
            color: var(--color-accent);
            margin-bottom: 24px;
            font-size: 1.8em;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        .modal-content {
            background-color: var(--bg-secondary);
            max-width: 650px; 
            margin: 5vh auto; 
            max-height: 85vh; 
            overflow-y: auto;
            padding: 30px;
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-hover);
        }
        .primary-btn {
            background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
            color: #fff;
            padding: 12px 24px;
            border: none;
            border-radius: var(--border-radius-small);
            cursor: pointer;
            font-size: 1em;
            font-weight: 600;
            transition: var(--transition);
            margin-right: 10px;
        }
        .primary-btn:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-hover);
        }
        .secondary-btn {
            background: var(--bg-primary);
            color: var(--color-primary);
            padding: 12px 24px;
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-small);
            cursor: pointer;
            font-size: 1em;
            font-weight: 600;
            transition: var(--transition);
        }
        .secondary-btn:hover {
            background: var(--border-color);
            transform: translateY(-1px);
        }
        .ticket-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        .notification { 
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            padding: 12px 20px !important;
            border-radius: 6px !important;
            z-index: 1000 !important;
            font-weight: 500 !important;
            max-width: 300px !important;
            word-wrap: break-word !important;
            margin: 0 !important;
            display: none !important;
        }
        .notification.success { 
            background: rgba(35,134,54,0.12); 
            color: var(--color-primary); 
            border-color: rgba(35,134,54,0.35); 
        }
        .notification.error { 
            background: rgba(248,81,73,0.12); 
            color: var(--color-primary); 
            border-color: rgba(248,81,73,0.35); 
        }

        /* Verstecke Notification-Container die im Weg sind */
        .notification-container {
            display: none !important;
        }

        #notification {
            display: none !important;
        }

        /* Notification-Styling überschreiben */
        .notification {
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            z-index: 9999 !important;
            max-width: 300px !important;
            margin: 0 !important;
            padding: 12px 20px !important;
            border-radius: 6px !important;
            font-weight: 500 !important;
            word-wrap: break-word !important;
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
        <li><a href="x_dashboard.php">📊 Dashboard</a></li>
        <li><a href="x_anmelden.php">➕ Anmelden</a></li>
        <li><a href="x_archiv.php" class="active">📁 Archiv</a></li>
        <li><a href="x_firmen.php">🏢 Firmenverwaltung</a></li>
    </ul>
</div>

<main>
    <!-- Suchfilter -->
    <section class="search-section">
        <h3 style="color: var(--color-accent); margin-bottom: 20px;">Filter & Suche</h3>
        <div class="search-grid">
            <div class="search-group">
                <label for="searchFirma">Firma</label>
                <input type="text" id="searchFirma" placeholder="Firma suchen...">
            </div>
            <div class="search-group">
                <label for="searchArbeiten">Arbeiten</label>
                <input type="text" id="searchArbeiten" placeholder="Arbeiten suchen...">
            </div>
            <div class="search-group">
                <label for="searchDateFrom">Von Datum</label>
                <input type="date" id="searchDateFrom">
            </div>
            <div class="search-group">
                <label for="searchDateTo">Bis Datum</label>
                <input type="date" id="searchDateTo">
            </div>
        </div>
        <div class="search-actions">
            <button class="primary-btn" onclick="applyFilters()">Filtern</button>
            <button class="secondary-btn" onclick="clearFilters()">Zurücksetzen</button>
        </div>
    </section>

    <!-- Archiv-Tabelle -->
    <section class="card">
        <div class="card-inner">
            <h2 class="page-title">Archivierte Tickets</h2>
            
            <div class="stats-info" id="archiveStats">
                Wird geladen...
            </div>
            
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
                            <th>Beendet</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody id="archiveTableBody">
                        <!-- Archivierte Tickets werden hier eingefügt -->
                    </tbody>
                </table>
            </div>
        </div>
    </section>
</main>

<!-- Ticket Details Modal -->
<div id="ticketDetailsModal" class="modal" style="display: none;">
    <div class="modal-content">
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

<!-- Notification Container -->
<div id="notification" class="notification-container"></div>

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

// Archiv Funktionalität
let allArchivedTickets = [];
let filteredTickets = [];

document.addEventListener('DOMContentLoaded', function() {
    loadArchivedTickets();
    
    // Event listeners für Suchfelder
    ['searchFirma', 'searchArbeiten', 'searchDateFrom', 'searchDateTo'].forEach(id => {
        document.getElementById(id).addEventListener('input', debounce(applyFilters, 300));
    });
});

async function loadArchivedTickets() {
    try {
        const response = await fetch('x_mb_api.php?action=archived');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        allArchivedTickets = await response.json();
        filteredTickets = [...allArchivedTickets];
        
        displayArchivedTickets();
        updateArchiveStats();
    } catch (error) {
        console.error('Fehler beim Laden der archivierten Tickets:', error);
        showNotification('Fehler beim Laden der archivierten Tickets: ' + error.message, 'error');
    }
}

function displayArchivedTickets() {
    const tbody = document.getElementById('archiveTableBody');
    tbody.innerHTML = '';
    
    if (filteredTickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-secondary);">Keine archivierten Tickets gefunden</td></tr>';
        return;
    }
    
    // Sortierung: Neueste zuerst (nach abgemeldetAm oder geschlossenAm oder erstelltAm)
    const sortedTickets = [...filteredTickets].sort((a, b) => {
        const dateA = new Date(a.abgemeldetAm || a.geschlossenAm || a.erstelltAm || a.erstellungsdatum || 0);
        const dateB = new Date(b.abgemeldetAm || b.geschlossenAm || b.erstelltAm || b.erstellungsdatum || 0);
        return dateB - dateA; // Neueste zuerst (absteigend)
    });
    
    sortedTickets.forEach(ticket => {
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
            <td><span class="status-badge status-${ticket.status}">${ticket.status}</span></td>
            <td>${formatDate(ticket.erstelltAm || ticket.erstellungsdatum)}</td>
            <td>${formatDate(ticket.abgemeldetAm || ticket.arbeitsende) || formatValue(ticket.arbeitsende) || 'N/A'}</td>
            <td class="ticket-actions">
                <button class="btn-small btn-primary" onclick="restoreTicket('${ticket.id}')">Wiederherstellen</button>
                <button class="btn-small btn-danger" onclick="deleteTicket('${ticket.id}')">Löschen</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateArchiveStats() {
    const stats = document.getElementById('archiveStats');
    const total = allArchivedTickets.length;
    const filtered = filteredTickets.length;
    
    if (total === filtered) {
        stats.textContent = `${total} archivierte${total === 1 ? 's' : ''} Ticket${total === 1 ? '' : 's'} gefunden`;
    } else {
        stats.textContent = `${filtered} von ${total} Tickets angezeigt (gefiltert)`;
    }
}

function applyFilters() {
    const firma = document.getElementById('searchFirma').value.toLowerCase();
    const arbeiten = document.getElementById('searchArbeiten').value.toLowerCase();
    const dateFrom = document.getElementById('searchDateFrom').value;
    const dateTo = document.getElementById('searchDateTo').value;
    
    filteredTickets = allArchivedTickets.filter(ticket => {
        // Firma Filter
        if (firma && !(ticket.firma || '').toLowerCase().includes(firma)) return false;
        
        // Arbeiten Filter
        if (arbeiten && !(ticket.arbeiten || '').toLowerCase().includes(arbeiten)) return false;
        
        // Datum Filter
        const ticketDate = (ticket.erstelltAm || ticket.erstellungsdatum || '').split('T')[0];
        if (dateFrom && ticketDate < dateFrom) return false;
        if (dateTo && ticketDate > dateTo) return false;
        
        return true;
    });
    
    displayArchivedTickets();
    updateArchiveStats();
}

function clearFilters() {
    document.getElementById('searchFirma').value = '';
    document.getElementById('searchArbeiten').value = '';
    document.getElementById('searchDateFrom').value = '';
    document.getElementById('searchDateTo').value = '';
    
    filteredTickets = [...allArchivedTickets];
    displayArchivedTickets();
    updateArchiveStats();
}

async function restoreTicket(ticketId) {
    if (!confirm('Sind Sie sicher, dass Sie dieses Ticket wiederherstellen möchten? Es wird wieder im Dashboard als aktives Ticket angezeigt.')) return;
    
    try {
        const response = await fetch(`x_mb_api.php?action=restore&id=${ticketId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('Restore Response Status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Restore Server Error:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('Restore Response:', result);
        
        if (result && result.success) {
            showNotification('Ticket erfolgreich wiederhergestellt und ist wieder aktiv!', 'success');
            // Archiv neu laden
            loadArchivedTickets();
        } else {
            showNotification('Fehler beim Wiederherstellen: ' + (result.error || 'Unbekannter Fehler'), 'error');
        }
        
    } catch (error) {
        console.error('Fehler beim Wiederherstellen:', error);
        showNotification('Fehler beim Wiederherstellen: ' + error.message, 'error');
    }
}

async function deleteTicket(ticketId) {
    if (!confirm('Sind Sie sicher, dass Sie dieses Ticket endgültig löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden!')) return;
    
    try {
        const response = await fetch(`x_mb_api.php?action=tickets&id=${ticketId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Ticket erfolgreich gelöscht', 'success');
            loadArchivedTickets();
        } else {
            showNotification('Fehler beim Löschen des Tickets', 'error');
        }
    } catch (error) {
        showNotification('Fehler: ' + error.message, 'error');
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        let date;
        if (dateString.includes('T')) {
            // ISO-Format (2024-01-15T14:30:00.000Z)
            date = new Date(dateString);
        } else if (dateString.includes(':') && dateString.length <= 8) {
            // Nur Zeit-Format (14:30)
            const today = new Date();
            const [hours, minutes] = dateString.split(':');
            date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
            return date.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
        } else {
            // Anderes Format versuchen
            date = new Date(dateString);
        }
        
        if (isNaN(date.getTime())) {
            return dateString; // Fallback: Originalwert anzeigen
        }
        
        return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
    } catch (error) {
        console.error('Datum-Formatierung fehlgeschlagen:', dateString, error);
        return dateString || 'N/A';
    }
}

// Ticket Details Modal Funktionen
function viewTicketDetails(ticketId) {
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
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div><strong style="color: #17a2b8;">Arbeitsende:</strong><br>${formatValue(ticket.arbeitsende) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
                    <div><strong style="color: #17a2b8;">Abgemeldet am:</strong><br>${formatDate(ticket.abgemeldetAm) || '<em style="color: var(--color-secondary);">Nicht angegeben</em>'}</div>
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

function escapeHtml(text) {
    if (!text || text.trim() === '') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Hilfsfunktionen
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatValue(value) {
    return value && value.trim() !== '' ? value : 'N/A';
}

function showNotification(message, type) {
    // Vorhandene Notification entfernen
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        padding: 12px 20px !important;
        border-radius: 6px !important;
        z-index: 9999 !important;
        font-weight: 500 !important;
        max-width: 300px !important;
        word-wrap: break-word !important;
        display: block !important;
        margin: 0 !important;
        ${type === 'success' ? 'background: rgba(35,134,54,0.15); color: #28a745; border: 1px solid rgba(35,134,54,0.3);' : 'background: rgba(248,81,73,0.15); color: #dc3545; border: 1px solid rgba(248,81,73,0.3);'}
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Modal schließen bei Klick außerhalb
window.onclick = function(event) {
    const detailsModal = document.getElementById('ticketDetailsModal');
    
    if (event.target === detailsModal) {
        closeDetailsModal();
    }
}
</script>

</body>
</html>
