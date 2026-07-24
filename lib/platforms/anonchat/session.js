/**
 * lib/platforms/anonchat/session.js
 * Satu sesi chat di AnonChat: konek → start-search → partner-found → sapa → pamit → close.
 *
 * Flow (reverse-engineered dari alpha.anonchat.com bundle 9312-*.js):
 *   1. Fetch API URL dari anonchat-connect-url.stivisto.com
 *   2. io(apiUrl, { transports:["websocket"], query:{ cookie, secret, version, ... } })
 *   3. on("connect")      → emit "start-search" { gender, interests }
 *   4. on("partner-found") { _id: dialogId, partnerPublicInfo } → kirim sapa
 *   5. on("send-message") { dialogId, message } → kirim pamit → emit "close-dialog"
 *   6. on("close-dialog") { _id } → partner pergi
 *
 * Auth:
 *   - cookie   = nilai auth_token dari ANONCHAT_COOKIES
 *   - userId   = nilai user_id dari ANONCHAT_COOKIES
 *   - secret   = CryptoJS.AES.encrypt(JSON.stringify([{secret:userId}]), reversedKey)
 */

"use strict";

const { io }       = require("socket.io-client");
const CryptoJS     = require("crypto-js");
const { v4: uuidv4 } = require("uuid");

const cfg                  = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log }              = require("../../core/logger");

// ── Cache API URL (diambil sekali, disimpan 10 menit) ──────────────────────────
let _apiUrlCache    = null;
let _apiUrlFetchedAt = 0;
const API_URL_TTL_MS = 10 * 60 * 1000;

async function getApiUrl() {
  const now = Date.now();
  if (_apiUrlCache && (now - _apiUrlFetchedAt) < API_URL_TTL_MS) return _apiUrlCache;

  try {
    const res  = await fetch(cfg.CONNECT_URL_SERVICE, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data?.url) {
      _apiUrlCache     = data.url;
      _apiUrlFetchedAt = now;
      return _apiUrlCache;
    }
  } catch (err) {
    log("WARN", `Gagal fetch connect-url: ${err.message} — pakai fallback`);
  }

  return cfg.API_SERVER_FALLBACK;
}

// ── Secret hash (dari _generateSecretHash di bundle) ──────────────────────────
function generateSecretHash(userId) {
  const reversedKey = Array.from(cfg.SECRET_KEY_RAW).reverse().join("");
  return CryptoJS.AES.encrypt(JSON.stringify([{ secret: userId }]), reversedKey).toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeMessage(text) {
  return {
    msgId: uuidv4(),
    type:  "text",
    text,
  };
}

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ cookie: string, userId: string, displayName: string }} guest
 * @returns {Promise<string>} alasan selesai
 */
function runSession(guest) {
  return new Promise(async (resolve) => {
    let socket;
    let dialogId    = null;
    let matched     = false;
    let messageSent = false;
    let goodbyeSent = false;
    let done        = false;
    let matchTimer  = null;
    let replyTimer  = null;

    // ── Selesaikan sesi ───────────────────────────────────────────────────────
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(matchTimer);
      clearTimeout(replyTimer);
      stats.status = "idle";

      // Kirim close-dialog kalau masih konek dan ada dialog
      try {
        if (socket?.connected && dialogId) {
          socket.emit("close-dialog", { _id: dialogId });
        }
      } catch (_) {}

      setTimeout(() => {
        try { socket?.disconnect(); } catch (_) {}
        resolve(reason);
      }, 400);
    }

    // ── Kirim sapa ───────────────────────────────────────────────────────────
    function sendGreeting() {
      if (done || !dialogId) return;
      const text = pick(cfg.MESSAGE_GREETS);
      const msg  = makeMessage(text);

      socket.timeout(cfg.SEND_TIMEOUT_MS).emit(
        "send-message",
        { dialogId, message: msg },
        (err) => {
          if (err) log("WARN", `Sapa timeout: ${err.message || err}`);
          else     log("BOT", "→ Sapa terkirim (ack ok)");
        }
      );
      stats.totalMsgSent = (stats.totalMsgSent || 0) + 1;
      log("BOT", `→ Sapa: "${text}"`);
    }

    // ── Kirim pamit ──────────────────────────────────────────────────────────
    function sendGoodbye() {
      if (done || !dialogId) return;
      const msg = makeMessage(cfg.MESSAGE_GOODBYE);

      socket.timeout(cfg.SEND_TIMEOUT_MS).emit(
        "send-message",
        { dialogId, message: msg },
        (err) => {
          if (err) log("WARN", `Pamit timeout: ${err.message || err}`);
          else     log("BOT", "→ Pamit terkirim (ack ok)");
        }
      );
      log("BOT", `→ Pamit: "${cfg.MESSAGE_GOODBYE}"`);
    }

    // ── Ambil API URL & bangun socket ─────────────────────────────────────────
    let apiUrl;
    try {
      apiUrl = await getApiUrl();
    } catch (err) {
      return resolve("api-url-error: " + err.message);
    }

    // Query param dikirim lewat socket.io handshake
    const socketQuery = {
      cookie:            guest.cookie,
      secret:            generateSecretHash(guest.userId),
      version:           cfg.APP_VERSION,
      systemLanguage:    "id",
      platform:          "web",
      systemRawLanguage: "id-ID",
      ip:                "ip",
      deviceInfo:        JSON.stringify({ userAgent: cfg.USER_AGENT, platform: "Win32" }),
      systemInfo:        JSON.stringify({ screenWidth: 1920, screenHeight: 1080 }),
    };

    log("INFO", `Konek ke ${apiUrl} sebagai user_${guest.userId.slice(-6)}`);
    stats.status = "connecting";

    socket = io(apiUrl, {
      transports:      ["websocket"],
      autoConnect:     false,
      reconnection:    false,
      timeout:         cfg.SOCKET_TIMEOUT_MS,
      upgrade:         false,
      rememberUpgrade: false,
      query:           socketQuery,
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
      },
    });

    // ── connect ───────────────────────────────────────────────────────────────
    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "searching";
      pushEvent("search", `Sesi #${stats.currentSession} mencari partner...`);

      // Emit start-search dengan ack
      socket.timeout(cfg.SEND_TIMEOUT_MS).emit(
        "start-search",
        { gender: cfg.GENDER, interests: cfg.INTERESTS },
        (err) => {
          if (err) {
            log("WARN", `start-search ack timeout: ${err?.message || err}`);
          } else {
            log("BOT", "start-search dikirim — mencari partner...");
          }
        }
      );

      matchTimer = setTimeout(() => {
        if (!matched) {
          log("WARN", `Tidak dapat match dalam ${cfg.WAIT_MATCH_MS / 1000}s`);
          stats.totalNoMatch = (stats.totalNoMatch || 0) + 1;
          pushEvent("warn", `Sesi #${stats.currentSession}: no match timeout`);
          finish("match-timeout");
        }
      }, cfg.WAIT_MATCH_MS);
    });

    // ── partner-found ─────────────────────────────────────────────────────────
    socket.on("partner-found", (data) => {
      if (done || matched) return;
      matched = true;
      clearTimeout(matchTimer);

      dialogId = data?._id;
      const uid = data?.partnerPublicInfo?.uid || "?";

      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status = "matched";

      log("SUCCESS", `✓ MATCH! dialogId=${dialogId} | partner uid=${uid}`);
      pushEvent("match", `Partner uid:${String(uid).slice(0, 12)} | dialog:${String(dialogId).slice(0, 12)}…`);

      setTimeout(() => {
        if (done) return;
        sendGreeting();
        messageSent = true;
        pushEvent("send", `Sapa dikirim ke partner (uid:${String(uid).slice(0, 8)})`);

        replyTimer = setTimeout(() => {
          log("WARN", `Tidak ada balasan dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
          stats.totalNoReply = (stats.totalNoReply || 0) + 1;
          pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
          finish("no-reply-timeout");
        }, cfg.WAIT_REPLY_MS);
      }, cfg.DELAY_SEND_MS);
    });

    // ── send-message (pesan masuk dari partner) ───────────────────────────────
    socket.on("send-message", (data) => {
      if (done) return;

      // Abaikan pesan yang kita kirim sendiri (cek sender)
      const senderUid = data?.message?.sender;
      if (senderUid && String(senderUid) === String(guest.userId)) return;

      // Pesan dari dialogId lain (edge case) — abaikan
      if (data?.dialogId && dialogId && data.dialogId !== dialogId) return;

      const text = data?.message?.text || "(media)";
      stats.totalReplies++;
      stats.lastReplyAt = Date.now();
      log("MSG", `Stranger: "${String(text).slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari partner: "${String(text).slice(0, 80)}"`);

      if (messageSent && !goodbyeSent) {
        goodbyeSent = true;
        clearTimeout(replyTimer);

        setTimeout(() => {
          if (done) return;
          sendGoodbye();
          pushEvent("send", "Pamit dikirim ke partner");
          setTimeout(() => finish("goodbye-sent"), cfg.DELAY_END_MS);
        }, cfg.DELAY_GOODBYE_MS);
      }
    });

    // ── close-dialog (partner pergi / dialog ditutup server) ──────────────────
    socket.on("close-dialog", (data) => {
      if (done) return;
      log("INFO", `close-dialog diterima: _id=${data?._id}`);
      finish("partner-left");
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
      log("ERROR", "Socket error: " + String(err));
      stats.totalErrors++;
      stats.lastErrorMsg = String(err);
      pushEvent("error", "socket error: " + String(err));
    });

    socket.connect();
  });
}

module.exports = { runSession };
