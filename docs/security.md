# Säkerhet – Utpost

*Mall (M8). Byt ut exempelraderna mot era egna fynd. Minst tre rader ska ha ett riktigt fynd, en fix i en PR och ett test som var rött före fixen. "Gäller inte oss, för …" är också ett svar – men bara om det är sant. Listan följer OWASP Top 10 (2025).*

**Datum:** 2026-11-14
**Hotbilden i en mening:** Det som är värt att skydda är användarnas konton, turer och bilder samt redaktionens guider, och angriparen är oftast ett skript som provar öppna endpoints, inte en person.

## Autentiseringen (M8)

*Läget före fixarna (branch `m8-sakrad`, före första fix-commit).*

- Lösenord: lagras i klartext som `plaintext:<lösenord>` i `users.password_hash` ([api/src/routes/auth.js:20](../api/src/routes/auth.js) vid inloggning, rad 30 vid registrering). Alla 12 seedade användare har klartextlösenord. `lib/password.js` (scrypt) finns men används inte än.
- Token: JWT med `id`, `email` och `role`. `lib/auth.js` (från mallen) signerar nu med HS256 och 1 timmes giltighet; tidigare var giltigheten 30 dagar. Klienten håller token i minnet (`client/src/lib/token.ts`), så en omladdning loggar ut.
- Skyddade routes: bara `POST /api/tours` har `requireUser`. `DELETE /api/tours/:id`, `POST /api/photos` och `PUT /api/guides/:id` saknar både inloggningskrav och rollkontroll i API:et. `requireRole('editor')` finns i `lib/auth.js` men används inte än.

## Testkörning före fixarna (M8)

Körd mot den befintliga koden (branch `m8-sakrad`, inga fixar), med nollställda compose-databaser (Postgres på 5433, Mongo på 27017). Senast körd lokalt 2026-11-18:

```sh
docker compose down -v
docker compose up -d --wait postgres mongo
npm run seed        # Seed klar: 12 användare, 40 guider, 200 turer, 5952 loggpunkter.
npm run test:api    # Tests  9 failed | 14 passed (23)
```

Samma resultat i CI, där jobbet Integration alltid startar med tomma databaser: [körning 43621048897](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/43621048897/job/132526585959). Samma 9 tester är röda med samma fel lokalt och i CI.

**Resultat:** 23 tester, 9 röda och 14 gröna. Alla röda finns i `api/src/routes/routes.test.js`, där 9 av 13 säkerhetstester är röda. GraphQL-testerna (`server.test.js`) och bildtesterna (`photos.test.js`) är gröna, så databaskopplingen fungerar och de röda testerna beror inte på setup.

| # | OWASP | Test | Förväntat | Fick | Orsak |
|---|---|---|---|---|---|
| 1 | A07 | lösenordet i databasen är hashat, inte klartext | 0 klartext | **12** | Lösenord sparas som `plaintext:…` (`routes/auth.js`) |
| 2 | A07 | registrering med för kort lösenord ger 400 | 400 | **200** | Ingen validering, så kontot skapas ändå |
| 3 | A01 | `DELETE /api/tours/:id` utan token ger 401 | 401 | **200** | Ingen `requireUser` på routen (`routes/tours.js:47`). Turen raderades på riktigt. |
| 4 | A01 | en medlem kan inte ta bort någon annans tur (403) | 403 | TypeError (hela körningen), **200** (ensamt) | Ingen ägarkontroll: en annan medlem kan radera turen. Se förklaringen under tabellen. |
| 5 | A01 | `POST /api/photos` utan token ger 401 | 401 | **502** | Ingen inloggning krävs (`routes/photos.js:8`). Anropet gick hela vägen till bildfunktionen. |
| 6 | A05 | ett citattecken i sökordet ger 200 och en tom lista | 200 | **timeout** | Sökordet klistras in i SQL-strängen (`routes/guides.ts:32`). Frågan kraschar (`operator is not unique: unknown % unknown` i loggen) och anropet får inget svar. |
| 7 | A10 | en bild med orimliga mått stoppas med 400 | 400 | **502** | Ingen validering av `width`/`height` innan anropet skickas vidare |
| 8 | A10 | ett id som inte är ett tal ger 400 | 400 | **timeout** | Postgres kastar `invalid input syntax for type integer: "abc"`, felet sväljs av `process.on('unhandledRejection')` (`app.js:59`) och anropet hänger |
| 9 | A10 | trasig JSON ger 400 med ett JSON-svar | 400 + JSON | HTML-sida | Ingen felhanterare, så Express svarar med sin HTML-felsida |

**Gröna redan före fixarna:** svaret på inloggning innehåller inte `password_hash`; fel lösenord och okänd e-post ger samma svar; ägaren kan ta bort sin egen tur; en vanlig sökning fungerar.

**Två röda som ser ut som setup-fel men är riktiga hål:**

- **#5 och #7 ger 502, inte ett setup-fel.** 502 betyder att API:et inte nådde bildfunktionen (lokalt `ECONNREFUSED`, i CI är `IMAGE_FUNCTION_URL` inte satt). Men testerna väntar sig 401 och 400, och de svaren ska komma *innan* bildfunktionen anropas. Att anropet alls kom fram till bildfunktionen visar att inloggningskravet och valideringen saknas. Med bildfunktionen igång hade anropen lyckats, och testerna hade fortfarande varit röda. Efter fixen stoppar `requireUser` och `validate()` anropen före routen, så testerna blir gröna utan bildfunktion.
- **#4 ger TypeError, men hålet är riktigt.** I hela körningen är tur 1 redan borta, eftersom #3 raderade den utan token. Därför blir raden `undefined`. Körs testet ensamt med tur 1 på plats blir det rött av rätt anledning: `expected 200 to be 403`. En annan medlem kan radera turen.

  ```sh
  npm run test --workspace=api -- src/routes/routes.test.js -t "en medlem kan inte ta bort"
  # × en medlem kan inte ta bort någon annans tur (403)
  #   → expected 200 to be 403
  ```

Att setupen fungerar syns på att GraphQL-testerna och bildtesterna i samma körning är gröna mot samma databaser.

**Övrigt i körningen:** `afterAll` i `routes.test.js` får timeout efter 10 s, eftersom de hängande anropen från #6 och #8 håller servern öppen. Det är samma A10-brist.

## OWASP Top 10 – genomgång

| # | Risk | Gäller oss? | Vad vi hittade (fil, endpoint) | Vad vi gjorde (PR) | Kontroll (testet som var rött före fixen, eller curl) |
|---|---|---|---|---|---|
| A01 | Broken Access Control | Ja | `DELETE /api/tours/:id` och `POST /api/photos` utan inloggning, ingen ägarkontroll vid radering, `PUT /api/guides/:id` utan rollen editor och utan validering av id och body (se [Guideredigeringen](#guideredigeringen-a01-och-a02)) | Guide-endpointen: `requireUser` + `requireRole('editor')` + `idParam` + `guideUpdateSchema` (`routes/guides.ts`, `lib/schemas.js`). Resten ej lagat än. | Guide: test #10–#12 nedan (#11 och #12 röda före fixen). Övrigt: test #3, #4, #5 ovan (röda) |
| A02 | Security Misconfiguration | Ja | `app.use(cors())` i `app.js` svarade `Access-Control-Allow-Origin: *` till alla origins, även på preflight | Borttagen. Ingen CORS-konfiguration alls: webbläsaren pratar med samma origin via Vite-proxyn (`client/vite.config.js`) och nginx (`client/nginx.conf.template`). | Test #13 och #14 nedan (röda före fixen) |
| A03 | Software Supply Chain Failures | Ej undersökt än | | | |
| A04 | Cryptographic Failures | Ja | Lösenord i klartext (`routes/auth.js`) | Ej lagat än | Test #1 (rött) |
| A05 | Injection | Ja | SQL byggd med strängkonkatenering i `GET /api/guides/search` (`routes/guides.ts:32`) | Ej lagat än | Test #6 (rött) |
| A06 | Insecure Design | Ej undersökt än | | | |
| A07 | Authentication Failures | Ja | Inga lösenordskrav vid registrering. Token gällde 30 dagar. | Token: 1 h och HS256 (`lib/auth.js` från mallen). Resten ej lagat än. | Test #2 (rött) |
| A08 | Software or Data Integrity Failures | Ej undersökt än | | | |
| A09 | Security Logging & Alerting Failures | Ej undersökt än | | | |
| A10 | Mishandling of Exceptional Conditions | Ja | Ingen validering av id, JSON eller bildmått. `unhandledRejection` sväljer fel så att anrop hänger. | Ej lagat än | Test #7, #8, #9 (röda) |

## Guideredigeringen (A01 och A02)

Körd mot `main` efter PR #154, innan guide-fixarna (branch `m8-issue-guide-security`, testerna skrivna först). Resultat: 36 tester, 4 röda och 32 gröna.

| # | OWASP | Test | Förväntat | Före fixen | Orsak |
|---|---|---|---|---|---|
| 10 | A01 | `PUT /api/guides/:id` utan token ger 401, som medlem 403, som redaktör 200 | 401 / 403 / 200 | grönt | `requireUser` och `requireRole('editor')` fanns redan på routen när testerna skrevs. Testerna låser skyddet så att det inte kan tas bort. |
| 11 | A01 | `PUT /api/guides/:id` med ogiltig body ger 400 och guiden är oförändrad | 400 | **500** | Ingen validering: `req.body` gick rakt in i SQL och databasen kastade fel |
| 12 | A01 | `PUT /api/guides/abc` ger 400 | 400 + `ogiltigt id` | **500** | `req.params.id` kontrollerades inte med `idParam` |
| – | A01 | `PUT` på en guide som inte finns ger 404 | 404 | grönt | Routen svarade redan 404 när raden saknas |
| 13 | A02 | en begäran från en okänd origin får inte `Access-Control-Allow-Origin: *` | ingen header | **`*`** | `app.use(cors())` utan inställningar släpper in alla origins |
| 14 | A02 | preflight (`OPTIONS`) från en okänd origin släpps inte igenom | ingen header | **`*`** | Samma orsak |

**Fixarna:**

- **A01:** `validateId` (med `idParam`) och `validate(guideUpdateSchema)` ligger efter `requireUser` och `requireRole('editor')`, så en obehörig aldrig når valideringen. Ordningen ger 401 före 403 före 400 före 404.
- **A02:** `cors()` och importen är borttagna från `app.js`. Klienten når API:et på samma origin (Vite-proxy lokalt, nginx i drift), så ingen CORS behövs. Ett anrop från en annan sajts JavaScript blockeras av webbläsaren, eftersom svaret saknar `Access-Control-Allow-Origin`.
- Kvar att städa: paketet `cors` står fortfarande i `api/package.json` men används inte.

## Validering av indata

Före fixarna finns ingen validering i routerna. `lib/schemas.js` (Zod) och `lib/validate.js` finns, men inga routes använder dem än. Ogiltig indata ger i dag antingen 200 (registrering), 502 (bildmått), en HTML-felsida (trasig JSON) eller ett anrop som hänger (id som inte är ett tal). Se test #2, #7, #8 och #9 ovan.

## Headers vi sätter (nginx)

______ (`curl -I` mot staging – CSP och de andra säkerhetsheadrarna. Kommer i fredagens labb.)

## Skanning i pipelinen

______ (vilka verktyg kör i jobbet *Säkerhet*, vad hittar var och en, och vad gör jobbet rött. Kommer i fredagens labb.)

## Kända brister (medvetet kvar)

______ (det ni valt att inte laga än, och varför. Ärlighet ger poäng: en omladdning loggar ut – refresh-token är inte byggt; bytes lämnar inte browsern; …)
