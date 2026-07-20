// 本月统计：按已完成事项比例折算各类型时长

import { $, TYPES, todayStr, fmtH } from './util.js';
import { S } from './ctx.js';

export function render() {
  const pre = todayStr().slice(0, 7);
  const sums = {};
  for (const k in S.data.plans) {
    if (!k.startsWith(pre)) continue;
    S.data.plans[k].forEach((p) => {
      const done = p.items.filter((x) => x.d).length;
      if (!done) return;
      // 只统计已完成事项：按完成比例折算该时段时长
      sums[p.t] = (sums[p.t] || 0) + (p.e - p.s) * done / p.items.length;
    });
  }

  const tot = Object.values(sums).reduce((a, b) => a + b, 0);
  $('stTot').textContent = tot ? fmtH(tot) : '';

  if (!tot) {
    $('stBar').style.display = 'none';
    $('stList').innerHTML = '<div class="empty">本月暂无已完成日程</div>';
    return;
  }

  $('stBar').style.display = 'flex';
  $('stBar').innerHTML = TYPES.filter((t) => sums[t.k]).map((t) =>
    `<i class="${t.cls}" style="width:${sums[t.k] / tot * 100}%"></i>`).join('');
  $('stList').innerHTML = TYPES.filter((t) => sums[t.k]).map((t) =>
    `<div class="st-row ${t.cls}">
      <span class="st-dot"></span>
      <span class="st-n">${t.n}</span>
      <span class="st-h">${fmtH(sums[t.k])}</span>
      <span class="st-p">${Math.round(sums[t.k] / tot * 100)}%</span>
    </div>`).join('');
}
