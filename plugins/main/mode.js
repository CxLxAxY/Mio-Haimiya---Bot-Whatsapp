const { msg } = require('../../settings');

module.exports = {
  command: 'mode',
  alias: ['setmode', 'botmode'],
  kategori: 'main',
  limit: false,
  premium: false,
  ownerOnly: true,

  run: async ({ sock, args, settings, remoteJid }) => {
    const newMode = (args[0] || '').toLowerCase();

    if (!newMode || !['self', 'public'].includes(newMode)) {
      return sock.sendMessage(remoteJid, { text: msg.commandModeDitolak() });
    }

    if (newMode === settings.botMode) {
      return sock.sendMessage(remoteJid, { text: msg.modeUnchanged(newMode) });
    }

    settings.botMode = newMode;
    const desc = newMode === 'self'
      ? '🔒 Sekarang cuma nomor bot sendiri yang bisa pakai command...'
      : '🌐 Sekarang semua orang bisa pakai command, udah aku buka!';

    return sock.sendMessage(remoteJid, { text: msg.modeChanged(newMode, desc) });
  }
};
