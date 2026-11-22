# CI-pipeline

## Flöde

```mermaid
flowchart LR
    B[branch + commit] --> PR[pull request]
    PR --> Q[Kvalitet]
    PR --> BU[Bygg]
    PR --> I[Integration]
    PR --> SEK[Säkerhet]
    Q --> S{alla gröna?}
    BU --> S
    I --> S
    SEK --> S
    S -->|nej| F[fixa, pusha igen]
    S -->|ja| IM[Image]
    IM --> M[merge till main]
    M --> Q2[Kvalitet]
    M --> BU2[Bygg]
    M --> I2[Integration]
    Q2 --> IM2[Image]
    BU2 --> IM2
    I2 --> IM2
    IM2 -->|publicera images till GHCR| D[Deploy Azure staging]
    D --> H[Health check + GraphQL smoke test]
    Q2 --> DF[Deploy → Azure Functions]
    DF --> FS[Smoke test process-image]

## Vad stegen fångar

- **Lint:** hittar kodfel och problem med kodregler, till exempel oanvända variabler.
- **Format check:** kontrollerar att koden följer projektets Prettier-format.
- **Test:** kör Vitest och kontrollerar att testerna passerar.
- **Build:** kontrollerar att Vue-klienten kan byggas för produktion utan byggfel.
- **Integration:** startar riktiga PostgreSQL- och MongoDB-tjänster, seedar databaserna, migrerar turloggarna och kör API-testerna mot båda databaserna.
- **Säkerhet:** letar efter kända sårbarheter i beroenden och images, läckta hemligheter och osäkra inställningar, och skannar den körande appen. Se avsnittet [Säkerhet](#säkerhet).

## Integration

Integration-jobbet körs både för pull requests mot `main` och för pushes till `main`. GitHub Actions startar följande tjänster:

| Tjänst     | Image         | Port på runner |
| ---------- | ------------- | -------------: |
| PostgreSQL | `postgres:16` |         `5432` |
| MongoDB    | `mongo:8.2`   |        `27017` |

Jobbet väntar på att båda tjänsternas health checks är gröna. Det använder testdatabaserna `utpost` med användaren `utpost` och kör sedan:

1. `npm ci`
2. `npm run seed`
3. `npm run migrate:logs`
4. `npm run test:api`

`migrate:logs` kopierar turerna och deras loggpunkter från PostgreSQL till MongoDB. Den är idempotent och verifierar att antalet turer och loggpunkter matchar PostgreSQL innan jobbet fortsätter.

`test:api` innehåller regressionstestet för N+1 (`begränsar antalet databasfrågor med DataLoader`). Det läser `extensions.databasfragor` och gör jobbet rött om turlistan kostar fler än 4 databasfrågor.

### Uppmätt tid för Integration

Tider från GitHub Actions 2026-10-27, jobbets totala tid:

| Körning | Integration | Länk |
| --- | ---: | --- |
| Pull request (`ci/integration-databases`) | 55 s | [körning 40554449564](https://github.com/1sa1asdev/Hasta-la-vue-lta/actions/runs/40554449564/job/122366623610) |
| Push till `main` (merge av #102) | 50 s | [körning 40557378215](https://github.com/1sa1asdev/Hasta-la-vue-lta/actions/runs/40557378215/job/122376943713) |

På samma körning på `main` var alla fyra jobben gröna: Kvalitet 36 s, Bygg 17 s, Integration 50 s och Image 60 s.

## Nödvändiga checks

Branch protection för `main` kräver att följande checks är gröna innan en pull request kan mergas:

- **Kvalitet**
- **Bygg**
- **Integration**
- **Image**
- **Säkerhet**

Deploy är inte en obligatorisk branch protection-check eftersom jobbet
endast körs efter push till `main` och hoppas över för pull requests.
Det är därför Kvalitet, Bygg, Integration, Image och Säkerhet som måste vara gröna
för att en pull request ska kunna mergas.

`Säkerhet` måste läggas till av en admin under Settings → Branches → regeln för `main` → Require status checks. Jobbet måste ha körts minst en gång innan det går att välja i listan.

`Image` väntar på att Kvalitet, Bygg och Integration har lyckats. På pull requests byggs images utan att publiceras. På pushes till `main` publiceras de till GHCR.

## Uppmätta tider

Tider från en tidigare grön GitHub Actions-körning, innan Integration-jobbet fanns, där Bygg-jobbet tog totalt 25 s och Kvalitet-jobbet 19 s:

| Steg               |  Tid |
| ------------------ | ---: |
| npm ci (Kvalitet)  |  8 s |
| Lint               |  1 s |
| Format check       |  1 s |
| Test               |  2 s |
| npm ci (Bygg)      | 10 s |
| Build              |  2 s |
| Upload client dist |  2 s |
| Kvalitet totalt    | 19 s |
| Bygg totalt        | 25 s |

Det längsta enskilda steget var `npm ci` i Bygg-jobbet med 10 sekunder.

### Senaste pipeline-körning på main

GitHub Actions-körning 42481383490 den 2026-11-08:

| Jobb | Körtid |
|---|---:|
| Kvalitet | 47 s |
| Bygg | 47 s |
| Integration | 1 min |
| Image | 1 min |
| Deploy | 1 min |

Tiderna är avrundade enligt GitHub Actions visning. Jobben körs delvis
parallellt, så tiderna ska inte summeras till en total pipeline-tid.

## Borttagning av den gamla React-klienten (M6 #3)

Den gamla React-klienten i `web/` är borttagen, så bara Vue-klienten i `client/` underhålls, testas och byggs.

### Vyer som flyttades till Vue

`web/` hade sju sidor. Fyra fanns redan i Vue (startsida, guider, turer, inloggning). Tre saknades eller var inte nåbara och portades före borttagningen:

| React-sida (`web/`)   | Vue-vy                                | Åtgärd                                                                 |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `GuideDetail.jsx`     | `GuideDetailView.vue`, `/guider/:slug` | Ny vy. Guidens HTML saneras med DOMPurify (teknisk skuld 3).          |
| `TourDetail.jsx`      | `TourDetailView.vue`, `/turer/:id`    | Vyn fanns men saknade route. Länkar från startsidan och turlistan gick ingenstans. |
| `Profile.jsx`         | `ProfileView.vue`, `/profil`          | Ny vy som använder Pinia-storen. Utloggning går via routern.          |

### `npm ci` före och efter

Tiderna är steget "Install dependencies" (`npm ci`) i varje jobb.

- **Före:** senaste gröna körningen på `main` (`01fdcce`, 2026-10-27), [run 40572123823](https://github.com/1sa1asdev/Hasta-la-vue-lta/actions/runs/40572123823).
- **Efter:** senaste körningen på PR #114 (`e36ffcc`), [run 41317466955](https://github.com/1sa1asdev/Hasta-la-vue-lta/actions/runs/41317466955).

| Jobb        | Före | Efter |
| ----------- | ---: | ----: |
| Kvalitet    |  9 s |   9 s |
| Bygg        | 10 s |   5 s |
| Integration |  4 s |   7 s |

Den första körningen på PR:en ([run 41315344670](https://github.com/1sa1asdev/Hasta-la-vue-lta/actions/runs/41315344670), `ad2b0bf`) tog 45 s, 32 s och 28 s. Det var troligen en kall npm-cache efter ändringen i `package-lock.json` (inte verifierat i loggarna), så den används inte som "efter"-värde. Att ta bort `web/` gav ingen mätbar skillnad i `npm ci`-tid på CI.

Lokalt tog `npm ci` 6 s efter borttagningen (823 paket). Det är inte jämförbart med CI-tiderna och används inte som "efter"-värde.

## Säkerhet

Jobbet `Säkerhet` körs på varje pull request mot `main` och vid varje push till `main`, parallellt med Kvalitet, Bygg och Integration. Det ska vara en obligatorisk check för att merga till `main`. Ett fel i jobbet stoppar mergen.

### Steg

1. **`npm audit --omit=dev --audit-level=high`** – kända sårbarheter i produktionsberoenden. Jobbet faller vid `high` och `critical`. Utvecklingsverktyg som `vitest` ingår inte, eftersom de inte levereras till användarna.
2. **Trivy repository scan** (`scan-type: fs`) – sårbara beroenden, läckta hemligheter och felkonfigurationer i Dockerfiles. Faller vid `HIGH` och `CRITICAL`. Sårbarheter utan tillgänglig fix (`ignore-unfixed`) räknas inte.
3. **`docker compose up -d --build --wait`** – bygger och startar hela stacken. `--wait` väntar på att alla tjänster är friska, vilket kräver healthchecks. `api` och `client` har egna healthchecks i `compose.yaml`.
4. **Trivy image scan** av `hlv-api` och `hlv-client` – sårbarheter i basimagens paket och i apparna. Projektnamnet är satt till `hlv` med `COMPOSE_PROJECT_NAME` så att image-namnen är kända.
5. **OWASP ZAP baseline** mot `http://localhost:3001` – en passiv skanning av den körande appen. Den letar efter saknade säkerhetsheaders och informationsläckor, men attackerar inte appen och loggar inte in.
6. **Städning** – tjänsternas loggar skrivs ut vid fel, och `docker compose down -v` körs alltid.

### Vad som är åtgärdat

- Produktionsberoenden uppdaterade (`drizzle-orm`, `proxy-addr`, `body-parser`, `source-map-js`, `vite`).
- API-containern kör som användaren `node` (`USER node`), och npm tas bort ur slutimagen eftersom appen startas med `node`.
- Klienten använder `nginxinc/nginx-unprivileged` och kör som användaren `nginx` på port 8080. `compose.yaml` mappar `3001:8080` och `infra/azure/staging.yaml` har `targetPort: 8080`.
- Basimages uppdateras med `apk upgrade` vid bygget.
- nginx skickar säkerhetsheaders i alla `location`. Se `docs/security.md`.

### Undantag

Det som inte går att åtgärda ska skrivas in med en motivering:

- **`.trivyignore`** – ett id per rad (`CVE-…`, `GHSA-…` eller ett misconfig-id som `DS-0002`), med en kommentarrad ovanför som förklarar varför, vem som beslutade och när det ska ses över.
- **`.zap/rules.tsv`** – `<regel-id>`, `IGNORE`, `WARN` eller `FAIL`, och en motivering, avgränsade med tabbtecken.

Aktuella undantag (ZAP):

| Regel | Åtgärd | Motivering |
|---|---|---|
| 10049 Storable and Cacheable Content | `IGNORE` | Klienten serverar bara den publika appskalet och statiska filer. Användardata kommer från `/api`. |
| 10109 Modern Web Application | `IGNORE` | Informativ: ZAP noterade att sidan är en SPA. Inte en sårbarhet. |

`.trivyignore` har inga undantag. **En läckt hemlighet får aldrig ignoreras eller checkas in.** Rotera den i stället.

### Läsa ett fel

- `npm audit`: kör `npm audit --omit=dev` lokalt, och fixa med `npm update <paket>` eller en uppgradering. Kör alltid både `npm test` och `npm run test:api` efter en beroendeändring.
- Trivy: loggen visar paket, installerad version och versionen med fix. Uppdatera paketet eller basimagen. Skriv bara till `.trivyignore` om det inte går, och med motivering.
- ZAP: rapporten laddas upp som artefakten `zap_scan` i körningen. Regel-id:n slås upp på <https://www.zaproxy.org/docs/alerts/>.

Samma kontroller kan köras lokalt med Docker (`aquasec/trivy` och `ghcr.io/zaproxy/zaproxy`) innan man pushar.

### Verifiering

- En testpull request med ett avsiktligt säkerhetsfel ska få `Säkerhet` att bli rött. Länken till den pull requesten sparas för inlämningen.
- `Säkerhet` ska vara grönt på `main`.
- `curl -I` mot staging ska visa `Content-Security-Policy` och `X-Content-Type-Options: nosniff`.

## Docker images och publicering

Image-jobbet körs efter att Kvalitet, Bygg och Integration har lyckats. Det bygger Docker-images för API:t (`api/Dockerfile`) och klienten (`client/Dockerfile`).

- **Pull request:** Båda images byggs för att verifiera att Docker-byggena fungerar. De publiceras inte till GitHub Container Registry (GHCR).
- **Push till `main`:** Båda images publiceras till GHCR.
- **Taggar:** Images taggas med `sha-` följt av en kort commit-SHA, till exempel `sha-a1b2c3d`.
- **Behörigheter:** Endast Image-jobbet får `packages: write`, vilket begränsar publiceringsbehörigheten till det jobb som behöver den.

Images publiceras som:

- `ghcr.io/mariamagdalenarios/hasta-la-vue-lta-api`
- `ghcr.io/mariamagdalenarios/hasta-la-vue-lta-client`

## Deploy till Azure staging

Deploy-jobbet är det sista jobbet i GitHub Actions-pipelinen.

### När körs jobbet?

- **Pull request:** Deploy hoppas över. Ingen Azure-deployment görs.
- **Push till `main`:** Deploy körs efter att Kvalitet, Bygg, Integration och Image har lyckats.

Jobbet använder GitHub Environment `azure-staging`.

### Beroenden

Deploy väntar på att följande jobb ska lyckas:

- Kvalitet
- Bygg
- Integration
- Image

### Autentisering och säkerhet

GitHub Actions autentiserar mot Azure med OpenID Connect (OIDC).

Azure-identitetsinformationen konfigureras som variabler i GitHub Environment `azure-staging`:

- `AZURE_APP`
- `AZURE_CLIENT_ID`
- `AZURE_RG`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TENANT_ID`
- `AZURE_URL`

Workflow-jobbet använder `id-token: write` för att hämta en OIDC-token.

Inga Azure-credentials eller hemliga värden ska lagras direkt i workflow-filen eller som GitHub Secrets.

### Deployment

Deploy-jobbet använder API- och klientimages som byggts och publicerats av Image-jobbet för samma commit.

Images identifieras med commitens SHA-tag, så att den version som testats också är den version som distribueras.

Efter deployment kontrollerar jobbet:

1. Vänta tills `/api/health` svarar och bekräftar rätt commit-SHA.
2. Göra ett GraphQL-smoketest via klienten.
3. Kontrollera att GraphQL returnerar databasdata.

### Deploymentresultat

Deploy-jobbet dokumenterar körning, körtid, commit-SHA, Azure revision
och resultat från health check och GraphQL-smoketest.

### Verifierat deploymentresultat

| Uppgift | Resultat |
|---|---|
| Pull request-körning (Deploy hoppad över) | [Körning 42472517139](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/42472517139) (PR #136) |
| Körning efter merge till `main` | [Körning 42481383490](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/42481383490) |
| Deploy-jobbets körtid | 1 min |
| Bekräftad commit-SHA | `b844d49c00ebb419fd7cedba612685a4f3b4aa01` |
| Azure Container App revision | `hasta-la-vue-lta-staging--0000015` |
| Health check | HTTP 200, rätt commit-SHA, PostgreSQL och MongoDB OK |
| GraphQL-smoketest | `{ guides { slug } }` returnerade 40 guider |

**Status:** Deploymenten till Azure staging är verifierad efter merge till `main`.

## Deploy → Azure Functions

Deploy → Azure Functions är det sjätte jobbet i pipelinen (Kvalitet, Bygg, Integration, Image, Deploy Azure staging och detta). Det lägger upp koden i `functions/` i den befintliga function appen (Flex Consumption, Node 22). Function appen skapas inte av pipelinen utan av `infra/azure/skapa-funktion.sh`.

### När körs jobbet?

- **Pull request:** jobbet hoppas över (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`).
- **Push till `main`:** jobbet körs så fort Kvalitet har lyckats.

### Position i pipelinen

Jobbet har `needs: [quality]`, alltså bara Kvalitet. Det väntar inte på Bygg, Integration eller Image, eftersom funktionen är ett självbärande paket utan Docker-image och databas.

### Autentisering och hemligheter

- Jobbet använder GitHub Environment `azure-staging` och `id-token: write`.
- Det återanvänder samma passwordless Azure-identitet (OIDC, federated credential) som Deploy Azure staging från M6: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Ingen ny identitet, inga secrets.
- Den enda nya variabeln är `AZURE_FUNCTION_APP` (function appens namn), som sätts i miljön `azure-staging`.
- Funktionsnyckeln hämtas under körningen med `az functionapp keys list`, maskas direkt med `::add-mask::` och lagras aldrig i en fil eller som secret i repot.

### Steg

1. `npm ci --omit=dev` i `functions/` (deploypaketet ska ha med `node_modules`).
2. Inloggning till Azure med OIDC.
3. Deploy med `Azure/functions-action@v1` (`sku: flexconsumption`).
4. Hämta och maska funktionsnyckeln.
5. Smoke test: ett POST-anrop till `/api/process-image` med `x-functions-key`. Jobbet kontrollerar att svaret innehåller exakt fyra bildvarianter. Anropet har `--max-time 120` och upprepas upp till sex gånger, så att funktionens kallstart och en nyligen genomförd deploy hinner bli klara.

### Uppmätt körtid

Den första lyckade körningen på `main` (GitHub Actions run [43260305495](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/43260305495)) tog **48 sekunder** för jobbet `Deploy → Azure Functions`. Hela workflowen tog **4 minuter och 26 sekunder**. Jobbtiden inkluderar installation av beroenden, Azure-inloggning med OIDC, deploy, hämtning och maskning av funktionsnyckeln samt smoke test.

### Två oberoende deployjobb

Deploy Azure staging (container-apparna) och Deploy → Azure Functions är oberoende av varandra:

| | Deploy Azure staging | Deploy → Azure Functions |
|---|---|---|
| Deployar | API- och klientimages till Container Apps | Koden i `functions/` till Azure Functions |
| Väntar på | Kvalitet, Bygg, Integration, Image | Kvalitet |
| Verifiering | `/api/health` och GraphQL-smoketest | Smoke test av `process-image` (fyra varianter) |

De körs parallellt, delar ingen artefakt och kan lyckas eller misslyckas var för sig. Om det ena jobbet går rött påverkar det inte det andra.

### Verifierat resultat

| Körning | Resultat |
|---|---|
| Pull request #148 | [Körning 43258867241](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/43258867241) – CI lyckades. Deploy-jobben hoppades över enligt villkoret för `push` till `main`. |
| Efter merge till `main` | [Körning 43260305495](https://github.com/MariaMagdalenaRios/Hasta-la-vue-lta/actions/runs/43260305495) – alla sex jobb lyckades, inklusive Deploy → Azure Functions och dess smoke test. |
