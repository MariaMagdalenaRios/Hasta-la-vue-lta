# Decision: Contentful as the CMS

**Date:** 2026-11-25
**Status:** Accepted.
**Decision:** Editorial content (guides and notices) lives in Contentful, a hosted headless CMS. Postgres keeps the data that tours and users depend on. The API is the only thing that talks to Contentful (`api/src/cms/`); the client reads CMS content through `/graphql`.

## Why Contentful

Guides were HTML pasted into `guides.body_html`, so editors needed a developer for every change. We need drafts, a preview before publishing, and structured text that the client renders itself instead of injecting HTML.

- **Hosted.** Staging is one Azure Container App with four containers (`docs/decisions/hosting.md`). A CMS that we run ourselves is a fifth container plus its own database, backups and upgrades.
- **Draft and published are separate APIs** with separate keys, so editors can preview without touching what readers see.
- **Rich text is a tree of nodes, not HTML.** The client renders only the blocks we allow, and links are checked before they become `href`s.
- **The free plan is enough**, and the cache below keeps us under its monthly request cap.

## Alternative: Strapi, self-hosted

Strapi would keep the content in our own Postgres and has the same draft and rich-text features. We did not pick it because it adds the container, database, editor logins and upgrades from the first bullet, which the team would have to run. It would be the better choice if we needed the content inside our own infrastructure.

## Switch if

- the monthly request cap or user limit is hit even with the cache, and the paid plan is not worth it;
- content must be stored inside our own infrastructure (legal or customer requirement);
- Contentful is down often enough that editors cannot work.

Switching is cheap on purpose: the API schema and the client do not know Contentful. Only `api/src/cms/` is rewritten.

## Content model

**Guide** (`guide`). Fields describe content, not layout.

| Field | Type | Rules |
| --- | --- | --- |
| `title` | Short text | Required, max 100 characters |
| `slug` | Short text | Required, unique, `^[a-z0-9-]+$` |
| `region` | Short text | Required, one of 8 listed regions |
| `difficulty` | Short text | Required, `lätt`, `medel` or `svår` |
| `lengthKm` | Number | Required, 0 or more |
| `heroImage` | Asset | Optional, images only (left empty by the migration) |
| `body` | Rich text | Required. Allowed: paragraph, H2, H3, bullet list, bold, italic, link |

Region and difficulty are fixed lists so that `lätt` and `Lätt` cannot both exist. There is no `duration` field because Postgres never had that data.

**Notice** (`notis`). Fields: `rubrik` (title), `niva` (level), `text` (rich text), `guideSlug` (plain text). An empty `guideSlug` is a notice for the homepage. A set one also shows on that guide's page.

**Postgres vs Contentful.** Contentful holds what editors write: title, slug, region, difficulty, length, image and body. `published` and `updated_at` are replaced by Contentful's own status and dates. Postgres keeps `id` (tours point to it) and `author_id`, and a copy of `slug`.

**How the API finds a guide.** By `slug`. Migrated entries have the ID `guide-<slug>`, and `Guide.notices` matches `notice.guideSlug === guide.slug`. Weak spot: `guideSlug` is plain text, so renaming a slug silently unlinks its notices. The fix is a `guide` reference field on `notis` (it follows the entry's `sys.id`, which never changes). Not built yet and not ticketed.

## Migration

`npm run migrate:guides` (`--dry-run` first). It finds each guide by slug and creates, updates or skips it, so a second run ends with `0 created, 0 updated, 40 unchanged`. `published` follows Postgres. It sends at most one request every 150 ms (under the 7 writes per second limit) and retries a 429 after the time Contentful gives, up to 5 times. It needs `CONTENTFUL_SPACE_ID` and a write token (`CONTENTFUL_MANAGEMENT_TOKEN`, or `npx contentful-cli login`). The slugs come from `seed.js`, which uses a fixed random seed: run the script only from a database made by `npm run seed`, or it creates duplicates.

## Caching, webhook and outages

- **Cache.** Published notices are kept in memory for `CMS_CACHE_SECONDS` (60). A list of 40 guides makes one request to Contentful, not 40. Preview is never cached.
- **Webhook.** `POST /api/cms/webhook`, secret in `X-Utpost-Webhook-Secret`, is meant to clear the cache when an editor publishes (#159). The route is **not on `main` yet**. Until it is, a published change shows after up to 60 seconds.
- **Contentful down.** Requests time out after 5 seconds. The API returns the last notices it fetched, or an empty list, and logs the error. Pages still load, only without new notices. With no space ID or delivery token the CMS is simply off.
