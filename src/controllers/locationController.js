const db = require('../config/database');

/**
 * SupplySync WMS - Warehouse Location & Bin Rack Controller
 */

// 1. Ambil Semua Lokasi Rak / Bin Gudang
exports.getAllLocations = async (req, res) => {
    try {
        const { facility_id, search, zone_name } = req.query;

        let query = `
            SELECT 
                l.location_id,
                l.facility_id,
                f.facility_code,
                f.facility_name,
                l.location_code,
                l.zone_name,
                l.aisle,
                l.rack,
                l.tier,
                l.bin,
                l.description,
                l.is_active,
                l.created_at,
                COALESCE(SUM(b.quantity), 0) AS total_stock,
                COUNT(DISTINCT b.batch_id) AS batch_count
            FROM warehouse_locations l
            JOIN warehouse_facilities f ON l.facility_id = f.facility_id
            LEFT JOIN inventory_batches b ON l.location_id = b.location_id AND b.quantity > 0
            WHERE l.is_active = 1
        `;
        const params = [];

        // Scoping fasilitas staf jika ada
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || facility_id;

        if (targetFacility) {
            query += ` AND l.facility_id = ?`;
            params.push(targetFacility);
        }

        if (zone_name) {
            query += ` AND l.zone_name = ?`;
            params.push(zone_name);
        }

        if (search) {
            query += ` AND (l.location_code LIKE ? OR l.zone_name LIKE ? OR l.description LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += `
            GROUP BY l.location_id, l.facility_id, f.facility_code, f.facility_name, l.location_code, l.zone_name, l.aisle, l.rack, l.tier, l.bin, l.description, l.is_active, l.created_at
            ORDER BY f.facility_code ASC, l.zone_name ASC, l.location_code ASC;
        `;

        const [locations] = await db.query(query, params);

        res.json({
            status: 'Success',
            count: locations.length,
            data: locations
        });
    } catch (error) {
        console.error('❌ Error getAllLocations:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Rincian Lokasi Berdasarkan ID
exports.getLocationById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT l.*, f.facility_code, f.facility_name, f.city
             FROM warehouse_locations l
             JOIN warehouse_facilities f ON l.facility_id = f.facility_id
             WHERE l.location_id = ?`,
            [id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Lokasi ID ${id} tidak ditemukan.` });
        }

        // Ambil batch produk yang tersimpan di lokasi rak ini
        const [storedBatches] = await db.query(
            `SELECT b.batch_id, b.batch_code, b.product_id, p.product_name, p.unit, b.quantity, b.expired_date
             FROM inventory_batches b
             JOIN products p ON b.product_id = p.product_id
             WHERE b.location_id = ? AND b.quantity > 0
             ORDER BY b.expired_date ASC`,
            [id]
        );

        res.json({
            status: 'Success',
            data: {
                ...rows[0],
                stored_batches: storedBatches || []
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Tambah Lokasi Rak Baru
exports.createLocation = async (req, res) => {
    try {
        const { facility_id, location_code, zone_name, aisle, rack, tier, bin, description } = req.body;

        if (!location_code || !zone_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kode lokasi (location_code) dan nama zona gudang wajib diisi.'
            });
        }

        const cleanCode = location_code.trim().toUpperCase();
        const targetFacilityId = facility_id ? parseInt(facility_id, 10) : 1;

        const [existing] = await db.query(
            'SELECT location_id FROM warehouse_locations WHERE location_code = ?',
            [cleanCode]
        );

        if (existing && existing.length > 0) {
            return res.status(409).json({
                status: 'Error',
                message: `Kode lokasi rak '${cleanCode}' sudah terdaftar.`
            });
        }

        const [result] = await db.query(
            `INSERT INTO warehouse_locations (facility_id, location_code, zone_name, aisle, rack, tier, bin, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [targetFacilityId, cleanCode, zone_name.trim(), aisle || 'Lorong 1', rack || 'Rak 1', tier || 'Tingkat 1', bin || 'Bin 1', description || null]
        );

        res.status(201).json({
            status: 'Success',
            message: `Lokasi rak baru '${cleanCode}' (${zone_name}) berhasil didaftarkan!`,
            data: { location_id: result.insertId, facility_id: targetFacilityId, location_code: cleanCode, zone_name }
        });
    } catch (error) {
        console.error('❌ Error createLocation:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Update Lokasi Rak
exports.updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { zone_name, aisle, rack, tier, bin, description, is_active } = req.body;

        const [existing] = await db.query('SELECT location_id FROM warehouse_locations WHERE location_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Lokasi ID ${id} tidak ditemukan.` });
        }

        await db.query(
            `UPDATE warehouse_locations SET
                zone_name = COALESCE(?, zone_name),
                aisle = COALESCE(?, aisle),
                rack = COALESCE(?, rack),
                tier = COALESCE(?, tier),
                bin = COALESCE(?, bin),
                description = COALESCE(?, description),
                is_active = COALESCE(?, is_active)
             WHERE location_id = ?`,
            [zone_name || null, aisle || null, rack || null, tier || null, bin || null, description !== undefined ? description : null, is_active !== undefined ? (is_active ? 1 : 0) : null, id]
        );

        res.json({
            status: 'Success',
            message: `Data lokasi rak ID ${id} berhasil diperbarui!`
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 5. Nonaktifkan Lokasi Rak
exports.deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query('SELECT location_id, location_code, is_active FROM warehouse_locations WHERE location_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Lokasi ID ${id} tidak ditemukan.` });
        }

        // Periksa apakah ada batch aktif di lokasi ini
        const [activeBatches] = await db.query('SELECT COUNT(*) AS total FROM inventory_batches WHERE location_id = ? AND quantity > 0', [id]);
        if (activeBatches[0].total > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Lokasi '${existing[0].location_code}' tidak dapat dinonaktifkan karena masih menyimpan ${activeBatches[0].total} batch stok aktif.`
            });
        }

        const newStatus = existing[0].is_active ? 0 : 1;
        await db.query('UPDATE warehouse_locations SET is_active = ? WHERE location_id = ?', [newStatus, id]);

        res.json({
            status: 'Success',
            message: `Status lokasi rak '${existing[0].location_code}' diubah menjadi: ${newStatus ? 'AKTIF' : 'NON-AKTIF'}.`
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
