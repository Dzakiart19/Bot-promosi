---
name: Telegram auth proxy rule — authProxy false untuk bot sekunder
description: startServer() di temanid-bot dan randompacar-bot WAJIB pakai { authProxy: false }, bukan default
---

# Telegram Auth Proxy Rule

## Rule
`bot/temanid-bot.js` dan `bot/randompacar-bot.js` harus memanggil:
```js
startServer("TemanID Bot",    { authProxy: false });
startServer("RandomPacar Bot", { authProxy: false });
```

Hanya `bot/telegram-bot.js` (port 3000) yang boleh `startServer("Telegram Bot")` tanpa option (authProxy default: true).

## Why
`startServer()` dari `lib/core/server.js` secara default menyertakan endpoint
`POST /api/telegram-auth/:action` yang memproxy ke port 3000 (auth OTP server).

Kalau bot sekunder (port 3006, 3007) juga expose endpoint ini, maka:
- Dashboard di port 3006/3007 menampilkan tombol "Kirim OTP"
- User mengira setiap bot perlu login sendiri
- Kalau user klik OTP di port 3006 → request proxy ke port 3000 → bisa trigger auth baru
- Konflik / kebingungan sesi

Bot sekunder tidak perlu auth sama sekali — mereka hanya membaca session yang
sudah ditulis oleh Telegram Bot ke Replit DB / `.telegram_session`.

## How to apply
Setiap kali ada bot Telegram sekunder baru, atau refactor server di bot sekunder:
- Selalu periksa apakah `startServer()` dipanggil dengan `{ authProxy: false }`
- Kalau ada inline `startStatsServer()` yang mau diganti `startServer()`, WAJIB tambah `{ authProxy: false }`
- Jangan anggap inline server "duplikat tanpa alasan" — perbedaan authProxy adalah alasannya

## Pelajaran dari Kesalahan
Ini pernah terjadi: inline `startStatsServer()` di temanid-bot/randompacar-bot
(yang tidak punya auth proxy) diganti dengan `startServer()` dari core (yang punya
auth proxy by default). Hasilnya dashboard 3006/3007 tampilkan UI login → user
bingung dan mengira setiap bot butuh login sendiri.
