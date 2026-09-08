// Pengelolaan Fitur Pencarian Real-Time di Tabel
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const keyword = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#product-table-body tr');

            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                if (text.includes(keyword)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
});

// Fungsi Mengambil Audit Log Transaksi
async function loadTransactionLogs() {
    try {
        const response = await fetch('/api/transactions');
        const result = await response.json();
        
        if (result.status === 'Success') {
            console.log('📋 Audit Log Loaded:', result.data);
        }
    } catch (error) {
        console.error('❌ Error loading logs:', error);
    }
}