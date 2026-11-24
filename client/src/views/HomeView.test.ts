import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/vue'
import HomeView from './HomeView.vue'
import { stubFetch } from '../test/fetch'
import { createUrqlPlugins } from '../test/urql'
import { createPinia } from 'pinia'

const guides = [
  {
    slug: 'kebnekaise',
    title: 'Kebnekaise',
    region: 'Lappland',
    difficulty: 'medel',
    lengthKm: 12,
  },
  { slug: 'sarek', title: 'Sarek', region: 'Lappland', difficulty: 'svår', lengthKm: 45 },
  {
    slug: 'kungsleden',
    title: 'Kungsleden',
    region: 'Norrbotten',
    difficulty: 'lätt',
    lengthKm: 30,
  },
]

const renderView = () =>
  render(HomeView, {
    global: {
      plugins: [createPinia(), ...createUrqlPlugins()],
      stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
    },
  })

describe('HomeView', () => {
  it('renders guides, derived regions and recent tours from one query', async () => {
    const fetchMock = stubFetch({
      data: {
        guides,
        tours: [{ id: '7', title: 'Toppturen', distanceM: 12345 }],
        notices: [],
      },
    })

    renderView()

    expect(await screen.findByText('3 guider i 2 landskap.')).toBeInTheDocument()
    const featuredGuides = await screen.findAllByRole('link', { name: 'Kebnekaise' })
    expect(featuredGuides[0]).toHaveAttribute('href', '/guider/kebnekaise')
    expect(screen.getByRole('link', { name: 'Toppturen' })).toHaveAttribute('href', '/turer/7')
    expect(screen.getByText('12.3 km')).toBeInTheDocument()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.query).toContain('query Home')
  })
})
