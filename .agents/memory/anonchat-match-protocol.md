---
name: AnonChat match protocol change
description: Server AnonChat mengganti event match dari partner-found ke update-dialog-id (Juli 2026)
---

Per Juli 2026, server `anonchatapi.stivisto.com` tidak lagi mengirim event `partner-found`. Sinyal match sekarang datang lewat event `update-dialog-id`.

**Aturan:** Listen `update-dialog-id` sebagai primary match signal. `partner-found` tetap ada sebagai fallback untuk kompatibilitas mundur.

**Why:** Recon live (probe Node.js langsung ke socket) menunjukkan setelah `start-search` ACK, server mengirim `update-dialog-id → update-ice-servers → update-user`. Event `partner-found` tidak pernah datang. Send-message ke `dialogId` dari `update-dialog-id` berhasil — receiver array berisi 2 UID (kita + partner).

**How to apply:**
- Field match: `data.dialogId` (bukan `data._id` dari protokol lama)
- `update-dialog-id` fires hampir seketika setelah `start-search` — server langsung assign dialog
- `update-ice-servers` ikut datang (WebRTC config) — tidak perlu diproses kecuali butuh video/audio
- File: `lib/platforms/anonchat/session.js` — listener `update-dialog-id` sudah ada, `partner-found` tetap sebagai fallback
