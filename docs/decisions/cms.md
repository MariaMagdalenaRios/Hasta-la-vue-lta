# Decision: Guide content model in Contentful

Part of M9 (issue #160). Same template as `docs/decisions/databas.md`.

**Date:** 2026-11-24
**Status:** Accepted.
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

## The `guide` content type

Content type ID: `guide`. Display field: `title`. The fields describe content only. There are no fields for layout, colours or HTML.

| Field ID | Type | Required | Validations |
| --- | --- | --- | --- |
| `title` | Short text | Yes | Max 100 characters. |
| `slug` | Short text | Yes | Unique. Pattern `^[a-z0-9-]+$` (the seed slugs are lower case with å, ä, ö replaced by a, o). |
| `region` | Short text | Yes | Only one of: Jämtland, Dalarna, Lappland, Bohuslän, Småland, Södermanland, Härjedalen, Skåne. |
| `difficulty` | Short text | Yes | Only one of: `lätt`, `medel`, `svår` (same as `Difficulty` in `shared/src/types.ts`). |
| `lengthKm` | Number (decimal) | Yes | Minimum 0. |
| `heroImage` | Asset link | No | Images only. `hero_image` is nullable in Postgres today. |
| `body` | Rich Text | Yes | Allowed blocks are listed in the next section. |

Notes:

- `region` and `difficulty` use a fixed list so editors cannot create `lätt` and `Lätt` as two values. The Postgres column is free text and the `/regions` endpoint returns whatever exists, so the list is what keeps the values clean. A new region means adding it to the list in Contentful.
- Only `title`, `slug`, `region`, `difficulty`, `lengthKm` and `body` are required. A guide without an image is allowed.

## Rich text blocks in `body`

The `body` field only allows the formatting that `body_html` uses today, plus bold and links. Everything else is switched off in Contentful, so editors cannot add formatting that the client does not know how to render.

| Allowed | HTML it replaces |
| --- | --- |
| Paragraph | `<p>` |
| Heading 2 | `<h2>` |
| Heading 3 | `<h3>` |
| Unordered list | `<ul>`, `<li>` |
| Italic | `<em>` |
| Bold | `<strong>` (not used in the seed data, added for editors) |
| Hyperlink to a URL | `<a>` |

Not allowed: Heading 1 and 4–6 (the page title is the H1), ordered lists, underline, code, superscript, subscript, quotes, horizontal rules, tables, and embedded entries or assets. An editor who needs one of these asks for it to be added to the content type.

## Relationship between guides and notices

A notice is a short message from the editors, for example that a trail is closed. Notices are their own content type in Contentful. They already exist: #157 (merged in #171) built the content type, the GraphQL `Notice` type and the `Guide.notices` resolver.

### What exists today

- Content type ID: `notis` (`api/src/cms/contentful.js` asks for `content_type=notis`).
- Fields: `rubrik` (title), `niva` (level), `text` and `guideSlug`.
- `guideSlug` is a plain text field. A notice belongs to a guide when `notice.guideSlug === guide.slug` (`api/src/graphql/resolvers.js`, `Guide.notices`). An empty `guideSlug` means a general notice for the homepage.

### The problem

Contentful does not know that `guideSlug` is a slug. It is just text. If an editor renames a guide's slug, every notice that used the old slug silently stops showing on the guide page, and nothing warns the editor. A typo in `guideSlug` fails the same way.

### Decision

Replace `guideSlug` with a field `guide` on `notis`: an optional reference to one `guide` entry. The guide does not hold a list of its notices.

- `guide` empty: a general notice, shown on the homepage. Same meaning as an empty `guideSlug` today.
- `guide` set: the notice is about that guide and also shows on the guide's page.
- A reference points at the entry's `sys.id`, which never changes, so a slug rename cannot break the link.
- Contentful only lets the editor pick a guide that exists, so a typo cannot create a broken link.
- One guide can have many notices over time. With the reference on the notice, an editor adds a notice without opening or republishing the guide.

### What has to change

This is a change to code that is already merged, and no ticket covers it yet. A follow-up ticket is needed for:

1. Add the `guide` reference field to `notis` in Contentful and fill it in on the existing notices.
2. Map `guide` (the linked entry's `sys.id`) instead of `guideSlug` in `api/src/cms/contentful.js` and in the GraphQL `Notice` type.
3. In `Guide.notices`, match the notice's guide id against the guide's `contentful_id` (see "Linking the two halves") instead of the slug.
4. Remove `guideSlug` from `notis` once nothing reads it.

Until then `guideSlug` keeps working and this section describes the target, not the current behaviour.

## Left out on purpose

The ticket lists `duration` as an example field. The model has none: the `guides` table has `length_km` but no duration column, so there is no data to move. A duration field can be added later without changing the rest of the model.

## Migrating the guides (#161)

`npm run migrate:guides` copies every row in the Postgres `guides` table to the `guide` content type in Contentful. The code is in `api/src/cms/` (`htmlToRichText.js` converts `body_html`, `migrateGuides.js` does the sync).

**Set up once**

1. `CONTENTFUL_SPACE_ID` in `.env`.
2. A token that can write. Either put a CMA token in `CONTENTFUL_MANAGEMENT_TOKEN` in `.env`, or leave it empty and run `npx contentful-cli login`, which saves a token for the script to use. A token already set in the terminal session wins over `.env`, so `unset CONTENTFUL_MANAGEMENT_TOKEN` if the script says 401 after you changed it.
3. The Postgres container running (`docker compose up -d postgres`).

**Run**

```
npm run migrate:guides -- --dry-run   # reads Contentful, writes nothing, prints what would happen
npm run migrate:guides                # does it
```

Each guide gets one log line: `created`, `updated` or `unchanged`, and `publish published`, `unpublished` or `none`. A guide that fails is logged and the script goes on with the next one. The exit code is 1 if any guide failed. The last line is a summary.

**What it does**

- **Finds a guide by `slug`.** A new guide gets the entry ID `guide-<slug>`. Running the script again finds the entry and creates nothing. If nothing changed, it writes nothing, so a second run ends with `0 created, 0 updated, 40 unchanged`.
- **Publication status follows Postgres.** `published = true` is published in Contentful, `false` stays a draft. A guide that is already published in Contentful but unpublished in Postgres is unpublished.
- **Keeps what it does not manage.** On update it merges into the existing fields, so a `heroImage` that an editor added in Contentful is not removed.
- **Rate limits.** At most one request every 150 ms (about 6.7 per second, under the limit of 7 writes per second). On a 429 response it waits for the time in `X-Contentful-RateLimit-Reset` and retries, up to 5 times.
- **Rich text.** HTML the content type does not allow, for example `<ol>` or `<table>`, is logged as a `warning`. The text is kept. The 40 current guides give no warnings.

**Not part of this migration**

- `heroImage` is left empty. `hero_image` holds filenames and the image files are not in the repo. Add the images in Contentful by hand, or write a separate upload step when the files turn up.
- The `contentful_id` column in Postgres (see "Linking the two halves") is not added. The entry ID is `guide-<slug>` for all migrated guides, so it can be filled in from the slug later.

**Seed data and the shared space**

The script finds guides by `slug`, and the slugs come from `api/src/db/seed.js`. The seed uses a fixed random seed, so every developer who runs `npm run seed` gets the same 40 guides and slugs, and running the migration from any seeded database matches the entries that already exist. Do not run the script against the shared space from a database that was not created by `npm run seed`: none of its slugs would match, and it would create duplicates. Changing the seed value or the way titles are made changes every slug, so the entries in Contentful have to be deleted and migrated again.
