# Decision: Guide content model in Contentful

Part of M9 (issue #160). Same template as `docs/decisions/databas.md`.

**Date:** 2026-11-24
**Status:** Draft. Field split decided; content type, validations, rich text and notices still to do.
**Decision:** Guide content (text, facts about the trail, image, body) moves to a `guide` content type in Contentful. The `guides` row in Postgres stays as a thin anchor row that owns the guide's id and its links to the rest of the app.

## Background

Today every guide is one row in the `guides` table (`api/src/db/schema.js`):

`id, slug, title, region, difficulty, length_km, body_html, hero_image, published, author_id, updated_at`

The body is stored as raw HTML (`body_html`), pasted in by developers. Editors cannot change a guide without help. The seed body only uses `h2`, `h3`, `p`, `ul`, `li` and `em` (`api/src/db/seed.js`).

## Field split

The rule: a field that an editor writes or changes is **content** and moves to Contentful. A field that other app data depends on is **app data** and stays in Postgres.

| Postgres column | Where it lives after M9 | Contentful field | Reason |
| --- | --- | --- | --- |
| `title` | Contentful | `title` | Written by editors. |
| `slug` | Contentful | `slug` | Written by editors. Postgres keeps a copy, see below. |
| `region` | Contentful | `region` | A fact about the trail. |
| `difficulty` | Contentful | `difficulty` | A fact about the trail. |
| `length_km` | Contentful | `lengthKm` | A fact about the trail. |
| `body_html` | Contentful | `body` (Rich Text) | The main reason for the move. Structured content instead of HTML. |
| `hero_image` | Contentful | `heroImage` (Asset link) | Uploaded and replaced by editors. |
| `published` | Contentful | none | Replaced by Contentful's draft/published status. |
| `updated_at` | Contentful | none | Replaced by `sys.updatedAt`. |
| `id` | Postgres | none | `tours.guide_id` and the `guide.id` copy in each Mongo tour point to it. Changing it would break existing tours. |
| `author_id` | Postgres | none | References `users`. User accounts are not content. |
| *(new)* `contentful_id` | Postgres | none | Links the Postgres row to its Contentful entry (`sys.id`). |

### Linking the two halves

Each guide exists in both systems. Postgres holds `id`, `author_id`, `slug` and the new `contentful_id`. Contentful holds the content.

- The stable link is `contentful_id`. It never changes, even if an editor renames the slug.
- `slug` is kept in Postgres so existing lookups by URL keep working. The Contentful webhook (#159) updates the copy when an editor changes the slug.
- Mongo tours also embed a `guide.title` copy (`docs/decisions/databas.md`). That copy has to be refreshed from Contentful when a title changes, the same way it is today when the Postgres title changes.

The migration script (#161) adds `contentful_id` and fills it in for all 40 guides.
