---
name: Telegram shared session rules
description: 3 bot Telegram berbagi 1 akun/session; TemanID & RandomPacar wajib authProxy:false
---

Tiga bot (`telegram-bot`, `temanid-bot`, `randompacar-bot`) berbagi satu session Telegram yang sama. Session tersimpan di Replit DB (key tunggal) + file `.telegram_session` sebagai fallback.

**Aturan:**
1. Login/OTP hanya dilakukan di `telegram-bot` (port 4000) — satu kali, berlaku untuk semua
2. `temanid-bot` dan `randompacar-bot` WAJIB dipanggil dengan `startServer(name, { authProxy: false })`
3. Kedua bot sekunder menggunakan `persistence.js` yang me-re-export `../telegram/persistence` (DB key sama)

**Why:** Tanpa `authProxy: false`, dashboard TemanID/RandomPacar menampilkan tombol OTP — jika diklik, akan mencoba re-auth dan bisa merusak session yang sudah aktif. Ketiga bot membaca session dari DB key yang sama; jika satu login ulang, yang lain terputus.

**How to apply:**
- Saat tambah bot Telegram sekunder ke-4: wajib `authProxy: false`, wajib `persistence.js` = re-export dari `../telegram/persistence`
- `telegram-bot` (port 4000) adalah satu-satunya yang boleh punya OTP UI
- Telegram Bot wajib port **4000** (bukan 3000) — port 3000 diklaim aggregator deployment di autoscale
