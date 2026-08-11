/**
 * lib/platforms/chatsafari/session.js
 * Satu sesi chat di Chatsafari: konek socket → join room → tunggu user online →
 * pilih SATU target acak → sapa duluan → pamit → disconnect.
 *
 * Arsitektur Chatsafari (mirip Chatib — BUKAN random-match 1-on-1):
 *   Setelah connect socket, server mengirim daftar user online lewat event
 *   "users:update". Bot memilih SATU target acak dari daftar tersebut, lalu
 *   mengirim pesan via "message:send".
 *
 * Flow:
 *   1. io(WS_SERVER, { transports:["polling"] })
 *   2. emit "user:join" { userId, username, gender, age, avatar, isAnonymous }
 *   3. on "user:joined" → user online [{ id, username, gender, age, avatar, isOnline }]
 *   4. Pilih target acak → emit "message:send" { message, roomId, toUserId }
 *   5. on pesan balasan → kirim pamit → disconnect
 *   6. on "account:banned" → finish("account-banned") → caller bikin akun baru
 */

"use strict";

const { io } = require("socket.io-client");

const cfg = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log } = require("../../core/logger");

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ userId: string, username: string, gender: string, displayName: string }} guest
 * @returns {Promise<string>} alasan selesai
 */
function runSession(guest) {
  return new Promise((resolve) => {
    let socket;
    let onlineUsers   = new Map(); // userId → { username, gender } atau true
    let targetId      = null;
    let messageSent   = false;
    let goodbyeSent   = false;
    let done          = false;
    let waitUsersTimer = null;
    let replyTimer     = null;

    // ── Selesaikan sesi & bersihkan resource ─────────────────────────────────
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

    // ── Pilih target acak dari daftar user online ────────────────────────────
    function pickTarget() {
      if (targetId || done) return;
      const candidates = [...onlineUsers.keys()].filter((id) => id !== guest.userId);
      if (candidates.length === 0) return;

      targetId = candidates[Math.floor(Math.random() * candidates.length)];
      clearTimeout(waitUsersTimer);

      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status = "matched";

      const targetInfo = onlineUsers.get(targetId);
      const targetName = (targetInfo && targetInfo.username)
        ? targetInfo.username
        : targetId.slice(0, 8);

      log("SUCCESS", `✓ Target dipilih (acak dari ${candidates.length} user online): ${targetName} (${targetId})`);
      pushEvent("match", `Target dipilih: ${targetName} (dari ${candidates.length} online)`);

      setTimeout(() => {
        if (done) return;
        const greetMsg = pick(cfg.MESSAGE_GREETS);
        socket.emit("message:send", {
          message:  greetMsg,
          roomId:   cfg.ROOM_ID,
          toUserId: targetId,
        });
        stats.totalMsgSent++;
        messageSent = true;
        log("BOT", `→ Sapa ke ${targetName}: "${greetMsg.slice(0, 60)}..."`);
        pushEvent("send", `Sapa dikirim ke ${targetName}`);

        replyTimer = setTimeout(() => {
          log("WARN", `Tidak ada balasan dari ${targetName} dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
          stats.totalNoReply++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
          finish("no-reply-timeout");
        }, cfg.WAIT_REPLY_MS);
      }, cfg.DELAY_SEND_MS);
    }

    // ── Koneksi Socket.IO ─────────────────────────────────────────────────────
    log("INFO", `Konek sebagai ${guest.displayName} (userId=${guest.userId})`);
    stats.status = "connecting";

    socket = io(cfg.WS_SERVER, {
      path:            cfg.SOCKET_PATH,
      transports:      cfg.SOCKET_TRANSPORTS,
      withCredentials: true,
      reconnection:    false,
      timeout:         cfg.SOCKET_TIMEOUT_MS,
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
      },
    });

    // ── connect → join room & mulai cari target ───────────────────────────────
    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "searching";
      pushEvent("search", `Sesi #${stats.currentSession} join room, menunggu user online...`);

      // Emit user:join untuk masuk ke global room.
      // Kirim format yang sama seperti response API (pakai "id" bukan "userId").
      socket.emit("user:join", {
        id:          guest.id || guest.userId,
        userId:      guest.userId,
        username:    guest.username,
        gender:      guest.gender,
        age:         guest.age || 25,
        avatar:      guest.avatar || null,
        isAnonymous: guest.isAnonymous !== undefined ? guest.isAnonymous : true,
      });
      log("BOT", "user:join dikirim — menunggu daftar user online...");

      // Timer: kalau tidak ada user online dalam batas waktu
      waitUsersTimer = setTimeout(() => {
        if (!targetId && !done) {
          log("WARN", `Tidak ada user online dalam ${cfg.WAIT_USERS_MS / 1000}s`);
          stats.totalNoMatch++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no users timeout`);
          finish("no-users-timeout");
        }
      }, cfg.WAIT_USERS_MS);
    });

    // ── Daftar user online (dari server) ─────────────────────────────────────
    // users:update bisa berupa array user atau object dengan key users
    function processUsersList(data) {
      let users = [];
      if (Array.isArray(data)) {
        users = data;
      } else if (data && Array.isArray(data.users)) {
        users = data.users;
      } else if (data && typeof data === "object") {
        // Kadang server kirim object per-user, gabungkan
        users = Object.values(data);
      }

      for (const u of users) {
        if (!u) continue;
        const id = String(u.id || u.userId || u.user_id || "");
        if (!id || id === guest.userId) continue;
        if (!onlineUsers.has(id)) {
          onlineUsers.set(id, {
            username: u.username || null,
            gender:   u.gender || null,
          });
        }
      }

      // Coba pilih target kalau belum ada
      pickTarget();
    }

    // Server kirim daftar user online setelah user:join
    socket.on("users:update", (data) => {
      processUsersList(data);
    });

    // Fallback event name — beberapa versi server mungkin pakai nama berbeda
    socket.on("online_users", (data) => {
      processUsersList(data);
    });

    socket.on("users_list", (data) => {
      processUsersList(data);
    });

    // User baru join — tambahkan ke daftar & coba pick target baru kalau belum ada
    // Event aktual dari server: "user:joined" (dengan colon, bukan underscore)
    socket.on("user:joined", (data) => {
      const u = data?.user || data;
      if (!u) return;
      const id = String(u.id || u.userId || u.user_id || "");
      if (!id || id === guest.userId) return;
      onlineUsers.set(id, {
        username: u.username || null,
        gender:   u.gender || null,
      });
      pickTarget();
    });

    // User disconnect — hapus dari daftar
    socket.on("user:left", (data) => {
      const id = String(data?.userId || data?.id || data?.user_id || "");
      if (id) onlineUsers.delete(id);
    });

    // ── Pesan masuk ───────────────────────────────────────────────────────────
    // Chatsafari bisa kirim pesan via event "message" atau "message:receive"
    function handleMessage(data) {
      if (done || !targetId) return;

      // Pastikan pesan dari target kita
      const fromId = String(data?.fromUserId || data?.from || data?.userId || "");
      if (fromId !== targetId) return;

      const text = data?.message || data?.text || "(media)";
      stats.totalReplies++;
      stats.lastReplyAt = Date.now();

      const targetInfo = onlineUsers.get(targetId);
      const targetName = (targetInfo && targetInfo.username) || targetId.slice(0, 8);

      log("MSG", `${targetName}: "${String(text).slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari ${targetName}: "${String(text).slice(0, 80)}"`);

      if (messageSent && !goodbyeSent) {
        goodbyeSent = true;
        clearTimeout(replyTimer);

        setTimeout(() => {
          if (done) return;
          socket.emit("message:send", {
            message:  cfg.MESSAGE_GOODBYE,
            roomId:   cfg.ROOM_ID,
            toUserId: targetId,
          });
          stats.totalMsgSent++;
          log("BOT", `→ Pamit ke ${targetName}: "${cfg.MESSAGE_GOODBYE}"`);
          pushEvent("send", `Pamit dikirim ke ${targetName}`);
          setTimeout(() => finish("goodbye-sent"), cfg.DELAY_END_MS);
        }, cfg.DELAY_GOODBYE_MS);
      }
    }

    socket.on("message", handleMessage);
    socket.on("message:receive", handleMessage);
    socket.on("receive_message", handleMessage);

    // Typing indicator dari target (opsional, hanya log)
    socket.on("typing:start", (data) => {
      const fromId = String(data?.userId || data?.from || "");
      if (fromId === targetId) {
        const targetInfo = onlineUsers.get(targetId);
        const targetName = (targetInfo && targetInfo.username) || targetId.slice(0, 8);
        log("INFO", `${targetName} sedang mengetik...`);
      }
    });

    // ── Events terminasi/moderasi dari server ──────────────────────────────────
    socket.on("account:banned", (data) => {
      stats.totalBlocked++;
      const reason = data?.reason || "unknown";
      log("WARN", `account:banned — reason: ${reason}`);
      pushEvent("blocked", `account:banned: ${reason}`);
      finish("account-banned");
    });

    socket.on("banned", (data) => {
      stats.totalBlocked++;
      const reason = data?.reason || "unknown";
      log("WARN", `banned — reason: ${reason}`);
      pushEvent("blocked", `banned: ${reason}`);
      finish("banned");
    });

    socket.on("kicked", (data) => {
      log("WARN", `kicked dari room:`, JSON.stringify(data || {}).slice(0, 100));
      pushEvent("warn", `kicked: ${JSON.stringify(data || {}).slice(0, 80)}`);
      finish("kicked");
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
      const msg = (err && typeof err === "object") ? (err.message || JSON.stringify(err)) : String(err);
      log("ERROR", `Socket error: ${msg}`);
      stats.totalErrors++;
      stats.lastErrorMsg = msg;
      pushEvent("error", msg);
    });
  });
}

module.exports = { runSession };
