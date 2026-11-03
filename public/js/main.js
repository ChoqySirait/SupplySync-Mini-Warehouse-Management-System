/**
 * SupplySync WMS - Main Client Application Logic
 * Enterprise Single Page Application (SPA) Controller with RBAC & Picking Slip
 */

// Application State
let currentProducts = [];
let currentTransactionLogs = [];
let currentOpnameLogs = [];
let currentCategories = [];
let currentSuppliers = [];
let currentLocations = [];
let currentUsers = [];
let currentPurchaseOrders = [];
let currentSalesOrders = [];
let currentReplenishmentAlerts = [];
let currentBatchAgingData = null;
let selectedPoDetail = null;
let selectedSoDetail = null;
let chartInstance = null;

// Auth State
let currentUser = {
    user_id: 1,
    username: 'admin',
    role: 'ADMIN',
    full_name: 'Choqy Pananda'
};
let authToken = localStorage.getItem('supplysync_token') || '';

// HTML Escaping Utility untuk mencegah kerentanan XSS
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --------------------------------------------------------------------
// 1. TOAST NOTIFICATION SYSTEM
// --------------------------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-enter flex items-center gap-3 p-4 rounded-xl shadow-lg border text-xs font-semibold max-w-sm pointer-events-auto transition-all ${
        type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
        type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
        type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
        'bg-blue-50 text-blue-800 border-blue-200'
    }`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="w-5 h-5 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
    } else {
        iconSvg = `<svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <div class="flex-1">${escapeHtml(message)}</div>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-700 ml-2">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --------------------------------------------------------------------
// 2. TAB NAVIGATION SWITCHER & MOBILE SIDEBAR
// --------------------------------------------------------------------
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    const activeTab = document.getElementById(`tab-${tabName}`);
    const activeNav = document.getElementById(`nav-${tabName}`);

    if (activeTab) activeTab.classList.remove('hidden');
    if (activeNav) activeNav.classList.add('active');

    const titles = {
        overview: 'Dashboard Overview & Analytics',
        inventory: 'Master Inventaris & Rincian Batch SKU',
        movements: 'Pusat Transaksi & Mutasi Stok (FEFO)',
        transfers: 'Transfer Antar-Gudang & Relokasi Multi-Fasilitas',
        orders: 'Manajemen Pesanan Terintegrasi (Purchase & Sales Orders)',
        replenishment: 'Otomatisasi Restock & Analitik Aging Batch',
        opname: 'Rekonsiliasi Stock Opname Fisik',
        locations: 'Peta Lokasi Rak & Bin Gudang',
        audit: 'Audit Trail Transaksi Real-time'
    };
    document.getElementById('page-title').innerText = titles[tabName] || 'SupplySync Enterprise WMS';

    if (tabName === 'transfers') {
        loadTransfersList();
    } else if (tabName === 'orders') {
        loadPurchaseOrdersList();
        loadSalesOrdersList();
    } else if (tabName === 'replenishment') {
        loadReplenishmentData();
    }

    closeMobileSidebar();
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('hidden');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 768) {
        sidebar.classList.add('hidden');
    }
}

// --------------------------------------------------------------------
// 3. AUTHENTICATION & OPERATOR SWITCHER (RBAC)
// --------------------------------------------------------------------
async function initAuth() {
    try {
        const savedToken = localStorage.getItem('supplysync_token');
        if (savedToken) {
            authToken = savedToken;
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const json = await res.json();
            if (json.status === 'Success' && json.data) {
                currentUser = json.data;
            } else {
                await autoLoginDefaultAdmin();
            }
        } else {
            await autoLoginDefaultAdmin();
        }
    } catch {
        // Fallback default admin
    }
    updateUserInterface();
    fetchUsersList();
}

async function autoLoginDefaultAdmin() {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });
        const json = await res.json();
        if (json.status === 'Success' && json.token) {
            authToken = json.token;
            currentUser = json.user;
            localStorage.setItem('supplysync_token', authToken);
        }
    } catch (e) {
        console.warn('Auto-login fallback failed:', e);
    }
}

function updateUserInterface() {
    // Header & Sidebar Avatar Info
    const initials = (currentUser.full_name || 'CP').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    
    const sidebarAvatar = document.getElementById('sidebar-user-avatar');
    if (sidebarAvatar) sidebarAvatar.innerText = initials;

    const sidebarName = document.getElementById('sidebar-user-name');
    if (sidebarName) sidebarName.innerText = currentUser.full_name;

    const sidebarRole = document.getElementById('sidebar-user-role');
    if (sidebarRole) {
        const roleColor = currentUser.role === 'ADMIN' ? 'text-purple-600' : currentUser.role === 'MANAGER' ? 'text-emerald-600' : 'text-blue-600';
        const facilityBadge = currentUser.role === 'ADMIN' ? 'Global Hub' : (currentUser.facility_code || 'WH-JKT-01');
        sidebarRole.className = `text-[10px] font-bold flex items-center gap-1 ${roleColor}`;
        sidebarRole.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current"></span> ${currentUser.role} • ${facilityBadge}`;
    }

    const headerOperator = document.getElementById('header-operator-name');
    if (headerOperator) {
        const facName = currentUser.role === 'ADMIN' ? 'Semua Fasilitas' : (currentUser.facility_name || 'Gudang Pusat Cakung');
        headerOperator.innerText = `${currentUser.full_name} (${currentUser.role} - ${facName})`;
    }

    // Role-Based UI Element Toggles
    const isStaff = currentUser.role === 'STAFF';
    const isManager = currentUser.role === 'MANAGER';
    const isAdmin = currentUser.role === 'ADMIN';

    // Transfer Creation Button
    const trfBtn = document.getElementById('btn-create-transfer');
    if (trfBtn) {
        trfBtn.style.display = isStaff ? 'none' : 'flex';
    }

    // PO and SO Creation Buttons
    const poBtn = document.getElementById('btn-create-po');
    if (poBtn) {
        poBtn.style.display = isStaff ? 'none' : 'flex';
    }
    const soBtn = document.getElementById('btn-create-so');
    if (soBtn) {
        soBtn.style.display = isStaff ? 'none' : 'flex';
    }

    // Backup Button
    const backupBtn = document.getElementById('btn-trigger-backup');
    if (backupBtn) {
        backupBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    // Re-render product table to refresh action buttons per role
    if (Array.isArray(currentProducts) && currentProducts.length > 0) {
        renderProductsTable(currentProducts);
    }
}

async function fetchUsersList() {
    try {
        const res = await fetch('/api/auth/users');
        const json = await res.json();
        if (json.status === 'Success') {
            currentUsers = json.data || [];
            populateUserSwitcher();
        }
    } catch (e) {
        console.warn('Gagal memuat daftar pengguna:', e);
    }
}

function populateUserSwitcher() {
    const container = document.getElementById('user-switch-options');
    if (!container) return;

    container.innerHTML = currentUsers.map(u => `
        <button onclick="switchOperator('${u.username}')" class="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 flex items-center justify-between text-xs transition border border-transparent hover:border-slate-200">
            <div>
                <div class="font-bold text-slate-900">${escapeHtml(u.full_name)}</div>
                <div class="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span>@${escapeHtml(u.username)}</span>
                    <span class="text-slate-300">•</span>
                    <span class="text-indigo-600 font-medium">${escapeHtml(u.facility_name || (u.facility_id === 2 ? 'Cold Storage Rungkut' : 'Gudang Pusat Cakung'))}</span>
                </div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
                u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                u.role === 'MANAGER' ? 'bg-emerald-100 text-emerald-700' :
                'bg-blue-100 text-blue-700'
            }">${u.role}</span>
        </button>
    `).join('');
}

async function switchOperator(username) {
    try {
        const defaultPassword = username + '123';
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: defaultPassword })
        });
        const json = await res.json();

        if (json.status === 'Success' && json.token) {
            authToken = json.token;
            currentUser = json.user;
            localStorage.setItem('supplysync_token', authToken);
            updateUserInterface();
            closeModal('modal-switch-user');
            showToast(`Beralih operator aktif: ${currentUser.full_name} (${currentUser.role})`, 'success');
        } else {
            showToast('Gagal beralih operator: ' + json.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan saat login: ' + err.message, 'error');
    }
}

// --------------------------------------------------------------------
// 4. DATA FETCHING & SYNCHRONIZATION
// --------------------------------------------------------------------
async function loadDashboardData() {
    try {
        await Promise.all([
            initAuth(),
            fetchCategories(),
            fetchSuppliers(),
            fetchLocations(),
            fetchProducts(),
            fetchFifoBatches(),
            fetchKpiMetrics(),
            loadTransactionLogs(),
            loadOpnameLogs(),
            loadFacilities(),
            loadTransfersList(),
            loadPurchaseOrdersList(),
            loadSalesOrdersList(),
            loadReplenishmentData()
        ]);
    } catch (error) {
        console.error('❌ Gagal sinkronisasi data dashboard:', error);
        showToast('Gagal memuat data dari database MySQL.', 'error');
    }
}

async function fetchCategories() {
    try {
        const res = await fetch('/api/categories');
        const json = await res.json();
        if (json.status === 'Success') {
            currentCategories = json.data || [];
            populateCategoryFilter();
        }
    } catch (e) {
        console.warn('Gagal memuat kategori:', e);
    }
}

async function fetchSuppliers() {
    try {
        const res = await fetch('/api/suppliers');
        const json = await res.json();
        if (json.status === 'Success') {
            currentSuppliers = json.data || [];
            populateSupplierDropdowns();
        }
    } catch (e) {
        console.warn('Gagal memuat pemasok:', e);
    }
}

async function fetchLocations() {
    try {
        const res = await fetch('/api/locations');
        const json = await res.json();
        if (json.status === 'Success') {
            currentLocations = json.data || [];
            renderLocationsGrid(currentLocations);
            populateLocationDropdowns();
        }
    } catch (e) {
        console.warn('Gagal memuat lokasi rak gudang:', e);
    }
}

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        const json = await res.json();
        if (json.status === 'Success') {
            currentProducts = json.data || [];
            renderProductTable(currentProducts);
            updateStatCards(currentProducts);
            populateProductDropdowns(currentProducts);
        }
    } catch (e) {
        console.error('Gagal mengambil daftar produk:', e);
    }
}

async function fetchFifoBatches() {
    try {
        const res = await fetch('/api/batches/fefo');
        const json = await res.json();
        if (json.status === 'Success' && json.data && json.data.length > 0) {
            const topFefo = json.data[0];
            const days = topFefo.days_until_expiration;
            const expBadge = days < 0 
                ? `Kedaluwarsa (${Math.abs(days)} hari lalu)` 
                : `${days} Hari lagi Expired`;

            document.getElementById('stat-fifo-priority').innerText = topFefo.product_name;
            document.getElementById('stat-fifo-sub').innerText = `${topFefo.batch_code || '#' + topFefo.batch_id} (${topFefo.location_code || 'A-01-01'}) — ${expBadge}`;
        } else {
            document.getElementById('stat-fifo-priority').innerText = 'Stok Bersih';
            document.getElementById('stat-fifo-sub').innerText = 'Tidak ada batch mendekati kedaluwarsa';
        }
    } catch (e) {
        console.warn('Gagal memuat batch FEFO:', e);
    }
}

async function fetchKpiMetrics() {
    try {
        const res = await fetch('/api/analytics/kpi');
        const json = await res.json();
        if (json.status === 'Success' && json.data) {
            const data = json.data;
            const assetEl = document.getElementById('stat-asset-value');
            if (assetEl) assetEl.innerText = data.formatted_asset_value || 'Rp 0';

            const unitsEl = document.getElementById('stat-active-units');
            if (unitsEl) unitsEl.innerText = `${data.total_active_units || 0} Unit Tersimpan`;

            const healthEl = document.getElementById('stat-health-score');
            if (healthEl) {
                const score = data.freshness_health_score;
                healthEl.innerText = `${score}%`;
                healthEl.className = `text-2xl font-black mt-1 tracking-tight ${score >= 90 ? 'text-emerald-600' : score >= 70 ? 'text-amber-600' : 'text-rose-600'}`;
            }

            const healthSubEl = document.getElementById('stat-health-sub');
            if (healthSubEl) {
                healthSubEl.innerText = `${data.fresh_batches || 0} dari ${data.total_batches || 0} batch prima`;
            }
        }
    } catch (e) {
        console.warn('Gagal memuat metrik KPI:', e);
    }
}

// --------------------------------------------------------------------
// 5. RENDERING TABEL & LOKASI GUDANG
// --------------------------------------------------------------------
function renderProductTable(products) {
    const tbody = document.getElementById('product-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">Belum ada produk terdaftar. Silakan klik tombol "+ Tambah SKU Baru".</td></tr>`;
        return;
    }

    products.forEach(item => {
        let statusBadge = '';
        if (item.stock_status === 'Safe') {
            statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2.5 py-1 rounded-full font-semibold">Aman</span>`;
        } else if (item.stock_status === 'Low Stock') {
            statusBadge = `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2.5 py-1 rounded-full font-semibold">Low Stock (&le; ${item.min_stock})</span>`;
        } else {
            statusBadge = `<span class="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-2.5 py-1 rounded-full font-semibold">Stok Habis</span>`;
        }

        const costPriceFormatted = item.cost_price ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.cost_price) : '-';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        tr.innerHTML = `
            <td class="p-4 font-mono font-bold text-blue-700">${escapeHtml(item.product_id)}</td>
            <td class="p-4">
                <div class="font-bold text-slate-900">${escapeHtml(item.product_name)}</div>
                <div class="text-[11px] text-slate-400">${item.active_batches || 0} batch di rak &bull; HPP: ${costPriceFormatted}</div>
            </td>
            <td class="p-4 text-slate-600">${escapeHtml(item.category)}</td>
            <td class="p-4 font-bold text-right ${item.stock_status === 'Low Stock' ? 'text-amber-600' : item.stock_status === 'Out of Stock' ? 'text-rose-600' : 'text-slate-900'}">${item.total_stock}</td>
            <td class="p-4 text-slate-500">${escapeHtml(item.unit)}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 text-right space-x-1 whitespace-nowrap">
                <button onclick="printProductSkuLabel('${escapeHtml(item.product_id)}', '${escapeHtml(item.product_name)}', '${escapeHtml(item.category)}', '${escapeHtml(item.unit)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition" title="Cetak Barcode SKU">
                    Barcode
                </button>
                <button onclick="openStockCardModal('${escapeHtml(item.product_id)}', '${escapeHtml(item.product_name)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition" title="Buka Kartu Stok & Laporan Mutasi Saldo">
                    Ledger
                </button>
                <button onclick="showBatchDetails('${escapeHtml(item.product_id)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="Lihat rincian batch & lokasi rak">
                    Batch
                </button>
                <button onclick="openOpnameModalForProduct('${escapeHtml(item.product_id)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition" title="Stock Opname">
                    Opname
                </button>
                ${currentUser.role === 'ADMIN' ? `
                <button onclick="handleDeleteProduct('${escapeHtml(item.product_id)}')" class="px-2 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition" title="Nonaktifkan master produk (Admin Only)">
                    &times;
                </button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderLocationsGrid(locations) {
    const container = document.getElementById('locations-grid-container');
    if (!container) return;
    container.innerHTML = '';

    if (!locations || locations.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400 col-span-3">Belum ada lokasi rak terdaftar.</div>`;
        return;
    }

    locations.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'card-enterprise p-5 rounded-2xl flex flex-col justify-between space-y-3 hover:border-blue-300 transition';
        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <span class="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">${escapeHtml(loc.location_code)}</span>
                    <button onclick="printWarehouseBinLabel('${escapeHtml(loc.location_code)}', '${escapeHtml(loc.zone_name)}', '${escapeHtml(loc.aisle)}', '${escapeHtml(loc.rack)}', '${escapeHtml(loc.tier)}', '${escapeHtml(loc.bin)}')" class="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition flex items-center gap-1" title="Cetak Label Rak Barcode">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        Cetak Label
                    </button>
                </div>
                <h4 class="font-bold text-sm text-slate-900">${escapeHtml(loc.zone_name)}</h4>
                <p class="text-xs text-slate-500 mt-1">${escapeHtml(loc.aisle)} &bull; ${escapeHtml(loc.rack)} &bull; ${escapeHtml(loc.tier)} &bull; ${escapeHtml(loc.bin)}</p>
                <p class="text-[11px] text-slate-400 italic mt-1">${escapeHtml(loc.description || 'Penyimpanan terstandar')}</p>
            </div>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span class="text-slate-500 font-medium">Total Stok di Bin:</span>
                <span class="font-bold text-slate-900">${loc.total_stock || 0} Unit (${loc.batch_count || 0} Batch)</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// --------------------------------------------------------------------
// 6. MODAL RINCIAN BATCH PER SKU DENGAN LOKASI RAK
// --------------------------------------------------------------------
async function showBatchDetails(productId) {
    try {
        const res = await fetch(`/api/products/${productId}/batches`);
        const json = await res.json();
        const tbody = document.getElementById('batch-detail-body');
        document.getElementById('batch-detail-title').innerText = `Rincian Batch Aktif & Lokasi Rak: SKU ${productId}`;
        tbody.innerHTML = '';

        if (json.status === 'Success' && json.data && json.data.length > 0) {
            json.data.forEach(b => {
                const isExpired = b.days_until_expiration < 0;
                const isNear = b.days_until_expiration <= 30 && !isExpired;
                const expiryClass = isExpired ? 'text-rose-600 font-bold' : isNear ? 'text-amber-600 font-bold' : 'text-slate-700';

                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-100 text-xs hover:bg-slate-50';
                tr.innerHTML = `
                    <td class="p-3 font-mono font-semibold">${escapeHtml(b.batch_code || '#' + b.batch_id)}</td>
                    <td class="p-3">
                        <span class="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">${escapeHtml(b.location_code || 'A-01-01')}</span>
                        <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(b.aisle || '')} > ${escapeHtml(b.rack || '')}</div>
                    </td>
                    <td class="p-3 text-slate-600">${escapeHtml(b.supplier_name || 'Pasokan Internal')}</td>
                    <td class="p-3 ${expiryClass}">
                        ${b.expired_date ? b.expired_date.split('T')[0] : '-'} 
                        <span class="text-[10px] block font-normal text-slate-400">(${b.days_until_expiration} hari lagi)</span>
                    </td>
                    <td class="p-3 font-bold text-right text-slate-900">${b.quantity} / ${b.initial_quantity || b.quantity}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Tidak ada batch aktif untuk produk ini.</td></tr>`;
        }

        openModal('modal-batch-details');
    } catch (e) {
        showToast('Gagal memuat rincian batch: ' + e.message, 'error');
    }
}

// --------------------------------------------------------------------
// 7. RENDER AUDIT LOG & VISUAL ANALYTICS
// --------------------------------------------------------------------
async function loadTransactionLogs() {
    try {
        const filterType = document.getElementById('filter-log-type')?.value || '';
        let url = '/api/transactions?limit=100';
        if (filterType) url += `&type=${filterType}`;

        const res = await fetch(url);
        const result = await res.json();
        const tbody = document.getElementById('log-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (result.status === 'Success' && result.data && result.data.length > 0) {
            currentTransactionLogs = result.data;
            renderAnalyticsChart(currentTransactionLogs);

            result.data.forEach(log => {
                const type = log.transaction_type;
                let typeBadge = '';
                let qtyColor = 'text-slate-900';
                let sign = '';

                if (type === 'IN') {
                    typeBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md">STOCK IN</span>`;
                    qtyColor = 'text-emerald-600 font-bold';
                    sign = '+';
                } else if (type === 'OUT') {
                    typeBadge = `<span class="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-md">STOCK OUT</span>`;
                    qtyColor = 'text-rose-600 font-bold';
                    sign = '-';
                } else if (type === 'DISPOSAL') {
                    typeBadge = `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-md">DISPOSAL</span>`;
                    qtyColor = 'text-amber-600 font-bold';
                    sign = '-';
                } else if (type === 'ADJUSTMENT') {
                    typeBadge = `<span class="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-md">ADJUSTMENT</span>`;
                    qtyColor = 'text-blue-600 font-bold';
                    sign = log.notes && log.notes.includes('SURPLUS') ? '+' : '-';
                }

                const dateFormatted = new Date(log.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });

                let docBtn = '<span class="text-slate-300">-</span>';
                if (type === 'IN') {
                    docBtn = `<button onclick="handlePrintGrnFromLog(${log.transaction_id})" class="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 transition shadow-xs" title="Cetak Bukti Penerimaan Barang">Cetak GRN</button>`;
                } else if (type === 'OUT') {
                    docBtn = `<button onclick="handlePrintDoFromLog(${log.transaction_id})" class="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 transition shadow-xs" title="Cetak Surat Jalan Pengiriman">Cetak DO</button>`;
                }

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
                tr.innerHTML = `
                    <td class="p-4 font-mono text-xs text-slate-600">${escapeHtml(log.reference_no || '#LOG-' + log.transaction_id)}</td>
                    <td class="p-4 text-slate-600 text-xs">${dateFormatted}</td>
                    <td class="p-4 font-bold text-slate-900">${escapeHtml(log.product_name)}</td>
                    <td class="p-4">${typeBadge}</td>
                    <td class="p-4 text-right ${qtyColor}">${sign}${log.quantity} ${escapeHtml(log.unit || '')}</td>
                    <td class="p-4 text-slate-600 text-xs">${escapeHtml(log.operator || 'System Operator')}</td>
                    <td class="p-4 text-slate-500 italic text-xs max-w-xs truncate">${escapeHtml(log.notes || '-')}</td>
                    <td class="p-4 text-center whitespace-nowrap">${docBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada riwayat transaksi mutasi yang tercatat.</td></tr>`;
            renderAnalyticsChart([]);
        }
    } catch (error) {
        console.error('❌ Gagal memuat audit log:', error);
    }
}

async function loadOpnameLogs() {
    try {
        const res = await fetch('/api/stock/opname');
        const json = await res.json();
        const tbody = document.getElementById('opname-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (json.status === 'Success' && json.data && json.data.length > 0) {
            currentOpnameLogs = json.data;
            json.data.forEach(op => {
                const diff = op.difference;
                const diffBadge = diff > 0 
                    ? `<span class="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">+${diff} (Surplus)</span>`
                    : diff < 0 
                    ? `<span class="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-bold">${diff} (Defisit)</span>`
                    : `<span class="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold">0 (Sesuai)</span>`;

                const dateFormatted = new Date(op.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition border-b border-slate-100 text-xs';
                tr.innerHTML = `
                    <td class="p-4 font-mono font-semibold text-slate-700">${escapeHtml(op.opname_number)}</td>
                    <td class="p-4 text-slate-600">${dateFormatted}</td>
                    <td class="p-4 font-bold text-slate-900">${escapeHtml(op.product_name)}</td>
                    <td class="p-4 text-right font-medium">${op.system_stock}</td>
                    <td class="p-4 text-right font-bold text-blue-700">${op.physical_stock}</td>
                    <td class="p-4 text-center">${diffBadge}</td>
                    <td class="p-4 text-slate-600">${escapeHtml(op.operator || 'Auditor')}</td>
                    <td class="p-4 text-slate-500 italic max-w-xs truncate">${escapeHtml(op.reason)}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada catatan rekonsiliasi stock opname.</td></tr>`;
        }
    } catch (e) {
        console.warn('Gagal memuat riwayat stock opname:', e);
    }
}

function renderAnalyticsChart(logs) {
    const ctx = document.getElementById('stockMovementChart');
    if (!ctx) return;

    const summaryMap = {};
    logs.forEach(log => {
        const pName = log.product_name || 'Lainnya';
        if (!summaryMap[pName]) {
            summaryMap[pName] = { in: 0, out: 0 };
        }

        if (log.transaction_type === 'IN') {
            summaryMap[pName].in += parseInt(log.quantity, 10) || 0;
        } else {
            summaryMap[pName].out += parseInt(log.quantity, 10) || 0;
        }
    });

    const labels = Object.keys(summaryMap);
    const inData = labels.map(l => summaryMap[l].in);
    const outData = labels.map(l => summaryMap[l].out);

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['Belum Ada Transaksi'],
            datasets: [
                {
                    label: 'Volume Masuk (Inbound)',
                    data: inData.length > 0 ? inData : [0],
                    backgroundColor: 'rgba(5, 150, 105, 0.85)',
                    borderColor: '#059669',
                    borderWidth: 1,
                    borderRadius: 6
                },
                {
                    label: 'Volume Keluar (FEFO Outflow / Disposal)',
                    data: outData.length > 0 ? outData : [0],
                    backgroundColor: 'rgba(225, 29, 72, 0.85)',
                    borderColor: '#e11d48',
                    borderWidth: 1,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Plus Jakarta Sans', size: 12, weight: 600 } }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

// --------------------------------------------------------------------
// 8. FORM SUBMISSION HANDLERS
// --------------------------------------------------------------------
async function handleAddProduct(e) {
    e.preventDefault();
    const payload = {
        product_id: document.getElementById('prod-id').value.toUpperCase().trim(),
        product_name: document.getElementById('prod-name').value.trim(),
        category: document.getElementById('prod-category').value.trim(),
        unit: document.getElementById('prod-unit').value.trim(),
        min_stock: parseInt(document.getElementById('prod-min-stock').value, 10) || 10,
        cost_price: parseFloat(document.getElementById('prod-cost-price')?.value) || 0,
        description: document.getElementById('prod-desc')?.value.trim() || ''
    };

    try {
        const res = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            closeModal('modal-add-product');
            document.getElementById('form-add-product').reset();
            await loadDashboardData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function handleStockIn(e) {
    e.preventDefault();
    const prodId = document.getElementById('in-product-id').value;
    if (!prodId) {
        showToast('Pilih SKU produk terlebih dahulu!', 'warning');
        return;
    }

    const payload = {
        product_id: prodId,
        quantity: parseInt(document.getElementById('in-quantity').value, 10),
        expired_date: document.getElementById('in-expired-date').value,
        supplier_id: document.getElementById('in-supplier-id')?.value || null,
        location_id: document.getElementById('in-location-id')?.value || null,
        batch_code: document.getElementById('in-batch-code')?.value || '',
        notes: document.getElementById('in-notes').value,
        user_id: currentUser.user_id
    };

    try {
        const res = await fetch('/api/stock/in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            closeModal('modal-stock-in');
            document.getElementById('form-stock-in').reset();
            await loadDashboardData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function handleStockOut(e) {
    e.preventDefault();
    const prodId = document.getElementById('out-product-id').value;
    if (!prodId) {
        showToast('Pilih SKU produk terlebih dahulu!', 'warning');
        return;
    }

    const payload = {
        product_id: prodId,
        quantity: parseInt(document.getElementById('out-quantity').value, 10),
        notes: document.getElementById('out-notes').value,
        allow_expired: document.getElementById('out-allow-expired')?.checked || false,
        user_id: currentUser.user_id
    };

    try {
        const res = await fetch('/api/stock/out', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            closeModal('modal-stock-out');
            document.getElementById('form-stock-out').reset();
            await loadDashboardData();

            // Tampilkan Digital Picking Slip Modal!
            showPickingSlipModal(result.data);
            showToast(result.message, 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

let lastPickingSlipData = null;

// Menampilkan Modal Picking Slip Digital
function showPickingSlipModal(data) {
    if (!data) return;
    lastPickingSlipData = data;

    document.getElementById('ps-ref-no').innerText = data.reference_no;
    document.getElementById('ps-product-name').innerText = data.product_name;
    document.getElementById('ps-total-qty').innerText = `${data.total_deducted} Unit`;
    document.getElementById('ps-date').innerText = new Date().toLocaleString('id-ID');
    document.getElementById('ps-picker').innerText = `${currentUser.full_name} (${currentUser.role})`;

    const tbody = document.getElementById('ps-items-body');
    if (tbody && data.batches_affected) {
        tbody.innerHTML = data.batches_affected.map(b => `
            <tr class="border-b border-slate-100 text-xs">
                <td class="p-3 font-mono font-bold">${escapeHtml(b.batch_code)}</td>
                <td class="p-3 font-mono font-bold text-blue-700">${escapeHtml(b.location_code)}</td>
                <td class="p-3 text-slate-600">${escapeHtml(b.zone_name)}</td>
                <td class="p-3 text-slate-500">${escapeHtml(b.aisle)} &bull; ${escapeHtml(b.rack)} &bull; ${escapeHtml(b.tier)} &bull; ${escapeHtml(b.bin)}</td>
                <td class="p-3 font-black text-right text-rose-600">${b.deducted} Unit</td>
            </tr>
        `).join('');
    }

    openModal('modal-picking-slip');
}

function printCurrentDeliveryOrder() {
    if (!lastPickingSlipData) {
        showToast('Data rincian surat jalan tidak tersedia.', 'warning');
        return;
    }
    if (typeof printDeliveryOrder === 'function') {
        printDeliveryOrder({
            ...lastPickingSlipData,
            operator: `${currentUser.full_name} (${currentUser.role})`
        });
    } else {
        showToast('Modul cetak dokumen belum siap.', 'error');
    }
}

async function handleStockDisposal(e) {
    e.preventDefault();
    const prodId = document.getElementById('disp-product-id').value;
    if (!prodId) {
        showToast('Pilih SKU produk terlebih dahulu!', 'warning');
        return;
    }

    const payload = {
        product_id: prodId,
        quantity: parseInt(document.getElementById('disp-quantity').value, 10),
        reason: document.getElementById('disp-reason').value,
        user_id: currentUser.user_id
    };

    try {
        const res = await fetch('/api/stock/disposal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            closeModal('modal-stock-disposal');
            document.getElementById('form-stock-disposal').reset();
            await loadDashboardData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function handleStockOpname(e) {
    e.preventDefault();
    const prodId = document.getElementById('opn-product-id').value;
    if (!prodId) {
        showToast('Pilih SKU produk terlebih dahulu!', 'warning');
        return;
    }

    const payload = {
        product_id: prodId,
        physical_stock: parseInt(document.getElementById('opn-physical-qty').value, 10),
        reason: document.getElementById('opn-reason').value,
        user_id: currentUser.user_id
    };

    try {
        const res = await fetch('/api/stock/opname', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            closeModal('modal-stock-opname');
            document.getElementById('form-stock-opname').reset();
            await loadDashboardData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function handleAddLocation(e) {
    e.preventDefault();
    const payload = {
        location_code: document.getElementById('loc-code').value.toUpperCase().trim(),
        zone_name: document.getElementById('loc-zone').value.trim(),
        aisle: document.getElementById('loc-aisle').value.trim(),
        rack: document.getElementById('loc-rack').value.trim(),
        tier: document.getElementById('loc-tier').value.trim(),
        bin: document.getElementById('loc-bin').value.trim(),
        description: document.getElementById('loc-desc')?.value.trim() || ''
    };

    try {
        const res = await fetch('/api/locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            closeModal('modal-add-location');
            document.getElementById('form-add-location').reset();
            await fetchLocations();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function handleDeleteProduct(productId) {
    if (currentUser.role !== 'ADMIN') {
        showToast('Akses ditolak: Hanya role ADMIN yang berhak menonaktifkan master produk.', 'error');
        return;
    }

    if (!confirm(`Konfirmasi penonaktifan master SKU '${productId}'? Tindakan ini hanya berhasil jika stok produk telah 0.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/products/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            await loadDashboardData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

// --------------------------------------------------------------------
// 9. MODAL & DROPDOWN HELPERS
// --------------------------------------------------------------------
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.fixed.inset-0:not(.hidden)').forEach(modal => {
            modal.classList.add('hidden');
        });
    }
});

function openOpnameModalForProduct(productId) {
    const select = document.getElementById('opn-product-id');
    if (select) select.value = productId;
    onOpnameProductChange();
    openModal('modal-stock-opname');
}

function onOpnameProductChange() {
    const prodId = document.getElementById('opn-product-id').value;
    const found = currentProducts.find(p => p.product_id === prodId);
    const sysStockEl = document.getElementById('opn-system-stock-display');
    if (found && sysStockEl) {
        sysStockEl.innerText = `${found.total_stock} ${found.unit}`;
    } else if (sysStockEl) {
        sysStockEl.innerText = '-';
    }
}

function populateProductDropdowns(products) {
    const inSelect = document.getElementById('in-product-id');
    const outSelect = document.getElementById('out-product-id');
    const dispSelect = document.getElementById('disp-product-id');
    const opnSelect = document.getElementById('opn-product-id');

    if (!products || products.length === 0) {
        const emptyOpt = `<option value="">-- Belum ada produk terdaftar --</option>`;
        if (inSelect) inSelect.innerHTML = emptyOpt;
        if (outSelect) outSelect.innerHTML = emptyOpt;
        if (dispSelect) dispSelect.innerHTML = emptyOpt;
        if (opnSelect) opnSelect.innerHTML = emptyOpt;
        return;
    }

    const options = products.map(p => 
        `<option value="${escapeHtml(p.product_id)}">${escapeHtml(p.product_id)} — ${escapeHtml(p.product_name)} (Stok: ${p.total_stock} ${escapeHtml(p.unit)})</option>`
    ).join('');

    if (inSelect) inSelect.innerHTML = options;
    if (outSelect) outSelect.innerHTML = options;
    if (dispSelect) dispSelect.innerHTML = options;
    if (opnSelect) opnSelect.innerHTML = options;
}

function populateSupplierDropdowns() {
    const select = document.getElementById('in-supplier-id');
    if (!select) return;

    if (!currentSuppliers || currentSuppliers.length === 0) {
        select.innerHTML = `<option value="">-- Pemasok Umum / Internal --</option>`;
        return;
    }

    select.innerHTML = `<option value="">-- Pilih Pemasok Resmi --</option>` + currentSuppliers.map(s => 
        `<option value="${s.supplier_id}">${escapeHtml(s.supplier_code)} — ${escapeHtml(s.supplier_name)}</option>`
    ).join('');
}

function populateLocationDropdowns() {
    const select = document.getElementById('in-location-id');
    if (!select) return;

    if (!currentLocations || currentLocations.length === 0) {
        select.innerHTML = `<option value="">-- Area Penampungan Default --</option>`;
        return;
    }

    select.innerHTML = `<option value="">-- Pilih Rak / Bin Gudang --</option>` + currentLocations.map(l => 
        `<option value="${l.location_id}">${escapeHtml(l.location_code)} — ${escapeHtml(l.zone_name)} (${escapeHtml(l.aisle)}/${escapeHtml(l.rack)})</option>`
    ).join('');
}

function populateCategoryFilter() {
    const select = document.getElementById('filter-category');
    if (!select) return;

    select.innerHTML = `<option value="">Semua Kategori</option>` + currentCategories.map(c => 
        `<option value="${escapeHtml(c.category_name)}">${escapeHtml(c.category_name)}</option>`
    ).join('');
}

function updateStatCards(products) {
    const totalEl = document.getElementById('stat-total-products');
    if (totalEl) totalEl.innerText = products.length;
    const lowStockCount = products.filter(p => p.stock_status === 'Low Stock' || p.stock_status === 'Out of Stock').length;
    const lowStockEl = document.getElementById('stat-low-stock');
    if (lowStockEl) lowStockEl.innerText = lowStockCount;
    const lowStockPill = document.getElementById('stat-low-stock-pill');
    if (lowStockPill) lowStockPill.innerText = `(${lowStockCount} Kritis)`;
}

// --------------------------------------------------------------------
// 10. FILTER & EXPORT
// --------------------------------------------------------------------
function filterProducts() {
    const keyword = document.getElementById('search-input')?.value.toLowerCase() || '';
    const category = document.getElementById('filter-category')?.value || '';

    const filtered = currentProducts.filter(p => {
        const matchesKeyword = p.product_name.toLowerCase().includes(keyword) || p.product_id.toLowerCase().includes(keyword);
        const matchesCategory = !category || p.category === category;
        return matchesKeyword && matchesCategory;
    });

    renderProductTable(filtered);
}

function exportLogsToCSV() {
    if (!currentTransactionLogs || currentTransactionLogs.length === 0) {
        showToast('Belum ada data transaksi untuk diekspor.', 'warning');
        return;
    }

    let csv = "Nomor Referensi,Waktu Transaksi,SKU,Nama Produk,Tipe Mutasi,Jumlah,Satuan,Operator,Catatan\n";
    currentTransactionLogs.forEach(log => {
        const time = new Date(log.created_at).toLocaleString('id-ID');
        const cleanNotes = (log.notes || '').replace(/"/g, '""');
        const cleanProduct = (log.product_name || '').replace(/"/g, '""');
        csv += `"${log.reference_no || '#LOG-' + log.transaction_id}","${time}","${log.product_id}","${cleanProduct}","${log.transaction_type}",${log.quantity},"${log.unit || ''}","${log.operator || ''}","${cleanNotes}"\n`;
    });

    downloadCsvBlob(csv, `SupplySync_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`);
    showToast('Audit Log CSV berhasil diekspor!', 'success');
}

function exportInventoryToCSV() {
    if (!currentProducts || currentProducts.length === 0) {
        showToast('Belum ada data produk untuk diekspor.', 'warning');
        return;
    }

    let csv = "SKU,Nama Produk,Kategori,Total Stok,Satuan,Batas Stok Aman,Status Ambang\n";
    currentProducts.forEach(p => {
        const cleanName = (p.product_name || '').replace(/"/g, '""');
        csv += `"${p.product_id}","${cleanName}","${p.category}",${p.total_stock},"${p.unit}",${p.min_stock},"${p.stock_status}"\n`;
    });

    downloadCsvBlob(csv, `SupplySync_Master_Inventaris_${new Date().toISOString().split('T')[0]}.csv`);
    showToast('Master Inventaris CSV berhasil diekspor!', 'success');
}

function downloadCsvBlob(csvContent, filename) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --------------------------------------------------------------------
// 11. PENCETAKAN DOKUMEN LOGISTIK (GRN & DO DARI AUDIT LOG)
// --------------------------------------------------------------------
function handlePrintGrnFromLog(transactionId) {
    const log = currentTransactionLogs.find(l => l.transaction_id === transactionId);
    if (!log) {
        showToast('Data transaksi tidak ditemukan.', 'warning');
        return;
    }
    if (typeof printGoodsReceiptNote === 'function') {
        printGoodsReceiptNote(log);
    } else {
        showToast('Modul cetak dokumen belum siap.', 'error');
    }
}

function handlePrintDoFromLog(transactionId) {
    const log = currentTransactionLogs.find(l => l.transaction_id === transactionId);
    if (!log) {
        showToast('Data transaksi tidak ditemukan.', 'warning');
        return;
    }
    if (typeof printDeliveryOrder === 'function') {
        printDeliveryOrder(log);
    } else {
        showToast('Modul cetak dokumen belum siap.', 'error');
    }
}

// --------------------------------------------------------------------
// 12. MODUL BULK CSV IMPORTER (MASTER SKU & INBOUND MANIFEST)
// --------------------------------------------------------------------
function downloadProductCsvTemplate() {
    const template = "sku,nama_produk,kategori,satuan,safety_stock,hpp,deskripsi\n" +
                     "PRD-SAMPLE-01,Beras Super Ramos 5Kg,Sembako & Pangan,Sak,20,65000,Kemasan karung tebal anti lembab\n" +
                     "PRD-SAMPLE-02,Minyak Goreng Sawit 2L,Minyak & Lemak,Pouch,30,34000,Karton isi 6 pouch\n" +
                     "PRD-SAMPLE-03,Tepung Terigu Serbaguna 1Kg,Bahan Pokok,Bungkus,25,12500,Kemasan plastik vakum";
    downloadCsvBlob(template, "Template_Master_SKU_SupplySync.csv");
}

function downloadInboundCsvTemplate() {
    const template = "sku,qty,expired_date,batch_code,location_code,supplier_code,notes\n" +
                     "PRD-FEED-01,50,2027-01-31,BTC-DEMO-01,A-01-01,SUP-CJ-01,Penerimaan kontainer mingguan\n" +
                     "PRD-OIL-01,40,2026-11-30,BTC-DEMO-02,B-01-01,SUP-WIL-02,Pallet 2 pasokan utama\n" +
                     "PRD-MEAT-01,35,2026-09-15,BTC-DEMO-03,C-01-01,SUP-CJ-01,Armada berpendingin";
    downloadCsvBlob(template, "Template_Manifest_Inbound_SupplySync.csv");
}

function handleProductCsvFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        document.getElementById('csv-text-products').value = text;
        previewProductCsvText();
    };
    reader.readAsText(file);
}

function previewProductCsvText() {
    const text = document.getElementById('csv-text-products')?.value || '';
    const wrap = document.getElementById('csv-preview-products-wrap');
    const countEl = document.getElementById('csv-preview-products-count');
    const table = document.getElementById('csv-preview-products-table');
    if (!wrap || !table) return;

    const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    const header = lines[0].split(',').map(h => h.trim());
    countEl.innerText = `${lines.length - 1} SKU Terdeteksi di File`;

    const thead = table.querySelector('thead');
    thead.innerHTML = `<tr>${header.map(h => `<th class="p-1">${escapeHtml(h)}</th>`).join('')}</tr>`;

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    lines.slice(1, 5).forEach(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const tr = document.createElement('tr');
        tr.innerHTML = cols.map(c => `<td class="p-1 text-slate-700 truncate max-w-[120px]">${escapeHtml(c)}</td>`).join('');
        tbody.appendChild(tr);
    });
}

async function submitImportProductsCsv() {
    const text = document.getElementById('csv-text-products')?.value || '';
    if (!text.trim()) {
        showToast('Pilih file CSV atau tempel teks terlebih dahulu!', 'warning');
        return;
    }

    const btn = document.getElementById('btn-submit-import-products');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/products/import-csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ csv_data: text })
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(json.message, 'success');
            closeModal('modal-import-products-csv');
            document.getElementById('csv-text-products').value = '';
            document.getElementById('csv-file-products').value = '';
            document.getElementById('csv-preview-products-wrap')?.classList.add('hidden');
            await loadDashboardData();
        } else {
            showToast(json.message || 'Gagal mengimpor produk.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function handleInboundCsvFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        document.getElementById('csv-text-inbound').value = text;
        previewInboundCsvText();
    };
    reader.readAsText(file);
}

function previewInboundCsvText() {
    const text = document.getElementById('csv-text-inbound')?.value || '';
    const wrap = document.getElementById('csv-preview-inbound-wrap');
    const countEl = document.getElementById('csv-preview-inbound-count');
    const table = document.getElementById('csv-preview-inbound-table');
    if (!wrap || !table) return;

    const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    const header = lines[0].split(',').map(h => h.trim());
    countEl.innerText = `${lines.length - 1} Batch Pasokan Terdeteksi`;

    const thead = table.querySelector('thead');
    thead.innerHTML = `<tr>${header.map(h => `<th class="p-1">${escapeHtml(h)}</th>`).join('')}</tr>`;

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    lines.slice(1, 5).forEach(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const tr = document.createElement('tr');
        tr.innerHTML = cols.map(c => `<td class="p-1 text-slate-700 truncate max-w-[120px]">${escapeHtml(c)}</td>`).join('');
        tbody.appendChild(tr);
    });
}

async function submitImportInboundCsv() {
    const text = document.getElementById('csv-text-inbound')?.value || '';
    if (!text.trim()) {
        showToast('Pilih file manifest CSV atau tempel teks terlebih dahulu!', 'warning');
        return;
    }

    const btn = document.getElementById('btn-submit-import-inbound');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/stock/in/import-csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ csv_data: text })
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(json.message, 'success');
            closeModal('modal-import-inbound-csv');
            document.getElementById('csv-text-inbound').value = '';
            document.getElementById('csv-file-inbound').value = '';
            document.getElementById('csv-preview-inbound-wrap')?.classList.add('hidden');
            await loadDashboardData();
        } else {
            showToast(json.message || 'Gagal mengimpor manifest pasokan.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// --------------------------------------------------------------------
// 13. KARTU STOK PERSEDIAAN (STOCK CARD LEDGER)
// --------------------------------------------------------------------
let currentStockCardData = null;

function openStockCardModal(productId, productName) {
    document.getElementById('sc-product-id').value = productId;
    document.getElementById('sc-modal-title').innerText = `Kartu Stok Persediaan: ${productId}`;
    document.getElementById('sc-modal-sub').innerText = productName || 'Laporan Rekonsiliasi Saldo Berjalan';

    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startStr = past.toISOString().split('T')[0];

    document.getElementById('sc-start-date').value = startStr;
    document.getElementById('sc-end-date').value = endStr;

    openModal('modal-stock-card');
    loadStockCardReport();
}

async function loadStockCardReport() {
    const productId = document.getElementById('sc-product-id').value;
    const startDate = document.getElementById('sc-start-date').value;
    const endDate = document.getElementById('sc-end-date').value;

    if (!productId) return;

    const tbody = document.getElementById('sc-ledger-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Menghitung saldo dan memuat mutasi...</td></tr>`;

    let url = `/api/reports/stock-card?product_id=${encodeURIComponent(productId)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;

    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'Success' && json.data) {
            currentStockCardData = json.data;
            const data = json.data;
            const unit = (data.product && data.product.unit) || 'Unit';

            document.getElementById('sc-kpi-beg').innerText = `${data.beginning_balance} ${unit}`;
            document.getElementById('sc-kpi-in').innerText = `+${data.summary.total_in} ${unit}`;
            document.getElementById('sc-kpi-out').innerText = `-${data.summary.total_out + data.summary.total_disposal} ${unit}`;
            document.getElementById('sc-kpi-end').innerText = `${data.ending_balance} ${unit}`;

            tbody.innerHTML = '';
            if (data.movements && data.movements.length > 0) {
                data.movements.forEach(m => {
                    const timeFormatted = new Date(m.created_at).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });

                    const tr = document.createElement('tr');
                    tr.className = 'hover:bg-slate-50 transition border-b border-slate-100 text-xs';
                    tr.innerHTML = `
                        <td class="p-3 font-mono text-slate-600">${timeFormatted}</td>
                        <td class="p-3 font-mono font-bold text-blue-700">${escapeHtml(m.reference_no)}</td>
                        <td class="p-3">
                            <span class="font-bold text-slate-900">${escapeHtml(m.transaction_type)}</span>
                            <span class="text-slate-400 text-[11px] block truncate max-w-xs">${escapeHtml(m.notes)}</span>
                        </td>
                        <td class="p-3 text-right font-bold text-emerald-600">${m.in_quantity > 0 ? '+' + m.in_quantity : '-'}</td>
                        <td class="p-3 text-right font-bold text-rose-600">${m.out_quantity > 0 ? '-' + m.out_quantity : '-'}</td>
                        <td class="p-3 text-right font-extrabold text-slate-900 bg-slate-50/50">${m.balance_after}</td>
                        <td class="p-3 text-center text-slate-600">${escapeHtml(m.operator)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Tidak ada riwayat mutasi transaksi pada rentang tanggal ini.</td></tr>`;
            }
        } else {
            showToast(json.message || 'Gagal memuat kartu stok.', 'error');
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-rose-500">${escapeHtml(json.message || 'Terjadi kesalahan')}</td></tr>`;
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-rose-500">Gagal terhubung ke server.</td></tr>`;
    }
}

function printCurrentStockCard() {
    if (!currentStockCardData) {
        showToast('Muat data kartu stok terlebih dahulu.', 'warning');
        return;
    }
    if (typeof printStockLedger === 'function') {
        printStockLedger(currentStockCardData);
    } else {
        showToast('Modul cetak dokumen belum siap.', 'error');
    }
}

function exportStockCardToCSV() {
    if (!currentStockCardData || !currentStockCardData.product) {
        showToast('Muat data kartu stok terlebih dahulu sebelum ekspor CSV.', 'warning');
        return;
    }

    const productId = currentStockCardData.product.product_id;
    const startDate = document.getElementById('sc-start-date').value;
    const endDate = document.getElementById('sc-end-date').value;

    let downloadUrl = `/api/reports/stock-card?product_id=${encodeURIComponent(productId)}&format=csv`;
    if (startDate) downloadUrl += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) downloadUrl += `&end_date=${encodeURIComponent(endDate)}`;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `KartuStok_${productId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Mengunduh berkas CSV Kartu Stok untuk SKU ${productId}...`, 'success');
}

function openSystemDiagnosticsModal() {
    openModal('modal-system-diagnostics');
    loadSystemDiagnostics();
}

async function loadSystemDiagnostics() {
    const bannerBox = document.getElementById('diag-banner-box');
    const scoreCircle = document.getElementById('diag-score-circle');
    const statusTitle = document.getElementById('diag-status-title');
    const statusBadge = document.getElementById('diag-status-badge');
    const statusDesc = document.getElementById('diag-status-desc');

    const checkDiscrepancy = document.getElementById('diag-check-discrepancy');
    const checkNegative = document.getElementById('diag-check-negative');
    const checkOrphanedBatches = document.getElementById('diag-check-orphaned-batches');
    const checkOrphanedItems = document.getElementById('diag-check-orphaned-items');
    const checkExpired = document.getElementById('diag-check-expired');
    const checkLocations = document.getElementById('diag-check-locations');
    const backupsTbody = document.getElementById('diag-backups-tbody');
    const backupCount = document.getElementById('diag-backup-count');

    try {
        const [healthRes, backupsRes] = await Promise.all([
            fetch('/api/system/health-check'),
            fetch('/api/system/backups')
        ]);

        const healthJson = await healthRes.json();
        const backupsJson = await backupsRes.json();

        if (healthJson.status === 'Success' && healthJson.data) {
            const h = healthJson.data;
            const anomalies = h.anomalies || {};

            scoreCircle.innerText = `${h.score}%`;
            if (h.status === 'HEALTHY') {
                bannerBox.className = 'p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-50/70 border-emerald-200';
                scoreCircle.className = 'w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shadow-sm bg-emerald-600 text-white';
                statusTitle.innerText = 'Sistem & Integritas Data Prima';
                statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200';
                statusBadge.innerText = '100% HEALTHY';
                statusDesc.innerText = `Semua ${h.summary.total_checks} kriteria audit database dan konsistensi stok lolos verifikasi referensial.`;
            } else if (h.status === 'WARNING') {
                bannerBox.className = 'p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 bg-amber-50/70 border-amber-200';
                scoreCircle.className = 'w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shadow-sm bg-amber-500 text-white';
                statusTitle.innerText = 'Peringatan Operasional Terdeteksi';
                statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200';
                statusBadge.innerText = 'WARNING';
                statusDesc.innerText = `Ditemukan ${h.summary.warnings} peringatan non-kritis (batch kedaluwarsa atau tanpa lokasi rak).`;
            } else {
                bannerBox.className = 'p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 bg-rose-50/70 border-rose-200';
                scoreCircle.className = 'w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shadow-sm bg-rose-600 text-white';
                statusTitle.innerText = 'Inkonsistensi Kritis Ditemukan!';
                statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200';
                statusBadge.innerText = 'CRITICAL';
                statusDesc.innerText = `Terdeteksi ${h.summary.critical_issues} anomali integritas (perbedaan stok master vs batch atau kuantitas negatif).`;
            }

            const discCount = anomalies.stock_discrepancies ? anomalies.stock_discrepancies.length : 0;
            checkDiscrepancy.innerText = discCount === 0 ? '0 Selisih (Konsisten)' : `${discCount} Selisih Ditemukan!`;
            checkDiscrepancy.className = `text-sm font-bold mt-1 block ${discCount === 0 ? 'text-emerald-600' : 'text-rose-600'}`;

            const negCount = anomalies.negative_quantities ? anomalies.negative_quantities.length : 0;
            checkNegative.innerText = negCount === 0 ? '0 Terdeteksi (Aman)' : `${negCount} Negatif Ditemukan!`;
            checkNegative.className = `text-sm font-bold mt-1 block ${negCount === 0 ? 'text-emerald-600' : 'text-rose-600'}`;

            const orphanBatchCount = anomalies.orphaned_batches ? anomalies.orphaned_batches.length : 0;
            checkOrphanedBatches.innerText = orphanBatchCount === 0 ? '0 Batch (Valid)' : `${orphanBatchCount} Batch Yatim!`;
            checkOrphanedBatches.className = `text-sm font-bold mt-1 block ${orphanBatchCount === 0 ? 'text-emerald-600' : 'text-rose-600'}`;

            const orphanItemCount = anomalies.orphaned_transaction_items ? anomalies.orphaned_transaction_items.length : 0;
            checkOrphanedItems.innerText = orphanItemCount === 0 ? '0 Item (Valid)' : `${orphanItemCount} Item Yatim!`;
            checkOrphanedItems.className = `text-sm font-bold mt-1 block ${orphanItemCount === 0 ? 'text-emerald-600' : 'text-rose-600'}`;

            const expCount = anomalies.expired_active_batches ? anomalies.expired_active_batches.length : 0;
            checkExpired.innerText = expCount === 0 ? '0 Batch Expired' : `${expCount} Batch Perlu Afkir`;
            checkExpired.className = `text-sm font-bold mt-1 block ${expCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`;

            const locCount = anomalies.unassigned_locations ? anomalies.unassigned_locations.length : 0;
            checkLocations.innerText = locCount === 0 ? '0 Batch Tanpa Rak' : `${locCount} Batch Perlu Rak`;
            checkLocations.className = `text-sm font-bold mt-1 block ${locCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`;
        }

        if (backupsJson.status === 'Success' && backupsJson.data) {
            const list = backupsJson.data.backups || [];
            backupCount.innerText = `${list.length} File Cadangan`;
            backupsTbody.innerHTML = '';

            if (list.length === 0) {
                backupsTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 font-sans">Belum ada berkas cadangan snapshot. Buat cadangan baru sekarang.</td></tr>`;
            } else {
                list.forEach(b => {
                    const tr = document.createElement('tr');
                    tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
                    tr.innerHTML = `
                        <td class="p-2.5 font-bold text-slate-800">${escapeHtml(b.filename)}</td>
                        <td class="p-2.5 text-slate-600">${escapeHtml(b.size_kb)} KB</td>
                        <td class="p-2.5 text-slate-500">${new Date(b.created_at).toLocaleString('id-ID')}</td>
                        <td class="p-2.5 text-right font-sans">
                            <a href="/api/system/backups/${encodeURIComponent(b.filename)}" download class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-semibold text-[10px] inline-flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                Unduh
                            </a>
                        </td>
                    `;
                    backupsTbody.appendChild(tr);
                });
            }
        }
    } catch (err) {
        showToast('Gagal memuat diagnostik sistem: ' + err.message, 'error');
    }
}

async function triggerDatabaseBackup() {
    const btn = document.getElementById('btn-trigger-backup');
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span> Menyimpan...`;

    try {
        const res = await fetch('/api/system/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            }
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(`Cadangan database berhasil dibuat: ${json.data.filename} (${json.data.total_records} record)`, 'success');
            loadSystemDiagnostics();
        } else {
            showToast(json.message || 'Gagal membuat cadangan database.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            Buat Backup Sekarang
        `;
    }
}

// --------------------------------------------------------------------
// 10. MULTI-FACILITY & INTER-WAREHOUSE TRANSFERS MANAGEMENT
// --------------------------------------------------------------------
let currentFacilities = [];
let currentActiveTransfer = null;

async function loadFacilities() {
    try {
        const res = await fetch('/api/facilities');
        const json = await res.json();
        if (json.status === 'Success' && json.data) {
            currentFacilities = json.data;
        }
    } catch (err) {
        console.warn('Gagal memuat daftar fasilitas gudang:', err.message);
    }
}

async function loadTransfersList() {
    const tbody = document.getElementById('transfers-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Memuat mutasi transfer antar-gudang...</td></tr>`;

    const statusFilter = document.getElementById('filter-transfer-status') 
        ? document.getElementById('filter-transfer-status').value 
        : '';

    let url = '/api/transfers';
    if (statusFilter) url += `?status=${encodeURIComponent(statusFilter)}`;

    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'Success' && Array.isArray(json.data)) {
            const list = json.data;

            // Hitung KPI
            let inTransitCount = 0;
            let inTransitUnits = 0;
            let totalSent = 0;
            let totalReceived = 0;
            let totalDiscrepancy = 0;

            list.forEach(t => {
                totalSent += (t.total_sent_quantity || 0);
                totalReceived += (t.total_received_quantity || 0);
                if (t.status === 'IN_TRANSIT') {
                    inTransitCount++;
                    inTransitUnits += (t.total_sent_quantity || 0);
                }
                if (t.status === 'PARTIALLY_RECEIVED') {
                    totalDiscrepancy += Math.max(0, (t.total_sent_quantity || 0) - (t.total_received_quantity || 0));
                }
            });

            if (document.getElementById('stat-trf-transit')) document.getElementById('stat-trf-transit').innerText = `${inTransitCount} Transfer`;
            if (document.getElementById('stat-trf-transit-units')) document.getElementById('stat-trf-transit-units').innerText = `${inTransitUnits} Unit dalam perjalanan`;
            if (document.getElementById('stat-trf-sent')) document.getElementById('stat-trf-sent').innerText = `${totalSent} Unit`;
            if (document.getElementById('stat-trf-received')) document.getElementById('stat-trf-received').innerText = `${totalReceived} Unit`;
            if (document.getElementById('stat-trf-discrepancy')) document.getElementById('stat-trf-discrepancy').innerText = `${totalDiscrepancy} Unit`;

            tbody.innerHTML = '';
            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada catatan transfer antar-gudang.</td></tr>`;
                return;
            }

            list.forEach(t => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition border-b border-slate-100 text-xs';

                let statusBadge = '';
                if (t.status === 'IN_TRANSIT') {
                    statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">IN_TRANSIT</span>`;
                } else if (t.status === 'RECEIVED') {
                    statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">RECEIVED</span>`;
                } else if (t.status === 'PARTIALLY_RECEIVED') {
                    statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">PARTIAL (${t.total_discrepancy} Selisih)</span>`;
                } else if (t.status === 'CANCELLED') {
                    statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">CANCELLED</span>`;
                }

                const sentDate = t.sent_at 
                    ? new Date(t.sent_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
                    : '-';

                let actionBtns = `
                    <button onclick="viewTransferDetail(${t.transfer_id})" class="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="Lihat rincian transfer">
                        Detail
                    </button>
                `;

                if (t.status === 'IN_TRANSIT') {
                    actionBtns += `
                        <button onclick="openReceiveTransferModal(${t.transfer_id})" class="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition" title="Konfirmasi penerimaan barang di gudang tujuan">
                            Terima
                        </button>
                        <button onclick="cancelTransfer(${t.transfer_id}, '${escapeHtml(t.transfer_number)}')" class="px-2 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition" title="Batalkan pengiriman dan kembalikan stok">
                            Batal
                        </button>
                    `;
                }

                tr.innerHTML = `
                    <td class="p-3 font-mono font-bold text-indigo-700">${escapeHtml(t.transfer_number)}</td>
                    <td class="p-3">
                        <span class="font-bold text-slate-900 block">${escapeHtml(t.source_facility_name)}</span>
                        <span class="text-slate-400 text-[10px] flex items-center gap-1">&rarr; Menuju ${escapeHtml(t.destination_facility_name)}</span>
                    </td>
                    <td class="p-3 text-center font-bold text-blue-700">${t.total_sent_quantity} Unit</td>
                    <td class="p-3 text-center font-bold text-emerald-600">${t.total_received_quantity} Unit</td>
                    <td class="p-3 text-center">${statusBadge}</td>
                    <td class="p-3 font-mono text-slate-500">${sentDate}</td>
                    <td class="p-3 text-slate-600">${escapeHtml(t.sender_name || 'Admin')}</td>
                    <td class="p-3 text-right">
                        <div class="flex items-center justify-end gap-1.5">${actionBtns}</div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-500">Gagal memuat transfer: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function openCreateTransferModal() {
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'MANAGER') {
        showToast('Akses ditolak: Staf operasional tidak berwenang menginisiasi transfer antar-gudang (Hanya Admin / Manager).', 'error');
        return;
    }

    await loadFacilities();

    const srcSelect = document.getElementById('trf-source-facility');
    const destSelect = document.getElementById('trf-dest-facility');
    const prodSelect = document.getElementById('trf-product-id');

    if (srcSelect && destSelect) {
        srcSelect.innerHTML = `<option value="">Pilih Gudang Asal...</option>`;
        destSelect.innerHTML = `<option value="">Pilih Gudang Tujuan...</option>`;

        currentFacilities.forEach(f => {
            srcSelect.innerHTML += `<option value="${f.facility_id}">${escapeHtml(f.facility_code)} - ${escapeHtml(f.facility_name)} (${f.city})</option>`;
            destSelect.innerHTML += `<option value="${f.facility_id}">${escapeHtml(f.facility_code)} - ${escapeHtml(f.facility_name)} (${f.city})</option>`;
        });
    }

    if (prodSelect) {
        prodSelect.innerHTML = `<option value="">Pilih Produk...</option>`;
        currentProducts.forEach(p => {
            prodSelect.innerHTML += `<option value="${escapeHtml(p.product_id)}">${escapeHtml(p.product_id)} - ${escapeHtml(p.product_name)} (Stok Total: ${p.total_stock || 0} ${p.unit})</option>`;
        });
    }

    document.getElementById('form-create-transfer').reset();
    openModal('modal-create-transfer');
}

function handleSourceFacilityChange() {
    const srcId = parseInt(document.getElementById('trf-source-facility').value, 10);
    const destSelect = document.getElementById('trf-dest-facility');

    destSelect.innerHTML = `<option value="">Pilih Gudang Tujuan...</option>`;
    currentFacilities.forEach(f => {
        if (f.facility_id !== srcId) {
            destSelect.innerHTML += `<option value="${f.facility_id}">${escapeHtml(f.facility_code)} - ${escapeHtml(f.facility_name)} (${f.city})</option>`;
        }
    });
}

async function handleCreateTransfer(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-submit-transfer');
    btn.disabled = true;

    const sourceFacilityId = document.getElementById('trf-source-facility').value;
    const destFacilityId = document.getElementById('trf-dest-facility').value;
    const productId = document.getElementById('trf-product-id').value;
    const quantity = parseInt(document.getElementById('trf-quantity').value, 10);
    const notes = document.getElementById('trf-notes').value;

    try {
        const res = await fetch('/api/transfers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({
                source_facility_id: sourceFacilityId,
                destination_facility_id: destFacilityId,
                items: [{ product_id: productId, quantity }],
                notes
            })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Transfer #${json.data.transfer_number} berhasil dimulai! Stok kini berstatus IN_TRANSIT.`, 'success');
            closeModal('modal-create-transfer');
            loadTransfersList();
            loadDashboardData();
        } else {
            showToast(json.message || 'Gagal memulai transfer antar-gudang.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function openReceiveTransferModal(transferId) {
    document.getElementById('rcv-transfer-id').value = transferId;
    const tbody = document.getElementById('rcv-items-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Memuat rincian transfer...</td></tr>`;

    try {
        const res = await fetch(`/api/transfers/${transferId}`);
        const json = await res.json();

        if (json.status === 'Success' && json.data) {
            const trf = json.data;
            document.getElementById('rcv-transfer-number').innerText = trf.transfer_number;
            document.getElementById('rcv-route-info').innerText = `${trf.source_facility_name} → ${trf.destination_facility_name}`;

            // Load lokasi gudang tujuan
            const locSelect = document.getElementById('rcv-destination-location');
            locSelect.innerHTML = `<option value="">Pilih Lokasi Rak...</option>`;
            try {
                const locRes = await fetch(`/api/facilities/${trf.destination_facility_id}/locations`);
                const locJson = await locRes.json();
                if (locJson.data && locJson.data.length > 0) {
                    locJson.data.forEach(l => {
                        locSelect.innerHTML += `<option value="${l.location_id}">${escapeHtml(l.location_code)} (${escapeHtml(l.zone_name)} - ${escapeHtml(l.rack)})</option>`;
                    });
                }
            } catch (_) {}

            tbody.innerHTML = '';
            (trf.items || []).forEach(item => {
                const expDate = item.expired_date ? item.expired_date.split('T')[0] : '-';
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-100';
                tr.innerHTML = `
                    <td class="p-2.5">
                        <span class="font-bold text-slate-800 block">${escapeHtml(item.product_name)}</span>
                        <span class="font-mono text-slate-500 text-[10px]">${escapeHtml(item.product_id)} | Batch: ${escapeHtml(item.batch_code || '-')}</span>
                    </td>
                    <td class="p-2.5 text-center font-mono text-[11px]">${expDate}</td>
                    <td class="p-2.5 text-center font-bold text-blue-700">${item.sent_quantity}</td>
                    <td class="p-2.5 text-center">
                        <input type="number" data-item-id="${item.item_id}" data-sent-qty="${item.sent_quantity}" value="${item.sent_quantity}" min="0" max="${item.sent_quantity}" class="rcv-item-qty w-20 text-center bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-bold text-emerald-700 outline-none focus:ring-1 focus:ring-emerald-500">
                    </td>
                    <td class="p-2.5">
                        <input type="text" data-reason-item-id="${item.item_id}" placeholder="Alasan jika rusak / hilang di jalan" class="rcv-item-reason w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-[11px] outline-none focus:ring-1 focus:ring-amber-500">
                    </td>
                `;
                tbody.appendChild(tr);
            });

            openModal('modal-receive-transfer');
        } else {
            showToast(json.message || 'Gagal memuat transfer.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function submitReceiveTransfer() {
    const transferId = document.getElementById('rcv-transfer-id').value;
    const destLocId = document.getElementById('rcv-destination-location').value;
    const notes = document.getElementById('rcv-notes').value;

    const qtyInputs = document.querySelectorAll('.rcv-item-qty');
    const receivedItems = [];

    qtyInputs.forEach(input => {
        const itemId = parseInt(input.getAttribute('data-item-id'), 10);
        const sentQty = parseInt(input.getAttribute('data-sent-qty'), 10);
        const recvQty = parseInt(input.value, 10) || 0;
        const reasonInput = document.querySelector(`.rcv-item-reason[data-reason-item-id="${itemId}"]`);
        const reason = reasonInput ? reasonInput.value.trim() : '';

        receivedItems.push({
            item_id: itemId,
            received_quantity: recvQty,
            destination_location_id: destLocId ? parseInt(destLocId, 10) : null,
            discrepancy_reason: reason || (recvQty < sentQty ? 'Selisih kuantitas saat penerimaan fisik' : null)
        });
    });

    const btn = document.getElementById('btn-submit-receive-trf');
    btn.disabled = true;

    try {
        const res = await fetch(`/api/transfers/${transferId}/receive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({
                received_items: receivedItems,
                notes
            })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Penerimaan transfer berhasil diselesaikan! Status: ${json.data.status}`, 'success');
            closeModal('modal-receive-transfer');
            loadTransfersList();
            loadDashboardData();
        } else {
            showToast(json.message || 'Gagal memproses penerimaan transfer.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function cancelTransfer(transferId, transferNumber) {
    const reason = prompt(`Masukkan alasan pembatalan transfer #${transferNumber}:`, 'Armada truk pengangkut batal diberangkatkan');
    if (!reason) return;

    try {
        const res = await fetch(`/api/transfers/${transferId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({ cancel_reason: reason })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Surat transfer #${transferNumber} berhasil dibatalkan dan stok telah dikembalikan ke gudang asal!`, 'success');
            loadTransfersList();
            loadDashboardData();
        } else {
            showToast(json.message || 'Gagal membatalkan transfer.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    }
}

async function viewTransferDetail(transferId) {
    try {
        const res = await fetch(`/api/transfers/${transferId}`);
        const json = await res.json();

        if (json.status === 'Success' && json.data) {
            currentActiveTransfer = json.data;
            const t = json.data;

            document.getElementById('dtl-transfer-number').innerText = t.transfer_number;
            document.getElementById('dtl-source-facility').innerText = `${t.source_facility_name} (${t.source_facility_code})`;
            document.getElementById('dtl-dest-facility').innerText = `${t.destination_facility_name} (${t.destination_facility_code})`;
            document.getElementById('dtl-qty-info').innerText = `${t.total_sent_quantity} Dikirim / ${t.total_received_quantity} Diterima`;
            document.getElementById('dtl-notes').innerText = t.notes || '-';

            const badge = document.getElementById('dtl-status-badge');
            badge.innerText = t.status;
            if (t.status === 'IN_TRANSIT') badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800';
            else if (t.status === 'RECEIVED') badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800';
            else if (t.status === 'PARTIALLY_RECEIVED') badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800';
            else badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800';

            const cancelBox = document.getElementById('dtl-cancel-box');
            if (t.status === 'CANCELLED') {
                cancelBox.classList.remove('hidden');
                document.getElementById('dtl-cancel-reason').innerText = t.cancel_reason || 'Dibatalkan oleh operator';
            } else {
                cancelBox.classList.add('hidden');
            }

            const tbody = document.getElementById('dtl-items-tbody');
            tbody.innerHTML = '';
            (t.items || []).forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-100';
                tr.innerHTML = `
                    <td class="p-2.5 font-sans">
                        <span class="font-bold text-slate-800 block">${escapeHtml(item.product_name)}</span>
                        <span class="text-slate-400 font-mono text-[10px]">${escapeHtml(item.product_id)}</span>
                    </td>
                    <td class="p-2.5 font-mono text-indigo-700">${escapeHtml(item.batch_code || '-')}</td>
                    <td class="p-2.5 text-center font-mono text-slate-600">${item.expired_date ? item.expired_date.split('T')[0] : '-'}</td>
                    <td class="p-2.5 text-right font-bold text-blue-700">${item.sent_quantity}</td>
                    <td class="p-2.5 text-right font-bold text-emerald-600">${item.received_quantity || 0}</td>
                    <td class="p-2.5 text-right font-bold ${item.discrepancy_quantity > 0 ? 'text-rose-600' : 'text-slate-400'}">
                        ${item.discrepancy_quantity > 0 ? '-' + item.discrepancy_quantity : '0'}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            openModal('modal-transfer-detail');
        }
    } catch (err) {
        showToast('Gagal memuat detail transfer: ' + err.message, 'error');
    }
}

function printCurrentTransferDetail() {
    if (!currentActiveTransfer) {
        showToast('Muat rincian transfer terlebih dahulu.', 'warning');
        return;
    }
    if (typeof printTransferDocument === 'function') {
        printTransferDocument(currentActiveTransfer);
    } else {
        showToast('Modul cetak dokumen belum siap.', 'error');
    }
}

// --------------------------------------------------------------------
// 12. PURCHASE ORDERS (PO) & SALES ORDERS (SO) LIFECYCLE (PHASE 18)
// --------------------------------------------------------------------

function switchOrderSubTab(type) {
    const poSec = document.getElementById('orders-sub-po');
    const soSec = document.getElementById('orders-sub-so');
    const btnPo = document.getElementById('subtab-btn-po');
    const btnSo = document.getElementById('subtab-btn-so');

    if (type === 'po') {
        if (poSec) poSec.classList.remove('hidden');
        if (soSec) soSec.classList.add('hidden');
        if (btnPo) {
            btnPo.className = 'px-4 py-2 rounded-xl font-bold transition bg-white text-blue-700 shadow-xs';
        }
        if (btnSo) {
            btnSo.className = 'px-4 py-2 rounded-xl font-medium text-slate-600 hover:text-slate-900 transition';
        }
        loadPurchaseOrdersList();
    } else {
        if (poSec) poSec.classList.add('hidden');
        if (soSec) soSec.classList.remove('hidden');
        if (btnSo) {
            btnSo.className = 'px-4 py-2 rounded-xl font-bold transition bg-white text-emerald-700 shadow-xs';
        }
        if (btnPo) {
            btnPo.className = 'px-4 py-2 rounded-xl font-medium text-slate-600 hover:text-slate-900 transition';
        }
        loadSalesOrdersList();
    }
}

// --- A. PURCHASE ORDER (PO) HANDLERS ---

async function loadPurchaseOrdersList() {
    const tbody = document.getElementById('po-tbody');
    if (!tbody) return;

    try {
        const filterStatus = document.getElementById('filter-po-status')?.value || '';
        const url = filterStatus ? `/api/orders/purchase?status=${encodeURIComponent(filterStatus)}` : '/api/orders/purchase';
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();

        if (json.status === 'Success') {
            currentPurchaseOrders = json.data || [];
            renderPurchaseOrdersTable(currentPurchaseOrders);

            // KPI Cards Update
            const total = currentPurchaseOrders.length;
            const approved = currentPurchaseOrders.filter(p => p.status === 'APPROVED').length;
            const partial = currentPurchaseOrders.filter(p => p.status === 'PARTIALLY_RECEIVED').length;
            const received = currentPurchaseOrders.filter(p => p.status === 'RECEIVED').length;
            const totalVal = currentPurchaseOrders.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);

            document.getElementById('stat-po-total').innerText = `${total} PO`;
            document.getElementById('stat-po-val').innerText = `Rp ${totalVal.toLocaleString('id-ID')} Total Nilai`;
            document.getElementById('stat-po-approved').innerText = `${approved} PO`;
            document.getElementById('stat-po-partial').innerText = `${partial} PO`;
            document.getElementById('stat-po-received').innerText = `${received} PO`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-500">Gagal memuat PO: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderPurchaseOrdersTable(orders) {
    const tbody = document.getElementById('po-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada dokumen Purchase Order (PO) pada status ini.</td></tr>`;
        return;
    }

    orders.forEach(po => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        let badgeClass = 'bg-slate-100 text-slate-700';
        if (po.status === 'APPROVED') badgeClass = 'bg-emerald-100 text-emerald-800';
        else if (po.status === 'PARTIALLY_RECEIVED') badgeClass = 'bg-amber-100 text-amber-800';
        else if (po.status === 'RECEIVED') badgeClass = 'bg-purple-100 text-purple-800';
        else if (po.status === 'CANCELLED') badgeClass = 'bg-rose-100 text-rose-800';

        const dateStr = po.order_date ? new Date(po.order_date).toLocaleDateString('id-ID') : '-';
        const isManagerOrAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';

        let actionBtns = `
            <button onclick="openPoDetail(${po.po_id})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] transition">
                Detail
            </button>
        `;

        if (po.status === 'DRAFT' && isManagerOrAdmin) {
            actionBtns += `
                <button onclick="approvePurchaseOrder(${po.po_id}, '${escapeHtml(po.po_number)}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-[11px] transition shadow-xs">
                    Setujui
                </button>
            `;
        }

        if (po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') {
            actionBtns += `
                <button onclick="openReceivePoModal(${po.po_id})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-[11px] transition shadow-xs">
                    Terima Masuk
                </button>
            `;
        }

        if ((po.status === 'DRAFT' || po.status === 'APPROVED') && isManagerOrAdmin) {
            actionBtns += `
                <button onclick="cancelPurchaseOrder(${po.po_id}, '${escapeHtml(po.po_number)}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-semibold text-[11px] transition">
                    Batal
                </button>
            `;
        }

        tr.innerHTML = `
            <td class="p-3 font-mono font-bold text-blue-700">${escapeHtml(po.po_number)}</td>
            <td class="p-3 font-medium text-slate-900">${escapeHtml(po.supplier_name)}</td>
            <td class="p-3 text-slate-600">${escapeHtml(po.facility_name)}</td>
            <td class="p-3 text-slate-500">${dateStr}</td>
            <td class="p-3 text-right font-mono font-bold text-slate-900">Rp ${Number(po.total_amount || 0).toLocaleString('id-ID')}</td>
            <td class="p-3 text-center">
                <span class="font-bold text-slate-800">${po.total_received_qty || 0}</span> / <span class="text-slate-400">${po.total_ordered_qty || 0}</span> Unit
            </td>
            <td class="p-3 text-center">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">${po.status}</span>
            </td>
            <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-1.5">${actionBtns}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function openCreatePoModal() {
    if (currentUser.role === 'STAFF') {
        showToast('Akses ditolak: Staf operasional tidak memiliki izin membuat Purchase Order.', 'error');
        return;
    }

    await Promise.all([fetchSuppliers(), loadFacilities(), fetchProducts()]);

    const supSelect = document.getElementById('po-supplier-id');
    const facSelect = document.getElementById('po-facility-id');

    if (supSelect) {
        supSelect.innerHTML = `<option value="">Pilih Vendor / Supplier...</option>`;
        currentSuppliers.forEach(s => {
            supSelect.innerHTML += `<option value="${s.supplier_id}">${escapeHtml(s.supplier_code)} - ${escapeHtml(s.supplier_name)}</option>`;
        });
    }

    if (facSelect) {
        facSelect.innerHTML = `<option value="">Pilih Fasilitas Gudang Tujuan...</option>`;
        currentFacilities.forEach(f => {
            facSelect.innerHTML += `<option value="${f.facility_id}">${escapeHtml(f.facility_code)} - ${escapeHtml(f.facility_name)} (${f.city})</option>`;
        });
    }

    const tbody = document.getElementById('po-items-table-body');
    if (tbody) tbody.innerHTML = '';
    addPoItemRow();

    document.getElementById('form-create-po').reset();
    recalculatePoTotal();
    openModal('modal-create-po');
}

function addPoItemRow() {
    const tbody = document.getElementById('po-items-table-body');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.className = 'po-item-row';

    const optionsHtml = currentProducts.map(p => `
        <option value="${escapeHtml(p.product_id)}" data-cost="${p.cost_price || 0}">
            ${escapeHtml(p.product_id)} - ${escapeHtml(p.product_name)} (${escapeHtml(p.unit)})
        </option>
    `).join('');

    tr.innerHTML = `
        <td class="p-1.5">
            <select class="po-prod-select w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs outline-none" onchange="onPoProductSelectChange(this)">
                <option value="">Pilih Produk SKU...</option>
                ${optionsHtml}
            </select>
        </td>
        <td class="p-1.5">
            <input type="number" min="1" value="1" class="po-qty-input w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-right outline-none font-bold" oninput="recalculatePoTotal()">
        </td>
        <td class="p-1.5">
            <input type="number" min="0" step="1000" value="0" class="po-cost-input w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-right outline-none font-mono" oninput="recalculatePoTotal()">
        </td>
        <td class="p-1.5 text-right font-mono font-bold text-slate-800 po-subtotal-cell">
            Rp 0
        </td>
        <td class="p-1.5 text-center">
            <button type="button" onclick="removePoItemRow(this)" class="text-rose-500 hover:text-rose-700 font-bold text-sm">&times;</button>
        </td>
    `;
    tbody.appendChild(tr);
}

function onPoProductSelectChange(selectElem) {
    const tr = selectElem.closest('tr');
    const selectedOption = selectElem.options[selectElem.selectedIndex];
    const defaultCost = selectedOption.getAttribute('data-cost') || 0;
    const costInput = tr.querySelector('.po-cost-input');
    if (costInput && Number(costInput.value) === 0) {
        costInput.value = defaultCost;
    }
    recalculatePoTotal();
}

function removePoItemRow(btn) {
    const tr = btn.closest('tr');
    const tbody = document.getElementById('po-items-table-body');
    if (tbody.querySelectorAll('tr').length > 1) {
        tr.remove();
        recalculatePoTotal();
    } else {
        showToast('Minimal harus ada satu item pada Purchase Order.', 'warning');
    }
}

function recalculatePoTotal() {
    let grandTotal = 0;
    const rows = document.querySelectorAll('.po-item-row');

    rows.forEach(row => {
        const qty = parseInt(row.querySelector('.po-qty-input')?.value || 0, 10);
        const cost = parseFloat(row.querySelector('.po-cost-input')?.value || 0);
        const subtotal = Math.max(0, qty) * Math.max(0, cost);
        grandTotal += subtotal;

        const subtotalCell = row.querySelector('.po-subtotal-cell');
        if (subtotalCell) {
            subtotalCell.innerText = `Rp ${subtotal.toLocaleString('id-ID')}`;
        }
    });

    const display = document.getElementById('po-total-calc-display');
    if (display) {
        display.innerText = `Rp ${grandTotal.toLocaleString('id-ID')}`;
    }
}

async function handleCreatePurchaseOrder(event) {
    event.preventDefault();

    const supplierId = document.getElementById('po-supplier-id').value;
    const facilityId = document.getElementById('po-facility-id').value;
    const expectedDate = document.getElementById('po-expected-date').value;
    const notes = document.getElementById('po-notes').value;

    const rows = document.querySelectorAll('.po-item-row');
    const items = [];

    rows.forEach(r => {
        const prodId = r.querySelector('.po-prod-select')?.value;
        const qty = parseInt(r.querySelector('.po-qty-input')?.value, 10);
        const cost = parseFloat(r.querySelector('.po-cost-input')?.value);

        if (prodId && qty > 0) {
            items.push({
                product_id: prodId,
                ordered_quantity: qty,
                unit_cost: isNaN(cost) ? 0 : cost
            });
        }
    });

    if (items.length === 0) {
        showToast('Wajib memasukkan setidaknya 1 item produk pada Purchase Order.', 'error');
        return;
    }

    const btn = document.getElementById('btn-submit-po');
    btn.disabled = true;

    try {
        const res = await fetch('/api/orders/purchase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({
                supplier_id: supplierId,
                facility_id: facilityId,
                expected_delivery_date: expectedDate || null,
                notes,
                items
            })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Purchase Order #${json.data.po_number} berhasil dibuat!`, 'success');
            closeModal('modal-create-po');
            loadPurchaseOrdersList();
        } else {
            showToast(json.message || 'Gagal membuat PO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function approvePurchaseOrder(poId, poNumber) {
    if (!confirm(`Apakah Anda yakin ingin menyetujui Purchase Order #${poNumber}?`)) return;

    try {
        const res = await fetch(`/api/orders/purchase/${poId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(`PO #${poNumber} berhasil disetujui (Status: APPROVED)!`, 'success');
            loadPurchaseOrdersList();
        } else {
            showToast(json.message || 'Gagal menyetujui PO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    }
}

async function openReceivePoModal(poId) {
    try {
        const res = await fetch(`/api/orders/purchase/${poId}`, {
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();

        if (json.status !== 'Success' || !json.data) {
            showToast('Gagal memuat rincian PO.', 'error');
            return;
        }

        const po = json.data;
        selectedPoDetail = po;

        document.getElementById('rcv-po-id').value = po.po_id;
        document.getElementById('rcv-po-number').innerText = po.po_number;
        document.getElementById('rcv-po-supplier').innerText = po.supplier_name;
        document.getElementById('rcv-po-facility').innerText = po.facility_name;

        await fetchLocations();

        const tbody = document.getElementById('rcv-po-items-tbody');
        tbody.innerHTML = '';

        const locationOptions = currentLocations.map(l => `
            <option value="${l.location_id}">${escapeHtml(l.location_code)} (${escapeHtml(l.zone_name)})</option>
        `).join('');

        const defaultExp = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0];

        po.items.forEach(it => {
            const remaining = it.ordered_quantity - it.received_quantity;
            if (remaining <= 0) return;

            const tr = document.createElement('tr');
            tr.className = 'rcv-po-item-row';
            tr.setAttribute('data-product-id', it.product_id);

            tr.innerHTML = `
                <td class="p-2.5 font-bold text-slate-900">
                    <div>${escapeHtml(it.product_name)}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(it.product_id)} &bull; ${escapeHtml(it.unit)}</div>
                </td>
                <td class="p-2.5 text-center font-bold text-amber-600">
                    ${remaining}
                </td>
                <td class="p-2.5 text-center">
                    <input type="number" min="0" max="${remaining}" value="${remaining}" class="rcv-po-qty-input w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs text-center font-bold outline-none">
                </td>
                <td class="p-2.5">
                    <select class="rcv-po-loc-select w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs outline-none">
                        ${locationOptions}
                    </select>
                </td>
                <td class="p-2.5">
                    <input type="date" value="${defaultExp}" class="rcv-po-exp-input w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs outline-none">
                </td>
            `;
            tbody.appendChild(tr);
        });

        openModal('modal-receive-po');
    } catch (err) {
        showToast('Gagal membuka modal penerimaan PO: ' + err.message, 'error');
    }
}

async function submitReceivePurchaseOrder() {
    const poId = document.getElementById('rcv-po-id').value;
    const notes = document.getElementById('rcv-po-notes').value;
    const rows = document.querySelectorAll('.rcv-po-item-row');
    const items = [];

    rows.forEach(r => {
        const prodId = r.getAttribute('data-product-id');
        const qty = parseInt(r.querySelector('.rcv-po-qty-input')?.value, 10);
        const locId = r.querySelector('.rcv-po-loc-select')?.value;
        const expDate = r.querySelector('.rcv-po-exp-input')?.value;

        if (prodId && qty > 0) {
            items.push({
                product_id: prodId,
                received_quantity: qty,
                location_id: locId,
                expired_date: expDate
            });
        }
    });

    if (items.length === 0) {
        showToast('Tidak ada kuantitas barang yang diterima (Kuantitas > 0).', 'warning');
        return;
    }

    const btn = document.getElementById('btn-submit-receive-po');
    btn.disabled = true;

    try {
        const res = await fetch(`/api/orders/purchase/${poId}/receive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({ items, notes })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Penerimaan barang PO berhasil diproses! Status PO: ${json.data.status}`, 'success');
            closeModal('modal-receive-po');
            loadPurchaseOrdersList();
            loadDashboardData();
        } else {
            showToast(json.message || 'Gagal memproses penerimaan PO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function openPoDetail(poId) {
    try {
        const res = await fetch(`/api/orders/purchase/${poId}`, {
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();
        if (json.status !== 'Success' || !json.data) return;

        const po = json.data;
        selectedPoDetail = po;

        document.getElementById('dtl-po-number').innerText = po.po_number;
        document.getElementById('dtl-po-supplier').innerText = `${po.supplier_name} (${po.supplier_code})`;
        document.getElementById('dtl-po-facility').innerText = `${po.facility_name} (${po.facility_code})`;
        document.getElementById('dtl-po-date').innerText = po.order_date ? new Date(po.order_date).toLocaleDateString('id-ID') : '-';
        document.getElementById('dtl-po-total').innerText = `Rp ${Number(po.total_amount || 0).toLocaleString('id-ID')}`;
        document.getElementById('dtl-po-creator').innerText = po.created_by_name || '-';
        document.getElementById('dtl-po-notes').innerText = po.notes || '-';

        let badgeClass = 'bg-slate-100 text-slate-700';
        if (po.status === 'APPROVED') badgeClass = 'bg-emerald-100 text-emerald-800';
        else if (po.status === 'PARTIALLY_RECEIVED') badgeClass = 'bg-amber-100 text-amber-800';
        else if (po.status === 'RECEIVED') badgeClass = 'bg-purple-100 text-purple-800';
        else if (po.status === 'CANCELLED') badgeClass = 'bg-rose-100 text-rose-800';

        document.getElementById('dtl-po-status-badge').className = `px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`;
        document.getElementById('dtl-po-status-badge').innerText = po.status;

        const tbody = document.getElementById('dtl-po-items-tbody');
        tbody.innerHTML = (po.items || []).map(it => `
            <tr>
                <td class="p-2.5">
                    <div class="font-bold text-slate-900">${escapeHtml(it.product_name)}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(it.product_id)} &bull; ${escapeHtml(it.unit)}</div>
                </td>
                <td class="p-2.5 text-right font-bold text-slate-800">${it.ordered_quantity}</td>
                <td class="p-2.5 text-right font-bold ${it.received_quantity >= it.ordered_quantity ? 'text-emerald-600' : 'text-amber-600'}">${it.received_quantity}</td>
                <td class="p-2.5 text-right font-mono text-slate-600">Rp ${Number(it.unit_cost || 0).toLocaleString('id-ID')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-slate-900">Rp ${(Number(it.ordered_quantity || 0) * Number(it.unit_cost || 0)).toLocaleString('id-ID')}</td>
            </tr>
        `).join('');

        openModal('modal-po-detail');
    } catch (err) {
        showToast('Gagal memuat detail PO: ' + err.message, 'error');
    }
}

function printCurrentPoDocument() {
    if (!selectedPoDetail) return;
    if (typeof printPurchaseOrderDocument === 'function') {
        printPurchaseOrderDocument(selectedPoDetail);
    } else {
        showToast('Modul cetak dokumen PO belum tersedia.', 'error');
    }
}

async function cancelPurchaseOrder(poId, poNumber) {
    const reason = prompt(`Masukkan alasan pembatalan Purchase Order #${poNumber}:`, 'Pemasok tidak sanggup memenuhi jadwal pengiriman');
    if (!reason) return;

    try {
        const res = await fetch(`/api/orders/purchase/${poId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({ cancel_reason: reason })
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(`PO #${poNumber} berhasil dibatalkan.`, 'success');
            loadPurchaseOrdersList();
        } else {
            showToast(json.message || 'Gagal membatalkan PO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    }
}

// --- B. SALES ORDER (SO) HANDLERS ---

async function loadSalesOrdersList() {
    const tbody = document.getElementById('so-tbody');
    if (!tbody) return;

    try {
        const filterStatus = document.getElementById('filter-so-status')?.value || '';
        const url = filterStatus ? `/api/orders/sales?status=${encodeURIComponent(filterStatus)}` : '/api/orders/sales';
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();

        if (json.status === 'Success') {
            currentSalesOrders = json.data || [];
            renderSalesOrdersTable(currentSalesOrders);

            // KPI Cards Update
            const total = currentSalesOrders.length;
            const confirmed = currentSalesOrders.filter(s => s.status === 'CONFIRMED').length;
            const dispatched = currentSalesOrders.filter(s => s.status === 'DISPATCHED').length;
            const cancelled = currentSalesOrders.filter(s => s.status === 'CANCELLED').length;
            const totalVal = currentSalesOrders.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

            document.getElementById('stat-so-total').innerText = `${total} SO`;
            document.getElementById('stat-so-val').innerText = `Rp ${totalVal.toLocaleString('id-ID')} Omzet`;
            document.getElementById('stat-so-confirmed').innerText = `${confirmed} SO`;
            document.getElementById('stat-so-dispatched').innerText = `${dispatched} SO`;
            document.getElementById('stat-so-cancelled').innerText = `${cancelled} SO`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-500">Gagal memuat SO: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderSalesOrdersTable(orders) {
    const tbody = document.getElementById('so-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada dokumen Sales Order (SO) pada status ini.</td></tr>`;
        return;
    }

    orders.forEach(so => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        let badgeClass = 'bg-slate-100 text-slate-700';
        if (so.status === 'CONFIRMED') badgeClass = 'bg-blue-100 text-blue-800';
        else if (so.status === 'DISPATCHED') badgeClass = 'bg-emerald-100 text-emerald-800';
        else if (so.status === 'CANCELLED') badgeClass = 'bg-rose-100 text-rose-800';

        const dateStr = so.order_date ? new Date(so.order_date).toLocaleDateString('id-ID') : '-';
        const isManagerOrAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';

        let actionBtns = `
            <button onclick="openSoDetail(${so.so_id})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] transition">
                Detail
            </button>
        `;

        if (so.status === 'DRAFT' && isManagerOrAdmin) {
            actionBtns += `
                <button onclick="confirmSalesOrder(${so.so_id}, '${escapeHtml(so.so_number)}')" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-[11px] transition shadow-xs">
                    Konfirmasi
                </button>
            `;
        }

        if (so.status === 'CONFIRMED') {
            actionBtns += `
                <button onclick="dispatchSalesOrder(${so.so_id}, '${escapeHtml(so.so_number)}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-[11px] transition shadow-xs">
                    Dispatch FEFO
                </button>
            `;
        }

        if ((so.status === 'DRAFT' || so.status === 'CONFIRMED') && isManagerOrAdmin) {
            actionBtns += `
                <button onclick="cancelSalesOrder(${so.so_id}, '${escapeHtml(so.so_number)}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-semibold text-[11px] transition">
                    Batal
                </button>
            `;
        }

        tr.innerHTML = `
            <td class="p-3 font-mono font-bold text-emerald-700">${escapeHtml(so.so_number)}</td>
            <td class="p-3 font-medium text-slate-900">${escapeHtml(so.customer_name)}</td>
            <td class="p-3 text-slate-600">${escapeHtml(so.facility_name)}</td>
            <td class="p-3 text-slate-500">${dateStr}</td>
            <td class="p-3 text-right font-mono font-bold text-slate-900">Rp ${Number(so.total_amount || 0).toLocaleString('id-ID')}</td>
            <td class="p-3 text-center font-bold text-slate-800">${so.total_requested_qty || 0} Unit</td>
            <td class="p-3 text-center">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">${so.status}</span>
            </td>
            <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-1.5">${actionBtns}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function openCreateSoModal() {
    if (currentUser.role === 'STAFF') {
        showToast('Akses ditolak: Staf operasional tidak memiliki izin membuat Sales Order.', 'error');
        return;
    }

    await Promise.all([loadFacilities(), fetchProducts()]);

    const facSelect = document.getElementById('so-facility-id');
    if (facSelect) {
        facSelect.innerHTML = `<option value="">Pilih Gudang Asal Pengiriman...</option>`;
        currentFacilities.forEach(f => {
            facSelect.innerHTML += `<option value="${f.facility_id}">${escapeHtml(f.facility_code)} - ${escapeHtml(f.facility_name)} (${f.city})</option>`;
        });
    }

    const tbody = document.getElementById('so-items-table-body');
    if (tbody) tbody.innerHTML = '';
    addSoItemRow();

    document.getElementById('form-create-so').reset();
    recalculateSoTotal();
    openModal('modal-create-so');
}

function addSoItemRow() {
    const tbody = document.getElementById('so-items-table-body');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.className = 'so-item-row';

    const optionsHtml = currentProducts.map(p => `
        <option value="${escapeHtml(p.product_id)}" data-price="${(p.cost_price || 0) * 1.25}">
            ${escapeHtml(p.product_id)} - ${escapeHtml(p.product_name)} (Stok: ${p.total_stock || 0} ${escapeHtml(p.unit)})
        </option>
    `).join('');

    tr.innerHTML = `
        <td class="p-1.5">
            <select class="so-prod-select w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs outline-none" onchange="onSoProductSelectChange(this)">
                <option value="">Pilih Produk SKU...</option>
                ${optionsHtml}
            </select>
        </td>
        <td class="p-1.5">
            <input type="number" min="1" value="1" class="so-qty-input w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-right outline-none font-bold" oninput="recalculateSoTotal()">
        </td>
        <td class="p-1.5">
            <input type="number" min="0" step="1000" value="0" class="so-price-input w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-right outline-none font-mono" oninput="recalculateSoTotal()">
        </td>
        <td class="p-1.5 text-right font-mono font-bold text-slate-800 so-subtotal-cell">
            Rp 0
        </td>
        <td class="p-1.5 text-center">
            <button type="button" onclick="removeSoItemRow(this)" class="text-rose-500 hover:text-rose-700 font-bold text-sm">&times;</button>
        </td>
    `;
    tbody.appendChild(tr);
}

function onSoProductSelectChange(selectElem) {
    const tr = selectElem.closest('tr');
    const selectedOption = selectElem.options[selectElem.selectedIndex];
    const defaultPrice = selectedOption.getAttribute('data-price') || 0;
    const priceInput = tr.querySelector('.so-price-input');
    if (priceInput && Number(priceInput.value) === 0) {
        priceInput.value = Math.round(Number(defaultPrice));
    }
    recalculateSoTotal();
}

function removeSoItemRow(btn) {
    const tr = btn.closest('tr');
    const tbody = document.getElementById('so-items-table-body');
    if (tbody.querySelectorAll('tr').length > 1) {
        tr.remove();
        recalculateSoTotal();
    } else {
        showToast('Minimal harus ada satu item pada Sales Order.', 'warning');
    }
}

function recalculateSoTotal() {
    let grandTotal = 0;
    const rows = document.querySelectorAll('.so-item-row');

    rows.forEach(row => {
        const qty = parseInt(row.querySelector('.so-qty-input')?.value || 0, 10);
        const price = parseFloat(row.querySelector('.so-price-input')?.value || 0);
        const subtotal = Math.max(0, qty) * Math.max(0, price);
        grandTotal += subtotal;

        const subtotalCell = row.querySelector('.so-subtotal-cell');
        if (subtotalCell) {
            subtotalCell.innerText = `Rp ${subtotal.toLocaleString('id-ID')}`;
        }
    });

    const display = document.getElementById('so-total-calc-display');
    if (display) {
        display.innerText = `Rp ${grandTotal.toLocaleString('id-ID')}`;
    }
}

async function handleCreateSalesOrder(event) {
    event.preventDefault();

    const customerName = document.getElementById('so-customer-name').value;
    const customerPhone = document.getElementById('so-customer-phone').value;
    const customerAddress = document.getElementById('so-customer-address').value;
    const facilityId = document.getElementById('so-facility-id').value;
    const deliveryDate = document.getElementById('so-delivery-date').value;
    const notes = document.getElementById('so-notes').value;

    const rows = document.querySelectorAll('.so-item-row');
    const items = [];

    rows.forEach(r => {
        const prodId = r.querySelector('.so-prod-select')?.value;
        const qty = parseInt(r.querySelector('.so-qty-input')?.value, 10);
        const price = parseFloat(r.querySelector('.so-price-input')?.value);

        if (prodId && qty > 0) {
            items.push({
                product_id: prodId,
                requested_quantity: qty,
                unit_price: isNaN(price) ? 0 : price
            });
        }
    });

    if (items.length === 0) {
        showToast('Wajib memasukkan setidaknya 1 item produk pada Sales Order.', 'error');
        return;
    }

    const btn = document.getElementById('btn-submit-so');
    btn.disabled = true;

    try {
        const res = await fetch('/api/orders/sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({
                facility_id: facilityId,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_address: customerAddress,
                delivery_date: deliveryDate || null,
                notes,
                items
            })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Sales Order #${json.data.so_number} berhasil dibuat!`, 'success');
            closeModal('modal-create-so');
            loadSalesOrdersList();
        } else {
            showToast(json.message || 'Gagal membuat SO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function confirmSalesOrder(soId, soNumber) {
    if (!confirm(`Konfirmasi Sales Order #${soNumber}?`)) return;

    try {
        const res = await fetch(`/api/orders/sales/${soId}/confirm`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(`SO #${soNumber} berhasil dikonfirmasi (Status: CONFIRMED)!`, 'success');
            loadSalesOrdersList();
        } else {
            showToast(json.message || 'Gagal mengonfirmasi SO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    }
}

async function dispatchSalesOrder(soId, soNumber) {
    if (!confirm(`Apakah armada pengiriman siap? Tindakan ini akan memotong stok di rak gudang secara otomatis berdasarkan prioritas FEFO untuk SO #${soNumber}.`)) return;

    try {
        const res = await fetch(`/api/orders/sales/${soId}/dispatch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({ notes: 'Pengiriman pesanan terjadwal' })
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(`SO #${soNumber} berhasil dikirim! Alokasi stok FEFO telah terpotong.`, 'success');
            loadSalesOrdersList();
            loadDashboardData();
        } else {
            showToast(json.message || 'Gagal memproses dispatch SO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    }
}

async function openSoDetail(soId) {
    try {
        const res = await fetch(`/api/orders/sales/${soId}`, {
            headers: { 'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}` }
        });
        const json = await res.json();
        if (json.status !== 'Success' || !json.data) return;

        const so = json.data;
        selectedSoDetail = so;

        document.getElementById('dtl-so-number').innerText = so.so_number;
        document.getElementById('dtl-so-customer').innerText = `${so.customer_name} (${so.customer_phone || '-'})`;
        document.getElementById('dtl-so-facility').innerText = `${so.facility_name} (${so.facility_code})`;
        document.getElementById('dtl-so-date').innerText = so.order_date ? new Date(so.order_date).toLocaleDateString('id-ID') : '-';
        document.getElementById('dtl-so-total').innerText = `Rp ${Number(so.total_amount || 0).toLocaleString('id-ID')}`;
        document.getElementById('dtl-so-delivery').innerText = so.delivery_date ? new Date(so.delivery_date).toLocaleDateString('id-ID') : 'Segera';
        document.getElementById('dtl-so-address').innerText = so.customer_address || '-';
        document.getElementById('dtl-so-notes').innerText = so.notes || '-';

        let badgeClass = 'bg-slate-100 text-slate-700';
        if (so.status === 'CONFIRMED') badgeClass = 'bg-blue-100 text-blue-800';
        else if (so.status === 'DISPATCHED') badgeClass = 'bg-emerald-100 text-emerald-800';
        else if (so.status === 'CANCELLED') badgeClass = 'bg-rose-100 text-rose-800';

        document.getElementById('dtl-so-status-badge').className = `px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`;
        document.getElementById('dtl-so-status-badge').innerText = so.status;

        const tbody = document.getElementById('dtl-so-items-tbody');
        tbody.innerHTML = (so.items || []).map(it => `
            <tr>
                <td class="p-2.5">
                    <div class="font-bold text-slate-900">${escapeHtml(it.product_name)}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(it.product_id)} &bull; ${escapeHtml(it.unit)}</div>
                </td>
                <td class="p-2.5 text-right font-bold text-slate-800">${it.requested_quantity}</td>
                <td class="p-2.5 text-right font-mono text-slate-600">Rp ${Number(it.unit_price || 0).toLocaleString('id-ID')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-slate-900">Rp ${(Number(it.requested_quantity || 0) * Number(it.unit_price || 0)).toLocaleString('id-ID')}</td>
            </tr>
        `).join('');

        openModal('modal-so-detail');
    } catch (err) {
        showToast('Gagal memuat detail SO: ' + err.message, 'error');
    }
}

function printCurrentSoDocument() {
    if (!selectedSoDetail) return;
    if (typeof printSalesOrderDocument === 'function') {
        printSalesOrderDocument(selectedSoDetail);
    } else {
        showToast('Modul cetak dokumen SO belum tersedia.', 'error');
    }
}

async function cancelSalesOrder(soId, soNumber) {
    const reason = prompt(`Masukkan alasan pembatalan Sales Order #${soNumber}:`, 'Pelanggan membatalkan pesanan');
    if (!reason) return;

    try {
        const res = await fetch(`/api/orders/sales/${soId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({ cancel_reason: reason })
        });
        const json = await res.json();

        if (json.status === 'Success') {
            showToast(`SO #${soNumber} berhasil dibatalkan.`, 'success');
            loadSalesOrdersList();
        } else {
            showToast(json.message || 'Gagal membatalkan SO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    }
}

// ====================================================================
// 21. REPLENISHMENT AUTOMATION & BATCH AGING ANALYTICS (PHASE 19)
// ====================================================================

function switchReplenishmentSubtab(subtab) {
    const reorderBtn = document.getElementById('rep-subtab-reorder-btn');
    const agingBtn = document.getElementById('rep-subtab-aging-btn');
    const reorderContent = document.getElementById('rep-subtab-reorder');
    const agingContent = document.getElementById('rep-subtab-aging');

    if (subtab === 'reorder') {
        if (reorderBtn) reorderBtn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 border-amber-600 text-amber-700 transition';
        if (agingBtn) agingBtn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition';
        if (reorderContent) reorderContent.classList.remove('hidden');
        if (agingContent) agingContent.classList.add('hidden');
    } else {
        if (reorderBtn) reorderBtn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition';
        if (agingBtn) agingBtn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 border-amber-600 text-amber-700 transition';
        if (reorderContent) reorderContent.classList.add('hidden');
        if (agingContent) agingContent.classList.remove('hidden');
    }
}

async function loadReplenishmentData() {
    const facilitySelect = document.getElementById('rep-filter-facility');
    const facilityId = facilitySelect ? facilitySelect.value : '';

    if (facilitySelect && facilitySelect.options.length <= 1 && currentFacilities && currentFacilities.length > 0) {
        currentFacilities.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.facility_id;
            opt.textContent = `${f.facility_code} - ${f.facility_name}`;
            facilitySelect.appendChild(opt);
        });
    }

    const token = authToken || localStorage.getItem('supplysync_token') || '';
    const headers = { 'Authorization': `Bearer ${token}` };

    const alertsUrl = facilityId ? `/api/replenishment/alerts?facility_id=${encodeURIComponent(facilityId)}` : '/api/replenishment/alerts';
    const agingUrl = facilityId ? `/api/replenishment/batch-aging?facility_id=${encodeURIComponent(facilityId)}` : '/api/replenishment/batch-aging';

    try {
        const [alertsRes, agingRes] = await Promise.all([
            fetch(alertsUrl, { headers }).then(r => r.json()).catch(() => ({ status: 'Error', data: null })),
            fetch(agingUrl, { headers }).then(r => r.json()).catch(() => ({ status: 'Error', data: null }))
        ]);

        if (alertsRes && alertsRes.status === 'Success' && alertsRes.data) {
            currentReplenishmentAlerts = alertsRes.data.alerts || [];
            const summary = alertsRes.data.summary || {};

            const ovwReorder = document.getElementById('ovw-stat-reorder-count');
            const ovwPipeline = document.getElementById('ovw-stat-pipeline-count');
            if (ovwReorder) ovwReorder.innerText = `${summary.total_low_stock || 0} SKU`;
            if (ovwPipeline) ovwPipeline.innerText = `${summary.total_po_in_pipeline || 0} SKU`;

            const kpiReorder = document.getElementById('rep-kpi-reorder-count');
            const kpiReorderSub = document.getElementById('rep-kpi-reorder-sub');
            const kpiPipeline = document.getElementById('rep-kpi-pipeline-count');
            const budgetPill = document.getElementById('rep-table-budget-pill');

            if (kpiReorder) kpiReorder.innerText = `${summary.total_low_stock || 0} SKU`;
            if (kpiReorderSub) kpiReorderSub.innerText = `${summary.total_critical_stockout || 0} berisiko habis sebelum tiba`;
            if (kpiPipeline) kpiPipeline.innerText = `${summary.total_po_in_pipeline || 0} SKU`;
            if (budgetPill) budgetPill.innerText = `Estimasi Anggaran: ${summary.formatted_reorder_budget || 'Rp 0'}`;

            const badge = document.getElementById('badge-replenishment-alert');
            if (badge) {
                if ((summary.total_low_stock || 0) > 0) {
                    badge.innerText = summary.total_low_stock;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }

            renderReplenishmentAlertsTable(currentReplenishmentAlerts);
        }

        if (agingRes && agingRes.status === 'Success' && agingRes.data) {
            currentBatchAgingData = agingRes.data;
            const agingSum = agingRes.data.summary || {};

            const ovwCritical = document.getElementById('ovw-stat-critical-count');
            const ovwRiskVal = document.getElementById('ovw-stat-risk-val');
            const totalCriticalBatches = (agingRes.data.tiers?.EXPIRED?.count || 0) + (agingRes.data.tiers?.CRITICAL?.count || 0);

            if (ovwCritical) ovwCritical.innerText = `${totalCriticalBatches} Batch`;
            if (ovwRiskVal) ovwRiskVal.innerText = agingSum.formatted_risk_value || 'Rp 0';

            const kpiCritical = document.getElementById('rep-kpi-critical-count');
            const kpiRiskValue = document.getElementById('rep-kpi-risk-value');
            if (kpiCritical) kpiCritical.innerText = `${totalCriticalBatches} Batch`;
            if (kpiRiskValue) kpiRiskValue.innerText = agingSum.formatted_risk_value || 'Rp 0';

            renderBatchAgingView(currentBatchAgingData);
        }
    } catch (err) {
        console.warn('Gagal memuat data replenishment & aging:', err.message);
    }
}

function renderReplenishmentAlertsTable(alerts) {
    const tbody = document.getElementById('rep-reorder-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!alerts || alerts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400">Seluruh stok inventaris berada pada tingkat aman (&gt; min_stock).</td></tr>`;
        return;
    }

    alerts.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        let statusBadge = '';
        if (item.reorder_status === 'OUT_OF_STOCK') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">Habis Total</span>`;
        } else if (item.reorder_status === 'REORDER_REQUIRED') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Perlu Reorder</span>`;
        } else if (item.reorder_status === 'PO_IN_PIPELINE') {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">PO On-Order</span>`;
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Aman</span>`;
        }

        let riskBadge = '';
        if (item.stockout_risk === 'CRITICAL') {
            riskBadge = `<span class="text-rose-600 font-bold block text-[10px]">&bull; Kritis (${item.days_to_stockout} hari lagi)</span>`;
        } else if (item.stockout_risk === 'HIGH') {
            riskBadge = `<span class="text-amber-600 font-bold block text-[10px]">&bull; Waspada (${item.days_to_stockout} hari lagi)</span>`;
        } else if (item.days_to_stockout !== null) {
            riskBadge = `<span class="text-slate-500 block text-[10px]">&bull; ${item.days_to_stockout} hari lagi</span>`;
        } else {
            riskBadge = `<span class="text-slate-400 block text-[10px]">&bull; Stabil</span>`;
        }

        const supplierName = item.preferred_supplier ? escapeHtml(item.preferred_supplier.supplier_name) : '-';
        const leadTime = item.preferred_supplier ? `${item.preferred_supplier.lead_time_days || 7} hari` : '7 hari';

        tr.innerHTML = `
            <td class="p-3.5 font-mono font-bold text-slate-800">${escapeHtml(item.product_id)}</td>
            <td class="p-3.5">
                <span class="font-bold text-slate-900 block">${escapeHtml(item.product_name)}</span>
                <span class="text-[10px] text-slate-400">${escapeHtml(item.category)} &bull; ${escapeHtml(item.unit)}</span>
            </td>
            <td class="p-3.5 text-right font-extrabold ${item.total_stock <= item.min_stock ? 'text-rose-600' : 'text-slate-800'}">${item.total_stock}</td>
            <td class="p-3.5 text-right text-slate-500 font-semibold">${item.min_stock}</td>
            <td class="p-3.5 text-right font-bold text-blue-600">${item.on_order_qty > 0 ? `+${item.on_order_qty}` : '0'}</td>
            <td class="p-3.5 text-right font-black ${item.recommended_reorder_qty > 0 ? 'text-amber-600' : 'text-slate-400'}">
                ${item.recommended_reorder_qty > 0 ? `${item.recommended_reorder_qty} ${escapeHtml(item.unit)}` : '-'}
            </td>
            <td class="p-3.5">
                <span class="font-semibold text-slate-700 block truncate max-w-[140px]" title="${supplierName}">${supplierName}</span>
                <span class="text-[10px] text-slate-400">Lead time: ${leadTime}</span>
            </td>
            <td class="p-3.5">
                <span class="text-slate-600 font-medium block">${item.daily_burn_rate > 0 ? `${item.daily_burn_rate} /hari` : '-'}</span>
                ${riskBadge}
            </td>
            <td class="p-3.5 text-center">${statusBadge}</td>
            <td class="p-3.5 text-right">
                <button onclick="openConfirmReorderModal('${escapeHtml(item.product_id)}')" class="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-800 font-bold text-[11px] transition shadow-xs flex items-center gap-1 ml-auto">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    1-Klik PO
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function renderBatchAgingView(agingData) {
    if (!agingData) return;

    const { summary, tiers, top_risk_batches, all_batches } = agingData;

    const freshnessEl = document.getElementById('rep-aging-freshness-score');
    if (freshnessEl) freshnessEl.innerText = `Skor Kesegaran: ${summary.freshness_score || 100}%`;

    const barExpired = document.getElementById('bar-aging-expired');
    const barCritical = document.getElementById('bar-aging-critical');
    const barWarning = document.getElementById('bar-aging-warning');
    const barHealthy = document.getElementById('bar-aging-healthy');

    if (barExpired) barExpired.style.width = `${tiers.EXPIRED.percentage || 0}%`;
    if (barCritical) barCritical.style.width = `${tiers.CRITICAL.percentage || 0}%`;
    if (barWarning) barWarning.style.width = `${tiers.WARNING.percentage || 0}%`;
    if (barHealthy) barHealthy.style.width = `${tiers.HEALTHY.percentage || 0}%`;

    const pExpired = document.getElementById('pill-aging-expired');
    const vExpired = document.getElementById('val-aging-expired');
    const pCritical = document.getElementById('pill-aging-critical');
    const vCritical = document.getElementById('val-aging-critical');
    const pWarning = document.getElementById('pill-aging-warning');
    const vWarning = document.getElementById('val-aging-warning');
    const pHealthy = document.getElementById('pill-aging-healthy');
    const vHealthy = document.getElementById('val-aging-healthy');

    if (pExpired) pExpired.innerText = `${tiers.EXPIRED.count} Batch (${tiers.EXPIRED.units} Unit)`;
    if (vExpired) vExpired.innerText = `Risiko: ${tiers.EXPIRED.formatted_value}`;
    if (pCritical) pCritical.innerText = `${tiers.CRITICAL.count} Batch (${tiers.CRITICAL.units} Unit)`;
    if (vCritical) vCritical.innerText = `Risiko: ${tiers.CRITICAL.formatted_value}`;
    if (pWarning) pWarning.innerText = `${tiers.WARNING.count} Batch (${tiers.WARNING.units} Unit)`;
    if (vWarning) vWarning.innerText = `Aset: ${tiers.WARNING.formatted_value}`;
    if (pHealthy) pHealthy.innerText = `${tiers.HEALTHY.count} Batch (${tiers.HEALTHY.units} Unit)`;
    if (vHealthy) vHealthy.innerText = `Aset: ${tiers.HEALTHY.formatted_value}`;

    const tbody = document.getElementById('rep-aging-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const displayBatches = (top_risk_batches && top_risk_batches.length > 0)
        ? top_risk_batches
        : (all_batches || []).slice(0, 10);

    if (displayBatches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Seluruh batch inventaris dalam kondisi prima (&gt; 90 hari umur simpan).</td></tr>`;
        return;
    }

    displayBatches.forEach(b => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        let tierBadge = '';
        let countdownBadge = '';
        let actionBtn = '';

        if (b.tier === 'EXPIRED') {
            tierBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">Kedaluwarsa</span>`;
            countdownBadge = `<span class="text-rose-600 font-bold block text-[11px]">Lewat ${Math.abs(b.days_until_expiry)} hari</span>`;
            actionBtn = `
                <button onclick="openDisposalForBatch('${escapeHtml(b.product_id)}', ${b.quantity})" class="px-2 py-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold text-[10px] rounded-lg transition">
                    Buang Afkir
                </button>
            `;
        } else if (b.tier === 'CRITICAL') {
            tierBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Kritis</span>`;
            countdownBadge = `<span class="text-amber-600 font-bold block text-[11px]">${b.days_until_expiry} hari lagi</span>`;
            actionBtn = `
                <button onclick="openStockOutForProduct('${escapeHtml(b.product_id)}', ${b.quantity})" class="px-2 py-1 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 font-bold text-[10px] rounded-lg transition">
                    Keluar FEFO
                </button>
            `;
        } else if (b.tier === 'WARNING') {
            tierBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">Waspada</span>`;
            countdownBadge = `<span class="text-slate-600 font-medium block text-[11px]">${b.days_until_expiry} hari</span>`;
            actionBtn = `<span class="text-[10px] text-slate-400">Pantau</span>`;
        } else {
            tierBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Aman</span>`;
            countdownBadge = `<span class="text-emerald-700 font-medium block text-[11px]">${b.days_until_expiry} hari</span>`;
            actionBtn = `<span class="text-[10px] text-emerald-600">Prima</span>`;
        }

        tr.innerHTML = `
            <td class="p-3.5 font-mono font-bold text-slate-800">${escapeHtml(b.batch_code)}</td>
            <td class="p-3.5">
                <span class="font-bold text-slate-900 block">${escapeHtml(b.product_name)}</span>
                <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(b.product_id)} &bull; ${escapeHtml(b.category)}</span>
            </td>
            <td class="p-3.5">
                <span class="font-semibold text-slate-700 block">${escapeHtml(b.facility_name)}</span>
                <span class="text-[10px] text-slate-400 font-mono">Rak: ${escapeHtml(b.location_code)} (${escapeHtml(b.zone_name)})</span>
            </td>
            <td class="p-3.5 text-right font-extrabold text-slate-800">${b.quantity} ${escapeHtml(b.unit)}</td>
            <td class="p-3.5">
                <span class="text-slate-700 font-semibold block">${b.expired_date ? String(b.expired_date).slice(0, 10) : '-'}</span>
                ${countdownBadge}
            </td>
            <td class="p-3.5 text-right font-bold text-slate-900">${b.formatted_value || 'Rp 0'}</td>
            <td class="p-3.5 text-center">${tierBadge}</td>
            <td class="p-3.5 text-right">${actionBtn}</td>
        `;

        tbody.appendChild(tr);
    });
}

function openDisposalForBatch(productId, quantity) {
    openModal('modal-stock-disposal');
    const select = document.getElementById('disposal-product-id');
    const qtyInput = document.getElementById('disposal-quantity');
    const reasonInput = document.getElementById('disposal-reason');

    if (select) select.value = productId;
    if (qtyInput) qtyInput.value = quantity;
    if (reasonInput) reasonInput.value = 'Pembuangan barang kedaluwarsa (Batch Aging Alert)';
}

function openStockOutForProduct(productId, quantity) {
    openModal('modal-stock-out');
    const select = document.getElementById('stock-out-product-id');
    const qtyInput = document.getElementById('stock-out-quantity');
    const notesInput = document.getElementById('stock-out-notes');

    if (select) select.value = productId;
    if (qtyInput) qtyInput.value = Math.min(10, quantity);
    if (notesInput) notesInput.value = 'Prioritas pengeluaran batch mendekati kedaluwarsa (FEFO)';
}

function openConfirmReorderModal(productId) {
    const item = currentReplenishmentAlerts.find(a => a.product_id === productId);
    if (!item) {
        showToast('Data produk tidak ditemukan.', 'error');
        return;
    }

    document.getElementById('reorder-product-id').value = item.product_id;
    document.getElementById('reorder-display-prod-name').innerText = item.product_name;
    document.getElementById('reorder-display-sku').innerText = item.product_id;
    document.getElementById('reorder-display-unit').innerText = item.unit;
    document.getElementById('reorder-display-stock').innerText = `${item.total_stock} ${item.unit}`;
    document.getElementById('reorder-display-min').innerText = `${item.min_stock} ${item.unit}`;
    document.getElementById('reorder-display-deficit').innerText = `${Math.max(0, item.min_stock - item.total_stock)} ${item.unit}`;

    const supSelect = document.getElementById('reorder-supplier-id');
    supSelect.innerHTML = '<option value="">Pilih Vendor...</option>';
    if (currentSuppliers && currentSuppliers.length > 0) {
        currentSuppliers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.supplier_id;
            opt.textContent = `${s.supplier_code} - ${s.supplier_name}`;
            if (item.preferred_supplier && item.preferred_supplier.supplier_id === s.supplier_id) {
                opt.selected = true;
            }
            supSelect.appendChild(opt);
        });
    }

    const facSelect = document.getElementById('reorder-facility-id');
    facSelect.innerHTML = '<option value="">Pilih Gudang...</option>';
    if (currentFacilities && currentFacilities.length > 0) {
        currentFacilities.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.facility_id;
            opt.textContent = `${f.facility_code} - ${f.facility_name}`;
            facSelect.appendChild(opt);
        });
        facSelect.selectedIndex = 1;
    }

    const qty = item.recommended_reorder_qty > 0 ? item.recommended_reorder_qty : Math.max(10, item.min_stock);
    document.getElementById('reorder-quantity-input').value = qty;
    document.getElementById('reorder-cost-input').value = item.cost_price || 0;

    updateReorderModalTotal();
    openModal('modal-confirm-reorder-po');
}

function updateReorderModalTotal() {
    const qty = parseInt(document.getElementById('reorder-quantity-input')?.value, 10) || 0;
    const cost = parseFloat(document.getElementById('reorder-cost-input')?.value) || 0;
    const total = qty * cost;
    const disp = document.getElementById('reorder-display-total-amount');
    if (disp) {
        disp.innerText = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(total);
    }
}

async function handleConfirmReorderPo(event) {
    event.preventDefault();
    const productId = document.getElementById('reorder-product-id').value;
    const supplierId = document.getElementById('reorder-supplier-id').value;
    const facilityId = document.getElementById('reorder-facility-id').value;
    const quantity = parseInt(document.getElementById('reorder-quantity-input').value, 10);
    const cost = parseFloat(document.getElementById('reorder-cost-input').value) || 0;

    if (!supplierId) {
        showToast('Pilih pemasok terlebih dahulu.', 'warning');
        return;
    }
    if (!facilityId) {
        showToast('Pilih fasilitas gudang tujuan terlebih dahulu.', 'warning');
        return;
    }
    if (isNaN(quantity) || quantity <= 0) {
        showToast('Kuantitas pesanan harus bilangan bulat positif.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-submit-reorder-po');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`/api/replenishment/reorder/${encodeURIComponent(productId)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({
                supplier_id: supplierId,
                facility_id: facilityId,
                quantity: quantity
            })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(`Draft Purchase Order #${json.data.po_number} berhasil dibuat!`, 'success');
            closeModal('modal-confirm-reorder-po');
            loadReplenishmentData();
            loadPurchaseOrdersList();
        } else {
            showToast(json.message || 'Gagal membuat Draft PO.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handleTriggerBulkReorder() {
    if (currentUser && currentUser.role === 'STAFF') {
        showToast('Role STAFF tidak memiliki izin memicu pembuatan Purchase Order (Hanya Admin / Manager).', 'error');
        return;
    }

    if (!confirm('Apakah Anda yakin ingin membuat Draft Purchase Order terkonsolidasi untuk seluruh produk yang memerlukan restock?')) {
        return;
    }

    try {
        const res = await fetch('/api/replenishment/reorder-bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken || localStorage.getItem('supplysync_token') || ''}`
            },
            body: JSON.stringify({ facility_id: 1 })
        });

        const json = await res.json();
        if (json.status === 'Success') {
            showToast(json.message || 'Bulk Reorder PO berhasil diproses!', 'success');
            loadReplenishmentData();
            loadPurchaseOrdersList();
            switchTab('orders');
        } else {
            showToast(json.message || 'Gagal memproses bulk reorder.', 'error');
        }
    } catch (err) {
        showToast('Kesalahan: ' + err.message, 'error');
    }
}

// Inisialisasi saat DOM siap & Pasang Barcode Scanner Event Listener
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();

    // Integrasi Barcode Scanner Fisik (USB Handheld) ke input pencarian
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = searchInput.value.trim().toUpperCase();
                const matched = currentProducts.find(p => p.product_id.toUpperCase() === val);
                if (matched) {
                    showToast(`Barcode SKU ${matched.product_id} terdeteksi! Membuka rincian...`, 'info');
                    showBatchDetails(matched.product_id);
                }
            }
        });
    }
});
