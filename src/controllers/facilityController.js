const db = require('../config/database');

/**
 * SupplySync WMS - Multi-Facility & Multi-Warehouse Management Controller
 */

/**
 * 1. Ambil Semua Fasilitas Gudang
 * GET /api/facilities
 */
exports.getAllFacilities = async (req, res) => {
    try {
        const [facilities] = await db.query(`
            SELECT 
                f.facility_id,
                f.facility_code,
                f.facility_name,
                f.facility_type,
                f.address,
                f.city,
                f.contact_number,
                f.is_active,
                f.created_at,
                COUNT(DISTINCT l.location_id) AS total_locations,
                COALESCE(SUM(b.quantity), 0) AS total_stored_stock
            FROM warehouse_facilities f
            LEFT JOIN warehouse_locations l ON f.facility_id = l.facility_id
            LEFT JOIN inventory_batches b ON l.location_id = b.location_id AND b.quantity > 0
            GROUP BY f.facility_id
            ORDER BY f.facility_id ASC
        `);

        return res.json({
            status: 'Success',
            data: facilities
        });
    } catch (error) {
        console.error('❌ Error getAllFacilities:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal memuat data fasilitas gudang: ${error.message}`
        });
    }
};

/**
 * 2. Tambah Fasilitas Gudang Baru
 * POST /api/facilities
 */
exports.createFacility = async (req, res) => {
    try {
        const { facility_code, facility_name, facility_type, address, city, contact_number } = req.body;

        if (!facility_code || !facility_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kode fasilitas (facility_code) dan Nama fasilitas (facility_name) wajib diisi.'
            });
        }

        const validTypes = ['CENTRAL_HUB', 'COLD_STORAGE', 'REGIONAL_DC', 'RETAIL_BUFFER'];
        const type = validTypes.includes(facility_type) ? facility_type : 'REGIONAL_DC';

        const [result] = await db.query(
            `INSERT INTO warehouse_facilities (facility_code, facility_name, facility_type, address, city, contact_number)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                facility_code.trim().toUpperCase(),
                facility_name.trim(),
                type,
                address || null,
                city || 'Jakarta',
                contact_number || null
            ]
        );

        return res.status(201).json({
            status: 'Success',
            message: `Fasilitas gudang '${facility_name}' (${facility_code}) berhasil didaftarkan.`,
            data: {
                facility_id: result.insertId,
                facility_code: facility_code.trim().toUpperCase(),
                facility_name: facility_name.trim(),
                facility_type: type
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                status: 'Error',
                message: `Kode fasilitas '${req.body.facility_code}' sudah terdaftar di sistem.`
            });
        }
        console.error('❌ Error createFacility:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal menambahkan fasilitas gudang: ${error.message}`
        });
    }
};

/**
 * 3. Ambil Lokasi Rak Spesifik Berdasarkan Fasilitas
 * GET /api/facilities/:id/locations
 */
exports.getFacilityLocations = async (req, res) => {
    try {
        const { id } = req.params;

        const [locations] = await db.query(`
            SELECT 
                l.location_id,
                l.facility_id,
                l.location_code,
                l.zone_name,
                l.aisle,
                l.rack,
                l.tier,
                l.bin,
                l.description,
                COUNT(b.batch_id) AS active_batches_count,
                COALESCE(SUM(b.quantity), 0) AS total_items_stored
            FROM warehouse_locations l
            LEFT JOIN inventory_batches b ON l.location_id = b.location_id AND b.quantity > 0
            WHERE l.facility_id = ? AND l.is_active = TRUE
            GROUP BY l.location_id
            ORDER BY l.location_code ASC
        `, [id]);

        return res.json({
            status: 'Success',
            data: locations
        });
    } catch (error) {
        console.error('❌ Error getFacilityLocations:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal memuat lokasi rak fasilitas: ${error.message}`
        });
    }
};
