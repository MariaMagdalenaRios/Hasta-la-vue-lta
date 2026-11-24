import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/vue'
import NoticeList from './NoticeList.vue'

const notice = (id: string, title: string, status: string) => ({
  id,
  title,
  level: 'info',
  status,
  body: [{ runs: [{ text: `Text för ${title}`, bold: false, italic: false, href: null }] }],
})

describe('NoticeList', () => {
  it('shows each notice with its title and body', () => {
    render(NoticeList, { props: { notices: [notice('1', 'Snöläge', 'published')] } })

    expect(screen.getByRole('heading', { name: 'Snöläge' })).toBeInTheDocument()
    expect(screen.getByText('Text för Snöläge')).toBeInTheDocument()
  })

  it('marks drafts and changed notices with a Draft label, but not published ones', () => {
    render(NoticeList, {
      props: {
        notices: [
          notice('1', 'Publicerad', 'published'),
          notice('2', 'Utkast', 'draft'),
          notice('3', 'Ändrad', 'changed'),
        ],
      },
    })

    const article = (title: string) =>
      screen.getByRole('heading', { name: title }).closest('article')!
    expect(within(article('Publicerad')).queryByText('Draft')).toBeNull()
    expect(within(article('Utkast')).getByText('Draft')).toBeInTheDocument()
    expect(within(article('Ändrad')).getByText('Draft')).toBeInTheDocument()
  })

  it('renders nothing when there are no notices', () => {
    const { container } = render(NoticeList, { props: { notices: [] } })

    expect(container.querySelector('section')).toBeNull()
  })
})
