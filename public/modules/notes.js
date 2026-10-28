
import { $, esc, genId } from './util.js';
import { S } from './ctx.js';
import { commit } from './store.js';
import { toast, swalConfirm, swalUnsaved } from './ui.js';
import { icon } from './icons.js';
import { sanitize, titleOf } from './note-format.js';
import * as editor from './note-editor.js';

let leaveBusy = false;
let drag = null;
let dragSuppressUntil = 0;
const GRIP = `<button type="button" class="nt-grip" data-grip aria-label="拖动排序">${icon('drag')}</button>`;

const noteById = (id) => (S.data.notes || []).find((n) => n.id === id);

const editItem = () => (S.ntEdit
  ? $('ntList')?.querySelector(`.nt-item[data-nt="${CSS.escape(S.ntEdit)}"]`)
  : null);

function itemHtml(n) {
  const editing = n.id === S.ntEdit;
  const open = editing || n.id === S.ntOpen;
  const acts = editing
    ? '<button type="button" class="nt-btn" data-cancel>取消</button>'
      + '<button type="button" class="nt-btn primary" data-save>保存</button>'
    : `<button type="button" class="nt-btn icon" data-edit aria-label="编辑">${icon('edit')}</button>`
      + `<button type="button" class="nt-btn icon del" data-del aria-label="删除">${icon('trash')}</button>`;

  const head = editing
    ? `<div class="nt-hd edit">
      <input type="text" class="nt-title" maxlength="80" placeholder="标题" autocomplete="off" value="${esc(n.t || '')}">
      <span class="nt-acts">${acts}</span>
    </div>`
    : `<div class="nt-hd">
      ${S.ntEdit ? '' : GRIP}
      <span class="nt-t">${esc(titleOf(n))}</span>
      <span class="nt-acts">${acts}</span>
    </div>`;

  let body = '';
  if (editing) body = '<div class="nt-editor"></div>';
  else if (open) {
    const html = sanitize(n.h);
    body = `<div class="nt-body">${html || '<p class="nt-blank">空白笔记</p>'}</div>`;
  }

  return `<div class="nt-item${open ? ' open' : ''}" data-nt="${esc(n.id)}">${head}${body}</div>`;
}

export function render() {
  const box = $('ntList');
  if (!box || drag) return;

  const list = S.data.notes || [];
  if (S.ntEdit && editor.isActive() && editor.isDirty(editItem())) return;

  editor.reset();

  if (S.ntEdit && !noteById(S.ntEdit)) { S.ntEdit = null; S.ntNew = false; }
  if (S.ntOpen && !noteById(S.ntOpen)) S.ntOpen = null;

  if (!list.length) {
    box.innerHTML = '<div class="empty">点右上角按钮，写下第一条常用笔记</div>';
    return;
  }

  box.innerHTML = list.map(itemHtml).join('');
  if (S.ntEdit) mountEditor();
}

function mountEditor() {
  const note = noteById(S.ntEdit);
  const item = editItem();
  if (!note || !item) return;

  const focusTitle = S.ntFocusTitle;
  S.ntFocusTitle = false;
  editor.mount(item, note, { onSave: saveEditor, onLeave: leaveEditor, focusTitle });
}

function isDirty() {
  return editor.isDirty(editItem());
}

function exitEdit() {
  if (S.ntEdit && S.ntNew) {
    S.data.notes = (S.data.notes || []).filter((n) => n.id !== S.ntEdit);
  }
  S.ntEdit = null;
  S.ntNew = false;
  editor.reset();
}

function saveEditor() {
  const item = editItem();
  if (!item) { exitEdit(); render(); return; }

  const { t, h } = editor.draft(item);

  if (S.ntNew && !t && !h) {
    commit(() => {
      S.ntOpen = null;
      exitEdit();
    }, render);
    toast('已放弃空白笔记');
    return;
  }

  commit(() => {
    let note = noteById(S.ntEdit);
    if (!note) {
      note = { id: S.ntEdit, t: '', h: '', u: 0 };
      if (!Array.isArray(S.data.notes)) S.data.notes = [];
      S.data.notes.unshift(note);
    }
    note.t = t;
    note.h = h;
    note.u = Date.now();
    S.ntOpen = note.id;
    S.ntEdit = null;
    S.ntNew = false;
    editor.reset();
  }, render);

  toast('已保存');
}

function cancelEditor() {
  const wasNew = S.ntNew;
  const openId = wasNew ? null : S.ntEdit;
  commit(() => {
    S.ntOpen = openId;
    exitEdit();
  }, render);
}

async function leaveEditor() {
  if (!S.ntEdit) return true;
  if (leaveBusy) return false;
  if (!isDirty()) { cancelEditor(); return true; }
  leaveBusy = true;
  try {
    const r = await swalUnsaved();
    if (r === 'cancel') return false;
    if (r === 'save') { saveEditor(); return true; }
    cancelEditor();
    return true;
  } finally {
    leaveBusy = false;
  }
}

async function createNote() {
  if (!(await leaveEditor())) return;
  if (!Array.isArray(S.data.notes)) S.data.notes = [];
  const note = { id: genId('n'), t: '', h: '', u: Date.now() };
  S.data.notes.unshift(note);
  S.ntNew = true;
  S.ntEdit = note.id;
  S.ntOpen = note.id;
  S.ntFocusTitle = true;
  render();
}

async function startEdit(id) {
  if (S.ntEdit === id) return;
  if (!(await leaveEditor())) return;
  S.ntNew = false;
  S.ntEdit = id;
  S.ntOpen = id;
  render();
}

async function removeNote(id) {
  const note = noteById(id);
  if (!note) return;
  const ok = await swalConfirm(`删除「${titleOf(note)}」？`, '删除后无法恢复');
  if (!ok) return;

  commit(() => {
    S.data.notes = (S.data.notes || []).filter((n) => n.id !== id);
    if (S.ntEdit === id) { S.ntEdit = null; S.ntNew = false; editor.reset(); }
    if (S.ntOpen === id) S.ntOpen = null;
  }, render);

  toast('已删除');
}

function startDrag(e) {
  if (S.ntEdit) return;
  const grip = e.target.closest('[data-grip]');
  if (!grip) return;
  const item = grip.closest('.nt-item');
  if (!item) return;
  e.preventDefault();
  drag = { item, pointerId: e.pointerId };
  item.classList.add('nt-dragging');
  dragSuppressUntil = Date.now() + 400;
}

function moveDrag(e) {
  if (!drag || drag.pointerId !== e.pointerId) return;
  e.preventDefault();
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.nt-item');
  const row = drag.item;
  if (!target || target === row || !target.closest('#ntList')) return;
  const list = $('ntList');
  const rows = [...list.querySelectorAll('.nt-item')];
  const from = rows.indexOf(row), to = rows.indexOf(target);
  list.insertBefore(row, from < to ? target.nextSibling : target);
}

function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.pointerId)) return;
  const done = drag;
  drag = null;
  dragSuppressUntil = Date.now() + 250;
  done.item.classList.remove('nt-dragging');
  if (!done.item.isConnected) return;

  const ids = [...$('ntList').querySelectorAll('.nt-item')].map((el) => el.dataset.nt);
  const list = S.data.notes || [];
  if (ids.join() === list.map((n) => n.id).join()) return;

  commit(() => {
    S.data.notes = ids.map((nid) => list.find((n) => n.id === nid)).filter(Boolean);
  }, render);
}

export function init() {
  $('ntAdd').onclick = () => { createNote(); };

  $('ntList').addEventListener('pointerdown', startDrag);
  document.addEventListener('pointermove', moveDrag, { passive: false });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', () => endDrag(null));

  $('ntList').onclick = async (e) => {
    if (e.target.closest('[data-grip]') || Date.now() < dragSuppressUntil) {
      e.preventDefault();
      return;
    }
    const item = e.target.closest('[data-nt]');
    if (!item) return;
    const id = item.dataset.nt;

    if (e.target.closest('[data-save]')) { saveEditor(); return; }
    if (e.target.closest('[data-cancel]')) { await leaveEditor(); return; }
    if (e.target.closest('[data-edit]')) { startEdit(id); return; }
    if (e.target.closest('[data-del]')) { removeNote(id); return; }
    if (!e.target.closest('.nt-hd')) return;
    if (S.ntEdit === id) return;

    if (!(await leaveEditor())) return;
    S.ntOpen = S.ntOpen === id ? null : id;
    render();
  };
}
