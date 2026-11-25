# Decision: Contentful as the CMS

**Date:** 2026-11-25
**Status:** Accepted.
**Decision:** Guides and notices live in Contentful, a hosted headless CMS. Postgres keeps the data that tours and users depend on. Only the API talks to Contentful (`api/src/cms/`); the client reads CMS content through `/graphql`.

## Why Contentful

Guides were HTML pasted into `guides.body_html`, so every change needed a developer. We need drafts, a preview before publishing, and text the client renders itself instead of injecting HTML.

- **Hosted.** Staging is one Azure Container App with four containers (`hosting.md`). A CMS we run ourselves adds a fifth container, a database, backups and upgrades.
- **Draft and published are separate APIs** with separate keys, so editors preview without changing what readers see.
- **Rich text is a tree of nodes, not HTML.** The client renders only allowed blocks and checks links.

## Alternative: Strapi, self-hosted

Same draft and rich-text features, with content in our own Postgres. Not chosen: it adds the container, database, editor logins and upgrades above. It would win if content had to stay inside our infrastructure.

## Switch if

The request cap or user limit is hit even with the cache; content must be stored in our own infrastructure; Contentful is down often enough that editors cannot work. Switching is cheap: only `api/src/cms/` knows Contentful.

## Content model

**Guide** (`guide`): content only, no layout. `title` (required, max 100), `slug` (required, unique, `^[a-z0-9-]+$`), `region` (one of 8 listed), `difficulty` (`lätt`, `medel` or `svår`), `lengthKm` (0 or more), `heroImage` (optional image, left empty by the migration), `body` (rich text: paragraph, H2, H3, bullet list, bold, italic, link). Region and difficulty are fixed lists so `lätt` and `Lätt` cannot both exist. There is no `duration`: Postgres never had it.

**Notice** (`notis`): `rubrik` (title), `niva` (level), `text` (rich text), `guideSlug` (plain text). An empty `guideSlug` is a homepage notice. A set one also shows on that guide's page.

**Postgres vs Contentful.** Contentful holds what editors write. Postgres keeps `id` (tours point to it), `author_id` and `slug`. The other guide columns are only a fallback now and can be dropped once staging serves guides from Contentful (#165). That step has no ticket yet.

**How the API finds a guide.** By `slug`: the Postgres row from the URL, then the same slug in Contentful (`guideBySlug`). `Guide.notices` matches `notice.guideSlug === guide.slug`. Weak spot: `guideSlug` is plain text, so renaming a slug silently unlinks its notices. The fix is a `guide` reference on `notis`. Not built, no ticket.

## Migration

`npm run migrate:guides` (`--dry-run` first) finds each guide by slug and creates, updates or skips it, so a second run changes nothing. `published` follows Postgres. Requests are 150 ms apart (limit: 7 writes per second) and a 429 is retried after the wait Contentful gives, up to 5 times. It needs `CONTENTFUL_MANAGEMENT_TOKEN` or `npx contentful-cli login`. Slugs come from `seed.js` with a fixed random seed: run it only from a database made by `npm run seed`, or it creates duplicates.

## Caching, webhook and outages

- **Cache.** Notices and guides are kept in memory for `CMS_CACHE_SECONDS` (60). All guides come in one request, so 40 guides cost one call, not 40. Preview is never cached.
- **Webhook.** Contentful calls `POST /api/cms/webhook` on publish and unpublish with the secret in `X-Utpost-Webhook-Secret`. The API empties the cache, so a change shows within seconds. A missing or wrong secret gets 401. If the webhook fails, changes still show within 60 seconds.
- **Contentful down.** Requests time out after 5 seconds and the API serves what it last fetched. After a failed guide fetch it waits 30 seconds before asking Contentful again, so an outage does not slow every request. With nothing fetched, notices are empty and guides use Postgres values, but the **body is empty** because `bodyHtml` is gone: the guide page shows its facts and "Guidens text är inte tillgänglig just nu." until Contentful answers.
