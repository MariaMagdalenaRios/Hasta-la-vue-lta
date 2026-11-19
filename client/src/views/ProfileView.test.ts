import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Tour, User } from '@utpost/shared'
import ProfileView from './ProfileView.vue'
import { useAuthStore } from '../stores/auth'
import { setToken } from '../lib/token'
import { stubFetch } from '../test/fetch'

const user: User = {
  id: 1,
  email: 'anna@test.com',
  display_name: 'Anna',
  role: 'user',
  created_at: '2026-01-01T00:00:00.000Z',
}

const makeTour = (id: number, user_id: number, title: string): Tour => ({
  id,
  user_id,
  guide_id: null,
  title,
  started_at: '2026-06-01T08:00:00.000Z',
  distance_m: 1000,
  notes: null,
})

const renderView = async (loggedIn: boolean) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  if (loggedIn) {
    auth.user = user
    setToken('token')
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<p>Start</p>' } },
      { path: '/profil', component: ProfileView },
      { path: '/turer/:id', component: { template: '<p>Tur</p>' } },
    ],
  })
  router.push('/profil')
  await router.isReady()
  render(ProfileView, { global: { plugins: [pinia, router] } })
  return { router }
}

describe('ProfileView', () => {
  beforeEach(() => {
    setToken(null)
    stubFetch([makeTour(1, 1, 'Min tur'), makeTour(2, 2, 'Någon annans tur')])
  })

  it('tells a logged-out visitor they are not logged in', async () => {
    await renderView(false)

    expect(screen.getByText('Du är inte inloggad.')).toBeInTheDocument()
  })

  it('shows the user and only their own tours', async () => {
    await renderView(true)

    expect(screen.getByRole('heading', { name: 'Anna' })).toBeInTheDocument()
    expect(await screen.findByText('Min tur')).toBeInTheDocument()
    expect(screen.queryByText('Någon annans tur')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mina turer (1)' })).toBeInTheDocument()
  })

  it('logs out and returns to the start page without a full reload', async () => {
    const { router } = await renderView(true)

    await userEvent.click(screen.getByRole('button', { name: 'Logga ut' }))

    expect(router.currentRoute.value.path).toBe('/')
  })
})
