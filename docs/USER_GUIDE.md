# Panduan Pengoperasian Aplikasi SupplySync Enterprise WMS

Panduan praktis langkah-demi-langkah bagi Administrator, Manajer Gudang, dan Staf Operasional dalam menggunakan **SupplySync Enterprise Warehouse Management System**.

---

## 1. Masuk ke Aplikasi & Keamanan Sesi

1. Buka aplikasi SupplySync melalui peramban web pada alamat yang ditentukan (misalnya: `http://localhost:5000`).
2. Masukkan **Nama Pengguna (Username)** atau **Email** terdaftar, beserta **Kata Sandi**.
3. Klik tombol **Masuk ke Aplikasi**.
4. Sesi kerja Anda dilindungi dengan token digital terenkripsi.
5. Untuk mengganti kata sandi mandiri:
   - Klik ikon kunci (*Key*) di sudut kanan atas header.
   - Masukkan kata sandi lama dan kata sandi baru (minimal 6 karakter).
   - Klik **Simpan Perubahan**.
6. Untuk mengakhiri sesi, klik ikon pintu keluar berwarna merah (*Logout*). Sesi Anda akan langsung dinonaktifkan di server.

---

## 2. Memilih Cabang Fasilitas Gudang (Khusus Admin & Manajer)

Pengguna dengan peran **ADMIN** dan **MANAGER** memiliki wewenang mengawasi seluruh cabang fasilitas.
- Pada bagian atas layar (Header), klik dropdown **Fasilitas Aktif**.
- Pilih gudang yang ingin ditinjau (misal: *Gudang Pusat Cakung*, *Cold Storage Rungkut*, dll).
- Seluruh data metrik dashboard, ketersediaan batch stok, transaksi mutasi, dan denah rak akan otomatis tersaring sesuai fasilitas yang dipilih.
- *(Catatan: Akun staf operasional otomatis terkunci hanya pada fasilitas gudang penugasannya).*

---

## 3. Navigasi Dashboard & Analisis Kesegaran FEFO

Halaman Dashboard menyajikan visibilitas operasional secara real-time:
- **Total Valuasi Stok**: Nilai rupiah total aset barang yang tersimpan berdasarkan harga pokok pembelian.
- **Skor Kesegaran FEFO (Freshness Score)**: Indikator persentase kesehatan sisa masa simpan barang di gudang.
- **SKU Stok Rendah**: Jumlah produk yang persediaannya telah menyentuh atau berada di bawah batas minimum (*Safety Stock*).
- **Klasifikasi Usia Batch (Aging Tiers)**:
  - *Sehat (>90 hari)*: Masa simpan prima.
  - *Waspada (31-90 hari)*: Perlu diprioritaskan penjualannya.
  - *Kritis (≤30 hari)*: Prioritas pengeluaran pertama (FEFO).
  - *Kedaluwarsa*: Barang yang telah melewati tanggal expired dan harus dipindahkan ke proses pemusnahan (*Disposal*).

---

## 4. Manajemen Produk & Pengecekan Batch Stok

- Klik menu **Produk & Batch Stok** pada bilah samping (*Sidebar*).
- **Pencarian & Filter**: Masukkan kode SKU atau nama barang pada kotak pencarian, atau pilih kategori barang.
- **Melihat Rincian Batch**:
  - Klik tombol **Batch** pada baris produk yang diinginkan.
  - Sistem akan menampilkan jendela rincian nomor batch, tanggal penerimaan, tanggal kedaluwarsa, lokasi rak simpan, dan sisa hari masa simpan.
- **Menambah Produk Baru (Admin/Manajer)**:
  - Klik tombol **Tambah Produk**.
  - Isi Kode SKU (misal: `PRD-FOOD-001`), Nama Produk, Kategori, Satuan (PCS, BOX, KG), Batas Minimum Stok, dan Harga.
  - Klik **Simpan Produk**.

---

## 5. Penerimaan Barang Masuk (Stock Inbound)

Penerimaan barang non-PO atau penerimaan langsung dapat dilakukan melalui:
1. Buka menu **Mutasi & FEFO Out**.
2. Klik tombol hijau **Penerimaan (Inbound)**.
3. Pilih SKU Produk yang diterima.
4. Masukkan **Jumlah Kuantitas** barang fisik.
5. Tentukan **Tanggal Kedaluwarsa (Expired Date)** produk.
6. Pilih **Lokasi Rak Simpan** (misal: *LOC-A-01-01-01*).
7. Klik **Konfirmasi Penerimaan**. Sistem otomatis membuat batch baru dan mencatat riwayat transaksi masuk.

---

## 6. Pengeluaran Barang Otomatis FEFO & Lembar Pengambilan (Picking Slip)

Untuk menjamin barang yang memiliki masa kedaluwarsa lebih dekat dikeluarkan lebih dulu:
1. Buka menu **Mutasi & FEFO Out**.
2. Klik tombol biru **Pengeluaran FEFO (Outbound)**.
3. Pilih produk yang ingin dikeluarkan dan masukkan jumlah kuantitas.
4. Masukkan catatan atau nomor surat jalan keluar.
5. Klik **Proses Pengeluaran FEFO**.
6. **Lembar Pengambilan Barang (Picking Slip)** akan otomatis ditampilkan:
   - Menampilkan daftar batch mana saja yang harus diambil oleh staf gudang.
   - Menampilkan lokasi rak bin penyimpanan masing-masing batch.
   - Klik **Cetak Picking Slip** untuk mencetak lembar instruksi fisik bagi petugas *picker*.

---

## 7. Transfer Antar-Gudang (Inter-Warehouse Transfer)

Untuk memindahkan persediaan barang antar cabang fasilitas:
1. Buka menu **Transfer Gudang** lalu klik **Kirim Transfer Baru**.
2. Tentukan **Fasilitas Asal** dan **Fasilitas Tujuan**.
3. Tambahkan satu atau beberapa item produk dan kuantitas yang akan dipindahkan.
4. Klik **Proses Kirim Transfer**. Stok pada gudang asal akan otomatis dialokasikan ke status aman **In-Transit**.
5. **Menerima Barang di Gudang Tujuan**:
   - Staf di gudang penerima membuka daftar transfer berstatus `IN_TRANSIT`.
   - Klik tombol **Terima**.
   - Masukkan kuantitas fisik yang benar-benar tiba di lokasi (bila ada barang rusak atau kurang, masukkan jumlah aktual yang diterima).
   - Tentukan lokasi rak penyimpanan di gudang tujuan.
   - Klik **Konfirmasi Barang Diterima**.

---

## 8. Rekonsiliasi Stok Fisik (Stock Opname)

Untuk mencocokkan stok fisik di lapangan dengan saldo sistem:
1. Buka menu **Prediksi Reorder** atau modul opname terkait.
2. Pilih produk yang sedang diaudit.
3. Masukkan angka riil perhitungan fisik gudang (*Physical Stock*).
4. Masukkan alasan penyesuaian (misal: *Audit berkala akhir bulan*).
5. Klik **Terapkan Penyesuaian Stok**:
   - Jika hasil fisik lebih banyak (**Surplus**), sistem otomatis membuat batch penyesuaian baru.
   - Jika hasil fisik lebih sedikit (**Defisit**), sistem otomatis memotong batch aktif menggunakan alokasi FEFO.

---

## 9. Pusat Laporan & Pengunduhan Format Excel CSV

1. Buka menu **Laporan & Ekspor CSV** (Dapat diakses oleh Admin & Manajer).
2. Tersedia 4 tab laporan terperinci:
   - **Valuasi Aset Inventaris**: Total nilai kekayaan barang di gudang.
   - **Mutasi Inbound & Outbound**: Riwayat barang masuk dan keluar berdasarkan rentang tanggal.
   - **Kedaluwarsa Batch & Risiko**: Daftar batch beserta peringatan kedaluwarsa.
   - **Buku Kartu Stok Ledger**: Menampilkan mutasi dan saldo berjalan (*running balance*) per produk.
3. Klik tombol **Unduh CSV Excel** pada laporan yang diinginkan. Berkas terunduh menggunakan standar RFC-4180 yang dapat langsung dibuka dengan rapi di Microsoft Excel atau Google Sheets.

---

## 10. Pencadangan & Pemulihan Basis Data (Khusus Admin)

1. Buka menu **Pencadangan & DB**.
2. Tinjau **Skor Integritas Database** untuk memastikan tidak ada anomali saldo atau data yatim.
3. Klik tombol **Buat Cadangan Baru (SQL Dump)** untuk menyimpan arsip snapshot database terkini.
4. Untuk memulihkan sistem saat kondisi darurat (*Disaster Recovery*):
   - Temukan berkas cadangan pada tabel riwayat.
   - Klik tombol **Pulihkan (Restore)**.
   - Baca peringatan konfirmasi, lalu klik **Ya, Pulihkan Sekarang**.
