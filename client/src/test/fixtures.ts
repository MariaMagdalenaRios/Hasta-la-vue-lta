import { vi } from 'vitest'
import type { Guide, TourDetail, TourLog, TourWithRelations } from '@utpost/shared'
import type { GuideSummary } from '../../lib/guides'

export const guideFixture = (overrides: Partial<Guide> = {}): Guide => ({
  id: 1,
  slug: 'kebnekaise',
  title: 'Kebnekaise',
  region: 'Lappland',
  difficulty: 'medel',
  length_km: 12,
  body_html: '<p>Short description</p>',
  hero_image: null,
  published: true,
  author_id: null,
  updated_at: '2026-09-01T08:00:00.000Z',
  ...overrides,
})

export const guideSummaryFixture = (overrides: Partial<GuideSummary> = {}): GuideSummary => ({
  id: 1,
  slug: 'kebnekaise',
  title: 'Kebnekaise',
  region: 'Lappland',
  difficulty: 'medel',
  length_km: 12,
  excerpt: 'Short description',
  hero_image: null,
  published: true,
  author_id: null,
  updated_at: '2026-09-01T08:00:00.000Z',
  ...overrides,
})

export const tourFixture = (overrides: Partial<TourWithRelations> = {}): TourWithRelations => ({
  id: 7,
  user_id: 2,
  guide_id: null,
  title: 'Kebnekaise runt',
  started_at: '2026-09-01T08:00:00.000Z',
  distance_m: 12500,
  notes: null,
  user: {
    id: 2,
    email: 'anna@example.com',
    display_name: 'Anna',
    role: 'user',
    created_at: '2026-09-01T08:00:00.000Z',
  },
  guide: null,
  photos: [],
  logs: [],
  ...overrides,
})

export const logFixture = (overrides: Partial<TourLog> = {}): TourLog => ({
  id: 1,
  tour_id: 7,
  recorded_at: '2026-09-01T08:05:00',
  lat: 67.9,
  lon: 18.5,
  elevation_m: 500,
  heart_rate: 132,
  note: null,
  ...overrides,
})

export const tourDetailFixture = (overrides: Partial<TourDetail> = {}): TourDetail => ({
  id: 7,
  user_id: 2,
  guide_id: null,
  title: 'Kebnekaise runt',
  started_at: '2026-09-01T08:00:00.000Z',
  distance_m: 12500,
  notes: null,
  logs: [],
  photos: [],
  ...overrides,
})

/** Makes the fetch calls in the components answer the way the API does. */
export const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Keeps the fetch call open until the test releases the response. */
export const stubPendingFetch = () => {
  let respond!: (body: unknown, status?: number) => void
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise((resolve) => {
        respond = (body: unknown, status = 200) =>
          resolve({ ok: status < 300, status, json: async () => body })
      }),
    ),
  )
  return { respond }
}
