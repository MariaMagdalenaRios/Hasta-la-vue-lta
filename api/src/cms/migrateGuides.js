// Copies guides from Postgres to the `guide` content type in Contentful (M9, #161).
// Safe to run many times: a guide is found by its slug, then created, updated or left alone.
// Nothing here reads or writes the Postgres rows. The mapping is in docs/decisions/cms.md.
import { htmlToRichText } from './htmlToRichText.js';

const CONTENT_TYPE = 'guide';
const CMA_TYPE = 'application/vnd.contentful.management.v1+json';
// The write limit is 7 requests per second. One request per 150 ms is 6.7 per second, and it
// is applied to reads as well, which keeps the code simple and the margin safe.
const MIN_GAP_MS = 150;
const MAX_RETRIES = 5;

export const entryId = (slug) => `guide-${slug}`;

const localized = (fields, locale) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { [locale]: value }]));

// heroImage is left out on purpose: the image files are not available (decided in #161).
export const guideFields = (row, locale) => {
  const { document, warnings } = htmlToRichText(row.body_html);
  const fields = localized(
    {
      title: row.title,
      slug: row.slug,
      region: row.region,
      difficulty: row.difficulty,
      lengthKm: row.length_km,
      body: document,
    },
    locale,
  );
  return { fields, warnings };
};

// Contentful may return object keys in another order, so compare with sorted keys.
const stable = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
const sameFields = (existing, wanted) => Object.keys(wanted).every((key) => stable(existing?.[key]) === stable(wanted[key]));

// Published and nothing changed since: Contentful counts publishing as one version.
const isUpToDate = (entry) => entry.sys.publishedVersion !== undefined && entry.sys.publishedVersion === entry.sys.version - 1;

// `client` has four methods (see createClient), which also makes this easy to test.
export async function syncGuide(row, client, locale) {
  const { fields, warnings } = guideFields(row, locale);
  const found = await client.findBySlug(row.slug);

  let entry = found;
  let action = 'unchanged';
  if (!found) {
    entry = await client.putEntry(entryId(row.slug), null, fields);
    action = 'created';
  } else if (!sameFields(found.fields, fields)) {
    // Keep fields we do not manage (for example a heroImage an editor added in Contentful).
    entry = await client.putEntry(found.sys.id, found.sys.version, { ...found.fields, ...fields });
    action = 'updated';
  }

  let publish = 'none';
  if (row.published && !isUpToDate(entry)) {
    await client.publish(entry.sys.id, entry.sys.version);
    publish = 'published';
  } else if (!row.published && entry.sys.publishedVersion !== undefined) {
    await client.unpublish(entry.sys.id, entry.sys.version);
    publish = 'unpublished';
  }
  return { slug: row.slug, action, publish, warnings };
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Contentful Management API over fetch: throttled to the write limit, retries 429 responses.
export function createClient({ spaceId, environment, token, dryRun = false, fetchFn = fetch, sleep = realSleep, log = console.log }) {
  const base = `https://api.contentful.com/spaces/${spaceId}/environments/${environment}`;
  let lastRequest = 0;

  const request = async (method, path, { body, headers } = {}) => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastRequest + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequest = Date.now();

      const response = await fetchFn(base + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': CMA_TYPE, ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const seconds = Number(response.headers.get('x-contentful-ratelimit-reset')) || 1;
        log(`  rate limited (429): waiting ${seconds}s, retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(seconds * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`Contentful ${method} ${path}: ${response.status} ${(await response.text()).slice(0, 300)}`);
      return response.status === 204 ? null : response.json();
    }
  };

  // In a dry run only reads are sent. A write logs what it would do and answers like Contentful.
  const write = async (method, path, options = {}) => {
    if (!dryRun) return request(method, path, options);
    log(`  [dry run] ${method} ${path}`);
    const version = Number(options.headers?.['X-Contentful-Version'] ?? 0);
    return { sys: { id: path.split('/')[2], version: version + 1 }, fields: options.body?.fields };
  };
  const versioned = (version) => (version === null ? {} : { 'X-Contentful-Version': String(version) });

  return {
    async defaultLocale() {
      const { items } = await request('GET', '/locales');
      return items.find((locale) => locale.default).code;
    },
    async findBySlug(slug) {
      const { items } = await request('GET', `/entries?content_type=${CONTENT_TYPE}&fields.slug=${encodeURIComponent(slug)}&limit=1`);
      return items[0] ?? null;
    },
    putEntry: (id, version, fields) =>
      write('PUT', `/entries/${id}`, { body: { fields }, headers: { 'X-Contentful-Content-Type': CONTENT_TYPE, ...versioned(version) } }),
    publish: (id, version) => write('PUT', `/entries/${id}/published`, { headers: versioned(version) }),
    unpublish: (id, version) => write('DELETE', `/entries/${id}/published`, { headers: versioned(version) }),
  };
}
