/**
 * lib/platforms/yapping/session.js
 * Satu sesi chat di Yapping: konek → identify → join queue → match → sapa → pamit → leave.
 *
 * Flow (reverse-engineered dari yapping.me/chat, bundle SvelteKit):
 *   1. io(BASE_URL, { withCredentials, extraHeaders:{Cookie} })
 *   2. on("connect")       → emit "identify_user" { username }
 *   3. emit "join_match_queue" { filters:{gender,isPaidUser,interests}, username }
 *   4. on("match_found")   → { match, conversationId, mode, token, roomId }
 *                          → emit "join_conversation" { conversationId, mode, token }
 *   5. on("room_active")   → room siap → emit "chat_message" sapa
 *   6. on("chat_message")  → balasan dari partner (bukan pesan sendiri, dicek via sender)
 *                          → emit "chat_message" pamit → emit "leave_match_queue" → disconnect
 *   7. on("user_left_chat") / on("matchmaking_error") → sesi berakhir dari sisi server/partner
 */

"use strict";

const { io } = require("socket.io-client");

const cfg = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log } = require("../../core/logger");

function genMsgId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ username: string, cookieHeader: string, displayName: string }} guest
 * @returns {Promise<string>} alasan selesai (got-reply, match-timeout, dsb)
 */
function runSession(guest) {
  return new Promise((resolve) => {
    let socket;
    let conversationId = null;
    let matched        = false; // guard: match_found jangan diproses dua kali
    let roomActive      = false; // room_active sudah diterima → boleh kirim pesan
    let messageSent     = false; // pesan sapa sudah terkirim
    let goodbyeSent     = false; // pesan pamit sudah terkirim
    let done            = false;
    let matchTimer      = null;
    let replyTimer       = null;
    let queueJoined     = false;
    let partnerUsername  = null;
    let lastSentLabel    = null; // label pesan terakhir dikirim, dipakai untuk resend jika ditolak
    let greetRetried     = false; // guard: fallback greet tanpa link hanya dicoba sekali

    // ── Selesaikan sesi & bersihkan resource ─────────────────────────────────
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(matchTimer);
      clearTimeout(replyTimer);
      stats.status = "idle";

      try {
        if (socket?.connected) {
          socket.emit("leave_match_queue", { username: guest.username });
        }
      } catch (_) {}

      setTimeout(() => {
        try { socket?.disconnect(); } catch (_) {}
        resolve(reason);
      }, 400);
    }

    // ── Helper: emit "chat_message" ─────────────────────────────────────────
    function sendMsg(text, label) {
      const msg = {
        id: genMsgId(),
        text,
        timestamp: new Date(),
        sender: guest.username,
      };
      lastSentLabel = label;
      socket.emit("chat_message", { conversationId, message: msg });
      stats.totalMsgSent++;
      log("BOT", `→ ${label}: "${text}"`);
    }

    // ── Mulai cari partner ────────────────────────────────────────────────────
    function startSearch() {
      if (queueJoined || done) return;
      queueJoined = true;
      stats.status = "searching";
      pushEvent("search", `Sesi #${stats.currentSession} mencari partner...`);

      socket.emit("join_match_queue", {
        filters: {
          gender:      cfg.WANT_GENDER,
          isPaidUser:  cfg.IS_PAID_USER,
          interests:   cfg.INTERESTS,
        },
        username: guest.username,
      });
      log("BOT", "join_match_queue dikirim — mencari partner...");

      matchTimer = setTimeout(() => {
        if (!conversationId) {
          log("WARN", `Tidak dapat match dalam ${cfg.WAIT_MATCH_MS / 1000}s`);
          stats.totalNoMatch++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no match timeout`);
          finish("match-timeout");
        }
      }, cfg.WAIT_MATCH_MS);
    }

    // ── Koneksi Socket.io ─────────────────────────────────────────────────────
    log("INFO", `Konek sebagai ${guest.displayName}`);
    stats.status = "connecting";

    socket = io(cfg.BASE_URL, {
      path:            cfg.SOCKET_PATH,
      transports:      cfg.SOCKET_TRANSPORTS,
      withCredentials: true,
      reconnection:    false,
      timeout:         cfg.SOCKET_TIMEOUT_MS,
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
        "Cookie":     guest.cookieHeader,
      },
    });

    // ── connect ───────────────────────────────────────────────────────────────
    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "authenticating";
      socket.emit("identify_user", { username: guest.username });
    });

    socket.on("user_identified", () => {
      log("INFO", "user_identified (dikonfirmasi server)");
      setTimeout(startSearch, cfg.DELAY_JOIN_QUEUE_MS);
    });

    // ── match_found ───────────────────────────────────────────────────────────
    socket.on("match_found", (data) => {
      if (done || matched) return;
      matched = true;
      clearTimeout(matchTimer);

      conversationId    = data?.conversationId;
      partnerUsername   = data?.match || "?";
      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status = "matched";
      log("SUCCESS", `✓ MATCH! partner=${partnerUsername} | conversationId=${conversationId}`);
      pushEvent("match", `Partner: ${partnerUsername} | conversation: ${String(conversationId).slice(0, 24)}…`);

      socket.emit("join_conversation", {
        conversationId,
        mode:  data?.mode,
        token: data?.token,
      });
      log("BOT", "join_conversation dikirim");
    });

    // Room siap dipakai — baru boleh kirim sapa.
    socket.on("room_active", () => {
      if (done || roomActive) return;
      roomActive = true;

      setTimeout(() => {
        if (done) return;
        sendMsg(pick(cfg.MESSAGE_GREETS), "Sapa");
        pushEvent("send", `Sapa dikirim ke partner (${partnerUsername})`);
        messageSent = true;

        replyTimer = setTimeout(() => {
          log("WARN", `Tidak ada balasan dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
          stats.totalNoReply++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
          finish("no-reply-timeout");
        }, cfg.WAIT_REPLY_MS);
      }, cfg.DELAY_SEND_MS);
    });

    // ── pesan masuk ───────────────────────────────────────────────────────────
    socket.on("chat_message", (data) => {
      if (done) return;
      if (data?.sender === guest.username) return; // pesan kita sendiri (echo)

      const text = data?.text || "(media)";
      stats.totalReplies++;
      stats.lastReplyAt = Date.now();
      log("MSG", `Stranger: "${String(text).slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari partner: "${String(text).slice(0, 80)}"`);

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

    // ── Events terminasi dari server ──────────────────────────────────────────
    socket.on("user_left_chat", (data) => {
      log("INFO", "user_left_chat", JSON.stringify(data || {}).slice(0, 80));
      finish("partner-left");
    });

    socket.on("matchmaking_error", (err) => {
      const msg = typeof err === "string" ? err : err?.message || "unknown";
      log("ERROR", `matchmaking_error: ${msg}`);
      stats.totalErrors++;
      stats.lastErrorMsg = msg;
      pushEvent("error", `matchmaking_error: ${msg}`);
      finish("matchmaking-error");
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
      // Abaikan error yang datang setelah sesi selesai (cleanup/disconnect noise)
      if (done) return;

      // Yapping menolak link mentah pada free plan → server balas error
      // "LINK_NOT_ALLOWED" alih-alih menolak koneksi. Pesan sapa yang kita kirim
      // tadi tidak diteruskan ke partner. Kirim ulang sekali dengan versi tanpa
      // link (domain dipisah spasi) supaya sapa tetap terkirim, bukan error diam-diam.
      if (
        err &&
        err.code === "LINK_NOT_ALLOWED" &&
        lastSentLabel === "Sapa" &&
        !greetRetried
      ) {
        greetRetried = true;
        log("WARN", `Sapa ditolak (LINK_NOT_ALLOWED) — kirim ulang versi tanpa link mentah`);
        pushEvent("warn", "Sapa ditolak (link tidak diizinkan) — retry dengan versi aman");
        sendMsg(pick(cfg.MESSAGE_GREETS_SAFE), "Sapa");
        return;
      }

      // Serialisasi error: socket.io error bisa berupa Error instance (circular ref)
      // atau plain object — tangani keduanya tanpa "[object Object]"
      const detail =
        (err instanceof Error && err.message)
          ? err.message
          : (typeof err === "string")
            ? err
            : (err?.message || err?.code || err?.type)
              ? `${err.code || err.type || "error"}: ${err.message || ""}`
              : (() => { try { return JSON.stringify(err); } catch (_) { return String(err); } })();

      log("ERROR", `Socket error: ${detail}`);
      stats.totalErrors++;
      stats.lastErrorMsg = detail;
      pushEvent("error", `Socket error: ${detail}`);
    });
  });
}

module.exports = { runSession };
