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

Körd 2026-11-14 mot den befintliga koden, med nollställda compose-databaser (Postgres på 5433, Mongo på 27017):

```sh
docker compose down -v
docker compose up -d --wait postgres mongo
npm run seed        # Seed klar: 12 användare, 40 guider, 200 turer, 5739 loggpunkter.
npm run test:api    # Tests  9 failed | 14 passed (23)
```

**Resultat:** 23 tester, 9 röda och 14 gröna. Alla röda finns i `api/src/routes/routes.test.js`, där 10 av 13 säkerhetstester är röda. GraphQL-testerna (`server.test.js`) och bildtesterna (`photos.test.js`) är gröna, så databaskopplingen fungerar och de röda testerna beror inte på setup.

| # | OWASP | Test | Förväntat | Fick | Orsak |
|---|---|---|---|---|---|
| 1 | A07 | lösenordet i databasen är hashat, inte klartext | 0 klartext | **12** | Lösenord sparas som `plaintext:…` (`routes/auth.js`) |
| 2 | A07 | registrering med för kort lösenord ger 400 | 400 | **200** | Ingen validering, så kontot skapas ändå |
| 3 | A01 | `DELETE /api/tours/:id` utan token ger 401 | 401 | **200** | Ingen `requireUser` på routen (`routes/tours.js:47`). Turen raderades på riktigt. |
| 4 | A01 | en medlem kan inte ta bort någon annans tur (403) | 403 | TypeError | Följdfel av #3: tur 1 var redan raderad. Det finns heller ingen ägarkontroll. |
| 5 | A01 | `POST /api/photos` utan token ger 401 | 401 | **502** | Ingen inloggning krävs (`routes/photos.js:8`). Anropet gick hela vägen till bildfunktionen. |
| 6 | A05 | ett citattecken i sökordet ger 200 och en tom lista | 200 | **timeout** | Sökordet klistras in i SQL-strängen (`routes/guides.ts:32`). Frågan kraschar och anropet får inget svar. |
| 7 | A10 | en bild med orimliga mått stoppas med 400 | 400 | **502** | Ingen validering av `width`/`height` innan anropet skickas vidare |
| 8 | A10 | ett id som inte är ett tal ger 400 | 400 | **timeout** | Felet sväljs av `process.on('unhandledRejection')` (`app.js:59`), så anropet hänger |
| 9 | A10 | trasig JSON ger 400 med ett JSON-svar | 400 + JSON | HTML-sida | Ingen felhanterare, så Express svarar med sin HTML-felsida |

**Gröna redan före fixarna:** svaret på inloggning innehåller inte `password_hash`; fel lösenord och okänd e-post ger samma svar; ägaren kan ta bort sin egen tur; en vanlig sökning fungerar.

**Övrigt i körningen:** `afterAll` i `routes.test.js` får timeout efter 10 s, eftersom de hängande anropen från #6 och #8 håller servern öppen. Det är samma A10-brist. `ECONNREFUSED` från `photos.js` betyder att bildfunktionen inte körs lokalt. Det påverkar inte slutsatsen i #5 och #7, eftersom anropen borde ha stoppats innan de nådde bildfunktionen.

## OWASP Top 10 – genomgång

| # | Risk | Gäller oss? | Vad vi hittade (fil, endpoint) | Vad vi gjorde (PR) | Kontroll (testet som var rött före fixen, eller curl) |
|---|---|---|---|---|---|
| A01 | Broken Access Control | Ja | `DELETE /api/tours/:id` och `POST /api/photos` utan inloggning, ingen ägarkontroll vid radering, `PUT /api/guides/:id` utan rollen editor | Ej lagat än | Test #3, #4, #5 ovan (röda) |
| A02 | Security Misconfiguration | Ej undersökt än | | | |
| A03 | Software Supply Chain Failures | Ej undersökt än | | | |
| A04 | Cryptographic Failures | Ja | Lösenord i klartext (`routes/auth.js`) | Ej lagat än | Test #1 (rött) |
| A05 | Injection | Ja | SQL byggd med strängkonkatenering i `GET /api/guides/search` (`routes/guides.ts:32`) | Ej lagat än | Test #6 (rött) |
| A06 | Insecure Design | Ej undersökt än | | | |
| A07 | Authentication Failures | Ja | Inga lösenordskrav vid registrering. Token gällde 30 dagar. | Token: 1 h och HS256 (`lib/auth.js` från mallen). Resten ej lagat än. | Test #2 (rött) |
| A08 | Software or Data Integrity Failures | Ej undersökt än | | | |
| A09 | Security Logging & Alerting Failures | Ej undersökt än | | | |
| A10 | Mishandling of Exceptional Conditions | Ja | Ingen validering av id, JSON eller bildmått. `unhandledRejection` sväljer fel så att anrop hänger. | Ej lagat än | Test #7, #8, #9 (röda) |

## Validering av indata

Före fixarna finns ingen validering i routerna. `lib/schemas.js` (Zod) och `lib/validate.js` finns, men inga routes använder dem än. Ogiltig indata ger i dag antingen 200 (registrering), 502 (bildmått), en HTML-felsida (trasig JSON) eller ett anrop som hänger (id som inte är ett tal). Se test #2, #7, #8 och #9 ovan.

## Headers vi sätter (nginx)

______ (`curl -I` mot staging – CSP och de andra säkerhetsheadrarna. Kommer i fredagens labb.)

## Skanning i pipelinen

______ (vilka verktyg kör i jobbet *Säkerhet*, vad hittar var och en, och vad gör jobbet rött. Kommer i fredagens labb.)

## Kända brister (medvetet kvar)

______ (det ni valt att inte laga än, och varför. Ärlighet ger poäng: en omladdning loggar ut – refresh-token är inte byggt; bytes lämnar inte browsern; …)
