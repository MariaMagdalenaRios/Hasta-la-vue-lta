import { GraphQLError } from 'graphql';

const unauthenticatedError = () =>
  new GraphQLError('Authentication required', {
    extensions: { code: 'UNAUTHENTICATED' },
  });

export const resolvers = {
  Query: {
    guides: async (_parent, _args, context) => {
      const result = await context.db.query(
        'SELECT * FROM guides ORDER BY id',
      );
      return result.rows;
    },

    guide: async (_parent, { slug }, context) => {
      const result = await context.db.query(
        'SELECT * FROM guides WHERE slug = $1 LIMIT 1',
        [slug],
      );
      return result.rows[0] ?? null;
    },

    // Notices come from the CMS (cms/contentful.js), not the database. Drafts are
    // editor-only: the role is checked here, on the server, which also holds the preview token.
    notices: async (_parent, { preview }, { user, cms }) => {
      if (!preview) return cms.notices();
      if (user?.role !== 'editor') {
        throw new GraphQLError('Preview requires the editor role', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      return cms.previewNotices();
    },

    tours: async (_parent, { limit }, context) => {
      const safeLimit = Math.min(
        Math.max(Number.isInteger(limit) ? limit : 50, 0),
        200,
      );

      const result = await context.db.query(
        'SELECT * FROM tours ORDER BY started_at DESC LIMIT $1',
        [safeLimit],
      );
      return result.rows;
    },

    tour: async (_parent, { id }, context) => {
      const result = await context.db.query(
        'SELECT * FROM tours WHERE id = $1 LIMIT 1',
        [id],
      );
      return result.rows[0] ?? null;
    },
  },

  Guide: {
    lengthKm: (guide) => Number(guide.length_km),
    bodyHtml: (guide) => guide.body_html,
    heroImage: (guide) => guide.hero_image,
    updatedAt: (guide) => guide.updated_at,
    // The guide lives in Postgres, the notice in the CMS. They meet here via the slug.
    notices: async (guide, _args, { cms }) =>
      (await cms.notices()).filter((notice) => notice.guideSlug === guide.slug),
  },

  User: {
    displayName: (user) => user.display_name,
    createdAt: (user) => user.created_at,
  },

  Photo: {
    createdAt: (photo) => photo.created_at,
  },

  TourLog: {
    recordedAt: (log) => log.t,
    elevationM: (log) => log.elevation_m,
    heartRate: (log) => log.heart_rate,
  },

  Tour: {
    startedAt: (tour) => tour.started_at,
    distanceM: (tour) => tour.distance_m,

    user: (tour, _args, context) => context.loaders.user.load(tour.user_id),

    guide: (tour, _args, context) => {
      if (tour.guide_id == null) return null;
      return context.loaders.guide.load(tour.guide_id);
    },

    photos: (tour, _args, context) => context.loaders.photos.load(tour.id),

    logs: (tour, _args, context) => context.loaders.logs.load(tour.id),

    photoCount: async (tour, _args, context) => {
      const photos = await context.loaders.photos.load(tour.id);
      return photos.length;
    },
  },

  Mutation: {
    createTour: async (_, { input }, context) => {
      if (!context.user?.id) {
        throw unauthenticatedError();
      }

      const result = await context.db.query(
        `INSERT INTO tours
          (user_id, guide_id, title, started_at, distance_m, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          context.user.id,
          input.guideId ?? null,
          input.title,
          input.startedAt,
          input.distanceM,
          input.notes ?? null,
        ],
      );

      return result.rows[0];
    },
  },
};