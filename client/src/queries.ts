// Generated GraphQL documents and mappings for the Vue views.

import type { GuideSummary } from '../lib/guides'
import type { TourListItem } from '../lib/tours'
import { graphql } from './gql'
import type { GuidesQuery, ToursQuery } from './gql/graphql'

export const GUIDES_QUERY = graphql(/* GraphQL */ `
  query Guides {
    guides {
      id
      slug
      title
      region
      difficulty
      lengthKm
      excerpt
      heroImage
      published
      updatedAt
    }
  }
`)

export const TOURS_QUERY = graphql(/* GraphQL */ `
  query Tours($limit: Int) {
    tours(limit: $limit) {
      id
      title
      distanceM
      photoCount
      user {
        displayName
      }
      guide {
        title
      }
    }
  }
`)

export const toGuide = (guide: GuidesQuery['guides'][number]): GuideSummary => ({
  id: Number(guide.id),
  slug: guide.slug,
  title: guide.title,
  region: guide.region,
  difficulty: guide.difficulty,
  length_km: guide.lengthKm,
  excerpt: guide.excerpt,
  hero_image: guide.heroImage,
  published: guide.published,
  author_id: null,
  updated_at: guide.updatedAt,
})

export const toTourListItem = (tour: ToursQuery['tours'][number]): TourListItem => ({
  id: Number(tour.id),
  title: tour.title,
  distance_m: tour.distanceM,
  user: tour.user ? { display_name: tour.user.displayName } : null,
  guide: tour.guide ? { title: tour.guide.title } : null,
  photoCount: tour.photoCount,
})
