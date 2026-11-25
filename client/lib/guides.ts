import type { Guide } from '@utpost/shared'

/** A guide in the list. The card shows a plain-text excerpt from the CMS, not the HTML body. */
export type GuideSummary = Omit<Guide, 'body_html'> & { excerpt: string }

/** The search matches the start of the title, case-insensitively and trimmed. */
export const filterGuidesByTitle = <T extends Pick<Guide, 'title'>>(guides: T[], query: string): T[] => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return guides

  return guides.filter((guide) => guide.title.toLowerCase().startsWith(needle))
}
