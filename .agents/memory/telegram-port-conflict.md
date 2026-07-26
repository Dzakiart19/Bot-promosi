---
name: Telegram Bot port conflict in production
description: Root cause of logout HTML error and "Starting" status in autoscale production — PORT=$PORT conflicts with telegram-bot's internal port.
---

## The Rule
Telegram Bot MUST run on port 4000 (not 3000). In autoscale production, Replit sets `$PORT=3000` (from `localPort=3000, externalPort=80` in .replit). `start-all.js` starts the aggregator on `$PORT=3000` first, so telegram-bot child's port 3000 conflicts — aggregator wins, telegram-bot crash-loops, `localhost:3000` becomes the aggregator itself.

**Why:** When aggregator proxies `/api/telegram-auth/logout` → `localhost:3000/api/logout` and that IS the aggregator (no `/api/logout` route), Express returns 404 HTML "Cannot POST /api/logout". The outer catch then returns `{ok:false, error:"Unexpected token '<'..."}` which the browser shows as "Logout gagal".

**How to apply:** Registry must have `{ key: "telegram", port: 4000 }`. Dev workflow `PORT=4000 node bot/telegram-bot.js`. Default port in `auth-server.js` = 4000. Port mapping `localPort=4000, externalPort=4000` added to `.replit`.

Do NOT move telegram back to 3000 — `$PORT=3000` is permanently reserved for the aggregator in production.
