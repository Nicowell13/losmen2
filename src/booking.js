const db = require('./db');
const config = require('./config');
const { sendReply } = require('./waha');

// ============================================================
// Booking State Machine via WhatsApp Chat
// Flow: nama → usia → no_ktp → tipe_kamar → tanggal_masuk → konfirmasi
// ============================================================
const bookingStates = new Map();

const BOOKING_TIMEOUT = 10 * 60 * 1000; // 10 menit timeout booking
const bookingTimers = new Map();

/**
 * Cek apakah user sedang dalam booking flow
 */
function isInBookingFlow(userPhone) {
  return bookingStates.has(userPhone);
}

/**
 * Mulai booking flow untuk user
 */
function startBookingFlow(userPhone) {
  bookingStates.set(userPhone, {
    step: 'ask_name',
    data: {
      userPhone: userPhone,
    },
    startedAt: Date.now(),
  });
  resetBookingTimer(userPhone);

  const csName = config.losmen.csName || 'Sari';
  return `Wah, senang sekali Kakak tertarik ngekos di *${config.losmen.name}*! 🥰\n\nUntuk proses pendaftaran, aku butuh beberapa data ya Kak. Tenang, aman kok! 🔒\n\n*Langkah 1/5* — Siapa nama lengkap Kakak?\n\n_(Ketik "batal" kapan saja untuk membatalkan)_\n- ${csName} 💛`;
}

/**
 * Proses input dari user saat dalam booking flow
 * @returns {string} Pesan balasan bot
 */
async function processBookingStep(userPhone, userText) {
  const state = bookingStates.get(userPhone);
  if (!state) return null;

  const text = userText.trim();

  // Cek batal
  if (text.toLowerCase() === 'batal' || text.toLowerCase() === 'cancel') {
    cancelBooking(userPhone);
    const csName = config.losmen.csName || 'Sari';
    return `Baik Kak, pendaftaran dibatalkan. Kalau nanti berubah pikiran, langsung chat aku lagi ya! 😊\n- ${csName} 💛`;
  }

  resetBookingTimer(userPhone);
  const csName = config.losmen.csName || 'Sari';

  switch (state.step) {
    // ---- Step 1: Nama ----
    case 'ask_name': {
      if (text.length < 2) {
        return `Mohon maaf Kak, tolong masukkan nama lengkap ya (minimal 2 karakter) 🙏`;
      }
      state.data.nama = text;
      state.step = 'ask_age';
      return `Terima kasih, *${state.data.nama}* 😊\n\n*Langkah 2/5* — Berapa usia Kakak saat ini?`;
    }

    // ---- Step 2: Usia ----
    case 'ask_age': {
      const age = parseInt(text);
      if (isNaN(age) || age < 15 || age > 100) {
        return `Mohon masukkan usia yang valid ya Kak (angka, misalnya: 25) 🙏`;
      }
      state.data.usia = age;
      state.step = 'ask_ktp';
      return `Oke, usia *${age} tahun* ✅\n\n*Langkah 3/5* — Boleh minta nomor KTP/NIK Kakak? (16 digit)\n\n_Data ini hanya untuk administrasi, aman dan rahasia 🔒_`;
    }

    // ---- Step 3: No KTP ----
    case 'ask_ktp': {
      const ktp = text.replace(/\s/g, '');
      if (!/^\d{16}$/.test(ktp)) {
        return `Nomor KTP harus 16 digit angka ya Kak. Coba cek lagi 🙏\nContoh: 3171234567890001`;
      }
      state.data.noKtp = ktp;
      state.step = 'ask_tipe';

      // Tampilkan tipe kamar yang tersedia
      const kamarList = db.getAvailabilityData();
      let kamarInfo = kamarList.map((k, i) => {
        return `*${i + 1}.* ${k.tipe} — Rp${k.harga.toLocaleString('id-ID')}/bulan`;
      }).join('\n');

      return `KTP tercatat ✅\n\n*Langkah 4/5* — Pilih tipe kamar:\n\n${kamarInfo}\n\nBalas dengan *angka* (1 atau 2) untuk memilih tipe kamar.`;
    }

    // ---- Step 4: Tipe Kamar ----
    case 'ask_tipe': {
      const kamarList = db.getAvailabilityData();
      const choice = parseInt(text);

      if (isNaN(choice) || choice < 1 || choice > kamarList.length) {
        return `Pilih angka 1-${kamarList.length} ya Kak 🙏`;
      }

      const selected = kamarList[choice - 1];
      state.data.tipeKamar = selected.tipe;
      state.data.harga = selected.harga;
      state.step = 'ask_tanggal';
      return `Tipe *${selected.tipe}* — Rp${selected.harga.toLocaleString('id-ID')}/bulan ✅\n\n*Langkah 5/5* — Kapan rencana mulai ngekos?\n\nBalas dengan format tanggal, contoh:\n• *15/05/2026*\n• *besok*\n• *tanggal 20*`;
    }

    // ---- Step 5: Tanggal Masuk ----
    case 'ask_tanggal': {
      // Gunakan handler untuk parse tanggal
      const handler = require('./handler');
      const dateInfo = handler.extractDateFromText(text);

      if (!dateInfo) {
        return `Maaf Kak, aku tidak bisa membaca tanggalnya. Coba format:\n• *15/05/2026*\n• *besok*\n• *tanggal 20*\n• *minggu depan*`;
      }

      const tanggalStr = db.formatDate(dateInfo.date);
      state.data.tanggalMasuk = dateInfo.date;
      state.data.tanggalMasukStr = tanggalStr;

      // Hitung check-out (1 bulan setelah check-in)
      const checkOut = new Date(dateInfo.date);
      checkOut.setMonth(checkOut.getMonth() + 1);
      state.data.tanggalKeluar = checkOut;
      state.data.tanggalKeluarStr = db.formatDate(checkOut);

      state.step = 'confirm';

      return `📋 *RINGKASAN PENDAFTARAN KOS*\n\n` +
        `👤 Nama: *${state.data.nama}*\n` +
        `🎂 Usia: *${state.data.usia} tahun*\n` +
        `🪪 KTP: *${state.data.noKtp}*\n` +
        `🏠 Tipe: *${state.data.tipeKamar}*\n` +
        `💰 Harga: *Rp${state.data.harga.toLocaleString('id-ID')}/bulan*\n` +
        `📅 Mulai: *${tanggalStr}*\n` +
        `📅 s.d.: *${state.data.tanggalKeluarStr}*\n` +
        `💳 Deposit: *Rp 1.500.000 (refundable)*\n\n` +
        `Apakah data di atas sudah benar?\n\n` +
        `Balas *YA* untuk konfirmasi atau *BATAL* untuk membatalkan.`;
    }

    // ---- Step 6: Konfirmasi ----
    case 'confirm': {
      const answer = text.toLowerCase();
      if (answer === 'ya' || answer === 'iya' || answer === 'y' || answer === 'ok' || answer === 'oke' || answer === 'benar' || answer === 'betul') {
        return await confirmBooking(userPhone);
      } else if (answer === 'batal' || answer === 'tidak' || answer === 'no' || answer === 'cancel') {
        cancelBooking(userPhone);
        return `Pendaftaran dibatalkan. Kalau berubah pikiran, langsung chat aku lagi ya Kak! 😊\n- ${csName} 💛`;
      } else {
        return `Balas *YA* untuk konfirmasi atau *BATAL* untuk membatalkan ya Kak 🙏`;
      }
    }

    default:
      cancelBooking(userPhone);
      return `Maaf Kak, terjadi kesalahan. Silakan ketik "booking" untuk memulai ulang 🙏`;
  }
}

/**
 * Konfirmasi & simpan booking ke database + notifikasi CS
 */
async function confirmBooking(userPhone) {
  const state = bookingStates.get(userPhone);
  if (!state) return 'Data booking tidak ditemukan.';

  const d = state.data;
  const csName = config.losmen.csName || 'Sari';

  try {
    // 1. Simpan ke database
    const booking = await db.createBooking({
      nama_tamu: d.nama,
      no_hp: userPhone.replace('@c.us', '').replace('@lid', ''),
      tipe_kamar: d.tipeKamar,
      check_in: d.tanggalMasuk.toISOString().split('T')[0],
      check_out: d.tanggalKeluar.toISOString().split('T')[0],
      status: 'pending',
      catatan: `Usia: ${d.usia} | KTP: ${d.noKtp} | Via: WhatsApp Chat`
    });

    console.log(`[Booking] Booking baru #${booking.id} dari ${d.nama} (${userPhone})`);

    // 2. Kirim notifikasi ke CS booking (via WhatsApp)
    const csPhone = config.losmen.csBookingPhone;
    if (csPhone) {
      const notifMsg = `🔔 *BOOKING BARU #${booking.id}*\n\n` +
        `👤 Nama: ${d.nama}\n` +
        `🎂 Usia: ${d.usia} tahun\n` +
        `🪪 KTP: ${d.noKtp}\n` +
        `📱 WA: ${userPhone.replace('@c.us', '').replace('@lid', '')}\n` +
        `🏠 Tipe: ${d.tipeKamar}\n` +
        `💰 Harga: Rp${d.harga.toLocaleString('id-ID')}/bulan\n` +
        `📅 Check-in: ${d.tanggalMasukStr}\n` +
        `📅 Check-out: ${d.tanggalKeluarStr}\n` +
        `📝 Status: PENDING\n\n` +
        `Silakan hubungi penghuni untuk konfirmasi pembayaran deposit.`;

      try {
        await sendReply(csPhone + '@c.us', notifMsg);
        console.log(`[Booking] Notifikasi terkirim ke CS: ${csPhone}`);
      } catch (err) {
        console.error(`[Booking] Gagal kirim notif ke CS: ${err.message}`);
      }
    }

    // 3. Clear booking state
    cancelBooking(userPhone);

    // 4. Balas ke customer
    return `✅ *PENDAFTARAN BERHASIL!*\n\n` +
      `Booking #${booking.id} atas nama *${d.nama}* sudah tercatat di sistem kami.\n\n` +
      `📌 *Langkah selanjutnya:*\n` +
      `1. Admin kami akan menghubungi Kakak untuk konfirmasi\n` +
      `2. Pembayaran deposit Rp 1.500.000 (refundable)\n` +
      `3. Pembayaran bulan pertama Rp${d.harga.toLocaleString('id-ID')}\n\n` +
      `Terima kasih sudah memilih *${config.losmen.name}*! 🏠✨\n- ${csName} 💛`;

  } catch (err) {
    console.error('[Booking] Error:', err.message);
    cancelBooking(userPhone);
    return `Mohon maaf Kak, terjadi gangguan saat menyimpan data. Silakan coba lagi nanti atau hubungi admin di ${config.losmen.phone} 🙏\n- ${csName} 💛`;
  }
}

/**
 * Batalkan booking flow
 */
function cancelBooking(userPhone) {
  bookingStates.delete(userPhone);
  clearBookingTimer(userPhone);
}

/**
 * Reset timeout timer (10 menit)
 */
function resetBookingTimer(userPhone) {
  clearBookingTimer(userPhone);
  const timer = setTimeout(() => {
    if (bookingStates.has(userPhone)) {
      bookingStates.delete(userPhone);
      const csName = config.losmen.csName || 'Sari';
      sendReply(userPhone, `⏰ Sesi pendaftaran kos telah berakhir karena tidak ada aktivitas selama 10 menit.\n\nKalau mau lanjut, ketik "booking" lagi ya Kak! 😊\n- ${csName} 💛`)
        .catch(err => console.error('[Booking Timeout]', err.message));
    }
  }, BOOKING_TIMEOUT);
  bookingTimers.set(userPhone, timer);
}

function clearBookingTimer(userPhone) {
  const timer = bookingTimers.get(userPhone);
  if (timer) {
    clearTimeout(timer);
    bookingTimers.delete(userPhone);
  }
}

module.exports = {
  isInBookingFlow,
  startBookingFlow,
  processBookingStep,
  cancelBooking,
};
