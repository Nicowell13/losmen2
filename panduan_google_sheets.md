# Panduan Setup Google Sheets untuk Database Losmen

Karena bot ini menggunakan arsitektur Hybrid, data utama seperti **Ketersediaan** dan **Harga** bisa Anda atur secara manual dari Google Sheets melalui HP/PC. Sistem akan menyinkronisasi data ini setiap 5 menit (atau saat di-*restart*).

## 1. Format Sheet 1: Data Kamar

Buat Spreadsheet baru di akun Google Anda, beri nama apapun (misal: "Data Losmen WA Bot"). 
Pada Sheet pertama (Tab paling kiri bawah), buat Header di **BARIS 1** dengan nama kolom persis seperti berikut:

| Tipe Kamar | Harga | Total Kamar | Fasilitas |
| :--- | :--- | :--- | :--- |
| Standard | 150000 | 3 | Kipas Angin, Kamar Mandi Luar |
| Deluxe | 250000 | 2 | AC, TV, Kamar Mandi Dalam |
| VIP | 350000 | 1 | AC, Kulkas, Water Heater, Sarapan |

**Keterangan Kolom:**
- `Tipe Kamar`: Nama tipe kamar (teks).
- `Harga`: Harga per malam dalam angka (jangan dikasih Rp atau titik, biarkan angka saja misal `150000`).
- `Total Kamar`: **Jumlah total kamar** untuk tipe ini (BUKAN sisa kamar). Contoh: jika ada 3 kamar Standard, tulis `3`.
- `Fasilitas`: Deskripsi fasilitas bebas yang akan diinfo ke tamu.

> ⚠️ **PERUBAHAN!** Kolom lama `Tersedia` kini diganti menjadi `Total Kamar`. Bot akan menghitung ketersediaan secara otomatis berdasarkan data booking di Sheet 3.

## 2. Format Sheet 2 (Opsional): Info Losmen

Pada tab/sheet ke-2, buat tabel Key-Value untuk informasi umum:

| Key | Value |
| :--- | :--- |
| checkin | Check-in: 14:00, Check-out: 12:00 |
| wifi | Password WiFi: losmen123 |
| breakfast | Sarapan tersedia jam 07:00-09:00 |

## 3. Format Sheet 3: Data Booking ✨ **BARU!**

Pada tab/sheet ke-3, beri nama "Booking" dan buat Header di **BARIS 1**:

| Nama Tamu | No HP | Tipe Kamar | Check In | Check Out | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Budi Santoso | 628111222333 | Deluxe | 15/04/2026 | 17/04/2026 | Confirmed |
| Ani Wijaya | 628444555666 | Deluxe | 16/04/2026 | 18/04/2026 | Confirmed |
| Rudi Hartono | 628777888999 | VIP | 14/04/2026 | 16/04/2026 | Checked In |
| Siti Aminah | 628222333444 | Standard | 10/04/2026 | 12/04/2026 | Checked Out |

**Keterangan Kolom:**
- `Nama Tamu`: Nama lengkap tamu.
- `No HP`: Nomor WhatsApp tamu (format: 628xxx).
- `Tipe Kamar`: Harus **sama persis** dengan nama di Sheet 1 (Standard/Deluxe/VIP/dll).
- `Check In`: Tanggal check-in. Format: `dd/mm/yyyy` (contoh: `15/04/2026`) atau `yyyy-mm-dd`.
- `Check Out`: Tanggal check-out. Format sama dengan Check In.
- `Status`: Status booking. Pilihan:
  - `Confirmed` — Booking sudah dikonfirmasi, kamar dihitung terisi.
  - `Checked In` — Tamu sudah masuk, kamar dihitung terisi.
  - `Checked Out` / `Selesai` — Tamu sudah keluar, kamar dihitung kosong.
  - `Cancelled` / `Batal` — Booking dibatalkan, kamar dihitung kosong.

### Cara Kerja Otomatis

Bot akan menghitung **ketersediaan kamar secara real-time** dengan rumus:

```
Kamar Tersedia = Total Kamar (Sheet 1) - Booking Aktif pada tanggal tersebut (Sheet 3)
```

**Contoh:**
- Sheet 1: Deluxe punya `Total Kamar = 2`
- Sheet 3: Tanggal 16/04 ada 2 booking Deluxe yang statusnya Confirmed
- Hasil: Deluxe pada 16/04 = 2 - 2 = **0 (PENUH)**

### Fitur Baru yang Didukung

1. **Cek tanggal spesifik**: Tamu bisa tanya *"ada kamar kosong tanggal 20 April?"*
2. **Cek hari ini/besok/lusa**: Tamu bisa tanya *"besok ada kamar kosong?"*
3. **Cek hari tertentu**: Tamu bisa tanya *"hari Sabtu ada kamar?"*
4. **Kalender 1 minggu**: Jika tamu tidak sebut tanggal, bot otomatis tampilkan ketersediaan 7 hari ke depan.

## 4. Setting Google Service Account (Agar Bot Bisa Membaca)
Karena privasi data, bot tidak sembarangan bisa membaca sheet Google milik Anda. Anda harus memberikan akses.
Ikuti langkah ini untuk membuat "Service Account":

1. Buka [Google Cloud Console](https://console.cloud.google.com).
2. Buat Project baru bernama "Bot Losmen".
3. Cari "Google Sheets API" di bilah pencarian, lalu klik **Enable** (Aktifkan).
4. Masuk ke menu **IAM & Admin -> Service Accounts**.
5. Klik **Create Service Account**. Beri nama "bot-sheets" lalu selesaikan.
6. Setelah jadi, klik alamat email dari akun service tersebut (bentuknya mirip `bot-sheets@...iam.gserviceaccount.com`).
7. Buka tab **KEYS**, klik **Add Key** -> **Create New Key**, dan pilih format **JSON**. (File akan terdownload ke PC Anda).
8. Buka file JSON tersebut, perhatikan isi `"client_email"` dan `"private_key"`. Masukkan isinya ke dalam file `.env` di VPS.

## 5. Share Spreadsheet ke Service Account
1. Buka Google Sheet Data Losmen Anda.
2. Klik tombol **Share** (Bagikan) warna hijau di kanan atas.
3. Paste alamat email Service Account (contoh: `bot-sheets@...iam.gserviceaccount.com`).
4. Beri akses sebagai **Viewer** (Pelihat) cukup (karena bot hanya membaca).
5. Selesai! Copy **Sheet ID** yang ada di URL Spreadsheet Anda.
   *(Contoh URL: `https://docs.google.com/spreadsheets/d/1X2Y3Z.../edit`, ID-nya adalah `1X2Y3Z...`)*
6. Masukkan Sheet ID tersebut ke dalam file `.env` di VPS.

Kini setiap kali Anda merubah data dari Google Sheet di HP Anda, maksimal dalam 5 menit, jawaban bot akan otomatis ter-update sesuai ketersediaan terbaru!
