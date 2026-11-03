/**
 * SupplySync WMS - Official Logistics Document Generator
 * Menerbitkan Dokumen Resmi Standar Pergudangan:
 * 1. Bukti Penerimaan Barang / Goods Receipt Note (GRN)
 * 2. Surat Jalan Pengiriman / Delivery Order (DO)
 * 3. Berita Acara Pembuangan Barang Afkir / Disposal Certificate
 */

const escDoc = (str) => {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

/**
 * Buka jendela cetak Bukti Penerimaan Barang (Goods Receipt Note / GRN)
 */
function printGoodsReceiptNote(data) {
    if (!data) return;
    const refNo = data.reference_no || `GRN-${Date.now()}`;
    const dateStr = data.created_at ? new Date(data.created_at).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
    const operator = data.operator || (typeof currentUser !== 'undefined' ? currentUser.full_name : 'Staff Logistik');
    const supplierName = data.supplier_name || 'Pemasok / Vendor Resmi';
    const notes = data.notes || 'Penerimaan stok rutin terverifikasi';

    // Barcode SVG untuk nomor referensi dokumen
    const barcodeSvg = typeof generateBarcodeSvg === 'function' 
        ? generateBarcodeSvg(refNo, { height: 32, showText: true }) 
        : `<div style="font-family: monospace; font-weight: bold;">${escDoc(refNo)}</div>`;

    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
        alert('Gagal membuka jendela cetak. Izinkan pop-up pada peramban Anda.');
        return;
    }

    const itemsHtml = `
        <tr style="border-bottom: 1px solid #cbd5e1;">
            <td style="padding: 10px; text-align: center;">1</td>
            <td style="padding: 10px; font-family: monospace; font-weight: bold; color: #1e40af;">${escDoc(data.product_id || '-')}</td>
            <td style="padding: 10px; font-weight: 600;">${escDoc(data.product_name || '-')}</td>
            <td style="padding: 10px; font-family: monospace;">${escDoc(data.batch_code || '-')}</td>
            <td style="padding: 10px; text-align: center;">${escDoc(data.location_code || 'Gudang Utama')}</td>
            <td style="padding: 10px; text-align: center;">${data.expired_date ? data.expired_date.split('T')[0] : '-'}</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 14px;">${data.quantity || data.total_deducted || 0} ${escDoc(data.unit || 'Unit')}</td>
        </tr>
    `;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bukti Penerimaan Barang (GRN) - ${escDoc(refNo)}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm; }
                body {
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
                    color: #0f172a;
                    margin: 0;
                    padding: 16px;
                    font-size: 12px;
                    line-height: 1.5;
                }
                .doc-container {
                    border: 1px solid #94a3b8;
                    padding: 24px;
                    border-radius: 8px;
                    background: #fff;
                }
                .header-table { width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                .company-title { font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
                .company-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
                .doc-badge {
                    display: inline-block;
                    background: #ecfdf5;
                    color: #065f46;
                    border: 1px solid #a7f3d0;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-size: 10px;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }
                .meta-table { width: 100%; margin-bottom: 20px; font-size: 11px; }
                .meta-table td { padding: 4px 6px; }
                .data-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
                .data-table th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 700; border-bottom: 2px solid #cbd5e1; }
                .signatures { width: 100%; margin-top: 40px; border-collapse: collapse; }
                .sig-box { width: 33.33%; text-align: center; vertical-align: top; padding: 0 10px; }
                .sig-space { height: 65px; border-bottom: 1px dashed #94a3b8; margin: 0 20px 8px 20px; }
                .sig-role { font-weight: bold; font-size: 11px; }
                .sig-note { font-size: 9px; color: #64748b; }
                .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="doc-container">
                <table class="header-table">
                    <tr>
                        <td style="vertical-align: middle;">
                            <span class="doc-badge">Logistik Inbound Pergudangan</span>
                            <div class="company-title">BUKTI PENERIMAAN BARANG (GOODS RECEIPT NOTE)</div>
                            <div class="company-sub">SupplySync Enterprise WMS &bull; Fulfillment Center Operasional</div>
                        </td>
                        <td style="text-align: right; vertical-align: middle; width: 220px;">
                            ${barcodeSvg}
                        </td>
                    </tr>
                </table>

                <table class="meta-table">
                    <tr>
                        <td style="width: 15%; font-weight: bold; color: #64748b;">No. Dokumen</td>
                        <td style="width: 35%; font-family: monospace; font-weight: bold;">: ${escDoc(refNo)}</td>
                        <td style="width: 15%; font-weight: bold; color: #64748b;">Pemasok (Vendor)</td>
                        <td style="width: 35%; font-weight: bold;">: ${escDoc(supplierName)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; color: #64748b;">Waktu Terima</td>
                        <td>: ${escDoc(dateStr)}</td>
                        <td style="font-weight: bold; color: #64748b;">Penerima (Staf)</td>
                        <td>: ${escDoc(operator)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; color: #64748b;">Catatan Logistik</td>
                        <td colspan="3">: ${escDoc(notes)}</td>
                    </tr>
                </table>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 5%; text-align: center;">No</th>
                            <th style="width: 15%;">SKU Produk</th>
                            <th style="width: 28%;">Nama Barang</th>
                            <th style="width: 16%;">Kode Batch</th>
                            <th style="width: 12%; text-align: center;">Lokasi Rak</th>
                            <th style="width: 12%; text-align: center;">Kedaluwarsa</th>
                            <th style="width: 12%; text-align: right;">Jumlah</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-top: 15px; font-size: 10px; color: #475569;">
                    <strong>Pernyataan Kualitas Fisik:</strong> Barang yang tercantum di atas telah diperiksa kondisi fisik segel kemasan, kebersihan kardus, dan tanggal kedaluwarsa serta telah resmi ditempatkan pada koordinat rak gudang yang sesuai.
                </div>

                <table class="signatures">
                    <tr>
                        <td class="sig-box">
                            <div class="sig-role">Diserahkan Oleh (Ekspedisi/Vendor)</div>
                            <div class="sig-space"></div>
                            <div class="sig-note">Nama & Tanda Tangan Supir</div>
                        </td>
                        <td class="sig-box">
                            <div class="sig-role">Diperiksa Oleh (Pemeriksa QC)</div>
                            <div class="sig-space"></div>
                            <div class="sig-note">Staf Pengawas Kualitas</div>
                        </td>
                        <td class="sig-box">
                            <div class="sig-role">Diterima Oleh (Gudang)</div>
                            <div class="sig-space"></div>
                            <div class="sig-note">${escDoc(operator)}</div>
                        </td>
                    </tr>
                </table>

                <div class="footer">
                    Dokumen ini dicetak secara otomatis melalui SupplySync Enterprise WMS &bull; Validasi digital tanpa manipulasi riwayat.
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Buka jendela cetak Surat Jalan Pengiriman (Delivery Order / DO)
 */
function printDeliveryOrder(data) {
    if (!data) return;
    const refNo = data.reference_no || `DO-${Date.now()}`;
    const dateStr = data.created_at ? new Date(data.created_at).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
    const operator = data.operator || (typeof currentUser !== 'undefined' ? currentUser.full_name : 'Staff Logistik');
    const destination = data.notes || 'Pelanggan / Cabang Distribusi';

    // Barcode SVG untuk nomor DO
    const barcodeSvg = typeof generateBarcodeSvg === 'function' 
        ? generateBarcodeSvg(refNo, { height: 32, showText: true }) 
        : `<div style="font-family: monospace; font-weight: bold;">${escDoc(refNo)}</div>`;

    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
        alert('Gagal membuka jendela cetak. Izinkan pop-up pada peramban Anda.');
        return;
    }

    // Bangun baris batch yang terpotong FEFO
    let rowsHtml = '';
    if (data.batches_affected && Array.isArray(data.batches_affected) && data.batches_affected.length > 0) {
        rowsHtml = data.batches_affected.map((b, idx) => `
            <tr style="border-bottom: 1px solid #cbd5e1;">
                <td style="padding: 8px 10px; text-align: center;">${idx + 1}</td>
                <td style="padding: 8px 10px; font-family: monospace; font-weight: bold; color: #1e40af;">${escDoc(data.product_id || '-')}</td>
                <td style="padding: 8px 10px; font-weight: 600;">${escDoc(data.product_name || '-')}</td>
                <td style="padding: 8px 10px; font-family: monospace;">${escDoc(b.batch_code || '-')}</td>
                <td style="padding: 8px 10px; text-align: center;">${escDoc(b.location_code || '-')}</td>
                <td style="padding: 8px 10px; text-align: right; font-weight: bold; color: #b91c1c;">${b.deducted} Unit</td>
            </tr>
        `).join('');
    } else {
        rowsHtml = `
            <tr style="border-bottom: 1px solid #cbd5e1;">
                <td style="padding: 8px 10px; text-align: center;">1</td>
                <td style="padding: 8px 10px; font-family: monospace; font-weight: bold; color: #1e40af;">${escDoc(data.product_id || '-')}</td>
                <td style="padding: 8px 10px; font-weight: 600;">${escDoc(data.product_name || '-')}</td>
                <td style="padding: 8px 10px; font-family: monospace;">Multi-Batch FEFO</td>
                <td style="padding: 8px 10px; text-align: center;">Gudang Utama</td>
                <td style="padding: 8px 10px; text-align: right; font-weight: bold; color: #b91c1c;">${data.quantity || data.total_deducted || 0} ${escDoc(data.unit || 'Unit')}</td>
            </tr>
        `;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Surat Jalan Pengiriman (Delivery Order) - ${escDoc(refNo)}</title>
            <style>
                @page { size: A4 portrait; margin: 12mm; }
                body {
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
                    color: #0f172a;
                    margin: 0;
                    padding: 16px;
                    font-size: 12px;
                    line-height: 1.5;
                }
                .doc-container {
                    border: 1px solid #94a3b8;
                    padding: 24px;
                    border-radius: 8px;
                    background: #fff;
                }
                .header-table { width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                .company-title { font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
                .company-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
                .doc-badge {
                    display: inline-block;
                    background: #eff6ff;
                    color: #1e40af;
                    border: 1px solid #bfdbfe;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-size: 10px;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }
                .meta-table { width: 100%; margin-bottom: 20px; font-size: 11px; }
                .meta-table td { padding: 4px 6px; }
                .data-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
                .data-table th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 700; border-bottom: 2px solid #cbd5e1; }
                .signatures { width: 100%; margin-top: 40px; border-collapse: collapse; }
                .sig-box { width: 33.33%; text-align: center; vertical-align: top; padding: 0 10px; }
                .sig-space { height: 65px; border-bottom: 1px dashed #94a3b8; margin: 0 20px 8px 20px; }
                .sig-role { font-weight: bold; font-size: 11px; }
                .sig-note { font-size: 9px; color: #64748b; }
                .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="doc-container">
                <table class="header-table">
                    <tr>
                        <td style="vertical-align: middle;">
                            <span class="doc-badge">Logistik Outbound Pergudangan</span>
                            <div class="company-title">SURAT JALAN PENGIRIMAN (DELIVERY ORDER)</div>
                            <div class="company-sub">SupplySync Enterprise WMS &bull; Distribusi Logistik Resmi</div>
                        </td>
                        <td style="text-align: right; vertical-align: middle; width: 220px;">
                            ${barcodeSvg}
                        </td>
                    </tr>
                </table>

                <table class="meta-table">
                    <tr>
                        <td style="width: 15%; font-weight: bold; color: #64748b;">No. Surat Jalan</td>
                        <td style="width: 35%; font-family: monospace; font-weight: bold;">: ${escDoc(refNo)}</td>
                        <td style="width: 15%; font-weight: bold; color: #64748b;">Tujuan / Konsinyasi</td>
                        <td style="width: 35%; font-weight: bold;">: ${escDoc(destination)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; color: #64748b;">Tanggal Kirim</td>
                        <td>: ${escDoc(dateStr)}</td>
                        <td style="font-weight: bold; color: #64748b;">Petugas Pemetik</td>
                        <td>: ${escDoc(operator)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; color: #64748b;">Metode Alokasi</td>
                        <td colspan="3"><span style="color: #b91c1c; font-weight: bold;">FEFO (First-Expired, First-Out)</span> &bull; Batch terurut kedaluwarsa terdekat</td>
                    </tr>
                </table>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 5%; text-align: center;">No</th>
                            <th style="width: 15%;">SKU Produk</th>
                            <th style="width: 32%;">Nama Barang</th>
                            <th style="width: 18%;">Batch Alokasi</th>
                            <th style="width: 15%; text-align: center;">Asal Rak</th>
                            <th style="width: 15%; text-align: right;">Jumlah Keluar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-top: 15px; font-size: 10px; color: #475569;">
                    <strong>Ketentuan Serah Terima:</strong> Harap periksa keutuhan segel dan fisik barang saat serah terima. Komplain kerusakan fisik dalam perjalanan wajib dicantumkan pada lembar surat jalan ini sebelum ditandatangani.
                </div>

                <table class="signatures">
                    <tr>
                        <td class="sig-box">
                            <div class="sig-role">Dibuat Oleh (Admin Gudang)</div>
                            <div class="sig-space"></div>
                            <div class="sig-note">${escDoc(operator)}</div>
                        </td>
                        <td class="sig-box">
                            <div class="sig-role">Dibawa Oleh (Kurir / Ekspedisi)</div>
                            <div class="sig-space"></div>
                            <div class="sig-note">Nama Driver & No. Polisi</div>
                        </td>
                        <td class="sig-box">
                            <div class="sig-role">Diterima Oleh (Konsumen/Toko)</div>
                            <div class="sig-space"></div>
                            <div class="sig-note">Tanda Tangan & Cap Penerima</div>
                        </td>
                    </tr>
                </table>

                <div class="footer">
                    Dokumen resmi SupplySync Enterprise WMS &bull; Lembar Asli: Arsip Kantor &bull; Lembar 2: Ekspedisi &bull; Lembar 3: Penerima Barang.
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        printGoodsReceiptNote,
        printDeliveryOrder,
        escDoc
    };
}
