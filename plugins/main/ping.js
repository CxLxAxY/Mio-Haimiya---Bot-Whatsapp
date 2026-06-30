const os = require('os');
const { settings: globalSettings } = require('../../settings');

function toGB(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2).replace(/\.00$/, '');
}

function toMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2).replace(/\.00$/, '');
}

function formatDuration(totalSeconds) {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor((totalSeconds / 3600) % 24);
  const days = Math.floor(totalSeconds / 86400);

  const parts = [];
  if (days > 0) parts.push(`${days} days`);
  parts.push(`${hours} hours`);
  parts.push(`${minutes} minutes`);
  parts.push(`${seconds} seconds`);
  return parts.join(', ');
}

function summarizeCpuTimes(times) {
  const total = Object.values(times).reduce((sum, value) => sum + value, 0) || 1;

  return {
    user: (times.user / total) * 100,
    nice: (times.nice / total) * 100,
    sys: (times.sys / total) * 100,
    idle: (times.idle / total) * 100,
    irq: (times.irq / total) * 100
  };
}

function combineCpuTimes(cpus) {
  return cpus.reduce((total, cpu) => {
    total.user += cpu.times.user;
    total.nice += cpu.times.nice;
    total.sys += cpu.times.sys;
    total.idle += cpu.times.idle;
    total.irq += cpu.times.irq;
    return total;
  }, { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 });
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function formatCpuBlock(usage) {
  return [
    `- user : ${formatPercent(usage.user)}`,
    `- nice : ${formatPercent(usage.nice)}`,
    `- sys  : ${formatPercent(usage.sys)}`,
    `- idle : ${formatPercent(usage.idle)}`,
    `- irq  : ${formatPercent(usage.irq)}`
  ].join('\n');
}

function getCpuUsage() {
  const cpus = os.cpus();
  const coreUsage = cpus.map(cpu => ({
    model: cpu.model,
    speed: cpu.speed,
    usage: summarizeCpuTimes(cpu.times)
  }));

  const totalUsage = summarizeCpuTimes(combineCpuTimes(cpus));
  return { totalUsage, coreUsage };
}

function buildContextInfo(settings = globalSettings) {
  const contextInfo = {
    forwardingScore: 2,
    isForwarded: true
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

module.exports = {
  command: 'ping',
  alias: [],
  kategori: 'main',
  limit: false,
  premium: false,
  ownerOnly: false,

  run: async ({ sock, message, remoteJid, settings = globalSettings }) => {
    const jid = remoteJid || message.key.remoteJid;
    const startedAt = process.hrtime.bigint();
    const { totalUsage, coreUsage } = getCpuUsage();
    const endedAt = process.hrtime.bigint();
    const latencyMs = Number(endedAt - startedAt) / 1e6;
    const latencySeconds = latencyMs / 1000;
    const memory = process.memoryUsage();
    const usedRam = os.totalmem() - os.freemem();

    let text = '';
    text += `Kecepatan Respon ${latencySeconds.toFixed(4)} Second\n`;
    text += `${latencyMs} miliseconds\n\n`;
    text += `Runtime: ${formatDuration(process.uptime())}\n\n`;
    text += `💻 Info Server\n`;
    text += `RAM: ${toGB(usedRam)} GB / ${toGB(os.totalmem())} GB\n\n`;
    text += `NodeJS Memory Usage\n`;
    text += `rss         : ${toMB(memory.rss)} MB\n`;
    text += `heapTotal   : ${toMB(memory.heapTotal)} MB\n`;
    text += `heapUsed    : ${toMB(memory.heapUsed)} MB\n`;
    text += `external    : ${toMB(memory.external)} MB\n`;
    text += `arrayBuffers: ${toMB(memory.arrayBuffers || 0)} MB\n\n`;
    text += `Total CPU Usage\n`;
    text += `${coreUsage[0]?.model || 'Unknown CPU'} (${coreUsage[0]?.speed || 0} MHZ)\n`;
    text += `${formatCpuBlock(totalUsage)}\n\n`;
    text += `CPU Core(s) Usage (${coreUsage.length} Core CPU)\n`;
    text += coreUsage.map((cpu, index) => (
      `${index + 1}. ${cpu.model} (${cpu.speed} MHZ)\n${formatCpuBlock(cpu.usage)}`
    )).join('\n\n');

    await sock.sendMessage(jid, {
      text,
      contextInfo: buildContextInfo(settings)
    }, { quoted: message });
  }
};
