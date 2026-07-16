---
name: Country data availability per platform
description: Which anonymous-chat platforms expose partner country in their protocol (needed for country filtering/prioritization features).
---

As of recon on 2026-07-12, ISO-2 partner-country data is available in the protocol for:
- **OpenTalk**: `peerCountry` field on the `matched` socket event.
- **Chatib**: `country`/`country_code` field on users broadcast via `existing_users`/`new_user` socket events.

Not available (checked live JS bundles, no country field found in match/matched/chat_found payloads):
- **Yapping**, **SillyChat**, **DuckChat**.

**Why:** country-based filtering/prioritization can only be implemented for OpenTalk and Chatib until these three platforms are re-checked (a future protocol change could add the field).

**How to apply:** shared blocklist/priority-list logic lives in `lib/core/country-filter.js` (`isBlockedCountry`, `isPriorityCountry`). Any new country-based feature should hook into the same module and only wire it into OpenTalk/Chatib session handlers unless new recon proves otherwise for the other three.
