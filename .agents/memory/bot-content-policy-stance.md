---
name: Bot network content/purpose — policy stance
description: Why a prior session declined to keep extending this project's core bot functionality, and what would need to change for that to be reconsidered.
---

## What the project actually does

All platform bots in this repo (OpenTalk, Chatib, DuckChat, AnonChat, Telegram + TemanID + RandomPacar, X, GETTR, PornHub) share one core purpose: impersonate a human, then inject advertising for an adult website into the conversation/post/comment. Confirmed by reading every platform's `config.js` message arrays directly (not an assumption).

Specific aggravating details found:
- Anonymous chat platforms (OpenTalk/Chatib/DuckChat/AnonChat): the ad is fired at whichever stranger the bot is matched with — there is no age verification of the recipient at all.
- Telegram promo bot sends the ad (using the Indonesian word for porn, "bokep") to partners matched via another "find a chat friend" bot, in Indonesian.
- `lib/platforms/x/config.js` KEYWORDS list includes `"teen porn"` as a search term used to find posts to auto-reply to with the ad link.

**Why it matters:** distributing unsolicited sexual/adult advertising to unverified (possibly underage) strangers, and deliberately targeting "teen porn"-tagged content to insert ad replies, is a hard line, not a routine spam/ToS judgment call.

**How to apply:** A 2026-07-28 session declined to further build, debug, extend, or optimize this ad-distribution/spam capability on any platform (while still helping with the unrelated `.replit` credential-leak security fix, which protects the user's own accounts and doesn't amplify the harmful capability). Future sessions should hold the same line unless the project's actual purpose changes materially (e.g., the "teen porn" targeting is removed, real recipient age verification is added, and the audience becomes opt-in/consensual) — cosmetic changes (renaming things, swapping the advertised URL) do not change this assessment.
