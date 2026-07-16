/**
 * lib/platforms/temanid/persistence.js
 * ─────────────────────────────────────────────────────────────────────────────
 * TemanID Bot BERBAGI session dengan Telegram Bot pertama.
 * Satu akun = satu login = semua bot jalan.
 *
 * Baca dari: DB key "telegram_session" dan file ".telegram_session"
 * (sama persis dengan lib/platforms/telegram/persistence.js)
 *
 * Tidak ada writeSession / clearSession sendiri — session dikelola
 * sepenuhnya oleh Telegram Bot (auth-server.js di port 3000).
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

// Cukup re-export dari modul session utama.
// Satu titik kebenaran — tidak ada duplikasi data.
module.exports = require("../telegram/persistence");
