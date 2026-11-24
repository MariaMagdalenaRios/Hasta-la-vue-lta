import { describe, it, expect } from 'vitest';
import { htmlToRichText } from './htmlToRichText.js';

const text = (value, marks = []) => ({ nodeType: 'text', value, marks: marks.map((type) => ({ type })), data: {} });
const block = (nodeType, ...content) => ({ nodeType, data: {}, content });

describe('htmlToRichText', () => {
  it('converts the guide template: headings, paragraphs, list and italic', () => {
    const html = `
<h2>Om Leden</h2>
<p>En av de mest omtyckta.</p>
<h3>Bra att veta</h3>
<ul><li>Vindskydd</li><li>Ingen service</li></ul>
<p><em>Senast granskad.</em></p>`;
    const { document, warnings } = htmlToRichText(html);
    expect(warnings).toEqual([]);
    expect(document).toEqual({
      nodeType: 'document',
      data: {},
      content: [
        block('heading-2', text('Om Leden')),
        block('paragraph', text('En av de mest omtyckta.')),
        block('heading-3', text('Bra att veta')),
        block(
          'unordered-list',
          block('list-item', block('paragraph', text('Vindskydd'))),
          block('list-item', block('paragraph', text('Ingen service'))),
        ),
        block('paragraph', text('Senast granskad.', ['italic'])),
      ],
    });
  });

  it('keeps bold, italic and links inside a paragraph', () => {
    const { document } = htmlToRichText('<p>Se <a href="https://example.com/karta">kartan</a> och <strong>var <em>försiktig</em></strong>.</p>');
    expect(document.content).toEqual([
      block(
        'paragraph',
        text('Se '),
        { nodeType: 'hyperlink', data: { uri: 'https://example.com/karta' }, content: [text('kartan')] },
        text(' och '),
        text('var ', ['bold']),
        text('försiktig', ['bold', 'italic']),
        text('.'),
      ),
    ]);
  });

  it('decodes entities', () => {
    const { document } = htmlToRichText('<p>Bro &amp; vindskydd &lt;1 km</p>');
    expect(document.content[0].content[0].value).toBe('Bro & vindskydd <1 km');
  });

  it('wraps loose text in a paragraph', () => {
    const { document } = htmlToRichText('Bara text');
    expect(document.content).toEqual([block('paragraph', text('Bara text'))]);
  });

  it('reports tags the content type does not allow, and keeps their text', () => {
    const { document, warnings } = htmlToRichText('<ol><li>Ett</li></ol><p>Hej <u>du</u></p>');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('<ol>');
    expect(warnings[1]).toContain('<u>');
    expect(document.content[0].nodeType).toBe('unordered-list');
    expect(document.content[1].content.map((node) => node.value).join('')).toBe('Hej du');
  });

  it('gives a valid document for empty input', () => {
    expect(htmlToRichText('').document.content).toEqual([block('paragraph')]);
  });
});
