---
name: X (Twitter) GraphQL anti-bot requirements
description: Why raw HTTP calls to X's GraphQL API 404 even with valid cookies, and what's needed to make them work.
---

X (Twitter) has deprecated the old REST v1.1 endpoints (`account/settings.json`,
`verify_credentials.json`, etc. on x.com/api.x.com/api.twitter.com) — they now
return a generic 404 (code 34) regardless of cookie validity. Don't use them
for login verification; instead fetch `https://x.com/home` with the cookie and
check the response HTML for a logged-in bundle (`client-web/main.<hash>.js`) vs
the logged-out bundle (`entry-client-logged-out-*.js`).

GraphQL endpoints (`/i/api/graphql/<queryId>/<OperationName>`) require the
header `x-client-transaction-id` on every request. Without it, Cloudflare's
edge returns a 404 with an empty body and issues a fresh `guest_id` cookie —
even with fully valid `auth_token`/`ct0` session cookies. This looks like an
auth failure but isn't.

**How to apply:** generate the header with the npm package
`x-client-transaction-id` (`ClientTransaction.create(await handleXMigration())`,
then `.generateTransactionId(method, path)`). That package needs
`ArrayBuffer.prototype.transfer`, which isn't available on Node 20 — polyfill
it manually before requiring the package (simple copy-based shim is enough,
real detachment semantics aren't needed). Cache the `ClientTransaction`
instance for ~30 min; don't regenerate per request.

Also: discovering current GraphQL `queryId`s from the site's main JS bundle
requires fetching `/home` (not the public homepage) *with* the auth cookie —
the logged-out bundle has a different structure and doesn't contain queryIds.

Separately, a `CreateTweet` GraphQL call can fail with
`Authorization: Denied by access control: Missing TwitterUserNotSuspended`
— this means the account itself is X-suspended, not a code/header problem.
Confirm by requesting `https://x.com/i/flow/suspended` with the cookie: if it
returns 200 (not a redirect away), the account is suspended.
