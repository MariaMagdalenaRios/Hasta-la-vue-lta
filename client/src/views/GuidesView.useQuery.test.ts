import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import { ref } from 'vue'
import GuidesView from './GuidesView.vue'

const urqlMocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}))

vi.mock('@urql/vue', () => ({
  useQuery: urqlMocks.useQuery,
}))

describe('GuidesView with mocked useQuery', () => {
  beforeEach(() => {
    urqlMocks.useQuery.mockReset()
  })

  it('passes the generated Guides document to useQuery', async () => {
    urqlMocks.useQuery.mockReturnValue({
      data: ref({
        guides: [
          {
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
          },
        ],
      }),
      fetching: ref(false),
      error: ref(null),
    })

    render(GuidesView, {
      global: {
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

    expect(await screen.findByRole('link', { name: 'Kebnekaise' })).toHaveAttribute(
      'href',
      '/guider/kebnekaise',
    )
    expect(urqlMocks.useQuery).toHaveBeenCalledOnce()

    const args = urqlMocks.useQuery.mock.calls[0][0]
    expect(args.query.definitions[0].name.value).toBe('Guides')
    expect(args.variables).toBeUndefined()
  })
})
