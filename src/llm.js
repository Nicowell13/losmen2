const axios = require('axios');
const config = require('./config');

/**
 * Panggil Ollama dengan timeout protection.
 * Jika Ollama mati/hang, akan return null setelah 25 detik (bukan hang selamanya).
 */
async function callOllama(prompt, system, temperature = 0.3) {
  try {
    const res = await axios.post(`${config.ollama.url}/api/generate`, {
      model: config.ollama.model,
      prompt: prompt,
      system: system,
      stream: false,
      options: {
        temperature: temperature,
        num_predict: 200 // Naikkan sedikit untuk jawaban ketersediaan yang lebih detail
      }
    }, {
      timeout: config.ollama.timeout // 25 detik timeout
    });
    return res.data.response;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error("[Ollama Timeout] Request melebihi batas waktu.");
    } else {
      console.error("[Ollama Error]", error.message);
    }
    return null;
  }
}

/**
 * Deteksi Intent secara cepat menggunakan keyword-first + LLM fallback.
 * Keyword check ~0ms, LLM hanya dipanggil jika keyword tidak match.
 */
async function detectIntent(userText) {
  const text = userText.toLowerCase();

  // ====== TAHAP 1: Keyword Matching (Instan, 0ms) ======
  const keywordMap = {
    tanya_harga: ['harga', 'berapa', 'tarif', 'biaya', 'rate', 'price', 'murah', 'mahal', 'diskon', 'promo'],
    tanya_ketersediaan: ['kosong', 'available', 'tersedia', 'ada kamar', 'booking', 'pesan kamar', 'book',
      'sedia', 'penuh', 'tanggal', 'besok', 'lusa', 'minggu depan', 'hari ini',
      'check in', 'checkin', 'cek in', 'kapan', 'jadwal'],
    booking: ['booking', 'pesan', 'reservasi', 'book', 'daftar', 'form', 'mau kamar', 'ambil kamar', 'mau nginap', 'mau menginap'],
    faq_lokasi: ['lokasi', 'alamat', 'dimana', 'di mana', 'maps', 'arah', 'jalan ke', 'posisi'],
    faq_fasilitas: ['fasilitas', 'ac', 'wifi', 'parkir', 'sarapan', 'breakfast', 'kolam', 'facility'],
    faq_checkin: ['jam masuk', 'jam keluar', 'checkout', 'check out'],
    greeting: ['halo', 'hai', 'hi', 'hello', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'assalamualaikum', 'permisi', 'pagi', 'siang', 'sore', 'malam']
  };

  // Prioritas: Jika ada kata kunci tanggal + booking, anggap tanya_ketersediaan
  const dateKeywords = ['tanggal', 'besok', 'lusa', 'hari ini', 'minggu depan', 'kapan'];
  const hasDateKeyword = dateKeywords.some(kw => text.includes(kw));

  if (hasDateKeyword) {
    // Cek apakah membahas ketersediaan atau booking
    const bookingWords = ['booking', 'pesan', 'reservasi', 'book', 'mau nginap', 'mau menginap'];
    if (bookingWords.some(kw => text.includes(kw))) {
      return 'booking';
    }
    return 'tanya_ketersediaan';
  }

  for (const [intent, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => text.includes(kw))) {
      return intent;
    }
  }

  // ====== TAHAP 2: LLM Fallback (Jika keyword tidak cocok) ======
  const systemPrompt = `Anda adalah NLU AI untuk sistem penginapan/losmen.
Tugas: deteksi intent dari pesan user.
Pilih SATU dari: tanya_harga, tanya_ketersediaan, booking, faq_lokasi, faq_fasilitas, faq_checkin, greeting, lainnya.
Balas hanya satu kata intent saja, tanpa penjelasan.`;

  const prompt = `Pesan: "${userText}"\nIntent:`;
  const response = await callOllama(prompt, systemPrompt, 0.1);

  if (!response) return "lainnya";

  const cleanResponse = response.trim().toLowerCase().replace(/[^a-z_]/g, '');
  const validIntents = ["tanya_harga", "tanya_ketersediaan", "booking", "faq_lokasi", "faq_fasilitas", "faq_checkin", "greeting", "lainnya"];

  return validIntents.includes(cleanResponse) ? cleanResponse : "lainnya";
}

/**
 * Generate balasan natural layaknya CS WhatsApp.
 */
async function generateResponse(intent, userText, dataContext) {
  const losmenName = config.losmen.name;

  const csName = config.losmen.csName || 'Sari';

  const systemPrompt = `Kamu adalah ${csName}, Customer Service WhatsApp di "${losmenName}" (penginapan).
Kamu wanita 25 tahun yang ramah, sopan, dan persuasif. Bahasa casual tapi sopan.

ATURAN SUPER KETAT (WAJIB DIIKUTI TEPAT):
1. Jawab MAKSIMAL 4-5 kalimat. Terlalu panjang akan ditolak.
2. JIKA ADA [DATA KAMAR], [DATA], atau [KETERSEDIAAN], JANGAN MENGARANG HARGA/KETERSEDIAAN/TANGGAL. Sebutkan harga, status, dan tanggal persis sesuai data yang diberikan!
3. Jika ada data ketersediaan per tanggal, sebutkan tanggalnya dan kamar mana yang kosong/penuh.
4. Jika ditanya ketersediaan tapi ada kamar yang PENUH, sampaikan maaf untuk tipe tersebut lalu tawarkan tipe lain yang tersedia.
5. Jika semua kamar PENUH pada tanggal tersebut, sampaikan maaf dan sarankan tanggal lain.
6. Jika ada [LINK BOOKING], bagikan link tersebut ke tamu.
7. Akhiri dengan pertanyaan persuasif (contoh: "Mau booking di tanggal berapa Kak?").
8. Tanda tangani dengan "- ${csName} 💛" di baris baru paling bawah.`;

  let dataString = "";

  if (Array.isArray(dataContext) && dataContext.length > 0) {
    dataString = "[DATA KAMAR]\n" + dataContext.map(k => {
      if (k.tersedia > 0) {
        return `> Kamar ${k.tipe}: TERSEDIA (${k.tersedia} kamar). Harga: Rp${k.harga.toLocaleString('id-ID')} per malam. Fasilitas: ${k.fasilitas}`;
      } else {
        return `> Kamar ${k.tipe}: FULL/PENUH. Jangan ditawarkan.`;
      }
    }).join('\n');
  } else if (typeof dataContext === 'string') {
    dataString = dataContext;
  }

  const prompt = `${dataString ? dataString + '\n\n' : ''}Tamu: "${userText}"\nBalasan ${csName}:`;


  const response = await callOllama(prompt, systemPrompt, 0.2); // Turunkan temperature jadi 0.2 agar tidak halusinasi

  if (!response) {
    // Fallback statis per intent jika LLM mati
    const fallbacks = {
      tanya_harga: `Untuk info harga terbaru, silakan hubungi kami langsung ya Kak di ${config.losmen.phone} 🙏`,
      tanya_ketersediaan: `Mohon maaf Kak, untuk cek ketersediaan bisa langsung hubungi kami di ${config.losmen.phone} ya 🙏`,
      faq_lokasi: `${losmenName} berlokasi di ${config.losmen.address}. Maps: ${config.losmen.mapsLink} 📍`,
      greeting: `Halo Kak! Selamat datang di ${losmenName} 😊 Ada yang bisa kami bantu?`,
      default: `Mohon maaf Kak, admin sedang tidak bisa membalas otomatis. Silakan coba lagi nanti ya 🙏`
    };
    return fallbacks[intent] || fallbacks.default;
  }

  return response.trim().replace(/^"|"$/g, "");
}

module.exports = {
  detectIntent,
  generateResponse
};
