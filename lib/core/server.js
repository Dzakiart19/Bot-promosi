/**
 * lib/core/server.js
 * Express web server shared by all platforms.
 *
 * Mounts:
 *   GET /         → public/monitor.html
 *   GET /health   → {"status":"ok", ...} — for cronjob keep-alive
 *   GET /api/stats → full JSON stats
 */

"use strict";

const express  = require("express");
const path     = require("path");
const { stats } = require("./stats");
const { log }    = require("./logger");
const REGISTRY   = require("./platforms-registry");

const PORT       = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const PUBLIC_DIR = path.join(__dirname, "../../public");
const PROXY_TIMEOUT_MS = 2500;

/**
 * Ambil JSON dari http://localhost:<port><path> dengan timeout,
 * dipakai untuk mengintip proses bot platform lain di container yang sama.
 */
async function fetchLocal(port, urlPath) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`http://localhost:${port}${urlPath}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * startServer(platformName, opts)
 *
 * @param {string}  platformName       Nama platform yang ditampilkan di stats/log
 * @param {object}  [opts]
 * @param {boolean} [opts.authProxy=true]
 *   true  (default) — sertakan endpoint POST /api/telegram-auth/:action yang
 *          memproxy ke port 3000. Hanya dipakai oleh Telegram Bot (port 3000)
 *          atau platform yang secara sadar ingin expose tombol OTP di dashboard.
 *   false — hilangkan endpoint tersebut. Dipakai oleh TemanID Bot & RandomPacar
 *          Bot supaya dashboard mereka tidak menampilkan UI login Telegram
 *          (sesi dibaca otomatis dari Telegram Bot, tidak perlu login sendiri).
 */
function startServer(platformName, { authProxy = true } = {}) {
  if (platformName) stats.platform = platformName;
  const app = express();

  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  // ── Proxy auth Telegram ke port 3000 ────────────────────────────────────────
  // Hanya aktif jika authProxy = true (Telegram Bot). Bot sekunder (TemanID,
  // RandomPacar) tidak perlu ini — sesi mereka dikelola sepenuhnya oleh
  // Telegram Bot, jadi tombol OTP tidak seharusnya muncul di dashboard mereka.
  if (authProxy) app.post("/api/telegram-auth/:action", async (req, res) => {
    const entry = REGISTRY.find((p) => p.key === "telegram");
    if (!entry) return res.status(404).json({ ok: false, error: "Telegram tidak ada di registry" });
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const upstream = await fetch(`http://localhost:${entry.port}/api/${req.params.action}`, {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify(req.body || {}),
        signal  : ctrl.signal,
      });
      const data = await upstream.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get("/health", async (_req, res) => {
    const results = await Promise.all(
      REGISTRY.map(async (entry) => {
        try {
          const data = await fetchLocal(entry.port, "/api/stats");
          return {
            key:      entry.key,
            name:     entry.name,
            port:     entry.port,
            online:   true,
            uptime:   Math.floor((Date.now() - data.startTime) / 1000),
            sessions: data.totalSessions,
            matches:  data.totalMatches,
            replies:  data.totalReplies,
            errors:   data.totalErrors,
            status:   data.status,
          };
        } catch {
          return { key: entry.key, name: entry.name, port: entry.port, online: false };
        }
      })
    );
    const allOnline = results.every((p) => p.online);
    res.status(allOnline ? 200 : 207).json({
      status:    allOnline ? "ok" : "partial",
      platforms: results,
    });
  });

  app.get("/api/stats", (_req, res) => {
    res.json({
      ...stats,
      uptimeSeconds: Math.floor((Date.now() - stats.startTime) / 1000),
    });
  });

  // Gabungan stats semua platform yang terdaftar di platforms-registry.js —
  // dipakai dashboard supaya satu halaman bisa menampilkan semua bot
  // sekaligus, terlepas dari port mana yang sedang dibuka user.
  app.get("/api/stats/all", async (_req, res) => {
    const results = await Promise.all(
      REGISTRY.map(async (entry) => {
        try {
          const data = await fetchLocal(entry.port, "/api/stats");
          return { key: entry.key, name: entry.name, port: entry.port, online: true, stats: data };
        } catch (err) {
          return { key: entry.key, name: entry.name, port: entry.port, online: false, error: err.message };
        }
      })
    );
    res.json({ platforms: results });
  });

  // Proxy health-check per platform lewat satu URL yang stabil, supaya
  // cronjob/UptimeRobot tidak perlu tahu port internal tiap bot.
  app.get("/proxy/:key/health", async (req, res) => {
    const entry = REGISTRY.find((p) => p.key === req.params.key);
    if (!entry) return res.status(404).json({ status: "unknown_platform" });
    try {
      const data = await fetchLocal(entry.port, "/health");
      res.json(data);
    } catch (err) {
      res.status(502).json({ status: "offline", error: err.message });
    }
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "monitor.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    log("SUCCESS", `Web server → http://0.0.0.0:${PORT}`);
    log("SUCCESS", `Health     → http://0.0.0.0:${PORT}/health`);
    log("SUCCESS", `Stats      → http://0.0.0.0:${PORT}/api/stats`);
  });
}

module.exports = { startServer };
