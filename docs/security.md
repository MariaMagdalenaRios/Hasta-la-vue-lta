# Security – Utpost

**Date:** 2026-11-22
**Threat model in one sentence:** What is worth protecting is the users' accounts, tours and photos and the editorial team's guides, and the attacker is usually a script that probes open endpoints (anonymous visitors, or a logged-in member trying to reach editor or other members' data), not a targeted human attacker.

The list below follows the OWASP Top 10 (2025). Each category has a short explanation and a verdict: **Yes**, **Partially** or **No** (does it apply to Utpost).

## Authentication and authorization

### How passwords are stored
- Passwords are never stored. `users.password_hash` holds `scrypt:<salt>:<hash>`, produced by [`lib/password.js`](../api/src/lib/password.js) with Node's built-in scrypt (N = 2^17, r = 8, p = 1, a random 16 byte salt per user, as recommended by the OWASP Password Storage Cheat Sheet).
- Comparison uses `timingSafeEqual`. When the email is unknown, the server still computes a hash against a dummy value, so "unknown email" and "wrong password" take equally long and return the same 401 response.
- Before the fix (PR #151) passwords were stored as `plaintext:<password>` and the API returned the whole user row, including `password_hash`. API responses now go through `publicUser` and never contain the hash.
- Registration requires a password of at least 8 characters (`registerSchema` in [`lib/schemas.js`](../api/src/lib/schemas.js)).

### Tokens
- On login and registration the API returns a JWT (`id`, `email`, `role`) signed with HS256 using `JWT_SECRET`. The server refuses to start without that variable.
- The token expires after **1 hour** (before: 30 days). `jwt.verify` only accepts HS256, so a token with `alg: none` is rejected.
- The client keeps the token in memory ([`client/src/lib/token.ts`](../client/src/lib/token.ts)), not in `localStorage`, and sends it as `Authorization: Bearer <token>`. It is never a cookie.
- A missing, invalid or expired token gives **401**. A valid token with the wrong role or the wrong owner gives **403**.

### Which endpoints need what
| Endpoint | Requirement | Where |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/register` | none (body validated) | [`routes/auth.js`](../api/src/routes/auth.js) |
| `GET /api/guides`, `/regions`, `/popular`, `/search`, `/:slug` | none (public) | [`routes/guides.ts`](../api/src/routes/guides.ts) |
| `PUT /api/guides/:id` | login + role `editor` (401 / 403), valid id and body (400), 404 if missing | `routes/guides.ts` |
| `GET /api/tours`, `/latest`, `/:id` | none (public) | [`routes/tours.js`](../api/src/routes/tours.js) |
| `POST /api/tours` | login | `routes/tours.js` |
| `DELETE /api/tours/:id` | login + owner of the tour or `editor` (401 / 403 / 404) | `routes/tours.js`, [`lib/tourAccess.js`](../api/src/lib/tourAccess.js) |
| `POST /api/photos` | login + owner of the tour or `editor` (401 / 403 / 404) | [`routes/photos.js`](../api/src/routes/photos.js) |
| `GET /api/photos/tour/:tourId` | none (public) | `routes/photos.js` |
| GraphQL queries | none (public) | [`graphql/`](../api/src/graphql) |
| GraphQL mutation `createTour` | login (token in the context) | `graphql/resolvers.js` |

The client also protects the routes `/tours/:id` and `/profil` with a router guard, but that is only convenience. The real protection is in the API, because anyone can call the API without the client.

## Vulnerabilities found and fixed

Every fix has a test in [`api/src/routes/routes.test.js`](../api/src/routes/routes.test.js) that was **red before the fix** and is green now.

| # | OWASP | Vulnerability | Pull request | Failing test (before the fix) |
|---|---|---|---|---|
| 1 | A04 / A07 | Passwords stored in plaintext (`plaintext:…`) and `password_hash` sent to the client | [#151](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/151) | `lösenordet i databasen är hashat, inte klartext` |
| 2 | A07 | Registration accepted a too short password; token lived 30 days | [#151](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/151) | `registrering med för kort lösenord ger 400 med vad som var fel` |
| 3 | A05 | SQL injection in `GET /api/guides/search`: the search term was pasted into the SQL string, a quote character crashed the query and the request hung | [#153](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/153) | `ett citattecken i sökordet ger 200 och en tom lista, inte 500` |
| 4 | A10 | A non-numeric id, broken JSON or absurd image sizes were not validated: hanging requests, HTML error pages, calls forwarded to the image function | [#153](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/153) | `ett id som inte är ett tal ger 400, inte ett ohanterat fel`, `trasig JSON ger 400 med ett svar – inte ett anrop som hänger`, `en bild med orimliga mått stoppas med 400 innan något sparas` |
| 5 | A01 | Anyone could delete any tour and upload photos without logging in; no ownership check | [#156](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/156) | `DELETE /api/tours/:id utan token ger 401 och turen finns kvar`, `en medlem kan inte ta bort någon annans tur (403)`, `POST /api/photos utan token ger 401 – uppladdning kräver inloggning` |
| 6 | A01 | `PUT /api/guides/:id` needed no login and no editor role, and the id and body were not validated | [#156](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/156) | `PUT /api/guides/:id utan token ger 401, som medlem 403, som redaktör 200`, `ogiltig indata ger 400 och guiden är oförändrad`, `ett id som inte är ett tal ger 400` |
| 7 | A02 | `app.use(cors())` sent `Access-Control-Allow-Origin: *` on every response | [#156](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/pull/156) | `en okänd origin får inte Access-Control-Allow-Origin: *`, `preflight från en okänd origin får inte tillåtas med *` |

Notes on the evidence:
- The red run before the fixes (9 red, 14 green of 23 tests) is in the [CI run for PR #151](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/43621048897/job/132526585959).
- Some tests returned **502** instead of 401 or 400 before the fix. That was not a setup error: it showed that the request reached the image function, so the login check and the validation were missing.
- A test named `en medlem kan inte ta bort någon annans tur (403)` threw a TypeError in the full run, because an earlier red test had already deleted tour 1 without a token. Run alone it failed with `expected 200 to be 403`, which is the real hole.
- For #7 the damage was limited, since the token is sent in the `Authorization` header and not in a cookie, so another site could read public responses but not steal a session. The Vue client calls `/api` and `/graphql` with relative URLs through the Vite proxy ([`client/vite.config.js`](../client/vite.config.js)) and nginx ([`client/nginx.conf.template`](../client/nginx.conf.template)), so removing CORS breaks nothing. CORS also only protects browsers; scripts ignore it, so access control (401 / 403) is what really protects the data.

## OWASP Top 10 – review

| # | Risk | Applies? | Explanation and status |
|---|---|---|---|
| A01 | Broken Access Control | Yes | Users must only reach what they own or what their role allows. We had three holes (tour delete, photo upload, guide edit); all are fixed with `requireUser`, `requireTourAccess` and `requireRole('editor')`. See vulnerabilities 5 and 6. |
| A02 | Security Misconfiguration | Yes | Unsafe defaults and over-broad settings. We removed the open CORS setting (vulnerability 7). Still open: nginx sets no security headers (no CSP, `X-Content-Type-Options`, `X-Frame-Options`), and `process.on('unhandledRejection')` in `app.js` keeps the server alive after unexpected errors. See known limitations. |
| A03 | Software Supply Chain Failures | Yes | We depend on many npm packages. `npm audit --omit=dev` reports 8 vulnerabilities (1 critical, 4 high, 3 moderate, e.g. in `proxy-addr`, `qs` and `source-map-js`) and the pipeline does not scan dependencies. Not fixed yet. |
| A04 | Cryptographic Failures | Yes | Sensitive data must be protected with proper cryptography. Passwords are now hashed with salted scrypt (vulnerability 1) and tokens are signed with HS256. Remaining: the site is served over plain HTTP inside the container; TLS is expected to be terminated by the hosting platform. |
| A05 | Injection | Yes | Input must never become code. The search query was injectable (vulnerability 3) and is now parameterised (`$1`). All other queries already use parameters, and all request bodies are validated with Zod. |
| A06 | Insecure Design | Partially | Weaknesses in the design itself, not a single bug. Examples that remain: login and registration have no rate limit, and tours, logs and photo lists are public by design. Roles are only `member` and `editor`. |
| A07 | Authentication Failures | Yes | Weak login and session handling. Fixed: hashed passwords, 8 character minimum, 1 hour tokens, HS256 only, identical response for unknown email and wrong password. Remaining: no rate limiting, no refresh token, no account lockout. |
| A08 | Software or Data Integrity Failures | Partially | Code and data must come from a trusted source. Builds run in GitHub Actions with a lockfile (`npm ci`) and images are built in CI, but dependencies and actions are not pinned to commit hashes and images are not signed. Request data is validated on the server. |
| A09 | Security Logging & Alerting Failures | Yes | Security events should be recorded and noticed. Today there is almost no logging: failed logins, 401 / 403 responses and validation errors are not logged and nobody is alerted. Not fixed yet. |
| A10 | Mishandling of Exceptional Conditions | Yes | Errors must be handled safely. Fixed: a central error handler returns 400 for broken JSON and invalid input, 413 for a too large body and a generic 500 without internal details; ids are validated (vulnerability 4). Remaining: `unhandledRejection` is still swallowed instead of failing fast. |

## Input validation

All request bodies and the search query are validated on the server with Zod schemas in [`lib/schemas.js`](../api/src/lib/schemas.js) through `validate()` in [`lib/validate.js`](../api/src/lib/validate.js), before the route runs: `loginSchema`, `registerSchema`, `createTourSchema`, `photoUploadSchema`, `searchSchema` and `guideUpdateSchema`. Ids in the URL are checked with `idParam`. Invalid input returns 400 with `{ error: 'ogiltig indata', issues }`, unknown fields are dropped, and the body is limited to 1 mb.

## Headers we set (nginx)

None yet. [`client/nginx.conf.template`](../client/nginx.conf.template) only proxies `/api/` and `/graphql` to the API and serves the Vue app; it adds no security headers. A Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options` / `frame-ancestors` and `Referrer-Policy` are still to do (see A02).

## Scanning in the pipeline

The CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) has four jobs: quality (typecheck, lint, format check, unit tests), build, integration (API tests against real Postgres and Mongo, which include the security tests above) and image. The security tests run on every push and turn the job red if a fix is removed. There is **no dependency or secret scanning job** yet (for example `npm audit` or CodeQL), so A03 is not covered automatically.

## Known limitations

These are left on purpose or not done yet:
- **Reloading the page logs the user out.** The token lives only in memory. A refresh token in an httpOnly cookie is not implemented.
- **No rate limiting** on login and registration, so passwords can be guessed by a script.
- **Security events are not logged** (failed logins, 401 / 403, validation errors), and there are no alerts.
- **Tokens cannot be revoked.** A stolen token works until it expires after 1 hour.
- **No security headers** in nginx (CSP and others).
- **Dependencies have known vulnerabilities** (`npm audit`: 8, one critical) and are not scanned in CI.
- **Only two roles**, and tours, logs and photo lists are readable by anyone without logging in.
- **`unhandledRejection` is swallowed** in `app.js` instead of failing fast.
- **No TLS configuration in the repo**; HTTPS depends on the hosting platform.
- **`JWT_SECRET` is one shared secret.** If it leaks, anyone can sign tokens. There is no rotation procedure besides replacing the value.
