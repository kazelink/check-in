
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'HR', 'SPAN'
]);

const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE',
  'TRACK', 'LINK', 'META', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SVG',
  'CANVAS', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH'
]);

const SAFE_HREF = /^(https?:|mailto:)/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;

function safeStyle(styleText) {
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(String(styleText || ''));
  const value = match ? match[1].trim() : '';
  return SAFE_COLOR.test(value) ? `color:${value}` : '';
}

export function sanitize(html) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  const doc = new DOMParser().parseFromString(src, 'text/html');
  const root = doc.body;
  root.querySelectorAll('*').forEach((el) => {
    if (DROP_TAGS.has(el.tagName)) { el.remove(); return; }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name === 'style') {
        const kept = safeStyle(attr.value);
        if (kept) el.setAttribute('style', kept);
        else el.removeAttribute('style');
        continue;
      }
      const keepHref = name === 'href' && el.tagName === 'A' && SAFE_HREF.test(attr.value.trim());
      if (!keepHref) el.removeAttribute(attr.name);
    }
    if (!ALLOWED_TAGS.has(el.tagName)) el.replaceWith(...[...el.childNodes]);
  });
  return root.innerHTML.trim();
}

export function isBlank(html) {
  if (!html) return true;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return !doc.body.textContent.replace(/\u00a0/g, ' ').trim();
}

function plainText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function titleOf(note) {
  if (note.t) return note.t;
  const text = plainText(note.h);
  return text ? (text.length > 24 ? text.slice(0, 24) + '…' : text) : '未命名笔记';
}

