const fs = require('fs');
const path = require('path');
const { settings } = require('../settings');

const LIMIT_FILE = path.join(settings.databaseDir || path.join(__dirname, '..', 'database'), 'limit.json');
const DAILY_LIMIT = 50;

/**
 * Muat data limit dari file JSON.
 */
function loadLimits() {
  try {
    if (fs.existsSync(LIMIT_FILE)) {
      return JSON.parse(fs.readFileSync(LIMIT_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[LIMIT] Gagal baca file limit.json:', err.message);
  }
  return {};
}

/**
 * Simpan data limit ke file JSON.
 */
function saveLimits(data) {
  try {
    fs.mkdirSync(path.dirname(LIMIT_FILE), { recursive: true });
    fs.writeFileSync(LIMIT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LIMIT] Gagal simpan limit.json:', err.message);
  }
}

/**
 * Dapatkan tanggal hari ini dalam format YYYY-MM-DD (WIB).
 */
function getTodayWIB() {
  const now = new Date();
  // Konversi ke WIB (UTC+7)
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/**
 * Cek sisa limit user.
 * Jika user tidak ada atau lastReset bukan hari ini, reset ke DAILY_LIMIT.
 * Returns: jumlah sisa limit (number).
 */
function getLimit(userId) {
  const data = loadLimits();
  const today = getTodayWIB();

  if (!data[userId]) {
    data[userId] = { limit: DAILY_LIMIT, lastReset: today };
    saveLimits(data);
    return DAILY_LIMIT;
  }

  if (data[userId].lastReset !== today) {
    data[userId].limit = DAILY_LIMIT;
    data[userId].lastReset = today;
    saveLimits(data);
    return DAILY_LIMIT;
  }

  return data[userId].limit;
}

/**
 * Gunakan 1 limit untuk user.
 * Returns: { success: boolean, remaining: number }
 * - success: true jika limit masih cukup dan berhasil dikurangi
 * - remaining: sisa limit setelah pemakaian
 */
function useLimit(userId) {
  const data = loadLimits();
  const today = getTodayWIB();

  if (!data[userId]) {
    data[userId] = { limit: DAILY_LIMIT - 1, lastReset: today };
    saveLimits(data);
    return { success: true, remaining: DAILY_LIMIT - 1 };
  }

  if (data[userId].lastReset !== today) {
    data[userId].limit = DAILY_LIMIT;
    data[userId].lastReset = today;
  }

  if (data[userId].limit <= 0) {
    return { success: false, remaining: 0 };
  }

  data[userId].limit -= 1;
  saveLimits(data);
  return { success: true, remaining: data[userId].limit };
}

/**
 * Reset limit semua user ke DAILY_LIMIT.
 * Dipanggil oleh scheduler tiap jam 00:00 WIB.
 */
function resetAllLimits() {
  const data = loadLimits();
  const today = getTodayWIB();
  let count = 0;

  for (const userId of Object.keys(data)) {
    if (data[userId].lastReset !== today) {
      data[userId].limit = DAILY_LIMIT;
      data[userId].lastReset = today;
      count++;
    }
  }

  if (count > 0) {
    saveLimits(data);
    console.log(`[LIMIT] Reset ${count} user(s) ke ${DAILY_LIMIT} limit`);
  }
}

module.exports = {
  getLimit,
  useLimit,
  resetAllLimits,
  DAILY_LIMIT
};
