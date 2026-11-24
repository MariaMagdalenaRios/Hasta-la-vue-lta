import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ref, unref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { User } from '@utpost/shared'
import HomeView from './HomeView.vue'
import { useAuthStore } from '../stores/auth'

const urqlMocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}))

vi.mock('@urql/vue', () => ({
  useQuery: urqlMocks.useQuery,
}))

const guides = [
  {
    slug: 'kebnekaise',
    title: 'Kebnekaise',
    region: 'Lappland',
    difficulty: 'medel',
    lengthKm: 12,
  },
  { slug: 'sarek', title: 'Sarek', region: 'Lappland', difficulty: 'svår', lengthKm: 45 },
]

const makeUser = (role: string): User => ({
  id: 1,
  email: `${role}@utpost.se`,
  display_name: role,
  role,
  created_at: '2026-01-01T00:00:00.000Z',
})

// Renders HomeView with an optional logged-in user and returns the arguments given to useQuery.
const renderView = (role?: string) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (role) useAuthStore().user = makeUser(role)

  render(HomeView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
    },
  })
  return urqlMocks.useQuery.mock.calls[0][0]
}

describe('HomeView with mocked useQuery', () => {
  beforeEach(() => {
    urqlMocks.useQuery.mockReset()
    urqlMocks.useQuery.mockReturnValue({
      data: ref({
        guides,
        tours: [{ id: '7', title: 'Toppturen', distanceM: 12345 }],
        notices: [],
      }),
      fetching: ref(false),
      error: ref(null),
    })
  })

  it('passes the generated Home document to useQuery without preview', async () => {
    const args = renderView()

    expect(await screen.findByText('2 guider i 1 landskap.')).toBeInTheDocument()
    expect(urqlMocks.useQuery).toHaveBeenCalledOnce()
    expect(args.query.definitions[0].name.value).toBe('Home')
    expect(unref(args.variables)).toEqual({ preview: false })
    expect(unref(args.requestPolicy)).toBe('cache-first')
  })

  it('lets an editor turn on preview, which asks the server for drafts every time', async () => {
    const args = renderView('editor')

    await userEvent.click(screen.getByRole('checkbox', { name: /visa utkast/i }))

    expect(unref(args.variables)).toEqual({ preview: true })
    expect(unref(args.requestPolicy)).toBe('network-only')
  })

  it('does not show the preview checkbox to members', () => {
    const args = renderView('member')

    expect(screen.queryByRole('checkbox', { name: /visa utkast/i })).toBeNull()
    expect(unref(args.variables)).toEqual({ preview: false })
  })
})
