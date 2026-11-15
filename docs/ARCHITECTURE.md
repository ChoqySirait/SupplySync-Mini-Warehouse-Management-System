# Arsitektur Sistem SupplySync Enterprise WMS

Dokumen ini menjelaskan secara komprehensif arsitektur perangkat lunak, pola desain, topologi modul, dan strategi konkurensi yang diterapkan pada **SupplySync Enterprise Warehouse Management System**.

---

## 1. Ikhtisar Topologi Sistem (System Topology)

SupplySync dirancang dengan arsitektur **Decoupled Client-Server Enterprise**:

```
+---------------------------------------------------------------------------------+
|                                LAPISAN FRONTEND                                 |
|      React 18+  •  Vite 6  •  TypeScript  •  Local Tailwind CSS Build Pipeline  |
|                                                                                 |
|  [AuthContext]  [FacilityContext]  [ToastContext]  [Centralized ApiClient]     |
|                                                                                 |
|  Pages:                                                                         |
|  • Dashboard KPI      • Master Produk & Batch     • Mutasi & Picking Slip FEFO  |
|  • Transfer Gudang    • Pesanan (PO & SO)         • Stock Opname Facility-Aware |
|  • Denah Lokasi Bin   • Direktori Pemasok         • Normalisasi Kategori        |
|  • Manajemen User     • Pusat Laporan CSV         • Backup & Database Recovery  |
+---------------------------------------------------------------------------------+
                                       |
                           HTTPS / REST API (JSON)
                      RFC-4180 CSV Export Streams
                                       v
+---------------------------------------------------------------------------------+
|                                LAPISAN BACKEND                                  |
|                      Node.js  •  Express.js 5  •  RESTful                       |
|                                                                                 |
|  [Security Middlewares]                                                         |
|  • Helmet Security Headers (CSP, Anti-Clickjacking, MIME Sniffing Protection)   |
|  • Express Rate Limiting (Brute-Force & DoS Mitigation)                         |
|  • NIST Token Verifier & Blacklist Invalidation                                 |
|  • Multi-Tier RBAC (ADMIN, MANAGER, STAFF) & Strict Facility Scoping Guard      |
|                                                                                 |
|  [Application Services & Domain Logic]                                          |
|  • inventoryService: Algoritma Alokasi FEFO & Mutasi Terisolasi                |
|  • orderService: Siklus PO (GRN) & SO (Surat Jalan DO)                          |
|  • transferService: Mesin Transfer Antar-Gudang & In-Transit State Machine       |
|  • stockLedger: Kalkulasi Saldo Berjalan (Running Balance)                      |
|  • migrator: Database Versioned Migration Runner                                |
|  • backupService: Snapshot SQL Dump & Prosedur Restore Terverifikasi            |
+---------------------------------------------------------------------------------+
                                       |
                          mysql2 (Promise / Async-Await)
                        Connection Pooling (Limit: 20)
                                       v
+---------------------------------------------------------------------------------+
|                                LAPISAN DATABASE                                 |
|                            MySQL 8.0+  •  InnoDB                                |
|                                                                                 |
|  • 16 Tabel Relasional Ternormalisasi (Foreign Key & ON DELETE RESTRICT)        |
|  • Single Source of Truth Stok: `inventory_batches` (SUM agregasi per batch)    |
|  • Row-Level Locking (`SELECT ... FOR UPDATE`) Mencegah Deadlock & Saldo Minus  |
|  • Versioned Migration Engine (`schema_migrations` Table Tracking)              |
+---------------------------------------------------------------------------------+
```

---

## 2. Pemisahan Tanggung Jawab Backend (Backend Separation of Concerns)

Backend menerapkan prinsip modularitas tinggi dengan pembagian lapisan yang tegas:

1. **Routes (`src/routes/api.js`)**:
   - Mendaftarkan endpoint REST API secara deklaratif.
   - Mengikat middleware validasi input, otentikasi token JWT, otorisasi peran RBAC, dan filter fasilitas.
2. **Controllers (`src/controllers/`)**:
   - Bertanggung jawab memvalidasi request body, parameter query, dan header HTTP.
   - Mengembalikan response JSON standar `{ success, data, message, meta }` atau error handling terpusat.
   - Tidak menampung logika bisnis kompleks manipulasi basis data.
3. **Services (`src/services/`)**:
   - Menjalankan *core business logic* pergudangan.
   - Mengelola transaksi database (`beginTransaction`, `commit`, `rollback`).
   - Menerapkan algoritma First-Expired, First-Out (FEFO), alokasi multi-batch, rekonsiliasi stock opname, dan pengiriman transfer antar-fasilitas.
4. **Middlewares (`src/middlewares/`)**:
   - `authMiddleware.js`: Verifikasi tanda tangan digital JWT, pengecekan blacklist token saat logout, penegakan peran pengguna (*Role-Based Access Control*), dan isolasi fasilitas untuk akun staf operasional.
   - `validator.js`: Sanitasi dan validasi tipe data input (mencegah kuantitas negatif, format tanggal kadaluwarsa tidak valid, dll).
5. **Utilities (`src/utils/`)**:
   - `security.js`: Enkripsi kata sandi berbasis NIST scrypt (`scrypt$salt$derivedKey`), pembuatan token JWT anti-tampering, dan pembersihan sesi kedaluwarsa.
   - `csvParser.js`: Parser dan serializer berkas CSV yang sepenuhnya memenuhi standar RFC-4180 tanpa dependensi eksternal.
   - `stockLedger.js`: Kalkulasi saldo awal, mutasi masuk/keluar/penyesuaian, dan saldo berjalan (*running balance*).
   - `backupService.js`: Pembuatan berkas cadangan snapshot SQL Dump dan pemulihan (*restore*) transaksional.

---

## 3. Arsitektur Frontend (React + Vite + TypeScript)

Arsitektur frontend telah dimigrasi secara menyeluruh dari kode monolitik lama ke arsitektur modern berbasis komponen:

- **Type Safety Penuh**: Seluruh antarmuka entitas domain WMS didefinisikan secara eksplisit dalam `frontend/src/types/index.ts`.
- **Klien API Terpusat (`frontend/src/services/api.ts`)**: Klien fetch singleton dengan injeksi otomatis header Bearer Token, normalisasi respon, dan deteksi token kedaluwarsa (HTTP 401).
- **Pengelolaan State & Otoritas**:
  - `AuthContext`: Menyimpan status sesi pengguna, informasi peran (*role*), dan fasilitas aktif.
  - Opsi *Facility Switcher* otomatis hanya terbuka untuk peran ADMIN dan MANAGER; peran STAFF terkunci secara permanen pada fasilitas penugasannya.
- **Komponen Atomik & Reusable**:
  - `Button`, `Input`, `Badge`, `Card`, `Modal`, `Table`, `Toast`.
- **Build Pipeline Lokal**:
  - Tailwind CSS dikompilasi secara lokal melalui PostCSS (`frontend/tailwind.config.js`), menghilangkan ketergantungan CDN di lingkungan produksi.
  - Artefak akhir dibangun ke dalam direktori `public/` sehingga dapat di-serve secara langsung dan efisien oleh Express.js.

---

## 4. Strategi Konkurensi & Integritas Transaksi (Concurrency Control)

Tantangan utama sistem pergudangan adalah mencegah **Race Condition**, **Dirty Read**, dan **Saldo Stok Negatif** ketika terjadi permintaan mutasi simultan.

SupplySync mengatasi hal ini melalui strategi:
1. **Transaksional Atomik**: Seluruh proses multi-tabel (seperti pengeluaran FEFO yang memotong beberapa batch sekaligus dan mencatat kartu transaksi) dibungkus dalam blok `connection.beginTransaction()` hingga `connection.commit()`.
2. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
   - Saat proses pengeluaran stok dimulai, baris produk pada tabel `products` dikunci terlebih dahulu untuk menserialisasikan antrian mutasi SKU tersebut.
   - Seluruh baris batch aktif pada tabel `inventory_batches` dikunci dengan klausa `FOR UPDATE` sebelum kuantitas sisa dievaluasi.
   - Jika stok tidak mencukupi permintaan setelah evaluasi real-time, seluruh transaksi langsung dibatalkan via `connection.rollback()`, menjamin integritas saldo tanpa pernah menjadi minus.
