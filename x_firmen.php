<?php
/**
 * Firmenverwaltung (PHP Version)
 */
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Firmenverwaltung</title>
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
        body { font-family: var(--font-sans); color: var(--color-primary); background: var(--bg-primary); margin: 0; }
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

        .form-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 24px;
            margin-bottom: 25px;
            box-shadow: var(--shadow);
        }
        
        .search-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 20px;
            margin-bottom: 25px;
            box-shadow: var(--shadow);
        }
        
        .search-wrapper {
            position: relative;
            max-width: 450px;
            margin: 0 auto;
        }
        
        .search-input {
            width: 100%;
            padding: 12px 16px 12px 45px;
            background: var(--bg-primary);
            color: var(--color-primary);
            border: 2px solid var(--border-color);
            border-radius: var(--border-radius);
            outline: none;
            transition: var(--transition);
            font-size: 1em;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .search-input:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(88,166,255,0.12), inset 0 2px 4px rgba(0,0,0,0.05);
            transform: translateY(-1px);
        }
        
        .search-icon {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--color-secondary);
            font-size: 1em;
        }
        
        .firmen-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            overflow: hidden;
            box-shadow: var(--shadow);
            margin-top: 16px;
        }
        
        .firma-item {
            padding: 18px 20px;
            border-bottom: 1px solid var(--border-color);
            transition: var(--transition);
            position: relative;
        }
        
        .firma-item:last-child {
            border-bottom: none;
        }
        
        .firma-item:hover {
            background: rgba(88, 166, 255, 0.05);
            transform: translateX(3px);
        }
        
        .firma-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }
        
        .firma-name {
            font-size: 1.1em;
            font-weight: 600;
            color: var(--color-accent);
            margin: 0;
            line-height: 1.3;
        }
        
        .firma-actions {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        }
        
        .firma-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 8px;
            color: var(--color-secondary);
        }
        
        .firma-detail {
            font-size: 0.85em;
            display: flex;
            align-items: center;
            gap: 6px;
            line-height: 1.4;
        }
        
        .firma-detail-icon {
            width: 14px;
            text-align: center;
            color: var(--color-accent);
            font-size: 0.9em;
        }
        
        .firma-detail strong {
            color: var(--color-primary);
            min-width: 70px;
            font-size: 0.95em;
        }
        
        .empty-state {
            padding: 45px 20px;
            text-align: center;
            color: var(--color-secondary);
        }
        
        .empty-state-icon {
            font-size: 2.5em;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        .form-grid {
            display: grid;
            gap: 16px;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }
        
        @media (max-width: 768px) {
            .form-row {
                grid-template-columns: 1fr;
                gap: 12px;
            }
            
            .firma-header {
                flex-direction: column;
                gap: 10px;
            }
            
            .firma-actions {
                align-self: flex-start;
            }
            
            .firma-details {
                grid-template-columns: 1fr;
                gap: 6px;
            }
            
            .search-wrapper {
                max-width: 100%;
            }
        }
        .btn-small {
            padding: 8px 14px;
            font-size: 0.85em;
            border: none;
            border-radius: var(--border-radius-small);
            cursor: pointer;
            transition: var(--transition);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-weight: 500;
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
        .form-group {
            margin-bottom: 14px;
        }
        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            color: var(--color-primary);
            font-size: 0.9em;
        }
        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 10px 12px;
            background: var(--bg-primary);
            color: var(--color-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-small);
            outline: none;
            transition: var(--transition);
            font-size: 0.9em;
            box-sizing: border-box;
        }
        .form-group input:focus,
        .form-group textarea:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(88,166,255,0.12);
            transform: translateY(-1px);
        }
        .form-actions {
            margin-top: 18px;
            text-align: center;
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
            box-shadow: 0 4px 15px rgba(88,166,255,0.2);
        }
        .primary-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(88,166,255,0.3);
        }
        .card-inner {
            padding: 24px;
        }
        h2.page-title {
            color: var(--color-accent);
            margin-bottom: 16px;
            text-align: center;
            font-size: 1.3em;
        }
        .search-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: var(--shadow);
        }
        .search-input {
            width: 100%;
            padding: 12px 14px;
            background: var(--bg-primary);
            color: var(--color-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-small);
            outline: none;
            transition: var(--transition);
            font-size: 1em;
        }
        .search-input:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(88,166,255,0.12);
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
            margin: 5% auto;
            padding: 30px;
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            width: 90%;
            max-width: 600px;
            box-shadow: var(--shadow-hover);
            max-height: 80vh;
            overflow-y: auto;
        }
        .secondary-btn {
            background: var(--bg-primary);
            color: var(--color-primary);
            padding: 12px 24px;
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-small);
            cursor: pointer;
            font-size: 1em;
            transition: var(--transition);
            margin-right: 10px;
        }
        .secondary-btn:hover {
            background: var(--border-color);
        }

        /* Verstecke Notification-Container die im Weg sind */
        .notification-container {
            display: none !important;
        }

        #notification {
            display: none !important;
        }

        /* Überschreibe alle Notification-Styles */
        div[class*="notification"]:not(.notification) {
            display: none !important;
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
        <li><a href="x_archiv.php">📁 Archiv</a></li>
        <li><a href="x_firmen.php" class="active">🏢 Firmenverwaltung</a></li>
    </ul>
</div>

<main>
    <!-- Neue Firma hinzufügen -->
    <section class="form-container">
        <h2 class="page-title">🏢 Neue Firma hinzufügen</h2>
        <form id="firmaForm">
            <div class="form-grid">
                <div class="form-row">
                    <div class="form-group">
                        <label for="name">Firmenname*</label>
                        <input type="text" id="name" name="name" required placeholder="z.B. Mustermann GmbH">
                    </div>
                    <div class="form-group">
                        <label for="kontaktperson">Kontaktperson</label>
                        <input type="text" id="kontaktperson" name="kontaktperson" placeholder="z.B. Max Mustermann">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="telefon">Telefon</label>
                        <input type="tel" id="telefon" name="telefon" placeholder="z.B. +49 123 456789">
                    </div>
                    <div class="form-group">
                        <label for="email">E-Mail</label>
                        <input type="email" id="email" name="email" placeholder="z.B. info@mustermann.de">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="adresse">Adresse</label>
                        <input type="text" id="adresse" name="adresse" placeholder="Straße, PLZ Ort">
                    </div>
                    <div class="form-group">
                        <label for="bemerkungen">Bemerkungen</label>
                        <input type="text" id="bemerkungen" name="bemerkungen" placeholder="Zusätzliche Informationen...">
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="primary-btn">✅ Firma hinzufügen</button>
            </div>
        </form>
    </section>

    <!-- Firmenliste -->
    <section class="card">
        <div class="card-inner">
            <h2 class="page-title">📋 Verwaltete Firmen</h2>
            
            <!-- Suchbereich integriert -->
            <div style="margin-bottom: 20px;">
                <input type="text" id="searchFirmen" class="search-input" placeholder="Nach Firmenname, Kontaktperson oder E-Mail suchen..." style="border: 2px solid var(--border-color); padding: 12px 16px;">
                <div id="searchStats" style="text-align: center; margin-top: 8px; color: var(--color-secondary); font-size: 0.85em;">
                    Wird geladen...
                </div>
            </div>
            
            <div id="firmenContainer" class="firmen-list">
                <!-- Firmen werden hier eingefügt -->
            </div>
        </div>
    </section>
</main>

<!-- Modal für Firma bearbeiten -->
<div id="editFirmaModal" class="modal">
    <div class="modal-content">
        <h3 style="color: var(--color-accent); margin-bottom: 20px;">Firma bearbeiten</h3>
        <form id="editFirmaForm">
            <input type="hidden" id="editFirmaId" name="firmaId">
            
            <div class="form-grid">
                <div class="form-row">
                    <div class="form-group">
                        <label for="editName">Firmenname*</label>
                        <input type="text" id="editName" name="name" required>
                    </div>
                    <div class="form-group">
                        <label for="editKontaktperson">Kontaktperson</label>
                        <input type="text" id="editKontaktperson" name="kontaktperson">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="editTelefon">Telefon</label>
                        <input type="tel" id="editTelefon" name="telefon">
                    </div>
                    <div class="form-group">
                        <label for="editEmail">E-Mail</label>
                        <input type="email" id="editEmail" name="email">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="editAdresse">Adresse</label>
                        <input type="text" id="editAdresse" name="adresse" placeholder="Straße, PLZ Ort">
                    </div>
                    <div class="form-group">
                        <label for="editBemerkungen">Bemerkungen</label>
                        <input type="text" id="editBemerkungen" name="bemerkungen" placeholder="Zusätzliche Informationen...">
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 20px; text-align: right;">
                <button type="button" class="secondary-btn" onclick="closeEditModal()">Abbrechen</button>
                <button type="submit" class="primary-btn">Speichern</button>
            </div>
        </form>
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

// Firmenverwaltung Funktionalität
let allFirmen = [];
let filteredFirmen = [];

document.addEventListener('DOMContentLoaded', function() {
    loadFirmen();
    
    // Form Submit Handler für neue Firma
    document.getElementById('firmaForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const firmaData = {
            name: formData.get('name'),
            ansprechpartner: formData.get('kontaktperson'), // API erwartet 'ansprechpartner'
            rufnummer: formData.get('telefon'), // API erwartet 'rufnummer'
            email: formData.get('email'),
            adresse: formData.get('adresse'),
            bemerkung: formData.get('bemerkungen') // API erwartet 'bemerkung' (singular)
        };
        
        // Validierung
        if (!firmaData.name || firmaData.name.trim() === '') {
            showNotification('Firmenname ist erforderlich', 'error');
            return;
        }
        
        try {
            console.log('Sende Firma-Daten:', firmaData);
            
            const response = await fetch('x_mb_api.php?action=firmen', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(firmaData)
            });
            
            console.log('Response Status:', response.status);
            const responseText = await response.text();
            console.log('Response Text:', responseText);
            
            if (response.ok) {
                showNotification('Firma erfolgreich hinzugefügt', 'success');
                e.target.reset();
                loadFirmen();
            } else {
                showNotification(`Fehler beim Hinzufügen der Firma: ${responseText}`, 'error');
            }
        } catch (error) {
            console.error('Fehler beim Hinzufügen:', error);
            showNotification('Fehler: ' + error.message, 'error');
        }
    });
    
    // Form Submit Handler für Firma bearbeiten
    document.getElementById('editFirmaForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const firmaId = formData.get('firmaId');
        const firmaData = {
            name: formData.get('name'),
            ansprechpartner: formData.get('kontaktperson'), // API erwartet 'ansprechpartner'
            rufnummer: formData.get('telefon'), // API erwartet 'rufnummer'
            email: formData.get('email'),
            adresse: formData.get('adresse'),
            bemerkung: formData.get('bemerkungen') // API erwartet 'bemerkung' (singular)
        };
        
        // Validierung
        if (!firmaData.name || firmaData.name.trim() === '') {
            showNotification('Firmenname ist erforderlich', 'error');
            return;
        }
        
        if (!firmaId) {
            showNotification('Fehler: Keine Firma-ID gefunden', 'error');
            return;
        }
        
        try {
            console.log('Aktualisiere Firma:', firmaId, firmaData);
            
            const response = await fetch(`x_mb_api.php?action=firmen&id=${encodeURIComponent(firmaId)}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(firmaData)
            });
            
            console.log('Update Response Status:', response.status);
            const responseText = await response.text();
            console.log('Update Response Text:', responseText);
            
            if (response.ok) {
                showNotification('Firma erfolgreich aktualisiert', 'success');
                closeEditModal();
                loadFirmen();
            } else {
                showNotification(`Fehler beim Aktualisieren der Firma: ${responseText}`, 'error');
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren:', error);
            showNotification('Fehler: ' + error.message, 'error');
        }
    });
    
    // Suchfunktion
    document.getElementById('searchFirmen').addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        filteredFirmen = allFirmen.filter(firma => 
            (firma.name || '').toLowerCase().includes(searchTerm) ||
            (firma.ansprechpartner || '').toLowerCase().includes(searchTerm) ||
            (firma.email || '').toLowerCase().includes(searchTerm)
        );
        displayFirmen();
    });
});

async function loadFirmen() {
    try {
        console.log('Lade Firmen...');
        const response = await fetch('x_mb_api.php?action=firmen', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('Firmen Response Status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const responseText = await response.text();
        console.log('Raw Response:', responseText);
        
        try {
            allFirmen = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            throw new Error('Ungültige JSON-Antwort vom Server');
        }
        
        if (!Array.isArray(allFirmen)) {
            console.warn('Firmen ist kein Array:', allFirmen);
            allFirmen = [];
        }
        
        filteredFirmen = [...allFirmen];
        console.log('Geladene Firmen:', allFirmen);
        displayFirmen();
    } catch (error) {
        console.error('Fehler beim Laden der Firmen:', error);
        showNotification('Fehler beim Laden der Firmen: ' + error.message, 'error');
        
        // Fallback: leere Liste anzeigen
        allFirmen = [];
        filteredFirmen = [];
        displayFirmen();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displayFirmen() {
    const container = document.getElementById('firmenContainer');
    container.innerHTML = '';
    
    // Suchstatistiken aktualisieren
    const stats = document.getElementById('searchStats');
    if (filteredFirmen.length === allFirmen.length) {
        stats.textContent = `${allFirmen.length} Firma${allFirmen.length !== 1 ? 'en' : ''} gefunden`;
    } else {
        stats.textContent = `${filteredFirmen.length} von ${allFirmen.length} Firmen angezeigt (gefiltert)`;
    }
    
    if (filteredFirmen.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏢</div>
                <p>Keine Firmen gefunden</p>
                <p style="font-size: 0.9em; margin-top: 8px;">Versuchen Sie andere Suchbegriffe oder fügen Sie eine neue Firma hinzu.</p>
            </div>
        `;
        return;
    }
    
    filteredFirmen.forEach(firma => {
        const item = document.createElement('div');
        item.className = 'firma-item';
        item.innerHTML = `
            <div class="firma-header">
                <h3 class="firma-name">${escapeHtml(firma.name || 'Unbekannt')}</h3>
                <div class="firma-actions">
                    <button class="btn-small btn-primary" onclick="editFirma('${firma.id}')">✏️ Bearbeiten</button>
                    <button class="btn-small btn-danger" onclick="deleteFirma('${firma.id}')">🗑️ Löschen</button>
                </div>
            </div>
            <div class="firma-details">
                ${firma.ansprechpartner ? `
                    <div class="firma-detail">
                        <span class="firma-detail-icon">👤</span>
                        <strong>Kontakt:</strong> ${escapeHtml(firma.ansprechpartner)}
                    </div>
                ` : ''}
                ${firma.rufnummer ? `
                    <div class="firma-detail">
                        <span class="firma-detail-icon">📞</span>
                        <strong>Telefon:</strong> <a href="tel:${firma.rufnummer}" style="color: var(--color-accent); text-decoration: none;">${escapeHtml(firma.rufnummer)}</a>
                    </div>
                ` : ''}
                ${firma.email ? `
                    <div class="firma-detail">
                        <span class="firma-detail-icon">📧</span>
                        <strong>E-Mail:</strong> <a href="mailto:${firma.email}" style="color: var(--color-accent); text-decoration: none;">${escapeHtml(firma.email)}</a>
                    </div>
                ` : ''}
                ${firma.adresse ? `
                    <div class="firma-detail">
                        <span class="firma-detail-icon">📍</span>
                        <strong>Adresse:</strong> ${escapeHtml(firma.adresse)}
                    </div>
                ` : ''}
                ${firma.bemerkung ? `
                    <div class="firma-detail">
                        <span class="firma-detail-icon">📝</span>
                        <strong>Bemerkungen:</strong> ${escapeHtml(firma.bemerkung)}
                    </div>
                ` : ''}
            </div>
        `;
        container.appendChild(item);
    });
}

function editFirma(firmaId) {
    const firma = allFirmen.find(f => f.id === firmaId);
    if (!firma) return;
    
    document.getElementById('editFirmaId').value = firma.id;
    document.getElementById('editName').value = firma.name || '';
    document.getElementById('editKontaktperson').value = firma.ansprechpartner || '';
    document.getElementById('editTelefon').value = firma.rufnummer || '';
    document.getElementById('editEmail').value = firma.email || '';
    document.getElementById('editAdresse').value = firma.adresse || '';
    document.getElementById('editBemerkungen').value = firma.bemerkung || '';
    
    document.getElementById('editFirmaModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editFirmaModal').style.display = 'none';
    document.getElementById('editFirmaForm').reset();
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

// Löschen einer Firma
async function deleteFirma(firmaId) {
    if (!confirm('Sind Sie sicher, dass Sie diese Firma löschen möchten?')) return;
    
    try {
        console.log('Lösche Firma:', firmaId);
        
        const response = await fetch(`x_mb_api.php?action=firmen&id=${encodeURIComponent(firmaId)}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('Delete Response Status:', response.status);
        const responseText = await response.text();
        console.log('Delete Response Text:', responseText);
        
        if (response.ok) {
            // Bei 200 OK als Erfolg behandeln, auch wenn kein gültiges JSON zurückkommt
            let serverSuccess = true;
            try {
                if (responseText && responseText.trim().length > 0) {
                    const responseData = JSON.parse(responseText);
                    serverSuccess = responseData.success === true;
                }
            } catch (e) {
                console.warn('Delete: Antwort ist kein JSON, fahre fort (200 OK)');
                serverSuccess = true;
            }
            
            if (serverSuccess) {
                showNotification('Firma erfolgreich gelöscht', 'success');
                // Lade die Liste neu vom Server
                loadFirmen();
            } else {
                showNotification('Server-Fehler: Firma wurde nicht gelöscht', 'error');
            }
        } else {
            showNotification(`Fehler beim Löschen der Firma: ${responseText}`, 'error');
        }
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        showNotification('Fehler: ' + error.message, 'error');
    }
}

// Modal schließen bei Klick außerhalb
window.onclick = function(event) {
    const modal = document.getElementById('editFirmaModal');
    if (event.target === modal) {
        closeEditModal();
    }
}
</script>

</body>
</html>
