# Prestanda

*Skrivs i M10. Siffrorna kommer ur `npm run perf`: Lighthouse mot den körande appen, som en mobil på långsamt 4G. En mätning per rad, avrundad. Ni ska kunna säga vad ni ändrade, vilken siffra det flyttade och hur mycket – inte mäta samma sak fem gånger.*

## Före

*Klistra in tabellen från `npm run perf -- --fore`, körd innan ni ändrade något. Filen `perf-fore.json` committas.*

| Sida | LCP | CLS | JavaScript | Bilder | Totalt |
|---|---|---|---|---|---|
| Startsidan | 1,8 s | 0 | 140 kB | 0 kB | 155 kB |
| En guide | 2,1 s | 0 | 142 kB | 0 kB | 153 kB |
| Guidelistan | 2,3 s | 0 | 143 kB | 0 kB | 163 kB |

*Raderna är de som står i `perf-fore.json`. Mätt på `/`, `/guider/<första guidens slug>` och `/guides`. `/turer/1` kräver inloggning och skickar till `/login`, så guidelistan mäts i stället. Tiderna är en modell och varierar, vikterna gör det inte.*

**Vad som är LCP-elementet på startsidan:** rubriken `<h1>Hitta din nästa tur</h1>` (`div#app > div > section.hero > h1`, hämtad ur Lighthouse-rapporten). Inget annat än text, ingen bild. Innan den kan ritas måste `index.html` ha hämtats, JavaScript-bundeln (ca 140 kB) ha hämtats och körts så att Vue monterar appen, och GraphQL-frågan `Home` ha svarat: i `HomeView.vue` visas bara "Laddar…" tills `data` finns, och `<h1>` ligger först i den grenen. Servern skickar en tom `<div id="app">`, så inget av detta kan ske före JavaScriptet.

## Optimeringarna

*Minst tre. En rad per ändring, mätt direkt efter den. "Siffran" är den ni ville flytta, inte alla.*

| # | Vad vi ändrade | Siffran vi ville flytta | Före | Efter | PR |
|---|---|---|---|---|---|
| 1 | Guidebilderna i rätt storlek: WebP i 800 px på guidesidan och 400 px i korten (var JPEG 2400×1600, ~1 MB styck), `width`/`height` på bilderna | Totalvikt, startsidan | 5507 kB | 265 kB (−95 %) | [#1](https://github.com/negarbaharmand/utpost-perf-negar-malena/pull/1), `cf88fbe` |
| 2 | gzip i nginx för JS, CSS, JSON och SVG (servern skickade allt okomprimerat, ingen `Content-Encoding`) | JavaScript, alla sidor | 210 / 208 / 334 kB | 81 / 80 / 121 kB (−61–64 %) | [#1](https://github.com/negarbaharmand/utpost-perf-negar-malena/pull/1), `3b9f4c1` |
| 3 | lodash bort: `capitalize` och sorteringen i guidelistan i vanlig JS | JavaScript, startsidan och guiden | 81 / 80 kB | 55 / 54 kB | [#1](https://github.com/negarbaharmand/utpost-perf-negar-malena/pull/1), `8241b01` |

Poäng efter varje steg: 178 → 440 → 467.

## Efter

| Sida | LCP | CLS | JavaScript | Bilder | Totalt |
|---|---|---|---|---|---|
| Startsidan | 1,7 s (−37 %) | 0 | 55 kB (−74 %) | 19 kB (−100 %) | 109 kB (−98 %) |
| En guide | 1,8 s (−78 %) | 0 | 54 kB (−74 %) | 5 kB (−100 %) | 70 kB (−95 %) |
| En tur | 2,4 s (−33 %) | 0,03 | 121 kB (−64 %) | 0 kB | 132 kB (−62 %) |

Förbättring mot perf-fore.json: **467 poäng**. Alla sidor håller budgeten (`assert` avslutar med 0).

## Budgeten

Fyra gränser, som gäller varje mätt sida:

| Gräns | Värde | Nivå | Varför |
|---|---|---|---|
| `total-byte-weight` | 300 kB över nätet | error | Vikten är densamma i varje körning – över gränsen betyder att någon lagt till något tungt |
| `resource-summary:script:size` | 150 kB JavaScript | error | Samma: byte är byte, och JS ska både laddas ner och köras |
| `cumulative-layout-shift` | 0,1 | error | Ett hopp på sidan syns för alla. När orsaken är borta hamnar den långt under gränsen |
| `largest-contentful-paint` | 2,5 s | warn | Tiden är en modell som beror på maskinen jobbet får – samma kod gav 2,9 s, 3,9 s och 6,3 s. Som error skulle jobbet bli rött av slumpen |

Budgeten sa nej: [röd körning av jobbet Prestanda](https://github.com/negarbaharmand/utpost-perf-negar-malena/actions/runs/46001810357/job/140515084805) – startsidan `total-byte-weight` expected `<=300000`, found `5639280`.

Budgeten sa ja: [grön körning](https://github.com/negarbaharmand/utpost-perf-negar-malena/actions/runs/46012193257/job/140550372220) efter gzip (`3b9f4c1`) – alla sidor under gränserna.

## Det vi lät vara

- **Bara WebP, i full storlek** (`28d4d96`): bilderna konverterades till WebP men behölls i 2400 px. Det sparade ~45 % (startsidan 5,6 → 3,1 MB) men var långt över budgeten. Formatet räckte inte – det var storleken som spelade roll, och den ändringen ersattes av rad 1.
- **chart.js/auto på turen:** importerar alla diagramtyper fast höjdprofilen bara är ett linjediagram. Det är därför turen har mest JS (121 kB). Den håller ändå budgeten, så vi lät den vara.
- **`bodyHtml` i startsidans fråga:** hämtar hela texten för alla guider fast startsidan inte visar den. Med gzip är svaret litet nog, men frågan borde bara hämta de fält sidan visar.
