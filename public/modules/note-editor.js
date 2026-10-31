
import Squire from '../assets/squire.mjs';
import { icon } from './icons.js';
import { sanitize, isBlank } from './note-format.js';

const HEADING_BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);

const TOOLBAR = [
  { cmd: 'bold', ic: 'bold', tip: '加粗' },
  { cmd: 'italic', ic: 'italic', tip: '斜体' },
  { cmd: 'underline', ic: 'underline', tip: '下划线' },
  { cmd: 'strike', ic: 'strike', tip: '删除线' },
  { sep: true },
  { pick: 'color', tip: '文字颜色' },
  { sep: true },
  { cmd: 'quote', ic: 'quote', tip: '引用' },
  { cmd: 'ul', ic: 'ul', tip: '无序列表' },
  { cmd: 'ol', ic: 'ol', tip: '有序列表' },
  { sep: true },
  { cmd: 'undo', ic: 'undo', tip: '撤销' },
  { cmd: 'redo', ic: 'redo', tip: '重做' },
  { cmd: 'clear', ic: 'clear', tip: '清除格式' }
];

let closeHandler = null;

function closeColors(host) {
  host?.querySelector('.nt-colors')?.setAttribute('hidden', '');
}

function toggleColors(host) {
  const pop = host.querySelector('.nt-colors');
  if (!pop) return;
  pop.hidden = !pop.hidden;
}

function bindClose(host) {
  unbindClose();
  closeHandler = (e) => {
    if (!(/** @type {any} */ (e.target))?.closest?.('.nt-color-wrap')) closeColors(host);
  };
  document.addEventListener('mousedown', closeHandler);
}

function unbindClose() {
  if (closeHandler) document.removeEventListener('mousedown', closeHandler);
  closeHandler = null;
}

/** @type {any} */
let sq = null;
/** @type {Element|null} */
let hostEl = null;
let base = { t: '', h: '' };

export const isActive = () => Boolean(sq);

function fragmentOf(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = sanitize(html);
  return tpl.content;
}

const TEXT_COLORS = ['#1b1d22', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

function colorPicker() {
  const dots = TEXT_COLORS.map((c) => (
    `<button type="button" class="nt-color" data-color="${c}" style="--c:${c}" aria-label="${c}" tabindex="-1"></button>`
  )).join('');

  return `<span class="nt-color-wrap">
    <button type="button" class="nt-tb-btn" data-color-btn aria-label="文字颜色" tabindex="-1">${icon('fontColor')}</button>
    <span class="nt-colors" hidden>${dots}</span>
  </span>`;
}

function editorHtml() {
  const btns = TOOLBAR.map((t) => {
    if (t.sep) return '<span class="nt-sep"></span>';
    if (t.pick === 'color') return colorPicker();
    return `<button type="button" class="nt-tb-btn" data-cmd="${t.cmd}" aria-label="${t.tip}" tabindex="-1">${icon(t.ic)}</button>`;
  }).join('');

  return `<div class="nt-tb">${btns}</div><div class="nt-area"></div>`;
}

function draftHtml() {
  const raw = sq ? sq.getHTML() : '';
  return isBlank(raw) ? '' : sanitize(raw);
}

export function draft(item) {
  const t = (item?.querySelector('.nt-title')?.value || '').trim();
  return { t, h: draftHtml() };
}

export function isDirty(item) {
  if (!sq || !item) return false;
  const current = draft(item);
  return current.t !== base.t || current.h !== base.h;
}

export function reset() {
  unbindClose();
  sq = null;
  hostEl = null;
  base = { t: '', h: '' };
}

/**
 * @param {HTMLElement} item
 * @param {{ t?: string, h?: string }} note
 * @param {{ onSave: () => void, onLeave: () => void, focusTitle?: boolean }} handlers
 */
export function mount(item, note, handlers) {
  const host = item?.querySelector('.nt-editor');
  if (!host) return;

  hostEl = host;
  host.innerHTML = editorHtml();
  const area = /** @type {HTMLElement} */ (host.querySelector('.nt-area'));
  const title = item.querySelector('.nt-title');

  sq = new Squire(area, { blockTag: 'P', sanitizeToDOMFragment: fragmentOf });
  sq.setHTML(sanitize(note.h) || '');
  base = { t: (title?.value || '').trim(), h: draftHtml() };

  host.querySelector('.nt-tb')?.addEventListener('mousedown', (e) => {
    const colorBtn = e.target.closest('[data-color-btn]');
    if (colorBtn) {
      e.preventDefault();
      toggleColors(host);
      return;
    }
    const dot = e.target.closest('[data-color]');
    if (dot) {
      e.preventDefault();
      ensureSelection();
      sq.setTextColor(/** @type {HTMLElement} */ (dot).dataset.color);
      closeColors(host);
      syncToolbar();
      return;
    }
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    run(btn.dataset.cmd);
  });

  bindClose(host);

  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handlers.onSave();
    }
  });
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') handlers.onLeave();
  });

  sq.addEventListener('pathChange', syncToolbar);
  sq.addEventListener('select', syncToolbar);
  sq.addEventListener('cursor', syncToolbar);
  syncToolbar();

  if (handlers.focusTitle) {
    title?.focus();
    title?.select();
  } else {
    area.focus({ preventScroll: true });
  }
}

function ensureSelection() {
  if (!sq) return;
  const root = sq.getRoot();
  const r = sq.getSelection();
  if (root.contains(r.startContainer)) return;
  const nr = document.createRange();
  nr.selectNodeContents(root);
  nr.collapse(false);
  sq.setSelection(nr);
}

function currentBlock() {
  if (!sq) return null;
  const root = sq.getRoot();
  let node = sq.getSelection().startContainer;
  if (node.nodeType === 3) node = node.parentNode;
  while (node && node.parentNode !== root) node = node.parentNode;
  return node;
}

function quoteNode() {
  if (!sq) return null;
  let node = sq.getSelection().startContainer;
  if (node.nodeType === 3) node = node.parentNode;
  const bq = node?.closest?.('blockquote');
  return bq && sq.getRoot().contains(bq) ? bq : null;
}

function listAtCursor(tag) {
  if (!sq) return null;
  const root = sq.getRoot();
  const r = sq.getSelection();
  for (const node of [r.startContainer, r.endContainer]) {
    const el = node.nodeType === 3 ? node.parentNode : node;
    const list = el?.closest?.(tag.toLowerCase());
    if (list && root.contains(list)) return list;
  }
  return null;
}

function replaceBlockTag(block, tag) {
  if (!HEADING_BLOCKS.has(block.nodeName) || block.nodeName === tag) return;
  const el = document.createElement(tag);
  while (block.firstChild) el.appendChild(block.firstChild);
  block.parentNode.replaceChild(el, block);
}

function toggleHeading(tag) {
  const blocks = [];
  sq.forEachBlock((block) => { if (HEADING_BLOCKS.has(block.nodeName)) blocks.push(block); });
  if (!blocks.length) return;
  const next = blocks.every((b) => b.nodeName === tag) ? 'P' : tag;
  sq.modifyBlocks((frag) => {
    Array.from(frag.childNodes).forEach((b) => replaceBlockTag(b, next));
    return frag;
  });
}

function removeList(list) {
  const range = sq.getSelection();
  sq.saveUndoState(range);

  const blocks = [];
  for (const li of Array.from(list.children)) {
    if (li.nodeName !== 'LI') { blocks.push(li.cloneNode(true)); continue; }
    const p = document.createElement('P');
    while (li.firstChild) p.appendChild(li.firstChild);
    blocks.push(p);
  }
  const frag = document.createDocumentFragment();
  blocks.forEach((b) => frag.appendChild(b));
  list.replaceWith(frag);
  sq._docWasChanged?.();

  try {
    const r = document.createRange();
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    r.setStart(first, 0);
    r.setEnd(last, last.childNodes.length);
    sq.setSelection(r);
  } catch {
    sq.focus();
  }
}

function run(cmd) {
  if (!sq) return;
  ensureSelection();
  switch (cmd) {
    case 'bold': sq.hasFormat('B') ? sq.removeBold() : sq.bold(); break;
    case 'italic': sq.hasFormat('I') ? sq.removeItalic() : sq.italic(); break;
    case 'underline': sq.hasFormat('U') ? sq.removeUnderline() : sq.underline(); break;
    case 'strike': sq.hasFormat('S') ? sq.removeStrikethrough() : sq.strikethrough(); break;
    case 'h1': toggleHeading('H1'); break;
    case 'h2': toggleHeading('H2'); break;
    case 'quote': quoteNode() ? sq.removeQuote() : sq.increaseQuoteLevel(); break;
    case 'ul': {
      const ul = listAtCursor('UL');
      ul ? removeList(ul) : sq.makeUnorderedList();
      break;
    }
    case 'ol': {
      const ol = listAtCursor('OL');
      ol ? removeList(ol) : sq.makeOrderedList();
      break;
    }
    case 'undo': sq.undo(); break;
    case 'redo': sq.redo(); break;
    case 'clear': sq.removeAllFormatting(); break;
    default: break;
  }
  sq.focus();
  syncToolbar();
}

function syncToolbar() {
  if (!sq || !hostEl) return;
  const block = currentBlock();
  const set = (cmd, on) => {
    const btn = hostEl.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('on', Boolean(on));
  };
  set('bold', sq.hasFormat('B'));
  set('italic', sq.hasFormat('I'));
  set('underline', sq.hasFormat('U'));
  set('strike', sq.hasFormat('S'));
  set('h1', block?.nodeName === 'H1');
  set('h2', block?.nodeName === 'H2');
  set('quote', Boolean(quoteNode()));
  set('ul', Boolean(listAtCursor('UL')));
  set('ol', Boolean(listAtCursor('OL')));
}
