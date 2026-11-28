// Mätskriptet för M10: Lighthouse mot tre sidor i den KÖRANDE appen (imagen bakom nginx, inte dev-servern).
//
//   npm run perf              mät startsidan, en guide och en tur – skriv ut tabellen
//   npm run perf -- --fore    …och spara mätningen som före-värde (perf-fore.json)
//   npm run perf -- --runs 3  tre körningar per sida, medianen räknas (det pipelinen gör)
//
// Finns perf-fore.json jämförs varje ny mätning med den: förbättring i procent per siffra.
// Adressen är http://localhost:3001 (docker compose up) om inte PERF_URL säger annat.
//
// Lighthouse mäter som en mobil på långsamt 4G: nedbantad processor och 1,6 Mbit/s. Siffrorna är
// en modell, inte en stoppklocka – jämför dem med varandra, inte med vad ni ser på er egen dator.
// Vikterna (kB) blir desamma varje gång. Tiderna (LCP) och hoppen (CLS) gör det inte: en bildtung
// sida kan ge 3 s i en körning och 8 s i nästa. Kör --runs 3 när en tid ska gå att lita på.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const LHCI = '@lhci/cli@0.16.1'
const BASE = (process.env.PERF_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const args = process.argv.slice(2)
const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 1
const saveBefore = args.includes('--fore')
const BEFORE_FILE = 'perf-fore.json'

// Direkt efter docker compose up seedar API:et databasen och svarar inte än (nginx ger 502).
// Vänta tills /api/health säger ok – högst en minut.
const waitForApi = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const ok = await fetch(`${BASE}/api/health`)
      .then((res) => res.ok)
      .catch(() => false)
    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('/api/health svarar inte')
}

// Guidernas sluggar slumpas av seeden – fråga API:et vilken guide som ligger först.
// Har ert API ingen popularGuides: byt frågan här, eller skriv guidens adress direkt i pages nedan.
const firstGuideSlug = async () => {
  const res = await fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ guides { slug } }' }),
  })
  const body = await res.json().catch(() => ({}))
  const slug = body.data?.guides?.[0]?.slug
  if (!slug) {
    throw new Error(
      body.errors?.[0]?.message ?? `${BASE}/graphql svarade ${res.status} utan guider – är databasen seedad?`,
    )
  }
  return slug
}

// De tre sidorna som mäts. Har er app andra adresser är det här listan ni ändrar.
let pages
try {
  await waitForApi()
  pages = [
    { name: 'Startsidan', path: '/' },
    { name: 'En guide', path: `/guider/${await firstGuideSlug()}` },
    { name: 'Guidelistan', path: '/guides' },
  ]
} catch (err) {
  console.error(`Kan inte mäta ${BASE}: ${err.cause?.code ?? err.message}`)
  console.error('Kör appen? Starta den med  docker compose up -d --build --wait  och försök igen.')
  console.error('Svarar appen men inte frågan: se kommentaren vid firstGuideSlug i scripts/perf.mjs.')
  process.exit(1)
}

console.log(`Mäter ${pages.length} sidor på ${BASE}, ${runs} körning${runs > 1 ? 'ar' : ''} per sida …`)
execFileSync(
  'npx',
  ['--yes', LHCI, 'collect', `--numberOfRuns=${runs}`, ...pages.map((p) => `--url=${BASE}${p.path}`)],
  { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' },
)

// Varje körning ligger som en lhr-*.json i .lighthouseci/. Storlekarna räknas ur listan över
// nätverksanrop: transferSize är det som gick över nätet (komprimerat, om servern komprimerar).
const reports = readdirSync('.lighthouseci')
  .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`.lighthouseci/${f}`, 'utf8')))

const kb = (bytes) => Math.round(bytes / 1024)
const measure = (lhr) => {
  const requests = lhr.audits['network-requests'].details.items
  const sum = (type) =>
    requests.filter((r) => !type || r.resourceType === type).reduce((n, r) => n + (r.transferSize ?? 0), 0)
  return {
    lcp: Math.round(lhr.audits['largest-contentful-paint'].numericValue / 100) / 10, // sekunder
    cls: Math.round(lhr.audits['cumulative-layout-shift'].numericValue * 100) / 100,
    js: kb(sum('Script')),
    images: kb(sum('Image')),
    total: kb(sum()),
  }
}

const result = {}
for (const page of pages) {
  const own = reports.filter((lhr) => new URL(lhr.requestedUrl).pathname === page.path).map(measure)
  if (!own.length) throw new Error(`Ingen mätning för ${page.path} – se felet från Lighthouse ovan`)
  own.sort((a, b) => a.lcp - b.lcp)
  result[page.name] = own[Math.floor(own.length / 2)] // medianen efter LCP
}

const before = !saveBefore && existsSync(BEFORE_FILE) ? JSON.parse(readFileSync(BEFORE_FILE, 'utf8')) : null
const pct = (was, now) => (was > 0 ? Math.round(((was - now) / was) * 100) : 0)
const cell = (name, key, unit) => {
  const now = result[name][key]
  const text = `${String(now).replace('.', ',')}${unit}`
  if (!before?.[name]) return text
  const change = pct(before[name][key], now)
  return key === 'cls' || change === 0 ? text : `${text} (${change > 0 ? '−' : '+'}${Math.abs(change)} %)`
}

console.log('')
console.log('| Sida | LCP | CLS | JavaScript | Bilder | Totalt |')
console.log('|---|---|---|---|---|---|')
for (const { name } of pages) {
  console.log(
    `| ${name} | ${cell(name, 'lcp', ' s')} | ${cell(name, 'cls', '')} | ${cell(name, 'js', ' kB')} | ${cell(name, 'images', ' kB')} | ${cell(name, 'total', ' kB')} |`,
  )
}
console.log('')

if (saveBefore) {
  writeFileSync(BEFORE_FILE, JSON.stringify(result, null, 2) + '\n')
  console.log(`Sparat som före-värde i ${BEFORE_FILE}. Committa filen: det är den varje ny mätning jämförs med.`)
} else if (before) {
  // Summan: förbättringen i procent på JavaScript och totalvikt, över sidorna. Bara vikterna räknas –
  // byte över nätet är samma i varje körning, medan LCP och CLS kan skilja mycket mellan två
  // körningar av samma kod. Läs tiderna som storleksordningar, och mät om innan ni tror på en.
  let points = 0
  for (const { name } of pages) {
    if (!before[name]) continue
    for (const key of ['js', 'total']) points += Math.max(0, pct(before[name][key], result[name][key]))
  }
  console.log(`Förbättring mot ${BEFORE_FILE}: ${points} poäng (procenten på JavaScript och totalvikt, summerade över sidorna).`)
} else {
  console.log(`Ingen ${BEFORE_FILE} ännu – kör  npm run perf -- --fore  för att spara ett före-värde.`)
}
