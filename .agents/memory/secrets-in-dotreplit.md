---
name: Secrets leaked via .replit userenv.shared
description: Real credentials were found stored in plaintext inside .replit and pushed to a public GitHub repo. Check remediation status before assuming it's fixed.
---

## What was found (2026-07-28 audit)

`.replit` had a `[userenv.shared]` block holding live, real credentials in plaintext — GitHub PAT, X/Twitter session cookies (auth_token+ct0), GETTR username/password/JWT token, Telegram API id/hash/phone, ANONCHAT_COOKIES, and even `SESSION_SECRET` (which is supposed to be a managed Replit Secret, not a plaintext value).

`.replit` is git-tracked with no `.gitignore` anywhere in the project (none existed at all). The repo (`github.com/Dzakiart19/Bot-promosi`) is **public** and the file had been committed/pushed since the very first commit, updated continuously through the audit date. `.telegram_session` is also git-tracked (empty at audit time, but would leak a live session string if ever populated and committed as-is).

**Why it matters:** `[userenv.shared]` in `.replit` is plaintext config, not the encrypted Secrets store — anything placed there is world-readable the moment the repo is pushed/public. Real secrets must go through the environment-secrets skill (`requestSecrets`/Replit Secrets), never into `.replit` or any tracked file.

**How to apply:** Before doing further work in this project, verify whether remediation actually happened: check `.replit` no longer has a `[userenv.shared]` secrets block, confirm a `.gitignore` exists, and ask the user whether they rotated the exposed credentials at the source (GitHub token settings, X logout-all-sessions, GETTR password change, my.telegram.org). Do not assume a past flag was acted on — re-check and re-raise if the leak is still present.
