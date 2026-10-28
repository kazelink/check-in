// 常用笔记：列表渲染与交互；富文本编辑在 note-editor.js，内容清洗在 note-format.js

import { $, esc, genId } from './util.js';
import { S } from './ctx.js';
import { commit } from './store.js';
import { toast, swalConfirm, swalUnsaved } from './ui.js';
import { icon } from './icons.js';
import { sanitize, titleOf, timeText } from './note-format.js';
import * as editor from './note-editor.js';

let leaveBusy = false; // 未保存确认弹窗打开期间，避免重复触发

const noteById = (id) => (S.data.notes || []).find((n) => n.id === id);

const editItem = () => (S.ntEdit
  ? $('ntList')?.querySelector(`.nt-item[data-nt="${CSS.escape(S.ntEdit)}"]`)
  : null);

/* ---------------- 列表 ---------------- */

function itemHtml(n) {
  const editing = n.id === S.ntEdit;
  const open = editing || n.id === S.ntOpen;
  const acts = editing
    ? '<button type="button" class="nt-btn" data-cancel>取消</button>'
      + '<button type="button" class="nt-btn primary" data-save>保存</button>'
    : `<button type="button" class="nt-btn icon" data-edit title="编辑" aria-label="编辑">${icon('edit')}</button>`
      + `<button type="button" class="nt-btn icon del" data-del title="删除" aria-label="删除">${icon('trash')}</button>`;

  const head = editing
    ? `<div class="nt-hd edit">
      <input type="text" class="nt-title" maxlength="80" placeholder="标题" autocomplete="off" value="${esc(n.t || '')}">
      <span class="nt-acts">${acts}</span>
    </div>`
    : `<div class="nt-hd">
      <span class="nt-t" title="${esc(titleOf(n))}">${esc(titleOf(n))}</span>
      <span class="nt-d">${esc(timeText(n.u))}</span>
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
  if (!box) return;

  const list = S.data.notes || [];
  $('ntCount').textContent = list.length ? `${list.length} 条` : '';

  // 正在编辑且有未保存内容时（如点同步触发的重绘）不重建 DOM，避免吞掉草稿
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

/* ---------------- 编辑态进出 ---------------- */

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
    // 同步可能已用远端数据整体替换 S.data，草稿对象不在数组里时补回去
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

/* ---------------- 交互 ---------------- */

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

export function init() {
  $('ntAdd').onclick = () => { createNote(); };

  $('ntList').onclick = async (e) => {
    const item = e.target.closest('[data-nt]');
    if (!item) return;
    const id = item.dataset.nt;

    if (e.target.closest('[data-save]')) { saveEditor(); return; }
    if (e.target.closest('[data-cancel]')) { await leaveEditor(); return; }
    if (e.target.closest('[data-edit]')) { startEdit(id); return; }
    if (e.target.closest('[data-del]')) { removeNote(id); return; }
    if (!e.target.closest('.nt-hd')) return;      // 正文/编辑器内部点击不折叠
    if (S.ntEdit === id) return;                   // 正在编辑时不折叠

    if (!(await leaveEditor())) return;
    S.ntOpen = S.ntOpen === id ? null : id;
    render();
  };
}
