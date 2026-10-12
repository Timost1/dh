document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'api.php';

    // --- DOM Elements ---
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    const loginModal = document.getElementById('login-modal');
    const loginRfidInput = document.getElementById('login-rfid');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const btnCancelLogin = document.getElementById('btn-cancel-login');
    const loginError = document.getElementById('login-error');

    const logoutModal = document.getElementById('logout-modal');
    const btnConfirmLogout = document.getElementById('btn-confirm-logout');
    const btnCancelLogout = document.getElementById('btn-cancel-logout');

    const btnNotifications = document.getElementById('btn-notifications');
    const notificationModal = document.getElementById('notifications-modal');
    const notificationList = document.getElementById('notification-list');
    const notificationBadge = document.getElementById('notification-badge');

    const userNameDisplay = userProfile ? userProfile.querySelector('p.text-sm') : null;
    const userRoleDisplay = userProfile ? userProfile.querySelector('p.text-xs') : null;

    const loginPlaceholder = document.getElementById('login-placeholder');
    const dashboardContent = document.getElementById('dashboard-content');
    const shiftPill = document.getElementById('shift-pill');
    const shiftPillName = document.getElementById('shift-pill-name');

    const inventoryTable = document.querySelector('section table');
    const inventoryTbody = document.getElementById('shift-inventory-body') || (inventoryTable ? inventoryTable.querySelector('tbody') : null);

    const myOrdersSection = document.getElementById('my-orders-section');
    const myOrdersList = document.getElementById('my-orders-list');
    const managerOrdersSection = document.getElementById('manager-orders-section');
    const managerOrdersBody = document.getElementById('manager-orders-body');
    const activityLogContainer = document.getElementById('activity-log-container');

    const cartModal = document.getElementById('cart-modal');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartBadge = document.getElementById('cart-badge');
    const btnOpenCart = document.getElementById('btn-open-cart');
    const btnSubmitCart = document.getElementById('btn-submit-cart');

    const orderModal = document.getElementById('order-modal');
    const orderDetailsModal = document.getElementById('order-details-modal');

    // --- State ---
    let currentUser = null;
    let inventoryData = [];
    let shoppingCart = [];
    let stockFilter = 'ALL';
    let currentOrderItem = null;

    // ============================================================
    // CART PERSISTENCE
    // ============================================================
    function getCartStorageKey() {
        if (!currentUser) return null;
        return `lager_cart_${currentUser.id}`;
    }

    function saveCart() {
        const key = getCartStorageKey();
        if (key) localStorage.setItem(key, JSON.stringify(shoppingCart));
    }

    function loadCart() {
        const key = getCartStorageKey();
        if (!key) { shoppingCart = []; return; }
        try {
            const stored = JSON.parse(localStorage.getItem(key));
            shoppingCart = Array.isArray(stored) ? stored : [];
        } catch (e) { shoppingCart = []; }
    }

    function clearCartStorage() {
        const key = getCartStorageKey();
        if (key) localStorage.removeItem(key);
    }

    // ============================================================
    // AUTH
    // ============================================================
    function checkAuth() {
        fetch(`${API_URL}?action=check_auth`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.user) {
                    currentUser = data.user;
                    updateAuthUI(true);
                } else {
                    currentUser = null;
                    updateAuthUI(false);
                }
            })
            .catch(() => updateAuthUI(false));
    }

    function updateAuthUI(isLoggedIn) {
        if (isLoggedIn && currentUser) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userProfile) { userProfile.classList.remove('hidden'); userProfile.classList.add('flex'); }
            if (userNameDisplay) userNameDisplay.textContent = currentUser.name || ((currentUser.vorname || '') + ' ' + (currentUser.nachname || '')).trim();
            
            const roleStr = currentUser.isAdmin == 1 ? 'Admin' : 
                           currentUser.Meister == 1 ? 'Meister' :
                           currentUser.Lagermensch == 1 ? 'Lagermitarbeiter' : 'Mitarbeiter';
            if (userRoleDisplay) userRoleDisplay.textContent = roleStr + ' · Schicht ' + (currentUser.schicht || '?');

            if (loginPlaceholder) loginPlaceholder.classList.add('hidden');
            if (dashboardContent) { dashboardContent.classList.remove('hidden'); dashboardContent.classList.add('flex-1'); }

            // Show shift pill
            const realShift = currentUser.schicht && currentUser.schicht !== '?' ? currentUser.schicht : 'Büro/Admin';
            if (shiftPill) {
                shiftPill.classList.remove('hidden');
                shiftPill.classList.add('flex');
                if (shiftPillName) shiftPillName.textContent = realShift;
            }

            // Manager section visibility
            const isLagermensch = currentUser.Lagermensch == 1;
            if (managerOrdersSection) {
                if (isLagermensch) {
                    managerOrdersSection.classList.remove('hidden');
                    if (myOrdersSection) myOrdersSection.classList.add('hidden');
                } else {
                    managerOrdersSection.classList.add('hidden');
                    if (myOrdersSection) myOrdersSection.classList.remove('hidden');
                }
            }

            // Cart aus localStorage wiederherstellen
            loadCart();
            updateCartUI();

            loadAll();
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userProfile) { userProfile.classList.add('hidden'); userProfile.classList.remove('flex'); }
            if (loginPlaceholder) loginPlaceholder.classList.remove('hidden');
            if (dashboardContent) { dashboardContent.classList.add('hidden'); dashboardContent.classList.remove('flex-1'); }
            if (shiftPill) { shiftPill.classList.add('hidden'); shiftPill.classList.remove('flex'); }
            shoppingCart = [];
            updateCartUI();
            currentUser = null;
        }
    }

    function performLogin() {
        const rfid = loginRfidInput.value.trim();
        if (!rfid) return;

        loginError.classList.add('hidden');
        btnSubmitLogin.disabled = true;

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', rfid: rfid })
        })
            .then(res => res.json())
            .then(data => {
                btnSubmitLogin.disabled = false;
                if (data.success) {
                    currentUser = data.user;
                    updateAuthUI(true);
                    hideModal(loginModal);
                    showNotification(`Willkommen, ${currentUser.name}`, 'success');
                } else {
                    loginError.textContent = data.error || 'Anmeldung fehlgeschlagen';
                    loginError.classList.remove('hidden');
                    loginRfidInput.value = '';
                    loginRfidInput.focus();
                }
            })
            .catch(() => {
                btnSubmitLogin.disabled = false;
                loginError.textContent = 'Verbindungsfehler';
                loginError.classList.remove('hidden');
            });
    }

    // ============================================================
    // LOAD ALL DATA
    // ============================================================
    function loadAll() {
        loadInventory();
        loadActivities();
        loadOrders();
        checkNotifications();
    }

    function getMyShift() {
        if (!currentUser) return '?';
        return currentUser.schicht || currentUser.Schicht || '?';
    }

    function getStockFetchShift() {
        // Admin/Meister sieht alles, Schichtler nur seine
        if (currentUser && (currentUser.isAdmin == 1 || currentUser.Meister == 1)) return '?';
        return getMyShift();
    }

    // ============================================================
    // INVENTORY
    // ============================================================
    function loadInventory() {
        if (!inventoryTbody) return;
        const schicht = getStockFetchShift();
        fetch(`${API_URL}?action=get_shift_inventory&schicht=${encodeURIComponent(schicht)}`)
            .then(res => res.json())
            .then(data => {
                inventoryData = Array.isArray(data) ? data : [];
                renderInventory();
            })
            .catch(err => console.error('Inventory load failed', err));
    }

    function renderInventory() {
        if (!inventoryTbody) return;

        let filtered = inventoryData.slice();
        if (stockFilter === 'LOW') {
            filtered = filtered.filter(i => parseInt(i.bestand) > 0 && parseInt(i.bestand) < parseInt(i.soll));
        } else if (stockFilter === 'EMPTY') {
            filtered = filtered.filter(i => parseInt(i.bestand) <= 0);
        }

        inventoryTbody.innerHTML = '';

        if (filtered.length === 0) {
            inventoryTbody.innerHTML = `<tr><td colspan="4" class="px-5 py-12 text-center text-sm text-slate-500">Keine Artikel gefunden.</td></tr>`;
            return;
        }

        filtered.forEach(item => {
            const ist = parseInt(item.bestand) || 0;
            const soll = parseInt(item.soll) || 0;
            const pct = soll > 0 ? Math.min(100, (ist / soll) * 100) : 0;

            let statusText = 'OK';
            let statusBg = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
            let barColor = 'bg-emerald-500';
            if (ist <= 0) {
                statusText = 'Leer';
                statusBg = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
                barColor = 'bg-rose-500';
            } else if (ist < soll) {
                statusText = 'Knapp';
                statusBg = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
                barColor = 'bg-amber-500';
            }

            const isManager = currentUser && (currentUser.isAdmin == 1 || currentUser.Meister == 1);

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors';
            tr.innerHTML = `
                <td class="px-5 py-4">
                    <div class="flex flex-col gap-0.5">
                        <p class="font-bold text-sm text-slate-800 dark:text-slate-100">${escapeHtml(item.name || '-')}</p>
                        ${item.sku ? `<p class="text-[10px] font-mono text-slate-400">${escapeHtml(item.sku)}</p>` : ''}
                    </div>
                </td>
                <td class="px-5 py-4">
                    <span class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(item.kategorie || '-')}</span>
                </td>
                <td class="py-4 px-5 align-middle text-right">
                    <div class="flex flex-col gap-1 w-[120px] ml-auto">
                        <div class="flex justify-end">
                            <span class="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${statusBg}">${statusText}</span>
                        </div>
                        <span class="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 text-right">${ist}/${soll}</span>
                        <div class="h-1.5 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                            <div class="h-full ${barColor} transition-all" style="width:${pct}%"></div>
                        </div>
                    </div>
                </td>
                <td class="py-4 pl-2 pr-5 text-right align-middle w-[140px]">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="openStockModal(${item.id})" class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-brand hover:text-white transition-all flex items-center justify-center" title="Bestand bearbeiten">
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onclick="openOrderModalById(${item.id})" class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-brand hover:text-white transition-all flex items-center justify-center" title="Nachbestellen">
                            <span class="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                        </button>
                        ${isManager ? `
                        <button onclick="deleteItem(${item.id})" class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center" title="Löschen">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>` : ''}
                    </div>
                </td>
            `;
            inventoryTbody.appendChild(tr);
        });
    }

    // Stock Filter Buttons
    document.querySelectorAll('.stock-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stock-filter-btn').forEach(b => {
                b.classList.remove('bg-surface', 'dark:bg-surface-dark', 'text-slate-700', 'dark:text-slate-200', 'shadow-sm');
                b.classList.add('text-slate-500');
            });
            btn.classList.add('bg-surface', 'dark:bg-surface-dark', 'text-slate-700', 'dark:text-slate-200', 'shadow-sm');
            btn.classList.remove('text-slate-500');
            stockFilter = btn.dataset.stockFilter;
            renderInventory();
        });
    });

    // ============================================================
    // STOCK ADJUSTMENT
    // ============================================================
    let currentStockItemId = null;

    window.openStockModal = function(id) {
        const item = inventoryData.find(i => i.id == id);
        if (!item) return;
        currentStockItemId = id;
        document.getElementById('stock-modal-item-name').textContent = item.name || 'Artikel';
        document.getElementById('stock-modal-item-current').textContent = item.bestand;
        document.getElementById('stock-adjust-amount').value = item.bestand;
        document.getElementById('stock-adjust-target').value = item.soll;
        document.getElementById('stock-adjustment-modal').classList.remove('hidden');
    };

    document.getElementById('btn-confirm-stock')?.addEventListener('click', () => {
        if (!currentStockItemId) return;
        const item = inventoryData.find(i => i.id == currentStockItemId);
        if (!item) return;

        const newStock = parseInt(document.getElementById('stock-adjust-amount').value) || 0;
        const newSoll = parseInt(document.getElementById('stock-adjust-target').value) || 0;
        const delta = newStock - (parseInt(item.bestand) || 0);

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_stock',
                id: currentStockItemId,
                delta: delta,
                soll: newSoll,
                user: currentUser.name,
                schicht: getMyShift(),
                name: item.name
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification('Bestand aktualisiert', 'success');
                    document.getElementById('stock-adjustment-modal').classList.add('hidden');
                    loadAll();
                } else {
                    showNotification('Fehler: ' + (data.error || 'Unbekannt'), 'error');
                }
            });
    });

    window.deleteItem = function(id) {
        if (!confirm('Artikel wirklich löschen?')) return;
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_item', id, user: currentUser.name, schicht: getMyShift() })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification('Artikel gelöscht', 'success');
                    loadAll();
                }
            });
    };

    // ============================================================
    // ADD ITEM MODAL
    // ============================================================
    document.getElementById('btn-add-item-modal')?.addEventListener('click', () => {
        document.getElementById('new-item-name').value = '';
        document.getElementById('new-item-sku').value = '';
        document.getElementById('new-item-cat').value = '';
        document.getElementById('new-item-shift').value = getMyShift();
        document.getElementById('new-item-target').value = '10';
        document.getElementById('new-item-stock').value = '10';
        document.getElementById('add-item-modal').classList.remove('hidden');
    });

    document.getElementById('btn-save-item')?.addEventListener('click', () => {
        const name = document.getElementById('new-item-name').value.trim();
        const sku = document.getElementById('new-item-sku').value.trim();
        const kategorie = document.getElementById('new-item-cat').value.trim();
        const schicht = document.getElementById('new-item-shift').value.trim() || getMyShift();
        const soll = parseInt(document.getElementById('new-item-target').value) || 0;
        const bestand = parseInt(document.getElementById('new-item-stock').value) || 0;

        if (!name) { showNotification('Name ist Pflicht', 'error'); return; }

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'add_item', name, sku, kategorie, schicht, soll, bestand, user: currentUser.name
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification('Artikel hinzugefügt', 'success');
                    document.getElementById('add-item-modal').classList.add('hidden');
                    loadAll();
                } else {
                    showNotification('Fehler: ' + (data.error || ''), 'error');
                }
            });
    });

    // ============================================================
    // ORDER (Per-Item)
    // ============================================================
    window.openOrderModalById = function(id) {
        const item = inventoryData.find(i => i.id == id);
        if (!item) return;
        openOrderModal(item.id, item.name, item.sku, item.bestand, item.soll);
    };

    window.openOrderModal = function(id, name, sku, current, target) {
        currentOrderItem = { id, name, sku, current, target };
        document.getElementById('order-item-name').textContent = name;
        document.getElementById('order-item-sku').textContent = 'SKU: ' + (sku || '-');
        document.getElementById('order-current-stock').textContent = current;
        document.getElementById('order-target-stock').textContent = target;
        document.getElementById('order-amount').value = Math.max(1, (parseInt(target) || 0) - (parseInt(current) || 0)) || 1;
        document.getElementById('order-note').value = '';
        orderModal.classList.remove('hidden');
    };

    document.getElementById('btn-order-cancel')?.addEventListener('click', () => orderModal.classList.add('hidden'));

    document.getElementById('btn-order-add-to-cart')?.addEventListener('click', () => {
        if (!currentOrderItem) return;
        const amount = parseInt(document.getElementById('order-amount').value) || 1;
        const note = document.getElementById('order-note').value.trim();

        const existing = shoppingCart.find(c => c.id === currentOrderItem.id);
        if (existing) {
            existing.amount += amount;
            if (note) existing.note = note;
        } else {
            shoppingCart.push({
                id: currentOrderItem.id,
                name: currentOrderItem.name,
                sku: currentOrderItem.sku,
                amount: amount,
                note: note
            });
        }

        saveCart();
        updateCartUI();
        orderModal.classList.add('hidden');
        showNotification(`${currentOrderItem.name} zum Warenkorb hinzugefügt`, 'success');
    });

    // ============================================================
    // CART
    // ============================================================
    function updateCartUI() {
        if (cartBadge) {
            if (shoppingCart.length > 0) {
                cartBadge.textContent = shoppingCart.length;
                cartBadge.classList.remove('hidden');
            } else {
                cartBadge.classList.add('hidden');
            }
        }
        renderCart();
        updateCartSubmitButtonState();
    }

    function renderCart() {
        if (!cartItemsContainer) return;
        if (shoppingCart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center text-slate-400 py-12">
                    <span class="material-symbols-outlined text-5xl mb-3 opacity-50">shopping_cart_off</span>
                    <p class="text-sm font-medium">Warenkorb ist leer</p>
                </div>`;
            return;
        }

        cartItemsContainer.innerHTML = '';
        shoppingCart.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'p-4 bg-slate-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark flex items-center gap-3';
            div.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold truncate">${escapeHtml(item.name)}</p>
                    <p class="text-[10px] font-mono text-slate-500 mt-0.5">${escapeHtml(item.sku || '-')}</p>
                    ${item.note ? `<p class="text-[10px] italic text-amber-600 dark:text-amber-400 mt-1 truncate">${escapeHtml(item.note)}</p>` : ''}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="updateCartItemAmount(${idx}, -1)" class="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/5 hover:bg-brand hover:text-white text-sm font-bold transition-all">-</button>
                    <span class="text-sm font-bold w-6 text-center">${item.amount}</span>
                    <button onclick="updateCartItemAmount(${idx}, 1)" class="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/5 hover:bg-brand hover:text-white text-sm font-bold transition-all">+</button>
                </div>
                <button onclick="removeFromCart(${idx})" class="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 p-1.5 rounded-lg transition-all shrink-0">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            `;
            cartItemsContainer.appendChild(div);
        });
    }

    window.updateCartItemAmount = function(idx, delta) {
        if (!shoppingCart[idx]) return;
        shoppingCart[idx].amount = Math.max(1, shoppingCart[idx].amount + delta);
        saveCart();
        updateCartUI();
    };

    window.removeFromCart = function(idx) {
        shoppingCart.splice(idx, 1);
        saveCart();
        updateCartUI();
    };

    window.updateCartSubmitButtonState = function() {
        if (!btnSubmitCart) return;
        const note = document.getElementById('cart-note');
        const noteText = note ? note.value.trim() : '';
        if (shoppingCart.length > 0 || noteText.length > 0) {
            btnSubmitCart.disabled = false;
            btnSubmitCart.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            btnSubmitCart.disabled = true;
            btnSubmitCart.classList.add('opacity-50', 'cursor-not-allowed');
        }
    };

    btnOpenCart?.addEventListener('click', () => {
        renderCart();
        cartModal.classList.remove('hidden');
    });

    btnSubmitCart?.addEventListener('click', submitOrder);

    function submitOrder() {
        if (!currentUser) return showNotification('Bitte anmelden', 'error');
        const noteInput = document.getElementById('cart-note');
        const bemerkung = noteInput ? noteInput.value.trim() : '';

        if (shoppingCart.length === 0 && !bemerkung) {
            return showNotification('Warenkorb und Bemerkung sind leer', 'error');
        }

        btnSubmitCart.disabled = true;
        btnSubmitCart.textContent = 'Sende...';

        let orderShift = currentUser.schicht || currentUser.Schicht;
        if (!orderShift || orderShift === '?') {
            orderShift = (currentUser.isAdmin == 1 || currentUser.Meister == 1) ? 'Büro/Admin' : 'Unbekannt';
        }

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_order',
                user: currentUser.name,
                schicht: orderShift,
                cart: shoppingCart,
                bemerkung: bemerkung
            })
        })
            .then(res => res.json())
            .then(data => {
                btnSubmitCart.disabled = false;
                btnSubmitCart.innerHTML = '<span class="material-symbols-outlined text-[18px]">send</span> Bestellung absenden';

                if (data.success) {
                    showNotification('Bestellung erfolgreich abgesendet!', 'success');
                    shoppingCart = [];
                    clearCartStorage();
                    if (noteInput) noteInput.value = '';
                    updateCartUI();
                    cartModal.classList.add('hidden');
                    loadAll();
                } else {
                    showNotification('Fehler: ' + (data.error || 'Unbekannt'), 'error');
                }
            })
            .catch(() => {
                btnSubmitCart.disabled = false;
                showNotification('Verbindungsfehler', 'error');
            });
    }

    // ============================================================
    // ORDERS (My + Manager)
    // ============================================================
    function loadOrders() {
        fetch(`${API_URL}?action=get_open_orders`)
            .then(res => res.json())
            .then(orders => {
                if (!Array.isArray(orders)) orders = [];
                renderMyOrders(orders);
                renderManagerOrders(orders);
            })
            .catch(err => console.error('Orders load failed', err));
    }

    function renderMyOrders(orders) {
        if (!myOrdersList || !currentUser) return;
        const userName = currentUser.name;
        const myShift = getMyShift();

        const mine = orders.filter(o => o.user_name === userName || o.schicht === myShift)
            .slice(0, 10);

        if (mine.length === 0) {
            myOrdersList.innerHTML = '<p class="text-sm text-slate-500 text-center py-10">Noch keine Bestellungen aufgegeben.</p>';
            return;
        }

        myOrdersList.innerHTML = '';
        mine.forEach(o => {
            const items = parseItems(o.items);
            const displayStatus = formatStatus(o.status);
            const div = document.createElement('div');
            div.className = 'p-4 bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark cursor-pointer hover:border-brand transition-all';
            div.onclick = () => openOrderDetails(o);
            div.innerHTML = `
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] font-mono text-slate-400">#${o.id}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border status-${o.status}">${displayStatus}</span>
                        </div>
                        <p class="text-sm font-bold truncate">${items.length} Position(en)</p>
                        <p class="text-xs text-slate-500 mt-1">${new Date(o.zeitpunkt.replace(' ', 'T')).toLocaleString('de-DE')}</p>
                    </div>
                    <span class="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
                </div>
            `;
            myOrdersList.appendChild(div);
        });
    }

    function renderManagerOrders(orders) {
        if (!managerOrdersBody) return;
        // Lagermensch sieht ALLE OFFENEN Bestellungen (NEU, IN_BEARBEITUNG, ANGENOMMEN)
        const open = orders.filter(o => ['NEU', 'IN_BEARBEITUNG', 'ANGENOMMEN'].includes(o.status)).slice(0, 10);

        if (open.length === 0) {
            managerOrdersBody.innerHTML = '<tr><td class="px-6 py-10 text-center text-sm text-slate-500">Keine offenen Bestellungen.</td></tr>';
            return;
        }

        managerOrdersBody.innerHTML = '';
        open.forEach(o => {
            const items = parseItems(o.items);
            const tr = document.createElement('tr');
            tr.className = 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors';
            tr.onclick = () => openOrderDetails(o);
            tr.innerHTML = `
                <td class="px-6 py-3">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[18px]">shopping_cart</span>
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-bold truncate">#${o.id} · ${escapeHtml(o.user_name)}</p>
                            <p class="text-[11px] text-slate-500">Schicht ${escapeHtml(o.schicht)} · ${items.length} Pos · Status: <span class="font-bold text-brand">${formatStatus(o.status)}</span> · ${new Date(o.zeitpunkt.replace(' ', 'T')).toLocaleString('de-DE')}</p>
                        </div>
                        <span class="ml-auto material-symbols-outlined text-slate-400">chevron_right</span>
                    </div>
                </td>
            `;
            managerOrdersBody.appendChild(tr);
        });
    }

    function parseItems(itemsStr) {
        try { 
            const p = JSON.parse(itemsStr);
            return Array.isArray(p) ? p : [];
        } catch (e) { return []; }
    }

    function formatStatus(status) {
        if (status === 'IN_BEARBEITUNG') return 'In Bearbeitung';
        if (status === 'ABGESCHLOSSEN') return 'Abgeschlossen';
        if (status === 'ANGENOMMEN') return 'Angenommen';
        if (status === 'NEU') return 'Neu';
        return status;
    }

    function openOrderDetails(o) {
        const items = parseItems(o.items);
        const displayStatus = formatStatus(o.status);

        document.getElementById('od-id').textContent = '#' + o.id;
        document.getElementById('od-user').textContent = o.user_name;
        document.getElementById('od-shift').textContent = o.schicht;
        document.getElementById('od-timestamp').textContent = new Date(o.zeitpunkt.replace(' ', 'T')).toLocaleString('de-DE');

        const pill = document.getElementById('od-status-pill');
        pill.textContent = displayStatus;
        pill.className = `px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border status-${o.status}`;

        const noteContainer = document.getElementById('od-note-container');
        const noteEl = document.getElementById('od-note');
        if (o.bemerkung && o.bemerkung.trim()) {
            noteContainer.classList.remove('hidden');
            noteEl.textContent = o.bemerkung;
        } else {
            noteContainer.classList.add('hidden');
        }

        const itemsList = document.getElementById('od-items-list');
        itemsList.innerHTML = '';
        if (items.length === 0) {
            itemsList.innerHTML = '<p class="text-sm text-slate-400 italic">Keine Artikel - nur Bemerkung</p>';
        } else {
            items.forEach(it => {
                const name = it.name || it.bezeichnung || 'Artikel';
                const qty = it.amount || it.menge || it.qty || 1;
                const div = document.createElement('div');
                div.className = 'p-3 bg-slate-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark flex items-center gap-3';
                div.innerHTML = `
                    <div class="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[16px]">history</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold truncate">${escapeHtml(name)}</p>
                        ${it.sku ? `<p class="text-[10px] font-mono text-slate-500 mt-0.5">${escapeHtml(it.sku)}</p>` : ''}
                        ${it.note ? `<p class="text-[10px] italic text-amber-600 dark:text-amber-400 mt-1">${escapeHtml(it.note)}</p>` : ''}
                    </div>
                `;
                itemsList.appendChild(div);
            });
        }

        // Timeline
        const timeline = document.getElementById('od-timeline');
        if (timeline) {
            const stages = ['NEU', 'IN_BEARBEITUNG', 'ABGESCHLOSSEN'];
            const labels = { 'NEU': 'Neu', 'IN_BEARBEITUNG': 'In Bearbeitung', 'ABGESCHLOSSEN': 'Abgeschlossen' };
            const currentIdx = stages.indexOf(o.status === 'ANGENOMMEN' ? 'IN_BEARBEITUNG' : o.status);
            timeline.innerHTML = stages.map((s, i) => {
                const active = i <= currentIdx;
                return `<div class="text-center p-3 rounded-xl border transition-all ${active ? 'border-brand/40 bg-brand/5' : 'border-border-light dark:border-border-dark opacity-50'}">
                    <p class="text-[10px] font-bold uppercase tracking-widest ${active ? 'text-brand' : 'text-slate-400'}">${labels[s]}</p>
                </div>`;
            }).join('');
        }

        // Actions
        const actions = document.getElementById('od-actions');
        actions.innerHTML = '';
        if (currentUser && currentUser.Lagermensch == 1) {
            if (o.status === 'NEU') {
                actions.innerHTML = `<button onclick="updateOrderStatus(${o.id}, 'IN_BEARBEITUNG')" class="w-full py-3 rounded-xl font-bold text-white bg-brand hover:bg-brand-hover transition-all flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px]">play_arrow</span> Bearbeitung starten</button>`;
            } else if (o.status === 'IN_BEARBEITUNG' || o.status === 'ANGENOMMEN') {
                actions.innerHTML = `<button onclick="updateOrderStatus(${o.id}, 'ABGESCHLOSSEN')" class="w-full py-3 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px]">check_circle</span> Abschließen</button>`;
            } else {
                actions.innerHTML = `<p class="text-sm text-center text-slate-500">Bestellung wurde abgeschlossen.</p>`;
            }
        }

        orderDetailsModal.classList.remove('hidden');
    }

    window.updateOrderStatus = function(id, status) {
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_order_status',
                id: id,
                status: status,
                user: currentUser.name,
                schicht: getMyShift()
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification('Status aktualisiert', 'success');
                    orderDetailsModal.classList.add('hidden');
                    loadAll();
                }
            });
    };

    // ============================================================
    // ACTIVITIES
    // ============================================================
    function loadActivities() {
        if (!activityLogContainer) return;
        const schicht = (currentUser && (currentUser.isAdmin == 1 || currentUser.Meister == 1)) ? '?' : getMyShift();
        fetch(`${API_URL}?action=get_activities&schicht=${encodeURIComponent(schicht)}`)
            .then(res => res.json())
            .then(activities => {
                if (!Array.isArray(activities) || activities.length === 0) {
                    activityLogContainer.innerHTML = '<p class="text-sm text-slate-500 text-center py-6">Keine Aktivitäten.</p>';
                    return;
                }
                activityLogContainer.innerHTML = '';
                activities.slice(0, 6).forEach(a => {
                    const div = document.createElement('div');
                    div.className = 'flex items-start gap-3 p-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] rounded-lg transition-colors';
                    
                    let iconName = 'edit';
                    let iconColor = 'bg-brand/10 text-brand';
                    if (a.aktion === 'ENTNAHME') { iconName = 'remove'; iconColor = 'bg-amber-500/10 text-amber-500'; }
                    else if (a.aktion === 'ORDER') { iconName = 'shopping_cart'; iconColor = 'bg-blue-500/10 text-blue-500'; }
                    else if (a.aktion === 'NEU') { iconName = 'add'; iconColor = 'bg-emerald-500/10 text-emerald-500'; }
                    else if (a.aktion === 'STATUS') { iconName = 'sync'; iconColor = 'bg-purple-500/10 text-purple-500'; }
                    else if (a.aktion === 'LOESCHEN') { iconName = 'delete'; iconColor = 'bg-rose-500/10 text-rose-500'; }

                    div.innerHTML = `
                        <div class="w-8 h-8 rounded-lg ${iconColor} flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[16px]">${iconName}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold truncate">${escapeHtml(a.beschreibung || a.aktion)}</p>
                            <p class="text-[10px] text-slate-500 mt-0.5">${new Date(a.zeitpunkt.replace(' ', 'T')).toLocaleString('de-DE')}</p>
                        </div>
                    `;
                    activityLogContainer.appendChild(div);
                });
            });
    }

    document.getElementById('btn-show-all-activities')?.addEventListener('click', () => {
        const modal = document.getElementById('all-activities-modal');
        const list = document.getElementById('all-activities-list');
        if (!modal || !list) return;

        list.innerHTML = '<p class="text-sm text-slate-500 text-center py-10">Lade...</p>';
        modal.classList.remove('hidden');

        const schicht = (currentUser && (currentUser.isAdmin == 1 || currentUser.Meister == 1)) ? '?' : getMyShift();
        fetch(`${API_URL}?action=get_activities&schicht=${encodeURIComponent(schicht)}`)
            .then(res => res.json())
            .then(activities => {
                if (!Array.isArray(activities) || activities.length === 0) {
                    list.innerHTML = '<p class="text-sm text-slate-500 text-center py-10">Keine Aktivitäten.</p>';
                    return;
                }
                list.innerHTML = '';
                activities.forEach(a => {
                    const div = document.createElement('div');
                    div.className = 'flex items-start gap-3 p-3 border-b border-border-light dark:border-border-dark';
                    div.innerHTML = `
                        <div class="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[16px]">history</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold">${escapeHtml(a.beschreibung || a.aktion)}</p>
                            <p class="text-[11px] text-slate-500 mt-0.5">Schicht ${escapeHtml(a.schicht)} · ${new Date(a.zeitpunkt.replace(' ', 'T')).toLocaleString('de-DE')}</p>
                        </div>
                    `;
                    list.appendChild(div);
                });
            });
    });

    // ============================================================
    // NOTIFICATIONS (Unified Logic)
    // ============================================================
    function checkNotifications() {
        if (!currentUser) return;

        const userName = currentUser.name || ((currentUser.vorname || '') + ' ' + (currentUser.nachname || '')).trim();
        const profileShift = currentUser.schicht || currentUser.Schicht || 'Unbekannt';
        const stockShiftToFetch = (currentUser.isAdmin == 1 || currentUser.Meister == 1) ? '?' : profileShift;
        const isMeister = currentUser.Meister == 1 || currentUser.isAdmin == 1;
        const isLagermensch = currentUser.Lagermensch == 1;

        const fetchStock = isMeister
            ? fetch(`${API_URL}?action=get_shift_inventory&schicht=${encodeURIComponent(stockShiftToFetch)}`).then(r => r.json()).catch(() => [])
            : Promise.resolve([]);

        const fetchOrders = fetch(`${API_URL}?action=get_open_orders`).then(r => r.json()).catch(() => []);

        Promise.all([fetchStock, fetchOrders]).then(([stockData, orders]) => {
            let allNotifications = [];

            // Leere Bestände (Meister)
            if (Array.isArray(stockData)) {
                let criticalItems = stockData.filter(item => parseInt(item.bestand) <= 0);
                const seenNames = new Set();
                criticalItems = criticalItems.filter(item => {
                    if (seenNames.has(item.name)) return false;
                    seenNames.add(item.name);
                    return true;
                });
                criticalItems.forEach(item => {
                    allNotifications.push({
                        id: 's_' + item.id, type: 'stock', data: item,
                        prio: 9, title: 'Bestand leer', message: `Bestand leer: ${item.name}`,
                        actionHtml: `<button onclick="openOrderModal(${item.id}, '${(item.name || '').replace(/'/g, "\\'")}', '${(item.sku || '').replace(/'/g, "\\'")}', ${item.bestand}, ${item.soll}); document.getElementById('notifications-modal').classList.add('hidden');" class="text-xs font-bold underline hover:text-primary">Nachbestellen</button>`
                    });
                });
            }

            // Bestellungen
            if (Array.isArray(orders)) {
                const now = new Date().getTime();
                const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

                orders.forEach(o => {
                    let orderTime = 0;
                    if (o.zeitpunkt) {
                        orderTime = new Date(o.zeitpunkt.replace(' ', 'T')).getTime();
                    }
                    const isOld = (orderTime > 0) && (now - orderTime > TWO_DAYS_MS);
                    if (isOld) return;

                    let displayStatus = formatStatus(o.status);

                    // Lagermensch: Neue Bestellungen
                    if (isLagermensch && o.status === 'NEU') {
                        allNotifications.push({
                            id: 'o_neu_' + o.id, type: 'order', data: o, prio: 8, title: 'Neue Bestellung',
                            message: `Neue Bestellung von Schicht ${o.schicht}`,
                            actionHtml: `<span class="text-xs text-slate-500">In Übersicht bearbeiten</span>`
                        });
                    }
                    // Besteller: Status-Update
                    if (!isLagermensch && o.status !== 'NEU' && (o.user_name === userName || o.schicht === profileShift)) {
                        allNotifications.push({
                            id: 'o_status_' + o.id + '_' + o.status, type: 'status', data: o, prio: 5,
                            title: `Status-Update (#${o.id}): ${displayStatus}`,
                            message: `Status-Update (#${o.id}): ${displayStatus}`,
                            actionHtml: `<span class="text-xs text-slate-500">Ihre Bestellung ${o.status === 'ABGESCHLOSSEN' ? 'wurde abgeschlossen.' : 'wird bearbeitet.'}</span>`
                        });
                    }
                });
            }

            // Read state
            const storageKey = `lager_read_notifs_${currentUser.id}`;
            let readIds = [];
            try { readIds = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (e) { readIds = []; }
            const currentIds = allNotifications.map(n => n.id);
            readIds = readIds.filter(id => currentIds.includes(id));
            localStorage.setItem(storageKey, JSON.stringify(readIds));

            const unreadCount = allNotifications.filter(n => !readIds.includes(n.id)).length;
            if (notificationBadge) {
                if (unreadCount > 0) notificationBadge.classList.remove('hidden');
                else notificationBadge.classList.add('hidden');
            }

            if (!notificationList) return;

            if (unreadCount === 0) {
                notificationList.innerHTML = '<p class="text-sm text-slate-500 font-medium text-center py-6 border-2 border-dashed border-border-light dark:border-white/10 rounded-2xl">Keine offenen Meldungen</p>';
                return;
            }

            notificationList.innerHTML = '';
            allNotifications.sort((a, b) => b.prio - a.prio).forEach(notif => {
                if (readIds.includes(notif.id)) return;

                let iconName = 'info', colorClass = 'bg-brand/10 text-brand';
                if (notif.type === 'stock') { iconName = 'error'; colorClass = 'bg-rose-500/10 text-rose-500'; }
                else if (notif.type === 'order') { iconName = 'shopping_cart'; colorClass = 'bg-amber-500/10 text-amber-500'; }
                else if (notif.type === 'status') { iconName = 'check_circle'; colorClass = 'bg-emerald-500/10 text-emerald-500'; }

                let meta = '';
                if (notif.type === 'order' || notif.type === 'status') {
                    meta = notif.data && notif.data.zeitpunkt ? new Date(notif.data.zeitpunkt.replace(' ', 'T')).toLocaleString('de-DE') : 'Unbekannt';
                } else {
                    const schichtVal = notif.data && notif.data.schicht ? notif.data.schicht : profileShift;
                    meta = (schichtVal === '?' || !schichtVal) ? 'Schichtübergreifend' : `Schicht ${schichtVal}`;
                }

                const div = document.createElement('div');
                div.className = 'notification-item bg-white dark:bg-bg-dark border border-border-light dark:border-border-dark p-4 rounded-xl shadow-sm transition-all';
                div.innerHTML = `
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-full ${colorClass} flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[20px]">${iconName}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start gap-2">
                                <p class="text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">${notif.title}</p>
                                <button class="text-slate-400 hover:text-brand transition-colors p-0.5 shrink-0" title="Als gelesen markieren" onclick="markNotificationRead('${notif.id}', event)">
                                    <span class="material-symbols-outlined text-[16px]">done</span>
                                </button>
                            </div>
                            <p class="text-xs text-slate-500 mt-1 truncate">${notif.message}</p>
                            <p class="text-[10px] text-slate-400 font-mono mt-2">${meta}</p>
                            <div class="mt-2">${notif.actionHtml || ''}</div>
                        </div>
                    </div>`;
                notificationList.appendChild(div);
            });
        });
    }

    window.markNotificationRead = function(itemId, event) {
        if (event) event.stopPropagation();
        const storageKey = `lager_read_notifs_${currentUser.id}`;
        let readIds = [];
        try { readIds = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (e) { }
        if (!readIds.includes(itemId)) {
            readIds.push(itemId);
            localStorage.setItem(storageKey, JSON.stringify(readIds));
        }
        const el = event ? event.target.closest('.notification-item') : null;
        if (el) {
            el.classList.add('opacity-0', 'scale-95');
            setTimeout(() => { el.remove(); checkNotifications(); }, 300);
        } else {
            checkNotifications();
        }
    };

    window.clearAllNotifications = function() {
        const items = document.querySelectorAll('#notification-list .notification-item');
        items.forEach(el => el.classList.add('opacity-0', 'scale-95'));
        setTimeout(() => {
            fetch(`${API_URL}?action=get_open_orders`)
                .then(r => r.json())
                .then(orders => {
                    const storageKey = `lager_read_notifs_${currentUser.id}`;
                    let currentReads = [];
                    try { currentReads = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (e) { }
                    const newIds = [];
                    if (Array.isArray(orders)) {
                        orders.forEach(o => {
                            newIds.push('o_neu_' + o.id);
                            newIds.push('o_status_' + o.id + '_' + o.status);
                        });
                    }
                    localStorage.setItem(storageKey, JSON.stringify([...new Set([...currentReads, ...newIds])]));
                    showNotification('Alle als gelesen markiert', 'info');
                    checkNotifications();
                });
        }, 300);
    };

    // ============================================================
    // HELPERS
    // ============================================================
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showModal(m) { if (m) m.classList.remove('hidden'); }
    function hideModal(m) { if (m) m.classList.add('hidden'); }

    window.showNotification = function(text, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        let bgClass = 'bg-brand', iconName = 'info';
        if (type === 'success') { bgClass = 'bg-emerald-500'; iconName = 'check_circle'; }
        else if (type === 'error') { bgClass = 'bg-rose-500'; iconName = 'error'; }
        else if (type === 'warning') { bgClass = 'bg-amber-500'; iconName = 'warning'; }

        const toast = document.createElement('div');
        toast.className = `animate-slide-in-right flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white pointer-events-auto min-w-[300px] ${bgClass}`;
        toast.innerHTML = `
            <span class="material-symbols-outlined text-xl">${iconName}</span>
            <p class="text-sm font-medium flex-1">${escapeHtml(text)}</p>
            <button class="opacity-70 hover:opacity-100 p-0.5" onclick="this.parentElement.remove()">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>`;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
    };

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    if (loginBtn) loginBtn.addEventListener('click', () => {
        showModal(loginModal);
        loginRfidInput.value = '';
        loginError.classList.add('hidden');
        loginRfidInput.focus();
    });

    if (btnCancelLogin) btnCancelLogin.addEventListener('click', () => hideModal(loginModal));
    if (btnSubmitLogin) btnSubmitLogin.addEventListener('click', performLogin);
    if (loginRfidInput) loginRfidInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); performLogin(); }
    });

    if (userProfile) userProfile.addEventListener('click', () => showModal(logoutModal));
    if (btnCancelLogout) btnCancelLogout.addEventListener('click', () => hideModal(logoutModal));
    if (btnConfirmLogout) btnConfirmLogout.addEventListener('click', () => {
        fetch(`${API_URL}?action=logout`).then(() => {
            updateAuthUI(false);
            hideModal(logoutModal);
            showNotification('Abgemeldet', 'info');
        });
    });

    if (btnNotifications && notificationModal) {
        btnNotifications.addEventListener('click', () => {
            checkNotifications();
            notificationModal.classList.remove('hidden');
        });
    }

    // Theme Toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.theme = 'light';
        } else {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
        }
    });

    // ESC Key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            [loginModal, logoutModal, cartModal, orderModal, orderDetailsModal,
                document.getElementById('add-item-modal'),
                document.getElementById('stock-adjustment-modal'),
                document.getElementById('all-activities-modal'),
                document.getElementById('notifications-modal')].forEach(m => {
                if (m && !m.classList.contains('hidden')) m.classList.add('hidden');
            });
        }
    });

    // Auto-refresh notifications
    setInterval(() => { if (currentUser) checkNotifications(); }, 30000);

    // Init
    checkAuth();
});