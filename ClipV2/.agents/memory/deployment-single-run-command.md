---
name: Deployment run command for multi-bot project
description: Why this project needs a launcher script instead of running one bot directly in deployment, and a port-collision pitfall to avoid when adding/reassigning bot ports.
---

Replit deployment (`[deployment]` in .replit) executes exactly ONE run command in production —
unlike dev, where the "Project" workflow runs all bot workflows in parallel. Pointing deployment's
`run` at a single bot script (e.g. `node bot/opentalk-bot.js`) means only that one bot goes live
after publish, even though all bots run fine in dev.

**Why:** dev workflows and production deployment are configured independently; workflows never
carry over to the deployment run command.

**How to apply:** use a launcher (`bot/start-all.js`) that reads `lib/core/platforms-registry.js`
and spawns every bot as a child process with its own PORT, then point `[deployment].run` at the
launcher. The launcher infers each script path by convention (`bot/<key>-bot.js`) instead of a
hardcoded map, so adding a platform only needs a new `platforms-registry.js` entry + matching file
— no launcher edit.

`vm` is the technically-ideal target for always-running background loops with in-memory state, but
this project intentionally stays on `autoscale` because the user is on the free tier (no `vm`
access) and pings `/health` via an external cronjob to keep the instance warm. Known tradeoff:
autoscale can still scale to zero between cron pings (a brief cold start) and, under real
concurrent traffic, could spin up a second instance running its own independent copy of all bots
(doubled activity, stats split per instance) — acceptable here since traffic is just the cron hit.

## Pitfall: a bot's fixed port must never equal the deployment's public port

`.replit`'s `[[ports]]` list explicitly maps one `localPort` to `externalPort = 80` — that localPort
is what Replit sets `process.env.PORT` to in production (explicit ports disable autoscale's
auto-detection, per Replit docs). `start-all.js`'s own aggregator server also binds to
`process.env.PORT` (required so autoscale health checks / public traffic reach it).

If any entry in `platforms-registry.js` reuses that same port number for an individual bot, the
aggregator and that bot's child process fight over the same port in production only (dev has no
aggregator, so it looks fine there — classic "works in dev, broken in prod" symptom). Whichever
binds first wins; the loser's `/api/stats/all` entry for that platform reports the *aggregator's own*
empty stats object (`platform: "Bot Monitor (aggregator)"`, everything 0) instead of the real bot's
stats — that mislabeled `platform` field in the JSON is the diagnostic tell.

**How to apply:** whenever assigning or changing a bot's port in `platforms-registry.js`, confirm it
does not equal the `[[ports]]` entry whose `externalPort = 80`. Keep that port reserved for the
aggregator only.
