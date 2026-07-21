// 日程计划：展示清单 / 时间轴编辑（拖选新建、就地编辑器、边缘拖拽调时间）

import { $, SH, TYPES, tCls, fmt, todayStr, parseDs, esc, fmtT, genId, dispDate } from './util.js';
import { S, R } from './ctx.js';
import { toast, swalConfirm, swalUnsaved } from './ui.js';
import { save } from './store.js';

const dayPlans = () => S.data.plans[S.selDate] || [];

/* ---------- 渲染 ---------- */

export function renderPlan() {
  const tv = S.typeView;
  $('dPrev').style.display = tv ? 'none' : '';
  $('dNext').style.display = tv ? 'none' : '';
  $('tvBack').style.display = tv ? '' : 'none';
  $('modeBtn').style.display = tv ? 'none' : '';

  // 类型汇总视图：显示日历当前月该类型的全部时段
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

// 统计卡点击类型 → 进入/退出该类型的当月汇总
export function setTypeView(k) {
  if (S.edit) commitEditor();
  S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null;
  S.typeView = S.typeView === k ? null : k;
  renderPlan();
  R.stats();     // 刷新统计卡的选中高亮
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

// 展示模式：当天日程清单，点击事项标记完成
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

// 编辑模式：时间轴
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

// 取消“等待结束时间”的起点选择
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

// 从 a 向 b 延伸选择，遇到已占用格子截断
function clampTo(a, b) {
  const step = b >= a ? 1 : -1;
  let last = a;
  for (let i = a; i !== b + step; i += step) {
    if (S.occ.has(i)) break;
    last = i;
  }
  return last;
}

/* ---------- 就地编辑器 ---------- */

function openEditor(p, s, e) {
  if (S.edit) commitEditor();
  S.edit = p
    ? { id: p.id, s: p.s, e: p.e, t: p.t }
    : { id: null, s, e, t: S.data.lastT || 'w' };
  // 记录打开时的快照，用于判断是否有未保存修改
  S.edit.orig = JSON.stringify({ s: S.edit.s, e: S.edit.e, t: S.edit.t, items: p ? p.items.map((x) => x.n) : [] });
  renderPlan();               // 隐藏被编辑的块
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

// 放弃本次编辑（不写入数据）
function discardEditor() {
  S.edit = null;
  const el = $('blkEd');
  if (el) el.remove();
  renderEdit();
}

// 保存并提示；未改动则静默关闭
function saveEditor() {
  const dirty = isEditorDirty();
  commitEditor();
  if (dirty) toast('已保存');
}

// 即将离开编辑器：有改动先询问（保存 / 不保存 / 继续编辑）
function settleEditor() {
  if (!isEditorDirty()) { commitEditor(); return; }
  if (settleEditor._busy) return;          // 对话框已打开，防止重复弹出
  settleEditor._busy = true;
  swalUnsaved().then((r) => {
    settleEditor._busy = false;
    if (r === 'save') saveEditor();
    else if (r === 'discard') discardEditor();
  });
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

  // 调整时间：原生下拉，手机上唤起系统选择器
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

  // 回车连续录入；空行回车提交；空行退格删行
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
        ev.target.remove();
        ins[i - 1].focus();
      }
    }
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
    if (ev.target.closest('.be-save')) saveEditor();
  });
}

function addLine(v = '', foc) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'be-i';
  inp.maxLength = 60;
  inp.autocomplete = 'off';
  inp.value = v;
  $('blkEd').querySelector('.be-lines').appendChild(inp);
  if (foc) inp.focus();
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

/* ---------- 调整时间块大小 ---------- */

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

/* ---------- 模式与日期 ---------- */

export function gotoDate(ds) {
  if (S.edit) commitEditor();
  S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null;
  S.typeView = null;             // 选择具体日期即退出类型汇总
  S.selDate = ds;
  S.vD = parseDs(ds);
  R.cal(); renderPlan();
}

/* ---------- 初始化 ---------- */

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
  // 展示模式：点击事项标记完成；类型汇总视图：点击跳到对应日期
  $('plView').onclick = (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) { gotoDate(j.dataset.jump); return; }
    const n = e.target.closest('[data-tg]');
    if (!n) return;
    const [pid, idx] = n.dataset.tg.split(':');
    const p = dayPlans().find((q) => q.id === pid);
    if (!p || !p.items[+idx]) return;
    p.items[+idx].d = p.items[+idx].d ? 0 : 1;
    save(); renderView(); R.stats();   // 勾选完成即时反映到月度统计
  };

  // 点击编辑器以外的地方（捕获阶段，先于其他处理）：
  // 无改动 → 静默关闭；有未保存修改 → 拦截本次点击并询问
  // 已选起点时点击时间轴与日程块以外 → 取消起点
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.swal2-container')) return;   // 对话框内的点击不拦截
    // 点删除 ✕ 时不动当前编辑器：可以在编辑中直接删除别的时间段
    if (S.edit && !e.target.closest('#blkEd') && !e.target.closest('[data-px]')) {
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

  // 时间轴空白处：第一次点击定起点，第二次点击定终点（按住拖选同样有效）
  $('plRows').onpointerdown = (e) => {
    if (S.selecting || S.rz) return;   // 拖选/调整进行中（如多点触控）不重入
    const c = e.target.closest('.pl-cell');
    if (!c || !('i' in c.dataset)) return;
    const i = +c.dataset.i;
    if (S.occ.has(i)) return;
    e.preventDefault();

    if (S.picking) {               // 第二次点击：确定结束时间，打开编辑器
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

  // 时间块：删除 ✕ 任何状态下都可用；其余交互在选段时不响应，避免误触
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
      const p = dayPlans().find((q) => q.id === b.dataset.pb);
      if (p) openEditor(p);
    }
  };

  document.addEventListener('pointermove', (e) => {
    if (!S.selecting && !S.rz && !S.picking) return;

    // 已选起点：鼠标移动实时预览起止范围（手机无悬停，保持起点格）
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

  document.addEventListener('pointerup', () => {
    if (S.selecting) {
      S.selecting = false;
      const RS = S.data.range.s * 60;
      if (S.selA === S.selB) {
        // 未拖动：视为已选起点，等待第二次点击选择结束时间
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

  document.addEventListener('pointercancel', () => {
    if (S.selecting) { S.selecting = false; S.selA = S.selB = null; updGhost(); }
    if (S.rz) { S.rz = null; $('plGhost').style.display = 'none'; renderEdit(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (S.typeView) { setTypeView(S.typeView); return; }   // 退出类型汇总
    if (!S.editMode) return;
    if (S.edit) { settleEditor(); return; }
    if (S.picking) { cancelPick(); return; }
    if (S.selecting) { S.selecting = false; S.selA = S.selB = null; updGhost(); }
  });

  $('tvBack').onclick = () => setTypeView(S.typeView);

  $('modeBtn').onclick = () => {
    if (S.edit) commitEditor();
    S.editMode = !S.editMode;
    S.selecting = false; S.picking = false; S.selA = S.selB = null; S.rz = null;
    renderPlan();
  };

  $('dPrev').onclick = () => { const d = parseDs(S.selDate); d.setDate(d.getDate() - 1); gotoDate(fmt(d)); };
  $('dNext').onclick = () => { const d = parseDs(S.selDate); d.setDate(d.getDate() + 1); gotoDate(fmt(d)); };
  $('dToday').onclick = () => gotoDate(todayStr());
}
