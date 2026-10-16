<?php
/**
 * Anmelden Seite (PHP Version von mb_anmelden.html)
 */
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fremdfirmen Management - Anmelden</title>
    <link rel="stylesheet" href="startseite.css">
    <link rel="stylesheet" href="mb_compatibility.css">
    <style>
        /* Modernes Corporate-Theme (wie Dashboard) */
        :root {
            --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
            --color-accent: #0d6efd;
            --color-accent-hover: #0b5ed7;
            --color-primary: #1f2937;
            --color-secondary: #6b7280;
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --border-color: #e5e7eb;
            --border-radius: 12px;
            --border-radius-small: 8px;
            --shadow: 0 1px 2px rgba(0,0,0,0.05);
            --shadow-hover: 0 8px 24px rgba(0,0,0,0.12);
            --transition: all .2s ease;
            --header-h: 64px;
        }
        [data-theme="dark"] {
            --color-primary: #e5e7eb;
            --color-secondary: #9ca3af;
            --bg-primary: #0c1425;
            --bg-secondary: #111827;
            --border-color: rgba(255,255,255,0.08);
            --shadow: 0 1px 2px rgba(0,0,0,0.4);
            --shadow-hover: 0 8px 24px rgba(0,0,0,0.35);
        }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { height: 100%; }
        body { font-family: var(--font-sans); color: var(--color-primary); background: var(--bg-primary); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; margin: 0; }
        a { color: inherit; text-decoration: none; }
        header { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; min-height: var(--header-h); padding: 0 24px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); box-shadow: var(--shadow); }
        header h1 { font-size: 1.25rem; font-weight: 700; margin: 0; letter-spacing: .2px; }
        .theme-toggle { background: var(--bg-primary); color: var(--color-primary); border: 1px solid var(--border-color); border-radius: 9999px; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition); box-shadow: var(--shadow); }
        .theme-toggle:hover { transform: translateY(-1px); box-shadow: var(--shadow-hover); }
        .sidebar { position: fixed; top: var(--header-h); bottom: 0; width: 260px; padding: 16px 12px; background: var(--bg-secondary); border-right: 1px solid var(--border-color); overflow-y: auto; }
        .sidebar h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .6px; color: var(--color-secondary); margin: 4px 8px 12px; }
        .sidebar ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
        .sidebar a { color: var(--color-primary); transition: var(--transition); display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; }
        .sidebar a:hover { background: rgba(13,110,253,0.08); }
        .sidebar a.active { background: rgba(13,110,253,0.10); border-left: 3px solid var(--color-accent); }
        main { margin-left: 260px; padding: 24px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 24px; text-align: center; box-shadow: var(--shadow); transition: var(--transition); position: relative; overflow: hidden; }
        .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--color-accent), var(--color-accent-hover)); }
        .stat-number { font-size: 2.4rem; font-weight: 700; color: var(--color-accent); margin-bottom: 6px; display: block; }
        .stat-label { color: var(--color-secondary); font-size: .95em; font-weight: 500; }
        .card { background: transparent; }
        .card-inner { padding: 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--border-radius); box-shadow: var(--shadow); }
        h2.page-title { color: var(--color-primary); margin: 0 0 16px; font-size: 1.25rem; font-weight: 700; }
        .tickets-table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--bg-secondary); border-radius: var(--border-radius); overflow: hidden; box-shadow: var(--shadow); }
        .tickets-table th, .tickets-table td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
        .tickets-table th { background: var(--bg-secondary); color: var(--color-primary); font-weight: 700; font-size: .8rem; text-transform: uppercase; letter-spacing: .4px; border-bottom: 2px solid var(--border-color); }
        .tickets-table tbody tr { cursor: pointer; transition: var(--transition); }
        .tickets-table tbody tr:hover { background: rgba(13,110,253,0.08); }
        .tickets-table td .ticket-actions { white-space: nowrap; }
        .ticket-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn-small { padding: 8px 12px; font-size: .85rem; border: 1px solid transparent; border-radius: var(--border-radius-small); cursor: pointer; transition: var(--transition); display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: var(--color-accent); color: #fff; }
        .btn-primary:hover { background: var(--color-accent-hover); transform: translateY(-1px); }
        .btn-danger { background: #dc3545; color: #fff; }
        .btn-danger:hover { background: #c82333; transform: translateY(-1px); }
        .status-badge { padding: 4px 8px; border-radius: 999px; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; border: 1px solid transparent; }
        .status-angemeldet, .status-offen { background: rgba(25,135,84,0.1); color: #198754; border-color: rgba(25,135,84,0.25); }
        .status-abgemeldet, .status-geschlossen { background: rgba(220,53,69,0.08); color: #dc3545; border-color: rgba(220,53,69,0.25); }
        .modal { display: none; position: fixed; z-index: 1000; inset: 0; background-color: rgba(0,0,0,0.45); }
        .modal-content { background-color: var(--bg-secondary); margin: 8vh auto; padding: 24px; border: 1px solid var(--border-color); border-radius: var(--border-radius); width: 92%; max-width: 640px; box-shadow: var(--shadow-hover); }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--color-primary); }
        .form-group input, .form-group textarea { width: 100%; padding: 12px 14px; background: var(--bg-primary); color: var(--color-primary); border: 1px solid var(--border-color); border-radius: var(--border-radius-small); outline: none; transition: var(--transition); }
        .form-group input:focus, .form-group textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px rgba(13,110,253,0.15); }
        .primary-btn { background: var(--color-accent); color: #fff; padding: 12px 20px; border: none; border-radius: var(--border-radius-small); cursor: pointer; font-size: 1rem; font-weight: 700; transition: var(--transition); }
        .primary-btn:hover { background: var(--color-accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-hover); }
        .secondary-btn { background: var(--bg-primary); color: var(--color-primary); padding: 12px 20px; border: 1px solid var(--border-color); border-radius: var(--border-radius-small); cursor: pointer; font-size: 1rem; transition: var(--transition); }
        .secondary-btn:hover { background: rgba(0,0,0,0.03); }
        /* Verbessertes Form-Design für bessere Benutzerfreundlichkeit */
        .form-container {
            max-width: 850px;
            margin: 0 auto;
        }
        
        .form-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 18px; 
            margin-bottom: 18px;
        }
        
        .form-group { 
            margin-bottom: 0;
            display: flex;
            flex-direction: column;
        }
        
        .form-group label { 
            display: block; 
            margin-bottom: 6px; 
            font-weight: 600; 
            color: var(--color-accent);
            font-size: 0.9em;
            letter-spacing: 0.3px;
            flex-shrink: 0;
        }
        
        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 12px 14px;
            background: var(--bg-primary);
            color: var(--color-primary);
            border: 2px solid var(--border-color);
            border-radius: var(--border-radius);
            outline: none;
            transition: all 0.3s ease;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
            font-size: 0.95em;
            box-sizing: border-box;
            flex: 1;
        }
        
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(88,166,255,0.15);
            transform: translateY(-1px);
            background: var(--bg-secondary);
        }
        
        .form-group input:hover,
        .form-group textarea:hover,
        .form-group select:hover {
            border-color: var(--color-accent);
            background: var(--bg-secondary);
        }
        
        .form-group textarea {
            resize: vertical;
            min-height: 70px;
            font-family: inherit;
        }
        
        .form-group.full-width {
            grid-column: 1 / -1;
        }
        
        .form-actions { 
            margin-top: 25px; 
            text-align: center;
            padding: 20px 0;
            border-top: 1px solid var(--border-color);
        }
        
        .primary-btn {
            background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
            color: #fff;
            padding: 14px 35px;
            border: none;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-size: 1.05em;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 6px 20px rgba(88,166,255,0.3);
            position: relative;
            overflow: hidden;
        }
        
        .primary-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .primary-btn:hover::before {
            left: 100%;
        }
        
        .primary-btn:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 8px 25px rgba(88,166,255,0.4);
        }
        
        .primary-btn:active {
            transform: translateY(-1px);
        }
        
        .notification { 
            padding: 12px 16px; 
            border-radius: var(--border-radius); 
            border: 1px solid var(--border-color); 
            margin: 18px 0;
            position: relative;
            animation: slideInFromTop 0.3s ease-out;
        }
        
        @keyframes slideInFromTop {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .notification.success { 
            background: rgba(35,134,54,0.12); 
            color: var(--color-primary); 
            border-color: rgba(35,134,54,0.35);
            border-left: 4px solid #28a745;
        }
        
        .notification.error { 
            background: rgba(248,81,73,0.12); 
            color: var(--color-primary); 
            border-color: rgba(248,81,73,0.35);
            border-left: 4px solid #dc3545;
        }
        
        .card-inner { 
            padding: 30px; 
        }
        
        h2.page-title { 
            color: var(--color-accent); 
            margin-bottom: 20px; 
            text-align: center;
            font-size: 1.8em;
            font-weight: 700;
            position: relative;
        }
        
        h2.page-title::after {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 50px;
            height: 3px;
            background: linear-gradient(90deg, var(--color-accent), var(--color-accent-hover));
            border-radius: 2px;
        }
        
        .required-field::after {
            content: ' *';
            color: #dc3545;
            font-weight: bold;
        }
        
        .form-help {
            font-size: 0.8em;
            color: var(--color-secondary);
            margin-top: 3px;
            font-style: italic;
            flex-shrink: 0;
        }
        
        .form-section {
            background: var(--bg-primary);
            padding: 20px;
            border-radius: var(--border-radius);
            margin-bottom: 20px;
            border-left: 4px solid var(--color-accent);
        }
        
        .form-section h3 {
            color: var(--color-accent);
            margin: 0 0 16px 0;
            font-size: 1.2em;
            font-weight: 600;
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
            .form-grid {
                grid-template-columns: 1fr;
                gap: 14px;
            }
            
            .card-inner {
                padding: 20px 15px;
            }
            
            .primary-btn {
                padding: 12px 25px;
                font-size: 1em;
            }
            
            .form-section {
                padding: 16px;
            }
        }
        
        @media (max-width: 480px) {
            .form-container {
                max-width: 100%;
            }
            
            .form-section h3 {
                font-size: 1.1em;
            }
        }

        /* Anmeldung: Kontrast- und Farb-Optimierungen */
        :root {
            /* Kräftigeres Akzentblau, höherer Textkontrast und markanterer Rahmen */
            --color-accent: #0a5bff;
            --color-accent-hover: #084ddb;
            --color-primary: #0b1324;
            --color-secondary: #4b5563;
            --bg-secondary: #f3f4f6;
            --border-color: #d1d5db;
        }
        [data-theme="dark"] {
            /* In Dark-Theme sichtbarere Rahmen */
            --border-color: rgba(255,255,255,0.12);
        }

        /* Status-Badges deutlicher */
        .status-badge { font-weight: 700; }
        .status-angemeldet, .status-offen {
            background: rgba(25,135,84,0.18);
            color: #146c43;
            border-color: rgba(25,135,84,0.35);
        }
        .status-abgemeldet, .status-geschlossen {
            background: rgba(220,53,69,0.16);
            color: #b02a37;
            border-color: rgba(220,53,69,0.35);
        }

        /* Deutlichere Focus-Ringe */
        .form-group input:focus, .form-group textarea:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(10,91,255,0.25);
            transform: translateY(-1px);
        }
        .primary-btn:focus-visible, .secondary-btn:focus-visible, .btn-small:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px rgba(10,91,255,0.25);
        }

        /* Überschriften etwas akzentuierter */
        h2.page-title { color: var(--color-primary); letter-spacing: .2px; }

        /* Anmeldung: Theme-abhängige Farb-Optimierungen (Light/Dark) */
        :root, [data-theme="light"] {
            --color-accent: #2563eb;            /* blue-600 */
            --color-accent-hover: #1d4ed8;     /* blue-700 */
            --color-primary: #111827;          /* gray-900 */
            --color-secondary: #4b5563;        /* gray-600 */
            --bg-secondary: #f8fafc;           /* Kartenhintergrund */
            --border-color: #e5e7eb;           /* klare Abgrenzung */
            --focus-ring: rgba(37,99,235,0.22);
        }
        [data-theme="dark"] {
            --color-accent: #60a5fa;            /* blue-400 */
            --color-accent-hover: #3b82f6;      /* blue-500 */
            --color-primary: #e5e7eb;           /* heller Text */
            --color-secondary: #94a3b8;         /* slate-400 */
            --bg-secondary: #111827;            /* leicht heller als Page */
            --border-color: rgba(255,255,255,0.12);
            --focus-ring: rgba(96,165,250,0.35);
        }

        /* Deutlichere Focus-Ringe auf Basis des Themes */
        .form-group input:focus, .form-group textarea:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px var(--focus-ring);
            transform: translateY(-1px);
        }
        .primary-btn:focus-visible, .secondary-btn:focus-visible, .btn-small:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px var(--focus-ring);
        }

        /* Status-Badges: Light vs. Dark differenziert für bessere Lesbarkeit */
        [data-theme="light"] .status-angemeldet, [data-theme="light"] .status-offen {
            background: rgba(34,197,94,0.14);   /* green-500 */
            color: #15803d;                     /* green-700 */
            border-color: rgba(34,197,94,0.35);
        }
        [data-theme="dark"] .status-angemeldet, [data-theme="dark"] .status-offen {
            background: rgba(34,197,94,0.18);
            color: #34d399;                     /* green-400 */
            border-color: rgba(34,197,94,0.45);
        }
        [data-theme="light"] .status-abgemeldet, [data-theme="light"] .status-geschlossen {
            background: rgba(239,68,68,0.12);   /* red-500 */
            color: #b91c1c;                     /* red-700 */
            border-color: rgba(239,68,68,0.30);
        }
        [data-theme="dark"] .status-abgemeldet, [data-theme="dark"] .status-geschlossen {
            background: rgba(239,68,68,0.18);
            color: #f87171;                     /* red-400 */
            border-color: rgba(239,68,68,0.40);
        }

        /* Anmeldung: Professionelle, konsolidierte Farb- und UI-Overrides */
        :root, [data-theme="light"] {
            --color-accent: #0d6efd;          /* Corporate Blue */
            --color-accent-hover: #0b5ed7;    /* dunklerer Akzent */
            --color-primary: #111827;         /* Gray 900 */
            --color-secondary: #4b5563;       /* Gray 600 */
            --bg-secondary: #f8fafc;          /* Kartenhintergrund */
            --border-color: #e5e7eb;          /* klare Abgrenzung */
            --focus-ring: rgba(13,110,253,0.22);
        }
        [data-theme="dark"] {
            --color-accent: #0d6efd;          /* Corporate Blue (konstant) */
            --color-accent-hover: #0b5ed7;
            --color-primary: #e5e7eb;         /* heller Text */
            --color-secondary: #9ca3af;       /* Gray 400 */
            --bg-secondary: #111827;          /* leicht heller als Page */
            --border-color: rgba(255,255,255,0.12);
            --focus-ring: rgba(13,110,253,0.35);
        }

        /* Einheitliche, ruhige Fokus-States ohne Springen */
        .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px var(--focus-ring);
            transform: none;
            background: var(--bg-primary);
        }

        /* Buttons: solide Corporate-Farbe, dezente Elevation */
        .primary-btn {
            background: var(--color-accent);
            box-shadow: var(--shadow);
        }
        .primary-btn:hover {
            background: var(--color-accent-hover);
            box-shadow: var(--shadow-hover);
            transform: translateY(-1px);
        }
        .primary-btn:active { transform: none; }
        .secondary-btn:hover { background: rgba(0,0,0,0.04); }

        /* Überschrift klar im Akzent für Hierarchie */
        h2.page-title { color: var(--color-accent) !important; }
    </style>
</head>
<body>

<header>
    <h1>Fremdfirmen Management</h1>
    <div class="header-controls">
        <button id="themeToggle" class="theme-toggle" title="Theme wechseln"><span class="theme-icon">🌙</span></button>
    </div>
</header>

<div class="sidebar">
    <h2>Navigation</h2>
    <ul>
        <li><a href="index.html">🏠 Startseite</a></li>
        <li><a href="x_dashboard.php">📊 Dashboard</a></li>
        <li><a href="x_anmelden.php" class="active">➕ Anmelden</a></li>
        <li><a href="x_archiv.php">📁 Archiv</a></li>
        <li><a href="x_firmen.php">🏢 Firmenverwaltung</a></li>
    </ul>
</div>

<main>
    <!-- Neue Fremdfirma anmelden -->
    <section class="card">
        <div class="card-inner">
            <h2 class="page-title">Neue Fremdfirma anmelden</h2>
            <div class="form-container">
                <form id="anmeldeForm">
                    <!-- Grunddaten -->
                    <div class="form-section">
                        <h3>📋 Grunddaten</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="firma" class="required-field">Firma</label>
                                <div style="position: relative;">
                                    <input type="text" id="firma" name="firma" required placeholder="Firmenname eingeben" autocomplete="off" list="firmenlist">
                                    <datalist id="firmenlist">
                                        <!-- Wird per JavaScript gefüllt -->
                                    </datalist>
                                    <button type="button" id="autofillBtn" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: var(--color-accent); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8em;">📋 Autofill</button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="arbeiten" class="required-field">Arbeiten</label>
                                <input type="text" id="arbeiten" name="arbeiten" placeholder="Art der Arbeiten">
                            </div>
                            <div class="form-group full-width">
                                <label for="arbeitsbereich" class="required-field">Arbeitsbereich</label>
                                <input type="text" id="arbeitsbereich" name="arbeitsbereich" required placeholder="z.B. Mittelwerk, Büro">
                                <div class="form-help">Geben Sie den genauen Arbeitsbereich an</div>
                            </div>
                        </div>
                    </div>

                    <!-- Kontaktdaten -->
                    <div class="form-section">
                        <h3>👥 Kontaktdaten</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="ansprechpartner" class="required-field">Ansprechpartner</label>
                                <input type="text" id="ansprechpartner" name="ansprechpartner" required placeholder="z.B. Herr Müller" autocomplete="off">
                            </div>
                            <div class="form-group">
                                <label for="rufnummer" class="required-field">Rufnummer</label>
                                <input type="tel" id="rufnummer" name="rufnummer" required placeholder="z.B. 0123 456789" autocomplete="off">
                            </div>
                            <div class="form-group">
                                <label for="anzahlPersonen" class="required-field">Anzahl Personen</label>
                                <input type="number" id="anzahlPersonen" name="anzahlPersonen" min="1" max="50" required value="1">
                            </div>
                            <div class="form-group">
                                <label for="arbeitsanfang" class="required-field">Arbeitsanfang</label>
                                <input type="time" id="arbeitsanfang" name="arbeitsanfang" required>
                            </div>
                        </div>
                    </div>

                    <!-- Material und Schlüssel -->
                    <div class="form-section">
                        <h3>📦 Ausgegebene Gegenstände</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="ausgegebenesMaterial">Ausgegebenes Material</label>
                                <textarea id="ausgegebenesMaterial" name="ausgegebenesMaterial" rows="3" placeholder="z.B. Helm, Werkzeuge"></textarea>
                                <div class="form-help">Optional: Liste der ausgegebenen Materialien</div>
                            </div>
                            <div class="form-group">
                                <label for="ausgegebeneSchluessel">Ausgegebene Schlüssel</label>
                                <textarea id="ausgegebeneSchluessel" name="ausgegebeneSchluessel" rows="3" placeholder="z.B. Freiluftanlage"></textarea>
                                <div class="form-help">Optional: Liste der ausgegebenen Schlüssel</div>
                            </div>
                        </div>
                    </div>

                    <!-- Zusätzliche Informationen -->
                    <div class="form-section">
                        <h3>📝 Zusätzliche Informationen</h3>
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="bemerkung">Bemerkungen</label>
                                <textarea id="bemerkung" name="bemerkung" rows="3" placeholder="Besondere Hinweise oder Anmerkungen"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="absenderName" class="required-field">Absender Name</label>
                                <input type="text" id="absenderName" name="absenderName" required placeholder="Ihr Name für die E-Mail-Signatur">
                                <div class="form-help">Wird in der E-Mail-Signatur verwendet</div>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="primary-btn">🚀 Anmelden & E-Mail erstellen</button>
                    </div>
                </form>
            </div>
        </div>
    </section>
</main>

<script>
// Theme Toggle (optional)
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
</script>

<script>
// JavaScript für die Anmelde-Funktionalität
document.addEventListener('DOMContentLoaded', function() {
    // Aktuelle Uhrzeit beim Laden der Seite setzen
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    document.getElementById('arbeitsanfang').value = timeString;
    
    // Firmen-Autofill Funktionalität
    let firmenData = [];
    loadFirmenForAutofill();
    
    // Form Submit Handler
    const form = document.getElementById('anmeldeForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const ticketData = {};
        for (let [key, value] of formData.entries()) { ticketData[key] = value; }
        
        // Client-seitige Ticket ID generieren (wird evtl. vom Server ersetzt)
        ticketData.id = 't_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
        ticketData.status = 'angemeldet';
        ticketData.erstellungsdatum = new Date().toISOString().split('T')[0];
        ticketData.erstelltAm = new Date().toISOString();
        
        // Debug-Ausgabe
        console.log('Ticket-Daten vor dem Senden:', ticketData);
        
        try {
            console.log('Teste API-Verbindung zu x_mb_api.php...');
            
            const response = await fetch('x_mb_api.php?action=tickets', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(ticketData)
            });
            
            console.log('Response Status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server Error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('Server Response:', result);
            const createdId = result.id || ticketData.id; // Server-ID bevorzugen
            if (createdId !== ticketData.id) {
                console.warn('Server hat andere Ticket-ID vergeben:', createdId, 'statt', ticketData.id);
            }
            showNotification('Ticket erfolgreich erstellt! Ticket-ID: ' + createdId, 'success');
            
            // E-Mail-Vorlage automatisch generieren
            try {
                console.log('Generiere E-Mail für Ticket:', createdId);
                const emailResponse = await fetch('x_mb_api.php?action=send-email', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ ticketId: createdId, isStart: true })
                });
                
                if (!emailResponse.ok) {
                    const errorText = await emailResponse.text();
                    console.error('E-Mail-Generierung fehlgeschlagen:', errorText);
                    showNotification('Ticket erstellt, aber E-Mail-Vorlage konnte nicht generiert werden (HTTP ' + emailResponse.status + ').', 'error');
                } else {
                    const emailResult = await emailResponse.json();
                    console.log('E-Mail Ergebnis:', emailResult);
                    showEmailOptions(createdId, emailResult);
                }
            } catch (emailError) {
                console.error('E-Mail-Generierung Fehler:', emailError);
                showNotification('Ticket erstellt, aber E-Mail-Vorlage konnte nicht generiert werden.', 'error');
            }
            
            form.reset();
            const now2 = new Date();
            document.getElementById('arbeitsanfang').value = now2.toTimeString().slice(0, 5);
        } catch (error) {
            console.error('Vollständiger Error:', error);
            
            let errorMessage = 'Fehler beim Erstellen des Tickets';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Verbindung zur API fehlgeschlagen. Ist x_mb_api.php verfügbar?';
            } else if (error.message.includes('HTTP')) {
                errorMessage = 'Server-Fehler: ' + error.message;
            } else {
                errorMessage = 'Fehler: ' + error.message;
            }
            
            showNotification(errorMessage, 'error');
        }
    });
    
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        const form = document.getElementById('anmeldeForm');
        form.parentNode.insertBefore(notification, form);
        setTimeout(() => notification.remove(), 5000);
    }
    
    function showEmailOptions(ticketId, emailResult) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:1000;';
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:var(--bg-secondary);color:var(--color-primary);padding:30px;border-radius:10px;max-width:500px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.3);border:1px solid var(--border-color);';
        modalContent.innerHTML = `
            <h3 style="margin-bottom:20px;color:var(--color-accent);">E-Mail-Versand</h3>
            <p style="margin-bottom:20px;color:var(--color-primary);">Ticket erstellt. Wählen Sie eine Option:</p>
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
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Firmen-Autofill Funktionen
    async function loadFirmenForAutofill() {
        try {
            const response = await fetch('x_mb_api.php?action=firmen');
            if (response.ok) {
                firmenData = await response.json();
                console.log('Firmen für Autofill geladen:', firmenData.length);
                updateFirmenDatalist();
                setupAutofillHandlers();
            }
        } catch (error) {
            console.error('Fehler beim Laden der Firmen:', error);
        }
    }
    
    function updateFirmenDatalist() {
        const datalist = document.getElementById('firmenlist');
        datalist.innerHTML = '';
        
        firmenData.forEach(firma => {
            const option = document.createElement('option');
            option.value = firma.name;
            option.textContent = firma.name;
            datalist.appendChild(option);
        });
    }
    
    function setupAutofillHandlers() {
        const firmaInput = document.getElementById('firma');
        const autofillBtn = document.getElementById('autofillBtn');
        
        // Autofill-Button Click Handler
        autofillBtn.addEventListener('click', function() {
            const firmaName = firmaInput.value.trim();
            if (firmaName) {
                autofillFromFirma(firmaName);
            } else {
                showFirmenModal();
            }
        });
        
        // Enter-Taste im Firma-Feld
        firmaInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const firmaName = firmaInput.value.trim();
                if (firmaName) {
                    autofillFromFirma(firmaName);
                }
            }
        });
        
        // Automatisches Autofill bei Eingabe (optional)
        firmaInput.addEventListener('input', function() {
            const firmaName = this.value.trim();
            const matchedFirma = firmenData.find(f => 
                f.name && f.name.toLowerCase() === firmaName.toLowerCase()
            );
            
            if (matchedFirma) {
                // Visueller Hinweis, dass Autofill verfügbar ist
                autofillBtn.style.background = '#28a745';
                autofillBtn.textContent = '✓ Fill';
            } else {
                autofillBtn.style.background = 'var(--color-accent)';
                autofillBtn.textContent = '📋 Autofill';
            }
        });
    }
    
    function autofillFromFirma(firmaName) {
        const matchedFirma = firmenData.find(f => 
            f.name && f.name.toLowerCase() === firmaName.toLowerCase()
        );
        
        if (matchedFirma) {
            // Felder ausfüllen
            if (matchedFirma.ansprechpartner) {
                document.getElementById('ansprechpartner').value = matchedFirma.ansprechpartner;
            }
            if (matchedFirma.rufnummer) {
                document.getElementById('rufnummer').value = matchedFirma.rufnummer;
            }
            
            showNotification(`Daten von "${matchedFirma.name}" eingefügt`, 'success');
            
            // Visuelles Feedback
            ['ansprechpartner', 'rufnummer'].forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field.value) {
                    field.style.borderColor = '#28a745';
                    setTimeout(() => {
                        field.style.borderColor = '';
                    }, 2000);
                }
            });
        } else {
            showNotification(`Firma "${firmaName}" nicht in der Datenbank gefunden`, 'error');
        }
    }
    
    function showFirmenModal() {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:1000;';
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:var(--bg-secondary);color:var(--color-primary);padding:30px;border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);border:1px solid var(--border-color);';
        
        let modalHtml = `
            <h3 style="margin-bottom:20px;color:var(--color-accent);text-align:center;">📋 Firma auswählen</h3>
            <div style="margin-bottom:20px;">
                <input type="text" id="firmaSearch" placeholder="Firma suchen..." style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--color-primary);">
            </div>
            <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
        `;
        
        if (firmenData.length === 0) {
            modalHtml += '<p style="text-align:center;padding:20px;color:var(--color-secondary);">Keine Firmen verfügbar</p>';
        } else {
            firmenData.forEach(firma => {
                modalHtml += `
                    <div class="firma-item" data-firma='${JSON.stringify(firma)}' style="padding:12px;border-bottom:1px solid var(--border-color);cursor:pointer;transition:background-color 0.2s;" 
                         onmouseover="this.style.backgroundColor='var(--color-accent-hover)'" 
                         onmouseout="this.style.backgroundColor=''">
                        <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(firma.name || 'Unbekannt')}</div>
                        <div style="font-size:0.9em;color:var(--color-secondary);">
                            ${escapeHtml(firma.ansprechpartner || '')} ${firma.ansprechpartner && firma.rufnummer ? '•' : ''} ${escapeHtml(firma.rufnummer || '')}
                        </div>
                    </div>
                `;
            });
        }
        
        modalHtml += `
            </div>
            <div style="margin-top:20px;text-align:center;">
                <button id="closeModal" style="background:#6c757d;color:white;padding:10px 20px;border:none;border-radius:6px;cursor:pointer;">Schließen</button>
            </div>
        `;
        
        modalContent.innerHTML = modalHtml;
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event Handlers für Modal
        document.getElementById('closeModal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // Firma-Item Click Handler
        modalContent.querySelectorAll('.firma-item').forEach(item => {
            item.addEventListener('click', function() {
                const firma = JSON.parse(this.dataset.firma);
                document.getElementById('firma').value = firma.name || '';
                autofillFromFirma(firma.name || '');
                modal.remove();
            });
        });
        
        // Suchfunktion
        const searchInput = document.getElementById('firmaSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                modalContent.querySelectorAll('.firma-item').forEach(item => {
                    const firma = JSON.parse(item.dataset.firma);
                    const matches = (firma.name && firma.name.toLowerCase().includes(searchTerm)) ||
                                   (firma.ansprechpartner && firma.ansprechpartner.toLowerCase().includes(searchTerm));
                    item.style.display = matches ? 'block' : 'none';
                });
            });
            searchInput.focus();
        }
    }
});
</script>

</body>
</html>
