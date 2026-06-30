const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const packageJson = require('./package.json');

// ── Import dari settings.js ──
let settingsModule = require('./settings.js');
let settings = settingsModule.settings || settingsModule;
let msg = settingsModule.msg || {};
const { sanitasiNomor, getRank, getChatType, isSelfModeBlocked } = settingsModule;
const { getLimit, useLimit, resetAllLimits } = require('./database/limit');

const plugins = [];
let socket = null;

// Hot-reload helpers
const pluginPathMap = new Map();
const pendingReload = new Map();
const fileWatchers = [];

function loadPlugins(dir = settings.pluginsDir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      loadPlugins(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    try {
      try { delete require.cache[require.resolve(fullPath)]; } catch (e) {}
      const plugin = require(fullPath);
      if (plugin && plugin.command && typeof plugin.run === 'function') {
        // Normalisasi field plugin
        if (!Array.isArray(plugin.alias)) plugin.alias = [];
        if (!plugin.kategori) plugin.kategori = 'umum';
        if (plugin.limit === undefined) plugin.limit = false;
        if (plugin.premium === undefined) plugin.premium = false;
        if (plugin.ownerOnly === undefined) plugin.ownerOnly = false;

        plugin.__path = fullPath;

        const idx = plugins.findIndex(p => p.__path === fullPath);
        if (idx >= 0) plugins[idx] = plugin;
        else plugins.push(plugin);
        pluginPathMap.set(fullPath, plugin);
        console.log(`📦 Plugin dimuat: ${entry.name} (${plugin.kategori})`);
      }
    } catch (error) {
      console.error(`❌ Gagal memuat plugin ${entry.name}:`, error);
    }
  }
}

function reloadPlugin(fullPath) {
  try {
    try { delete require.cache[require.resolve(fullPath)]; } catch (e) {}
    const plugin = require(fullPath);
    if (!plugin || !plugin.command || typeof plugin.run !== 'function') {
      console.warn(`[HOTRELOAD] File ${fullPath} tidak meng-export plugin valid`);
      return;
    }
    if (!Array.isArray(plugin.alias)) plugin.alias = [];
    if (!plugin.kategori) plugin.kategori = 'umum';
    if (plugin.limit === undefined) plugin.limit = false;
    if (plugin.premium === undefined) plugin.premium = false;
    if (plugin.ownerOnly === undefined) plugin.ownerOnly = false;
    plugin.__path = fullPath;

    const idx = plugins.findIndex(p => p.__path === fullPath);
    if (idx >= 0) {
      plugins[idx] = plugin;
      console.log(`[HOTRELOAD] Plugin diperbarui: ${path.basename(fullPath)}`);
    } else {
      plugins.push(plugin);
      console.log(`[HOTRELOAD] Plugin dimuat: ${path.basename(fullPath)}`);
    }
    pluginPathMap.set(fullPath, plugin);
  } catch (err) {
    console.error(`[HOTRELOAD] Gagal memuat plugin ${fullPath}:`, err);
  }
}

function removePlugin(fullPath) {
  const idx = plugins.findIndex(p => p.__path === fullPath);
  if (idx >= 0) {
    const name = plugins[idx].command || path.basename(fullPath);
    plugins.splice(idx, 1);
    pluginPathMap.delete(fullPath);
    try { delete require.cache[require.resolve(fullPath)]; } catch (e) {}
    console.log(`[HOTRELOAD] Plugin dihapus: ${name}`);
  }
}

function handleFileChange(fullPath) {
  const resolved = path.resolve(fullPath);
  const settingsPath = path.resolve(path.join(__dirname, 'settings.js'));

  if (resolved === settingsPath) {
    try { delete require.cache[require.resolve('./settings.js')]; } catch (e) {}
    settingsModule = require('./settings.js');
    settings = settingsModule.settings || settingsModule;
    msg = settingsModule.msg || {};
    console.log('[HOTRELOAD] settings.js diperbarui');
    for (const p of Array.from(pluginPathMap.keys())) {
      try { reloadPlugin(p); } catch (e) { console.warn('[HOTRELOAD] gagal reload plugin setelah settings berubah', p); }
    }
    return;
  }

  const pluginsDir = path.resolve(settings.pluginsDir || path.join(__dirname, 'plugins'));
  if (resolved.startsWith(pluginsDir)) {
    if (fs.existsSync(resolved)) reloadPlugin(resolved);
    else removePlugin(resolved);
  }
}

function enableHotReload() {
  const dirs = [settings.pluginsDir, path.join(__dirname)];
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dir, filename);
        if (pendingReload.has(fullPath)) clearTimeout(pendingReload.get(fullPath));
        const t = setTimeout(() => {
          pendingReload.delete(fullPath);
          handleFileChange(fullPath);
        }, 150);
        pendingReload.set(fullPath, t);
      });
      fileWatchers.push(watcher);
      console.log(`[HOTRELOAD] Watching ${dir}`);
    } catch (err) {
      console.warn('[HOTRELOAD] Gagal mem-watch', dir, err.message || err);
    }
  }
}

function resolvePhoneNumber(rawJid) {
  const str = String(rawJid || '');
  const cleaned = str.replace(/[^0-9]/g, '');

  const sessionDir = settings.authDir || path.join(__dirname, 'session');

  if (fs.existsSync(sessionDir)) {
    const reverseFile = `lid-mapping-${cleaned}_reverse.json`;
    const reversePath = path.join(sessionDir, reverseFile);
    try {
      if (fs.existsSync(reversePath)) {
        const phone = JSON.parse(fs.readFileSync(reversePath, 'utf-8'));
        if (typeof phone === 'string') {
          const sanitized = sanitasiNomor(phone);
          if (sanitized && sanitized.length >= 6) return `+${sanitized}`;
        }
      }
    } catch {}

    const forwardFile = `lid-mapping-${cleaned}.json`;
    const forwardPath = path.join(sessionDir, forwardFile);
    try {
      if (fs.existsSync(forwardPath)) {
        const mapping = JSON.parse(fs.readFileSync(forwardPath, 'utf-8'));
        const mapped = mapping?.phone || mapping?.number || mapping?.jid || mapping?.lid || '';
        const sanitized = sanitasiNomor(mapped);
        if (sanitized && sanitized.length >= 6) return `+${sanitized}`;
      }
    } catch {}
  }

  if (/^[0-9]+$/.test(cleaned) && cleaned.length >= 6 && cleaned.length <= 15) {
    const normalized = cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
    return `+${normalized}`;
  }

  return str;
}

function ambilNomorHP() {
  return sanitasiNomor(settings.nomorHP || settings.pairingNumber || settings.botNumber || '');
}

function getConfiguredBotNumber() {
  return sanitasiNomor(settings.botNumber || settings.pairingNumber || settings.nomorHP || '');
}

async function buatKoneksiPairing(authDir = settings.authDir || './session') {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const nomorHP = ambilNomorHP();
  if (!nomorHP || nomorHP.length < 10) {
    console.error('❌ Nomor di settings.js tidak valid. Pastikan format 62xxx.');
    process.exit(1);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 60_000,
  });

  let sudahMintaKode = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !sudahMintaKode && !state.creds.registered) {
      sudahMintaKode = true;
      try {
        const kode = await sock.requestPairingCode(nomorHP);
        const kodeFormatted = kode?.match(/.{1,4}/g)?.join('-') ?? kode;
        console.log('\n┌──────────────────────────────┐');
        console.log(`│  🔑  Pairing Code: ${String(kodeFormatted || kode).padEnd(9)} │`);
        console.log('└──────────────────────────────┘');
        console.log(`\n  Nomor  : ${nomorHP}`);
        console.log('  Cara   : WhatsApp › ⋮ › Linked Devices › Link with Phone Number');
        console.log('  Masukkan kode di atas\n');
      } catch (err) {
        console.error('❌ Gagal dapat pairing code:', err.message);
      }
    }

    if (connection === 'open') {
      console.log(`✅ Bot terhubung sebagai ${nomorHP}\n`);
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        console.warn('⚠️ Koneksi terputus. Mencoba menyambung ulang...');
        setTimeout(() => {
          startBot(() => {}).catch((err) => console.error('❌ Gagal menyambung ulang:', err));
        }, 3000);
        return;
      }

      console.warn('🚪 Sesi logout / tidak valid. Menghapus sesi lama dan membuat pairing code baru...');
      try {
        fs.rmSync(settings.authDir || './session', { recursive: true, force: true });
      } catch (err) {
        console.warn('⚠️ Gagal membersihkan sesi lama:', err.message);
      }
      setTimeout(() => {
        startBot(() => {}).catch((err) => console.error('❌ Gagal memulai ulang pairing:', err));
      }, 2000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return sock;
}

async function startBot(onMessage) {
  const authDir = settings.authDir || './session';

  const credsPath = path.join(authDir, 'creds.json');
  let sudahRegistered = false;
  try {
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      sudahRegistered = !!creds.registered;
    }
  } catch {}

  if (settings.usePairingCode && !sudahRegistered) {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(authDir, { recursive: true });

  socket = await buatKoneksiPairing(authDir);

  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (message.message?.protocolMessage) continue;
      await onMessage(socket, message);
    }
  });

  return socket;
}

/**
 * Cari plugin berdasarkan command atau alias.
 */
function findPlugin(rawInput) {
  const prefix = settings.prefix || '.';
  const input = rawInput.startsWith(prefix) ? rawInput.slice(prefix.length).trim() : rawInput.trim();
  const inputCommand = (input.split(/\s+/)[0] || '').toLowerCase();

  for (const plugin of plugins) {
    let pluginCmd = plugin.command.replace(/\{settings\.prefix\}/g, prefix).toLowerCase();
    if (pluginCmd.startsWith(prefix)) pluginCmd = pluginCmd.slice(prefix.length);
    if (pluginCmd === inputCommand) return plugin;

    for (const alias of plugin.alias) {
      let aliasCmd = alias.replace(/\{settings\.prefix\}/g, prefix).toLowerCase();
      if (aliasCmd.startsWith(prefix)) aliasCmd = aliasCmd.slice(prefix.length);
      if (aliasCmd === inputCommand) return plugin;
    }
  }

  return null;
}

function titleCase(value) {
  return value
    ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
    : 'Umum';
}

function getPluginsByCategory(category) {
  const target = String(category || '').toLowerCase();
  if (!target) return [];

  return plugins
    .filter(plugin => String(plugin.kategori || 'umum').toLowerCase() === target)
    .sort((a, b) => a.command.localeCompare(b.command));
}

function getAvailableCategories() {
  return Array.from(new Set(
    plugins.map(plugin => String(plugin.kategori || 'umum').toLowerCase())
  )).sort();
}

function buildForwardContext() {
  const contextInfo = {
    forwardingScore: 2,
    isForwarded: true,
  };

  if (settings.channelId) {
    contextInfo.forwardedNewsletterMessageInfo = {
      newsletterJid: settings.channelId,
      serverMessageId: settings.serverMessageId || 100,
      newsletterName: settings.channelName || settings.ownerName || settings.botName || 'Channel'
    };
  }

  return contextInfo;
}

function buildCategoryRejectedText(category) {
  const prefix = settings.prefix || '.';
  const available = getAvailableCategories().map(titleCase).join(', ') || '-';
  const requested = category || '-';

  return `*✧ ${settings.botName || 'Mio Haimiya'} ✧*\n\n` +
    `Kategori *${requested}* ditolak karena tidak ditemukan.\n` +
    `Kategori tersedia: ${available}\n\n` +
    `_Gunakan ${prefix}menucat <kategori> dengan kategori yang benar ya._`;
}

function buildCategoryCommandText(category, categoryPlugins) {
  const prefix = settings.prefix || '.';
  const memUsedGB = (process.memoryUsage().rss / 1024 / 1024 / 1024).toFixed(2);
  const totalGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

  let caption = '';
  caption += `─( ${settings.botName || 'Bot'} )─\n\n`;
  caption += `╭──(      INFORMATION     )\n`;
  caption += `│ >> Creator ☇ Danszzz31\n`;
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

  caption += `╭──(      ${titleCase(category)}     )\n`;
  for (const plugin of categoryPlugins) {
    caption += `║›› ${prefix}${plugin.command}\n`;
  }
  caption += `╰━━━━━━━━━━━━━━━━━━━⬣`;

  return caption;
}

function buildCategoryMessagePayload(caption) {
  const contextInfo = buildForwardContext();
  const imagePath = path.join(__dirname, 'assets', 'menucat.jpg');

  try {
    if (fs.existsSync(imagePath)) {
      return {
        image: fs.readFileSync(imagePath),
        caption,
        contextInfo
      };
    }
  } catch (error) {
    console.error('[MENUCAT] Gagal membaca assets/menucat.jpg:', error);
  }

  return {
    text: caption,
    contextInfo
  };
}

async function handleMenuCategoryCommand(sock, message, args, remoteJid) {
  const category = (args[0] || '').toLowerCase();
  const categoryPlugins = getPluginsByCategory(category);

  if (!category || categoryPlugins.length === 0) {
    await sock.sendMessage(
      remoteJid,
      buildCategoryMessagePayload(buildCategoryRejectedText(category)),
      { quoted: message }
    );
    return;
  }

  await sock.sendMessage(
    remoteJid,
    buildCategoryMessagePayload(buildCategoryCommandText(category, categoryPlugins)),
    { quoted: message }
  );
}

async function checkPluginRequirements({ sock, remoteJid, plugin, rank, sender }) {
  if (isSelfModeBlocked(sender)) {
    return false;
  }

  if (plugin.ownerOnly === true && rank !== 'OWNER') {
    await sock.sendMessage(remoteJid, { text: msg.ownerOnly() });
    return false;
  }

  if (plugin.premium === true && rank !== 'OWNER') {
    await sock.sendMessage(remoteJid, { text: msg.isPremium() });
    return false;
  }

  if (plugin.limit === true && rank !== 'OWNER') {
    const result = useLimit(sender);
    if (!result.success) {
      await sock.sendMessage(remoteJid, { text: msg.limitHabis() });
      return false;
    }
    console.log(`[LIMIT] Plugin ${plugin.command} digunakan, user: ${sender}, sisa: ${result.remaining}`);
  }

  return true;
}

async function handleIncomingMessage(sock, message) {
  const remoteJid = message.key?.remoteJid;
  if (!remoteJid) return;

  const text = message.message?.conversation
    || message.message?.extendedTextMessage?.text
    || '';

  if (!text.startsWith(settings.prefix)) return;

  const raw = text.slice(settings.prefix.length).trim();
  const [command, ...args] = raw.split(/\s+/);
  const builtinPlugin = (command || '').toLowerCase() === 'menucat'
    ? {
        command: 'menucat',
        kategori: 'main',
        limit: false,
        premium: false,
        ownerOnly: false,
        __builtin: true
      }
    : null;
  const plugin = builtinPlugin || findPlugin(text);

  if (!plugin) return;

  const senderRaw = message.key?.fromMe
    ? `${getConfiguredBotNumber()}@s.whatsapp.net`
    : (message.key?.participant || remoteJid);
  const resolvedSender = resolvePhoneNumber(senderRaw);
  const sender = sanitasiNomor(resolvedSender);
  const rank = getRank(sender);
  const chatType = getChatType(remoteJid);

  // Allow commands in CHANNEL/GROUP only if bot is admin there.
  let isBotAdminInChat = false;
  if (chatType === 'GROUP' || chatType === 'CHANNEL') {
    const botJidCandidates = [];
    try {
      if (sock && sock.user && sock.user.id) botJidCandidates.push(sock.user.id);
    } catch (e) {}
    try {
      const bn = sanitasiNomor(settings.botNumber || settings.nomorHP || settings.pairingNumber || '');
      if (bn) botJidCandidates.push(`${bn}@s.whatsapp.net`);
    } catch (e) {}
    const botJids = Array.from(new Set(botJidCandidates.filter(Boolean)));
    try {
      const meta = await sock.groupMetadata(remoteJid);
      const participants = meta?.participants || [];
      for (const p of participants) {
        const pid = p?.id || p?.jid || p;
        if (botJids.includes(pid)) {
          if (p?.admin || p?.isAdmin || p?.isSuperAdmin || p?.role === 'admin' || p?.role === 'superadmin') {
            isBotAdminInChat = true;
            break;
          }
        }
      }
    } catch (err) {
      // Fallback for channels where groupMetadata may not be available
      if (chatType === 'CHANNEL') {
        isBotAdminInChat = !!settings.botIsChannelAdmin;
      }
    }
  }

  if (chatType === 'CHANNEL' && !isBotAdminInChat) {
    console.log(`[CHANNEL] Ignored command from ${remoteJid}: bot is not admin in channel`);
    return;
  }

  const canRunPlugin = await checkPluginRequirements({ sock, remoteJid, plugin, rank, sender });
  if (!canRunPlugin) return;

  if (settings.logCommand) {
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Bangkok' });
    const pengirim = resolvePhoneNumber(sender);

    let chatLabel = `[${chatType}]`;
    if (chatType === 'GROUP') {
      try {
        const meta = await sock.groupMetadata(remoteJid);
        const groupName = meta?.subject || 'Unknown Group';
        chatLabel = `[GROUP - ${groupName}]`;
      } catch (err) {
        chatLabel = `[GROUP - Unknown]`;
      }
    } else if (chatType === 'CHANNEL') {
      let channelName = settings.channelName || null;
      try {
        const meta = await sock.groupMetadata(remoteJid);
        if (meta?.subject) channelName = meta.subject;
      } catch (err) {}
      chatLabel = `[CHANNEL - ${channelName || 'Unknown'} - ${remoteJid}]`;
    }

    console.log('================================');
    console.log(`Waktu: ${waktu}`);
    console.log(chatLabel);
    console.log(`Pengirim: ${pengirim}`);
    console.log(`Rank: ${rank}`);
    console.log(`Nomor Bot: ${settings.botNumber}`);
    console.log(`Command: ${text}`);
    console.log(`Plugin: ${plugin.command}`);
    console.log(`Kategori: ${plugin.kategori}`);
    console.log(`Limit: ${plugin.limit}`);
    console.log(`Premium: ${plugin.premium}`);
    console.log(`OwnerOnly: ${plugin.ownerOnly}`);
    console.log('================================');
  }

  // ── Eksekusi ──
  try {
    if (plugin.__builtin === true) {
      await handleMenuCategoryCommand(sock, message, args, remoteJid);
      return;
    }

    await plugin.run({ sock, message, args, settings, remoteJid, rank, command, plugin });
  } catch (error) {
    console.error('❌ Error menjalankan command:', error);
    await sock.sendMessage(remoteJid, { text: msg.error() });
  }
}

async function main() {
  fs.mkdirSync(settings.databaseDir, { recursive: true });
  fs.mkdirSync(settings.scraperDir, { recursive: true });

  loadPlugins();
  try { enableHotReload(); } catch (e) { console.warn('Hot-reload gagal diaktifkan:', e.message || e); }
  console.log(`📊 Total ${plugins.length} plugin dimuat`);
  // Jadwalkan reset limit otomatis setiap jam 00:00 WIB
  const scheduleDailyReset = () => {
    const now = new Date();
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const msUntilMidnight = (24 - wibNow.getHours()) * 3600000 - wibNow.getMinutes() * 60000 - wibNow.getSeconds() * 1000;
    setTimeout(() => {
      resetAllLimits();
      setInterval(resetAllLimits, 86400000);
    }, msUntilMidnight);
    console.log(`[LIMIT] Reset scheduler: ${msUntilMidnight}ms until next reset`);
  };
  scheduleDailyReset();

  console.log('🚀 Mio Haimiya sedang berjalan...');
  await startBot(handleIncomingMessage);
}

main().catch((error) => {
  console.error('❌ Gagal menyalakan bot:', error);
  process.exit(1);
});
