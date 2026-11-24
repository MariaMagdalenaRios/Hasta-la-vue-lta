// Turns the HTML in guides.body_html into a Contentful Rich Text document (M9, #161).
// It only knows the blocks the `guide.body` field allows (docs/decisions/cms.md): paragraph,
// heading 2 and 3, unordered list, bold, italic and links. Anything else is reported in
// `warnings` and its text is kept, so no words are lost.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]);

const HEADINGS = { h2: 'heading-2', h3: 'heading-3' };
const MARKS = { em: 'italic', i: 'italic', strong: 'bold', b: 'bold' };

// Removes empty text and empty links, so trimming below can look at real content only.
const clean = (nodes) =>
  nodes.filter((node) => {
    if (node.nodeType !== 'hyperlink') return node.value !== '';
    node.content = clean(node.content);
    return node.content.length > 0;
  });

// First (side 0) or last (side 1) text node, looking inside links.
const edgeText = (nodes, side) => {
  let node = nodes[side === 0 ? 0 : nodes.length - 1];
  while (node && node.nodeType === 'hyperlink') {
    node = node.content[side === 0 ? 0 : node.content.length - 1];
  }
  return node;
};

// A block must not start or end with the spaces that HTML line breaks leave behind.
const trimEdges = (inline) => {
  let nodes = clean(inline);
  for (const side of [0, 1]) {
    for (;;) {
      const edge = edgeText(nodes, side);
      if (!edge) break;
      edge.value = side === 0 ? edge.value.trimStart() : edge.value.trimEnd();
      if (edge.value !== '') break;
      nodes = clean(nodes);
    }
  }
  return nodes;
};

const attribute = (attrs, name) => {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2]) : null;
};

export function htmlToRichText(html) {
  const warnings = [];
  const content = []; // finished top-level blocks
  let list = null; // open unordered-list
  let item = null; // open list-item
  let block = null; // open paragraph or heading
  let link = null; // open hyperlink
  const marks = []; // open bold / italic

  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const closeBlock = () => {
    if (!block) return;
    block.content = trimEdges(block.content);
    if (block.content.length > 0) (item ? item.content : content).push(block);
    block = null;
    link = null;
  };
  const closeItem = () => {
    if (!item) return;
    if (item.content.length > 0) list.content.push(item);
    item = null;
  };
  const closeList = () => {
    if (!list) return;
    if (list.content.length > 0) content.push(list);
    list = null;
  };
  const openBlock = (nodeType) => {
    block = { nodeType, data: {}, content: [] };
  };
  const addText = (raw) => {
    const value = decode(raw).replace(/\s+/g, ' ');
    if (!block && value.trim() === '') return;
    if (!block) {
      if (list && !item) item = { nodeType: 'list-item', data: {}, content: [] };
      openBlock('paragraph');
    }
    const node = { nodeType: 'text', value, marks: marks.map((type) => ({ type })), data: {} };
    (link ? link.content : block.content).push(node);
  };

  const tokens = String(html ?? '').matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi);
  for (const [, closing, rawName, attrs = '', text] of tokens) {
    if (text !== undefined) {
      addText(text);
      continue;
    }
    const name = rawName.toLowerCase();

    if (closing) {
      if (name === 'p' || name in HEADINGS) closeBlock();
      else if (name === 'li') {
        closeBlock();
        closeItem();
      } else if (name === 'ul' || name === 'ol') {
        closeBlock();
        closeItem();
        closeList();
      } else if (name in MARKS) {
        const at = marks.lastIndexOf(MARKS[name]);
        if (at !== -1) marks.splice(at, 1);
      } else if (name === 'a') link = null;
      continue;
    }

    if (name === 'p' || name in HEADINGS) {
      closeBlock();
      openBlock(HEADINGS[name] ?? 'paragraph');
    } else if (name === 'ul' || name === 'ol') {
      closeBlock();
      closeItem();
      closeList();
      if (name === 'ol') warn('<ol> is not allowed in guide.body: written as a bullet list');
      list = { nodeType: 'unordered-list', data: {}, content: [] };
    } else if (name === 'li') {
      closeBlock();
      closeItem();
      if (!list) list = { nodeType: 'unordered-list', data: {}, content: [] };
      item = { nodeType: 'list-item', data: {}, content: [] };
    } else if (name in MARKS) {
      marks.push(MARKS[name]);
    } else if (name === 'a') {
      const href = attribute(attrs, 'href');
      if (href) {
        if (!block) {
          if (list && !item) item = { nodeType: 'list-item', data: {}, content: [] };
          openBlock('paragraph');
        }
        link = { nodeType: 'hyperlink', data: { uri: decode(href) }, content: [] };
        block.content.push(link);
      } else warn('<a> without href: written as plain text');
    } else if (name === 'br') {
      addText(' ');
    } else {
      warn(`<${name}> is not allowed in guide.body: its text is kept, the tag is dropped`);
    }
  }
  closeBlock();
  closeItem();
  closeList();

  // guide.body is required, so an empty source still gives a valid document.
  if (content.length === 0) content.push({ nodeType: 'paragraph', data: {}, content: [] });
  return { document: { nodeType: 'document', data: {}, content }, warnings };
}
