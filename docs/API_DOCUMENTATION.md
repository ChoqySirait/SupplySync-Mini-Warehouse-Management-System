# Dokumentasi REST API SupplySync Enterprise WMS

Spesifikasi teknis antarmuka REST API SupplySync untuk integrasi antarmuka web, pemindai barcode (*handheld terminal*), sistem ERP, dan layanan pihak ketiga.

---

## 1. Konvensi & Standar Komunikasi

- **Base URL**: `/api`
- **Format Pertukaran Data**: JSON (`application/json`) dan CSV (`text/csv` untuk ekspor laporan).
- **Otentikasi**: HTTP Header `Authorization: Bearer <jwt_token>`.
- **Format Respon Standar**:
  ```json
  {
    "status": "Success",
    "message": "Deskripsi singkat hasil operasi",
    "data": {},
    "meta": {
      "total": 100,
      "page": 1,
      "limit": 20
    }
  }
  ```

---

## 2. Katalog Endpoint API

### A. Otentikasi & Akun (`/api/auth`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Publik | Otentikasi kredensial pengguna (Username/Email & Password). |
| `POST` | `/api/auth/logout` | Authenticated | Mengakhiri sesi dan memasukkan token ke daftar blacklist. |
| `GET` | `/api/auth/me` | Authenticated | Mengambil profil dan penugasan fasilitas pengguna saat ini. |
| `POST` | `/api/auth/change-password` | Authenticated | Memperbarui kata sandi mandiri pengguna. |
| `POST` | `/api/auth/setup-admin` | Khusus Awal | Inisialisasi akun Administrator pertama jika tabel user kosong. |

---

### B. Master Produk & Batch Stok (`/api/products`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Semua Role | Menampilkan daftar produk (Dapat difilter per fasilitas & kategori). |
| `GET` | `/api/products/:productId` | Semua Role | Rincian lengkap produk beserta seluruh batch aktifnya. |
| `POST` | `/api/products` | ADMIN, MANAGER | Mendaftarkan SKU produk baru ke dalam katalog. |
| `PUT` | `/api/products/:productId` | ADMIN, MANAGER | Memperbarui data produk, kategori, harga, dan batas min stok. |
| `GET` | `/api/products/batches` | Semua Role | Menampilkan seluruh inventaris batch aktif berurutan per tanggal kedaluwarsa. |
| `POST` | `/api/products/import-csv` | ADMIN, MANAGER | Impor massal katalog produk via data teks CSV. |

---

### C. Master Data Kategori, Pemasok & Lokasi

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories` | Semua Role | Menampilkan seluruh kategori master dan jumlah SKU terkait. |
| `POST` | `/api/categories` | ADMIN, MANAGER | Membuat kategori produk baru. |
| `PUT` | `/api/categories/:id` | ADMIN, MANAGER | Mengubah nama atau deskripsi kategori. |
| `DELETE` | `/api/categories/:id` | ADMIN, MANAGER | Menghapus kategori (Ditolak jika masih terhubung ke produk). |
| `GET` | `/api/suppliers` | Semua Role | Menampilkan direktori vendor pemasok dan estimasi lead time. |
| `POST` | `/api/suppliers` | ADMIN, MANAGER | Mendaftarkan rekanan pemasok baru. |
| `PUT` | `/api/suppliers/:id` | ADMIN, MANAGER | Mengubah informasi kontak atau lead time pemasok. |
| `GET` | `/api/locations` | Semua Role | Menampilkan denah rak bin gudang per fasilitas aktif. |
| `POST` | `/api/locations` | ADMIN, MANAGER | Mendaftarkan rak bin baru dan menghasilkan barcode unik. |

---

### D. Manajemen Pengguna (`/api/users`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | ADMIN | Mengambil seluruh daftar pengguna sistem beserta peran dan cabangnya. |
| `POST` | `/api/users` | ADMIN | Mendaftarkan staf atau manajer gudang baru. |
| `PUT` | `/api/users/:id` | ADMIN | Mengubah hak akses role dan penugasan fasilitas gudang. |
| `PATCH` | `/api/users/:id/status` | ADMIN | Mengaktifkan atau menonaktifkan akun staf operasional. |
| `POST` | `/api/users/:id/reset-password` | ADMIN | Me-reset kata sandi pengguna oleh Administrator. |

---

### E. Mutasi Stok & Alokasi FEFO (`/api/stock`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/stock/in` | Semua Role | Penerimaan barang masuk langsung (Membentuk batch baru). |
| `POST` | `/api/stock/out` | Semua Role | Pengeluaran barang alokasi otomatis FEFO dan lembar picking slip. |
| `POST` | `/api/stock/disposal` | ADMIN, MANAGER | Pemusnahan barang afkir / kedaluwarsa beserta berita acara. |
| `POST` | `/api/stock/opname` | Semua Role | Rekonsiliasi stok fisik dan penyesuaian surplus/defisit otomatis. |
| `GET` | `/api/stock/history` | Semua Role | Jejak audit mutasi transaksi pergudangan terkini. |

---

### F. Transfer Antar-Gudang (`/api/transfers`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/transfers` | Semua Role | Menampilkan daftar surat transfer barang antar fasilitas. |
| `GET` | `/api/transfers/:id` | Semua Role | Rincian lengkap transfer barang dan item batch. |
| `POST` | `/api/transfers` | ADMIN, MANAGER | Membuat surat jalan transfer (Stok asal masuk status in-transit). |
| `POST` | `/api/transfers/:id/receive`| Terkait Cabang | Menerima transfer masuk di gudang tujuan (Penuh atau parsial). |
| `POST` | `/api/transfers/:id/cancel` | ADMIN, MANAGER | Membatalkan pengiriman dan mengembalikan stok ke gudang asal. |

---

### G. Pesanan Pengadaan & Penjualan (`/api/orders`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/orders/purchase` | Semua Role | Menampilkan daftar Purchase Orders (PO). |
| `POST` | `/api/orders/purchase` | Semua Role | Membuat draft Purchase Order baru kepada supplier. |
| `POST` | `/api/orders/purchase/:id/approve` | ADMIN, MANAGER | Menyetujui PO untuk dapat dilakukan proses penerimaan barang. |
| `POST` | `/api/orders/purchase/:id/receive` | Semua Role | Penerimaan barang PO (GRN) dan pembentukan batch fisik otomatis. |
| `GET` | `/api/orders/sales` | Semua Role | Menampilkan daftar Sales Orders (SO) pelanggan. |
| `POST` | `/api/orders/sales` | Semua Role | Membuat pesanan penjualan baru. |
| `POST` | `/api/orders/sales/:id/confirm` | Semua Role | Mengonfirmasi pesanan penjualan. |
| `POST` | `/api/orders/sales/:id/ship` | Semua Role | Pengiriman SO via pemotongan alokasi FEFO. |

---

### H. Pusat Laporan & Ekspor CSV (`/api/reports`)

Parameter `format=csv` atau `export=csv` pada endpoint berikut akan menghasilkan berkas download CSV berstandar RFC-4180:

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/valuation` | ADMIN, MANAGER | Laporan total valuasi aset inventaris dan nilai pokok barang. |
| `GET` | `/api/reports/stock-card/:productId` | ADMIN, MANAGER | Buku Kartu Stok Ledger dengan saldo berjalan (*running balance*). |
| `GET` | `/api/reports/mutations` | ADMIN, MANAGER | Laporan mutasi barang masuk dan keluar berdasarkan rentang tanggal. |
| `GET` | `/api/reports/expiry` | ADMIN, MANAGER | Laporan usia simpan dan risiko kedaluwarsa seluruh batch. |

---

### I. Pencadangan & Integritas Basis Data (`/api/system`)

| Metode | Endpoint | Hak Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/system/integrity` | ADMIN | Menguji integritas relasi referensial dan anomali saldo database. |
| `GET` | `/api/system/backups` | ADMIN | Menampilkan daftar berkas cadangan snapshot SQL Dump. |
| `POST` | `/api/system/backup` | ADMIN | Membuat snapshot cadangan basis data SQL Dump baru. |
| `POST` | `/api/system/restore` | ADMIN | Memulihkan basis data secara transaksional dari berkas snapshot terpilih. |
