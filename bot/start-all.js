/**
 * bot/start-all.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Launcher tunggal untuk deployment (autoscale hanya menjalankan SATU perintah).
 * Men-spawn semua bot platform (lihat lib/core/platforms-registry.js) sebagai
 * child process di port masing-masing, di dalam satu proses induk, supaya
 * publish/deploy menjalankan ke-4 bot sekaligus — bukan cuma satu.
 *
 * Dashboard tetap bisa menampilkan semua platform karena tiap bot saling
 * fetch stats via http://localhost:<port> (lihat lib/core/server.js).
 *
 * Untuk menambah bot baru: cukup tambah entry di lib/core/platforms-registry.js
 * dan pastikan ada file bot/<key>-bot.js — tidak perlu ubah file ini.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const REGISTRY = require("../lib/core/platforms-registry");
const { startServer } = require("../lib/core/server");

// Konvensi: platform dengan key "foo" di platforms-registry.js → bot/foo-bot.js
// Jadi menambah platform baru cukup: 1) tambah baris di platforms-registry.js,
// 2) buat file bot/<key>-bot.js — file ini TIDAK perlu diubah lagi.
function scriptFor(entry) {
  return `${entry.key}-bot.js`;
}

const RESTART_DELAY_MS = 3000;
const children = [];

function colorFor(i) {
  const codes = ["\x1b[36m", "\x1b[35m", "\x1b[33m", "\x1b[32m", "\x1b[34m"];
  return codes[i % codes.length];
}

function prefixStream(stream, label, color) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.length) console.log(`${color}[${label}]\x1b[0m ${line}`);
    }
  });
}

function launch(entry, index) {
  const scriptPath = path.join(__dirname, scriptFor(entry));
  if (!fs.existsSync(scriptPath)) {
    console.error(`[start-all] File ${scriptFor(entry)} tidak ditemukan untuk platform "${entry.key}", dilewati.`);
    return;
  }
  const color = colorFor(index);
  const label = entry.name;

  console.log(`${color}[start-all]\x1b[0m Menjalankan ${label} di port ${entry.port}...`);

  const child = spawn(process.execPath, [scriptPath], {
    env: { ...process.env, PORT: String(entry.port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  prefixStream(child.stdout, label, color);
  prefixStream(child.stderr, label, color);

  child.on("exit", (code, signal) => {
    console.error(`${color}[${label}]\x1b[0m proses berhenti (code=${code}, signal=${signal}). Restart dalam ${RESTART_DELAY_MS / 1000}s...`);
    setTimeout(() => launch(entry, index), RESTART_DELAY_MS);
  });

  children.push(child);
}

REGISTRY.forEach((entry, i) => launch(entry, i));

// ── Aggregator web server pada PORT yang di-assign platform deployment ───────
// Autoscale/Cloud Run mengirim health-check probe (GET /) ke $PORT yang di-
// assign saat runtime — bukan ke port fixed bot manapun di registry. Tanpa
// server ini, tidak ada proses yang listen di $PORT tersebut sehingga promote
// step gagal ("failed to start"). Server ini otomatis mengagregasi stats semua
// bot lewat /api/stats/all (lihat lib/core/server.js), dan / mengembalikan
// monitor.html (200 OK) sehingga probe berhasil.
try {
  startServer("Bot Monitor (aggregator)");
} catch (err) {
  console.error(`[start-all] Gagal start aggregator server di PORT=${process.env.PORT || 5000}: ${err.message}`);
}

function shutdown() {
  console.log("[start-all] Menerima sinyal berhenti, mematikan semua bot...");
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
