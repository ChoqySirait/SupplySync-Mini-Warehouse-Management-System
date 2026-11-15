const db = require('../config/database');
const { parseCsvToObjects } = require('../utils/csvParser');

// 1. Ambil Semua Produk + Total Stok Gabungan & Status Ambang Batas
exports.getAllProducts = async (req, res) => {
    try {
        const { search, category, category_id, status, facility_id, page, limit } = req.query;

        // Scoping fasilitas: STAFF hanya melihat stok di fasilitasnya, ADMIN & MANAGER bisa filter atau melihat semua
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || (facility_id ? parseInt(facility_id, 10) : null);

        let query = `
            SELECT 
                p.product_id,
                p.product_name,
                p.category,
                p.category_id,
                COALESCE(c.category_name, p.category) AS category_name,
                p.unit,
                p.min_stock,
                p.reorder_quantity,
                p.cost_price,
                p.description,
                p.is_active,
                p.created_at,
                COALESCE(SUM(CASE WHEN b.quantity > 0 ${targetFacility ? 'AND b.facility_id = ?' : ''} THEN b.quantity ELSE 0 END), 0) AS total_stock,
                (COALESCE(SUM(CASE WHEN b.quantity > 0 ${targetFacility ? 'AND b.facility_id = ?' : ''} THEN b.quantity ELSE 0 END), 0) * COALESCE(p.cost_price, 0)) AS subtotal_asset_value,
                COUNT(CASE WHEN b.quantity > 0 ${targetFacility ? 'AND b.facility_id = ?' : ''} THEN b.batch_id ELSE NULL END) AS active_batches,
                MIN(CASE WHEN b.quantity > 0 ${targetFacility ? 'AND b.facility_id = ?' : ''} THEN b.expired_date ELSE NULL END) AS nearest_expiration,
                CASE 
                    WHEN COALESCE(SUM(CASE WHEN b.quantity > 0 ${targetFacility ? 'AND b.facility_id = ?' : ''} THEN b.quantity ELSE 0 END), 0) = 0 THEN 'Out of Stock'
                    WHEN COALESCE(SUM(CASE WHEN b.quantity > 0 ${targetFacility ? 'AND b.facility_id = ?' : ''} THEN b.quantity ELSE 0 END), 0) <= p.min_stock THEN 'Low Stock'
                    ELSE 'Safe'
                END AS stock_status
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN inventory_batches b ON p.product_id = b.product_id
            WHERE p.is_active = 1
        `;
        const params = [];

        if (targetFacility) {
            params.push(targetFacility, targetFacility, targetFacility, targetFacility, targetFacility, targetFacility);
        }

        if (search) {
            query += ` AND (p.product_id LIKE ? OR p.product_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        if (category_id) {
            query += ` AND p.category_id = ?`;
            params.push(category_id);
        } else if (category) {
            query += ` AND (p.category = ? OR c.category_name = ?)`;
            params.push(category, category);
        }

        query += `
            GROUP BY p.product_id, p.product_name, p.category, p.category_id, c.category_name, p.unit, p.min_stock, p.reorder_quantity, p.cost_price, p.description, p.is_active, p.created_at
        `;

        if (status) {
            if (status === 'Safe') query += ` HAVING total_stock > p.min_stock`;
            else if (status === 'Low Stock') query += ` HAVING total_stock <= p.min_stock AND total_stock > 0`;
            else if (status === 'Out of Stock') query += ` HAVING total_stock = 0`;
        }

        query += ` ORDER BY p.created_at DESC;`;

        const [products] = await db.query(query, params);

        // Dukungan Pagination jika disertakan
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);

        if (!isNaN(pageNum) && !isNaN(limitNum) && pageNum > 0 && limitNum > 0) {
            const total = products.length;
            const startIdx = (pageNum - 1) * limitNum;
            const paginated = products.slice(startIdx, startIdx + limitNum);

            return res.json({
                status: 'Success',
                total,
                page: pageNum,
                limit: limitNum,
                total_pages: Math.ceil(total / limitNum),
                count: paginated.length,
                data: paginated
            });
        }

        res.json({ status: 'Success', count: products.length, data: products });
    } catch (error) {
        console.error('❌ Error getAllProducts:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Batch Stok Berdasarkan Urutan FEFO (Expired Terdekat)
exports.getFifoBatches = async (req, res) => {
    try {
        const { facility_id } = req.query;
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || facility_id;

        let query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                b.facility_id,
                f.facility_code,
                f.facility_name,
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
            JOIN warehouse_facilities f ON b.facility_id = f.facility_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.quantity > 0
        `;
        const params = [];

        if (targetFacility) {
            query += ` AND b.facility_id = ?`;
            params.push(targetFacility);
        }

        query += ` ORDER BY b.expired_date ASC, b.received_date ASC, b.batch_id ASC;`;

        const [batches] = await db.query(query, params);
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
        const { facility_id } = req.query;
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || facility_id;

        let query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                b.facility_id,
                f.facility_code,
                f.facility_name,
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
            JOIN warehouse_facilities f ON b.facility_id = f.facility_id
            LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.product_id = ? AND b.quantity > 0
        `;
        const params = [id];

        if (targetFacility) {
            query += ` AND b.facility_id = ?`;
            params.push(targetFacility);
        }

        query += ` ORDER BY b.expired_date ASC, b.received_date ASC;`;

        const [batches] = await db.query(query, params);
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
        const { product_id, product_name, category, category_id, unit, min_stock, reorder_quantity, cost_price, description } = payload;

        // Cek Duplikasi SKU
        const [existing] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [product_id]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ 
                status: 'Error', 
                message: `SKU / ID Produk '${product_id}' sudah terdaftar di sistem WMS.` 
            });
        }

        // Resolusi category_id & category name
        let targetCategoryId = category_id ? parseInt(category_id, 10) : null;
        let targetCategoryName = category ? category.trim() : '';

        if (targetCategoryId && !targetCategoryName) {
            const [catRow] = await db.query('SELECT category_name FROM categories WHERE category_id = ?', [targetCategoryId]);
            if (catRow && catRow.length > 0) targetCategoryName = catRow[0].category_name;
        } else if (!targetCategoryId && targetCategoryName) {
            const [catRow] = await db.query('SELECT category_id FROM categories WHERE LOWER(category_name) = ?', [targetCategoryName.toLowerCase()]);
            if (catRow && catRow.length > 0) targetCategoryId = catRow[0].category_id;
        }

        // Simpan Ke MySQL
        await db.query(
            `INSERT INTO products (product_id, product_name, category, category_id, min_stock, reorder_quantity, unit, cost_price, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                product_id, 
                product_name, 
                targetCategoryName || 'Umum', 
                targetCategoryId, 
                min_stock || 10, 
                reorder_quantity !== undefined ? parseInt(reorder_quantity, 10) : 0, 
                unit, 
                parseFloat(cost_price) || 0.00, 
                description || null
            ]
        );

        res.status(201).json({ 
            status: 'Success', 
            message: `Produk '${product_name}' (${product_id}) berhasil didaftarkan ke katalog master gudang!`,
            data: { 
                product_id, 
                product_name, 
                category: targetCategoryName, 
                category_id: targetCategoryId, 
                unit, 
                min_stock, 
                cost_price: parseFloat(cost_price) || 0.00 
            }
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
        const { product_name, category, category_id, unit, min_stock, reorder_quantity, cost_price, description } = req.body;

        const [existing] = await db.query('SELECT product_id, category, category_id FROM products WHERE product_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Produk '${id}' tidak ditemukan.` });
        }

        let targetCategoryId = category_id !== undefined ? parseInt(category_id, 10) : existing[0].category_id;
        let targetCategoryName = category ? category.trim() : existing[0].category;

        if (category_id && !category) {
            const [catRow] = await db.query('SELECT category_name FROM categories WHERE category_id = ?', [targetCategoryId]);
            if (catRow && catRow.length > 0) targetCategoryName = catRow[0].category_name;
        }

        await db.query(
            `UPDATE products SET 
                product_name = COALESCE(?, product_name),
                category = COALESCE(?, category),
                category_id = COALESCE(?, category_id),
                unit = COALESCE(?, unit),
                min_stock = COALESCE(?, min_stock),
                reorder_quantity = COALESCE(?, reorder_quantity),
                cost_price = COALESCE(?, cost_price),
                description = COALESCE(?, description)
             WHERE product_id = ?`,
            [
                product_name || null, 
                targetCategoryName || null, 
                targetCategoryId || null,
                unit || null, 
                min_stock !== undefined ? parseInt(min_stock, 10) : null, 
                reorder_quantity !== undefined ? parseInt(reorder_quantity, 10) : null,
                cost_price !== undefined ? parseFloat(cost_price) : null, 
                description !== undefined ? description : null, 
                id
            ]
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
        let skippedCount = 0;

        for (const row of rows) {
            const productId = (row.product_id || row['sku'] || '').trim().toUpperCase();
            const productName = (row.product_name || row['nama_produk'] || '').trim();
            const category = (row.category || row['kategori'] || 'Umum').trim();
            const unit = (row.unit || row['satuan'] || 'Pcs').trim();
            const minStock = parseInt(row.min_stock || row['batas_minimum'], 10) || 10;
            const costPrice = parseFloat(row.cost_price || row['harga_pokok']) || 0.00;
            const description = (row.description || row['deskripsi'] || '').trim();

            if (!productId || !productName) {
                skippedCount++;
                continue;
            }

            // Cek duplikasi
            const [exist] = await connection.query('SELECT product_id FROM products WHERE product_id = ?', [productId]);
            if (exist && exist.length > 0) {
                skippedCount++;
                continue;
            }

            await connection.query(
                `INSERT INTO products (product_id, product_name, category, min_stock, unit, cost_price, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [productId, productName, category, minStock, unit, costPrice, description || null]
            );

            insertedCount++;
        }

        await connection.commit();

        res.json({
            status: 'Success',
            message: `Impor CSV selesai: ${insertedCount} produk baru berhasil didaftarkan, ${skippedCount} dilewati (duplikat/tidak valid).`,
            inserted_count: insertedCount,
            skipped_count: skippedCount
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error importProductsCsv:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};
