/**
 * lib/platforms/randompacar/session.js
 * Sama strukturnya dengan lib/platforms/temanid/session.js —
 * persistent message buffer + runSession tanpa race condition.
 * Disalin agar bot ke-3 benar-benar terpisah (config berbeda).
 *
 * Perubahan dari temanid:
 *   - DELAY_SEND_MS dipakai (3 detik delay sebelum kirim promo)
 */

"use strict";

const { NewMessage }       = require("telegram/events");
const cfg                  = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log }              = require("../../core/logger");

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── createMessageListener ─────────────────────────────────────────────────────
function createMessageListener(client, botEntity) {
  const buffer  = [];
  const waiters = [];

  client.addEventHandler((event) => {
    if (event.message?.out) return;

    const peerId    = event.message?.peerId;
    const isFromBot = peerId?.className === "PeerUser" &&
                      peerId?.userId?.toString() === botEntity.id?.toString();
    if (!isFromBot) return;

    const text = (event.message.text || event.message.message || "").trim();
    if (!text) return;

    if (waiters.length > 0) {
      const { resolve, timer } = waiters.shift();
      clearTimeout(timer);
      resolve(text);
    } else {
      buffer.push(text);
    }
  }, new NewMessage({}));

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

// ── runSession ────────────────────────────────────────────────────────────────
async function runSession(client, botEntity, nextMsg) {
  stats.status = "searching";

  const deadline = Date.now() + cfg.WAIT_MATCH_MS;

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
      log("WARN", `Timeout tanpa pasangan (sesi #${stats.currentSession})`);
      stats.totalNoMatch++;
      pushEvent("warn", `Sesi #${stats.currentSession}: match timeout`);
      return "match-timeout";
    }

    const lower = text.toLowerCase();
    const isMatch = cfg.MATCH_SIGNALS.some(s => lower.includes(s));
    if (!isMatch) {
      log("INFO", `[Abaikan] "${text.slice(0, 60)}"`);
      continue;
    }

    stats.totalMatches++;
    stats.lastMatchAt = Date.now();
    stats.status      = "matched";
    log("SUCCESS", `✓ MATCH! Pasangan ditemukan — sesi #${stats.currentSession}`);
    pushEvent("match", `Pasangan ditemukan (sesi #${stats.currentSession})`);
    break;
  }

  // ── Delay sebelum kirim promo ─────────────────────────────────────────────
  log("INFO", `Tunggu ${cfg.DELAY_SEND_MS / 1000}s sebelum kirim promo...`);
  await sleep(cfg.DELAY_SEND_MS);

  // ── Kirim promo ───────────────────────────────────────────────────────────
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

  // ── Delay sebelum /next ───────────────────────────────────────────────────
  log("INFO", `Tunggu ${cfg.DELAY_NEXT_MS / 1000}s sebelum /next...`);
  await sleep(cfg.DELAY_NEXT_MS);

  // ── Kirim /next ───────────────────────────────────────────────────────────
  try {
    await client.sendMessage(botEntity, { message: cfg.CMD_NEXT });
    log("BOT", "→ /next dikirim");
    pushEvent("end_session", `Sesi #${stats.currentSession} → /next`);
  } catch (err) {
    log("WARN", `Gagal kirim /next: ${err.message}`);
  }

  return "next-sent";
}

module.exports = { createMessageListener, runSession };
