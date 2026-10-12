// Upload-System vorübergehend deaktiviert. Später wieder aktivieren.
// (Der vormals enthaltene Code zum AJAX-Upload und Listing wurde absichtlich auskommentiert.)

// Initialisierung Upload + Liste
// (vorübergehend deaktiviert)
// (async function(){
//   const list = document.getElementById('formsList');
//   const uploadForm = document.getElementById('uploadForm');
//   const fileInput = document.getElementById('fileInput');
//   const statusEl = document.getElementById('uploadStatus');
//   if (!list || !uploadForm || !fileInput) return;

//   const api = 'formulare_uploads.php';
//   let markerAdded = false;

//   function ensureMarker(){
//     if (markerAdded) return;
//     const marker = document.createElement('li');
//     marker.className = 'form-item';
//     marker.style.cssText = 'opacity:.7;pointer-events:none;border-style:dashed;';
//     marker.innerHTML = '<span class="form-link" style="font-weight:700;">Hochgeladene Dokumente</span>';
//     list.prepend(marker);
//     markerAdded = true;
//   }

//   function toCard(url, title){
//     const li = document.createElement('li');
//     li.className = 'form-item';
//     li.innerHTML = `
//       <a class="form-link" href="${url}" target="_blank" rel="noopener">${title}</a>
//       <div class="form-actions">
//         <a class="btn-small btn-outline" href="${url}" download>⬇️ Download</a>
//         <a class="btn-small btn-primary" href="${url}" target="_blank" rel="noopener">Öffnen</a>
//       </div>`;
//     return li;
//   }

//   async function loadUploads(){
//     const res = await fetch(api);
//     if (!res.ok) return;
//     const files = await res.json();
//     if (files && files.length) ensureMarker();
//     files.forEach(f => list.prepend(toCard(f.url, f.name)));
//   }

//   uploadForm.addEventListener('submit', async (e) => {
//     e.preventDefault();
//     statusEl.textContent = 'Lade hoch...';

//     const fd = new FormData(uploadForm); // nutzt name="files[]"
//     try {
//       const res = await fetch(api, { method: 'POST', body: fd });
//       const data = await res.json();
//       if (!res.ok) {
//         statusEl.textContent = 'Fehler: ' + (data.error || res.status);
//         return;
//       }
//       const errs = (data.errors || []).filter(Boolean);
//       if (data.uploaded && data.uploaded.length) {
//         ensureMarker();
//         data.uploaded.forEach(f => list.prepend(toCard(f.url, f.name)));
//         statusEl.textContent = 'Upload erfolgreich' + (errs.length ? ` (${errs.length} Warnung(en))` : '.');
//       } else {
//         statusEl.textContent = errs.length ? 'Fehler: ' + errs.join(' | ') : 'Keine Dateien gespeichert.';
//       }
//       fileInput.value = '';
//     } catch (err) {
//       statusEl.textContent = 'Fehler beim Upload.';
//       console.error(err);
//     }
//   });

//   loadUploads();
// })();
