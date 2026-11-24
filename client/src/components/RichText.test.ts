import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/vue'
import RichText from './RichText.vue'

type Run = { text: string; bold: boolean; italic: boolean; href?: string | null }
const run = (text: string, extra: Partial<Run> = {}): Run => ({
  text,
  bold: false,
  italic: false,
  href: null,
  ...extra,
})

describe('RichText', () => {
  it('renders one paragraph per block with bold and italic runs as elements', () => {
    const { container } = render(RichText, {
      props: {
        paragraphs: [
          {
            runs: [
              run('Vanlig '),
              run('fet', { bold: true }),
              run(' och '),
              run('kursiv', { italic: true }),
            ],
          },
          { runs: [run('Båda', { bold: true, italic: true })] },
        ],
      },
    })

    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(screen.getByText('fet').tagName).toBe('STRONG')
    expect(screen.getByText('kursiv').tagName).toBe('EM')
    expect(screen.getByText('Båda').closest('strong')).not.toBeNull()
    expect(screen.getByText('Båda').tagName).toBe('EM')
  })

  it('renders http(s) and relative links as links', () => {
    render(RichText, {
      props: {
        paragraphs: [
          {
            runs: [
              run('extern', { href: 'https://www.smhi.se' }),
              run('intern', { href: '/guider/sarek' }),
            ],
          },
        ],
      },
    })

    expect(screen.getByRole('link', { name: 'extern' })).toHaveAttribute(
      'href',
      'https://www.smhi.se',
    )
    expect(screen.getByRole('link', { name: 'intern' })).toHaveAttribute('href', '/guider/sarek')
  })

  it('turns a javascript: link into plain text', () => {
    const { container } = render(RichText, {
      props: { paragraphs: [{ runs: [run('klicka här', { href: 'javascript:alert(1)' })] }] },
    })

    expect(screen.getByText('klicka här')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.innerHTML).not.toContain('javascript:')
  })

  it('shows HTML in the text as text, never as markup', () => {
    const { container } = render(RichText, {
      props: { paragraphs: [{ runs: [run('<img src=x onerror=alert(1)>')] }] },
    })

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})
