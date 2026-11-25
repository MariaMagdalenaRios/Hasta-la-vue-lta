import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import { config } from '../config.js';
import { publishedNotices, clearCmsCache } from '../cms/contentful.js';
import { app } from '../app.js';
import { pool } from '../db/client.js';
import { mongo } from '../db/mongo.js';
import { sign } from '../lib/auth.js';

// M8 (skuld 9): säkerhetstester mot REST-API:et, mot riktig databas – samma upplägg som
// GraphQL-testerna i graphql/server.test.js (lokalt mot compose-databaserna, i pipelinen mot
// services). Appen startas på en ledig port (0) och stängs efter testerna.
//
// Regeln från docs/testing.md: varje lagat hål har ett test som var RÖTT före fixen. Det är
// testet som bevisar hålet – inte en skärmdump – och det som hindrar hålet från att komma tillbaka.
let server;
let base;
const api = (path, { method = 'GET', body, token } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const userRow = async (id) =>
  (await pool.query('select id, email, role, display_name from users where id = $1', [id])).rows[0];

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  // Hängande anrop (hål A05/A10) håller annars servern öppen så att afterAll får timeout.
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await mongo.close();
});

describe('A07 Authentication Failures – inloggningen', () => {
  it('svaret på en lyckad inloggning innehåller token och användaren – men aldrig password_hash', async () => {
    const user = await userRow(1);
    const res = await api('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'hemligt123' } });
    expect(res.status).toBe(200);
    const svar = await res.json();
    expect(svar.token).toEqual(expect.any(String));
    expect(svar.user.email).toBe(user.email);
    expect(JSON.stringify(svar)).not.toContain('password_hash');
    expect(JSON.stringify(svar)).not.toContain('hemligt123');
  });

  it('fel lösenord och okänd e-post ger samma svar (401, samma text)', async () => {
    const user = await userRow(1);
    const felLosen = await api('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'fel' } });
    const okand = await api('/api/auth/login', { method: 'POST', body: { email: 'finns.inte@example.com', password: 'fel' } });
    expect(felLosen.status).toBe(401);
    expect(okand.status).toBe(401);
    expect(await felLosen.json()).toEqual(await okand.json());
  });

  it('lösenordet i databasen är hashat, inte klartext', async () => {
    const { rows } = await pool.query("select count(*)::int as n from users where password_hash like 'plaintext:%'");
    expect(rows[0].n).toBe(0);
  });

  it('registrering med för kort lösenord ger 400 med vad som var fel', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: 'ny@example.com', password: 'kort', displayName: 'Ny' },
    });
    expect(res.status).toBe(400);
    const svar = await res.json();
    expect(svar.error).toBe('ogiltig indata');
    expect(svar.issues[0].path).toBe('password');
  });

  it('registrering ger 201 med token, lösenordet sparas hashat och skickas aldrig tillbaka', async () => {
    const email = `registrering-${Date.now()}@example.com`;
    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: { email, password: 'langtlosenord123', displayName: 'Ny Medlem' },
      });
      expect(res.status).toBe(201);
      const svar = await res.json();
      expect(svar.token).toEqual(expect.any(String));
      expect(svar.user.email).toBe(email);
      expect(JSON.stringify(svar)).not.toContain('password_hash');
      expect(JSON.stringify(svar)).not.toContain('langtlosenord123');
      const { rows } = await pool.query('select password_hash from users where email = $1', [email]);
      expect(rows[0].password_hash).toMatch(/^scrypt:[0-9a-f]+:[0-9a-f]+$/);
    } finally {
      await pool.query('delete from users where email = $1', [email]);
    }
  });

  it('registrering med en e-post som redan finns ger 409', async () => {
    const user = await userRow(1);
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: user.email, password: 'langtlosenord123', displayName: 'Dubblett' },
    });
    expect(res.status).toBe(409);
  });
});

describe('A01 Broken Access Control – vems tur är det?', () => {
  it('DELETE /api/tours/:id utan token ger 401 och turen finns kvar', async () => {
    const res = await api('/api/tours/1', { method: 'DELETE' });
    expect(res.status).toBe(401);
    const { rows } = await pool.query('select id from tours where id = 1');
    expect(rows).toHaveLength(1);
  });

  it('en medlem kan inte ta bort någon annans tur (403)', async () => {
    const tour = (await pool.query('select id, user_id from tours where id = 1')).rows[0];
    // en annan medlem än turens ägare (och inte redaktör)
    const other = (
      await pool.query("select id, email, role from users where id <> $1 and role = 'member' limit 1", [tour.user_id])
    ).rows[0];
    const res = await api(`/api/tours/${tour.id}`, { method: 'DELETE', token: sign(other) });
    expect(res.status).toBe(403);
    expect((await pool.query('select id from tours where id = 1')).rows).toHaveLength(1);
  });

  it('ägaren kan ta bort sin egen tur', async () => {
    const owner = await userRow(1);
    const created = await pool.query(
      `insert into tours (user_id, title, started_at, distance_m) values ($1, 'Testtur M8', now(), 100) returning id`,
      [owner.id],
    );
    const res = await api(`/api/tours/${created.rows[0].id}`, { method: 'DELETE', token: sign(owner) });
    expect(res.status).toBe(200);
    expect((await pool.query('select id from tours where id = $1', [created.rows[0].id])).rows).toHaveLength(0);
  });

  it('POST /api/photos utan token ger 401 – uppladdning kräver inloggning', async () => {
    const res = await api('/api/photos', {
      method: 'POST',
      body: { tourId: 1, filename: 'fjall.jpg', width: 4000, height: 3000 },
    });
    expect(res.status).toBe(401);
  });

  it('DELETE på en tur som inte finns ger 404', async () => {
    const owner = await userRow(1);
    const res = await api('/api/tours/999999', { method: 'DELETE', token: sign(owner) });
    expect(res.status).toBe(404);
  });

  it('en redaktör kan ta bort någon annans tur', async () => {
    const editor = (await pool.query("select id, email, role from users where role = 'editor' limit 1")).rows[0];
    const member = (await pool.query("select id from users where role = 'member' limit 1")).rows[0];
    const created = await pool.query(
      `insert into tours (user_id, title, started_at, distance_m) values ($1, 'Testtur redaktör', now(), 100) returning id`,
      [member.id],
    );
    const res = await api(`/api/tours/${created.rows[0].id}`, { method: 'DELETE', token: sign(editor) });
    expect(res.status).toBe(200);
    expect((await pool.query('select id from tours where id = $1', [created.rows[0].id])).rows).toHaveLength(0);
  });

  it('POST /api/photos för någon annans tur ger 403', async () => {
    const tour = (await pool.query('select id, user_id from tours where id = 1')).rows[0];
    const other = (
      await pool.query("select id, email, role from users where id <> $1 and role = 'member' limit 1", [tour.user_id])
    ).rows[0];
    const res = await api('/api/photos', {
      method: 'POST',
      token: sign(other),
      body: { tourId: tour.id, filename: 'fjall.jpg', width: 4000, height: 3000 },
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/photos för en tur som inte finns ger 404', async () => {
    const owner = await userRow(1);
    const res = await api('/api/photos', {
      method: 'POST',
      token: sign(owner),
      body: { tourId: 999999, filename: 'fjall.jpg', width: 4000, height: 3000 },
    });
    expect(res.status).toBe(404);
  });

  it('PUT /api/guides/:id utan token ger 401, som medlem 403, som redaktör 200', async () => {
    // Testerna kör mot den lokala databasen: spara hela raden och lägg tillbaka den efteråt,
    // annars ligger "Hackad" kvar i appen efter varje körning.
    const guide = (await pool.query('select * from guides order by id limit 1')).rows[0];
    const body = { title: 'Hackad', region: 'x', difficulty: 'lätt', lengthKm: 1, bodyHtml: '', published: true };
    try {
      const utan = await api(`/api/guides/${guide.id}`, { method: 'PUT', body });
      expect(utan.status).toBe(401);
      const member = (await pool.query("select id, email, role from users where role = 'member' limit 1")).rows[0];
      const medlem = await api(`/api/guides/${guide.id}`, { method: 'PUT', body, token: sign(member) });
      expect(medlem.status).toBe(403);
      expect((await pool.query('select title from guides where id = $1', [guide.id])).rows[0].title).toBe(guide.title);

      const editor = (await pool.query("select id, email, role from users where role = 'editor' limit 1")).rows[0];
      const redaktor = await api(`/api/guides/${guide.id}`, { method: 'PUT', body, token: sign(editor) });
      expect(redaktor.status).toBe(200);
      expect((await pool.query('select title from guides where id = $1', [guide.id])).rows[0].title).toBe(body.title);
    } finally {
      await pool.query(
        `update guides set title=$1, region=$2, difficulty=$3, length_km=$4, body_html=$5,
         published=$6, updated_at=$7 where id=$8`,
        [guide.title, guide.region, guide.difficulty, guide.length_km, guide.body_html, guide.published, guide.updated_at, guide.id],
      );
    }
  });
});

// #144: PUT /api/guides/:id – bara en inloggad redaktör får redigera, och indatan valideras.
describe('A01 Broken Access Control – redigera guider (#144)', () => {
  const validBody = { title: 'Ny titel #144', region: 'Lappland', difficulty: 'medel', lengthKm: 12, bodyHtml: '<p>Text</p>', published: true };
  const firstGuide = async () => (await pool.query('select * from guides order by id limit 1')).rows[0];
  const editor = async () => (await pool.query("select id, email, role from users where role = 'editor' limit 1")).rows[0];
  const member = async () => (await pool.query("select id, email, role from users where role = 'member' limit 1")).rows[0];

  it('utan token ger 401 och guiden är oförändrad', async () => {
    const guide = await firstGuide();
    const res = await api(`/api/guides/${guide.id}`, { method: 'PUT', body: validBody });
    expect(res.status).toBe(401);
    expect((await firstGuide()).title).toBe(guide.title);
  });

  it('som medlem ger 403 och guiden är oförändrad', async () => {
    const guide = await firstGuide();
    const res = await api(`/api/guides/${guide.id}`, { method: 'PUT', body: validBody, token: sign(await member()) });
    expect(res.status).toBe(403);
    expect((await firstGuide()).title).toBe(guide.title);
  });

  it('en redaktör kan uppdatera en guide', async () => {
    const guide = await firstGuide();
    try {
      const res = await api(`/api/guides/${guide.id}`, { method: 'PUT', body: validBody, token: sign(await editor()) });
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe('Ny titel #144');
    } finally {
      await pool.query('update guides set title=$1, region=$2, difficulty=$3, length_km=$4, body_html=$5, published=$6 where id=$7', [
        guide.title, guide.region, guide.difficulty, guide.length_km, guide.body_html, guide.published, guide.id,
      ]);
    }
  });

  it('ogiltig indata ger 400 och guiden är oförändrad', async () => {
    const guide = await firstGuide();
    const res = await api(`/api/guides/${guide.id}`, {
      method: 'PUT',
      token: sign(await editor()),
      body: { ...validBody, title: '', lengthKm: 'inte ett tal' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ogiltig indata');
    expect((await firstGuide()).title).toBe(guide.title);
  });

  it('ett id som inte är ett tal ger 400', async () => {
    const res = await api('/api/guides/abc', { method: 'PUT', body: validBody, token: sign(await editor()) });
    expect(res.status).toBe(400);
  });

  it('en guide som inte finns ger 404', async () => {
    const res = await api('/api/guides/999999', { method: 'PUT', body: validBody, token: sign(await editor()) });
    expect(res.status).toBe(404);
  });
});

describe('A02 Security Misconfiguration – CORS (#144)', () => {
  it('en okänd origin får inte Access-Control-Allow-Origin: *', async () => {
    const res = await fetch(`${base}/api/guides`, { headers: { origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('preflight från en okänd origin får inte tillåtas med *', async () => {
    const res = await fetch(`${base}/api/guides/1`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'PUT' },
    });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });
});

describe('A05 Injection – sökningen', () => {
  it("ett citattecken i sökordet ger 200 och en tom lista, inte 500", async () => {
    const res = await api(`/api/guides/search?q=${encodeURIComponent("'")}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('en vanlig sökning hittar guider i landskapet', async () => {
    const region = (await pool.query('select region from guides limit 1')).rows[0].region;
    const res = await api(`/api/guides/search?q=${encodeURIComponent(region)}`);
    expect(res.status).toBe(200);
    const guides = await res.json();
    expect(guides.length).toBeGreaterThan(0);
    for (const g of guides) expect(g.region).toBe(region);
  });
});

describe('Validering av indata – A10 Mishandling of Exceptional Conditions', () => {
  it('en bild med orimliga mått stoppas med 400 innan något sparas', async () => {
    const owner = await userRow(1);
    const before = (await pool.query('select count(*)::int as n from photos')).rows[0].n;
    const res = await api('/api/photos', {
      method: 'POST',
      token: sign(owner),
      body: { tourId: 1, filename: 'enorm.jpg', width: 1_000_000, height: 1_000_000 },
    });
    expect(res.status).toBe(400);
    const svar = await res.json();
    expect(svar.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['width', 'height']));
    const after = (await pool.query('select count(*)::int as n from photos')).rows[0].n;
    expect(after).toBe(before);
  });

  it('ett id som inte är ett tal ger 400, inte ett ohanterat fel', async () => {
    const res = await api('/api/tours/abc');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'ogiltigt id' });
  });

  it('trasig JSON ger 400 med ett svar – inte ett anrop som hänger', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email": ',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'ogiltig JSON' });
  });
});

// Fredagens labb (M9): webhooken från CMS:et. Adressen är publik, så testerna gäller två saker:
// att ingen kommer in utan hemligheten, och att rätt anrop faktiskt tömmer cachen.
describe('M9 – webhooken från CMS:et', () => {
  const HEMLIGHET = 'en-lang-webhook-hemlighet-for-testerna';
  const webhook = (headers = {}) => fetch(`${base}/api/cms/webhook`, { method: 'POST', headers });

  it('utan hemlighet, med fel hemlighet eller när ingen är satt på servern: 401', async () => {
    config.cmsWebhookSecret = HEMLIGHET;
    expect((await webhook()).status).toBe(401);
    expect((await webhook({ 'X-Utpost-Webhook-Secret': 'fel' })).status).toBe(401);
    config.cmsWebhookSecret = '';
    expect((await webhook({ 'X-Utpost-Webhook-Secret': '' })).status).toBe(401);
  });

  it('med rätt hemlighet töms cachen: nästa fråga hämtar från CMS:et igen', async () => {
    Object.assign(config, { cmsWebhookSecret: HEMLIGHET, cmsSpaceId: 'space1', cmsDeliveryToken: 'nyckel' });
    clearCmsCache();
    const riktigFetch = globalThis.fetch;
    // Bara anropen till Contentful byts ut – testets egna anrop till API:et går som vanligt.
    const contentful = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }));
    vi.stubGlobal('fetch', (url, options) =>
      String(url).includes('contentful.com') ? contentful(url, options) : riktigFetch(url, options),
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await publishedNotices();
    await publishedNotices();
    expect(contentful).toHaveBeenCalledTimes(1); // andra frågan svarades ur cachen

    const res = await webhook({
      'X-Utpost-Webhook-Secret': HEMLIGHET,
      'X-Contentful-Topic': 'ContentManagement.Entry.publish',
    });
    expect(res.status).toBe(204);

    await publishedNotices();
    expect(contentful).toHaveBeenCalledTimes(2); // cachen var tömd

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.assign(config, { cmsWebhookSecret: '', cmsSpaceId: '', cmsDeliveryToken: '' });
    clearCmsCache();
  });
});
