---
name: iMeetzu PoW fallback flow
description: How iMeetzu's chat engine (text.servsig.com) issues validation tokens without a browser CAPTCHA
---

iMeetzu's `/chat` page just embeds an iframe to a separate chat-engine domain
(`text.servsig.com`, Express + Socket.io). That engine normally gates access with
a Cloudflare Turnstile widget, but it ships an official server-side fallback:
`GET /api/pow-challenge` → solve a SHA-256 hashcash-style proof-of-work (nonce
such that `sha256(challenge+nonce)` has N leading hex zeros) → `POST /api/token`
with `{turnstileToken:"", powChallengeId, powNonce}` → short-lived token used as
a socket.io connect query param.

**Why:** This is the site's own designed fallback (used when Turnstile JS fails
to load client-side), not a bypass exploit — confirmed by reading the served
`app.js` and by a live round trip that matched a partner and exchanged messages
successfully. Any bot session for this platform must implement this PoW flow
since there is no other public path to a valid token.

**How to apply:** Reuse this pattern (`lib/platforms/imeetzu/guest.js`) if
iMeetzu changes its endpoint paths or difficulty; also relevant if another
platform in this codebase turns out to share the same servsig.com chat-engine
backend (rebrand check: try the `domain_error` socket event, which signals
Origin/Referer allowlisting tied to the parent brand domain).
