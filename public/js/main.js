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
        opname: 'Rekonsiliasi Stock Opname Fisik',
        locations: 'Peta Lokasi Rak & Bin Gudang',
        audit: 'Audit Trail Transaksi Real-time'
    };
    document.getElementById('page-title').innerText = titles[tabName] || 'SupplySync Enterprise WMS';

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
            }
        }
    } catch {
        // Fallback default admin
    }
    updateUserInterface();
    fetchUsersList();
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
        sidebarRole.className = `text-[10px] font-bold flex items-center gap-1 ${roleColor}`;
        sidebarRole.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current"></span> ${currentUser.role} Operator`;
    }

    const headerOperator = document.getElementById('header-operator-name');
    if (headerOperator) headerOperator.innerText = `${currentUser.full_name} (${currentUser.role})`;
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
        <button onclick="switchOperator('${u.username}')" class="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 flex items-center justify-between text-xs transition">
            <div>
                <div class="font-bold text-slate-900">${escapeHtml(u.full_name)}</div>
                <div class="text-[10px] text-slate-400">@${escapeHtml(u.username)}</div>
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
            loadOpnameLogs()
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
                <button onclick="showBatchDetails('${escapeHtml(item.product_id)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="Lihat rincian batch & lokasi rak">
                    Batch
                </button>
                <button onclick="openOpnameModalForProduct('${escapeHtml(item.product_id)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition" title="Stock Opname">
                    Opname
                </button>
                <button onclick="handleDeleteProduct('${escapeHtml(item.product_id)}')" class="px-2 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition" title="Nonaktifkan produk">
                    &times;
                </button>
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
