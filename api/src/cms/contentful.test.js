import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { config } from '../config.js';
import { toParagraphs, publishedNotices, previewNotices, guideBySlug, clearCmsCache } from './contentful.js';

// Enhetstester för CMS-lagret (M9). Contentful anropas aldrig: fetch byts mot en funktion som
// svarar med det Contentful skulle ha svarat. Så går testerna i pipelinen utan nycklar och
// utan nät – och vi testar VÅR kod (omformningen, cachen, felhanteringen), inte deras tjänst.
const text = (value, marks = []) => ({ nodeType: 'text', value, marks: marks.map((type) => ({ type })), data: {} });
const paragraph = (...content) => ({ nodeType: 'paragraph', data: {}, content });
const document = (...content) => ({ nodeType: 'document', data: {}, content });
const entry = (id, fields) => ({ sys: { id, updatedAt: '2026-11-18T08:00:00Z' }, fields });

const avstangd = entry('n1', {
  rubrik: 'Leden är avstängd',
  niva: 'varning',
  guideSlug: 'norra-myrleden-7',
  text: document(paragraph(text('Bron vid '), text('Storforsen', ['bold']), text(' lagas.'))),
});
const valkommen = entry('n2', { rubrik: 'Välkommen', niva: 'info', text: document(paragraph(text('Hej!'))) });

// Svarar som Contentful: { items: [...] }. svar kan vara en lista eller en funktion av adressen.
const fakeContentful = (svar) =>
  vi.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ items: typeof svar === 'function' ? svar(String(url)) : svar }),
  }));

beforeEach(() => {
  Object.assign(config, { cmsSpaceId: 'space1', cmsDeliveryToken: 'delivery-nyckel', cmsPreviewToken: 'preview-nyckel' });
  clearCmsCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rich text → stycken av textbitar', () => {
  it('ett stycke med fet text blir textbitar med märken', () => {
    expect(toParagraphs(avstangd.fields.text)).toEqual([
      {
        runs: [
          { text: 'Bron vid ', bold: false, italic: false, href: null },
          { text: 'Storforsen', bold: true, italic: false, href: null },
          { text: ' lagas.', bold: false, italic: false, href: null },
        ],
      },
    ]);
  });

  it('en länk blir en textbit med href – men bara till http(s) eller en sida hos oss', () => {
    const lank = (uri) => ({ nodeType: 'hyperlink', data: { uri }, content: [text('läs mer')] });
    const hrefs = toParagraphs(
      document(paragraph(lank('https://utpost.se/leder'), lank('/guider/norra-myrleden-7'), lank('javascript:alert(1)'))),
    )[0].runs.map((run) => run.href);
    expect(hrefs).toEqual(['https://utpost.se/leder', '/guider/norra-myrleden-7', null]);
  });

  it('blocktyper vi inte renderar hoppas över, och ett tomt fält ger inga stycken', () => {
    const rubrik = { nodeType: 'heading-2', data: {}, content: [text('Rubrik')] };
    expect(toParagraphs(document(rubrik, paragraph(text('Stycke'))))).toHaveLength(1);
    expect(toParagraphs(undefined)).toEqual([]);
  });
});

describe('publicerade notiser', () => {
  it('hämtas från delivery-API:et med nyckeln i en header, och formas om till schemat', async () => {
    const fetch = fakeContentful([avstangd, valkommen]);
    vi.stubGlobal('fetch', fetch);

    const notices = await publishedNotices();

    expect(notices.map((n) => [n.id, n.title, n.level, n.guideSlug, n.status])).toEqual([
      ['n1', 'Leden är avstängd', 'varning', 'norra-myrleden-7', 'published'],
      ['n2', 'Välkommen', 'info', null, 'published'],
    ]);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('https://cdn.contentful.com/spaces/space1/environments/master/entries?content_type=notis');
    expect(url).not.toContain('delivery-nyckel');
    expect(options.headers.Authorization).toBe('Bearer delivery-nyckel');
  });

  it('cachas: två frågor i rad kostar ett anrop till Contentful', async () => {
    const fetch = fakeContentful([valkommen]);
    vi.stubGlobal('fetch', fetch);
    await publishedNotices();
    await publishedNotices();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('40 frågor på samma gång med kall cache delar på ett anrop (en lista med guider och deras notiser)', async () => {
    const fetch = fakeContentful([avstangd]);
    vi.stubGlobal('fetch', fetch);
    const svar = await Promise.all(Array.from({ length: 40 }, () => publishedNotices()));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(svar.every((notices) => notices.length === 1)).toBe(true);
  });

  it('är CMS:et nere svarar vi med det senast hämtade, eller en tom lista – aldrig ett fel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const nere = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    vi.stubGlobal('fetch', nere);
    expect(await publishedNotices()).toEqual([]);

    vi.stubGlobal('fetch', fakeContentful([valkommen]));
    expect(await publishedNotices()).toHaveLength(1);
    config.cmsCacheSeconds = 0; // cachen har gått ut …
    vi.stubGlobal('fetch', nere);
    expect(await publishedNotices()).toHaveLength(1); // … men det gamla svaret är bättre än inget
    config.cmsCacheSeconds = 60;
  });

  it('utan space och nyckel är CMS:et avstängt: tom lista, inget anrop', async () => {
    Object.assign(config, { cmsSpaceId: '', cmsDeliveryToken: '' });
    const fetch = fakeContentful([valkommen]);
    vi.stubGlobal('fetch', fetch);
    expect(await publishedNotices()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('förhandsgranskningen', () => {
  it('utan konfigurerat CMS returnerar en tom lista utan anrop', async () => {
    Object.assign(config, { cmsSpaceId: '', cmsDeliveryToken: '', cmsPreviewToken: '' });
    const fetch = fakeContentful([]);
    vi.stubGlobal('fetch', fetch);

    expect(await previewNotices()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('utan preview-nyckel returnerar en tom lista utan anrop', async () => {
    config.cmsPreviewToken = '';
    const fetch = fakeContentful([]);
    vi.stubGlobal('fetch', fetch);

    expect(await previewNotices()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hämtar från preview-API:et med preview-nyckeln och säger vad som är utkast och vad som är ändrat', async () => {
    const utkast = entry('n3', { rubrik: 'Ny led i vår', niva: 'info' }); // aldrig publicerad, och utan text än
    const andrad = entry('n2', { ...valkommen.fields, rubrik: 'Välkommen tillbaka' }); // publicerad, sedan ändrad
    const fetch = fakeContentful((url) => (url.startsWith('https://preview.contentful.com') ? [avstangd, andrad, utkast] : [avstangd, valkommen]));
    vi.stubGlobal('fetch', fetch);

    const notices = await previewNotices();

    expect(notices.map((n) => [n.id, n.status])).toEqual([
      ['n1', 'published'],
      ['n2', 'changed'],
      ['n3', 'draft'],
    ]);
    expect(notices[2].body).toEqual([]);
    const preview = fetch.mock.calls.find(([url]) => url.startsWith('https://preview.contentful.com'));
    expect(preview[1].headers.Authorization).toBe('Bearer preview-nyckel');
  });
});

describe('en guide hämtad med slug', () => {
  const heading = (nodeType, value) => ({ nodeType, data: {}, content: [text(value)] });
  const listItem = (...content) => ({ nodeType: 'list-item', data: {}, content: [paragraph(...content)] });
  const list = (...items) => ({ nodeType: 'unordered-list', data: {}, content: items });
  const link = (uri, value) => ({ nodeType: 'hyperlink', data: { uri }, content: [text(value)] });

  const hallstigen = {
    sys: { id: 'guide-stora-hallstigen-1', updatedAt: '2026-11-24T20:45:00Z' },
    fields: {
      title: 'Stora Hällstigen 1',
      slug: 'stora-hallstigen-1',
      region: 'Jämtland',
      difficulty: 'medel',
      lengthKm: 12.5,
      heroImage: { sys: { type: 'Link', linkType: 'Asset', id: 'bild1' } },
      body: document(
        heading('heading-2', 'Om leden'),
        paragraph(text('En '), text('lugn', ['italic']), text(' led med '), text('fin', ['bold']), text(' utsikt.')),
        heading('heading-3', 'Hitta hit'),
        list(listItem(text('Buss 120')), listItem(link('https://utpost.se/buss', 'tidtabell')), listItem(link('javascript:alert(1)', 'klicka'))),
      ),
    },
  };
  const bild = { sys: { id: 'bild1' }, fields: { file: { url: '//images.ctfassets.net/space1/bild1/hall.jpg' } } };

  // Svarar som Contentful med include: { items, total, includes: { Asset } }.
  const fakeGuide = (items, assets = []) =>
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items, total: items.length, includes: { Asset: assets } }),
    }));
  const guideNr = (n) => ({ sys: { id: `guide-${n}` }, fields: { title: `Guide ${n}`, slug: `guide-${n}` } });

  it('frågar delivery-API:et efter alla guider i ett anrop, med bilderna inkluderade', async () => {
    const fetch = fakeGuide([hallstigen], [bild]);
    vi.stubGlobal('fetch', fetch);

    await guideBySlug('stora-hallstigen-1');

    const [url, options] = fetch.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(url).toContain('https://cdn.contentful.com/spaces/space1/environments/master/entries');
    expect(params.get('content_type')).toBe('guide');
    expect(params.get('fields.slug')).toBeNull();
    expect(params.get('limit')).toBe('100');
    expect(params.get('skip')).toBe('0');
    expect(params.get('include')).toBe('1');
    expect(url).not.toContain('delivery-nyckel');
    expect(options.headers.Authorization).toBe('Bearer delivery-nyckel');
  });

  it('formas om till schemat: fälten, bildens https-adress och ett utdrag', async () => {
    vi.stubGlobal('fetch', fakeGuide([hallstigen], [bild]));

    const guide = await guideBySlug('stora-hallstigen-1');

    expect(guide).toMatchObject({
      id: 'guide-stora-hallstigen-1',
      slug: 'stora-hallstigen-1',
      title: 'Stora Hällstigen 1',
      region: 'Jämtland',
      difficulty: 'medel',
      lengthKm: 12.5,
      heroImage: 'https://images.ctfassets.net/space1/bild1/hall.jpg',
      updatedAt: '2026-11-24T20:45:00Z',
    });
    expect(guide.excerpt).toBe('Om leden En lugn led med fin utsikt. Hitta hit Buss 120 tidtabell klicka');
  });

  it('brödtexten blir block: rubriker, stycken med fet och kursiv text, och listor med säkra länkar', async () => {
    vi.stubGlobal('fetch', fakeGuide([hallstigen], [bild]));

    const { body } = await guideBySlug('stora-hallstigen-1');

    expect(body.map((block) => block.type)).toEqual(['heading-2', 'paragraph', 'heading-3', 'unordered-list']);
    expect(body[0].runs).toEqual([{ text: 'Om leden', bold: false, italic: false, href: null }]);
    expect(body[1].runs.map((run) => [run.text, run.bold, run.italic])).toEqual([
      ['En ', false, false],
      ['lugn', false, true],
      [' led med ', false, false],
      ['fin', true, false],
      [' utsikt.', false, false],
    ]);
    expect(body[3].items.map((item) => item.runs[0].href)).toEqual([null, 'https://utpost.se/buss', null]);
  });

  it('en slug som inte finns ger null', async () => {
    vi.stubGlobal('fetch', fakeGuide([]));
    expect(await guideBySlug('finns-inte')).toBeNull();
  });

  it('en post utan fält (ett tomt utkast) hoppas över och stör inte de andra guiderna', async () => {
    vi.stubGlobal('fetch', fakeGuide([{ sys: { id: 'tom' } }, hallstigen], [bild]));

    expect(await guideBySlug('')).toBeNull();
    expect((await guideBySlug('stora-hallstigen-1')).title).toBe('Stora Hällstigen 1');
  });

  it('en lista med 40 guider och kall cache kostar ETT anrop till Contentful, inte 40', async () => {
    const fetch = fakeGuide(Array.from({ length: 40 }, (_, i) => guideNr(i + 1)));
    vi.stubGlobal('fetch', fetch);

    const guides = await Promise.all(Array.from({ length: 40 }, (_, i) => guideBySlug(`guide-${i + 1}`)));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(guides.map((guide) => guide.title)).toEqual(Array.from({ length: 40 }, (_, i) => `Guide ${i + 1}`));
  });

  it('fler än 100 guider hämtas sida för sida med skip', async () => {
    const all = Array.from({ length: 150 }, (_, i) => guideNr(i + 1));
    const fetch = vi.fn(async (url) => {
      const skip = Number(new URL(url).searchParams.get('skip'));
      return { ok: true, status: 200, json: async () => ({ items: all.slice(skip, skip + 100), total: all.length }) };
    });
    vi.stubGlobal('fetch', fetch);

    expect((await guideBySlug('guide-150')).title).toBe('Guide 150');
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('skip'))).toEqual(['0', '100']);
  });

  it('cachas: två frågor i rad, eller samtidigt, kostar ett anrop till Contentful', async () => {
    const fetch = fakeGuide([hallstigen], [bild]);
    vi.stubGlobal('fetch', fetch);

    await Promise.all([guideBySlug('stora-hallstigen-1'), guideBySlug('stora-hallstigen-1')]);
    await guideBySlug('stora-hallstigen-1');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('är CMS:et nere svarar vi med den senast hämtade guiden, eller null – aldrig ett fel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const nere = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    vi.stubGlobal('fetch', nere);
    expect(await guideBySlug('stora-hallstigen-1')).toBeNull();

    clearCmsCache();
    vi.stubGlobal('fetch', fakeGuide([hallstigen], [bild]));
    expect((await guideBySlug('stora-hallstigen-1')).title).toBe('Stora Hällstigen 1');
    config.cmsCacheSeconds = 0; // cachen har gått ut …
    vi.stubGlobal('fetch', nere);
    expect((await guideBySlug('stora-hallstigen-1')).title).toBe('Stora Hällstigen 1'); // … men det gamla svaret gäller
    config.cmsCacheSeconds = 60;
  });

  it('utan space och nyckel är CMS:et avstängt: null, inget anrop', async () => {
    Object.assign(config, { cmsSpaceId: '', cmsDeliveryToken: '' });
    const fetch = fakeGuide([hallstigen]);
    vi.stubGlobal('fetch', fetch);
    expect(await guideBySlug('stora-hallstigen-1')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
