const fs = require('fs');
const path = require('path');
const { settings, msg } = require('../../settings');
const packageJson = require('../../package.json');
const os = require('os');

function collectPlugins(dir = settings.pluginsDir) {
  if (!fs.existsSync(dir)) return [];

  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...collectPlugins(fullPath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    try {
      const plugin = require(fullPath);
      if (plugin && typeof plugin.run === 'function') {
        result.push(plugin);
      }
    } catch (error) {
      console.error(`❌ Gagal memuat plugin untuk menu ${entry.name}:`, error);
    }
  }

  return result;
}

function titleCase(value) {
  return value
    ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
    : 'Umum';
}

module.exports = {
  command: 'menu',
  alias: [],
  kategori: 'main',
  limit: false,
  premium: false,
  ownerOnly: false,
  run: async ({ sock, message, args }) => {
    const remoteJid = message.key.remoteJid;
    const requestedCategory = (args[0] || '').toLowerCase();
    const plugins = collectPlugins();

    const grouped = plugins.reduce((acc, plugin) => {
      const kategori = (plugin.kategori || 'umum').toLowerCase();
      if (!acc[kategori]) acc[kategori] = [];
      acc[kategori].push(plugin);
      return acc;
    }, {});

    const categories = Object.keys(grouped).sort();
    const selectedCategory = requestedCategory && grouped[requestedCategory]
      ? requestedCategory
      : null;

    const memUsedGB = (process.memoryUsage().rss / 1024 / 1024 / 1024).toFixed(2);
    const totalGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

    // Build decorated caption
    let caption = '';
    caption += `─( ${settings.botName || 'Bot'} )─\n\n`;
    caption += `╭──(      *INFORMATION*     )\n`;
    caption += `│ >> Creator ☇ CxLxAxY\n`;
    caption += `│ >> Contact Creator ☇ https://t.me/danszzz31\n`;
    caption += `│ >> Library ☇ Baileys\n`;
    caption += `│ >> Version ☇ ${packageJson.version || '1.0.0'}\n`;
    caption += `│ >> Language ☇ JavaScript\n`;
    caption += `│ >> Owner Name ☇ ${settings.ownerName || '-'}\n`;
    caption += `│ >> Bot Number ☇ ${settings.botNumber || '-'}\n`;
    caption += `│ >> BotMode ☇ ${settings.botMode === 'self' ? '🔒 Self' : '🌐 Public'}\n`;
    caption += `│ >> Memory ☇ ${memUsedGB} GB / ${totalGB} GB\n`;
    caption += `│ >> Contact ☇ ${settings.contact || '-'}\n`;
    caption += `╰━━━━━━━━━━━━━━━━━━━⬣\n\n`;

    caption += `╭──(      CATEGORY     )\n`;
    if (!selectedCategory) {
      for (const category of categories) {
        caption += `║›› ${titleCase(category)} (${grouped[category].length} command)\n`;
      }
      caption += `╰━━━━━━━━━━━━━━━━━━━⬣\n\n`;
      caption += `Tip: gunakan .menucat <kategori> untuk melihat daftar commands di dalam kategori.`;
    } else {
      caption += `║›› ${titleCase(selectedCategory)} (${grouped[selectedCategory].length} command)\n`;
      caption += `╰━━━━━━━━━━━━━━━━━━━⬣\n\n`;
      caption += `Daftar command pada kategori ini:\n`;
      for (const plugin of grouped[selectedCategory].sort((a, b) => a.command.localeCompare(b.command))) {
        let badges = [];
        if (plugin.ownerOnly) badges.push('👑');
        if (plugin.premium) badges.push('💎');
        if (plugin.limit) badges.push('🪙');
        const info = badges.length ? ` ${badges.join(' ')}` : '';
        caption += `• .${plugin.command} — ${plugin.kategori ? titleCase(plugin.kategori) : 'Umum'}${info}\n`;
      }
    }

    const thumbnailPath = path.join(__dirname, '..', '..', 'assets', 'menu_thumbnail.jpg');

    // Build contextInfo and include forwardedNewsletterMessageInfo when channelId is configured
    const baseContext = {
      forwardingScore: 2,
      isForwarded: true,
    };

    if (settings.channelId) {
      baseContext.forwardedNewsletterMessageInfo = {
        newsletterJid: settings.channelId,
        serverMessageId: settings.serverMessageId || 100,
        newsletterName: settings.channelName || settings.ownerName || settings.botName || 'Channel'
      };
    }

    let msgPayload;
    try {
      if (fs.existsSync(thumbnailPath)) {
        const buffer = fs.readFileSync(thumbnailPath);
        msgPayload = { image: buffer, caption, contextInfo: baseContext };
      } else {
        // If no thumbnail, send text with contextInfo (newsletter rendering may require media)
        msgPayload = { text: caption, contextInfo: baseContext };
      }
    } catch (e) {
      msgPayload = { text: caption, contextInfo: baseContext };
    }

    // Send as reply to the command and include fake-forward context (no channel)
    await sock.sendMessage(remoteJid, msgPayload, { quoted: message });
  }
};
