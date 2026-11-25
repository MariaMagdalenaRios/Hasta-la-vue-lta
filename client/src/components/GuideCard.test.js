import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/vue'
import GuideCard from './GuideCard.vue'
import { RouterLinkStub } from '../test/routerLink'
import { guideSummaryFixture } from '../test/fixtures'

const renderCard = (guide) =>
  render(GuideCard, { props: { guide }, global: { stubs: { RouterLink: RouterLinkStub } } })

describe('GuideCard', () => {
  it('links to the slug of the guide', () => {
    renderCard(guideSummaryFixture({ slug: 'kebnekaise', title: 'Kebnekaise' }))

    expect(screen.getByRole('link', { name: 'Kebnekaise' })).toHaveAttribute(
      'href',
      '/guider/kebnekaise',
    )
  })

  it('shows the region, the difficulty and the length', () => {
    renderCard(guideSummaryFixture({ region: 'Jämtland', difficulty: 'svår', length_km: 19 }))

    expect(screen.getByText('Jämtland · svår · 19 km')).toBeInTheDocument()
  })

  it('shows the excerpt from the CMS', () => {
    renderCard(guideSummaryFixture({ excerpt: 'Sveriges tak' }))

    expect(screen.getByText('Sveriges tak')).toBeInTheDocument()
  })

  it('shows HTML in the excerpt as text, never as markup', () => {
    const { container } = renderCard(
      guideSummaryFixture({ excerpt: '<img src=x onerror="alert(1)">' }),
    )

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
