const db = require('../config/database');
const { parseCsvToObjects } = require('../utils/csvParser');

// 1. Ambil Semua Produk + Total Stok Gabungan & Status Ambang Batas
exports.getAllProducts = async (req, res) => {
    try {
        const { search, category, status } = req.query;

        let query = `
            SELECT 
                p.product_id,
                p.product_name,
                p.category,
                p.unit,
                p.min_stock,
                p.cost_price,
                p.description,
                p.is_active,
                p.created_at,
                COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_stock,
                (COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) * COALESCE(p.cost_price, 0)) AS subtotal_asset_value,
                COUNT(CASE WHEN b.quantity > 0 THEN b.batch_id ELSE NULL END) AS active_batches,
                MIN(CASE WHEN b.quantity > 0 THEN b.expired_date ELSE NULL END) AS nearest_expiration,
                CASE 
                    WHEN COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) = 0 THEN 'Out of Stock'
                    WHEN COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) <= p.min_stock THEN 'Low Stock'
                    ELSE 'Safe'
                END AS stock_status
            FROM products p
            LEFT JOIN inventory_batches b ON p.product_id = b.product_id
            WHERE p.is_active = 1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.product_id LIKE ? OR p.product_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        if (category) {
            query += ` AND p.category = ?`;
            params.push(category);
        }

        query += `
            GROUP BY p.product_id, p.product_name, p.category, p.unit, p.min_stock, p.cost_price, p.description, p.is_active, p.created_at
        `;

        if (status) {
            if (status === 'Safe') query += ` HAVING total_stock > p.min_stock`;
            else if (status === 'Low Stock') query += ` HAVING total_stock <= p.min_stock AND total_stock > 0`;
            else if (status === 'Out of Stock') query += ` HAVING total_stock = 0`;
        }

        query += ` ORDER BY p.created_at DESC;`;

        const [products] = await db.query(query, params);
        res.json({ status: 'Success', count: products.length, data: products });
    } catch (error) {
        console.error('❌ Error getAllProducts:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Batch Stok Berdasarkan Urutan FEFO (Expired Terdekat)
exports.getFifoBatches = async (req, res) => {
    try {
        const query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                p.product_name,
                p.unit,
                b.quantity,
                b.initial_quantity,
                b.expired_date,
                b.received_date,
                COALESCE(l.location_code, 'A-01-01') AS location_code,
                COALESCE(l.zone_name, 'Area Umum') AS zone_name,
                DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiration,
                CASE 
                    WHEN b.expired_date < CURDATE() THEN 'Expired'
                    WHEN DATEDIFF(b.expired_date, CURDATE()) <= 30 THEN 'Warning (<= 30 Hari)'
                    ELSE 'Fresh'
                END AS freshness_status
            FROM inventory_batches b
            JOIN products p ON b.product_id = p.product_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.quantity > 0
            ORDER BY b.expired_date ASC, b.received_date ASC, b.batch_id ASC;
        `;

        const [batches] = await db.query(query);
        res.json({ status: 'Success', count: batches.length, data: batches });
    } catch (error) {
        console.error('❌ Error getFifoBatches:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Ambil Rincian Batch per SKU Produk Lengkap dengan Lokasi Rak Fisik
exports.getProductBatches = async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                s.supplier_name,
                COALESCE(l.location_code, 'A-01-01') AS location_code,
                COALESCE(l.zone_name, 'Zona Utama') AS zone_name,
                COALESCE(l.aisle, 'Lorong 1') AS aisle,
                COALESCE(l.rack, 'Rak 1') AS rack,
                COALESCE(l.tier, 'Tingkat 1') AS tier,
                COALESCE(l.bin, 'Bin 1') AS bin,
                b.initial_quantity,
                b.quantity,
                b.expired_date,
                b.received_date,
                b.notes,
                DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiration
            FROM inventory_batches b
            LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.product_id = ? AND b.quantity > 0
            ORDER BY b.expired_date ASC, b.received_date ASC;
        `;

        const [batches] = await db.query(query, [id]);
        res.json({ status: 'Success', count: batches.length, data: batches });
    } catch (error) {
        console.error('❌ Error getProductBatches:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Tambah SKU / Master Produk Baru
exports.createProduct = async (req, res) => {
    try {
        const payload = req.validatedBody || req.body;
        const { product_id, product_name, category, unit, min_stock, cost_price, description } = payload;

        // Cek Duplikasi SKU
        const [existing] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [product_id]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ 
                status: 'Error', 
                message: `SKU / ID Produk '${product_id}' sudah terdaftar di sistem WMS.` 
            });
        }

        // Simpan Ke MySQL
        await db.query(
            `INSERT INTO products (product_id, product_name, category, min_stock, unit, cost_price, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [product_id, product_name, category, min_stock || 10, unit, parseFloat(cost_price) || 0.00, description || null]
        );

        res.status(201).json({ 
            status: 'Success', 
            message: `Produk '${product_name}' (${product_id}) berhasil didaftarkan ke katalog master gudang!`,
            data: { product_id, product_name, category, unit, min_stock, cost_price: parseFloat(cost_price) || 0.00 }
        });

    } catch (error) {
        console.error('❌ Error createProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 5. Update Master Produk
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { product_name, category, unit, min_stock, cost_price, description } = req.body;

        const [existing] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Produk '${id}' tidak ditemukan.` });
        }

        await db.query(
            `UPDATE products SET 
                product_name = COALESCE(?, product_name),
                category = COALESCE(?, category),
                unit = COALESCE(?, unit),
                min_stock = COALESCE(?, min_stock),
                cost_price = COALESCE(?, cost_price),
                description = COALESCE(?, description)
             WHERE product_id = ?`,
            [product_name || null, category || null, unit || null, min_stock !== undefined ? parseInt(min_stock, 10) : null, cost_price !== undefined ? parseFloat(cost_price) : null, description || null, id]
        );

        res.json({ status: 'Success', message: `Data master produk '${id}' berhasil diperbarui!` });
    } catch (error) {
        console.error('❌ Error updateProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 6. Hapus Produk (Soft-delete aman jika tidak ada stok aktif)
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const [[stockRow]] = await db.query(
            `SELECT COALESCE(SUM(quantity), 0) AS total_stock FROM inventory_batches WHERE product_id = ? AND quantity > 0`,
            [id]
        );

        if (stockRow && stockRow.total_stock > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Tidak dapat menghapus produk '${id}' karena masih memiliki stok aktif sebanyak ${stockRow.total_stock} unit. Lakukan pengeluaran atau disposal terlebih dahulu.`
            });
        }

        await db.query(`UPDATE products SET is_active = 0 WHERE product_id = ?`, [id]);
        res.json({ status: 'Success', message: `Produk '${id}' berhasil dinonaktifkan.` });
    } catch (error) {
        console.error('❌ Error deleteProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 7. Impor Massal Master Produk dari CSV (Bulk CSV Import)
exports.importProductsCsv = async (req, res) => {
    let connection;
    try {
        const csvData = req.body.csv_data || (typeof req.body === 'string' ? req.body : '');
        if (!csvData || typeof csvData !== 'string' || csvData.trim().length === 0) {
            return res.status(400).json({
                status: 'Error',
                message: 'Data teks CSV tidak boleh kosong.'
            });
        }

        const rows = parseCsvToObjects(csvData);
        if (rows.length === 0) {
            return res.status(400).json({
                status: 'Error',
                message: 'File CSV tidak berisi baris data yang valid atau format header salah.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        let insertedCount = 0;
        let updatedCount = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Baris 1 adalah header

            const rawId = row.product_id || row.sku || row.id || row.kode_produk;
            const rawName = row.product_name || row.name || row.nama || row.nama_produk;
            const rawCategory = row.category || row.kategori || 'Umum';
            const rawUnit = row.unit || row.satuan || 'Pcs';
            const rawMinStock = row.min_stock || row.safety_stock || row.batas_minimum;
            const rawCostPrice = row.cost_price || row.hpp || row.harga_pokok || row.harga;
            const rawDesc = row.description || row.deskripsi || row.catatan || '';

            if (!rawId || String(rawId).trim().length < 2) {
                errors.push({ row: rowNum, error: 'SKU / ID Produk wajib diisi minimal 2 karakter.' });
                continue;
            }

            if (!rawName || String(rawName).trim().length < 2) {
                errors.push({ row: rowNum, sku: rawId, error: 'Nama produk wajib diisi minimal 2 karakter.' });
                continue;
            }

            const productId = String(rawId).trim().toUpperCase();
            const productName = String(rawName).trim();
            const category = String(rawCategory).trim();
            const unit = String(rawUnit).trim();
            const minStock = Math.max(0, parseInt(rawMinStock, 10) || 10);
            const costPrice = Math.max(0, parseFloat(rawCostPrice) || 0);
            const description = String(rawDesc).trim();

            const [existing] = await connection.query(
                `SELECT product_id FROM products WHERE product_id = ?`,
                [productId]
            );

            if (existing && existing.length > 0) {
                await connection.query(
                    `UPDATE products SET 
                        product_name = ?,
                        category = ?,
                        unit = ?,
                        min_stock = ?,
                        cost_price = ?,
                        description = ?,
                        is_active = 1
                     WHERE product_id = ?`,
                    [productName, category, unit, minStock, costPrice, description, productId]
                );
                updatedCount++;
            } else {
                await connection.query(
                    `INSERT INTO products (product_id, product_name, category, unit, min_stock, cost_price, description, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                    [productId, productName, category, unit, minStock, costPrice, description]
                );
                insertedCount++;
            }
        }

        await connection.commit();

        res.json({
            status: 'Success',
            message: `Impor massal selesai: ${insertedCount} SKU baru ditambahkan, ${updatedCount} SKU diperbarui.${errors.length > 0 ? ` (${errors.length} baris dilewati karena format tidak valid)` : ''}`,
            data: {
                total_rows: rows.length,
                inserted: insertedCount,
                updated: updatedCount,
                errors
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error importProductsCsv:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};
