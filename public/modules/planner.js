import { $, SH, TYPES, tCls, fmt, todayStr, parseDs, esc, fmtT, genId, dispDate } from './util.js';
import { S, R } from './ctx.js';
import { toast, swalConfirm, swalUnsaved } from './ui.js';
import { save } from './store.js';

const dayPlans = () => S.data.plans[S.selDate] || [];

let blkTap = null;   // 块上的按下点：抬起未位移才算点按打开，滑动滚屏不误触
let lineSort = null;
let lineSortSuppressUntil = 0;

const LINE_SORT_LONG_PRESS_MS = 360;
const LINE_SORT_CANCEL_PX = 8;

export function renderPlan() {
  const tv = S.typeView;
  $('dPrev').style.display = tv ? 'none' : '';
  $('dNext').style.display = tv ? 'none' : '';
  $('tvBack').style.display = tv ? '' : 'none';
  $('modeBtn').style.display = tv ? 'none' : '';

  if (tv) {
    const ty = TYPES.find((x) => x.k === tv);
    const now = new Date();
    const y = S.vD.getFullYear(), m = S.vD.getMonth();
    $('plDate').textContent = `${y !== now.getFullYear() ? y + '年' : ''}${m + 1}月 · ${ty ? ty.n : ''}`;
    $('dToday').style.display = 'none';
    $('plRangeSel').style.display = 'none';
    $('plEdit').style.display = 'none';
    $('plView').style.display = '';
    renderTypeView();
    return;
  }

  const t = todayStr();
  $('plDate').textContent = dispDate(S.selDate);
  $('dToday').style.display = S.selDate === t ? 'none' : '';
  $('modeBtn').textContent = S.editMode ? '完成' : '编辑';
  $('modeBtn').classList.toggle('on', S.editMode);
  $('plRangeSel').style.display = S.editMode ? '' : 'none';
  $('plEdit').style.display = S.editMode ? '' : 'none';
  $('plView').style.display = S.editMode ? 'none' : '';
  if (S.editMode) renderEdit(); else renderView();
}

export function setTypeView(k) {
  if (S.edit) commitEditor();
  S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null;
  S.typeView = S.typeView === k ? null : k;
  renderPlan();
  R.stats();
}

function renderTypeView() {
  const pre = `${S.vD.getFullYear()}-${String(S.vD.getMonth() + 1).padStart(2, '0')}`;
  const days = Object.keys(S.data.plans).filter((k) => k.startsWith(pre)).sort();
  let html = '';
  for (const ds of days) {
    const ps = S.data.plans[ds].filter((p) => p.t === S.typeView).sort((a, b) => a.s - b.s);
    if (!ps.length) continue;
    html += `<div class="tv-date" data-jump="${ds}">${dispDate(ds, 1)}</div>`;
    html += ps.map((p) => `<div class="pv-it ${tCls(p.t)}" data-jump="${ds}" title="点击查看当天日程">
        <span class="pv-t">${fmtT(p.s)} – ${fmtT(p.e)}</span>
        <div class="pv-ns">${p.items.map((x) =>
      `<div class="pv-n${x.d ? ' done' : ''}" title="${esc(x.n)}"><i class="pv-ck">${x.d ? '✓' : ''}</i><span>${esc(x.n)}</span></div>`).join('')}</div>
      </div>`).join('');
  }
  $('plView').innerHTML = html || '<div class="empty">该月暂无此类型日程</div>';
}

export function renderView() {
  const all = dayPlans().slice().sort((a, b) => a.s - b.s);
  if (!all.length) {
    $('plView').innerHTML = '<div class="empty">暂无日程</div>';
    return;
  }
  const isToday = S.selDate === todayStr();
  const n = new Date(), nowMin = n.getHours() * 60 + n.getMinutes();
  $('plView').innerHTML = all.map((p) => {
    const st = isToday && p.s <= nowMin && p.e > nowMin ? ' cur' : '';
    return `<div class="pv-it${st} ${tCls(p.t)}">
      <span class="pv-t">${fmtT(p.s)} – ${fmtT(p.e)}</span>
      <div class="pv-ns">${p.items.map((x, j) =>
      `<div class="pv-n${x.d ? ' done' : ''}" data-tg="${p.id}:${j}" title="${esc(x.n)}"><i class="pv-ck">${x.d ? '✓' : ''}</i><span>${esc(x.n)}</span></div>`).join('')}</div>
      ${st ? '<span class="pv-tag">进行中</span>' : ''}
    </div>`;
  }).join('');
}

function renderEdit() {
  const RS = S.data.range.s * 60, RE = S.data.range.e * 60, n = (RE - RS) / 30;
  const all = dayPlans().slice().sort((a, b) => a.s - b.s);
  const vis = all.filter((p) => p.e > RS && p.s < RE && p.id !== (S.edit && S.edit.id));
  S.occ = new Set();
  vis.forEach((p) => {
    const i0 = Math.max(0, Math.floor((p.s - RS) / 30));
    const i1 = Math.min(n - 1, Math.ceil((p.e - RS) / 30) - 1);
    for (let i = i0; i <= i1; i++) S.occ.add(i);
  });

  let rows = '';
  for (let i = 0; i < n; i++) {
    const m = RS + i * 30;
    rows += `<div class="pl-row"><span class="pl-lb">${m % 60 ? '' : fmtT(m)}</span><div class="pl-cell" data-i="${i}"></div></div>`;
  }
  rows += `<div class="pl-row pl-end"><span class="pl-lb">${fmtT(RE)}</span><div class="pl-cell"></div></div>`;
  $('plRows').innerHTML = rows;

  $('plBlocks').innerHTML = vis.map((p) => {
    const cs = Math.max(p.s, RS), ce = Math.min(p.e, RE);
    const top = (cs - RS) / 30 * SH, h = (ce - cs) / 30 * SH;
    const timeTxt = `${fmtT(p.s)}–${fmtT(p.e)}` + (p.items.length > 1 ? ` · ${p.items.length}项` : '');
    const lines = p.items.map((x, j) =>
      `<div class="blk-ln"><span class="${x.d ? 'dn' : ''}">${esc(x.n)}</span>${j === 0 ? `<i>${timeTxt}</i>` : ''}</div>`).join('');
    return `<div class="pl-blk ${tCls(p.t)}" data-pb="${p.id}" style="top:${top + 1}px;height:${h - 2}px"
      title="${fmtT(p.s)}–${fmtT(p.e)} ${esc(p.items.map((x) => x.n).join('、'))}">
      ${lines}
      <button type="button" class="pl-bx" data-px="${p.id}" title="删除">✕</button>
      <div class="rz rz-t"></div><div class="rz rz-b"></div>
    </div>`;
  }).join('');

  const hidden = all.length - all.filter((p) => p.e > RS && p.s < RE).length;
  $('plHint').textContent = hidden ? `有 ${hidden} 条日程在当前时间范围之外` : '';
  $('plHint').style.display = hidden ? '' : 'none';

  updGhost(); updNow();
}

function updGhost() {
  const g = $('plGhost');
  if ((!S.selecting && !S.picking) || S.selA == null) { g.style.display = 'none'; return; }
  const RS = S.data.range.s * 60;
  const a = Math.min(S.selA, S.selB), b = Math.max(S.selA, S.selB);
  g.style.display = 'flex';
  g.style.top = a * SH + 1 + 'px';
  g.style.height = (b - a + 1) * SH - 2 + 'px';
  g.textContent = `${fmtT(RS + a * 30)} – ${fmtT(RS + (b + 1) * 30)}`;
}

function cancelPick() {
  S.picking = false;
  S.selA = S.selB = null;
  updGhost();
}

export function updNow() {
  const el = $('nowLine'), n = new Date();
  const RS = S.data.range.s * 60, RE = S.data.range.e * 60;
  const min = n.getHours() * 60 + n.getMinutes();
  if (!S.editMode || S.selDate !== todayStr() || min < RS || min > RE) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.style.top = (min - RS) / 30 * SH + 'px';
}

function clampTo(a, b) {
  const step = b >= a ? 1 : -1;
  let last = a;
  for (let i = a; i !== b + step; i += step) {
    if (S.occ.has(i)) break;
    last = i;
  }
  return last;
}

function openEditor(p, s, e) {
  if (S.edit) commitEditor();
  S.edit = p
    ? { id: p.id, s: p.s, e: p.e, t: p.t }
    : { id: null, s, e, t: S.data.lastT || 'w' };
  S.edit.orig = JSON.stringify({ s: S.edit.s, e: S.edit.e, t: S.edit.t, items: p ? p.items.map((x) => x.n) : [] });
  renderPlan();
  buildEditor(p ? p.items : []);
}

function editorTexts() {
  const el = $('blkEd');
  return el ? [...el.querySelectorAll('.be-i')].map((i) => i.value.trim()).filter(Boolean) : [];
}

function isEditorDirty() {
  if (!S.edit) return false;
  return JSON.stringify({ s: S.edit.s, e: S.edit.e, t: S.edit.t, items: editorTexts() }) !== S.edit.orig;
}

function discardEditor() {
  S.edit = null;
  const el = $('blkEd');
  if (el) el.remove();
  renderEdit();
}

function saveEditor() {
  const dirty = isEditorDirty();
  commitEditor();
  if (dirty) toast('已保存');
}

async function resolveEditorChanges() {
  if (!S.edit) return true;
  if (!isEditorDirty()) { commitEditor(); return true; }
  if (resolveEditorChanges._busy) return false;
  resolveEditorChanges._busy = true;
  try {
    const r = await swalUnsaved();
    if (r === 'save') saveEditor();
    else if (r === 'discard') discardEditor();
    else return false;
    return true;
  } finally {
    resolveEditorChanges._busy = false;
  }
}

function settleEditor() {
  resolveEditorChanges();
}

function buildEditor(items) {
  const RS = S.data.range.s * 60, RE = S.data.range.e * 60;
  const d = document.createElement('div');
  d.id = 'blkEd';
  d.className = 'blk-ed ' + tCls(S.edit.t);
  d.style.top = (Math.max(S.edit.s, RS) - RS) / 30 * SH + 'px';
  d.style.minHeight = Math.max(0, (Math.min(S.edit.e, RE) - Math.max(S.edit.s, RS)) / 30 * SH - 2) + 'px';

  const opts = (from, to, val) => {
    let h = '';
    for (let m = from; m <= to; m += 30) h += `<option value="${m}"${m === val ? ' selected' : ''}>${fmtT(m)}</option>`;
    return h;
  };
  d.innerHTML = `<div class="be-head">
      <span class="be-time">
        <select class="be-ts" data-be="s">${opts(RS, RE - 30, Math.max(RS, Math.min(S.edit.s, RE - 30)))}</select>
        <i>–</i>
        <select class="be-ts" data-be="e">${opts(RS + 30, RE, Math.min(RE, Math.max(S.edit.e, RS + 30)))}</select>
      </span>
      <span class="be-r">
        <span class="be-types">${TYPES.map((t) =>
    `<button type="button" class="be-dot ${t.cls}" data-t="${t.k}" title="${t.n}">${t.k === S.edit.t ? '✓' : ''}</button>`).join('')}</span>
        <button type="button" class="be-save">保存</button>
      </span>
    </div><div class="be-lines"></div>`;
  $('plMisc').appendChild(d);
  items.forEach((v) => addLine(v.n));
  addLine('', true);

  d.addEventListener('change', (ev) => {
    const sel = ev.target.closest('.be-ts');
    if (!sel) return;
    let s = S.edit.s, en = S.edit.e;
    if (sel.dataset.be === 's') { s = +sel.value; if (en <= s) en = Math.min(RE, s + 30); }
    else { en = +sel.value; if (en <= s) s = Math.max(RS, en - 30); }
    if (dayPlans().some((q) => q.id !== S.edit.id && q.s < en && q.e > s)) {
      toast('与已有日程重叠');
      d.querySelector('[data-be="s"]').value = S.edit.s;
      d.querySelector('[data-be="e"]').value = S.edit.e;
      return;
    }
    S.edit.s = s; S.edit.e = en;
    d.querySelector('[data-be="s"]').value = s;
    d.querySelector('[data-be="e"]').value = en;
    d.style.top = (Math.max(s, RS) - RS) / 30 * SH + 'px';
    d.style.minHeight = Math.max(0, (Math.min(en, RE) - Math.max(s, RS)) / 30 * SH - 2) + 'px';
  });

  d.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const ins = [...d.querySelectorAll('.be-i')];
      const i = ins.indexOf(ev.target);
      if (i < 0) return;
      if (!ev.target.value.trim() && i === ins.length - 1) { saveEditor(); return; }
      if (i === ins.length - 1) addLine('', true);
      else ins[i + 1].focus();
    } else if (ev.key === 'Backspace') {
      const ins = [...d.querySelectorAll('.be-i')];
      const i = ins.indexOf(ev.target);
      if (i > 0 && ev.target.value === '') {
        ev.preventDefault();
        ev.target.closest('.be-line')?.remove();
        ins[i - 1].focus();
      }
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const ins = [...d.querySelectorAll('.be-i')];
      const i = ins.indexOf(ev.target);
      if (i < 0) return;
      const j = ev.key === 'ArrowDown' ? i + 1 : i - 1;
      if (ins[j]) { ev.preventDefault(); ins[j].focus(); }
    }
  });

  d.addEventListener('pointerdown', (ev) => {
    if (ev.button && ev.button !== 0) return;
    const handle = ev.target.closest('[data-line-sort]');
    if (isCoarsePointer() && !handle) return;
    const inp = handle
      ? handle.closest('.be-line')?.querySelector('.be-i')
      : ev.target.closest('.be-i');
    if (!inp || !inp.value.trim()) return;
    if (handle) ev.preventDefault();

    clearLineSortTimer();
    lineSort = {
      inp,
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      active: false,
      changed: false,
      timer: handle ? null : setTimeout(() => activateLineSort(ev.pointerId), LINE_SORT_LONG_PRESS_MS)
    };
    if (handle) activateLineSort(ev.pointerId);
  });

  d.addEventListener('pointerdown', (ev) => {
    const dot = ev.target.closest('.be-dot');
    if (!dot) return;
    ev.preventDefault();
    S.edit.t = dot.dataset.t;
    d.className = 'blk-ed ' + tCls(S.edit.t);
    d.querySelectorAll('.be-dot').forEach((x) => x.textContent = x.dataset.t === S.edit.t ? '✓' : '');
  });

  d.addEventListener('click', (ev) => {
    if (Date.now() < lineSortSuppressUntil) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.target.closest('.be-save')) { saveEditor(); return; }
    if (ev.target === d || ev.target.classList.contains('be-lines')) {
      const ins = d.querySelectorAll('.be-i');
      if (ins.length) ins[ins.length - 1].focus();
    }
  });
}

function addLine(v = '', foc) {
  const row = document.createElement('div');
  row.className = 'be-line';
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'be-drag';
  handle.dataset.lineSort = '1';
  handle.title = '拖动排序';
  handle.setAttribute('aria-label', '拖动排序');
  handle.textContent = '☰';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'be-i';
  inp.maxLength = 60;
  inp.autocomplete = 'off';
  inp.value = v;
  row.appendChild(handle);
  row.appendChild(inp);
  $('blkEd').querySelector('.be-lines').appendChild(row);
  if (foc) inp.focus();
}

function clearLineSortTimer() {
  if (lineSort?.timer) clearTimeout(lineSort.timer);
}

function activateLineSort(pointerId) {
  if (!lineSort || lineSort.pointerId !== pointerId || !document.body.contains(lineSort.inp)) return;
  lineSort.active = true;
  lineSort.changed = false;
  lineSortSuppressUntil = Date.now() + 600;
  lineSort.inp.classList.add('sorting');
  $('blkEd')?.classList.add('sorting');
  lineSort.inp.blur();
}

function moveEditorLine(target) {
  const lines = $('blkEd')?.querySelector('.be-lines');
  if (!lines || !lineSort?.inp || !target || lineSort.inp === target) return false;

  const row = lineSort.inp.closest('.be-line');
  const targetRow = target.closest('.be-line');
  if (!row || !targetRow || row === targetRow) return false;

  const rows = [...lines.querySelectorAll('.be-line')];
  const from = rows.indexOf(row);
  const to = rows.indexOf(targetRow);
  if (from < 0 || to < 0 || from === to) return false;

  const targetIsBlank = !target.value.trim();
  const ref = from < to && !targetIsBlank ? targetRow.nextSibling : targetRow;
  lines.insertBefore(row, ref);
  lineSort.changed = true;
  return true;
}

function finishLineSort() {
  if (!lineSort) return;
  const wasActive = lineSort.active;
  clearLineSortTimer();
  lineSort.inp.classList.remove('sorting');
  $('blkEd')?.classList.remove('sorting');
  if (wasActive) {
    lineSortSuppressUntil = Date.now() + 600;
    if (!isCoarsePointer()) lineSort.inp.focus({ preventScroll: true });
  }
  lineSort = null;
}

function isCoarsePointer() {
  return window.matchMedia?.('(hover: none), (pointer: coarse)').matches;
}

function handleLineSortMove(e) {
  if (!lineSort || lineSort.pointerId !== e.pointerId) return false;
  const moved = Math.abs(e.clientX - lineSort.x) + Math.abs(e.clientY - lineSort.y);
  if (!lineSort.active && moved > LINE_SORT_CANCEL_PX) {
    finishLineSort();
    return false;
  }
  if (!lineSort.active) return false;

  e.preventDefault();
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const target = hit?.closest('.be-i') || hit?.closest('.be-line')?.querySelector('.be-i');
  if (target && target.closest('#blkEd')) moveEditorLine(target);
  return true;
}

function commitEditor() {
  if (!S.edit) return;
  const el = $('blkEd');
  const texts = editorTexts();
  const arr = dayPlans();
  if (S.edit.id) {
    const p = arr.find((q) => q.id === S.edit.id);
    if (p) {
      if (texts.length) {
        const old = p.items;
        p.items = texts.map((tx) => {   // 同名事项保留完成标记
          const m = old.find((o) => o.n === tx);
          return { n: tx, d: m ? m.d : 0 };
        });
        p.t = S.edit.t; p.s = S.edit.s; p.e = S.edit.e;
      } else {
        S.data.plans[S.selDate] = arr.filter((q) => q.id !== S.edit.id);
        if (!S.data.plans[S.selDate].length) delete S.data.plans[S.selDate];
      }
    }
  } else if (texts.length) {
    if (!S.data.plans[S.selDate]) S.data.plans[S.selDate] = [];
    S.data.plans[S.selDate].push({
      id: genId('p'), s: S.edit.s, e: S.edit.e, t: S.edit.t,
      items: texts.map((tx) => ({ n: tx, d: 0 }))
    });
  }
  S.data.lastT = S.edit.t;
  S.edit = null;
  if (el) el.remove();
  save(); renderEdit(); R.cal();
}

function startRz(id, edge, ev) {
  const RS = S.data.range.s * 60, RE = S.data.range.e * 60;
  const p = dayPlans().find((q) => q.id === id);
  if (!p) return;
  const others = dayPlans().filter((q) => q.id !== id);
  const lo = others.reduce((m, q) => q.e <= p.s ? Math.max(m, q.e) : m, RS);
  const hi = others.reduce((m, q) => q.s >= p.e ? Math.min(m, q.s) : m, RE);
  S.rz = { id, edge, p, lo, hi, s: p.s, e: p.e, el: $('plBlocks').querySelector(`[data-pb="${id}"]`) };
  S.dragRect = $('plRows').getBoundingClientRect();
  ev.preventDefault();
}

export function gotoDate(ds) {
  if (S.edit) commitEditor();
  S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null;
  S.typeView = null;
  S.selDate = ds;
  S.vD = parseDs(ds);
  R.cal(); renderPlan();
}

export function initRange() {
  let o1 = '', o2 = '';
  for (let h = 0; h <= 23; h++) o1 += `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`;
  for (let h = 1; h <= 24; h++) o2 += `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`;
  $('rs').innerHTML = o1; $('re').innerHTML = o2;
  $('rs').value = S.data.range.s; $('re').value = S.data.range.e;
  const onCh = () => {
    if (S.edit) commitEditor();
    S.data.range.s = +$('rs').value;
    S.data.range.e = +$('re').value;
    if (S.data.range.e <= S.data.range.s) {
      S.data.range.e = S.data.range.s + 1;
      $('re').value = S.data.range.e;
    }
    save(); S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null; renderPlan();
  };
  $('rs').onchange = onCh;
  $('re').onchange = onCh;
}

export function init() {
  $('plView').onclick = (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) { gotoDate(j.dataset.jump); return; }
    const n = e.target.closest('[data-tg]');
    if (!n) return;
    const [pid, idx] = n.dataset.tg.split(':');
    const p = dayPlans().find((q) => q.id === pid);
    if (!p || !p.items[+idx]) return;
    p.items[+idx].d = p.items[+idx].d ? 0 : 1;
    save(); renderView(); R.stats();
  };

  // 捕获阶段：编辑器外点击先结算（脏则询问并拦截本次点击；点 ✕ 删除例外，不动编辑器）
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.swal2-container')) return;
    if (S.edit && !e.target.closest('#blkEd') && !e.target.closest('[data-px]') && !e.target.closest('#modeBtn')) {
      if (isEditorDirty()) {
        e.preventDefault();
        e.stopPropagation();
        settleEditor();
        return;
      }
      commitEditor();
    }
    if (S.picking && !e.target.closest('.pl-cell') && !e.target.closest('#plBlocks')) cancelPick();
  }, true);

  // 空白时间轴：按下即开始选段（滑动实时扩展），原地抬起转为两击模式等待终点
  $('plRows').onpointerdown = (e) => {
    if (S.selecting || S.rz) return;
    const c = e.target.closest('.pl-cell');
    if (!c || !('i' in c.dataset)) return;
    const i = +c.dataset.i;
    if (S.occ.has(i)) return;
    e.preventDefault();

    if (S.picking) {
      const RS = S.data.range.s * 60;
      const z = clampTo(S.selA, i);
      const a = Math.min(S.selA, z), b = Math.max(S.selA, z);
      S.picking = false;
      S.selA = S.selB = null;
      updGhost();
      openEditor(null, RS + a * 30, RS + (b + 1) * 30);
      return;
    }

    S.selecting = true; S.selA = S.selB = i;
    S.dragRect = $('plRows').getBoundingClientRect();
    updGhost();
  };

  $('plBlocks').onpointerdown = (e) => {
    const x = e.target.closest('[data-px]');
    if (x) {
      e.preventDefault();
      const id = x.dataset.px;
      const p = dayPlans().find((q) => q.id === id);
      if (!p) return;
      swalConfirm('删除这条日程？', `${fmtT(p.s)}–${fmtT(p.e)} ${p.items.map((q) => q.n).join('、')}`).then((ok) => {
        if (!ok) return;
        S.data.plans[S.selDate] = dayPlans().filter((q) => q.id !== id);
        if (!S.data.plans[S.selDate].length) delete S.data.plans[S.selDate];
        save(); renderEdit(); R.cal();
      });
      return;
    }
    if (S.picking) return;
    const h = e.target.closest('.rz');
    if (h) {
      const blk = h.closest('[data-pb]');
      if (blk) startRz(blk.dataset.pb, h.classList.contains('rz-t') ? 's' : 'e', e);
      return;
    }
    const b = e.target.closest('[data-pb]');
    if (b) {
      e.preventDefault();
      blkTap = { id: b.dataset.pb, x: e.clientX, y: e.clientY };
    }
  };

  document.addEventListener('pointermove', (e) => {
    if (handleLineSortMove(e)) return;
    if (blkTap && Math.abs(e.clientX - blkTap.x) + Math.abs(e.clientY - blkTap.y) > 10) blkTap = null;
    if (!S.selecting && !S.rz && !S.picking) return;

    if (S.picking) {
      const rect = $('plRows').getBoundingClientRect();
      if (e.clientY < rect.top || e.clientY > rect.bottom) return;
      const RS0 = S.data.range.s * 60, n0 = (S.data.range.e * 60 - RS0) / 30;
      const idx0 = Math.max(0, Math.min(n0 - 1, Math.floor((e.clientY - rect.top) / SH)));
      S.selB = clampTo(S.selA, idx0);
      updGhost();
      return;
    }

    const RS = S.data.range.s * 60, RE = S.data.range.e * 60, n = (RE - RS) / 30;
    const idx = Math.max(0, Math.min(n - 1, Math.floor((e.clientY - S.dragRect.top) / SH)));
    if (S.selecting) {
      S.selB = clampTo(S.selA, idx);
      updGhost();
    } else if (S.rz) {
      const rz = S.rz;
      if (rz.edge === 's') rz.s = Math.max(rz.lo, Math.min(RS + idx * 30, rz.e - 30));
      else rz.e = Math.min(rz.hi, Math.max(RS + (idx + 1) * 30, rz.s + 30));
      const top = (Math.max(rz.s, RS) - RS) / 30 * SH;
      const h = (Math.min(rz.e, RE) - Math.max(rz.s, RS)) / 30 * SH;
      if (rz.el) { rz.el.style.top = top + 1 + 'px'; rz.el.style.height = h - 2 + 'px'; }
      const g = $('plGhost');
      g.style.display = 'flex';
      g.style.top = top + 1 + 'px';
      g.style.height = h - 2 + 'px';
      g.textContent = `${fmtT(rz.s)} – ${fmtT(rz.e)}`;
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (lineSort && lineSort.pointerId === e.pointerId) {
      const wasActive = lineSort.active;
      finishLineSort();
      if (wasActive) return;
    }
    if (blkTap) {
      const p = dayPlans().find((q) => q.id === blkTap.id);
      blkTap = null;
      if (p) openEditor(p);
      return;
    }
    if (S.selecting) {
      S.selecting = false;
      const RS = S.data.range.s * 60;
      if (S.selA === S.selB) {
        S.picking = true;
        S.dragRect = $('plRows').getBoundingClientRect();
        updGhost();
        return;
      }
      const a = Math.min(S.selA, S.selB), b = Math.max(S.selA, S.selB);
      S.selA = S.selB = null;
      updGhost();
      openEditor(null, RS + a * 30, RS + (b + 1) * 30);
    } else if (S.rz) {
      S.rz.p.s = S.rz.s;
      S.rz.p.e = S.rz.e;
      S.rz = null;
      $('plGhost').style.display = 'none';
      save(); renderEdit(); R.cal();
    }
  });

  document.addEventListener('pointercancel', (e) => {
    if (lineSort && lineSort.pointerId === e.pointerId) finishLineSort();
    blkTap = null;
    if (S.selecting) { S.selecting = false; S.selA = S.selB = null; updGhost(); }
    if (S.rz) { S.rz = null; $('plGhost').style.display = 'none'; renderEdit(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (S.typeView) { setTypeView(S.typeView); return; }
    if (!S.editMode) return;
    if (S.edit) { settleEditor(); return; }
    if (S.picking) { cancelPick(); return; }
    if (S.selecting) { S.selecting = false; S.selA = S.selB = null; updGhost(); }
  });

  $('tvBack').onclick = () => setTypeView(S.typeView);

  $('modeBtn').onclick = async () => {
    if (S.editMode && S.edit && !(await resolveEditorChanges())) return;
    else if (S.edit) commitEditor();
    S.editMode = !S.editMode;
    S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null;
    renderPlan();
  };

  $('dPrev').onclick = () => { const d = parseDs(S.selDate); d.setDate(d.getDate() - 1); gotoDate(fmt(d)); };
  $('dNext').onclick = () => { const d = parseDs(S.selDate); d.setDate(d.getDate() + 1); gotoDate(fmt(d)); };
  $('dToday').onclick = () => gotoDate(todayStr());
}
