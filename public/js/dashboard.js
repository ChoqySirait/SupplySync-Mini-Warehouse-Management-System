/**
 * SupplySync WMS - Dashboard Keyboard Shortcuts & Helpers
 */

document.addEventListener('keydown', (e) => {
    // Ctrl + K atau / untuk fokus ke kotak pencarian inventaris
    if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            e.preventDefault();
            switchTab('inventory');
            searchInput.focus();
            searchInput.select();
        }
    }
});
