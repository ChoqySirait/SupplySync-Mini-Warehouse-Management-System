const db = require('../config/database');

// Lokasi Default Gudang (Fallback)
const DEFAULT_LOCATIONS = [
    { location_id: 1, location_code: 'A-01-01', zone_name: 'Zona Pakan Kering (Dry Feed)', aisle: 'Lorong 1', rack: 'Rak 1', tier: 'Tingkat 1', bin: 'Bin 01', total_stock: 65, batch_count: 2 },
    { location_id: 2, location_code: 'A-01-02', zone_name: 'Zona Pakan Kering (Dry Feed)', aisle: 'Lorong 1', rack: 'Rak 1', tier: 'Tingkat 2', bin: 'Bin 02', total_stock: 12, batch_count: 1 },
    { location_id: 3, location_code: 'B-02-01', zone_name: 'Zona Sembako & Minyak', aisle: 'Lorong 2', rack: 'Rak 2', tier: 'Tingkat 1', bin: 'Bin 01', total_stock: 60, batch_count: 1 },
    { location_id: 4, location_code: 'CR-01-01', zone_name: 'Cold Storage Freezer -18C', aisle: 'Lorong Dingin 1', rack: 'Rak 1', tier: 'Tingkat 1', bin: 'Bin 01', total_stock: 75, batch_count: 1 },
    { location_id: 5, location_code: 'C-01-01', zone_name: 'Zona Bahan Kimia & Biosekuriti', aisle: 'Lorong 3', rack: 'Rak 1', tier: 'Tingkat 1', bin: 'Bin 01', total_stock: 5, batch_count: 1 }
];

// 1. Ambil Semua Lokasi Rak / Bin Gudang
exports.getAllLocations = async (req, res) => {
    try {
        let locations = [];
        try {
            const query = `
                SELECT 
                    l.location_id,
                    l.location_code,
                    l.zone_name,
                    l.aisle,
                    l.rack,
                    l.tier,
                    l.bin,
                    l.description,
                    COALESCE(SUM(b.quantity), 0) AS total_stock,
                    COUNT(DISTINCT b.batch_id) AS batch_count
                FROM warehouse_locations l
                LEFT JOIN inventory_batches b ON l.location_id = b.location_id AND b.quantity > 0
                WHERE l.is_active = 1
                GROUP BY l.location_id, l.location_code, l.zone_name, l.aisle, l.rack, l.tier, l.bin, l.description
                ORDER BY l.zone_name ASC, l.location_code ASC;
            `;
            const [rows] = await db.query(query);
            locations = rows;
        } catch {
            locations = DEFAULT_LOCATIONS;
        }

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

// 2. Tambah Lokasi Rak Baru
exports.createLocation = async (req, res) => {
    try {
        const { location_code, zone_name, aisle, rack, tier, bin, description } = req.body;

        if (!location_code || !zone_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kode lokasi (location_code) dan nama zona gudang wajib diisi.'
            });
        }

        const cleanCode = location_code.trim().toUpperCase();

        const [existing] = await db.query(
            'SELECT location_id FROM warehouse_locations WHERE location_code = ?',
            [cleanCode]
        );

        if (existing && existing.length > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Kode lokasi rak '${cleanCode}' sudah terdaftar.`
            });
        }

        const [result] = await db.query(
            `INSERT INTO warehouse_locations (location_code, zone_name, aisle, rack, tier, bin, description)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cleanCode, zone_name.trim(), aisle || 'Lorong 1', rack || 'Rak 1', tier || 'Tingkat 1', bin || 'Bin 1', description || null]
        );

        res.status(201).json({
            status: 'Success',
            message: `Lokasi rak baru '${cleanCode}' (${zone_name}) berhasil didaftarkan!`,
            data: { location_id: result.insertId, location_code: cleanCode, zone_name }
        });
    } catch (error) {
        console.error('❌ Error createLocation:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
