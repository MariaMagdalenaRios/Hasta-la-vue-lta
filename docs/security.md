# Security – Utpost

*Template (M8). Replace the example rows with your own findings. At least three rows must have a real finding, a fix in a PR and a test that was red before the fix. "Does not apply to us, because …" is also an answer – but only if it is true. The list follows the OWASP Top 10 (2025).*

**Date:** 2026-11-14
**The threat in one sentence:** What is worth protecting is the users' accounts, tours and photos and the editorial team's guides, and the attacker is usually a script that probes open endpoints, not a person.

## Authentication (M8)

*State before the fixes (branch `m8-sakrad`, before the first fix commit).*

- Passwords: stored in plaintext as `plaintext:<password>` in `users.password_hash` ([api/src/routes/auth.js:20](../api/src/routes/auth.js) on login, line 30 on registration). All 12 seeded users have plaintext passwords. `lib/password.js` (scrypt) exists but is not used yet.
- Token: JWT with `id`, `email` and `role`. `lib/auth.js` (from the template) now signs with HS256 and a 1 hour lifetime; it used to be 30 days. The client keeps the token in memory (`client/src/lib/token.ts`), so a page reload logs the user out.
- Protected routes: only `POST /api/tours` has `requireUser`. `DELETE /api/tours/:id`, `POST /api/photos` and `PUT /api/guides/:id` have neither a login requirement nor a role check in the API. `requireRole('editor')` exists in `lib/auth.js` but is not used yet.

## Test run before the fixes (M8)

Run against the existing code (branch `m8-sakrad`, no fixes), with reset compose databases (Postgres on 5433, Mongo on 27017). Last run locally on 2026-11-18:

```sh
docker compose down -v
docker compose up -d --wait postgres mongo
npm run seed        # Seed klar: 12 användare, 40 guider, 200 turer, 5952 loggpunkter.
npm run test:api    # Tests  9 failed | 14 passed (23)
```

Same result in CI, where the Integration job always starts with empty databases: [run 43621048897](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/43621048897/job/132526585959). The same 9 tests are red with the same errors locally and in CI.

**Result:** 23 tests, 9 red and 14 green. All the red ones are in `api/src/routes/routes.test.js`, where 9 of 13 security tests are red. The GraphQL tests (`server.test.js`) and the photo tests (`photos.test.js`) are green, so the database connection works and the red tests are not caused by the setup.

| # | OWASP | Test | Expected | Got | Cause |
|---|---|---|---|---|---|
| 1 | A07 | the password in the database is hashed, not plaintext | 0 plaintext | **12** | Passwords are stored as `plaintext:…` (`routes/auth.js`) |
| 2 | A07 | registration with a too short password gives 400 | 400 | **200** | No validation, so the account is created anyway |
| 3 | A01 | `DELETE /api/tours/:id` without a token gives 401 | 401 | **200** | No `requireUser` on the route (`routes/tours.js:47`). The tour was really deleted. |
| 4 | A01 | a member cannot delete someone else's tour (403) | 403 | TypeError (full run), **200** (alone) | No ownership check: another member can delete the tour. See the explanation below the table. |
| 5 | A01 | `POST /api/photos` without a token gives 401 | 401 | **502** | No login required (`routes/photos.js:8`). The request went all the way to the image function. |
| 6 | A05 | a quote character in the search term gives 200 and an empty list | 200 | **timeout** | The search term is pasted into the SQL string (`routes/guides.ts:32`). The query crashes (`operator is not unique: unknown % unknown` in the log) and the request gets no response. |
| 7 | A10 | an image with absurd dimensions is stopped with 400 | 400 | **502** | No validation of `width`/`height` before the request is forwarded |
| 8 | A10 | an id that is not a number gives 400 | 400 | **timeout** | Postgres throws `invalid input syntax for type integer: "abc"`, the error is swallowed by `process.on('unhandledRejection')` (`app.js:59`) and the request hangs |
| 9 | A10 | broken JSON gives 400 with a JSON response | 400 + JSON | HTML page | No error handler, so Express answers with its HTML error page |

**Green even before the fixes:** the login response does not contain `password_hash`; a wrong password and an unknown email give the same response; the owner can delete their own tour; a normal search works.

**Two red tests that look like setup errors but are real holes:**

- **#5 and #7 give 502, not a setup error.** 502 means the API could not reach the image function (locally `ECONNREFUSED`, in CI `IMAGE_FUNCTION_URL` is not set). But the tests expect 401 and 400, and those responses must come *before* the image function is called. The fact that the request got to the image function at all shows that the login requirement and the validation are missing. With the image function running, the requests would have succeeded, and the tests would still have been red. After the fix, `requireUser` and `validate()` stop the requests before the route, so the tests turn green without the image function.
- **#4 gives TypeError, but the hole is real.** In the full run, tour 1 is already gone, because #3 deleted it without a token. The row is therefore `undefined`. Run alone with tour 1 in place, the test is red for the right reason: `expected 200 to be 403`. Another member can delete the tour.

  ```sh
  npm run test --workspace=api -- src/routes/routes.test.js -t "en medlem kan inte ta bort"
  # × en medlem kan inte ta bort någon annans tur (403)
  #   → expected 200 to be 403
  ```

That the setup works can be seen from the GraphQL tests and the photo tests being green in the same run against the same databases.

**Other things in the run:** `afterAll` in `routes.test.js` times out after 10 s, because the hanging requests from #6 and #8 keep the server open. This is the same A10 weakness.

## OWASP Top 10 – review

| # | Risk | Applies to us? | What we found (file, endpoint) | What we did (PR) | Verification (the test that was red before the fix, or curl) |
|---|---|---|---|---|---|
| A01 | Broken Access Control | Yes | `DELETE /api/tours/:id` and `POST /api/photos` without login, no ownership check on delete, `PUT /api/guides/:id` without the editor role and without validation of the id and the data | Fixed. Tour and photo: `requireUser` + `requireTourAccess` (404 if the tour is missing, 403 if you neither own the tour nor are an editor), commit `0789f06`. Guide editing: `requireUser` + `requireRole('editor')`, `idParam` on the id, `guideUpdateSchema` on the body, 404 if the guide is missing (`routes/guides.ts`), #144. | Tests #3, #4, #5 above (red before the fix, green now). #144: the `redigera guider (#144)` block in `routes.test.js`. 401, 403 and 404 were already green after `0789f06`; the tests for an invalid id and invalid data (400) were red before the fix. |
| A02 | Security Misconfiguration | Yes | `app.use(cors())` without options (`app.js:21`) sends `Access-Control-Allow-Origin: *` on every response, so any website can read API responses in a visitor's browser. The damage is limited: the token lives in memory and is sent in `Authorization`, not as a cookie. | Removed `app.use(cors())` and the import (#144). The client calls `/api` and `/graphql` with relative URLs through the Vite proxy (dev, `client/vite.config.js`) and nginx (`client/nginx.conf.template`), so the browser makes no cross-origin calls and needs no CORS. | `A02 Security Misconfiguration – CORS (#144)` in `routes.test.js`: two tests (a plain request and a preflight with `Origin: https://evil.example`), red before the fix. CORS only protects browsers, not against curl: access is controlled by 401/403. |
| A03 | Software Supply Chain Failures | Not investigated yet | | | |
| A04 | Cryptographic Failures | Yes | Passwords in plaintext (`routes/auth.js`) | Fixed: `lib/password.js` (scrypt) is used on registration and login. | Test #1 (red before the fix, green now) |
| A05 | Injection | Yes | SQL built with string concatenation in `GET /api/guides/search` (`routes/guides.ts:32`) | Fixed: parameterised query (`$1`) and `validate(searchSchema, 'query')`, commit `a80fd98`. | Test #6 (red before the fix, green now) |
| A06 | Insecure Design | Not investigated yet | | | |
| A07 | Authentication Failures | Yes | No password requirements on registration. The token was valid for 30 days. | Token: 1 h and HS256 (`lib/auth.js`). Registration is validated with `registerSchema` (at least 8 characters). A wrong password and an unknown email give the same response. | Test #2 (red before the fix, green now) |
| A08 | Software or Data Integrity Failures | Not investigated yet | | | |
| A09 | Security Logging & Alerting Failures | Not investigated yet | | | |
| A10 | Mishandling of Exceptional Conditions | Yes | No validation of id, JSON or image dimensions. `unhandledRejection` swallows errors so requests hang. | Partly fixed (`a80fd98`): validation of id and image dimensions, a central error handler that answers 400 on broken JSON, 413 on a too large body and a generic 500 without internal details. Remaining: `process.on('unhandledRejection')` is still in `app.js`. | Tests #7, #8, #9 (red before the fix, green now) |

## Input validation

Before the fixes there was no validation in the routers. Invalid input gave either 200 (registration), 502 (image dimensions), an HTML error page (broken JSON) or a request that hung (an id that is not a number). See tests #2, #7, #8 and #9 above.

Input is now validated on the server with Zod schemas in `lib/schemas.js` and `validate()` in `lib/validate.js`, before the route: `loginSchema`, `registerSchema`, `createTourSchema`, `photoUploadSchema`, `searchSchema` and `guideUpdateSchema` (#144), plus `idParam` for ids in the URL. Invalid input gives 400 with `{ error: 'ogiltig indata', issues }`. The body is limited to 1 mb.

## Headers we set (nginx)

______ (`curl -I` against staging – CSP and the other security headers. Coming in Friday's lab.)

## Scanning in the pipeline

______ (which tools run in the *Security* job, what each one finds, and what turns the job red. Coming in Friday's lab.)

## Known weaknesses (deliberately left)

______ (what you chose not to fix yet, and why. Honesty earns points: a reload logs the user out – a refresh token is not built; bytes never leave the browser; …)
