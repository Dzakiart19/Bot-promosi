/**
 * launchers/gettr-pornhub.js
 * Launcher gabungan GETTR Bot (port 3008) + PornHub Bot (port 3013).
 *
 * Dipakai karena Replit membatasi 10 workflow — kedua bot ini berjalan
 * dalam satu workflow entry tapi tetap di port terpisah dan
 * dashboard aggregator tetap bisa menampilkan keduanya secara independen.
 *
 * Auto-restart: kalau salah satu proses crash, launcher me-restart-nya
 * setelah jeda 5 detik — tanpa mempengaruhi proses lainnya.
 *
 * Untuk menghentikan: matikan workflow ini dari Replit UI.
 */

"use strict";

const { spawn } = require("child_process");

const BOTS = [
  { name: "GETTR Bot",   script: "bot/gettr-bot.js",   port: 3008 },
  { name: "PornHub Bot", script: "bot/pornhub-bot.js", port: 3013 },
];

function startBot({ name, script, port }) {
  console.log(`[launcher] Memulai ${name} di port ${port}...`);

  const env  = { ...process.env, PORT: String(port) };
  const proc = spawn(process.execPath, [script], {
    env,
    stdio: "inherit",
    cwd:   process.cwd(),
  });

  proc.on("error", (err) => {
    console.error(`[launcher] ${name} spawn error: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") {
      console.log(`[launcher] ${name} dihentikan (${signal})`);
      return;
    }
    console.warn(`[launcher] ${name} keluar (code=${code}) — restart dalam 5 detik...`);
    setTimeout(() => startBot({ name, script, port }), 5_000);
  });

  return proc;
}

// ── Mulai semua bot ────────────────────────────────────────────────────────────
const procs = BOTS.map(startBot);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[launcher] Terima ${signal} — menghentikan semua bot...`);
  for (const p of procs) {
    try { p.kill("SIGTERM"); } catch { /* sudah keluar */ }
  }
  setTimeout(() => process.exit(0), 3_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

console.log(`[launcher] GETTR Bot (3008) + PornHub Bot (3013) aktif.`);
