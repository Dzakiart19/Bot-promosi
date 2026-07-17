/**
 * lib/platforms/telegram/persistence.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Simpan & baca session string Telegram agar TIDAK perlu login ulang setelah
 * restart workflow maupun deploy ulang (autoscale).
 *
 * Urutan prioritas baca:
 *   1. Replit DB  (persists di semua environment — dev, staging, produksi)
 *   2. File lokal (.telegram_session) — fallback kalau DB tidak tersedia
 *   3. Env var   (TELEGRAM_SESSION) — nilai awal jika ada
 *
 * Tulis:
 *   → Replit DB + file lokal secara bersamaan
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const SESSION_FILE = path.join(__dirname, "../../../.telegram_session");
const DB_KEY       = "telegram_session";
const DB_URL       = process.env.REPLIT_DB_URL || "";

// ── Replit DB helpers (plain HTTP, tanpa package tambahan) ────────────────────
async function _dbGet(key) {
  if (!DB_URL) return null;
  try {
    const r = await fetch(`${DB_URL}/${encodeURIComponent(key)}`);
    if (r.status === 404 || r.status === 204) return null;
    const t = await r.text();
    return t || null;
  } catch { return null; }
}

async function _dbSet(key, value) {
  if (!DB_URL) return false;
  try {
    await fetch(DB_URL, {
      method  : "POST",
      headers : { "Content-Type": "application/x-www-form-urlencoded" },
      body    : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    });
    return true;
  } catch { return false; }
}

async function _dbDelete(key) {
  if (!DB_URL) return;
  try { await fetch(`${DB_URL}/${encodeURIComponent(key)}`, { method: "DELETE" }); } catch {}
}

// ── File helpers ──────────────────────────────────────────────────────────────
function _fileRead() {
  try { return fs.readFileSync(SESSION_FILE, "utf8").trim() || null; } catch { return null; }
}

function _fileWrite(s) {
  try { fs.writeFileSync(SESSION_FILE, s, "utf8"); } catch {}
}

function _fileDelete() {
  try { fs.writeFileSync(SESSION_FILE, "", "utf8"); } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Baca session string dari Replit DB → file → env var.
 * @returns {Promise<string>} session string atau "" jika tidak ada
 */
async function readSession() {
  // 1. Replit DB
  const fromDb = await _dbGet(DB_KEY);
  if (fromDb && fromDb.length > 10) return fromDb;

  // 2. File lokal
  const fromFile = _fileRead();
  if (fromFile && fromFile.length > 10) {
    // Migrate ke DB supaya persist di deploy berikutnya
    await _dbSet(DB_KEY, fromFile);
    return fromFile;
  }

  // 3. Env var (kecuali nilai default yang bukan session valid)
  const fromEnv = (process.env.TELEGRAM_SESSION || "").trim();
  if (fromEnv && fromEnv.length > 20 && !fromEnv.startsWith("@")) {
    return fromEnv;
  }

  return "";
}

/**
 * Simpan session string ke Replit DB + file lokal.
 * @param {string} session
 */
async function writeSession(session) {
  _fileWrite(session);
  await _dbSet(DB_KEY, session);
}

/**
 * Hapus session (setelah expire).
 */
async function clearSession() {
  _fileDelete();
  await _dbDelete(DB_KEY);
}

module.exports = { readSession, writeSession, clearSession };
