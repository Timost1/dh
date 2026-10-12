/* Schicht-/Urlaubsplaner Frontend
   - A–E: Rhythmus 2F,2M,2N,4Frei (10 Tage)
   - Start: Schicht A beginnt am 06.07.2025 mit Frühschicht; Wiederholung ab 16.07. usw.
   - Offsets: A=0, B=8, C=6, D=4, E=2 (gegenüber A). F: Mo–Fr Frühschicht.
   - Monats- und Jahresansicht, Feiertage/Wochenenden farblich markiert.
*/
(function(){
  const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const DOW = ['So','Mo','Di','Mi','Do','Fr','Sa']; // for tooltips

  // Anker: A beginnt am 06.07.2025 mit Früh 1/2 → 27.09.2025 ist M (Tag 2 der Mittagschicht)
  const A_START = new Date(Date.UTC(2025, 6, 6));
  const TEAM_OFFSETS = { A:0, B:8, C:6, D:4, E:2 };

  const plannerContainer = document.getElementById('plannerContainer');
  const yearInput = document.getElementById('yearInput');
  const shiftSelect = document.getElementById('shiftSelect');
  const yearBtn = document.querySelector('.view-btn[data-view="year"]');
  const monthBtns = Array.from(document.querySelectorAll('.month-btn'));

  // --- Personen-Auswahl für Schicht F (dedupliziert nach Name) ---
  const PERSON_KEY = 'plannerFPersonName';
  function uniqueFPersons(){
    const map = new Map();
    (mitarbeiterCache||[]).forEach(p => {
      if(normalizeShift(p.schicht) !== 'F') return;
      const name = String(p.name||'').trim();
      const key = name.toLowerCase();
      if(!map.has(key)) map.set(key, { name, ref: p });
    });
    return Array.from(map.values()).map(x => ({ name: x.name, ref: x.ref }));
  }
  function ensurePersonSelector(){
    const controlsBar = document.querySelector('.controls');
    if(!controlsBar) return { wrap:null, select:null };
    let wrap = document.getElementById('personSelectWrap');
    let sel = document.getElementById('personSelect');
    if(!wrap){
      wrap = document.createElement('label');
      wrap.id = 'personSelectWrap';
      wrap.className = 'person-select';
      wrap.style.display = 'none';
      wrap.innerHTML = 'Mitarbeiter: <select id="personSelect"></select>';
      const shiftLabel = shiftSelect ? shiftSelect.closest('label') : null;
      if(shiftLabel && shiftLabel.parentElement){ shiftLabel.parentElement.insertBefore(wrap, shiftLabel.nextSibling); }
      else { controlsBar.appendChild(wrap); }
    }
    if(!sel){ sel = wrap.querySelector('#personSelect'); }
    return { wrap, select: sel };
  }
  async function populatePersonSelector(){
    const { wrap, select } = ensurePersonSelector();
    if(!wrap || !select) return;
    await ensureMitarbeiter();
    const isF = normalizeShift(shiftSelect.value||'') === 'F';
    wrap.style.display = isF ? '' : 'none';
    if(!isF) return;
    const persons = uniqueFPersons();
    const prev = localStorage.getItem(PERSON_KEY)||'';
    const names = persons.map(x=>x.name).filter(Boolean).sort((a,b)=>a.localeCompare(b,'de'));
    const selName = names.includes(prev) ? prev : (function(){
      const loggedName = (localStorage.getItem('username')||'').trim();
      if(names.includes(loggedName)) return loggedName;
      return names[0] || '';
    })();
    select.innerHTML = names.map(n=>`<option value="${n}">${n}</option>`).join('');
    if(selName) select.value = selName;
    localStorage.setItem(PERSON_KEY, select.value||'');
    if(!select._bound){
      select.addEventListener('change', ()=>{ localStorage.setItem(PERSON_KEY, select.value||''); render(activeView); });
      select._bound = true;
    }
  }

  // Normalize shift names (e.g., "Früh" -> "F")
  function normalizeShift(val){
    const t = String(val||'').trim();
    const up = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    // Extract team letter from patterns like 'SCHICHT C', 'TEAM: F', 'GRUPPE-F'
    const mTeam = up.match(/\b(SCHICHT|TEAM|GRUPPE)\s*[:\-]?\s*([A-F])\b/);
    if(mTeam) return mTeam[2];
    // Fallback: any standalone team letter A–F anywhere (e.g., 'MEISTER F')
    const mSolo = up.match(/\b([A-F])\b/);
    if(mSolo) return mSolo[1];
    if(up === 'F' || up.includes('FRUH') || up.includes('FRUEH')) return 'F';
    if(up === 'M' || up.includes('MITTAG') || up.includes('SPAET') || up.includes('SPAE') || up.includes('SPAT')) return 'M';
    if(up === 'N' || up.includes('NACHT')) return 'N';
    if(/^[ABCDEF]$/.test(up)) return up;
    return up;
  }

  // Tag legend chips based on text (F/M/N/Frei/Feiertag/Wochenende)
  function tagLegendChips(){
    const containers = document.querySelectorAll('#legend, .legend');
    containers.forEach(c => {
      const candidates = c.querySelectorAll('.chip, .pill, .badge, li, span, a, button, div');
      candidates.forEach(el => {
        const t = (el.textContent||'').trim().toLowerCase();
        if(!t) return;
        el.setAttribute('data-role','legend');
        if(!el.classList.contains('chip')) el.classList.add('chip');
        // Map text to classes
        if(t === 'f' || /(^|\W)f\s*=\s*früh/.test(t) || /früh/.test(t)) el.classList.add('s-f');
        else if(t === 'm' || /(^|\W)m\s*=\s*mittag/.test(t) || /mittag/.test(t)) el.classList.add('s-m');
        else if(t === 'n' || /(^|\W)n\s*=\s*nacht/.test(t) || /nacht/.test(t)) el.classList.add('s-n');
        else if(/\bfrei\b/.test(t)) el.classList.add('s-frei','frei');
        else if(/feiertag/.test(t)) el.classList.add('feiertag');
        else if(/wochenende/.test(t)) el.classList.add('weekend');
      });
    });
  }
  tagLegendChips();

  // Sync legend chip colors with planner cell styles (ensures exact match)
  function getRGBTuple(str){ const m = String(str||'').match(/rgba?\(([^\)]+)\)/); if(!m) return null; const parts = m[1].split(',').map(s=>parseFloat(s)); return { r:parts[0]||0, g:parts[1]||0, b:parts[2]||0 }; }
  function contrastOn(bg){ const rgb = getRGBTuple(bg); if(!rgb) return '#e5e7eb'; let {r,g,b} = rgb; r/=255; g/=255; b/=255; [r,g,b] = [r,g,b].map(v => v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055, 2.4)); const L = 0.2126*r + 0.7152*g + 0.0722*b; return L > 0.5 ? '#0b1220' : '#f8fafc'; }
  // Hidden style probe to read exact colors independent of current view
  function ensureStyleProbe(){
    if(document.getElementById('planner-style-probe')) return;
    const probe = document.createElement('table');
    probe.id = 'planner-style-probe';
    // add 'year' to ensure selectors like .planner-table.year td.s-f apply
    probe.className = 'planner-table year probe';
    probe.setAttribute('aria-hidden','true');
    probe.style.cssText = 'position:absolute; left:-9999px; top:-9999px; visibility:hidden; pointer-events:none; width:0; height:0;';
    const tb = document.createElement('tbody');
    const tr = document.createElement('tr');
    ['s-f','s-m','s-n','s-frei','feiertag','weekend'].forEach(cls => {
      const td = document.createElement('td');
      td.className = cls;
      td.innerHTML = '<div class="cell"><span class="shift"></span><span class="dow"></span></div>';
      tr.appendChild(td);
    });
    tb.appendChild(tr); probe.appendChild(tb);
    document.body.appendChild(probe);
  }
  function readColorsFrom(el){
    const td = el; const csTd = getComputedStyle(td);
    let bg = csTd.backgroundColor; let bd = csTd.borderColor;
    if(!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'){
      const inner = td.querySelector('.cell'); if(inner){ const csIn = getComputedStyle(inner); bg = csIn.backgroundColor || bg; bd = csIn.borderColor || bd; }
    }
    if(!bd || bd === 'rgba(0, 0, 0, 0)' || bd === 'transparent') bd = bg;
    return { bg, bd };
  }
  function getStyleMap(){
    ensureStyleProbe();
    const map = {};
    const probe = document.getElementById('planner-style-probe');
    const types = ['s-f','s-m','s-n','s-frei','feiertag','weekend'];
    types.forEach(cls => {
      const el = probe.querySelector('td.'+cls);
      if(el){ map[cls] = readColorsFrom(el); }
    });
    return map;
  }

  // Replace legend sync to use probe first, then fallback to live cells
  function syncLegendChipColors(){
    const types = ['s-f','s-m','s-n','s-frei','feiertag','weekend'];
    const colorMap = getStyleMap();
    // Fallback from live planner if needed
    types.forEach(cls => {
      if(!colorMap[cls]){
        const el = plannerContainer.querySelector(`td.${cls}`) || document.querySelector(`.planner-table td.${cls}`);
        if(el) colorMap[cls] = readColorsFrom(el);
      }
    });
    document.querySelectorAll('[data-role="legend"]').forEach(chip => {
      const cls = types.find(c => chip.classList.contains(c));
      if(!cls || !colorMap[cls]) return;
      const { bg, bd } = colorMap[cls];
      chip.style.backgroundColor = bg;
      chip.style.borderColor = bd;
      chip.style.color = contrastOn(bg);
    });
  }
  syncLegendChipColors();

  // Observe theme class changes and resync
  const themeObserver = new MutationObserver(() => { tagLegendChips(); requestAnimationFrame(syncLegendChipColors); });
  themeObserver.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  themeObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });

  // Mark control wrappers for dark styling
  function markControlWrap(el){
    if(!el) return;
    const wrap = el.closest('.input-wrapper, .form-group, .field, .control, .input-group, label, div');
    if(wrap && !wrap.classList.contains('control-wrap')) wrap.classList.add('control-wrap');
  }
  markControlWrap(yearInput);
  markControlWrap(shiftSelect);

  // Add actions container/buttons
  let actions = document.getElementById('plannerActions');
  if(!actions){
    actions = document.createElement('div'); actions.id='plannerActions';
    const yParent = yearBtn ? yearBtn.parentElement : null;
    if(yParent){ yParent.appendChild(actions); }
  }
  const darkToggle = document.getElementById('darkToggle') || (()=>{ const b=document.createElement('button'); b.id='darkToggle'; b.className='btn'; b.textContent='Dark Mode'; actions.appendChild(b); return b; })();
  const printBtn = document.getElementById('printBtn') || (()=>{ const b=document.createElement('button'); b.id='printBtn'; b.className='btn'; b.textContent='Drucken'; actions.appendChild(b); return b; })();

  // Dark mode persistence
  const DARK_KEY = 'plannerDarkMode';
  function applyDarkMode(on){
    const enabled = !!on;
    document.body.classList.toggle('dark', enabled);
    document.documentElement.classList.toggle('dark', enabled);
  }
  const initialDark = localStorage.getItem(DARK_KEY)==='1';
  applyDarkMode(initialDark);
  darkToggle.textContent = initialDark ? 'Light Mode' : 'Dark Mode';
  darkToggle.setAttribute('aria-pressed', initialDark ? 'true' : 'false');
  darkToggle.addEventListener('click', ()=>{
    const on = !document.body.classList.contains('dark');
    applyDarkMode(on);
    localStorage.setItem(DARK_KEY, on?'1':'0');
    darkToggle.textContent = on ? 'Light Mode' : 'Dark Mode';
    darkToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    tagLegendChips();
    syncLegendChipColors();
    requestAnimationFrame(()=>{ tagLegendChips(); syncLegendChipColors(); });
  });

  // Print handling
  printBtn.addEventListener('click', ()=>{
    // Close editor and refresh markers to current view/permissions
    document.body.classList.remove('modal-open');
    const ep = document.getElementById('editorPanel');
    if(ep) ep.classList.remove('open');
    document.body.classList.remove('editor-open');
    // Re-render for clean layout before print
    render(activeView);
    window.print();
  });

  // --- Auth UI Elemente ---
  const anmeldenButton = document.getElementById('anmeldenButton');
  const modal = document.getElementById('modal');
  const closeButton = modal ? modal.querySelector('.close-button') : null;
  const anmeldeForm = document.getElementById('anmeldeForm');
  const rfidInput = document.getElementById('rfidInput');
  const loginMessage = document.getElementById('loginMessage');
  const loginStatusDiv = document.getElementById('login-status');

  // Editor UI Elemente
  const editToggle = document.getElementById('editToggle');
  const editorPanel = document.getElementById('editorPanel');
  const epClose = document.getElementById('epClose');
  const epInfo = document.getElementById('epInfo');
  const epDate = document.getElementById('epDate');
  const epNames = document.getElementById('epNames');
  const epClearDay = document.getElementById('epClearDay');

  // let activeView = { type:'year' }; // duplicate, keep the one defined near the end
  let currentEditDateKey = null;
  let mitarbeiterCache = [];

  // Ensure Mitarbeiterdaten are loaded (available globally in this module)
  async function ensureMitarbeiter(){
    if(mitarbeiterCache && mitarbeiterCache.length) return mitarbeiterCache;
    try { mitarbeiterCache = await fetchMitarbeiterData(); } catch(_) { mitarbeiterCache = []; }
    return mitarbeiterCache;
  }

  // Permissions helpers
  function getPermissions(){ try { return JSON.parse(localStorage.getItem('permissions')) || {}; } catch{ return {}; } }
  function isPermTrue(p, key){
    if(!p) return false;
    const v = p[key] ?? p[key && key.toLowerCase()] ?? p[key && key.toUpperCase()];
    if(v === true || v === 1) return true;
    if(typeof v === 'string'){ const s=v.trim().toLowerCase(); return s==='true' || s==='1' || s==='ja' || s==='yes'; }
    return false;
  }
  function hasAnyPerm(p, keys){ return keys.some(k => isPermTrue(p,k)); }
  function canEdit(){ const p = getPermissions(); return isLoggedIn() && hasAnyPerm(p, ['Meister','meister','Vertreter','vertreter','kannWochenplanBearbeiten','isAdmin']); }
  function isAdmin(){ const p = getPermissions(); return isPermTrue(p, 'isAdmin'); }
  function getLoggedUser(){ const name = localStorage.getItem('username'); const id = parseInt(localStorage.getItem('userId')||'0',10); return { name, id }; }
  function getLoggedUsersShift(){ try{ const u = getLoggedUser(); const m = mitarbeiterCache.find(x=>x.id===u.id); return m && m.schicht ? normalizeShift(m.schicht) : ''; }catch{ return ''; } }
  function canEditSelectedShift(){
    const selected = normalizeShift(shiftSelect.value||'');
    const userShift = getLoggedUsersShift();
    const p = getPermissions();
    const global = isAdmin() || isPermTrue(p, 'kannWochenplanBearbeiten');
    return canEdit() && (global || selected === userShift);
  }



  // Vacation data persistence
  function loadVacation(){ try{ return JSON.parse(localStorage.getItem('urlaubData')||'{}'); }catch{ return {}; } }
  function saveVacation(data){ localStorage.setItem('urlaubData', JSON.stringify(data)); }
  function getDayVacation(key){ const data = loadVacation(); return data[key] || []; }
  function setDayVacation(key, ids){ const data = loadVacation(); data[key] = Array.from(new Set(ids)); saveVacation(data); }
  function clearDayVacation(key){ const data = loadVacation(); delete data[key]; saveVacation(data); }

  // Server-backed vacation persistence (with local fallback and queue)
  window.__vacation = (function(){
    let cache = null;
    let queue = [];
    const STORAGE_KEY = 'urlaubData';
    const API_ENDPOINTS = ['/api/vacation','/vacation'];

    async function tryFetch(url, options){
      try{ const res = await fetch(url, options); return res; } catch(e){ return { ok:false, status:0, _err:e }; }
    }
    async function fetchFallback(options){
      for(const ep of API_ENDPOINTS){
        const res = await tryFetch(ep, options);
        if(res.ok) return res;
        if(res.status && res.status !== 404) return res; // return first non-404 error
      }
      throw new Error('All vacation endpoints failed');
    }

    function localLoad(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch{ return {}; } }
    function localSave(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

    async function fetchAll(){
      try{
        const res = await fetchFallback({ cache:'no-store' });
        if(!res.ok) throw new Error('fetch failed: '+res.status);
        const data = await res.json();
        cache = data || {};
        localSave(cache);
      }catch(err){ console.error('[Vacation] GET failed, using local cache:', err); }
    }
    async function pushUpdate(key, ids){
      try{
        const resp = await fetchFallback({ method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ key, ids }) });
        if(!resp.ok) throw new Error('PUT failed: '+resp.status);
      }catch(err){ console.error('[Vacation] PUT queued due to error:', err); queue.push({ key, ids }); }
    }
    async function flush(){ if(!queue.length) return; const pending = queue.slice(); queue = []; for(const u of pending){ await pushUpdate(u.key, u.ids); } }

    window.addEventListener('online', flush);
    window.addEventListener('beforeunload', ()=>{
      try{
        if(navigator.sendBeacon){
          queue.forEach(u => {
            // try both endpoints; browser ignores failures
            API_ENDPOINTS.forEach(ep => navigator.sendBeacon(ep, new Blob([JSON.stringify(u)], { type:'application/json' })));
          });
        }
      }catch(_){ /* ignore */ }
    });

    function load(){ if(cache) return cache; cache = localLoad(); return cache; }
    function getDay(key){ const d = load(); return d[key] || []; }
    function setDay(key, ids){ const d = load(); d[key] = Array.from(new Set(ids)); cache = d; localSave(d); pushUpdate(key, d[key]); }
    function clearDay(key){ const d = load(); delete d[key]; cache = d; localSave(d); pushUpdate(key, []); }
    async function initSync(){ await fetchAll(); }
    function saveAll(data){ cache = data || {}; localSave(cache); fetchFallback({ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cache) }).catch(err=>console.error('[Vacation] POST failed:', err)); }

    return { load, getDay, setDay, clearDay, initSync, saveAll };
  })();

  // Override top-level persistence helpers to use server-backed layer
  loadVacation = () => window.__vacation.load();
  saveVacation = (data) => window.__vacation.saveAll(data);
  getDayVacation = (key) => window.__vacation.getDay(key);
  setDayVacation = (key, ids) => window.__vacation.setDay(key, ids);
  clearDayVacation = (key) => window.__vacation.clearDay(key);

  function posMod(n, m){ return ((n % m) + m) % m; }
  function daysBetweenUTC(d1, d2){
    const ms = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate()) -
               Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
    return Math.round(ms / 86400000);
  }
  function daysInMonth(year, month){ return new Date(Date.UTC(year, month+1, 0)).getUTCDate(); }
  function isWeekend(date){ const w = date.getUTCDay(); return w===0 || w===6; }

  // Nationwide German holidays (bundesweit) for a year
  function easterSunday(year){
    // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
    const a = year % 19;
    const b = Math.floor(year/100);
    const c = year % 100;
    const d = Math.floor(b/4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19*a + b - d - g + 15) % 30;
    const i = Math.floor(c/4);
    const k = c % 4;
    const l = (32 + 2*e + 2*i - h - k) % 7;
    const m = Math.floor((a + 11*h + 22*l) / 451);
    const month = Math.floor((h + l - 7*m + 114) / 31) - 1; // 0=Jan
    const day = ((h + l - 7*m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month, day));
  }
  function addDaysUTC(date, days){ const d = new Date(date.getTime()); d.setUTCDate(d.getUTCDate()+days); return d; }
  function germanFederalHolidays(year){
    const E = easterSunday(year);
    const holidays = [
      { d: new Date(Date.UTC(year,0,1)), name:'Neujahr' },
      { d: addDaysUTC(E, -2), name:'Karfreitag' },
      { d: addDaysUTC(E, 1),  name:'Ostermontag' },
      { d: new Date(Date.UTC(year,4,1)), name:'Tag der Arbeit' },
      { d: addDaysUTC(E, 39), name:'Christi Himmelfahrt' },
      { d: addDaysUTC(E, 50), name:'Pfingstmontag' },
      { d: new Date(Date.UTC(year,9,3)), name:'Tag der Deutschen Einheit' },
      { d: new Date(Date.UTC(year,11,25)), name:'1. Weihnachtstag' },
      { d: new Date(Date.UTC(year,11,26)), name:'2. Weihnachtstag' },
    ];
    const map = new Map();
    holidays.forEach(h => map.set(dateKey(h.d), h.name));
    return map; // key -> name
  }
  function dateKey(d){ return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }

  function aPhaseFor(dateUTC){
    const diff = daysBetweenUTC(dateUTC, A_START);
    return posMod(diff, 10); // 0..9
  }

  // Provide team shift calculator if missing (A–E: 2F,2M,2N,4Frei; F: Mo–Fr Früh)
  if(typeof shiftForTeamOnDate !== 'function'){
    function shiftForTeamOnDate(team, dateUTC){
      if(team === 'F'){
        const dow = dateUTC.getUTCDay();
        return (dow>=1 && dow<=5) ? 'F' : '';
      }
      const phaseA = aPhaseFor(dateUTC);
      const teamPhase = posMod(phaseA + (TEAM_OFFSETS[team]||0), 10);
      if (teamPhase<=1) return 'F';
      if (teamPhase<=3) return 'M';
      if (teamPhase<=5) return 'N';
      return '';
    }
  }

  // --- Persönliche Rhythmen für Schicht F ---
  function normalizeToken(tok){
    const t = String(tok||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    if(t === 'F' || t.includes('FRUH') || t.includes('FRUEH')) return 'F';
    if(t === 'M' || t.includes('MITTAG') || t.includes('SPAET') || t.includes('SPAE') || t.includes('SPAT')) return 'M';
    if(t === 'N' || t.includes('NACHT')) return 'N';
    if(t === '-' || t === '' || t === 'OFF' || t === 'FREI') return '';
    return t;
  }
  function parseSequence(seq){
    if(Array.isArray(seq)) return seq.map(normalizeToken);
    if(typeof seq === 'string'){
      const parts = seq.split(/[,;|\s]+/).filter(Boolean);
      return parts.map(normalizeToken);
    }
    return [];
  }
  function parseAnchor(val){
    if(!val) return null;
    const d = new Date(val);
    if(!isNaN(d.getTime())) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return null;
  }
  function getPersonPattern(person){
    const r = person && (person.rhythm || person.pattern || person.schedule);
    if(r && typeof r === 'object'){
      const anchor = parseAnchor(r.anchor || r.start || r.startDate);
      const seq = parseSequence(r.sequence || r.seq || r.days || r.pattern);
      if(anchor && seq && seq.length) return { anchor, sequence: seq };
    } else if(typeof r === 'string'){
      const seq = parseSequence(r);
      const anchor = parseAnchor(person && (person.anchor || person.start || person.startDate));
      if(anchor && seq.length) return { anchor, sequence: seq };
    }
    return null;
  }
  function shiftForPersonOnDate(person, dateUTC){
    const cfg = getPersonPattern(person);
    if(cfg && cfg.sequence && cfg.sequence.length && cfg.anchor){
      const diff = daysBetweenUTC(dateUTC, cfg.anchor);
      const idx = posMod(diff, cfg.sequence.length);
      return cfg.sequence[idx] || '';
    }
    const dow = dateUTC.getUTCDay();
    return (dow>=1 && dow<=5) ? 'F' : '';
  }
  function buildYearTableForPerson(year, person){
    const holi = germanFederalHolidays(year);
    const table = document.createElement('table');
    table.className = 'planner-table year';
    table.setAttribute('data-person-id', String(person.id));

    const thead = document.createElement('thead');
    const hr1 = document.createElement('tr');
    const th0 = document.createElement('th'); th0.className='schichtkopf'; th0.textContent = person.name || 'Mitarbeiter'; hr1.appendChild(th0);
    for(let d=1; d<=31; d++){ const th = document.createElement('th'); th.textContent=d; th.className='tagkopf'; hr1.appendChild(th); }
    thead.appendChild(hr1); table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for(let m=0; m<12; m++){
      const tr = document.createElement('tr');
      const mth = document.createElement('th'); mth.textContent = MONTH_NAMES[m]; mth.className='schichtkopf'; tr.appendChild(mth);
      const dim = daysInMonth(year, m);
      for(let d=1; d<=31; d++){
        const td = document.createElement('td');
        if(d<=dim){
          const date = new Date(Date.UTC(year, m, d));
          const key = dateKey(date);
          const shift = shiftForPersonOnDate(person, date);
          const isWE = isWeekend(date);
          if(shift==='F') td.classList.add('s-f');
          if(shift==='M') td.classList.add('s-m');
          if(shift==='N') td.classList.add('s-n');
          if(!shift){ td.classList.add('s-frei'); if(isWE) td.classList.add('weekend'); }
          if(holi.has(key)) { td.classList.add('feiertag'); td.title = holi.get(key); }
          const dow = DOW[date.getUTCDay()];
          td.innerHTML = `<div class="cell"><span class="shift">${shift||''}</span><span class="dow">${dow}</span></div>`;
          td.dataset.dateKey = key; td.removeAttribute('data-vcount'); td.classList.remove('urlaub');
        } else { td.className = 'na'; }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }
  function buildMonthRowForPerson(year, month, person){
    const holi = germanFederalHolidays(year);
    const table = document.createElement('table');
    table.className = 'planner-table month';
    table.setAttribute('data-person-id', String(person.id));

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th'); th0.className='schichtkopf'; th0.textContent = person.name || 'Mitarbeiter'; trh.appendChild(th0);
    const dim = daysInMonth(year, month);
    for(let d=1; d<=dim; d++){ const th = document.createElement('th'); th.textContent=d; th.className='tagkopf'; trh.appendChild(th); }
    thead.appendChild(trh); table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const spacer = document.createElement('th'); spacer.className='schichtkopf'; spacer.textContent=''; tr.appendChild(spacer);
    for(let d=1; d<=dim; d++){
      const td = document.createElement('td');
      const date = new Date(Date.UTC(year, month, d));
      const key = dateKey(date);
      const shift = shiftForPersonOnDate(person, date);
      const isWE = isWeekend(date);
      if(shift==='F') td.classList.add('s-f');
      if(shift==='M') td.classList.add('s-m');
      if(shift==='N') td.classList.add('s-n');
      if(!shift){ td.classList.add('s-frei'); if(isWE) td.classList.add('weekend'); }
      if(holi.has(key)) { td.classList.add('feiertag'); td.title = holi.get(key); }
      const dow = DOW[date.getUTCDay()];
      td.innerHTML = `<div class="cell"><span class="shift">${shift||''}</span><span class="dow">${dow}</span></div>`;
      td.dataset.dateKey = key; td.removeAttribute('data-vcount'); td.classList.remove('urlaub');
      tr.appendChild(td);
    }
    tbody.appendChild(tr); table.appendChild(tbody);
    return table;
  }

  // Fallback standard builders for A–E if missing
  if(typeof buildYearTable !== 'function'){
    function buildYearTable(year, team){
      const holi = germanFederalHolidays(year);
      const table = document.createElement('table');
      table.className = 'planner-table year';
      const thead = document.createElement('thead');
      const hr1 = document.createElement('tr');
      const th0 = document.createElement('th'); th0.className='schichtkopf'; th0.textContent='Monat'; hr1.appendChild(th0);
      for(let d=1; d<=31; d++){ const th = document.createElement('th'); th.textContent=d; th.className='tagkopf'; hr1.appendChild(th); }
      thead.appendChild(hr1); table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for(let m=0; m<12; m++){
        const tr = document.createElement('tr');
        const mth = document.createElement('th'); mth.textContent = MONTH_NAMES[m]; mth.className='schichtkopf'; tr.appendChild(mth);
        const dim = daysInMonth(year, m);
        for(let d=1; d<=31; d++){
          const td = document.createElement('td');
          if(d<=dim){
            const date = new Date(Date.UTC(year, m, d));
            const key = dateKey(date);
            const shift = shiftForTeamOnDate(team, date);
            const isWE = isWeekend(date);
            if(shift==='F') td.classList.add('s-f');
            if(shift==='M') td.classList.add('s-m');
            if(shift==='N') td.classList.add('s-n');
            if(!shift){ td.classList.add('s-frei'); if(isWE) td.classList.add('weekend'); }
            if(holi.has(key)) { td.classList.add('feiertag'); td.title = holi.get(key); }
            const dow = DOW[date.getUTCDay()];
            td.innerHTML = `<div class="cell"><span class="shift">${shift||''}</span><span class="dow">${dow}</span></div>`;
          } else { td.className = 'na'; }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      return table;
    }
  }
  if(typeof buildMonthRow !== 'function'){
    function buildMonthRow(year, month, team){
      const holi = germanFederalHolidays(year);
      const table = document.createElement('table');
      table.className = 'planner-table month';
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      const th0 = document.createElement('th'); th0.className='schichtkopf'; th0.textContent = MONTH_NAMES[month]; trh.appendChild(th0);
      const dim = daysInMonth(year, month);
      for(let d=1; d<=dim; d++){ const th = document.createElement('th'); th.textContent=d; th.className='tagkopf'; trh.appendChild(th); }
      thead.appendChild(trh); table.appendChild(thead);
      const tbody = document.createElement('tbody');
      const tr = document.createElement('tr');
      const spacer = document.createElement('th'); spacer.className='schichtkopf'; spacer.textContent=''; tr.appendChild(spacer);
      for(let d=1; d<=dim; d++){
        const td = document.createElement('td');
        const date = new Date(Date.UTC(year, month, d));
        const key = dateKey(date);
        const shift = shiftForTeamOnDate(team, date);
        const isWE = isWeekend(date);
        if(shift==='F') td.classList.add('s-f');
        if(shift==='M') td.classList.add('s-m');
        if(shift==='N') td.classList.add('s-n');
        if(!shift){ td.classList.add('s-frei'); if(isWE) td.classList.add('weekend'); }
        if(holi.has(key)) { td.classList.add('feiertag'); td.title = holi.get(key); }
        const dow = DOW[date.getUTCDay()];
        td.innerHTML = `<div class="cell"><span class="shift">${shift||''}</span><span class="dow">${dow}</span></div>`;
        tr.appendChild(td);
      }
      tbody.appendChild(tr); table.appendChild(tbody);
      return table;
    }
  }

  // Main render function (handles Schicht F personal planner and standard A–E)
  function render(view){
    const year = parseInt(yearInput.value,10) || new Date().getFullYear();
    const teamRaw = shiftSelect.value;
    const team = normalizeShift(teamRaw||'');
    plannerContainer.innerHTML = '';

    if(team === 'F'){
      populatePersonSelector();
      if(!mitarbeiterCache.length){ ensureMitarbeiter().then(()=>render(view)); return; }
      const selectedName = (localStorage.getItem(PERSON_KEY)||'').trim();
      const persons = uniqueFPersons();
      const person = persons.find(x=>x.name === selectedName) || persons[0];
      if(!person){
        const info = document.createElement('p');
        info.textContent = 'Keine Mitarbeiter der Schicht F gefunden.';
        plannerContainer.appendChild(info);
        tagLegendChips(); syncLegendChipColors();
        return;
      }
      const p = person.ref;
      const section = document.createElement('section'); section.className='person-section';
      const h = document.createElement('h3'); h.textContent = person.name || `Mitarbeiter ${p.id}`; section.appendChild(h);
      if(view && view.type==='month'){
        const tbl = buildMonthRowForPerson(year, view.month, p); section.appendChild(tbl);
        plannerContainer.appendChild(section);
        enableCellEditing(tbl, year, 'F');
      } else {
        const tbl = buildYearTableForPerson(year, p); section.appendChild(tbl);
        plannerContainer.appendChild(section);
        enableCellEditing(tbl, year, 'F');
      }
      tagLegendChips(); syncLegendChipColors();
      return;
    }

    // Standard A–E rendering
    if(view && view.type==='month'){
      plannerContainer.appendChild(buildMonthRow(year, view.month, team));
    } else {
      plannerContainer.appendChild(buildYearTable(year, team));
    }
    tagLegendChips(); syncLegendChipColors();
  }

  // --- Auth Helpers ---
  function isLoggedIn(){ return localStorage.getItem('isLoggedIn') === 'true'; }
  async function fetchMitarbeiterData(){
    try { const res = await fetch('mitarbeiter.json'); return await res.json(); }
    catch(e){ console.error('Fehler beim Laden der Mitarbeiterdaten:', e); return []; }
  }
  async function login(rfid){
    const mitarbeiter = await fetchMitarbeiterData();
    const user = mitarbeiter.find(m => String(m.rfid).trim() === rfid);
    if(user){
      localStorage.setItem('isLoggedIn','true');
      localStorage.setItem('username', user.name);
      localStorage.setItem('permissions', JSON.stringify(user.permissions || {}));
      localStorage.setItem('userId', user.id);
      if(modal){ modal.style.display='none'; document.body.classList.remove('modal-open'); }
      if(anmeldenButton) anmeldenButton.style.display = 'none';
      displayLogout(user.name);
      try { fetch('/api/log_login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: user.id }) }); } catch(_){}
    } else {
      if(loginMessage){ loginMessage.textContent = 'RFID ungültig. Zugriff verweigert!'; loginMessage.style.color = 'red'; }
    }
  }
  function displayLogout(username){
    if(!loginStatusDiv) return;
    loginStatusDiv.innerHTML = `<span style="color:green;">Willkommen, ${username}!</span> <button id="abmeldenButton" class="btn">Abmelden</button>`;
    const abBtn = document.getElementById('abmeldenButton');
    if(abBtn){ abBtn.addEventListener('click', logout); }
  }
  function logout(){
    const userIdToLog = localStorage.getItem('userId');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    localStorage.removeItem('permissions');
    localStorage.removeItem('userId');
    if(loginStatusDiv) loginStatusDiv.innerHTML = '';
    if(anmeldenButton) anmeldenButton.style.display = 'inline-block';
    try { fetch('/api/log_logout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: userIdToLog ? parseInt(userIdToLog,10) : null }) }); } catch(_){}
  }

  // --- Auth UI Wiring ---
  if(anmeldenButton){
    anmeldenButton.addEventListener('click', () => {
      if(modal){ modal.style.display='block'; document.body.classList.add('modal-open'); }
      if(rfidInput){ rfidInput.value=''; rfidInput.focus(); }
      if(loginMessage){ loginMessage.textContent=''; loginMessage.style.color=''; }
    });
  }
  if(closeButton){ closeButton.addEventListener('click', () => { modal.style.display='none'; document.body.classList.remove('modal-open'); }); }
  window.addEventListener('click', (e) => { if(e.target === modal){ modal.style.display='none'; document.body.classList.remove('modal-open'); }});
  if(anmeldeForm){ anmeldeForm.addEventListener('submit', (ev) => { ev.preventDefault(); if(rfidInput) login(rfidInput.value.trim()); }); }

  // Editor Funktionen
  (function(){
    // activeView wird global unten initialisiert; hier keine lokale Kopie erzeugen
    // let activeView = { type:'year' };
    // Verwende die globalen Variablen statt lokaler Schattenvariablen
    // let currentEditDateKey = null;
    // let mitarbeiterCache = [];

    // Permissions helpers
    function getPermissions(){ try { return JSON.parse(localStorage.getItem('permissions')) || {}; } catch{ return {}; } }
    function isPermTrue(p, key){
      if(!p) return false;
      const v = p[key] ?? p[key && key.toLowerCase()] ?? p[key && key.toUpperCase()];
      if(v === true || v === 1) return true;
      if(typeof v === 'string'){ const s=v.trim().toLowerCase(); return s==='true' || s==='1' || s==='ja' || s==='yes'; }
      return false;
    }
    function hasAnyPerm(p, keys){ return keys.some(k => isPermTrue(p,k)); }
    function canEdit(){ const p = getPermissions(); return isLoggedIn() && hasAnyPerm(p, ['Meister','meister','Vertreter','vertreter','kannWochenplanBearbeiten','isAdmin']); }
    function isAdmin(){ const p = getPermissions(); return isPermTrue(p, 'isAdmin'); }
    function getLoggedUser(){ const name = localStorage.getItem('username'); const id = parseInt(localStorage.getItem('userId')||'0',10); return { name, id }; }
    function getLoggedUsersShift(){ try{ const u = getLoggedUser(); const m = mitarbeiterCache.find(x=>x.id===u.id); return m && m.schicht ? normalizeShift(m.schicht) : ''; }catch{ return ''; } }
    function canEditSelectedShift(){
      const selected = normalizeShift(shiftSelect.value||'');
      const userShift = getLoggedUsersShift();
      const p = getPermissions();
      const global = isAdmin() || isPermTrue(p, 'kannWochenplanBearbeiten');
      return canEdit() && (global || selected === userShift);
    }

    // Urlaub-Modus: Einen Mitarbeiter wählen und dann Tage anklicken
    let activeVacationName = null;
    function enterVacationMode(name){
      activeVacationName = name;
      setEditorOpen(true);
      document.body.classList.add('vacation-mode');
      if(epInfo) epInfo.textContent = `Urlaub-Modus: ${name} – Tage anklicken zum Markieren/Entfernen.`;
      let btn = document.getElementById('epVacExit');
      if(!btn){
        btn = document.createElement('button');
        btn.id='epVacExit'; btn.className='btn';
        btn.textContent='Urlaub beenden';
        btn.addEventListener('click', ()=> exitVacationMode());
        if(epInfo && epInfo.parentElement) epInfo.parentElement.appendChild(btn);
        else if(editorPanel) editorPanel.appendChild(btn);
      }
      btn.style.display='';
    }
    function exitVacationMode(){
      activeVacationName = null;
      document.body.classList.remove('vacation-mode');
      const btn = document.getElementById('epVacExit');
      if(btn) btn.style.display='none';
    }

    // Vacation data persistence
    function loadVacation(){ try{ return JSON.parse(localStorage.getItem('urlaubData')||'{}'); }catch{ return {}; } }
    function saveVacation(data){ localStorage.setItem('urlaubData', JSON.stringify(data)); }
    function getDayVacation(key){ const data = loadVacation(); return data[key] || []; }
    function setDayVacation(key, ids){ const data = loadVacation(); data[key] = Array.from(new Set(ids)); saveVacation(data); }
    function clearDayVacation(key){ const data = loadVacation(); delete data[key]; saveVacation(data); }

    // Rebind editor persistence to server-backed implementation
    if(window.__vacation){
      loadVacation = window.__vacation.load;
      saveVacation = window.__vacation.saveAll;
      getDayVacation = window.__vacation.getDay;
      setDayVacation = window.__vacation.setDay;
      clearDayVacation = window.__vacation.clearDay;
    }

    // Enhance render: decorate tables after render instead of overriding builders
    function decoratePlannerTables(){
      const year = parseInt(yearInput.value,10) || new Date().getFullYear();
      const team = normalizeShift(shiftSelect.value||'');

      // Year tables
      document.querySelectorAll('table.planner-table.year').forEach(tbl =>{
        const rows = tbl.querySelectorAll('tbody tr');
        rows.forEach((tr, mIdx) => {
          const dim = daysInMonth(year, mIdx);
          for(let d=1; d<=dim; d++){
            const td = tr.children[d]; if(!td) continue;
            if(!td.dataset.dateKey){
              const key = `${year}-${String(mIdx+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              td.dataset.dateKey = key;
            }
            td.removeAttribute('data-vcount');
            td.classList.remove('urlaub');
          }
        });
        enableCellEditing(tbl, year, team);
      });

      // Month tables
      document.querySelectorAll('table.planner-table.month').forEach(tbl =>{
        // Try to infer month index from header text, else from activeView
        let monthIdx = -1;
        const headTh = tbl.querySelector('thead th.schichtkopf');
        if(headTh){ const txt=(headTh.textContent||'').trim(); monthIdx = MONTH_NAMES.indexOf(txt); }
        if(monthIdx < 0 && typeof activeView !== 'undefined' && activeView && activeView.type==='month'){ monthIdx = activeView.month; }
        const tr = tbl.querySelector('tbody tr');
        if(tr && monthIdx>=0){
          const dim = daysInMonth(year, monthIdx);
          for(let d=1; d<=dim; d++){
            const td = tr.children[d]; if(!td) continue;
            if(!td.dataset.dateKey){
              const key = `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              td.dataset.dateKey = key;
            }
            td.removeAttribute('data-vcount');
            td.classList.remove('urlaub');
          }
        }
        enableCellEditing(tbl, year, team);
      });
    }

    function enableCellEditing(table, year, team){
      // prevent duplicate binding
      if(table && table.dataset && table.dataset.editBound === '1') return;
      if(table && table.dataset) table.dataset.editBound = '1';
      document.body.classList.toggle('edit-mode', canEditSelectedShift());
      table.addEventListener('click', async (e)=>{
        await ensureMitarbeiter();
        if(!canEditSelectedShift()) return;
        const td = e.target.closest('td');
        if(!td || !td.parentElement) return;
        const key = td.dataset.dateKey || (()=>{
          const row = td.parentElement; const monthIndex = Array.from(row.parentElement.children).indexOf(row);
          const dayIndex = Array.from(row.children).indexOf(td); // includes first th, so day index is actual day
          if(monthIndex>=0 && dayIndex>0){ const k = `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(dayIndex).padStart(2,'0')}`; td.dataset.dateKey=k; return k; }
          return null;
        })();
        if(!key) return;
        openEditorForDate(key, team);
      });
    }

    async function openEditorForDate(key, team){
      await ensureMitarbeiter();
      if(!canEditSelectedShift()) return; // guard
      currentEditDateKey = key;
      const [y,m,d] = key.split('-');
      epDate.textContent = `${d}.${m}.${y}`;
      const selectedShift = normalizeShift(shiftSelect.value||'');
      const list = mitarbeiterCache.filter(p => normalizeShift(p.schicht) === selectedShift);
      // Deduplicate by name
      const byName = new Map();
      list.forEach(p=>{ if(!byName.has(p.name)) byName.set(p.name, p); });
      const uniqueList = Array.from(byName.values());
      const dayIds = new Set(getDayVacation(key));

      epNames.innerHTML='';
      if(!uniqueList.length){ epInfo.textContent = `Keine Kollegen in Schicht ${selectedShift} gefunden.`; } else { epInfo.textContent = `Schicht ${selectedShift}: ${uniqueList.length} Personen`; }
      uniqueList.forEach(p => {
        const sameNameIds = mitarbeiterCache
          .filter(q => q.name === p.name && normalizeShift(q.schicht) === selectedShift)
          .map(q => q.id);
        const isActive = sameNameIds.some(id => dayIds.has(id));
        const pill = document.createElement('button');
        pill.type='button'; pill.className = 'name-pill' + (isActive?' active':'');
        pill.textContent = p.name; pill.dataset.userId = String(p.id);
        pill.addEventListener('click', ()=>{
          if(!canEditSelectedShift()) return;
          const nowActive = pill.classList.toggle('active');
          if(nowActive){ sameNameIds.forEach(id => dayIds.add(id)); }
          else { sameNameIds.forEach(id => dayIds.delete(id)); }
          setDayVacation(key, Array.from(dayIds));
          refreshVacationMarks();
        });
        epNames.appendChild(pill);
      });

      setEditorOpen(true);
    }

    function setEditorOpen(open){
      if(open){ editorPanel.classList.add('open'); document.body.classList.add('editor-open'); }
      else { editorPanel.classList.remove('open'); document.body.classList.remove('editor-open'); }
    }

    function closeEditor(){ setEditorOpen(false); currentEditDateKey=null; }
    if(epClose) epClose.addEventListener('click', closeEditor);
    if(epClearDay) epClearDay.addEventListener('click', ()=>{ if(currentEditDateKey){ clearDayVacation(currentEditDateKey); refreshVacationMarks(); openEditorForDate(currentEditDateKey); }});

    function refreshVacationMarks(){
      const logged = isLoggedIn();
      const userShift = logged ? (getLoggedUsersShift()||'') : '';
      // Always clear existing marks first
      const allCells = document.querySelectorAll('.planner-table td');
      allCells.forEach(td=>{ td.classList.remove('urlaub'); td.removeAttribute('data-vcount'); });
      const selectedTeam = normalizeShift(shiftSelect.value||'');
      if(!logged) return;
      // Show vacation if it's own shift OR user has global edit rights (e.g., Admin/kannWochenplanBearbeiten)
      if(!(selectedTeam === userShift || canEditSelectedShift())) return;

      const data = loadVacation();
      allCells.forEach(td=>{
        const key = td.dataset.dateKey;
        if(!key) return;
        const ids = data[key] || [];
        if(!ids.length) return;
        // Filter ids by selected shift
        const sameShift = ids.filter(id => {
          const p = mitarbeiterCache.find(x=>x.id===id);
          return p && normalizeShift(p.schicht) === selectedTeam;
        });
        if(!sameShift.length) return;
        // Count unique names (avoid double counting duplicates)
        const nameSet = new Set();
        sameShift.forEach(id => {
          const p = mitarbeiterCache.find(x=>x.id===id);
          nameSet.add(p && p.name ? p.name : String(id));
        });
        const count = nameSet.size;
        if(count){ td.classList.add('urlaub'); td.setAttribute('data-vcount', String(count)); }
      });
    }

    // Show/hide edit button based on permissions and selected shift
    function updateEditToggle(){ if(editToggle) editToggle.style.display = canEditSelectedShift()? 'inline-block':'none'; }
    if(editToggle){ editToggle.addEventListener('click', ()=>{ if(!canEditSelectedShift()) return; setEditorOpen(!editorPanel.classList.contains('open')); }); }

    // After login/logout update UI
    const origDisplayLogout = displayLogout;
    displayLogout = function(username){
      origDisplayLogout(username);
      // Lade Mitarbeiterdaten, dann UI aktualisieren und neu rendern, damit Edit/Marker sofort aktiv sind
      ensureMitarbeiter().then(()=>{ updateEditToggle(); render(activeView); });
    };
    const origLogout = logout;
    logout = function(){
      origLogout();
      updateEditToggle();
      document.body.classList.remove('edit-mode');
      closeEditor();
      // Neu rendern, um Edit-Listener zu entfernen und Marker zu leeren
      render(activeView);
    };

    // On startup
    ensureMitarbeiter().then(updateEditToggle);
    // Refresh marks after each render
    const origRender = render; render = function(v){ origRender(v); decoratePlannerTables(); refreshVacationMarks(); updateEditToggle(); };

    // Initial render erfolgt global nach Definition von activeView
    // setActiveView(activeView);
  })();

  // Restore login if already signed in
  if(isLoggedIn()){
    if(anmeldenButton) anmeldenButton.style.display='none';
    const name = localStorage.getItem('username') || 'User';
    displayLogout(name);
  }

  // UI wiring
  yearInput.addEventListener('change', () => render(activeView));
  shiftSelect.addEventListener('change', () => render(activeView));
  yearBtn.addEventListener('click', () => {
    setActiveView({ type:'year' });
  });
  monthBtns.forEach(btn => btn.addEventListener('click', () => {
    const m = parseInt(btn.getAttribute('data-month'),10);
    setActiveView({ type:'month', month:m });
  }));

  let activeView = { type:'year' };
  function setActiveView(v){
    activeView = v;
    document.querySelectorAll('.view-btn, .month-btn').forEach(b => b.classList.remove('active'));
    if(v.type==='year'){
      yearBtn.classList.add('active');
    } else if(v.type==='month'){
      const sel = `.month-btn[data-month="${v.month}"]`;
      const b = document.querySelector(sel); if(b) b.classList.add('active');
    }
    render(activeView);
  }

  // Initial render
  setActiveView(activeView);
  // After first render, sync vacation data from server and re-render to reflect updates
  setTimeout(()=>{ if(window.__vacation) window.__vacation.initSync().then(()=> render(activeView)); }, 0);
})();