import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Guide } from '@utpost/shared'
import GuideDetailView from './GuideDetailView.vue'
import { stubFetch, stubFetchNetworkError } from '../test/fetch'

const guide: Guide = {
  id: 3,
  slug: 'kebnekaise',
  title: 'Kebnekaise',
  region: 'Lappland',
  difficulty: 'medel',
  length_km: 12,
  body_html: '<p>Sveriges tak</p>',
  hero_image: null,
  published: true,
  author_id: 1,
  updated_at: '2026-01-01T00:00:00.000Z',
}

const renderView = async (path = '/guider/kebnekaise') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/guider/:slug', component: GuideDetailView }],
  })
  router.push(path)
  await router.isReady()
  return render(GuideDetailView, { global: { plugins: [router] } })
}

describe('GuideDetailView', () => {
  it('fetches the guide from the slug in the URL and shows it', async () => {
    const fetchMock = stubFetch(guide)
    await renderView()

    await screen.findByRole('heading', { name: 'Kebnekaise' })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/guides\/kebnekaise$/), {
      headers: {},
    })
    expect(screen.getByText('Lappland · medel · 12 km')).toBeInTheDocument()
    expect(screen.getByText('Sveriges tak')).toBeInTheDocument()
  })

  it('removes scripts and event handlers from the guide body (debt item 3)', async () => {
    stubFetch({
      ...guide,
      body_html: '<p>Hej</p><img src="x" onerror="alert(1)"><script>alert(2)</script>',
    })
    const { container } = await renderView()

    await screen.findByText('Hej')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull()
  })

  it('shows an error when the guide is not found', async () => {
    stubFetch({ error: 'hittades inte' }, 404)
    await renderView()

    expect(await screen.findByRole('alert')).toHaveTextContent('404')
  })

  it('shows an error when the network is down', async () => {
    stubFetchNetworkError()
    await renderView()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
