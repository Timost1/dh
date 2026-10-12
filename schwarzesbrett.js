document.addEventListener('DOMContentLoaded', () => {
    const sbtext = document.getElementById('sbttext'); 
    const sbForm = document.getElementById('sbForm');
    const addTimestampCheckbox = document.getElementById('addTimestampCheckbox');
    const autoSaveCheckbox = document.getElementById('autoSaveCheckbox');
    const notificationContainer = document.getElementById('notification-container-schwarzesbrett');
    const notificationMessage = document.getElementById('notification-message-schwarzesbrett');
    
    // New elements for enhanced functionality
    const charCount = document.getElementById('char-count');
    const wordCount = document.getElementById('word-count');
    const lineCount = document.getElementById('line-count');
    const autoSaveStatus = document.getElementById('auto-save-status');
    const autoSaveText = document.getElementById('auto-save-text');
    const lastSaved = document.getElementById('last-saved');
    const searchInput = document.getElementById('search-input');
    const historyPanel = document.getElementById('history-panel');
    const historyContainer = document.getElementById('history-container');
    const exportModal = document.getElementById('export-modal');
    const exportBtn = document.getElementById('export-btn');
    const closeModal = document.getElementById('close-modal');
    
    let initialText = '';
    let autoSaveInterval;
    let undoStack = [];
    let redoStack = [];
    let currentVersion = 0;
    let isAutoSaving = false;

    // Theme Toggle Functionality
    const themeToggle = document.getElementById('theme-toggle');
    
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    
    function updateThemeToggleButton() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (themeToggle) {
            themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
            themeToggle.title = currentTheme === 'dark' ? 'Light Mode aktivieren' : 'Dark Mode aktivieren';
        }
    }
    
    updateThemeToggleButton();

    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeToggleButton();
        });
        
        themeToggle.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) translateY(-1px)';
            this.style.boxShadow = '0 6px 16px rgba(107, 70, 193, 0.4)';
        });
        
        themeToggle.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) translateY(0)';
            this.style.boxShadow = '0 4px 12px rgba(107, 70, 193, 0.3)';
        });
    }

    // Load initial text
    fetch('/api/load_schwarzesbrett')
      .then(response => response.json())
      .then(data => {
        initialText = data.text || '';
        sbtext.value = initialText;
        updateStats();
        updateLastSaved();
        addToUndoStack(initialText);
      })
      .catch(error => {
        console.error('Fehler beim Laden des Schwarzen Bretts:', error);
        initialText = '';
        sbtext.value = '';
        updateStats();
      });

    // Rich Text Formatting Functions
    function wrapSelection(prefix, suffix = '') {
        const start = sbtext.selectionStart;
        const end = sbtext.selectionEnd;
        const selectedText = sbtext.value.substring(start, end);
        const beforeText = sbtext.value.substring(0, start);
        const afterText = sbtext.value.substring(end);
        
        if (selectedText) {
            sbtext.value = beforeText + prefix + selectedText + suffix + afterText;
            sbtext.setSelectionRange(start + prefix.length, end + prefix.length);
        } else {
            sbtext.value = beforeText + prefix + suffix + afterText;
            sbtext.setSelectionRange(start + prefix.length, start + prefix.length);
        }
        
        sbtext.focus();
        updateStats();
        addToUndoStack(sbtext.value);
    }

    function insertAtCursor(text) {
        const start = sbtext.selectionStart;
        const end = sbtext.selectionEnd;
        const beforeText = sbtext.value.substring(0, start);
        const afterText = sbtext.value.substring(end);
        
        sbtext.value = beforeText + text + afterText;
        sbtext.setSelectionRange(start + text.length, start + text.length);
        sbtext.focus();
        updateStats();
        addToUndoStack(sbtext.value);
    }

    // Toolbar Event Listeners
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const command = btn.dataset.command;
            
            switch(command) {
                case 'bold':
                    wrapSelection('**', '**');
                    break;
                case 'italic':
                    wrapSelection('*', '*');
                    break;
                case 'underline':
                    wrapSelection('_', '_');
                    break;
                case 'h1':
                    wrapSelection('# ');
                    break;
                case 'h2':
                    wrapSelection('## ');
                    break;
                case 'h3':
                    wrapSelection('### ');
                    break;
                case 'bullet':
                    wrapSelection('• ');
                    break;
                case 'number':
                    wrapSelection('1. ');
                    break;
            }
        });
    });

    // Special toolbar buttons
    document.getElementById('clear-text')?.addEventListener('click', () => {
        if (confirm('Möchten Sie den gesamten Text wirklich löschen?')) {
            addToUndoStack(sbtext.value);
            sbtext.value = '';
            updateStats();
        }
    });

    document.getElementById('undo-btn')?.addEventListener('click', () => {
        undo();
    });

    document.getElementById('redo-btn')?.addEventListener('click', () => {
        redo();
    });

    // Emoji selector
    document.getElementById('emoji-selector')?.addEventListener('change', (e) => {
        if (e.target.value) {
            insertAtCursor(e.target.value + ' ');
            e.target.value = '';
        }
    });

    // Undo/Redo functionality
    function addToUndoStack(text) {
        if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== text) {
            undoStack.push(text);
            if (undoStack.length > 50) { // Limit stack size
                undoStack.shift();
            }
            redoStack = []; // Clear redo stack when new action is performed
        }
    }

    function undo() {
        if (undoStack.length > 1) {
            const current = undoStack.pop();
            redoStack.push(current);
            sbtext.value = undoStack[undoStack.length - 1] || '';
            updateStats();
        }
    }

    function redo() {
        if (redoStack.length > 0) {
            const text = redoStack.pop();
            undoStack.push(text);
            sbtext.value = text;
            updateStats();
        }
    }

    // Keyboard shortcuts
    sbtext.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    wrapSelection('**', '**');
                    break;
                case 'i':
                    e.preventDefault();
                    wrapSelection('*', '*');
                    break;
                case 'u':
                    e.preventDefault();
                    wrapSelection('_', '_');
                    break;
                case 'z':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        undo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    redo();
                    break;
            }
        }
    });

    // Text statistics
    function updateStats() {
        const text = sbtext.value;
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const lines = text.split('\n').length;
        
        if (charCount) charCount.textContent = `${chars} Zeichen`;
        if (wordCount) wordCount.textContent = `${words} Wörter`;
        if (lineCount) lineCount.textContent = `${lines} ${lines === 1 ? 'Zeile' : 'Zeilen'}`;
    }

    // Auto-save functionality
    function startAutoSave() {
        if (autoSaveInterval) clearInterval(autoSaveInterval);
        
        autoSaveInterval = setInterval(() => {
            if (autoSaveCheckbox?.checked && sbtext.value !== initialText && !isAutoSaving) {
                autoSave();
            }
        }, 30000); // Auto-save every 30 seconds
    }

    function autoSave() {
        if (isAutoSaving) return;
        
        isAutoSaving = true;
        updateAutoSaveStatus('saving');
        
        const loggedInUserId = localStorage.getItem("userId");
        
        fetch('/api/save_schwarzesbrett', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                text: sbtext.value, 
                userId: loggedInUserId ? parseInt(loggedInUserId, 10) : null,
                autoSave: true
            })
        })
        .then(response => response.json())
        .then(data => {
            initialText = sbtext.value;
            updateAutoSaveStatus('saved');
            updateLastSaved();
            setTimeout(() => updateAutoSaveStatus('ready'), 2000);
        })
        .catch(error => {
            console.error('Auto-save Fehler:', error);
            updateAutoSaveStatus('error');
            setTimeout(() => updateAutoSaveStatus('ready'), 3000);
        })
        .finally(() => {
            isAutoSaving = false;
        });
    }

    function updateAutoSaveStatus(status) {
        const statusElement = autoSaveStatus;
        const textElement = autoSaveText;
        
        if (!statusElement || !textElement) return;
        
        statusElement.className = 'auto-save-indicator ' + status;
        
        switch(status) {
            case 'saving':
                textElement.textContent = 'Speichert...';
                break;
            case 'saved':
                textElement.textContent = 'Gespeichert';
                break;
            case 'error':
                textElement.textContent = 'Fehler';
                break;
            default:
                textElement.textContent = 'Bereit';
        }
    }

    function updateLastSaved() {
        if (lastSaved) {
            lastSaved.textContent = `Zuletzt: ${new Date().toLocaleString('de-DE')}`;
        }
    }

    // Fixed Search functionality - make it work properly again
    let searchTimeout;
    
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.toLowerCase();
        
        searchTimeout = setTimeout(() => {
            if (searchTerm) {
                highlightSearchTerm(searchTerm);
            } else {
                removeHighlight();
            }
        }, 300);
    });

    function highlightSearchTerm(term) {
        const text = sbtext.value;
        const index = text.toLowerCase().indexOf(term);
        if (index !== -1) {
            // Only highlight if we're not currently typing in the textarea
            if (document.activeElement !== sbtext) {
                sbtext.focus();
                sbtext.setSelectionRange(index, index + term.length);
                
                // Scroll to show the highlighted text
                const textLines = text.substring(0, index).split('\n').length;
                const lineHeight = 20;
                sbtext.scrollTop = Math.max(0, (textLines - 5) * lineHeight);
            }
        }
    }

    function removeHighlight() {
        if (document.activeElement !== sbtext) {
            sbtext.setSelectionRange(0, 0);
        }
    }

    // History functionality
    document.getElementById('toggle-history')?.addEventListener('click', () => {
        if (historyPanel) {
            historyPanel.style.display = historyPanel.style.display === 'none' ? 'block' : 'none';
            if (historyPanel.style.display === 'block') {
                loadHistory();
            }
        }
    });

    function loadHistory() {
        // In a real implementation, you would load this from the server
        // For now, we'll use localStorage as a simple example
        const history = JSON.parse(localStorage.getItem('bulletin_history') || '[]');
        
        if (historyContainer) {
            historyContainer.innerHTML = '';
            
            if (history.length === 0) {
                historyContainer.innerHTML = '<p style="text-align: center; color: var(--color-secondary);">Kein Verlauf verfügbar</p>';
                return;
            }
            
            history.slice(-10).reverse().forEach((item, index) => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.innerHTML = `
                    <div class="history-item-header">
                        <span>Version ${history.length - index}</span>
                        <span>${new Date(item.timestamp).toLocaleString('de-DE')}</span>
                    </div>
                    <div class="history-item-preview">${item.text.substring(0, 100)}${item.text.length > 100 ? '...' : ''}</div>
                `;
                
                historyItem.addEventListener('click', () => {
                    if (confirm('Möchten Sie diese Version wiederherstellen?')) {
                        addToUndoStack(sbtext.value);
                        sbtext.value = item.text;
                        updateStats();
                        showSchwarzesBrettNotification('Version wiederhergestellt!');
                    }
                });
                
                historyContainer.appendChild(historyItem);
            });
        }
    }

    // Export functionality
    exportBtn?.addEventListener('click', () => {
        if (exportModal) {
            exportModal.style.display = 'block';
        }
    });

    closeModal?.addEventListener('click', () => {
        if (exportModal) {
            exportModal.style.display = 'none';
        }
    });

    // Export options
    document.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('click', () => {
            const format = option.dataset.format;
            exportText(format);
            if (exportModal) {
                exportModal.style.display = 'none';
            }
        });
    });

    function exportText(format) {
        const text = sbtext.value;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        switch(format) {
            case 'txt':
                downloadFile(text, `schwarzes-brett-${timestamp}.txt`, 'text/plain');
                break;
            case 'html':
                const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Schwarzes Brett Export</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
        h1 { color: #333; }
        pre { white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>Schwarzes Brett - Export</h1>
    <p><strong>Exportiert am:</strong> ${new Date().toLocaleString('de-DE')}</p>
    <hr>
    <pre>${text}</pre>
</body>
</html>`;
                downloadFile(htmlContent, `schwarzes-brett-${timestamp}.html`, 'text/html');
                break;
            case 'copy':
                navigator.clipboard.writeText(text).then(() => {
                    showSchwarzesBrettNotification('Text in Zwischenablage kopiert!');
                }).catch(err => {
                    console.error('Fehler beim Kopieren:', err);
                    showSchwarzesBrettNotification('Fehler beim Kopieren!', 'error');
                });
                break;
            case 'print':
                const printWindow = window.open('', '_blank');
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Schwarzes Brett - Drucken</title>
                            <style>
                                body { font-family: Arial, sans-serif; line-height: 1.6; }
                                pre { white-space: pre-wrap; }
                            </style>
                        </head>
                        <body>
                            <h1>Schwarzes Brett</h1>
                            <p><strong>Gedruckt am:</strong> ${new Date().toLocaleString('de-DE')}</p>
                            <hr>
                            <pre>${text}</pre>
                        </body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.print();
                break;
        }
    }

    function downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSchwarzesBrettNotification(`Datei "${filename}" heruntergeladen!`);
    }

    // Clear all functionality
    document.getElementById('clear-all-btn')?.addEventListener('click', () => {
        if (confirm('Möchten Sie wirklich alles löschen? Diese Aktion kann nicht rückgängig gemacht werden!')) {
            addToUndoStack(sbtext.value);
            sbtext.value = '';
            updateStats();
            showSchwarzesBrettNotification('Text gelöscht!', 'success');
        }
    });

    // Text area event listeners
    sbtext.addEventListener('input', () => {
        updateStats();
        addToUndoStack(sbtext.value);
    });

    if (autoSaveCheckbox) {
        autoSaveCheckbox.addEventListener('change', () => {
            if (autoSaveCheckbox.checked) {
                startAutoSave();
                showSchwarzesBrettNotification('Auto-Speichern aktiviert!');
            } else {
                if (autoSaveInterval) {
                    clearInterval(autoSaveInterval);
                }
                showSchwarzesBrettNotification('Auto-Speichern deaktiviert!');
            }
        });
        
        // Start auto-save if checkbox is checked by default
        if (autoSaveCheckbox.checked) {
            startAutoSave();
        }
    }

    // Notification function
    function showSchwarzesBrettNotification(message, type = 'success', duration = 3000) {
        if (notificationContainer && notificationMessage) {
            notificationMessage.textContent = message;
            notificationContainer.style.backgroundColor = type === 'success' ? '#4CAF50' : '#f44336';
            notificationContainer.classList.add('show');
    
            setTimeout(() => {
                notificationContainer.classList.remove('show');
            }, duration);
        } else {
            alert(message);
        }
    }

    // Form submit functionality (enhanced)
    sbForm.addEventListener('submit', (event) => {
      event.preventDefault();
  
      const currentText = sbtext.value;
      let textToSave = currentText;

      if (addTimestampCheckbox.checked) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timestamp = ` [${day}.${month}.${year} ${hours}:${minutes}] `;

        if (currentText === initialText) {
          textToSave = currentText;
        } else {
          let firstDiffIndex = 0;
          while (
            firstDiffIndex < currentText.length &&
            firstDiffIndex < initialText.length &&
            currentText[firstDiffIndex] === initialText[firstDiffIndex]
          ) {
            firstDiffIndex++;
          }

          let commonSuffixLength = 0;
          while (
            commonSuffixLength < currentText.length - firstDiffIndex &&
            commonSuffixLength < initialText.length - firstDiffIndex &&
            currentText[currentText.length - 1 - commonSuffixLength] ===
              initialText[initialText.length - 1 - commonSuffixLength]
          ) {
            commonSuffixLength++;
          }

          const prefix = currentText.substring(0, firstDiffIndex);
          const suffix = currentText.substring(currentText.length - commonSuffixLength);
          const middleCurrent = currentText.substring(firstDiffIndex, currentText.length - commonSuffixLength);

          if (middleCurrent.length > 0) {
            textToSave = prefix + middleCurrent + timestamp + suffix;
          } else {
            textToSave = currentText;
          }
        }
      }
      
      const loggedInUserId = localStorage.getItem("userId");
  
      // Save to history before saving to server
      const history = JSON.parse(localStorage.getItem('bulletin_history') || '[]');
      history.push({
        text: textToSave,
        timestamp: new Date().toISOString(),
        userId: loggedInUserId ? parseInt(loggedInUserId, 10) : null
      });
      
      // Keep only last 50 entries
      if (history.length > 50) {
        history.shift();
      }
      
      localStorage.setItem('bulletin_history', JSON.stringify(history));

      fetch('/api/save_schwarzesbrett', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: textToSave, userId: loggedInUserId ? parseInt(loggedInUserId, 10) : null })
      })
      .then(response => response.json())
      .then(data => {
        showSchwarzesBrettNotification(data.message || "Schwarzes Brett erfolgreich gespeichert!");
        initialText = textToSave;
        updateLastSaved();
      })
      .catch(error => {
        console.error('Fehler beim Speichern des Schwarzen Bretts:', error);
        showSchwarzesBrettNotification("Fehler beim Speichern: " + error.message, 'error');
      });
    });

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === exportModal) {
            exportModal.style.display = 'none';
        }
    });

    // Initialize
    updateStats();
  });
