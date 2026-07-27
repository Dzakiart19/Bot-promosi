/**
 * launchers/all-bots.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Launcher tunggal untuk SEMUA bot non-Telegram.
 * Dijalankan satu workflow "All Bots" — menggantikan 9 workflow terpisah.
 * Telegram Bot tetap berjalan di workflow sendiri (port 4000) karena
 * butuh OTP UI yang terpisah + shared session untuk TemanID/RandomPacar.
 *
 * Auto-restart: jika salah satu proses crash, di-restart setelah jeda
 * (exponential backoff, max 60 detik) tanpa mempengaruhi proses lain.
 *
 * Semua bot tetap mendengar di port masing-masing — dashboard aggregator
 * (port 8000 → /api/stats/all) tetap bisa polling semua port.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { spawn } = require("child_process");

// ── Daftar bot yang dijalankan ────────────────────────────────────────────────
// Urutan tidak penting — semua di-spawn paralel.
const BOTS = [
  { name: "OpenTalk",    script: "bot/opentalk-bot.js",    port: 8000  },
  { name: "Chatib",      script: "bot/chatib-bot.js",      port: 3003  },
  { name: "DuckChat",    script: "bot/duckchat-bot.js",    port: 3004  },
  { name: "X Bot",       script: "bot/x-bot.js",           port: 3005  },
  { name: "TemanID",     script: "bot/temanid-bot.js",     port: 3006  },
  { name: "RandomPacar", script: "bot/randompacar-bot.js", port: 3007  },
  { name: "GETTR",       script: "bot/gettr-bot.js",       port: 3008  },
  { name: "AnonChat",    script: "bot/anonchat-bot.js",    port: 3009  },
  { name: "XNXX",        script: "bot/xnxx-bot.js",        port: 3013  },
];

// Jeda restart: 5s → 10s → 20s → 40s → 60s (cap)
const BACKOFF_BASE_MS  = 5_000;
const BACKOFF_MAX_MS   = 60_000;
const BACKOFF_MULT     = 2;

// ── State tracker ─────────────────────────────────────────────────────────────
const procs      = new Map();   // name → ChildProcess
const failCounts = new Map();   // name → number of consecutive crashes
const timers     = new Map();   // name → setTimeout handle

// ── Helpers ───────────────────────────────────────────────────────────────────
function ts() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function backoffMs(name) {
  const n   = failCounts.get(name) || 0;
  const raw = BACKOFF_BASE_MS * Math.pow(BACKOFF_MULT, n);
  return Math.min(raw, BACKOFF_MAX_MS);
}

// ── startBot ──────────────────────────────────────────────────────────────────
function startBot({ name, script, port }) {
  if (timers.has(name)) {
    clearTimeout(timers.get(name));
    timers.delete(name);
  }

  const env  = { ...process.env, PORT: String(port) };
  const proc = spawn(process.execPath, [script], {
    env,
    stdio: "inherit",
    cwd:   process.cwd(),
  });

  procs.set(name, proc);
  console.log(`[${ts()}] [launcher] ▶ ${name} (port ${port}) PID=${proc.pid}`);

  proc.on("error", (err) => {
    console.error(`[${ts()}] [launcher] ✗ ${name} spawn error: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    procs.delete(name);

    // Shutdown normal — tidak restart
    if (signal === "SIGTERM" || signal === "SIGINT") {
      console.log(`[${ts()}] [launcher] ■ ${name} dihentikan (${signal})`);
      return;
    }

    // Crash — hitung backoff lalu restart
    const prevFails = failCounts.get(name) || 0;
    failCounts.set(name, prevFails + 1);
    const delay = backoffMs(name);

    console.warn(
      `[${ts()}] [launcher] ⚠ ${name} keluar (code=${code ?? "?"}, fails=${prevFails + 1}) — restart dalam ${delay / 1000}s...`
    );

    const t = setTimeout(() => {
      timers.delete(name);
      // Reset fail count setelah restart berhasil (ditrack lewat 'exit' berikutnya)
      startBot({ name, script, port });
    }, delay);
    timers.set(name, t);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[${ts()}] [launcher] Terima ${signal} — menghentikan semua bot...`);
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const [name, proc] of procs.entries()) {
    console.log(`[${ts()}] [launcher] Kirim SIGTERM → ${name}`);
    try { proc.kill("SIGTERM"); } catch { /* sudah keluar */ }
  }
  // Hard kill setelah 5 detik jika ada yang tidak mau berhenti
  setTimeout(() => {
    for (const [name, proc] of procs.entries()) {
      console.warn(`[${ts()}] [launcher] Hard kill → ${name}`);
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }
    process.exit(0);
  }, 5_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error(`[${ts()}] [launcher] uncaughtException: ${err.message}`);
});

// ── Mulai semua bot ───────────────────────────────────────────────────────────
console.log(`[${ts()}] [launcher] ════════════════════════════════════════`);
console.log(`[${ts()}] [launcher]  ALL BOTS LAUNCHER — ${BOTS.length} bot`);
console.log(`[${ts()}] [launcher] ════════════════════════════════════════`);

for (const bot of BOTS) startBot(bot);

// Reset fail count setelah bot stabil 2 menit (heuristic)
setInterval(() => {
  for (const name of failCounts.keys()) {
    if (!procs.has(name)) continue;   // sedang restart, jangan reset
    const prev = failCounts.get(name) || 0;
    if (prev > 0) {
      failCounts.set(name, Math.max(0, prev - 1));
    }
  }
}, 120_000);
