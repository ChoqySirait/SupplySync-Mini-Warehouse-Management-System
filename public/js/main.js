let currentProducts = [];

// 1. Ambil Data Utama Dashboard
async function loadDashboardData() {
    try {
        // Fetch Data Produk
        const resProducts = await fetch('/api/products');
        const resultProducts = await resProducts.json();

        if (resultProducts.status === 'Success') {
            currentProducts = resultProducts.data;
            renderProductTable(currentProducts);
            updateStatCards(currentProducts);
            populateProductDropdowns(currentProducts);
        }

        // Fetch Data Prioritas FIFO
        const resFifo = await fetch('/api/batches/fifo');
        const resultFifo = await resFifo.json();

        if (resultFifo.status === 'Success' && resultFifo.data.length > 0) {
            const topFifo = resultFifo.data[0];
            document.getElementById('stat-fifo-priority').innerText = topFifo.product_name;
            document.getElementById('stat-fifo-sub').innerText = `Batch #${topFifo.batch_id} — ${topFifo.days_until_expiration} Hari lagi Expired`;
        } else {
            document.getElementById('stat-fifo-priority').innerText = "Tidak Ada Batch";
            document.getElementById('stat-fifo-sub').innerText = "Seluruh stok bersih/kosong";
        }

        // Fetch Riwayat Audit Log
        await loadTransactionLogs();

    } catch (error) {
        console.error('❌ Gagal mengambil data dari API:', error);
    }
}

// 2. Render Tabel Master Produk
function renderProductTable(products) {
    const tbody = document.getElementById('product-table-body');
    tbody.innerHTML = '';

    products.forEach(item => {
        let statusBadge = '';
        if (item.stock_status === 'Safe') {
            statusBadge = `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-2.5 py-1 rounded-full font-semibold">Aman</span>`;
        } else if (item.stock_status === 'Low Stock') {
            statusBadge = `<span class="bg-amber-50 text-amber-700 border border-amber-200 text-xs px-2.5 py-1 rounded-full font-semibold">Low Stock</span>`;
        } else {
            statusBadge = `<span class="bg-rose-50 text-rose-700 border border-rose-200 text-xs px-2.5 py-1 rounded-full font-semibold">Habis</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition';
        tr.innerHTML = `
            <td class="p-4 font-mono font-medium text-slate-600">${item.product_id}</td>
            <td class="p-4 font-semibold text-slate-900">${item.product_name}</td>
            <td class="p-4 text-slate-500">${item.category}</td>
            <td class="p-4 font-bold text-right ${item.stock_status === 'Low Stock' ? 'text-amber-600' : 'text-slate-900'}">${item.total_stock}</td>
            <td class="p-4 text-slate-500">${item.unit}</td>
            <td class="p-4">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 3. Render Tabel Audit Log Transaksi
async function loadTransactionLogs() {
    try {
        const res = await fetch('/api/transactions');
        const result = await res.json();
        const tbody = document.getElementById('log-table-body');
        tbody.innerHTML = '';

        if (result.status === 'Success' && result.data.length > 0) {
            result.data.forEach(log => {
                const isIN = log.transaction_type === 'IN';
                const typeBadge = isIN 
                    ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">STOCK IN</span>`
                    : `<span class="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">STOCK OUT (FIFO)</span>`;

                const dateFormatted = new Date(log.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50/80 transition';
                tr.innerHTML = `
                    <td class="p-4 font-mono text-xs text-slate-500">#LOG-${log.transaction_id}</td>
                    <td class="p-4 text-xs text-slate-600">${dateFormatted}</td>
                    <td class="p-4 font-medium text-slate-900">${log.product_name}</td>
                    <td class="p-4">${typeBadge}</td>
                    <td class="p-4 font-bold text-right ${isIN ? 'text-emerald-600' : 'text-rose-600'}">${isIN ? '+' : '-'}${log.quantity}</td>
                    <td class="p-4 text-xs text-slate-600">${log.operator || 'System'}</td>
                    <td class="p-4 text-xs text-slate-500 italic">${log.notes || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada riwayat transaksi recorded.</td></tr>`;
        }
    } catch (error) {
        console.error('❌ Gagal memuat audit log:', error);
    }
}

// 4. Update Stat Cards & Dropdowns
function updateStatCards(products) {
    document.getElementById('stat-total-products').innerText = products.length;
    const lowStockCount = products.filter(p => p.stock_status === 'Low Stock' || p.stock_status === 'Out of Stock').length;
    document.getElementById('stat-low-stock').innerText = lowStockCount;
}

function populateProductDropdowns(products) {
    const inSelect = document.getElementById('in-product-id');
    const outSelect = document.getElementById('out-product-id');
    let options = products.map(p => `<option value="${p.product_id}">${p.product_id} - ${p.product_name} (Stok: ${p.total_stock})</option>`).join('');
    if (inSelect) inSelect.innerHTML = options;
    if (outSelect) outSelect.innerHTML = options;
}

// 5. Modal Helpers & Handlers
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function handleStockIn(e) {
    e.preventDefault();
    const payload = {
        product_id: document.getElementById('in-product-id').value,
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
        loadDashboardData();
    } else {
        alert('❌ Error: ' + result.message);
    }
}

async function handleStockOut(e) {
    e.preventDefault();
    const payload = {
        product_id: document.getElementById('out-product-id').value,
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
        loadDashboardData();
    } else {
        alert('❌ Error: ' + result.message);
    }
}

document.addEventListener('DOMContentLoaded', loadDashboardData);