const path = require('path');

const settings = {
  botName: 'Mio Haimiya',
  ownerName: 'CxLxAxY',
  botNumber: '6285185279155',
  ownerNumber: ['6289525898250', '6285185279155'], //masukkan juga nomor bot
  contact: 'https://wa.me/6289525898250',
  prefix: '.',
  pairingMode: true,
  usePairingCode: true,
  pairingNumber: '6285185279155', //sama seperti botNumber
  nomorHP: '6285185279155', //sama seperti botNumber
  creator: 'CxLxAxY',
  printQRInTerminal: false,
  authDir: path.join(__dirname, 'session'),
  pluginsDir: path.join(__dirname, 'plugins'),
  scraperDir: path.join(__dirname, 'scraper'),
  databaseDir: path.join(__dirname, 'database'),
  logCommand: true,
  channelId: '120363410721112409@newsletter',
  channelUrl: 'https://whatsapp.com/channel/0029Vb8MLvs42DcdunlskT0o',
  channelName: 'Mio Haimiya by CxLxAxY',
  botIsChannelAdmin: false,
  browser: ['Mio Haimiya', 'Chrome', '1.0.0'],
  botMode: 'public',
  onlymApiKey: 'ONLym-f06db1' // Ganti dengan API key asli dari onlym.my.id
};

const msg = {
  success: (text) =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Nah, beres deh~ ♡\n` +
    `${text}\n\n` +
    `_Jangan sungkan manggil aku lagi ya, hehe..._`,

  ownerOnly: () =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Hah?! Fitur ini cuma buat *${settings.ownerName}* doang, tau!\n` +
    `Kamu siapa, berani-beraninya pake command ini... cuma ${settings.ownerName} yang boleh!\n\n` +
    `_...eh, maksud aku, cuma owner yang bisa akses. Maaf ya..._`,

  isPremium: () =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `E-eh... fitur ini khusus yang udah *premium* aja lho.\n` +
    `Kalo kamu mau, beli dulu ke ${settings.ownerName}... baru bisa akses commandnya... ♡\n\n`,

  limitHabis: () =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Aduh... limit kamu udah abis, nih.\n` +
    `Aku pengen bantuin, tapi... ya gimana ya. M-mau beli limit dulu? Atau tunggu reset? ♡\n\n` +
    `_Aku ga maksa kok, cuma kasih tau aja.._`,

  commandModeDitolak: () =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Oi oi oi! Perintah kayak gitu aku tolak mentah-mentah!\n` +
    `Yang bener dong masukin modenya... *self* apa *public*.\n` +
    `Jangan asal ceplos, nanti aku marah lho! >:T\n\n` +
    `_...t-tapi kalo kamu kasih yang bener, aku bakal nurut kok~_`,

  helpMode: (currentMode) =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Nih ya, aku kasih tau...\n` +
    `Sekarang modenya: *${currentMode}*\n\n` +
    `╭─ *Cara Pakai* ─\n` +
    `│ .mode self   ➜ cuma nomor bot yang bisa\n` +
    `│ .mode public ➜ semua orang bisa pakai\n` +
    `╰──────────────\n\n` +
    `_Gampang kan? Jangan pake yang aneh-aneh ya~_`,

  modeUnchanged: (mode) =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Lah, kan udah dari tadi modenya *${mode}*...\n` +
    `Kamu ngantuk ya? Hehe, istirahat dulu gih.. ♡`,

  modeChanged: (mode, desc) =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Oke oke, aku ganti modenya jadi *${mode}* deh!\n` +
    `${desc}\n\n` +
    `_M-maaf ya kalo tadi agak galak... aku cuma pengen yang terbaik buat kamu~_`,

  selfModeBlock: () =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Sshh... sekarang aku lagi mode *private*. Cuma ${settings.ownerName} yang boleh ganggu!\n` +
    `Nanti kalo udah dibuka lagi, baru deh kamu bisa main-main.... ♡`,

  error: () =>
    `*✧ Mio Haimiya ✧*\n\n` +
    `Kyaa! Ada yang error nih...\n` +
    `M-maaf banget ya, aku lagi ga beres. Coba lagi nanti, oke?\n\n` +
    `_Aku janji bakal lebih hati-hati... hiks._`,
};

function sanitasiNomor(nomor = '') {
  let n = String(nomor).replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  return n;
}

function isOwner(sender) {
  const senderNumber = sanitasiNomor(sender);
  const owners = Array.isArray(settings.ownerNumber)
    ? settings.ownerNumber
    : [settings.ownerNumber];
  return owners.some(owner => sanitasiNomor(owner) === senderNumber);
}

function getRank(sender) {
  return isOwner(sender) ? 'OWNER' : 'MEMBER';
}

function getChatType(remoteJid) {
  if (!remoteJid) return 'UNKNOWN';
  if (remoteJid.endsWith('@g.us')) return 'GROUP';
  if (remoteJid.endsWith('@newsletter')) return 'CHANNEL';
  return 'PRIVATE_CHAT';
}

function isSelfModeBlocked(sender) {
  const botNumber = sanitasiNomor(settings.botNumber || settings.pairingNumber || settings.nomorHP || '');
  return settings.botMode === 'self' && sanitasiNomor(sender) !== botNumber;
}

function validateArgs(args, allowedValues, caseSensitive = false) {
  if (!args || args.length === 0) return false;
  const val = caseSensitive ? args[0] : (args[0] || '').toLowerCase();
  const allowed = caseSensitive ? allowedValues : allowedValues.map(v => v.toLowerCase());
  return allowed.includes(val);
}

module.exports = {
  settings,
  msg,
  sanitasiNomor,
  isOwner,
  getRank,
  getChatType,
  isSelfModeBlocked,
  validateArgs
};
