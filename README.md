# SupplySync-Mini-Warehouse-Management-System

# 📦 SupplySync — Enterprise Warehouse Management System (WMS)

![System Status](https://img.shields.io/badge/System_Status-Live-emerald?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Tech_Stack-Node.js_%7C_Express_%7C_MySQL_%7C_Tailwind_CSS-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-slate?style=for-the-badge)

**SupplySync** adalah sistem manajemen pergudangan (Warehouse Management System) berstandar *enterprise* yang dirancang untuk mengatasi kompleksitas pelacakan inventaris, mengoptimalkan rotasi barang menggunakan **Auto-FIFO Engine (First-In, First-Out)**, serta menyediakan pencatatan **Audit Trail** transaksi mutasi stok secara *real-time*.

---

## 🌟 Fitur Utama (Current Features)

- **Real-Time Inventory Dashboard**: Monitoring stok produk gabungan (*aggregated stock*), status ambang batas aman (*Safe, Low Stock, Out of Stock*), serta ringkasan indikator operasional secara otomatis.
- **Auto-FIFO Outflow Engine**: Logika pengeluaran barang otomatis berbasis *Database Transaction* (`FOR UPDATE`) yang memotong stok dari batch dengan tanggal kedaluwarsa (*expired date*) paling dekat terlebih dahulu.
- **Batch-Based Stock Tracking**: Pelacakan setiap penerimaan barang berbasis nomor batch dan masa berlaku produk.
- **Audit Trail & Transaction Logging**: Pencatatan riwayat setiap transaksi mutasi barang (*Stock In* dan *Stock Out*) lengkap dengan *timestamp*, operator pengelola, serta catatan transaksi untuk menjamin akuntabilitas (*fraud prevention*).
- **Interactive Modals for Stock Operations**: Antarmuka responsif untuk proses penerimaan (*Stock In*) dan pengeluaran barang (*Stock Out*) tanpa perlu menyentuh database secara manual.

---

## 🏗️ Arsitektur & Teknologi

Sistem dibangun menggunakan pendekatan arsitektur **MVC (Model-View-Controller)** yang terpisah secara modular:

- **Frontend**: Standard HTML5, Vanilla JavaScript (ES6+ Fetch API), Tailwind CSS.
- **Backend**: Node.js & Express.js (RESTful API Architecture).
- **Database**: MySQL 8.0+ (`mysql2/promise` dengan Connection Pool & Transaction Isolation).

### Diagram Alur Data (Architecture Flow)
```text
[ Browser / Frontend Client ]
           │
           │ (RESTful API Requests via Fetch)
           ▼
[ Node.js + Express Server (app.js) ]
           │
  ┌────────┴────────┐
  ▼                 ▼
[ Controllers ]  [ API Routes ]
  │
  │ (SQL Queries & Atomic Transactions)
  ▼
[ MySQL Database (supplysync_db) ]