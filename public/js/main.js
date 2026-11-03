/**
 * SupplySync WMS - Main Client Application Logic
 * Enterprise Single Page Application (SPA) Controller
 */

// Application State
let currentProducts = [];
let currentTransactionLogs = [];
let currentOpnameLogs = [];
let currentCategories = [];
let currentSuppliers = [];
let chartInstance = null;

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
// 1. TOAST NOTIFICATION SYSTEM (Pengganti alert() browser)
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
        audit: 'Audit Trail Transaksi Real-time'
    };
    document.getElementById('page-title').innerText = titles[tabName] || 'SupplySync Enterprise WMS';

    // Tutup mobile drawer jika aktif
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
// 3. DATA FETCHING & SYNCHRONIZATION
// --------------------------------------------------------------------
async function loadDashboardData() {
    try {
        await Promise.all([
            fetchCategories(),
            fetchSuppliers(),
            fetchProducts(),
            fetchFifoBatches(),
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
            document.getElementById('stat-fifo-sub').innerText = `${topFefo.batch_code || '#' + topFefo.batch_id} — ${expBadge}`;
        } else {
            document.getElementById('stat-fifo-priority').innerText = 'Stok Bersih';
            document.getElementById('stat-fifo-sub').innerText = 'Tidak ada batch mendekati kedaluwarsa';
        }
    } catch (e) {
        console.warn('Gagal memuat batch FEFO:', e);
    }
}

// --------------------------------------------------------------------
// 4. RENDERING TABEL & KOMPONEN UI
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

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        tr.innerHTML = `
            <td class="p-4 font-mono font-bold text-blue-700">${escapeHtml(item.product_id)}</td>
            <td class="p-4">
                <div class="font-bold text-slate-900">${escapeHtml(item.product_name)}</div>
                <div class="text-[11px] text-slate-400">${item.active_batches || 0} batch aktif</div>
            </td>
            <td class="p-4 text-slate-600">${escapeHtml(item.category)}</td>
            <td class="p-4 font-bold text-right ${item.stock_status === 'Low Stock' ? 'text-amber-600' : item.stock_status === 'Out of Stock' ? 'text-rose-600' : 'text-slate-900'}">${item.total_stock}</td>
            <td class="p-4 text-slate-500">${escapeHtml(item.unit)}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 text-right space-x-1">
                <button onclick="showBatchDetails('${escapeHtml(item.product_id)}')" class="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="Lihat rincian batch">
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

// --------------------------------------------------------------------
// 5. MODAL RINCIAN BATCH PER SKU
// --------------------------------------------------------------------
async function showBatchDetails(productId) {
    try {
        const res = await fetch(`/api/products/${productId}/batches`);
        const json = await res.json();
        const tbody = document.getElementById('batch-detail-body');
        document.getElementById('batch-detail-title').innerText = `Rincian Batch Aktif: SKU ${productId}`;
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
                    <td class="p-3 text-slate-600">${escapeHtml(b.supplier_name || 'Pasokan Umum')}</td>
                    <td class="p-3 text-slate-500">${b.received_date ? b.received_date.split('T')[0] : '-'}</td>
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
// 6. RENDER AUDIT LOG & VISUAL ANALYTICS (CHART.JS)
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
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada riwayat transaksi mutasi yang tercatat.</td></tr>`;
            renderAnalyticsChart([]);
        }
    } catch (error) {
        console.error('❌ Gagal memuat audit log:', error);
    }
}

// --------------------------------------------------------------------
// 7. RENDER REKONSILIASI STOCK OPNAME LOGS
// --------------------------------------------------------------------
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

// --------------------------------------------------------------------
// 8. RENDER GRAFIK ANALYTICS (CHART.JS)
// --------------------------------------------------------------------
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
// 9. FORM SUBMISSION HANDLERS
// --------------------------------------------------------------------
async function handleAddProduct(e) {
    e.preventDefault();
    const payload = {
        product_id: document.getElementById('prod-id').value.toUpperCase().trim(),
        product_name: document.getElementById('prod-name').value.trim(),
        category: document.getElementById('prod-category').value.trim(),
        unit: document.getElementById('prod-unit').value.trim(),
        min_stock: parseInt(document.getElementById('prod-min-stock').value, 10) || 10,
        description: document.getElementById('prod-desc')?.value.trim() || ''
    };

    try {
        const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        batch_code: document.getElementById('in-batch-code')?.value || '',
        notes: document.getElementById('in-notes').value
    };

    try {
        const res = await fetch('/api/stock/in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        allow_expired: document.getElementById('out-allow-expired')?.checked || false
    };

    try {
        const res = await fetch('/api/stock/out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            showToast(result.message, 'success');
            closeModal('modal-stock-out');
            document.getElementById('form-stock-out').reset();
            await loadDashboardData();
        } else {
            showToast(result.message, 'error');
        }
    } catch (err) {
        showToast('Kesalahan jaringan: ' + err.message, 'error');
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
        reason: document.getElementById('disp-reason').value
    };

    try {
        const res = await fetch('/api/stock/disposal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        reason: document.getElementById('opn-reason').value
    };

    try {
        const res = await fetch('/api/stock/opname', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

async function handleDeleteProduct(productId) {
    if (!confirm(`Konfirmasi penonaktifan master SKU '${productId}'? Tindakan ini hanya berhasil jika stok produk telah 0.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
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
// 10. MODAL & DROPDOWN HELPERS
// --------------------------------------------------------------------
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

// Tutup modal ketika tombol Escape ditekan
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

function populateCategoryFilter() {
    const select = document.getElementById('filter-category');
    if (!select) return;

    select.innerHTML = `<option value="">Semua Kategori</option>` + currentCategories.map(c => 
        `<option value="${escapeHtml(c.category_name)}">${escapeHtml(c.category_name)}</option>`
    ).join('');
}

function updateStatCards(products) {
    document.getElementById('stat-total-products').innerText = products.length;
    const lowStockCount = products.filter(p => p.stock_status === 'Low Stock' || p.stock_status === 'Out of Stock').length;
    document.getElementById('stat-low-stock').innerText = lowStockCount;
}

// --------------------------------------------------------------------
// 11. FILTER & PENCARIAN
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

// --------------------------------------------------------------------
// 12. EXPORT DATA (CSV)
// --------------------------------------------------------------------
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

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', loadDashboardData);
