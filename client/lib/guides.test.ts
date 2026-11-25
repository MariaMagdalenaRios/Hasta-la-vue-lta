import { describe, it, expect } from 'vitest'
import type { Guide } from '@utpost/shared'
import { filterGuidesByTitle } from './guides'

const guide = (id: number, title: string): Guide => ({
  id,
  slug: title.toLowerCase(),
  title,
  region: 'Lappland',
  difficulty: 'medel',
  length_km: 12,
  body_html: '<p>Description</p>',
  hero_image: null,
  published: true,
  author_id: null,
  updated_at: '2026-09-01T08:00:00.000Z',
})

const guides = [guide(1, 'Kebnekaise'), guide(2, 'Sarek'), guide(3, 'Stora Sjöfallet')]

describe('filterGuidesByTitle', () => {
  it('returns all guides when the search term is empty', () => {
    expect(filterGuidesByTitle(guides, '')).toHaveLength(3)
  })

  it('ignores whitespace around the search term', () => {
    expect(filterGuidesByTitle(guides, '  sarek ')).toEqual([guides[1]])
  })

  it('matches regardless of letter case', () => {
    expect(filterGuidesByTitle(guides, 'kEbNe')).toEqual([guides[0]])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterGuidesByTitle(guides, 'Everest')).toEqual([])
  })
})