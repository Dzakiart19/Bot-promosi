/**
 * lib/core/platforms-registry.js
 * Daftar semua platform bot yang berjalan di project ini.
 *
 * Dashboard monitor (public/monitor.html) membaca daftar ini lewat
 * GET /api/stats/all untuk menampilkan SEMUA platform sekaligus,
 * apa pun port yang sedang dibuka user di preview.
 *
 * Untuk menambah platform baru: cukup tambah satu baris di sini —
 * tidak perlu ubah kode dashboard lagi.
 */

"use strict";

module.exports = [
  { key: "opentalk", name: "OpenTalk Bot", port: 8000 },
  { key: "yapping",  name: "Yapping Bot",  port: 3002 },
  { key: "chatib",   name: "Chatib Bot",   port: 3003 },
  { key: "duckchat", name: "DuckChat Bot", port: 3004 },
  { key: "x",        name: "X Bot",       port: 3005 },
  { key: "telegram", name: "Telegram Bot", port: 4000 },
  { key: "temanid",     name: "TemanID Bot",     port: 3006 },
  { key: "randompacar", name: "RandomPacar Bot", port: 3007 },
  { key: "gettr",       name: "GETTR Bot",       port: 3008 },
  { key: "anonchat",    name: "AnonChat Bot",    port: 3009 },
];
