# Panduan Setup Google Sheets untuk Database Losmen

Karena bot ini menggunakan arsitektur Hybrid, data utama seperti **Ketersediaan** dan **Harga** bisa Anda atur secara manual dari Google Sheets melalui HP/PC. Sistem akan menyinkronisasi data ini setiap 5 menit (atau saat di-*restart*).

## 1. Format Tabel Google Sheets
Buat Spreadsheet baru di akun Google Anda, beri nama apapun (misal: "Data Losmen WA Bot"). 
Pada Sheet pertama (Tab paling kiri bawah), buat Header di **BARIS 1** dengan nama kolom persis seperti berikut:

| Tipe Kamar | Harga | Tersedia | Fasilitas |
| :--- | :--- | :--- | :--- |
| Standard | 150000 | 2 | Kipas Angin, Kamar Mandi Luar |
| Deluxe | 250000 | 0 | AC, TV, Kamar Mandi Dalam |
| VIP | 350000 | 1 | AC, Kulkas, Water Heater, Sarapan |

**Keterangan Kolom:**
- `Tipe Kamar`: Nama kamar (teks).
- `Harga`: Harga per malam dalam angka (jangan dikasih Rp atau titik, biarkan angka saja misal `150000`).
- `Tersedia`: Jumlah tipe kamar ini yang tersedia/kosong. Jika penuh, ketik `0`.
- `Fasilitas`: Deskripsi fasilitas bebas yang akan diinfo ke tamu.

## 2. Setting Google Service Account (Agar Bot Bisa Membaca)
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

## 3. Share Spreadsheet ke Service Account
1. Buka Google Sheet Data Losmen Anda.
2. Klik tombol **Share** (Bagikan) warna hijau di kanan atas.
3. Paste alamat email Service Account (contoh: `bot-sheets@...iam.gserviceaccount.com`).
4. Beri akses sebagai **Viewer** (Pelihat) cukup (karena bot hanya membaca).
5. Selesai! Copy **Sheet ID** yang ada di URL Spreadsheet Anda.
   *(Contoh URL: `https://docs.google.com/spreadsheets/d/1X2Y3Z.../edit`, ID-nya adalah `1X2Y3Z...`)*
6. Masukkan Sheet ID tersebut ke dalam file `.env` di VPS.

Kini setiap kali Anda merubah data dari Google Sheet di HP Anda, maksimal dalam 5 menit, jawaban bot akan otomatis ter-update sesuai ketersediaan terbaru!
