# 📦 SupplySync — Enterprise Warehouse Management System (WMS)

> **High-Performance Multi-Facility Warehouse Management System (WMS) with Automated FEFO Batch Allocation, Real-Time Audit Trail Logging, Physical Stock Opname Reconciliation, and Modern React + TypeScript Architecture.**

![Node.js](https://img.shields.io/badge/Node.js-v20%2B%20%7C%20v24-green?style=for-the-badge&logo=node.js)
![Express.js](https://img.shields.io/badge/Express.js-v5.2-000000?style=for-the-badge&logo=express)
![React](https://img.shields.io/badge/React-v18.3-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-v5.7-3178C6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-v6.0-646CFF?style=for-the-badge&logo=vite)
![MySQL](https://img.shields.io/badge/MySQL-v8.0%20InnoDB-blue?style=for-the-badge&logo=mysql)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3.4%20Local%20Build-38B2AC?style=for-the-badge&logo=tailwind-css)
![Testing](https://img.shields.io/badge/Tests-139%20Passed%20(100%25)-success?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-NIST%20scrypt%20%26%20RBAC-indigo?style=for-the-badge)

---

## 📄 Ringkasan Produk (Executive Summary)

**SupplySync** adalah sistem manajemen pergudangan kelas bisnis (*Enterprise Warehouse Management System*) yang dirancang untuk menangani operasional pergudangan berskala multi-fasilitas dengan presisi tinggi:

1. **Penelusuran Batch & Kedaluwarsa (*Expiry Date Tracking*)**: Pelacakan nomor batch, tanggal penerimaan, lokasi rak bin simpan, dan hitung mundur sisa hari masa simpan per SKU.
2. **Otomatisasi Alokasi FEFO (First-Expired, First-Out)**: Mengeluarkan batch yang paling mendekati tanggal kedaluwarsa terlebih dahulu dengan tiebreaker FIFO deterministik dan lembar pengambilan (*Picking Slip*).
3. **Satu Sumber Kebenaran Stok (*Single Source of Truth*)**: Menghilangkan ketidakkonsistenan saldo dengan mendasarkan seluruh perhitungan kuantitas fisik pada tabel `inventory_batches`.
4. **Isolasi Multi-Fasilitas & Transfer Antar-Gudang**: Manajemen pergerakan barang antar-cabang dengan perlindungan status aman *In-Transit*, penerimaan parsial, dan pelacakan disparitas.
5. **Keamanan Kelas Enterprise**: Autentikasi berbasis NIST scrypt, token JWT anti-tampering, pembatalan sesi saat logout (*token revocation blacklist*), serta kontrol akses peran (ADMIN, MANAGER, STAFF) dan pembatasan cabang (*facility scoping*).
6. **Arsitektur Frontend Modern**: Antarmuka berbasis **React 18 + Vite + TypeScript** dengan pipeline build lokal **Tailwind CSS** (bebas dependensi CDN produksi).

---

## ✨ Fitur-Fitur Utama

| Modul Operasional | Deskripsi Teknis | Nilai Bisnis |
| :--- | :--- | :--- |
| **Katalog Produk & Batch Stok** | Master katalog produk ternormalisasi (`category_id` FK), batas minimum stok (*safety stock*), harga pokok/jual, serta penampil drawer rincian sub-batch aktif. | Visibilitas menyeluruh komposisi inventaris. |
| **Mutasi FEFO & Picking Slip** | Pengeluaran stok transaksional dengan penguncian baris (`FOR UPDATE`), alokasi otomatis batch terdekat expired, dan cetak *Digital Picking Slip*. | Mencegah limbah barang kedaluwarsa (*zero expired waste*). |
| **Transfer Antar-Gudang** | Pemindahan barang antar-fasilitas dengan alokasi pengeluaran asal, isolasi *In-Transit*, penerimaan parsial/penuh, dan cetak Surat Jalan resmi. | Kendali distribusi multi-cabang tanpa risiko *phantom inventory*. |
| **Siklus PO & SO Terintegrasi** | Pembuatan dan persetujuan Purchase Order (PO), penerimaan barang (GRN) yang otomatis membentuk batch, serta Sales Order (SO) dan Surat Jalan (DO). | Sinkronisasi alur fisik gudang dengan rantai pasok komersial. |
| **Stock Opname Facility-Aware** | Rekonsiliasi stok fisik versus sistem terisolasi per fasilitas, penyesuaian surplus (batch baru) dan defisit (pemotongan FEFO) otomatis. | Menjamin keakuratan buku stok dengan kondisi fisik rak. |
| **Denah Lokasi Rak Bin** | Penataan koordinat gudang (*Zone, Rack, Tier, Bin*) dilengkapi generator barcode SVG mandiri (Code 39) untuk stiker label rak. | Mempercepat *picking speed* dan mencegah salah letak barang. |
| **Pusat Laporan & Ekspor CSV** | Buku Kartu Stok (*Running Balance Ledger*), Valuasi Aset, Mutasi Masuk/Keluar, dan Kedaluwarsa Batch dengan ekspor Excel RFC-4180. | Kepatuhan audit internal dan kemudahan rekonsiliasi akuntansi. |
| **Pencadangan & Pemulihan (Backup)** | Uji integritas relasi skema, skor kesehatan basis data, snapshot SQL Dump komplit 16 tabel, dan prosedur *restore* transaksional. | Kesiapan pemulihan bencana (*Disaster Recovery*). |
| **Manajemen Pengguna & RBAC** | Pendaftaran akun staf/manajer, penugasan fasilitas cabang kerja, reset kata sandi, dan penonaktifan akun. | Akuntabilitas operator dan pencegahan eskalasi wewenang. |

---

## 🏗️ Arsitektur Proyek & Struktur Direktori

```text
SupplySync-Mini-Warehouse-Management-System/
├── .github/workflows/
│   └── ci.yml                 # CI/CD Automated Test & Build Pipeline
├── app.js                     # Server Entry Point, Security Middlewares & Routing
├── database/
│   ├── init.js                # Non-Destructive Baseline Database Bootstrapper
│   ├── migrator.js            # Self-Healing Versioned Migration Runner
│   ├── schema.sql             # Pure CREATE TABLE IF NOT EXISTS Baseline
│   ├── schema_fresh.sql       # Skema Fresh Reset untuk Lingkungan Uji Bersih
│   └── migrations/            # Berkas Migrasi Terversi (001 - 021)
├── frontend/                  # Modern React + Vite + TypeScript Application
│   ├── src/
│   │   ├── components/        # Atomik Reusable UI (Button, Modal, Table, Toast, dll)
│   │   ├── context/           # AuthContext & State Management
│   │   ├── pages/             # 13 Halaman Operasional WMS Lengkap
│   │   ├── services/api.ts    # Klien API Terpusat dengan Interceptor
│   │   └── types/index.ts     # Definisi Tipe Domain TypeScript Lengkap
│   ├── tailwind.config.js     # Konfigurasi Palet Warna & Styling Lokal
│   └── vite.config.ts         # Bundler Vite & Proxy Dev Server
├── public/                    # Production Build Output (Di-serve oleh Express)
│   ├── assets/                # Bundle JS & Kompilasi Lokal Tailwind CSS
│   └── index.html             # Single Page Application HTML Entry Point
├── public_legacy/             # Arsip Frontend Monolitik HTML/JS Lama
├── src/
│   ├── config/database.js     # Pool Koneksi MySQL2 (Promise / Async-Await)
│   ├── controllers/           # HTTP Request Controllers
│   ├── middlewares/           # Auth, RBAC, Facility Scope, Rate Limiter, Validator
│   ├── services/              # Domain Business Logic (Inventory, Order, Transfer)
│   └── utils/                 # Security, RFC-4180 CSV, Backup, Stock Ledger, DB Resilience
├── tests/                     # 139 Automated Test Cases (Node Native Test Runner)
│   ├── concurrency.test.js    # Simulasi SELECT FOR UPDATE & Antrian Transaksi
│   ├── resilience.test.js     # Uji Deadlock & Lock Wait Auto-Retry Engine
│   ├── e2e.test.js            # Uji Alur Penuh Siklus Bisnis Pergudangan
│   └── ...                    # 27 Test Suites Lainnya
└── docs/                      # Dokumentasi Teknis Komprehensif
    ├── PROJECT_AUDIT.md       # Laporan Audit Total & Peta Temuan Masalah
    ├── IMPLEMENTATION_PLAN.md # Rencana Aksi Pengembangan & Strategi Migrasi
    ├── ARCHITECTURE.md        # Desain Perangkat Lunak & Strategi Konkurensi
    ├── DATABASE.md            # Dokumentasi Skema 16 Tabel & Mesin Migrasi
    ├── API_DOCUMENTATION.md   # Spesifikasi Seluruh Endpoint REST API
    ├── SECURITY.md            # Kebijakan Keamanan, Kriptografi & Matriks RBAC
    ├── TESTING.md             # Metodologi Pengujian & Hasil Verifikasi QA
    └── USER_GUIDE.md          # Panduan Pengoperasian Aplikasi untuk Pengguna
```

---

## 🚀 Panduan Memulai Cepat (Quick Start)

### 1. Prasyarat Sistem
- **Node.js**: Versi `20.x` atau `22.x` (LTS direkomendasikan).
- **MySQL**: Versi `8.0` atau lebih baru dengan engine InnoDB aktif.

### 2. Instalasi Dependensi
```bash
# Instalasi dependensi backend
npm install

# Instalasi dependensi frontend React
npm install --prefix frontend
```

### 3. Konfigurasi Lingkungan
Salin template berkas `.env.example` menjadi `.env` pada direktori utama:
```bash
cp .env.example .env
```
Sesuaikan kredensial basis data Anda:
```env
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password_anda
DB_NAME=supplysync_db
JWT_SECRET=GantiDenganSecretMinimal32KarakterPadaProduksi
```

### 4. Inisialisasi & Migrasi Basis Data
```bash
# Inisialisasi basis data aman (Non-Destructive)
npm run db:init

# Jalankan seluruh migrasi skema
npm run db:migrate

# Periksa status migrasi yang telah diterapkan
npm run db:migrate:status

# Isi data sampel operasional realistis (Opsional untuk Uji Coba)
npm run db:seed
```

### 5. Kompilasi Frontend & Menjalankan Aplikasi
```bash
# Bangun aplikasi frontend modern ke direktori public/
npm run build:frontend

# Jalankan server Express.js
npm start
```
Buka peramban web Anda di `http://localhost:5000`.

### 6. Kredensial Pengujian Bawaan (Default Accounts)

| Role | Username | Password | Cakupan Hak Akses |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin` | `Admin@SupplySync2026` | Seluruh Modul: User, Backup, Master Data, Mutasi, Multi-Gudang |
| **MANAGER** | `manager` | `Manager@SupplySync2026` | Persetujuan PO, Laporan Kartu Stok, Reorder Alerts, Mutasi |
| **STAFF** | `staff_gudang` | `Staff@SupplySync2026` | Penerimaan (GRN), FEFO Stock Out, Label Barcode, Stock Opname Fisik |

---

## 🧪 Pengujian Otomatis (Automated Testing)

SupplySync dilengkapi dengan **139 pengujian otomatis terisolasi** yang mencakup seluruh lapisan sistem:

```bash
# Menjalankan seluruh test suite
npm test
```

Hasil eksekusi:
```text
ℹ tests 139
ℹ suites 30
ℹ pass 139
ℹ fail 0
ℹ duration_ms ~1000ms
```

---

## 📚 Dokumentasi Teknis Lengkap

Untuk informasi lebih mendalam, silakan baca dokumentasi teknis pada direktori `docs/`:
- [Audit Repository & Analisis Awal](docs/PROJECT_AUDIT.md)
- [Rencana Implementasi & Migrasi](docs/IMPLEMENTATION_PLAN.md)
- [Arsitektur Sistem & Konkurensi](docs/ARCHITECTURE.md)
- [Struktur Database & Mesin Migrasi](docs/DATABASE.md)
- [Dokumentasi Lengkap REST API](docs/API_DOCUMENTATION.md)
- [Kebijakan Keamanan & Hardening](docs/SECURITY.md)
- [Laporan Pengujian & Jaminan Kualitas](docs/TESTING.md)
- [Panduan Pengoperasian Pengguna (User Guide)](docs/USER_GUIDE.md)

---

## ⚖️ Lisensi

Proyek ini dilisensikan di bawah lisensi **ISC**. Dikembangkan oleh **SupplySync Engineering Team**.

## Note

Proyek ini menggunakan AI sebagai Alat Bantu, Ide nya Berasal dari saya Sepenuhnya.
