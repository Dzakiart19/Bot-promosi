/**
 * bot/telegram-auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script autentikasi SEKALI PAKAI — jalankan di Replit Shell:
 *
 *   node bot/telegram-auth.js
 *
 * Script akan:
 *   1. Kirim kode OTP ke nomor TELEGRAM_PHONE
 *   2. Prompt anda memasukkan kode
 *   3. Tampilkan TELEGRAM_SESSION string
 *
 * Setelah dapat session string:
 *   → Set sebagai secret TELEGRAM_SESSION di Replit (Secrets panel)
 *   → Jalankan workflow "Telegram Bot" seperti biasa
 *
 * Env vars yang dibutuhkan SEBELUM menjalankan:
 *   TELEGRAM_API_ID   = 26372402
 *   TELEGRAM_API_HASH = (set via Replit Secrets)
 *   TELEGRAM_PHONE    = +6285962694573
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const readline           = require("readline");

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
  console.log("\n=== TELEGRAM AUTH ===");
  console.log(`Phone  : ${PHONE}`);
  console.log(`API ID : ${API_ID}`);
  console.log("Memulai autentikasi...\n");

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

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  TELEGRAM_SESSION — COPY STRING INI SEPENUHNYA               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(sessionString);
  console.log("═".repeat(66));
  console.log("\n📋 Langkah selanjutnya:");
  console.log("  1. Copy semua teks session di atas");
  console.log("  2. Buka Replit → Tools → Secrets");
  console.log("  3. Tambah secret baru: key = TELEGRAM_SESSION, value = (paste)");
  console.log("  4. Start workflow 'Telegram Bot'\n");

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
