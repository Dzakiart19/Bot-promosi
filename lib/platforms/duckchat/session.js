/**
 * lib/platforms/duckchat/session.js
 * Satu sesi chat di DuckChat: konek → match → sapa → pamit → end.
 *
 * Flow (reverse-engineered dari chunk 2096 + findduck/page bundle):
 *   1. io(WS_SERVER, { auth: { token, userId, userIdentifier, jwtToken, dbId }, transports: ["websocket"] })
 *   2. on("connect")    → emit "find_chat" { userId }
 *   3. on("chat_found") → identifikasi stranger → kirim sapa (terenkripsi)
 *   4. on("recieve_message") → decrypt → kirim pamit (terenkripsi) → finish
 *   5. finish()         → emit "leavechat" → socket.disconnect()
 *
 * Enkripsi: AES-256-CTR, kunci "secret_key" (hardcoded di frontend DuckChat),
 * format output: base64(IV[16 bytes] + ciphertext).
 */

"use strict";

const crypto          = require("crypto");
const { io }          = require("socket.io-client");
const { v4: uuidv4 }  = require("uuid");

const cfg                  = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log }              = require("../../core/logger");

// ── Enkripsi / Dekripsi ────────────────────────────────────────────────────────
const _hashedKey = crypto.createHash("sha256").update(cfg.ENCRYPT_KEY).digest();

function encrypt(text) {
  if (!text) return "";
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv("aes-256-ctr", _hashedKey, iv);
  const enc     = Buffer.concat([cipher.update(Buffer.from(text)), cipher.final()]);
  return Buffer.concat([iv, enc]).toString("base64");
}

function decrypt(b64) {
  if (!b64) return "";
  try {
    const buf     = Buffer.from(b64, "base64");
    const iv      = buf.slice(0, 16);
    const decipher = crypto.createDecipheriv("aes-256-ctr", _hashedKey, iv);
    return Buffer.concat([decipher.update(buf.slice(16)), decipher.final()]).toString();
  } catch (_) {
    return "[pesan tidak bisa didekripsi]";
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** messageId sesuai format DuckChat: 15 char alphanum + "_" + timestamp */
function generateMessageId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 15; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s}_${Date.now()}`;
}

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ userId, userIdentifier, jwtToken, dbId, displayName }} guest
 * @returns {Promise<string>} alasan selesai
 */
function runSession(guest) {
  return new Promise((resolve) => {
    let socket;
    let matched      = false;
    let messageSent  = false;
    let goodbyeSent  = false;
    let done         = false;
    let matchTimer   = null;
    let replyTimer   = null;

    // ── Selesaikan sesi & bersihkan resource ─────────────────────────────────
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(matchTimer);
      clearTimeout(replyTimer);
      stats.status = "idle";

      try {
        if (socket?.connected) socket.emit("leavechat");
      } catch (_) {}

      setTimeout(() => {
        try { socket?.disconnect(); } catch (_) {}
        resolve(reason);
      }, 400);
    }

    // ── Helper: kirim pesan terenkripsi ───────────────────────────────────────
    function sendMsg(text, label) {
      const messageId   = generateMessageId();
      const encText     = encrypt(text);
      const encReply    = encrypt("");

      socket.timeout(cfg.SEND_TIMEOUT_MS).emit(
        "send_message",
        {
          text:                   encText,
          messageId,
          from:                   guest.userId,
          replyToSpecificMessage: encReply,
        },
        (err) => {
          if (err) log("WARN", `${label} timeout/error:`, String(err));
          else     log("BOT",  `${label} terkirim (ack ok)`);
        }
      );
      stats.totalMsgSent++;
      log("BOT", `→ ${label}: "${text}"`);
    }

    // ── Koneksi Socket.io ─────────────────────────────────────────────────────
    log("INFO", `Konek sebagai ${guest.displayName} (${guest.userId})`);
    stats.status = "connecting";

    socket = io(cfg.WS_SERVER, {
      path:         cfg.SOCKET_PATH,
      transports:   ["websocket"],          // polling tidak didukung server
      reconnection: false,
      timeout:      cfg.SOCKET_TIMEOUT_MS,
      auth: {
        token:          cfg.SOCKET_AUTH_TOKEN, // "authTokenFromClient" — literal dari source
        userId:         guest.userId,
        userIdentifier: guest.userIdentifier,
        utm:            "",
        jwtToken:       guest.jwtToken,
        dbId:           guest.dbId,
      },
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
      },
    });

    // ── connect → langsung find_chat ──────────────────────────────────────────
    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "searching";

      socket.emit("find_chat", { userId: guest.userId });
      log("BOT", "find_chat dikirim — mencari partner...");
      pushEvent("search", `Sesi #${stats.currentSession} mencari partner...`);

      matchTimer = setTimeout(() => {
        if (!matched) {
          log("WARN", `Tidak dapat match dalam ${cfg.WAIT_MATCH_MS / 1000}s`);
          stats.totalNoMatch++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no match timeout`);
          finish("match-timeout");
        }
      }, cfg.WAIT_MATCH_MS);
    });

    // ── chat_found → identifikasi stranger → kirim sapa ──────────────────────
    socket.on("chat_found", (data) => {
      if (done || matched) return;
      matched = true;
      clearTimeout(matchTimer);

      // Cari profil stranger (bukan profil kita sendiri)
      const profiles     = data?.profiles || [];
      const strangerProf = profiles.find((p) => p.userId !== guest.userId);
      const partnerName  = strangerProf?.profile?.username || "Stranger";

      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status      = "matched";
      log("SUCCESS", `✓ MATCH! partner=${partnerName}`);
      pushEvent("match", `Partner: ${partnerName}`);

      setTimeout(() => {
        if (done) return;
        sendMsg(pick(cfg.MESSAGE_GREETS), "Sapa");
        pushEvent("send", `Sapa dikirim ke ${partnerName}`);
        messageSent = true;

        replyTimer = setTimeout(() => {
          log("WARN", `Tidak ada balasan dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
          stats.totalNoReply++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
          finish("no-reply-timeout");
        }, cfg.WAIT_REPLY_MS);
      }, cfg.DELAY_SEND_MS);
    });

    // ── recieve_message → decrypt → balas pamit ───────────────────────────────
    socket.on("recieve_message", (data) => {
      if (done) return;
      if (data?.from === guest.userId) return; // abaikan pesan dari diri sendiri

      const text = decrypt(data?.text || "");
      stats.totalReplies++;
      stats.lastReplyAt = Date.now();
      log("MSG", `Stranger: "${text.slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari partner: "${text.slice(0, 80)}"`);

      if (messageSent && !goodbyeSent) {
        goodbyeSent = true;
        clearTimeout(replyTimer);

        setTimeout(() => {
          if (done) return;
          sendMsg(cfg.MESSAGE_GOODBYE, "Pamit");
          pushEvent("send", "Pamit dikirim ke partner");
          setTimeout(() => finish("goodbye-sent"), cfg.DELAY_END_MS);
        }, cfg.DELAY_GOODBYE_MS);
      }
    });

    // ── chatover → stranger skip atau kita sudah leavechat ───────────────────
    socket.on("chatover", (d) => {
      log("INFO", "chatover", JSON.stringify(d || {}).slice(0, 60));
      finish("chat-over");
    });

    // ── disconnect_custom → server minta putus ────────────────────────────────
    socket.on("disconnect_custom", () => {
      log("WARN", "disconnect_custom dari server");
      finish("disconnect-custom");
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
