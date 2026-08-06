import { $, TYPES, fmtH } from './util.js';
import { S } from './ctx.js';
import { setTypeView } from './planner.js';

export function render() {
  const now = new Date();
  const y = S.vD.getFullYear(), m = S.vD.getMonth();
  const pre = `${y}-${String(m + 1).padStart(2, '0')}`;
  const isCur = y === now.getFullYear() && m === now.getMonth();
  $('stTit').textContent = isCur
    ? '本月统计'
    : (y !== now.getFullYear() ? `${y}年${m + 1}月统计` : `${m + 1}月统计`);

  const sums = {};
  for (const k in S.data.plans) {
    if (!k.startsWith(pre)) continue;
    S.data.plans[k].forEach((p) => {
      const done = p.items.filter((x) => x.d).length;
      if (!done) return;
      // 按已完成比例折算时长
      sums[p.t] = (sums[p.t] || 0) + (p.e - p.s) * done / p.items.length;
    });
  }

  const tot = Object.values(sums).reduce((a, b) => a + b, 0);
  $('stTot').textContent = tot ? fmtH(tot) : '';

  if (!tot) {
    $('stBar').style.display = 'none';
    $('stList').innerHTML = '<div class="empty">该月暂无已完成日程</div>';
    return;
  }

  const sel = S.typeView;
  $('stBar').style.display = 'flex';
  $('stBar').classList.toggle('filt', Boolean(sel));
  $('stBar').innerHTML = TYPES.filter((t) => sums[t.k]).map((t) =>
    `<i class="${t.cls}${t.k === sel ? ' on' : ''}" data-t="${t.k}" title="${t.n}" style="width:${sums[t.k] / tot * 100}%"></i>`).join('');
  $('stList').innerHTML = TYPES.filter((t) => sums[t.k]).map((t) =>
    `<div class="st-row ${t.cls}${t.k === sel ? ' on' : ''}" data-t="${t.k}">
      <span class="st-dot"></span>
      <span class="st-n">${t.n}</span>
      <span class="st-h">${fmtH(sums[t.k])}</span>
      <span class="st-p">${Math.round(sums[t.k] / tot * 100)}%</span>
    </div>`).join('');
}

export function init() {
  const onPick = (e) => {
    const el = e.target.closest('[data-t]');
    if (el) setTypeView(el.dataset.t);
  };
  $('stBar').onclick = onPick;
  $('stList').onclick = onPick;
}
