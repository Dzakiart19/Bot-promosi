/**
 * lib/platforms/telegram/shared-session.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Implementasi GENERIK createMessageListener dan runSession untuk semua
 * bot Telegram (telegram-bot, temanid-bot, randompacar-bot).
 *
 * Ketiga bot punya alur identik, hanya beda config (MATCH_SIGNALS, MESSAGE_GREETS,
 * DELAY_SEND_MS, DELAY_NEXT_MS, dst). Daripada copy-paste 3 kali, gunakan file
 * ini sebagai satu sumber kebenaran — masing-masing session.js tinggal wrap
 * fungsi di sini dengan config mereka sendiri.
 *
 * Interface yang diekspos sama persis dengan interface lama (caller tidak perlu diubah):
 *   createMessageListener(client, botEntity) → { nextMsg }
 *   runSession(client, botEntity, nextMsg)    → Promise<string>
 *
 * Untuk membuat versi yang terikat config tertentu:
 *   const { makeSession } = require('./shared-session');
 *   const cfg = require('./config');
 *   const { createMessageListener, runSession } = makeSession(cfg);
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { NewMessage }       = require("telegram/events");
const { stats, pushEvent } = require("../../core/stats");
const { log }              = require("../../core/logger");

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Pasang event handler permanen untuk semua pesan masuk dari botEntity.
 * Buffer menyimpan pesan yang belum dikonsumsi — tidak ada race condition
 * walau ada celah antar sesi.
 *
 * Fungsi ini identik untuk semua bot Telegram (tidak bergantung pada config).
 *
 * @returns {{ nextMsg: (timeoutMs?: number) => Promise<string> }}
 */
function createMessageListener(client, botEntity) {
  const buffer  = [];   // pesan yang sudah tiba tapi belum dikonsumsi
  const waiters = [];   // resolve-callback yang menunggu pesan berikutnya

  client.addEventHandler((event) => {
    if (event.message?.out) return;           // abaikan pesan kita sendiri

    const peerId    = event.message?.peerId;
    const isFromBot = peerId?.className === "PeerUser" &&
                      peerId?.userId?.toString() === botEntity.id?.toString();
    if (!isFromBot) return;

    const text = (event.message.text || event.message.message || "").trim();
    if (!text) return;

    if (waiters.length > 0) {
      // Ada yang menunggu — langsung deliver
      const { resolve, timer } = waiters.shift();
      clearTimeout(timer);
      resolve(text);
    } else {
      // Tidak ada yang menunggu — simpan ke buffer
      buffer.push(text);
    }
  }, new NewMessage({}));

  /**
   * Kembalikan Promise yang resolve dengan teks pesan berikutnya.
   * Reject dengan Error("timeout") jika timeoutMs tercapai.
   * @param {number} [timeoutMs]
   */
  function nextMsg(timeoutMs) {
    return new Promise((resolve, reject) => {
      if (buffer.length > 0) return resolve(buffer.shift());

      let entry;
      const timer = timeoutMs
        ? setTimeout(() => {
            const idx = waiters.indexOf(entry);
            if (idx !== -1) waiters.splice(idx, 1);
            reject(new Error("timeout"));
          }, timeoutMs)
        : null;

      entry = { resolve, timer };
      waiters.push(entry);
    });
  }

  return { nextMsg };
}

/**
 * Factory: kembalikan { createMessageListener, runSession } yang terikat cfg tertentu.
 *
 * runSession yang dihasilkan punya signature yang sama dengan versi lama:
 *   runSession(client, botEntity, nextMsg) → Promise<string>
 *
 * @param {object} cfg  — config platform (config.js masing-masing bot)
 */
function makeSession(cfg) {
  /**
   * Jalankan satu siklus promo:
   *   1. Tunggu match signal dari bot (abaikan pesan lain)
   *   2. Delay DELAY_SEND_MS (0 = langsung kirim)
   *   3. Kirim pesan promo acak
   *   4. Delay DELAY_NEXT_MS
   *   5. Kirim /next
   *
   * @returns {Promise<string>} alasan selesai
   */
  async function runSession(client, botEntity, nextMsg) {
    stats.status = "searching";

    const deadline = Date.now() + cfg.WAIT_MATCH_MS;

    // ── Tunggu match-signal ─────────────────────────────────────────────────
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        log("WARN", `Timeout ${cfg.WAIT_MATCH_MS / 1000}s tanpa pasangan`);
        stats.totalNoMatch++;
        pushEvent("warn", `Sesi #${stats.currentSession}: match timeout`);
        return "match-timeout";
      }

      let text;
      try {
        text = await nextMsg(remaining);
      } catch {
        // timeout dari nextMsg
        log("WARN", `Timeout tanpa pasangan (sesi #${stats.currentSession})`);
        stats.totalNoMatch++;
        pushEvent("warn", `Sesi #${stats.currentSession}: match timeout`);
        return "match-timeout";
      }

      const lower = text.toLowerCase();

      // Abaikan pesan yang bukan match-signal ("Jangan terlalu cepat", dll)
      const isMatch = cfg.MATCH_SIGNALS.some(s => lower.includes(s));
      if (!isMatch) {
        log("INFO", `[Abaikan] "${text.slice(0, 60)}"`);
        continue;
      }

      // ── Match ditemukan ───────────────────────────────────────────────────
      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status      = "matched";
      log("SUCCESS", `✓ MATCH! Pasangan ditemukan — sesi #${stats.currentSession}`);
      pushEvent("match", `Pasangan ditemukan (sesi #${stats.currentSession})`);
      break;
    }

    // ── Delay sebelum kirim promo (0 = langsung) ───────────────────────────
    if (cfg.DELAY_SEND_MS > 0) {
      log("INFO", `Tunggu ${cfg.DELAY_SEND_MS / 1000}s sebelum kirim promo...`);
      await sleep(cfg.DELAY_SEND_MS);
    }

    // ── Kirim promo ────────────────────────────────────────────────────────
    const promo = pick(cfg.MESSAGE_GREETS);
    try {
      await client.sendMessage(botEntity, { message: promo });
      stats.totalMsgSent++;
      log("BOT", `→ Promo: "${promo.slice(0, 60)}..."`);
      pushEvent("send", "Promo dikirim");
    } catch (err) {
      log("ERROR", `Gagal kirim promo: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorMsg = err.message;
      return "send-error";
    }

    // ── Delay sebelum /next ────────────────────────────────────────────────
    log("INFO", `Tunggu ${cfg.DELAY_NEXT_MS / 1000}s sebelum /next...`);
    await sleep(cfg.DELAY_NEXT_MS);

    // ── Kirim /next ────────────────────────────────────────────────────────
    try {
      await client.sendMessage(botEntity, { message: cfg.CMD_NEXT });
      log("BOT", "→ /next dikirim");
      pushEvent("end_session", `Sesi #${stats.currentSession} → /next`);
    } catch (err) {
      log("WARN", `Gagal kirim /next: ${err.message}`);
    }

    return "next-sent";
  }

  return { createMessageListener, runSession };
}

module.exports = { createMessageListener, makeSession };
