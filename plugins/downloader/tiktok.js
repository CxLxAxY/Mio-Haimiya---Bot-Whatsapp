const https = require('https');
const { settings } = require('../../settings');

/**
 * Format detik ke MM:SS atau HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const d = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(d).padStart(2, '0')}`;
  return `${m}:${String(d).padStart(2, '0')}`;
}

/**
 * Konversi Unix timestamp ke WIB (UTC+7)
 */
function formatWIB(unix) {
  if (!unix) return '-';
  const date = new Date(unix * 1000);
  return date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

/**
 * Fetch JSON dari onlym API via https
 */
function fetchFromAPI(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000, family: 4 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Gagal parse response API'));
        }
      });
    }).on('error', reject).on('timeout', function () {
      this.destroy();
      reject(new Error('Timeout API'));
    });
  });
}

module.exports = {
  command: 'tiktok',
  alias: ['tt', 'tiktokdown'],
  kategori: 'downloader',
  limit: true,
  premium: false,
  ownerOnly: false,

  run: async ({ sock, message, args, remoteJid }) => {
    // Ambil URL dari argumen
    const url = args.join(' ');
    if (!url) {
      return sock.sendMessage(remoteJid, {
        text: `*✧ Mio Haimiya ✧*\n\n` +
              `Cara pakai: .tiktok <url>\n` +
              `Contoh: .tiktok https://vm.tiktok.com/xxxxx\n\n` +
              `_Jangan lupa kasih URL TikTok-nya ya~_`
      }, { quoted: message });
    }

    // Validasi URL TikTok
    if (!/tiktok\.com/i.test(url)) {
      return sock.sendMessage(remoteJid, {
        text: `*✧ Mio Haimiya ✧*\n\n` +
              `E-eh... itu bukan URL TikTok! Coba kasih link yang bener ya~ ♡`
      }, { quoted: message });
    }

    const apiKey = settings.onlymApiKey || 'ONLYMAPIKEY';
    const apiURL = `https://onlym.my.id/download/tiktok?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(apiKey)}`;

    // Kirim loading
    await sock.sendMessage(remoteJid, {
      text: `*✧ Mio Haimiya ✧*\n\n` +
            `Tunggu bentar ya, aku lagi ambil data TikTok-nya... ♡`
    }, { quoted: message });

    let json;
    try {
      json = await fetchFromAPI(apiURL);
    } catch (err) {
      console.error('[TIKTOK] Error fetching API:', err.message);
      return sock.sendMessage(remoteJid, {
        text: `*✧ Mio Haimiya ✧*\n\n` +
              `Hiks... lagi error nih. Coba lagi nanti ya~`
      }, { quoted: message });
    }

    if (!json || !json.status || !json.result || !json.result.data) {
      const errMsg = json?.result?.msg || 'Gagal mengambil data TikTok';
      return sock.sendMessage(remoteJid, {
        text: `*✧ Mio Haimiya ✧*\n\n` +
              `Maaf, ${errMsg}\n` +
              `Coba cek URL-nya lagi ya~ ♡`
      }, { quoted: message });
    }

    const d = json.result.data;
    const author = d.author || {};
    const musicInfo = d.music_info || {};

    // Bangun caption info
    const caption = [
      `[===TIKTOK DOWN===]`,
      `*NAME*: ${author.nickname || '-'}`,
      `*USERNAME*: ${author.unique_id || '-'}`,
      `*CREATE DATE*: ${formatWIB(d.create_time)}`,
      `*URL*: ${url}`,
      `*DURATION*: ${formatDuration(d.duration)}`,
      `*REGION*: ${d.region || '-'}`,
      `*DESC*: ${d.title || '-'}`,
      `*LIKE*: ${(d.digg_count || 0).toLocaleString()}`,
      `*COMMENT*: ${(d.comment_count || 0).toLocaleString()}`,
      `*VIEWS*: ${(d.play_count || 0).toLocaleString()}`,
      `*SHARE*: ${(d.share_count || 0).toLocaleString()}`,
      `*SAVES*: ${(d.collect_count || 0).toLocaleString()}`,
      `*ID VID*: ${d.id || '-'}`,
      `[===TIKTOK DOWN===]`,
      ``,
      `[===MUSIC===]`,
      `*TITLE*: ${musicInfo.title || '-'}`,
      `*AUTHOR*: ${musicInfo.author || '-'}`,
      `*DURATION*: ${formatDuration(musicInfo.duration)}`,
      `*MUSIC URL*: ${musicInfo.play || '-'}`,
      `[===MUSIC===]`,
      ``,
      `file audio sedang dikirim.....`
    ].join('\n');

    // Tentukan video URL (prioritas hdplay > play > wmplay)
    const videoURL = d.hdplay || d.play || d.wmplay || null;

    if (!videoURL) {
      // Fallback ke teks saja jika ga ada video
      return sock.sendMessage(remoteJid, { text: caption }, { quoted: message });
    }

    try {
      await sock.sendMessage(remoteJid, {
        video: { url: videoURL },
        caption,
        mimetype: 'video/mp4'
      }, { quoted: message });
    } catch (err) {
      console.error('[TIKTOK] Gagal kirim video:', err.message);
      // Fallback kirim caption aja
      await sock.sendMessage(remoteJid, { text: caption }, { quoted: message });
    }

    // Kirim audio
    if (musicInfo.play) {
      try {
        await sock.sendMessage(remoteJid, {
          audio: { url: musicInfo.play },
          mimetype: 'audio/mpeg'
        }, { quoted: message });
      } catch (err) {
        console.error('[TIKTOK] Gagal kirim audio:', err.message);
      }
    }
  }
};
