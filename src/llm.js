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
        num_predict: 150 // Batasi output agar cepat (max ~150 token)
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
    faq_lokasi: ['lokasi', 'alamat', 'dimana', 'di mana', 'maps', 'arah', 'jalan ke', 'posisi'],
    faq_fasilitas: ['fasilitas', 'ac', 'wifi', 'parkir', 'sarapan', 'breakfast', 'kolam', 'facility'],
    faq_checkin: ['check in', 'checkin', 'check out', 'checkout', 'jam masuk', 'jam keluar'],
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
Pilih SATU dari: tanya_harga, tanya_ketersediaan, faq_lokasi, faq_fasilitas, faq_checkin, greeting, lainnya.
Balas hanya satu kata intent saja, tanpa penjelasan.`;

  const prompt = `Pesan: "${userText}"\nIntent:`;
  const response = await callOllama(prompt, systemPrompt, 0.1);

  if (!response) return "lainnya";

  const cleanResponse = response.trim().toLowerCase().replace(/[^a-z_]/g, '');
  const validIntents = ["tanya_harga", "tanya_ketersediaan", "faq_lokasi", "faq_fasilitas", "faq_checkin", "greeting", "lainnya"];

  return validIntents.includes(cleanResponse) ? cleanResponse : "lainnya";
}

/**
 * Generate balasan natural layaknya CS WhatsApp.
 */
async function generateResponse(intent, userText, dataContext) {
  const losmenName = config.losmen.name;

  const systemPrompt = `Anda adalah Customer Service WhatsApp "${losmenName}" (penginapan/losmen).
Jawab pertanyaan tamu dengan ramah, hangat, dan natural ala CS Indonesia.
Aturan:
1. JANGAN pernah bilang Anda AI/robot/bot. Anda adalah admin manusia.
2. Jawab SINGKAT, maksimal 2-3 kalimat saja seperti chat WA biasa.
3. Gunakan emoji secukupnya (jangan berlebihan).
4. Jika data tersedia, sertakan informasi spesifik dari [DATA].
5. Akhiri dengan kalimat ajakan/pertanyaan balik agar tamu tetap engaged.`;

  let dataString = "";

  if (Array.isArray(dataContext) && dataContext.length > 0) {
    dataString = dataContext.map(k =>
      `- ${k.tipe}: Rp${k.harga.toLocaleString('id-ID')}/malam, ${k.tersedia > 0 ? `sisa ${k.tersedia} kamar` : 'PENUH'} (${k.fasilitas})`
    ).join('\n');
  } else if (typeof dataContext === 'string') {
    dataString = dataContext;
  }

  const prompt = `[DATA]\n${dataString || 'Tidak ada data spesifik'}\n\nPesan Tamu: "${userText}"\nBalasan CS:`;

  const response = await callOllama(prompt, systemPrompt, 0.5);

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
