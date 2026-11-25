import { describe, expect, it } from 'vitest'
import { toGuide, toTourListItem } from './queries'

describe('toGuide', () => {
  it('maps a GraphQL guide onto the fields the cards already use', async () => {
    expect(
      toGuide({
        id: '1',
        slug: 'kebnekaise',
        title: 'Kebnekaise',
        region: 'Lappland',
        difficulty: 'medel',
        lengthKm: 12,
        excerpt: 'Sveriges tak',
        heroImage: null,
        published: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      id: 1,
      slug: 'kebnekaise',
      title: 'Kebnekaise',
      region: 'Lappland',
      difficulty: 'medel',
      length_km: 12,
      excerpt: 'Sveriges tak',
      hero_image: null,
      published: true,
      author_id: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    })
  })
})

describe('toTourListItem', () => {
  it('maps tour, author, guide and photo count for the table', async () => {
    expect(
      toTourListItem({
        id: '7',
        title: 'Toppturen',
        distanceM: 12345,
        photoCount: 3,
        user: { displayName: 'Anna' },
        guide: null,
      }),
    ).toEqual({
      id: 7,
      title: 'Toppturen',
      distance_m: 12345,
      user: { display_name: 'Anna' },
      guide: null,
      photoCount: 3,
    })
  })
})
