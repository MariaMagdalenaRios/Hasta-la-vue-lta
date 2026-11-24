import { describe, it, expect, vi } from 'vitest';
import { syncGuide, createClient, entryId } from './migrateGuides.js';

const LOCALE = 'en-US';
const row = (overrides = {}) => ({
  slug: 'norra-myrleden-7',
  title: 'Norra Myrleden 7',
  region: 'Dalarna',
  difficulty: 'lätt',
  length_km: 12.5,
  body_html: '<h2>Om leden</h2><p>Fin led.</p>',
  published: true,
  ...overrides,
});

// A small in-memory Contentful: same versioning rules, counts every write.
const fakeContentful = () => {
  const entries = new Map();
  const state = { writes: 0 };
  return {
    entries,
    state,
    findBySlug: async (slug) => {
      const entry = [...entries.values()].find((e) => e.fields.slug?.[LOCALE] === slug);
      return entry ? structuredClone(entry) : null;
    },
    putEntry: async (id, version, fields) => {
      const existing = entries.get(id);
      if (version === null && existing) throw new Error('409: already exists');
      if (version !== null && existing?.sys.version !== version) throw new Error('409: version mismatch');
      state.writes += 1;
      const entry = { sys: { id, version: (existing?.sys.version ?? 0) + 1, publishedVersion: existing?.sys.publishedVersion }, fields };
      entries.set(id, entry);
      return structuredClone(entry);
    },
    publish: async (id, version) => {
      const entry = entries.get(id);
      if (entry.sys.version !== version) throw new Error('409: version mismatch');
      state.writes += 1;
      entry.sys.publishedVersion = version;
      entry.sys.version += 1;
    },
    unpublish: async (id, version) => {
      const entry = entries.get(id);
      if (entry.sys.version !== version) throw new Error('409: version mismatch');
      state.writes += 1;
      delete entry.sys.publishedVersion;
      entry.sys.version += 1;
    },
  };
};

describe('syncGuide', () => {
  it('creates a published guide, and a draft for an unpublished one', async () => {
    const cms = fakeContentful();
    const a = await syncGuide(row(), cms, LOCALE);
    const b = await syncGuide(row({ slug: 'lilla-hallstigen-2', published: false }), cms, LOCALE);

    expect(a).toMatchObject({ action: 'created', publish: 'published' });
    expect(b).toMatchObject({ action: 'created', publish: 'none' });
    expect(cms.entries.get(entryId('norra-myrleden-7')).sys.publishedVersion).toBeDefined();
    expect(cms.entries.get(entryId('lilla-hallstigen-2')).sys.publishedVersion).toBeUndefined();
  });

  it('maps the fields, and leaves heroImage out', async () => {
    const cms = fakeContentful();
    await syncGuide(row(), cms, LOCALE);
    const { fields } = cms.entries.get(entryId('norra-myrleden-7'));
    expect(Object.keys(fields).sort()).toEqual(['body', 'difficulty', 'lengthKm', 'region', 'slug', 'title']);
    expect(fields.lengthKm[LOCALE]).toBe(12.5);
    expect(fields.body[LOCALE].content[0].nodeType).toBe('heading-2');
  });

  it('writes nothing on the second run, and creates no duplicate', async () => {
    const cms = fakeContentful();
    await syncGuide(row(), cms, LOCALE);
    const writesAfterFirst = cms.state.writes;

    const second = await syncGuide(row(), cms, LOCALE);

    expect(second).toMatchObject({ action: 'unchanged', publish: 'none' });
    expect(cms.state.writes).toBe(writesAfterFirst);
    expect(cms.entries.size).toBe(1);
  });

  it('updates and republishes a changed guide, and keeps fields it does not manage', async () => {
    const cms = fakeContentful();
    await syncGuide(row(), cms, LOCALE);
    cms.entries.get(entryId('norra-myrleden-7')).fields.heroImage = { [LOCALE]: { sys: { id: 'asset-1' } } };

    const result = await syncGuide(row({ title: 'Nytt namn' }), cms, LOCALE);

    expect(result).toMatchObject({ action: 'updated', publish: 'published' });
    const { fields, sys } = cms.entries.get(entryId('norra-myrleden-7'));
    expect(fields.title[LOCALE]).toBe('Nytt namn');
    expect(fields.heroImage[LOCALE].sys.id).toBe('asset-1');
    expect(sys.publishedVersion).toBe(sys.version - 1);
  });

  it('unpublishes a guide that is unpublished in Postgres', async () => {
    const cms = fakeContentful();
    await syncGuide(row(), cms, LOCALE);

    const result = await syncGuide(row({ published: false }), cms, LOCALE);

    expect(result).toMatchObject({ action: 'unchanged', publish: 'unpublished' });
    expect(cms.entries.get(entryId('norra-myrleden-7')).sys.publishedVersion).toBeUndefined();
  });

  it('passes on warnings about HTML the content type does not allow', async () => {
    const result = await syncGuide(row({ body_html: '<p>Hej</p><table></table>' }), fakeContentful(), LOCALE);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('createClient', () => {
  const reply = (status, body = {}, headers = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const options = (fetchFn, extra = {}) => ({ spaceId: 's1', environment: 'master', token: 't', fetchFn, sleep: vi.fn(async () => {}), log: () => {}, ...extra });

  it('waits and retries after 429, using the reset header', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(reply(429, {}, { 'x-contentful-ratelimit-reset': '2' })).mockResolvedValueOnce(reply(200, { items: [{ default: true, code: 'sv' }] }));
    const opts = options(fetchFn);

    expect(await createClient(opts).defaultLocale()).toBe('sv');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(opts.sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after five retries', async () => {
    const fetchFn = vi.fn(async () => reply(429));
    await expect(createClient(options(fetchFn)).defaultLocale()).rejects.toThrow('429');
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('spaces requests at least 150 ms apart', async () => {
    const fetchFn = vi.fn(async () => reply(200, { items: [] }));
    const opts = options(fetchFn);
    const client = createClient(opts);

    await client.findBySlug('a');
    await client.findBySlug('b');

    expect(opts.sleep).toHaveBeenCalled();
    expect(opts.sleep.mock.calls[0][0]).toBeLessThanOrEqual(150);
  });

  it('sends no writes in a dry run', async () => {
    const fetchFn = vi.fn(async () => reply(200, { items: [] }));
    const client = createClient(options(fetchFn, { dryRun: true }));

    const entry = await client.putEntry('guide-x', null, {});
    await client.publish('guide-x', entry.sys.version);

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
