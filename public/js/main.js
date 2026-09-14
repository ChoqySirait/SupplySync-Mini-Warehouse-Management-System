let currentProducts = [];
let currentTransactionLogs = [];
let chartInstance = null;

// 1. Tab Navigation Switcher
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    const activeTab = document.getElementById(`tab-${tabName}`);
    const activeNav = document.getElementById(`nav-${tabName}`);

    if (activeTab) activeTab.classList.remove('hidden');
    if (activeNav) activeNav.classList.add('active');

    const titles = {
        overview: 'Dashboard Overview',
        inventory: 'Master Inventaris & Produk SKU',
        movements: 'Pusat Transaksi & Mutasi Stok',
        audit: 'Audit Trail Transaksi Real-time'
    };
    document.getElementById('page-title').innerText = titles[tabName] || 'Dashboard SupplySync';
}

// 2. Load Dashboard Data & Fetch MySQL
async function loadDashboardData() {
    try {
        const resProducts = await fetch('/api/products');
        const resultProducts = await resProducts.json();

        if (resultProducts.status === 'Success') {
            currentProducts = resultProducts.data || [];
            renderProductTable(currentProducts);
            updateStatCards(currentProducts);
            populateProductDropdowns(currentProducts);
        }

        const resFifo = await fetch('/api/batches/fifo');
        const resultFifo = await resFifo.json();

        if (resultFifo.status === 'Success' && resultFifo.data && resultFifo.data.length > 0) {
            const topFifo = resultFifo.data[0];
            document.getElementById('stat-fifo-priority').innerText = topFifo.product_name;
            document.getElementById('stat-fifo-sub').innerText = `Batch #${topFifo.batch_id} — ${topFifo.days_until_expiration} Hari lagi Expired`;
        } else {
            document.getElementById('stat-fifo-priority').innerText = "Stok Bersih";
            document.getElementById('stat-fifo-sub').innerText = "Tidak ada batch mendekati expired";
        }

        await loadTransactionLogs();

    } catch (error) {
        console.error('❌ Gagal mengambil data dari API:', error);
    }
}

// 3. Render Grafik Visual Analytics (Chart.js)
function renderAnalyticsChart(logs) {
    const ctx = document.getElementById('stockMovementChart');
    if (!ctx) return;

    // Kelompokkan data transaksi berdasarkan produk
    const productLabels = [];
    const inData = [];
    const outData = [];

    const summaryMap = {};

    logs.forEach(log => {
        const pName = log.product_name;
        if (!summaryMap[pName]) {
            summaryMap[pName] = { in: 0, out: 0 };
        }

        if (log.transaction_type === 'IN') {
            summaryMap[pName].in += parseInt(log.quantity);
        } else {
            summaryMap[pName].out += parseInt(log.quantity);
        }
    });

    Object.keys(summaryMap).forEach(pName => {
        productLabels.push(pName);
        inData.push(summaryMap[pName].in);
        outData.push(summaryMap[pName].out);
    });

    if (chartInstance) {
        chartInstance.destroy(); // Bersihkan instance chart lama sebelum render ulang
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: productLabels.length > 0 ? productLabels : ['Belum Ada Transaksi'],
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
                    label: 'Volume Keluar (Outflow FIFO / Disposal)',
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
                    labels: {
                        font: { family: 'Plus Jakarta Sans', size: 12, weight: 600 }
                    }
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

// 4. Render Tabel Master Produk
function renderProductTable(products) {
    const tbody = document.getElementById('product-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-medium">Belum ada produk terdaftar. Silakan klik tombol "+ Tambah SKU Baru".</td></tr>`;
        return;
    }

    products.forEach(item => {
        let statusBadge = '';
        if (item.stock_status === 'Safe') {
            statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2.5 py-1 rounded-full font-semibold">Aman</span>`;
        } else if (item.stock_status === 'Low Stock') {
            statusBadge = `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2.5 py-1 rounded-full font-semibold">Low Stock</span>`;
        } else {
            statusBadge = `<span class="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] px-2.5 py-1 rounded-full font-semibold">Habis</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        tr.innerHTML = `
            <td class="p-4 font-mono font-semibold text-slate-600">${item.product_id}</td>
            <td class="p-4 font-bold text-slate-900">${item.product_name}</td>
            <td class="p-4 text-slate-500">${item.category}</td>
            <td class="p-4 font-bold text-right ${item.stock_status === 'Low Stock' ? 'text-amber-600' : 'text-slate-900'}">${item.total_stock}</td>
            <td class="p-4 text-slate-500">${item.unit}</td>
            <td class="p-4">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 5. Render Tabel Audit Log
async function loadTransactionLogs() {
    try {
        const res = await fetch('/api/transactions');
        const result = await res.json();
        const tbody = document.getElementById('log-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (result.status === 'Success' && result.data && result.data.length > 0) {
            currentTransactionLogs = result.data;
            renderAnalyticsChart(currentTransactionLogs); // Render Grafik

            result.data.forEach(log => {
                const isIN = log.transaction_type === 'IN';
                const typeBadge = isIN 
                    ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md">STOCK IN</span>`
                    : `<span class="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-md">STOCK OUT</span>`;

                const dateFormatted = new Date(log.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
                tr.innerHTML = `
                    <td class="p-4 font-mono text-xs text-slate-500">#LOG-${log.transaction_id}</td>
                    <td class="p-4 text-slate-600 text-xs">${dateFormatted}</td>
                    <td class="p-4 font-semibold text-slate-900">${log.product_name}</td>
                    <td class="p-4">${typeBadge}</td>
                    <td class="p-4 font-bold text-right ${isIN ? 'text-emerald-600' : 'text-rose-600'}">${isIN ? '+' : '-'}${log.quantity}</td>
                    <td class="p-4 text-slate-600 text-xs">${log.operator || 'System Admin'}</td>
                    <td class="p-4 text-slate-500 italic text-xs">${log.notes || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada riwayat transaksi recorded.</td></tr>`;
            renderAnalyticsChart([]);
        }
    } catch (error) {
        console.error('❌ Gagal memuat audit log:', error);
    }
}

// Dropdown Helper & Stat Cards
function populateProductDropdowns(products) {
    const inSelect = document.getElementById('in-product-id');
    const outSelect = document.getElementById('out-product-id');
    const dispSelect = document.getElementById('disp-product-id');

    if (!products || products.length === 0) {
        const emptyOpt = `<option value="">-- Belum ada produk terdaftar --</option>`;
        if (inSelect) inSelect.innerHTML = emptyOpt;
        if (outSelect) outSelect.innerHTML = emptyOpt;
        if (dispSelect) dispSelect.innerHTML = emptyOpt;
        return;
    }

    let options = products.map(p => `<option value="${p.product_id}">${p.product_id} - ${p.product_name} (Stok: ${p.total_stock})</option>`).join('');
    
    if (inSelect) inSelect.innerHTML = options;
    if (outSelect) outSelect.innerHTML = options;
    if (dispSelect) dispSelect.innerHTML = options;
}

function updateStatCards(products) {
    document.getElementById('stat-total-products').innerText = products.length;
    const lowStockCount = products.filter(p => p.stock_status === 'Low Stock' || p.stock_status === 'Out of Stock').length;
    document.getElementById('stat-low-stock').innerText = lowStockCount;
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Form Handlers
async function handleAddProduct(e) {
    e.preventDefault();
    const payload = {
        product_id: document.getElementById('prod-id').value.toUpperCase(),
        product_name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value,
        unit: document.getElementById('prod-unit').value,
        min_stock: parseInt(document.getElementById('prod-min-stock').value)
    };

    try {
        const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.status === 'Success') {
            alert('📦 ' + result.message);
            closeModal('modal-add-product');
            document.getElementById('form-add-product').reset();
            await loadDashboardData();
        } else { alert('❌ Error: ' + result.message); }
    } catch (err) { alert('❌ Network Error: ' + err.message); }
}

async function handleStockIn(e) {
    e.preventDefault();
    const prodId = document.getElementById('in-product-id').value;
    if (!prodId) {
        alert('⚠️ Pilih produk SKU terlebih dahulu!');
        return;
    }

    const payload = {
        product_id: prodId,
        quantity: parseInt(document.getElementById('in-quantity').value),
        expired_date: document.getElementById('in-expired-date').value,
        notes: document.getElementById('in-notes').value,
        user_id: 1
    };

    const res = await fetch('/api/stock/in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === 'Success') {
        alert('✅ ' + result.message);
        closeModal('modal-stock-in');
        document.getElementById('form-stock-in').reset();
        await loadDashboardData();
    } else { alert('❌ Error: ' + result.message); }
}

async function handleStockOut(e) {
    e.preventDefault();
    const prodId = document.getElementById('out-product-id').value;
    if (!prodId) return;

    const payload = {
        product_id: prodId,
        quantity: parseInt(document.getElementById('out-quantity').value),
        notes: document.getElementById('out-notes').value,
        user_id: 1
    };

    const res = await fetch('/api/stock/out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === 'Success') {
        alert('🚀 ' + result.message);
        closeModal('modal-stock-out');
        document.getElementById('form-stock-out').reset();
        await loadDashboardData();
    } else { alert('❌ Error: ' + result.message); }
}

async function handleStockDisposal(e) {
    e.preventDefault();
    const prodId = document.getElementById('disp-product-id').value;
    if (!prodId) return;

    const payload = {
        product_id: prodId,
        quantity: parseInt(document.getElementById('disp-quantity').value),
        reason: document.getElementById('disp-reason').value,
        user_id: 1
    };

    const res = await fetch('/api/stock/disposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === 'Success') {
        alert('🗑️ ' + result.message);
        closeModal('modal-stock-disposal');
        document.getElementById('form-stock-disposal').reset();
        await loadDashboardData();
    } else { alert('❌ Error: ' + result.message); }
}

function filterProducts() {
    const keyword = document.getElementById('search-input').value.toLowerCase();
    const filtered = currentProducts.filter(p => 
        p.product_name.toLowerCase().includes(keyword) || 
        p.product_id.toLowerCase().includes(keyword)
    );
    renderProductTable(filtered);
}

function exportLogsToCSV() {
    if (currentTransactionLogs.length === 0) {
        alert('⚠️ Belum ada data transaksi untuk di-export.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID Log,Waktu Transaksi,Nama Produk,Tipe Mutasi,Jumlah,Operator,Catatan\n";

    currentTransactionLogs.forEach(log => {
        const time = new Date(log.created_at).toLocaleString('id-ID');
        const cleanNotes = (log.notes || '').replace(/,/g, ' ');
        csvContent += `#LOG-${log.transaction_id},"${time}","${log.product_name}",${log.transaction_type},${log.quantity},"${log.operator || 'System'}","${cleanNotes}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SupplySync_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', loadDashboardData);