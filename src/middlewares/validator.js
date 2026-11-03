/**
 * SupplySync WMS - Input Validation & Sanitization Middleware
 */

function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim();
}

function isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
}

function isPositiveInteger(val) {
    const num = Number(val);
    return Number.isInteger(num) && num > 0;
}

function isNonNegativeInteger(val) {
    const num = Number(val);
    return Number.isInteger(num) && num >= 0;
}

// 1. Validasi Input Produk Baru
exports.validateProduct = (req, res, next) => {
    let { product_id, product_name, category, unit, min_stock, cost_price, description } = req.body;

    product_id = sanitizeString(product_id).toUpperCase();
    product_name = sanitizeString(product_name);
    category = sanitizeString(category);
    unit = sanitizeString(unit);

    if (!product_id || product_id.length < 2 || product_id.length > 50) {
        return res.status(400).json({
            status: 'Error',
            message: 'ID Produk / SKU harus diisi (2 - 50 karakter alfanumerik).'
        });
    }

    if (!product_name || product_name.length < 2) {
        return res.status(400).json({
            status: 'Error',
            message: 'Nama produk harus diisi minimal 2 karakter.'
        });
    }

    if (!category) {
        return res.status(400).json({
            status: 'Error',
            message: 'Kategori produk wajib dipilih atau diisi.'
        });
    }

    if (!unit) {
        return res.status(400).json({
            status: 'Error',
            message: 'Satuan unit produk wajib diisi (contoh: Pcs, Karton, Sak, Kg).'
        });
    }

    const parsedMinStock = min_stock !== undefined && min_stock !== '' ? Number(min_stock) : 10;
    if (!isNonNegativeInteger(parsedMinStock)) {
        return res.status(400).json({
            status: 'Error',
            message: 'Batas stok minimum harus berupa angka bulat non-negatif (>= 0).'
        });
    }

    const parsedCostPrice = cost_price !== undefined && cost_price !== '' ? parseFloat(cost_price) : 0;

    req.validatedBody = {
        product_id,
        product_name,
        category,
        unit,
        min_stock: parsedMinStock,
        cost_price: parsedCostPrice >= 0 ? parsedCostPrice : 0,
        description: sanitizeString(description)
    };

    next();
};

// 2. Validasi Penerimaan Barang (Stock In)
exports.validateStockIn = (req, res, next) => {
    let { product_id, quantity, expired_date, supplier_id, location_id, notes, user_id, batch_code } = req.body;

    product_id = sanitizeString(product_id);
    if (!product_id) {
        return res.status(400).json({ status: 'Error', message: 'ID Produk / SKU wajib dipilih.' });
    }

    if (!isPositiveInteger(quantity)) {
        return res.status(400).json({
            status: 'Error',
            message: 'Jumlah penerimaan barang (quantity) harus berupa angka bulat positif lebih dari 0.'
        });
    }

    if (!isValidDate(expired_date)) {
        return res.status(400).json({
            status: 'Error',
            message: 'Tanggal kedaluwarsa (expired_date) tidak valid. Gunakan format YYYY-MM-DD.'
        });
    }

    req.validatedBody = {
        product_id,
        quantity: parseInt(quantity, 10),
        expired_date,
        supplier_id: supplier_id ? parseInt(supplier_id, 10) : null,
        location_id: location_id ? parseInt(location_id, 10) : null,
        notes: sanitizeString(notes) || 'Penerimaan batch barang masuk',
        user_id: user_id ? parseInt(user_id, 10) : (req.user ? req.user.user_id : 1),
        batch_code: sanitizeString(batch_code)
    };

    next();
};

// 3. Validasi Pengeluaran Barang (Stock Out)
exports.validateStockOut = (req, res, next) => {
    let { product_id, quantity, notes, user_id, allow_expired } = req.body;

    product_id = sanitizeString(product_id);
    if (!product_id) {
        return res.status(400).json({ status: 'Error', message: 'ID Produk / SKU wajib dipilih.' });
    }

    if (!isPositiveInteger(quantity)) {
        return res.status(400).json({
            status: 'Error',
            message: 'Jumlah pengeluaran barang harus berupa angka bulat positif lebih dari 0.'
        });
    }

    req.validatedBody = {
        product_id,
        quantity: parseInt(quantity, 10),
        notes: sanitizeString(notes) || 'Pengeluaran barang alokasi FEFO',
        user_id: user_id ? parseInt(user_id, 10) : (req.user ? req.user.user_id : 1),
        allow_expired: Boolean(allow_expired)
    };

    next();
};

// 4. Validasi Pembuangan Barang Rusak/Kadaluwarsa (Stock Disposal)
exports.validateStockDisposal = (req, res, next) => {
    let { product_id, quantity, reason, user_id } = req.body;

    product_id = sanitizeString(product_id);
    if (!product_id) {
        return res.status(400).json({ status: 'Error', message: 'ID Produk / SKU wajib dipilih.' });
    }

    if (!isPositiveInteger(quantity)) {
        return res.status(400).json({
            status: 'Error',
            message: 'Jumlah barang afkir harus berupa angka bulat positif lebih dari 0.'
        });
    }

    reason = sanitizeString(reason);
    if (!reason || reason.length < 3) {
        return res.status(400).json({
            status: 'Error',
            message: 'Alasan resmi pembuangan/afkir wajib diisi (minimal 3 karakter).'
        });
    }

    req.validatedBody = {
        product_id,
        quantity: parseInt(quantity, 10),
        reason,
        user_id: user_id ? parseInt(user_id, 10) : (req.user ? req.user.user_id : 1)
    };

    next();
};

// 5. Validasi Stock Opname / Penyesuaian Fisik
exports.validateStockOpname = (req, res, next) => {
    let { product_id, physical_stock, reason, user_id } = req.body;

    product_id = sanitizeString(product_id);
    if (!product_id) {
        return res.status(400).json({ status: 'Error', message: 'ID Produk / SKU wajib dipilih.' });
    }

    if (!isNonNegativeInteger(physical_stock)) {
        return res.status(400).json({
            status: 'Error',
            message: 'Hasil perhitungan stok fisik harus berupa angka bulat non-negatif (>= 0).'
        });
    }

    reason = sanitizeString(reason);
    if (!reason || reason.length < 3) {
        return res.status(400).json({
            status: 'Error',
            message: 'Catatan hasil stock opname wajib diisi (minimal 3 karakter).'
        });
    }

    req.validatedBody = {
        product_id,
        physical_stock: parseInt(physical_stock, 10),
        reason,
        user_id: user_id ? parseInt(user_id, 10) : (req.user ? req.user.user_id : 1)
    };

    next();
};
