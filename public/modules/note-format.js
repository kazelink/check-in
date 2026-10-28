
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

export function sanitize(html) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  const doc = new DOMParser().parseFromString(src, 'text/html');
  const root = doc.body;
  root.querySelectorAll('*').forEach((el) => {
    if (DROP_TAGS.has(el.tagName)) { el.remove(); return; }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
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

export function timeText(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const p2 = (x) => String(x).padStart(2, '0');
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayD = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day0.getTime() - dayD.getTime()) / 86400000);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
