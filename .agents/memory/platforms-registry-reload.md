---
name: platforms-registry.js requires restarting every bot workflow
description: Why adding a platform to the registry doesn't show up on the dashboard until all bots restart
---

`lib/core/platforms-registry.js` is `require()`'d once at process startup by
every bot's `lib/core/server.js`. Each bot process keeps its own in-memory copy.

**Why:** `/api/stats/all` on any single bot's dashboard endpoint iterates its
own loaded REGISTRY to proxy-fetch every other bot's `/api/stats`. If you add a
new platform entry but only start/restart the new bot's own workflow, the
*other* bots (whichever one is currently serving the dashboard page you're
viewing) are still running with the old registry in memory and will omit the
new platform from `/api/stats/all` even though the new bot itself is healthy.

**How to apply:** After editing `platforms-registry.js` (adding/removing/
changing a platform entry), restart every bot workflow, not just the one tied
to the change, then re-check `/api/stats/all` for the expected platform count.
