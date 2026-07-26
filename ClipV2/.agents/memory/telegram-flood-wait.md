---
name: Telegram FloodWait handling
description: GramJS FloodWaitError harus dibaca dari err.seconds, bukan retry langsung setelah 5s
---

# Telegram FloodWaitError

## Rule
GramJS melempar `FloodWaitError` dengan property `err.seconds` berisi durasi cooldown yang diwajibkan Telegram.
Bot **harus** `await sleep(err.seconds * 1000)` — bukan hardcoded 5 detik.

## Why
Retry lebih awal dari durasi yang diwajibkan membuat counter flood wait server naik terus,
menyebabkan ban yang makin panjang. Terlihat di log: bot kena "wait 174s" tapi retry tiap 5s
sehingga flood makin parah.

## How to apply
Di semua bot GramJS, catch block outer `runBot` harus:
```js
const waitSec = err.seconds || 0;
if (waitSec > 0) {
  log("WARN", `Rate limit Telegram — tunggu ${waitSec}s sebelum retry...`);
  await sleep(waitSec * 1000 + 1000); // +1s buffer
} else {
  log("ERROR", `runBot error: ${err.message}`);
  await sleep(5000);
}
```

Berlaku untuk: `telegram-bot.js`, `temanid-bot.js`, `randompacar-bot.js`.
