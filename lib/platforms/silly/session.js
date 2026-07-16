/**
 * lib/platforms/silly/session.js
 * Satu sesi chat penuh di SillyChat.
 *
 * Flow (reverse-engineered dari silly.chat bundle):
 *   1. new WebSocket(`wss://silly.chat/ws?token=<token>`)
 *   2. server → { type:"welcome", clientId }
 *   3. send   { feature:"text", type:"join", mode:"global" }
 *   4. server → { feature:"text", type:"matched", partnerId }
 *      (untuk text mode, langsung "connected" — tidak perlu WebRTC)
 *   5. send   { feature:"text", type:"chat-message", message:"..." }
 *   6. server → { feature:"text", type:"chat-message", message:"..." }
 *   7. send   { feature:"text", type:"leave-current-match" }
 *      send   { feature:"text", type:"exit-chat" }
 *   8. ws.close()
 *
 * Event server lain yang di-handle:
 *   - { feature:"text", type:"partner-left" }  → partner pergi
 *   - { feature:"text", type:"waiting" }        → masih di queue
 *   - { type:"banned", ... }                    → kena ban
 *   - close code 1008                           → token expired
 */

"use strict";

const WebSocket = require("ws");

const cfg = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log }              = require("../../core/logger");

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ token: string, userId: string, displayName: string }} guest
 * @returns {Promise<string>} alasan selesai
 */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function runSession(guest) {
  return new Promise((resolve) => {
    let ws;
    let matched        = false;
    let messageSent    = false;
    let goodbyeSent    = false;
    let done           = false;
    let matchTimer     = null;
    let replyTimer     = null;
    let partnerId      = null;

    // ── Selesaikan sesi ──────────────────────────────────────────────────────
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(matchTimer);
      clearTimeout(replyTimer);
      stats.status = "idle";

      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ feature: cfg.FEATURE, type: "leave-current-match" }));
          ws.send(JSON.stringify({ feature: cfg.FEATURE, type: "exit-chat" }));
        }
      } catch (_) {}

      setTimeout(() => {
        try { ws?.close(1000, "done"); } catch (_) {}
        resolve(reason);
      }, 400);
    }

    // ── Helper: kirim pesan chat ─────────────────────────────────────────────
    function sendMsg(text, label) {
      ws.send(JSON.stringify({ feature: cfg.FEATURE, type: "chat-message", message: text }));
      stats.totalMsgSent++;
      log("BOT", `→ ${label}: "${text}"`);
    }

    // ── Helper: dispatch event dari frame JSON server ────────────────────────
    function dispatch(msg) {
      if (!msg || typeof msg !== "object") return;

      // Event global (welcome, banned, error)
      if (!msg.feature) {
        if (msg.type === "welcome") {
          log("SUCCESS", `Terhubung — clientId=${msg.clientId}`);
          stats.status = "searching";
          pushEvent("search", `Sesi #${stats.currentSession} mencari partner...`);

          ws.send(JSON.stringify({ feature: cfg.FEATURE, type: "join", mode: cfg.JOIN_MODE }));
          log("BOT", "join dikirim — mencari partner...");

          matchTimer = setTimeout(() => {
            if (!matched) {
              log("WARN", `Tidak dapat match dalam ${cfg.WAIT_MATCH_MS / 1000}s`);
              stats.totalNoMatch++;
              pushEvent("warn", `Sesi #${stats.currentSession}: no match timeout`);
              finish("match-timeout");
            }
          }, cfg.WAIT_MATCH_MS);
          return;
        }
        if (msg.type === "banned") {
          log("WARN", `BANNED: reason=${msg.reason}`);
          finish("banned");
          return;
        }
        if (msg.type === "error") {
          log("ERROR", `Server error: ${msg.message || JSON.stringify(msg)}`);
          stats.totalErrors++;
          stats.lastErrorMsg = msg.message || "server error";
          pushEvent("error", `server error: ${msg.message || ""}`);
          return;
        }
        return;
      }

      // Event dengan feature (text:matched, text:chat-message, dst.)
      const key = `${msg.feature}:${msg.type}`;

      if (key === "text:matched") {
        if (done || matched) return;
        matched    = true;
        partnerId  = msg.partnerId || "?";
        clearTimeout(matchTimer);
        stats.totalMatches++;
        stats.lastMatchAt = Date.now();
        stats.status = "matched";
        log("SUCCESS", `✓ MATCH! partnerId=${partnerId}`);
        pushEvent("match", `Partner: ${partnerId}`);

        // Text mode: langsung connected setelah matched, tidak perlu WebRTC
        setTimeout(() => {
          if (done) return;
          sendMsg(pick(cfg.MESSAGE_GREETS), "Sapa");
          pushEvent("send", `Sapa dikirim ke ${partnerId}`);
          messageSent = true;

          replyTimer = setTimeout(() => {
            log("WARN", `Tidak ada balasan dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
            stats.totalNoReply++;
            pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
            finish("no-reply-timeout");
          }, cfg.WAIT_REPLY_MS);
        }, cfg.DELAY_SEND_MS);
        return;
      }

      if (key === "text:chat-message") {
        if (done) return;
        if (msg.partnerId && msg.partnerId !== partnerId) return; // bukan dari partner kita
        // filter echo pesan sendiri (server tidak echo, tapi jaga-jaga)
        const text = typeof msg.message === "string" ? msg.message : "(media)";
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
        return;
      }

      if (key === "text:partner-left") {
        log("INFO", "partner-left diterima");
        finish("partner-left");
        return;
      }

      if (key === "text:waiting") {
        log("INFO", `Masih di queue... (botTimerMs=${msg.botTimerMs || "?"})`);
        return;
      }
    }

    // ── Koneksi WebSocket ─────────────────────────────────────────────────────
    log("INFO", `Konek sebagai ${guest.displayName}`);
    stats.status = "connecting";

    const wsUrl = `${cfg.WS_URL}?token=${guest.token}`;
    ws = new WebSocket(wsUrl, {
      headers: {
        "Origin":     cfg.ORIGIN,
        "User-Agent": cfg.USER_AGENT,
      },
      handshakeTimeout: cfg.WS_TIMEOUT_MS,
    });

    ws.on("open", () => {
      stats.status = "authenticating";
      // server akan kirim "welcome" setelah open — tunggu di onmessage
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        dispatch(msg);
      } catch (_) {}
    });

    ws.on("close", (code, reason) => {
      log("WARN", `WS close: ${code} ${reason || ""}`);
      if (code === 1008) {
        // Token expired — retry akan buat guest baru
        stats.totalErrors++;
        stats.lastErrorMsg = "token expired (1008)";
      }
      if (!done) finish("disconnect");
    });

    ws.on("error", (err) => {
      log("ERROR", `WS error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `ws error: ${err.message}`);
      if (!done) finish("connect-error");
    });
  });
}

module.exports = { runSession };
