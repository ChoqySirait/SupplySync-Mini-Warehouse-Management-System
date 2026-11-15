# Strategi & Dokumentasi Pengujian Kualitas (Testing & QA)

Dokumen ini menjelaskan metodologi pengujian, arsitektur *test suite*, cakupan skenario pengujian, dan instruksi eksekusi pengujian otomatis pada **SupplySync Enterprise Warehouse Management System**.

---

## 1. Filosofi & Metodologi Pengujian

Sistem SupplySync mengadopsi prinsip **Deterministic In-Memory Isolation**:
- **Eksekusi Cepat & Andal**: Pengujian memanfaatkan Test Runner bawaan Node.js (`node:test` dan `node:assert/strict`) tanpa overhead pustaka eksternal yang lambat.
- **Zero-Socket Dependency**: Pengujian unit dan logika bisnis inti berjalan menggunakan mesin koneksi tiruan (*mock database engine*) yang mensimulasikan mekanisme transaksi basis data, baris kunci (*row lock*), dan pengembalian (*rollback*), sehingga pengujian dapat dieksekusi secara instan (seluruh 134 pengujian selesai dalam waktu ~1 detik).
- **Cakupan Komprehensif**: Menguji skenario batas (*edge cases*), alur kegagalan, validasi skema, konkurensi simultan, dan siklus end-to-end.

---

## 2. Cakupan Test Suite (134 Pengujian / 29 Suites)

| Berkas Pengujian | Jumlah Test | Fokus Pengujian |
| :--- | :---: | :--- |
| `tests/fefoEngine.test.js` | 8 | Logika pemotongan batch FEFO, tiebreaker FIFO, multi-batch depletion, dan pencegahan stok minus. |
| `tests/concurrency.test.js` | 2 | Simulasi penguncian baris `SELECT FOR UPDATE` saat dua pesanan simultan memperebutkan stok yang sama. |
| `tests/e2e.test.js` | 2 | Siklus hidup penuh: Login -> Buat PO -> Setujui PO -> Terima GRN -> Alokasi FEFO -> Opname -> Kartu Stok CSV. |
| `tests/transfer.test.js` | 10 | Matriks pengujian transfer antar-fasilitas (In-transit, Full/Partial Receipt, Rollback Pembatalan). |
| `tests/order.test.js` | 10 | Pengadaan PO, persetujuan bertingkat, penerimaan barang, dan penerbitan Surat Jalan SO. |
| `tests/replenishment.test.js` | 17 | Prediktor kehabisan stok, run-rate harian, klasifikasi 4-tier usia batch simpan, dan Reorder PO otomatis. |
| `tests/rbac.test.js` | 12 | Penegakan izin ADMIN, MANAGER, STAFF, serta pengujian isolasi fasilitas (`requireFacilityScope`). |
| `tests/security.test.js` | 6 | Derivasi password scrypt NIST, tamper-resistance token JWT, kedaluwarsa, dan pencabutan token logout. |
| `tests/validator.test.js` | 15 | Validasi skema request body Express (SKU, kuantitas positif, format tanggal ISO, alasan pemusnahan). |
| `tests/stockLedger.test.js` | 4 | Perhitungan saldo berjalan Buku Kartu Stok (*Running Balance*), saldo awal, dan audit mutasi. |
| `tests/backup.test.js` | 7 | Verifikasi integritas relasi skema, deteksi batch yatim, skor kesehatan DB, dan SQL Dump snapshot generator. |
| `tests/csvParser.test.js` | 5 | Serialisasi dan deserialisasi data CSV sesuai RFC-4180 (karakter kutip ganda, koma, line break). |
| `tests/barcode.test.js` | 5 | Pembuatan elemen visual SVG Code 39 untuk SKU dan barcode rak bin secara presisi. |
| `tests/analytics.test.js` | 3 | Valuasi total nilai aset inventaris, biaya pokok (COGS), dan skor kesegaran kesiapan FEFO. |
| `tests/app.test.js` | 8 | Pemasangan security headers, handler error 404, rate limiter, dan penolakan request tanpa token. |
| `tests/authMiddleware.test.js` | 8 | Unit test middleware otentikasi Bearer dan pelindung endpoint mutasi. |
| `tests/import.test.js` | 12 | Validasi impor massal produk dan batch melalui format berkas CSV. |

---

## 3. Cara Menjalankan Pengujian

### Menjalankan Seluruh Test Suite:
```bash
npm test
```

### Menjalankan Berkas Pengujian Tertentu:
```bash
# Uji konkurensi penguncian transaksi
node --test tests/concurrency.test.js

# Uji integrasi end-to-end
node --test tests/e2e.test.js

# Uji keamanan dan otentikasi NIST
node --test tests/security.test.js

# Uji transfer antar-gudang
node --test tests/transfer.test.js
```

---

## 4. Integrasi Berkelanjutan (CI/CD Pipeline)

Workflow GitHub Actions terkonfigurasi pada `.github/workflows/ci.yml`:
1. Menjalankan pipeline otomatis pada setiap *push* dan *pull request* ke branch `main`.
2. Menguji kompatibilitas matrix Node.js LTS (versi 20.x dan 22.x).
3. Mengeksekusi seluruh 134 uji otomatis backend (`npm test`).
4. Memvalidasi kompilasi build frontend modern React + TypeScript + Tailwind CSS (`npm run build --prefix frontend`).
