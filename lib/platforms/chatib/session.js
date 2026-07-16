/**
 * lib/platforms/chatib/session.js
 * Satu sesi chat di Chatib: konek ke lobby publik → tunggu ada user online →
 * pilih SATU target acak → sapa duluan → pamit → end.
 *
 * Beda dari platform lain (lihat catatan di config.js): Chatib tidak punya
 * antrian match. Semua user online terlihat lewat "existing_users"/"new_user",
 * dan siapapun bisa emit "send_message" langsung ke user_id manapun.
 *
 * Flow (reverse-engineered dari /public/dist/js/{socket,attachments}.min.js):
 *   1. io(WS_SERVER, { path:"/socket.io/", transports:["websocket"],
 *        extraHeaders:{ Cookie: jwt+session }, auth:{ user_id } })
 *   2. on("existing_users") → { users:[{user_id,...}, ...] }
 *      on("new_user")       → { user:{user_id,...} }
 *   3. emit("send_message", { user_id, partner_id, destination, message, message_id })
 *   4. on("receive_message") → { from_user, to_user, conversation_id, message_id, timestamp, message_text }
 *   5. socket.disconnect() untuk mengakhiri (tidak ada event "leave" khusus)
 */

"use strict";

const { io } = require("socket.io-client");
const { v4: uuidv4 } = require("uuid");

const cfg = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log } = require("../../core/logger");
const { isBlockedCountry, countryLabel, isPriorityCountry, priorityLabel } = require("../../core/country-filter");

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ userId: string, displayName: string, cookieHeader: string }} guest
 * @returns {Promise<string>} alasan selesai
 */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function runSession(guest) {
  return new Promise((resolve) => {
    let socket;
    let onlineUsers  = new Map(); // user_id → country (ISO-2 code atau "xx"), dikumpulkan dari existing_users/new_user
    let targetId     = null;
    let messageSent  = false;
    let goodbyeSent  = false;
    let done         = false;
    let waitUsersTimer = null;
    let replyTimer     = null;

    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(waitUsersTimer);
      clearTimeout(replyTimer);
      stats.status = "idle";

      setTimeout(() => {
        try { socket?.disconnect(); } catch (_) {}
        resolve(reason);
      }, 300);
    }

    function pickTarget() {
      if (targetId || done) return;
      // onlineUsers sudah bersih dari negara blocklist (lihat addOnlineUser).
      const candidates = [...onlineUsers.keys()].filter((id) => id !== guest.userId);
      if (candidates.length === 0) return;

      targetId = candidates[Math.floor(Math.random() * candidates.length)];
      clearTimeout(waitUsersTimer);

      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status = "matched";

      const targetCountry = onlineUsers.get(targetId);
      if (isPriorityCountry(targetCountry)) {
        stats.totalPriority++;
        log("SUCCESS", `⭐ Target PRIORITAS dipilih (dari ${candidates.length} user online): ${targetId} | ${priorityLabel(targetCountry)}`);
        pushEvent("priority", `⭐ Target prioritas: ${targetId} — ${priorityLabel(targetCountry)}`);
      } else {
        log("SUCCESS", `✓ Target dipilih (acak dari ${candidates.length} user online): ${targetId}`);
        pushEvent("match", `Target dipilih: ${targetId} (dari ${candidates.length} online)`);
      }

      setTimeout(() => {
        if (done) return;
        const greetMsg = pick(cfg.MESSAGE_GREETS);
        socket.emit("send_message", {
          user_id:     guest.userId,
          partner_id:  targetId,
          destination: targetId,
          message:     greetMsg,
          message_id:  uuidv4(),
        });
        stats.totalMsgSent++;
        messageSent = true;
        log("BOT", `→ Sapa ke ${targetId}: "${greetMsg}"`);
        pushEvent("send", `Sapa dikirim ke ${targetId}`);

        replyTimer = setTimeout(() => {
          log("WARN", `Tidak ada balasan dari ${targetId} dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
          stats.totalNoReply++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
          finish("no-reply-timeout");
        }, cfg.WAIT_REPLY_MS);
      }, cfg.DELAY_SEND_MS);
    }

    log("INFO", `Konek sebagai ${guest.displayName} (user_id=${guest.userId})`);
    stats.status = "connecting";

    socket = io(cfg.WS_SERVER, {
      path:            cfg.SOCKET_PATH,
      transports:      ["polling", "websocket"],
      withCredentials: true,
      reconnection:    false,
      timeout:         cfg.SOCKET_TIMEOUT_MS,
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
        "Cookie":     guest.cookieHeader,
      },
      auth: { user_id: guest.userId },
    });

    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "searching";
      pushEvent("search", `Sesi #${stats.currentSession} menunggu user online...`);

      waitUsersTimer = setTimeout(() => {
        if (!targetId && !done) {
          log("WARN", `Tidak ada user online dalam ${cfg.WAIT_USERS_MS / 1000}s`);
          stats.totalNoMatch++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no users timeout`);
          finish("no-users-timeout");
        }
      }, cfg.WAIT_USERS_MS);
    });

    // ── Daftar user online (lobby publik) ───────────────────────────────────
    // Tambah user ke daftar online, kecuali negaranya masuk blocklist —
    // di-skip di sini (bukan saat pickTarget) supaya tiap user hanya
    // dihitung/di-log sekali, tidak berulang tiap kali pickTarget dipanggil.
    function addOnlineUser(u) {
      if (!u || u.user_id == null) return;
      const id      = String(u.user_id);
      const country = u.country_code || u.country || "xx";
      if (isBlockedCountry(country)) {
        stats.totalFiltered++;
        log("INFO", `Skip user ${id} — negara ${countryLabel(country)} (blocklist)`);
        return;
      }
      onlineUsers.set(id, country);
    }

    socket.on("existing_users", (data) => {
      const users = (data && Array.isArray(data.users)) ? data.users : [];
      for (const u of users) addOnlineUser(u);
      pickTarget();
    });

    socket.on("new_user", (data) => {
      addOnlineUser((data && data.user) || data);
      pickTarget();
    });

    socket.on("user_disconnected", (data) => {
      if (data && data.user_id != null) onlineUsers.delete(String(data.user_id));
    });

    // ── Pesan masuk ───────────────────────────────────────────────────────────
    socket.on("receive_message", (data) => {
      if (done || !targetId) return;
      if (String(data?.from_user) !== String(targetId)) return; // abaikan pesan dari user lain

      const text = data.message_text || "(media)";
      stats.totalReplies++;
      stats.lastReplyAt = Date.now();
      log("MSG", `${guest.displayName ? "Stranger" : ""} ${targetId}: "${String(text).slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari ${targetId}: "${String(text).slice(0, 80)}"`);

      if (messageSent && !goodbyeSent) {
        goodbyeSent = true;
        clearTimeout(replyTimer);

        setTimeout(() => {
          if (done) return;
          socket.emit("send_message", {
            user_id:     guest.userId,
            partner_id:  targetId,
            destination: targetId,
            message:     cfg.MESSAGE_GOODBYE,
            message_id:  uuidv4(),
          });
          stats.totalMsgSent++;
          log("BOT", `→ Pamit ke ${targetId}: "${cfg.MESSAGE_GOODBYE}"`);
          pushEvent("send", `Pamit dikirim ke ${targetId}`);
          setTimeout(() => finish("goodbye-sent"), cfg.DELAY_END_MS);
        }, cfg.DELAY_GOODBYE_MS);
      }
    });

    socket.on("message_send_failed", (d) => {
      log("WARN", "message_send_failed", JSON.stringify(d || {}).slice(0, 100));
      pushEvent("warn", `message_send_failed: ${JSON.stringify(d || {}).slice(0, 80)}`);
    });

    // ── Events terminasi/moderasi dari server ──────────────────────────────────
    socket.on("account_banned", (d) => {
      stats.totalBlocked++;
      log("WARN", "account_banned", JSON.stringify(d || {}).slice(0, 100));
      pushEvent("blocked", `account_banned: ${JSON.stringify(d || {}).slice(0, 80)}`);
      finish("account-banned");
    });

    socket.on("banned", (d) => {
      stats.totalBlocked++;
      log("WARN", "banned", JSON.stringify(d || {}).slice(0, 100));
      pushEvent("blocked", `banned: ${JSON.stringify(d || {}).slice(0, 80)}`);
      finish("banned");
    });

    socket.on("chat_rate_limited", (d) => {
      log("WARN", "chat_rate_limited", JSON.stringify(d || {}).slice(0, 100));
      pushEvent("warn", `chat_rate_limited: ${JSON.stringify(d || {}).slice(0, 80)}`);
    });

    // ── Error & disconnect ────────────────────────────────────────────────────
    socket.on("connect_error", (err) => {
      log("ERROR", `Koneksi gagal: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `connect_error: ${err.message}`);
      finish("connect-error");
    });

    socket.on("disconnect", (reason) => {
      log("WARN", `Disconnect: ${reason}`);
      if (!done) finish("disconnect");
    });

    socket.on("error", (err) => {
      log("ERROR", "Socket error:", String(err));
      stats.totalErrors++;
      stats.lastErrorMsg = String(err);
      pushEvent("error", String(err));
    });
  });
}

module.exports = { runSession };
