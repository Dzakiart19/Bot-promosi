---
name: Telegram shared session architecture
description: Semua 3 bot Telegram pakai shared-session.js — satu implementasi, config berbeda
---

# Telegram Shared Session

## Rule
`lib/platforms/telegram/shared-session.js` adalah satu-satunya implementasi `createMessageListener`
dan `runSession` untuk semua bot Telegram. Masing-masing session.js adalah thin wrapper:

```js
const cfg    = require("./config");
const shared = require("../telegram/shared-session");
const { createMessageListener, runSession } = shared.makeSession(cfg);
module.exports = { createMessageListener, runSession };
```

## Why
Sebelumnya `telegram/session.js`, `temanid/session.js`, `randompacar/session.js` adalah copy-paste
dengan hanya satu beda: `temanid` tidak punya `DELAY_SEND_MS` (langsung kirim). Shared session
membaca `cfg.DELAY_SEND_MS` — kalau 0, langsung kirim, kalau >0, tunggu dulu.

## How to apply
Kalau ada perubahan logika alur session (match signal, timeout handling, promo send, /next timing),
edit `shared-session.js` saja. Jangan modif masing-masing session.js kecuali ada kebutuhan
bot-specific yang benar-benar berbeda.
