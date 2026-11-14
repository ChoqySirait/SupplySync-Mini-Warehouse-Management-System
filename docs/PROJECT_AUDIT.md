# Project Audit: SupplySync Mini Warehouse Management System (WMS)
**Tanggal Audit:** 15 November 2026  
**Auditor:** Senior Software Architect, Security Engineer, Database Engineer & Enterprise UI/UX Specialist  
**Status Kode Awal:** Version 1.1.0  
**Baseline Test:** 129 Pass / 0 Fail (Unit In-Memory Mocked)

---

## 1. Eksekutif Ringkasan Audit

Audit menyeluruh telah dilakukan terhadap seluruh komponen aplikasi SupplySync Mini WMS, mencakup:
- Seluruh konfigurasi backend (`app.js`, `src/config/`, `package.json`, `.env.example`).
- Arsitektur Database (`database/schema.sql`, `database/init.js`, migrations `017` - `020`).
- Logika Backend & Services (`controllers`, `services`, `middlewares`, `utils`).
- Lapisan Frontend (`public/index.html`, `public/js/main.js`, `documents.js`, `barcode.js`).
- Utilitas & Pengujian Otomatis (`scripts/dbBackup.js`, `tests/*.test.js`).

### Temuan Kunci
1. **Keamanan Kritis (Critical)**: Terdapat celah autentikasi serius di mana aplikasi melakukan *auto-login* default ke akun admin (`admin123`) di frontend tanpa proteksi otentikasi nyata. Fungsi `switchOperator` memprogram password bawaan `<username>123` langsung pada kode klien. Pada `security.js`, fungsi `verifyPassword` memvalidasi password demo untuk sembarang hash yang tidak berformat scrypt.
2. **Integritas Database & Migrasi (Critical)**: `database/schema.sql` memiliki perintah `DROP TABLE IF EXISTS` yang merusak data operasional jika dijalankan saat re-init. Belum ada sistem pelacakan migrasi berversi (`schema_migrations`). Relasi kategori produk belum menggunakan Foreign Key (`category_id`) melainkan teks bebas (`category`).
3. **Inkonsistensi Sumber Kebenaran Stok (High)**: Beberapa berkas mencoba membaca `products.stock` (seperti pada utilitas backup `verifyDataIntegrity`), padahal tabel `products` tidak memiliki kolom `stock`. Stok dihitung secara dinamis dari `inventory_batches`, namun batch belum menyimpan `facility_id` secara langsung, melainkan melalui join rapuh ke `warehouse_locations`.
4. **Celah RBAC & Facility Scoping (High)**: Sebagian besar endpoint GET (seperti `/api/products`, `/api/suppliers`, `/api/locations`, `/api/analytics/kpi`, `/api/stock/opname`, `/api/reports/stock-card`, `/api/auth/users`) terbuka tanpa autentikasi sama sekali. Operasi stok keluar (`/api/stock/out`), disposal, dan opname belum menerapkan verifikasi cakupan fasilitas pengguna (`requireFacilityScope`).
5. **Arsitektur Frontend Monolitik (High)**: Frontend terdiri dari 1 file HTML raksasa (2.194 baris) dan 1 file JavaScript raksasa (`main.js`, 3.571 baris) dengan CDN Tailwind & Chart.js, mencampuradukkan manipulasi DOM, state global, pemanggilan API, dan styling tanpa modularitas.
6. **Fitur WMS Terpotong (Medium - High)**: Modul User Management, Supplier CRUD lengkap, Category CRUD lengkap, System Backup/Restore UI, dan Reporting Multi-Fasilitas belum tersedia atau hanya berupa endpoint parsial tanpa tampilan antarmuka yang utuh.

---

## 2. Pemetaan Fitur & Kondisi Implementasi

### A. Fitur yang Sudah Tersedia & Berfungsi Baik
- **FEFO Engine Allocation**: Algoritma alokasi batch stok berdasarkan tanggal kedaluwarsa terdekat (`allocateFefoBatches`) berfungsi deterministik dengan tie-breaker FIFO & Batch ID.
- **Penerimaan Barang Masuk (Stock Inbound)**: Multi-batch penerimaan barang dengan pembuatan nomor referensi unik dan pencatatan audit trail ke `stock_transactions` dan `stock_transaction_items`.
- **Pengeluaran Stok FEFO**: Pengurangan kuantitas bertahap melintasi batch aktif dengan instruksi pengambilan rak (*picking slip*).
- **Generator Barcode Code 39**: Pembangkit SVG barcode vektor murni tanpa library eksternal.
- **Pencetakan Dokumen Resmi**: GRN, DO, Berita Acara Pembuangan Afkir, Picking Slip (cetak thermal dan A4).
- **Perhitungan Reorder & Batch Aging**: Algoritma Min-Max Policy, Days to Stockout burn rate, dan kategorisasi umur simpan batch.

### B. Fitur yang Hanya Tersedia Sebagian
- **Stock Opname**: Logika backend surplus/defisit tersedia, tetapi tidak membatasi fasilitas gudang operator dan tidak memiliki antarmuka verifikasi selisih fisik yang fleksibel.
- **Transfer Antar-Gudang**: Alur transfer (DRAFT, IN_TRANSIT, RECEIVED, CANCELLED) sudah dibuat di backend, namun validasi batch transfer mengharuskan `location_id` terisi karena `INNER JOIN warehouse_locations`.
- **Purchase Order & Sales Order**: Model dan service sudah ada, namun belum terintegrasi penuh ke alur penerimaan otomatis dengan pemilihan lokasi rak fleksibel dan status transit yang aman.
- **Master Supplier & Kategori**: Hanya mendukung Create dan List; belum ada Update, Delete/Nonaktifkan, Detail, dan validasi relasi.
- **Master Lokasi Rak**: Pembuatan lokasi tidak mengizinkan penentuan fasilitas tujuan (`facility_id` selalu default 1).

### C. Fitur yang Belum Terintegrasi / Belum Tersedia di Frontend
- **Manajemen Pengguna (User Management)**: Penambahan user, perubahan role, penugasan fasilitas gudang, aktivasi/deaktivasi, dan reset password belum memiliki antarmuka sama sekali.
- **Manajemen Cadangan & Pemulihan (Backup & Restore)**: Backend memiliki utilitas backup, tetapi UI untuk melihat riwayat backup, mengunduh file, memicu backup manual, dan melakukan restore belum ada di frontend.
- **Pusat Laporan Eksekutif & Operasional**: Hanya ada Laporan Kartu Stok di backend; Laporan Valuasi, Mutasi Inbound/Outbound, Kedaluwarsa Batch, dan Kinerja Supplier belum dibuatkan halaman/tab khusus.
- **Sistem Login & Logout Nyata**: Ketiadaan halaman login yang aman; frontend otomatis masuk sebagai `admin` via auto-login script.

---

## 3. Matriks Permasalahan Berdasarkan Tingkat Prioritas

| ID | Prioritas | Komponen | Deskripsi Permasalahan | Dampak |
|---|---|---|---|---|
| **SEC-01** | **CRITICAL** | Auth / Frontend | Auto-login hardcoded `admin:admin123` pada `main.js` (`autoLoginDefaultAdmin`). | Siapapun yang membuka web langsung mendapatkan akses penuh Super Admin. |
| **SEC-02** | **CRITICAL** | Auth / Security | Celah `verifyPassword` di `src/utils/security.js` mengizinkan password demo (`admin123`, `manager123`, `staff123`) terhadap hash apapun yang tidak berawalan `scrypt$`. | Bypass autentikasi total pada akun pengguna jika format hash tidak standar. |
| **SEC-03** | **CRITICAL** | Auth / Backend | Fallback `DEMO_USERS` di `authController.js` saat database gagal diakses. | Bypass database dan menyamarkan kegagalan koneksi nyata. |
| **SEC-04** | **CRITICAL** | Auth / Security | `JWT_SECRET` memiliki fallback string statis dalam kode produksi jika environment variable tidak diisi. | Risiko pemalsuan token otorisasi jika secret bocor atau ditebak. |
| **DB-01** | **CRITICAL** | Database / DDL | `database/schema.sql` memuat `DROP TABLE IF EXISTS` untuk seluruh 16 tabel. | Eksekusi `npm run db:init` tanpa sengaja akan menghapus seluruh data produksi. |
| **DB-02** | **CRITICAL** | Database / Migration | Ketiadaan tabel pelacak migrasi (`schema_migrations`); migrasi hanya dieksekusi secara manual tanpa kontrol versi. | Struktur database tidak dapat diperbarui secara aman pada lingkungan server nyata. |
| **DB-03** | **HIGH** | Database / Schema | Kategori produk disimpan sebagai teks bebas (`products.category`) bukan Foreign Key ke `categories.category_id`. | Integritas data rapuh; update nama kategori menyebabkan data tidak sinkron. |
| **DB-04** | **HIGH** | Database / Schema | `inventory_batches` tidak memiliki kolom `facility_id` langsung, bergantung pada `warehouse_locations.facility_id`. | Batch tanpa lokasi rak (`location_id = NULL`) kehilangan identitas fasilitas gudang asalnya. |
| **SEC-05** | **HIGH** | Routes / RBAC | Endpoint data sensitif (`/api/products`, `/api/suppliers`, `/api/locations`, `/api/analytics/kpi`, `/api/stock/opname`, `/api/reports/stock-card`, `/api/auth/users`) dapat diakses tanpa token autentikasi (publik). | Kebocoran data inventaris, pengguna, dan valuasi aset kepada publik tanpa autentikasi. |
| **SEC-06** | **HIGH** | Controller / Scoping | Operasi mutasi stok keluar (`/api/stock/out`), pembuangan (`/api/stock/disposal`), dan opname (`/api/stock/opname`) tidak menerapkan `requireFacilityScope()`. | Staf Gudang A dapat mengurangi atau merekonsiliasi stok pada Gudang B. |
| **BUG-01** | **HIGH** | Service / Backup | `src/utils/backupService.js` menjalankan `SELECT product_id, product_name, stock, min_stock FROM products;` padahal kolom `stock` tidak ada pada tabel `products`. | Verifikasi integritas data akan melempar error fatal MySQL pada basis data asli. |
| **BUG-02** | **HIGH** | Service / Backup | Tabel `purchase_orders`, `purchase_order_items`, `sales_orders`, dan `sales_order_items` belum terdaftar pada `WMS_TABLES` di utilitas backup. | Data pesanan pengadaan dan penjualan tidak tercakup dalam pencadangan database. |
| **BUG-03** | **HIGH** | Security / NIST | Seed user di `schema.sql` memiliki hash palsu `scrypt$a1b2c3d4e5f60718$3f5a2b1c8d9e0f` (14 hex chars, seharusnya 128 hex chars / 64 bytes). `timingSafeEqual` akan melempar error RangeError. | Pengguna seeder gagal diverifikasi kata sandinya tanpa fallback demo. |
| **UI-01** | **HIGH** | Frontend / Arsitektur | Frontend menggunakan monolitik HTML (2.194 baris) dan Vanilla JS (3.571 baris) dengan Tailwind CDN. | Kerapuhan pemeliharaan, performa berat, styling tidak terkompilasi, tidak ada type-safety. |
| **UI-02** | **MEDIUM** | Frontend / UX | Menu navigasi tidak memiliki halaman untuk Pengelolaan Pemasok, Kategori, Pengguna, Fasilitas, dan Pusat Laporan. | Fitur backend tidak dapat digunakan secara visual oleh staf atau manajer gudang. |
| **UI-03** | **MEDIUM** | Frontend / UX | Data table tidak memiliki server-side pagination, sorting dinamis seragam, dan filter fasilitas global. | Tampilan menjadi lambat dan sulit dikendalikan ketika volume data mencapai ribuan SKU. |
| **CODE-01** | **MEDIUM** | Backend / Quality | Business logic bercampur dalam controller (misal pada `productController`, `facilityController`). | Kurang modular, sulit dilakukan pengujian unit terisolasi. |
| **PERF-01** | **LOW** | Database / Indexing | Belum ada indeks komposit untuk pencarian transaksi berdasarkan rentang tanggal dan fasilitas. | Query laporan dan audit trail melambat seiring bertambahnya log transaksi. |

---

## 4. Kesimpulan Audit

Repository memiliki fondasi bisnis WMS yang kuat (FEFO, audit log, PO/SO, transfer), namun memiliki kerentanan kritis pada sistem autentikasi, inisialisasi database, dan arsitektur frontend monolitik. Diperlukan perbaikan arsitektural menyeluruh dan transparan sebelum sistem ini siap digunakan di lingkungan produksi enterprise.
