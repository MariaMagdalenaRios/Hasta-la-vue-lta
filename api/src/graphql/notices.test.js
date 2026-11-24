import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Set before config.js is imported, so tokens can be signed without a .env file.
vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'test-secret';
});

// No Contentful and no database: both are replaced with fakes.
vi.mock('../cms/contentful.js', () => ({
  publishedNotices: vi.fn(),
  previewNotices: vi.fn(),
  cmsConfigured: () => false,
  clearCmsCache: () => {},
}));
vi.mock('../db/client.js', () => ({ pool: { query: vi.fn() } }));

const { config } = await import('../config.js');
const { yoga } = await import('./server.js');
const { publishedNotices, previewNotices } = await import('../cms/contentful.js');
const { pool } = await import('../db/client.js');

const published = {
  id: 'n1',
  title: 'Trail closed',
  level: 'warning',
  body: [{ runs: [{ text: 'Closed until May', bold: true, italic: false, href: null }] }],
  guideSlug: 'kungsleden',
  status: 'published',
};
const draft = { ...published, id: 'n2', title: 'Draft notice', guideSlug: null, status: 'draft' };

const gql = async (query, token) => {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  return response.json();
};

const tokenFor = (role) =>
  jwt.sign({ id: 1, email: `${role}@example.com`, role }, config.jwtSecret, { algorithm: 'HS256' });

const NOTICES = '{ notices { id title level status body { runs { text bold italic href } } } }';
const PREVIEW = '{ notices(preview: true) { id title status } }';

beforeEach(() => {
  vi.clearAllMocks();
  publishedNotices.mockResolvedValue([published]);
  previewNotices.mockResolvedValue([published, draft]);
});

describe('notices (published)', () => {
  it('returns published notices without login', async () => {
    const result = await gql(NOTICES);
    expect(result.errors).toBeUndefined();
    expect(result.data.notices).toEqual([
      {
        id: 'n1',
        title: 'Trail closed',
        level: 'warning',
        status: 'published',
        body: published.body,
      },
    ]);
    expect(previewNotices).not.toHaveBeenCalled();
  });

  it('returns an empty list when the CMS is not configured', async () => {
    publishedNotices.mockResolvedValue([]);
    const result = await gql(NOTICES);
    expect(result.errors).toBeUndefined();
    expect(result.data.notices).toEqual([]);
  });
});

describe('notices(preview: true)', () => {
  it('rejects anonymous users', async () => {
    const result = await gql(PREVIEW);
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(previewNotices).not.toHaveBeenCalled();
  });

  it('rejects users without the editor role', async () => {
    const result = await gql(PREVIEW, tokenFor('user'));
    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(previewNotices).not.toHaveBeenCalled();
  });

  it('returns drafts to editors', async () => {
    const result = await gql(PREVIEW, tokenFor('editor'));
    expect(result.errors).toBeUndefined();
    expect(result.data.notices.map((n) => n.status)).toEqual(['published', 'draft']);
  });
});

describe('Guide.notices', () => {
  it('returns only the notices for that guide', async () => {
    publishedNotices.mockResolvedValue([published, { ...published, id: 'n3', guideSlug: 'other' }]);
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 1,
          slug: 'kungsleden',
          title: 'Kungsleden',
          region: 'Lappland',
          difficulty: 'hard',
          length_km: '440',
          body_html: '',
          hero_image: null,
          published: true,
          updated_at: '2026-01-01',
        },
      ],
    });
    const result = await gql('{ guide(slug: "kungsleden") { slug notices { id } } }');
    expect(result.errors).toBeUndefined();
    expect(result.data.guide.notices).toEqual([{ id: 'n1' }]);
  });
});
