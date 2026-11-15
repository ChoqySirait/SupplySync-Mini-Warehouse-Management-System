const db = require('../src/config/database');
const { hashPassword } = require('../src/utils/security');

/**
 * SupplySync WMS - Enterprise Seeder & Demonstration Dataset
 * Mengisi data operasional realistis untuk pengujian komprehensif seluruh modul WMS
 */
async function seedDatabase() {
    console.log('🌱 Memulai proses pengisian data operasional (Seeding)...');
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Fasilitas Pergudangan
        console.log('  🏢 Mengisi data fasilitas gudang...');
        await connection.query(`
            INSERT IGNORE INTO warehouse_facilities 
            (facility_id, facility_code, facility_name, facility_type, address, city, contact_number, is_active)
            VALUES 
            (1, 'WH-JKT-01', 'Gudang Pusat Cakung', 'CENTRAL_HUB', 'Kawasan Industri Pulogadung Blok A5', 'Jakarta Timur', '021-4601234', 1),
            (2, 'WH-SBY-01', 'Cold Storage Rungkut', 'COLD_STORAGE', 'Kawasan Industri SIER Rungkut', 'Surabaya', '031-8431234', 1),
            (3, 'WH-MDN-01', 'Regional DC Belawan', 'REGIONAL_DC', 'Kawasan Industri Medan (KIM) II', 'Medan', '061-6851234', 1);
        `);

        // 2. Akun Pengguna & Otoritas RBAC
        console.log('  👤 Mengisi akun pengguna standar RBAC...');
        const adminHash = hashPassword('admin123');
        const managerHash = hashPassword('manager123');
        const staffHash = hashPassword('staff123');

        await connection.query(`
            INSERT IGNORE INTO users 
            (user_id, username, password_hash, full_name, role, facility_id, is_active)
            VALUES 
            (1, 'admin', ?, 'Choqy Pananda', 'ADMIN', 1, 1),
            (2, 'manager', ?, 'Siti Rahmawati', 'MANAGER', 1, 1),
            (3, 'staff', ?, 'Budi Santoso', 'STAFF', 1, 1),
            (4, 'staff_sby', ?, 'Surya Pratama', 'STAFF', 2, 1);
        `, [adminHash, managerHash, staffHash, staffHash]);

        // 3. Kategori Master
        console.log('  🏷️ Mengisi kategori produk...');
        await connection.query(`
            INSERT IGNORE INTO categories 
            (category_id, category_name, description)
            VALUES 
            (1, 'Sembako & Pangan', 'Bahan pangan pokok kebutuhan rumah tangga dan industri makanan'),
            (2, 'Pakan Ternak (Feed)', 'Pakan formula unggas starter, grower, dan finisher'),
            (3, 'Produk Olahan Daging (Cold Chain)', 'Olahan daging beku ayam potong dan fillet higienis'),
            (4, 'Bahan Kimia & Pembersih', 'Sanitizer dan desinfektan biosekuriti kandang & gudang'),
            (5, 'Suku Cadang & Perlengkapan', 'Spare parts mesin conveyor, palet, dan kemasan');
        `);

        // 4. Pemasok (Suppliers)
        console.log('  🏭 Mengisi direktori pemasok...');
        await connection.query(`
            INSERT IGNORE INTO suppliers 
            (supplier_id, supplier_code, supplier_name, contact_person, phone, email, address, lead_time_days, is_active)
            VALUES 
            (1, 'SUP-001', 'PT Charoen Feedmill Indonesia', 'Hendro Wijaya', '0812-3456-7890', 'hendro@feedmill.co.id', 'Kawasan Industri Medan (KIM) II', 5, 1),
            (2, 'SUP-002', 'PT Salim Ivomas Pratama', 'Dewi Lestari', '0813-9876-5432', 'dewi@salimivomas.com', 'Jl. Tanjung Morawa Km 12', 7, 1),
            (3, 'SUP-003', 'CV Berkah Unggas Nusantara', 'Rahmat Hidayat', '0852-1122-3344', 'rahmat@unggasnusantara.com', 'Deli Serdang, Sumatera Utara', 3, 1),
            (4, 'SUP-004', 'PT Indofood Sukses Makmur', 'Agus Setiawan', '0811-2233-4455', 'agus.s@indofood.co.id', 'Kawasan Industri Cikarang', 4, 1),
            (5, 'SUP-005', 'PT Unilever Oleochemical Indonesia', 'Anita Kusuma', '0818-7788-9900', 'anita.k@unilever.com', 'KEK Sei Mangkei, Simalungun', 6, 1);
        `);

        // 5. Lokasi Rak Bin
        console.log('  📍 Mengisi denah lokasi rak gudang...');
        await connection.query(`
            INSERT IGNORE INTO warehouse_locations 
            (location_id, facility_id, location_code, zone_name, aisle, rack, tier, bin, capacity, is_active)
            VALUES 
            (1, 1, 'A-01-01', 'Zona Pakan Kering (Dry Feed)', 'Lorong 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 500, 1),
            (2, 1, 'A-01-02', 'Zona Pakan Kering (Dry Feed)', 'Lorong 1', 'Rak 1', 'Tingkat 2', 'Bin 02', 500, 1),
            (3, 1, 'B-02-01', 'Zona Sembako & Minyak', 'Lorong 2', 'Rak 2', 'Tingkat 1', 'Bin 01', 300, 1),
            (4, 1, 'CR-01-01', 'Cold Storage Freezer -18C', 'Lorong Dingin 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 200, 1),
            (5, 1, 'C-01-01', 'Zona Bahan Kimia & Biosekuriti', 'Lorong 3', 'Rak 1', 'Tingkat 1', 'Bin 01', 150, 1),
            (6, 2, 'SBY-CS-01', 'Zona Cold Storage Surabaya', 'Lorong Beku 1', 'Rak A', 'Tingkat 1', 'Bin 01', 400, 1),
            (7, 2, 'SBY-DRY-01', 'Zona Dry Buffer Surabaya', 'Lorong Kering 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 600, 1),
            (8, 3, 'MDN-KIM-01', 'Zona Pakan Ternak KIM II', 'Lorong 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 800, 1);
        `);

        // 6. Master Produk SKU
        console.log('  📦 Mengisi master produk SKU...');
        await connection.query(`
            INSERT IGNORE INTO products 
            (product_id, product_name, category, category_id, unit, min_stock, reorder_quantity, cost_price, sale_price, description, is_active)
            VALUES 
            ('PRD-FEED-01', 'Pakan Broiler Starter (511)', 'Pakan Ternak (Feed)', 2, 'Sak 50Kg', 20, 40, 450000.00, 520000.00, 'Pakan ayam pedaging fase starter umur 1-21 hari', 1),
            ('PRD-FEED-02', 'Pakan Broiler Finisher (512)', 'Pakan Ternak (Feed)', 2, 'Sak 50Kg', 15, 30, 475000.00, 545000.00, 'Pakan ayam pedaging fase finisher hingga panen', 1),
            ('PRD-OIL-01', 'Minyak Goreng Sawit Premium 2L', 'Sembako & Pangan', 1, 'Karton', 25, 50, 95000.00, 115000.00, 'Minyak nabati kemasan pouch 2 liter isi 6 pouch/karton', 1),
            ('PRD-MEAT-01', 'Daging Ayam Karkas Frozen 1.0 - 1.2 Kg', 'Produk Olahan Daging (Cold Chain)', 3, 'Kg', 50, 100, 38000.00, 46000.00, 'Ayam beku utuh higienis bersertifikasi halal', 1),
            ('PRD-SAN-01', 'Desinfektan Biosekuriti Gudang 5L', 'Bahan Kimia & Pembersih', 4, 'Jerigen', 10, 20, 125000.00, 160000.00, 'Formula desinfektan spektrum luas untuk sanitasi lantai gudang', 1),
            ('PRD-RICE-01', 'Beras Ramos Super 25Kg', 'Sembako & Pangan', 1, 'Karung', 30, 60, 310000.00, 350000.00, 'Beras putih pulen kualitas premium hasil panen lokal', 1),
            ('PRD-EGG-01', 'Telur Ayam Broiler Grade A (Tray 30 Butir)', 'Sembako & Pangan', 1, 'Tray', 40, 80, 52000.00, 62000.00, 'Telur segar langsung dari peternakan mitra', 1);
        `);

        // 7. Inventory Batches (Beragam tanggal kedaluwarsa untuk FEFO & Aging test)
        console.log('  🕒 Mengisi batch inventaris dengan variasi tanggal FEFO...');
        await connection.query(`
            INSERT IGNORE INTO inventory_batches 
            (batch_id, batch_code, product_id, facility_id, supplier_id, location_id, initial_quantity, quantity, expired_date, received_date, notes)
            VALUES 
            -- PRD-FEED-01: Batch 1 (Kritis: sisa 14 hari), Batch 2 (Sehat: sisa 90 hari)
            (1, 'BTC-FEED01-001', 'PRD-FEED-01', 1, 1, 1, 40, 15, DATE_ADD(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'Batch kedatangan supplier KIM II - Prioritas FEFO'),
            (2, 'BTC-FEED01-002', 'PRD-FEED-01', 1, 1, 1, 50, 50, DATE_ADD(CURDATE(), INTERVAL 90 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'Penerimaan rutin awal bulan'),
            -- PRD-FEED-02: Waspada: sisa 45 hari
            (3, 'BTC-FEED02-001', 'PRD-FEED-02', 1, 1, 2, 30, 12, DATE_ADD(CURDATE(), INTERVAL 45 DAY), DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'Stok menipis mendekati reorder point'),
            -- PRD-OIL-01: Sehat: sisa 180 hari
            (4, 'BTC-OIL01-001', 'PRD-OIL-01', 1, 2, 3, 60, 60, DATE_ADD(CURDATE(), INTERVAL 180 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Pasokan pabrik Tanjung Morawa'),
            -- PRD-MEAT-01: Kritis: sisa 25 hari di Cold Storage
            (5, 'BTC-MEAT01-001', 'PRD-MEAT-01', 1, 3, 4, 100, 75, DATE_ADD(CURDATE(), INTERVAL 25 DAY), DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'Simpan pada cold room freezer -18C'),
            -- PRD-SAN-01: Sehat: sisa 365 hari
            (6, 'BTC-SAN01-001', 'PRD-SAN-01', 1, 1, 5, 10, 5, DATE_ADD(CURDATE(), INTERVAL 365 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'Sanitasi biosekuriti'),
            -- Batch Surabaya: PRD-MEAT-01 di Cabang 2
            (7, 'BTC-MEAT01-SBY', 'PRD-MEAT-01', 2, 3, 6, 80, 80, DATE_ADD(CURDATE(), INTERVAL 60 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'Stock buffer cabang Surabaya');
        `);

        // 8. Purchase Order & Sales Order Seeding
        console.log('  📑 Mengisi dokumen transaksi PO & SO...');
        await connection.query(`
            INSERT IGNORE INTO purchase_orders 
            (po_id, po_number, supplier_id, facility_id, status, total_amount, order_date, expected_delivery_date, created_by, approved_by, notes)
            VALUES 
            (1, 'PO-20261101-0001', 1, 1, 'APPROVED', 18000000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 2, 1, 'Restock Pakan Broiler Starter PT Charoen Feedmill'),
            (2, 'PO-20261102-0002', 2, 1, 'DRAFT', 4750000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 5 DAY), 2, NULL, 'Pengadaan Minyak Goreng Sawit');

            INSERT IGNORE INTO purchase_order_items 
            (item_id, po_id, product_id, ordered_quantity, received_quantity, unit_cost)
            VALUES 
            (1, 1, 'PRD-FEED-01', 40, 0, 450000.00),
            (2, 2, 'PRD-OIL-01', 50, 0, 95000.00);

            INSERT IGNORE INTO sales_orders 
            (so_id, so_number, facility_id, customer_name, customer_phone, customer_address, status, total_amount, order_date, delivery_date, created_by, notes)
            VALUES 
            (1, 'SO-20261102-0001', 1, 'Peternakan Jaya Abadi', '0812-9988-7766', 'Jl. Raya Bogor Km 30, Cibinong', 'CONFIRMED', 13000000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), 2, 'Pengiriman sore hari sebelum pukul 17:00');

            INSERT IGNORE INTO sales_order_items 
            (item_id, so_id, product_id, requested_quantity, unit_price)
            VALUES 
            (1, 1, 'PRD-FEED-01', 25, 520000.00);
        `);

        await connection.commit();
        console.log('✅ Seeding basis data selesai dengan sukses! Seluruh data operasional siap digunakan.');
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('❌ Gagal menjalankan seeding basis data:', error.message);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// Jalankan jika dipanggil via CLI
if (require.main === module) {
    seedDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { seedDatabase };
