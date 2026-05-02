const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');
const memory = require('./memory');

// ============================================================
// LLM Response Cache
// Mengurangi beban Ollama untuk pertanyaan yang sering muncul
// ============================================================
const responseCache = new Map();
const MAX_CACHE_SIZE = 200; // Simpan maksimal 200 respons unik

function getCacheKey(historyStr, dataString, userText, intent) {
  const raw = `${intent}||${historyStr}||${dataString}||${userText.trim().toLowerCase()}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * Panggil Ollama (Qwen 2.5 1.5B) dengan timeout protection.
 * Jika Ollama mati/hang, akan return null setelah timeout (bukan hang selamanya).
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
        num_predict: 200 // Qwen 1.5B lebih efisien, bisa sedikit lebih panjang
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
    tanya_ketersediaan: ['kosong', 'available', 'tersedia', 'ada kamar', 'booking', 'pesan kamar', 'book', 'sedia', 'penuh'],
    booking: ['booking', 'pesan', 'reservasi', 'book', 'daftar', 'form', 'check in', 'checkin', 'mau kamar', 'ambil kamar', 'mau nginap', 'mau menginap'],
    faq_lokasi: ['lokasi', 'alamat', 'dimana', 'di mana', 'maps', 'arah', 'jalan ke', 'posisi'],
    faq_fasilitas: ['fasilitas', 'ac', 'wifi', 'parkir', 'sarapan', 'breakfast', 'kolam', 'facility'],
    faq_checkin: ['jam masuk', 'jam keluar', 'checkout', 'check out'],
    greeting: ['halo', 'hai', 'hi', 'hello', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'assalamualaikum', 'permisi', 'pagi', 'siang', 'sore', 'malam']
  };

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
 * @param {string} userPhone - Nomor HP user untuk mengambil riwayat chat
 */
async function generateResponse(intent, userText, dataContext, userPhone) {
  const losmenName = config.losmen.name;

  const csName = config.losmen.csName || 'Sari';

  const systemPrompt = `Kamu adalah ${csName}, Customer Service WhatsApp di "${losmenName}" (penginapan).
Kamu wanita 25 tahun yang ramah, sopan, dan persuasif. Bahasa casual tapi sopan.

ATURAN SUPER KETAT:
1. Jawab MAKSIMAL 3-4 kalimat. Terlalu panjang akan ditolak.
2. JIKA ADA [DATA KAMAR] ATAU [DATA], JANGAN MENGARANG HARGA/KETERSEDIAAN. Sebutkan harga dan status persis sama dengan data yang diberikan!
3. Jika ditanya ketersediaan tapi ada kamar yang PENUH, sampaikan maaf untuk tipe tersebut lalu tawarkan tipe lain yang tersedia.
4. JANGAN PERNAH membuat percakapan palsu. JANGAN MENGETIK kata "Tamu:" atau "${csName}:" di jawabanmu. Langsung tulis isi pesan balasanmu saja.
5. Akhiri pesan dengan pertanyaan persuasif (contoh: "Mau booking di tanggal berapa Kak?").
6. Tanda tangani dengan "- ${csName} 💛" di baris baru paling bawah.`;

  let dataString = "";

  if (Array.isArray(dataContext) && dataContext.length > 0) {
    dataString = "--- DATA KAMAR SAAT INI ---\n" + dataContext.map(k => {
      if (k.tersedia > 0) {
        return `> Kamar ${k.tipe}: TERSEDIA (${k.tersedia} kamar). Harga: Rp${k.harga.toLocaleString('id-ID')} per malam. Fasilitas: ${k.fasilitas}`;
      } else {
        return `> Kamar ${k.tipe}: FULL/PENUH. Jangan ditawarkan.`;
      }
    }).join('\n') + "\n---------------------------";
  } else if (typeof dataContext === 'string') {
    dataString = "--- INFORMASI ---\n" + dataContext + "\n-----------------";
  }

  // Ambil riwayat chat sebelumnya untuk konteks
  const historyStr = memory.formatHistoryForLLM(userPhone);

  // Cek Cache
  const cacheKey = getCacheKey(historyStr, dataString, userText, intent);
  if (responseCache.has(cacheKey)) {
    console.log(`[LLM Cache Hit] Menggunakan jawaban dari cache (Instan!)`);
    return responseCache.get(cacheKey);
  }

  const prompt = `${historyStr}${dataString ? dataString + '\n\n' : ''}PESAN TAMU SAAT INI:\n"${userText}"\n\nTULIS BALASANMU SEKARANG:`;


  const response = await callOllama(prompt, systemPrompt, 0.2); // Turunkan temperature jadi 0.2 agar tidak halusinasi

  if (!response) {
    // Fallback statis per intent jika LLM mati atau timeout
    const fallbacks = {
      tanya_harga: `Untuk info harga dan tipe kamar terbaru, silakan cek form booking kami atau hubungi admin di ${config.losmen.phone} 🙏`,
      tanya_ketersediaan: `Mohon maaf Kak, untuk cek ketersediaan kamar secara pasti bisa langsung hubungi kami di ${config.losmen.phone} ya 🙏`,
      booking: `Wah, mau pesan kamar Kak? Silakan langsung isi formulir booking di link berikut ya: ${config.losmen.bookingFormLink || 'Silakan hubungi admin.'} 😊`,
      faq_lokasi: `${losmenName} berlokasi di ${config.losmen.address}. Maps: ${config.losmen.mapsLink} 📍`,
      faq_fasilitas: `Fasilitas kami lengkap Kak! Ada AC, kamar mandi dalam, air panas, WiFi, dan parkir. Tertarik untuk booking? 😊`,
      faq_checkin: `Waktu check-in standar kami mulai jam 14:00 dan check-out maksimal jam 12:00 siang Kak. ⏰`,
      greeting: `Halo Kak! Selamat datang di ${losmenName} 😊 Ada yang bisa kami bantu hari ini?`,
      default: `Mohon maaf Kak, sistem AI kami sedang lambat. Untuk bantuan cepat, silakan hubungi admin di ${config.losmen.phone} 🙏`
    };
    return fallbacks[intent] || fallbacks.default;
  }

  const finalResponse = response.trim().replace(/^"|"$/g, "");

  // Simpan ke Cache
  if (responseCache.size >= MAX_CACHE_SIZE) {
    // Hapus 50 item terlama jika penuh
    const keys = Array.from(responseCache.keys());
    for(let i=0; i<50; i++) responseCache.delete(keys[i]);
  }
  responseCache.set(cacheKey, finalResponse);

  return finalResponse;
}

module.exports = {
  detectIntent,
  generateResponse
};
