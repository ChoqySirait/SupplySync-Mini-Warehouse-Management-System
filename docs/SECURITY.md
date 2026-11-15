# Kebijakan Keamanan & Hardening SupplySync Enterprise WMS

Dokumen ini merinci postur keamanan, analisis ancaman (*threat modeling*), mekanisme kriptografi, dan mitigasi celah keamanan yang diterapkan pada **SupplySync Enterprise Warehouse Management System**.

---

## 1. Analisis Postur & Remediasi Celah Kritis

Dalam audit repository awal (Phase 1), ditemukan beberapa celah keamanan kritikal yang kini telah diperbaiki secara tuntas:

| Masalah Keamanan Lama | Tingkat Risiko | Status Remediasi | Solusi yang Diterapkan |
| :--- | :--- | :--- | :--- |
| Auto-Login Administrator tanpa otentikasi | **CRITICAL** | **TERSELESAIKAN** | Dinonaktifkan sepenuhnya. Setiap akses mutasi dan sesi wajib melalui form otentikasi sah. |
| Fallback ke akun demo (`DEMO_USERS`) saat DB error | **CRITICAL** | **TERSELESAIKAN** | Seluruh struktur akun tiruan dan bypass demo dihapus total dari kode produksi. |
| Password verifikasi menerima teks polos atau format rusak | **CRITICAL** | **TERSELESAIKAN** | Diperketat dengan format NIST scrypt. Input format hash rusak langsung ditolak secara aman tanpa *exception crash*. |
| JWT Secret statis bawaan dalam repositori | **HIGH** | **TERSELESAIKAN** | Wajib membaca `process.env.JWT_SECRET`. Server menolak secret default tidak aman pada mode produksi. |
| Tidak ada mekanisme pembatalan sesi (*Logout Revocation*) | **MEDIUM** | **TERSELESAIKAN** | Disediakan modul penarikan token (*Token Blacklist Invalidation*) dengan pembersihan memori otomatis. |
| Kurangnya isolasi data staf antar-cabang | **HIGH** | **TERSELESAIKAN** | Middleware `requireFacilityScope` menolak upaya staf cabang mengakses atau memutasi barang cabang lain. |

---

## 2. Kriptografi & Penyimpanan Kredensial

### A. Algoritma Hashing Kata Sandi
SupplySync menggunakan fungsi derivasi kunci **NIST-compliant scrypt** melalui pustaka bawaan `crypto` Node.js:
- **Panjang Salt**: 16 bytes random cryptographically secure (`crypto.randomBytes(16)`).
- **Panjang Kunci Derivasi**: 64 bytes.
- **Format Hash Tersimpan**: `scrypt$<hex_salt>$<hex_key>`.
- **Perbandingan Aman**: Pengecekan kecocokan hash menggunakan `crypto.timingSafeEqual` dengan verifikasi panjang buffer defensif guna mencegah serangan analisis waktu (*Timing Attacks*).

### B. Otentikasi Berbasis JSON Web Token (JWT)
- Menggunakan algoritma enkripsi tanda tangan HMAC-SHA256 (`HS256`).
- Waktu kedaluwarsa token dibatasi (default: 8 jam kerja) untuk mencegah pembajakan sesi jangka panjang.
- Payload token membawa identitas pengguna: `userId`, `username`, `role`, dan `facility_id`.

### C. Mekanisme Logout & Pembatalan Token (Revocation)
Saat pengguna menekan tombol *Keluar (Logout)*:
1. Klien mengirim permintaan ke `POST /api/auth/logout`.
2. Backend mencatat token tersebut ke dalam set daftar hitam (*blacklist*).
3. Middleware otentikasi memeriksa daftar hitam sebelum memproses setiap permintaan API berikutnya, memastikan token yang telah logout tidak dapat dipakai kembali sekalipun masa berlakunya belum habis.

---

## 3. Matriks Otorisasi Peran (Role-Based Access Control / RBAC)

Sistem membedakan tiga tingkatan peran pengguna secara ketat:

| Fitur / Modul Operasional | ADMIN | MANAGER | STAFF |
| :--- | :---: | :---: | :---: |
| Akses Ringkasan Dashboard | ✅ Seluruh Cabang | ✅ Seluruh Cabang | ✅ Hanya Cabang Sendiri |
| Melihat Katalog Produk & Batch | ✅ | ✅ | ✅ |
| Tambah / Ubah Produk Master | ✅ | ✅ | ❌ (Read-Only) |
| Mutasi Inbound & Outbound FEFO | ✅ | ✅ | ✅ (Cabang Sendiri) |
| Pemusnahan Barang (Disposal) | ✅ | ✅ | ❌ |
| Rekonsiliasi Fisik (Stock Opname) | ✅ | ✅ | ✅ (Cabang Sendiri) |
| Kirim & Terima Transfer Antar-Gudang | ✅ | ✅ | ✅ (Sesuai Cabang) |
| Persetujuan Purchase Order (PO Approve) | ✅ | ✅ | ❌ |
| Konfirmasi Sales Order (SO Confirm) | ✅ | ✅ | ❌ |
| Manajemen Akun Pengguna (CRUD Users) | ✅ | ❌ | ❌ |
| Pusat Laporan & Ekspor CSV Excel | ✅ | ✅ | ❌ |
| Pencadangan & Pemulihan Database (Backup) | ✅ | ❌ | ❌ |

---

## 4. Perlindungan Lapisan Jaringan & HTTP Headers

Backend Express dilengkapi dengan perlindungan header keamanan standar industri (*Defensive in Depth*):

1. **Anti-Clickjacking**: `X-Frame-Options: DENY` (Mencegah aplikasi disematkan di dalam iframe berbahaya).
2. **Anti-MIME Sniffing**: `X-Content-Type-Options: nosniff`.
3. **Cross-Site Scripting (XSS)**: `X-XSS-Protection: 1; mode=block` dan Content Security Policy (CSP) ketat.
4. **Pembatasan Laju Permintaan (Rate Limiting)**:
   - Middleware `express-rate-limit` membatasi lalu lintas API hingga 200 permintaan per jendela 15 menit per IP alamat guna memitigasi serangan *Brute-Force* dan *Denial-of-Service (DoS)*.
5. **CORS Allowlist**: Permintaan lintas asal hanya diperbolehkan dari domain terpercaya yang tertera pada variabel lingkungan `CORS_ORIGIN`.
