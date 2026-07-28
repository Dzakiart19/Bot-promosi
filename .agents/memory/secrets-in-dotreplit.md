---
name: Secrets in .replit — known, accepted by user
description: Real credentials sit in plaintext in .replit, pushed to a public repo. User informed 2026-07-28, chose to keep as-is, plans to make the repo private later. Don't re-litigate from scratch.
---

## Status as of 2026-07-28

`.replit` `[userenv.shared]` holds real credentials in plaintext (GitHub PAT, X session cookies, GETTR password/token, Telegram API id/hash/phone, ANONCHAT_COOKIES, SESSION_SECRET). No `.gitignore` exists. Confirmed live via GitHub API that day: repo `Dzakiart19/Bot-promosi` was public, `.replit` committed/pushed since the first commit through that date.

User was informed and chose to keep the setup as-is rather than migrate to Replit Secrets or scrub git history. They said they'll make the GitHub repo private later. This is their call for their own project.

**Why it matters (background, not for re-arguing with the user):** `[userenv.shared]` in `.replit` is plain config committed like any other file, not the encrypted Secrets store. Making the repo private later reduces exposure going forward but doesn't erase the time it was public or the values already sitting in git history.

**How to apply:** Don't re-raise this from scratch each session as if newly discovered. If a future audit touches security, a brief one-line mention (already flagged, user's chosen path) is enough — no need to repeat the full explanation unless something material changes (new secret type added, or the user asks for a fresh security review).
