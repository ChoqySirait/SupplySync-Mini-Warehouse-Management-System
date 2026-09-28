# 📦 SupplySync — Enterprise Mini Warehouse Management System (WMS)

> **High-Performance Mini WMS with Automated FIFO Batching Engine & Real-Time Audit Trail Logging.**

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?style=for-the-badge&logo=node.js)
![Express.js](https://img.shields.io/badge/Express.js-v4-000000?style=for-the-badge&logo=express)
![MySQL](https://img.shields.io/badge/MySQL-v8.0-blue?style=for-the-badge&logo=mysql)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-38B2AC?style=for-the-badge&logo=tailwind-css)
![Chart.js](https://img.shields.io/badge/Chart.js-v4-FF6384?style=for-the-badge&logo=chart.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

---

## 📄 Product Requirement Document (PRD)

### 1. Project Purpose & Background
Di industri pergudangan dan agribisnis terintegrasi (seperti manufaktur pakan ternak dan olahan daging unggas), pengelolaan stok bahan baku dan produk jadi yang berumur simpan (*shelf-life*) terbatas membutuhkan akurasi tinggi. Keterlambatan pengeluaran barang dapat mengakibatkan kerugian finansial akibat produk kedaluwarsa (*expired goods*).

**SupplySync** dibangun sebagai sistem manajemen pergudangan (*Warehouse Management System*) modern untuk menangani:
- Penelusuran batch barang berdasarkan tanggal kedaluwarsa (*Expiry Date Tracking*).
- Otomatisasi pengeluaran barang menggunakan metode **FIFO (First-In, First-Out)** berbasis alokasi *expired date* terdekat.
- Akuntabilitas mutasi stok melalui catatan **Audit Trail Log** transaksi yang tidak dapat dimodifikasi (*tamper-proof logging*).

---

### 2. Key Features & Business Value

| Fitur Utama | Fungsi & Deskripsi Teknis | Nilai Bisnis / Dampak |
|---|---|---|
| **Auto-FIFO Outflow Engine** | Mengurangi stok secara otomatis dari batch yang paling mendekati tanggal kedaluwarsa terlebih dahulu menggunakan transaksi MySQL berantai (`FOR UPDATE`). | Mencegah pembusukan/kerusakan produk di gudang (*zero expired waste*). |
| **Real-time Inventory Dashboard** | Tampilan ringkasan total SKU, amatan stok kritis (*low stock warning*), dan prioritas pengeluaran batch. | Mempercepat pengambilan keputusan manajerial secara *real-time*. |
| **Multi-Batch Stock Inbound** | Pencatatan penerimaan barang berdasarkan nomor SKU, kuantitas, dan *expired date* yang fleksibel. | Menjaga presisi histori kedatangan barang dari berbagai *supplier*. |
| **Audit Trail & Transaction History** | Catatan log otomatis untuk setiap transaksi `STOCK IN`, `STOCK OUT`, dan `DISPOSAL`. | Memudahkan audit internal dan transparansi operasional tim pergudangan. |
| **Visual Analytics (Chart.js)** | Visualisasi batang (*Bar Chart*) mutasi pergerakan stok *Inflow vs Outflow*. | Memberikan gambaran tren pergantian barang (*inventory turnover*). |
| **Audit Log Exporting (CSV)** | Ekspor data riwayat transaksi langsung ke format file CSV/Excel. | Memudahkan integrasi dengan departemen Keuangan & Auditing. |

---

## 🏗️ System Architecture & Tech Stack

Aplikasi ini menggunakan pendekatan arsitektur **MVC (Model-View-Controller)** yang modular dan terpisah antara *Frontend* dan *Backend* API:

```text
SupplySync-Mini-Warehouse-Management-System/
│
├── database/
│   └── schema.sql            # Schema MySQL, Relasi DDL, dan Data Seeder Initial
│
├── public/                   # FRONTEND (Client-side Assets)
│   ├── css/
│   │   └── style.css         # Clean Enterprise Light Design & Custom Scrollbar
│   ├── js/
│   │   ├── main.js           # Logic Fetch API, DOM Manipulation, Modal, & Event Handling
│   │   └── dashboard.js      # Filter Search & Dynamic Tab Switcher
│   └── index.html            # Single Page Application (SPA) Layout
│
├── src/                      # BACKEND (Server-side Logic)
│   ├── config/
│   │   └── database.js       # MySQL Connection Pool & Promise Handler
│   ├── controllers/
│   │   ├── productController.js  # Controller SKU, Master Product, & FIFO Prioritization
│   │   └── stockController.js    # Controller Stock In, Auto-FIFO Outflow Engine, & Disposal
│   └── routes/
│       └── api.js            # Express RESTful API Endpoints Router
│
├── .env                      # Environment Variables Config
├── app.js                    # Server Entry Point (Express Application Server)
├── package.json              # Project Dependencies & Scripts
└── README.md                 # System & Technical Documentation