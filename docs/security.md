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
| A01 | Broken Access Control | Ja | `DELETE /api/tours/:id` och `POST /api/photos` utan inloggning, ingen ägarkontroll vid radering, `PUT /api/guides/:id` utan rollen editor och utan validering av id och indata | Lagat. Tur och foto: `requireUser` + `requireTourAccess` (404 om turen saknas, 403 om man varken äger turen eller är redaktör), commit `0789f06`. Guide-redigering: `requireUser` + `requireRole('editor')`, `idParam` på id, `guideUpdateSchema` på body, 404 om guiden saknas (`routes/guides.ts`), #144. | Test #3, #4, #5 ovan (röda före fixen, gröna nu). #144: blocket `redigera guider (#144)` i `routes.test.js`. 401, 403 och 404 var gröna efter `0789f06`; testerna för ogiltigt id och ogiltig indata (400) var röda före fixen. |
| A02 | Security Misconfiguration | Ja | `app.use(cors())` utan inställningar (`app.js:21`) skickar `Access-Control-Allow-Origin: *` på alla svar, så vilken webbplats som helst kan läsa API-svar i en besökares webbläsare. Skadan är begränsad: token ligger i minnet och skickas i `Authorization`, inte som cookie. | Raderade `app.use(cors())` och importen (#144). Klienten anropar `/api` och `/graphql` med relativa adresser via Vite-proxyn (dev, `client/vite.config.js`) och nginx (`client/nginx.conf.template`), så webbläsaren gör inga anrop mellan olika origin och behöver ingen CORS. | `A02 Security Misconfiguration – CORS (#144)` i `routes.test.js`: två tester (vanligt anrop och preflight med `Origin: https://evil.example`), röda före fixen. CORS skyddar bara webbläsare, inte mot curl: åtkomst styrs av 401/403. |
| A03 | Software Supply Chain Failures | Ej undersökt än | | | |
| A04 | Cryptographic Failures | Ja | Lösenord i klartext (`routes/auth.js`) | Lagat: `lib/password.js` (scrypt) används vid registrering och inloggning. | Test #1 (rött före fixen, grönt nu) |
| A05 | Injection | Ja | SQL byggd med strängkonkatenering i `GET /api/guides/search` (`routes/guides.ts:32`) | Lagat: parametriserad fråga (`$1`) och `validate(searchSchema, 'query')`, commit `a80fd98`. | Test #6 (rött före fixen, grönt nu) |
| A06 | Insecure Design | Ej undersökt än | | | |
| A07 | Authentication Failures | Ja | Inga lösenordskrav vid registrering. Token gällde 30 dagar. | Token: 1 h och HS256 (`lib/auth.js`). Registrering valideras med `registerSchema` (minst 8 tecken). Fel lösenord och okänd e-post ger samma svar. | Test #2 (rött före fixen, grönt nu) |
| A08 | Software or Data Integrity Failures | Ej undersökt än | | | |
| A09 | Security Logging & Alerting Failures | Ej undersökt än | | | |
| A10 | Mishandling of Exceptional Conditions | Ja | Ingen validering av id, JSON eller bildmått. `unhandledRejection` sväljer fel så att anrop hänger. | Delvis lagat (`a80fd98`): validering av id och bildmått, central felhanterare som svarar 400 på trasig JSON, 413 på för stor body och ett generiskt 500 utan interna detaljer. Kvar: `process.on('unhandledRejection')` i `app.js` finns kvar. | Test #7, #8, #9 (röda före fixen, gröna nu) |

## Validering av indata

Före fixarna fanns ingen validering i routerna. Ogiltig indata gav antingen 200 (registrering), 502 (bildmått), en HTML-felsida (trasig JSON) eller ett anrop som hängde (id som inte är ett tal). Se test #2, #7, #8 och #9 ovan.

Nu valideras indata på servern med Zod-scheman i `lib/schemas.js` och `validate()` i `lib/validate.js`, före routen: `loginSchema`, `registerSchema`, `createTourSchema`, `photoUploadSchema`, `searchSchema` och `guideUpdateSchema` (#144), samt `idParam` för id i adressen. Ogiltig indata ger 400 med `{ error: 'ogiltig indata', issues }`. Bodyn är begränsad till 1 mb.

## Headers vi sätter (nginx)

______ (`curl -I` mot staging – CSP och de andra säkerhetsheadrarna. Kommer i fredagens labb.)

## Skanning i pipelinen

______ (vilka verktyg kör i jobbet *Säkerhet*, vad hittar var och en, och vad gör jobbet rött. Kommer i fredagens labb.)

## Kända brister (medvetet kvar)

______ (det ni valt att inte laga än, och varför. Ärlighet ger poäng: en omladdning loggar ut – refresh-token är inte byggt; bytes lämnar inte browsern; …)
