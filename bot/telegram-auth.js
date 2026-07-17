/**
 * bot/telegram-auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script autentikasi MANUAL via terminal — FALLBACK SAJA.
 *
 * Cara normal (lebih mudah, tanpa shell):
 *   1. Pastikan TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE sudah di Secrets
 *   2. Start workflow "Telegram Bot"
 *   3. Buka monitor dashboard → tab Telegram Bot → klik "Kirim OTP"
 *   4. Masukkan kode → bot langsung jalan, session tersimpan otomatis ke Replit DB
 *
 * Gunakan script ini HANYA kalau dashboard tidak bisa diakses atau ada masalah
 * dengan auth-server. Jalankan di Replit Shell:
 *
 *   node bot/telegram-auth.js
 *
 * Script akan:
 *   1. Kirim kode OTP ke nomor TELEGRAM_PHONE
 *   2. Prompt memasukkan kode
 *   3. Tampilkan TELEGRAM_SESSION string
 *   4. Simpan session ke file .telegram_session (dibaca otomatis oleh semua bot)
 *
 * Env vars yang dibutuhkan:
 *   TELEGRAM_API_ID   — dari my.telegram.org
 *   TELEGRAM_API_HASH — dari my.telegram.org (set via Replit Secrets)
 *   TELEGRAM_PHONE    — nomor HP format internasional (+62...)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const readline           = require("readline");
const fs                 = require("fs");
const path               = require("path");

const API_ID   = parseInt(process.env.TELEGRAM_API_ID  || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const PHONE    = process.env.TELEGRAM_PHONE    || "";

if (!API_ID || !API_HASH || !PHONE) {
  console.error("ERROR: Set env vars berikut terlebih dahulu:");
  console.error("  TELEGRAM_API_ID   — dari my.telegram.org");
  console.error("  TELEGRAM_API_HASH — dari my.telegram.org (simpan di Secrets)");
  console.error("  TELEGRAM_PHONE    — nomor HP format internasional (+62...)");
  process.exit(1);
}

// Helper: tanya input dari terminal
function askQuestion(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n=== TELEGRAM AUTH (manual fallback) ===");
  console.log(`Phone  : ${PHONE}`);
  console.log(`API ID : ${API_ID}`);
  console.log("Memulai autentikasi...\n");
  console.log("CATATAN: Cara lebih mudah adalah via dashboard monitor (OTP di browser).");
  console.log("         Gunakan script ini hanya jika dashboard tidak bisa diakses.\n");

  const client = new TelegramClient(
    new StringSession(""),
    API_ID,
    API_HASH,
    { connectionRetries: 5 }
  );

  await client.start({
    phoneNumber: async () => PHONE,
    phoneCode:   async () => {
      const code = await askQuestion("Masukkan kode OTP yang dikirim Telegram: ");
      return code;
    },
    password: async () => {
      // Jika akun pakai 2FA
      const pwd = await askQuestion("Masukkan password 2FA (kosongkan jika tidak ada): ");
      return pwd || "";
    },
    onError: (err) => {
      console.error("Auth error:", err.message);
    },
  });

  console.log("\n✅ Autentikasi berhasil!\n");

  const sessionString = client.session.save();

  // Simpan ke file .telegram_session supaya dibaca otomatis oleh semua bot
  const sessionFile = path.join(__dirname, "../.telegram_session");
  try {
    fs.writeFileSync(sessionFile, sessionString, "utf8");
    console.log(`✓ Session disimpan ke ${sessionFile}`);
    console.log("  Semua bot Telegram akan membacanya otomatis saat start.\n");
  } catch (e) {
    console.error("WARN: Gagal simpan ke file:", e.message);
  }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  TELEGRAM_SESSION — copy jika ingin simpan manual di Secrets ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(sessionString);
  console.log("═".repeat(66));
  console.log("\n📋 Langkah selanjutnya:");
  console.log("  Start (atau restart) workflow 'Telegram Bot', 'TemanID Bot',");
  console.log("  dan 'RandomPacar Bot' — semua otomatis baca session dari file.\n");

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
