import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import GuideDetailView from './GuideDetailView.vue'
import { stubFetch, stubFetchNetworkError } from '../test/fetch'
import { createUrqlPlugins } from '../test/urql'

const run = (text: string, marks: { bold?: boolean; italic?: boolean; href?: string | null } = {}) => ({
  text,
  bold: marks.bold ?? false,
  italic: marks.italic ?? false,
  href: marks.href ?? null,
})
const block = (type: string, ...runs: ReturnType<typeof run>[]) => ({ type, runs, items: [] })

// The guide as the GraphQL API returns it: the body is rich text from Contentful.
const guide = {
  id: '3',
  slug: 'kebnekaise',
  title: 'Kebnekaise',
  region: 'Lappland',
  difficulty: 'medel',
  lengthKm: 12,
  body: [
    block('heading-2', run('Om leden')),
    block('paragraph', run('Sveriges '), run('högsta', { bold: true }), run(' topp, '), run('ofta', { italic: true }), run(' blåsigt.')),
    {
      type: 'unordered-list',
      runs: [],
      items: [{ runs: [run('Buss 120')] }, { runs: [run('tidtabell', { href: 'https://utpost.se/buss' })] }],
    },
  ],
  notices: [] as unknown[],
}

const renderView = async (path = '/guider/kebnekaise') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/guider/:slug', component: GuideDetailView }],
  })
  router.push(path)
  await router.isReady()
  return render(GuideDetailView, { global: { plugins: [router, ...createUrqlPlugins()] } })
}

describe('GuideDetailView', () => {
  it('fetches the guide for the slug in the URL from GraphQL', async () => {
    const fetchMock = stubFetch({ data: { guide } })
    await renderView()

    await screen.findByRole('heading', { level: 1, name: 'Kebnekaise' })
    expect(screen.getByText('Lappland · medel · 12 km')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/graphql$/)
    const request = JSON.parse(String(init?.body))
    expect(request.variables).toEqual({ slug: 'kebnekaise' })
    expect(request.query).not.toContain('bodyHtml')
  })

  it('renders the rich text body: headings, bold and italic text, lists and links', async () => {
    stubFetch({ data: { guide } })
    await renderView()

    expect(await screen.findByRole('heading', { level: 2, name: 'Om leden' })).toBeInTheDocument()
    expect(screen.getByText('högsta').tagName).toBe('STRONG')
    expect(screen.getByText('ofta').tagName).toBe('EM')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'tidtabell' })).toHaveAttribute('href', 'https://utpost.se/buss')
  })

  it('shows text that looks like HTML as text, never as markup', async () => {
    stubFetch({ data: { guide: { ...guide, body: [block('paragraph', run('<img src=x onerror="alert(1)">'))] } } })
    const { container } = await renderView()

    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('still shows the guide when the CMS has no text for it', async () => {
    stubFetch({ data: { guide: { ...guide, body: [] } } })
    await renderView()

    await screen.findByRole('heading', { level: 1, name: 'Kebnekaise' })
    expect(screen.getByText('Guidens text är inte tillgänglig just nu.')).toBeInTheDocument()
  })

  it('shows the notices for this guide', async () => {
    stubFetch({
      data: {
        guide: {
          ...guide,
          notices: [
            {
              id: 'n1',
              title: 'Leden är avstängd',
              level: 'warning',
              status: 'published',
              guideSlug: 'kebnekaise',
              body: [{ runs: [run('Bron vid Singi är trasig.')] }],
            },
          ],
        },
      },
    })
    await renderView()

    expect(await screen.findByRole('heading', { name: 'Leden är avstängd' })).toBeInTheDocument()
    expect(screen.getByText('Bron vid Singi är trasig.')).toBeInTheDocument()
  })

  it('says so when the guide does not exist', async () => {
    stubFetch({ data: { guide: null } })
    await renderView('/guider/finns-inte')

    expect(await screen.findByRole('alert')).toHaveTextContent('Guiden hittades inte.')
  })

  it('shows an error when the network is down', async () => {
    stubFetchNetworkError()
    await renderView()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
