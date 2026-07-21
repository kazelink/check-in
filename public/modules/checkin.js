import { $, DAY, fmt, todayStr, parseDs, esc, genId, dispDate } from './util.js';
import { S } from './ctx.js';
import { swalConfirm } from './ui.js';
import { save } from './store.js';

function streak(id) {
  let n = 0, d = new Date();
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (!(S.data.recs[fmt(d)] || {})[id]) d = new Date(d - DAY);
  while ((S.data.recs[fmt(d)] || {})[id]) { n++; d = new Date(d - DAY); }
  return n;
}

function totalCk(id) {
  let n = 0;
  for (const k in S.data.recs) if (S.data.recs[k][id]) n++;
  return n;
}

// 完成率 = 打卡天数 / 首次打卡至今天数
function rateOf(id) {
  const ds = Object.keys(S.data.recs).filter((k) => S.data.recs[k][id]).sort();
  if (!ds.length) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.round((t0 - parseDs(ds[0])) / DAY) + 1);
  return { pct: Math.min(100, Math.round(ds.length / days * 100)), checked: ds.length, days };
}

export function render() {
  const t = todayStr(), box = $('ciList'), N = S.data.fixed.length;
  const done = S.data.fixed.filter((i) => (S.data.recs[t] || {})[i.id]).length;
  $('ciDone').textContent = N ? `${done}/${N}` : '';
  $('pbar').style.display = N ? '' : 'none';
  $('pfill').style.width = N ? (done / N * 100) + '%' : '0';

  if (!N) {
    box.innerHTML = '<div class="empty">点击右上角 ＋ 添加打卡事项</div>';
    return;
  }

  const days = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let k = 6; k >= 0; k--) days.push(fmt(new Date(base - k * DAY)));

  box.innerHTML = S.data.fixed.map((it) => {
    const dt = (S.data.recs[t] || {})[it.id];
    const open = S.expandedId === it.id;
    const rate = rateOf(it.id);
    let detail = '';
    if (open) {
      const dots = days.map((d) =>
        `<i class="wd${(S.data.recs[d] || {})[it.id] ? ' on' : ''}${d === t ? ' td' : ''}" title="${dispDate(d, 1)}"></i>`).join('');
      const hist = [];
      for (const d of Object.keys(S.data.recs).sort().reverse()) {
        if (S.data.recs[d][it.id]) hist.push({ d, t: S.data.recs[d][it.id] });
        if (hist.length >= 10) break;
      }
      detail = `<div class="ci-detail">
        <div class="ci-stat">连续 ${streak(it.id)} 天 · 累计 ${totalCk(it.id)} 次${rate ? ` · 完成率 ${rate.pct}%（${rate.checked}/${rate.days} 天）` : ''}</div>
        <div class="ci-rec"><span>最近 7 天</span><span class="wdots">${dots}</span></div>
        ${hist.length
          ? hist.map((h) => `<div class="ci-rec"><span>${dispDate(h.d, 1)}</span><span>${h.t}</span></div>`).join('')
          : '<div class="ci-rec">暂无打卡记录</div>'}
      </div>`;
    }
    return `<div class="ci-item${open ? ' open' : ''}" data-it="${it.id}">
      <div class="ci-row">
        <button type="button" class="ck${dt ? ' on' : ''}${it.id === S.justCk ? ' pop' : ''}" data-ck="${it.id}"
          title="${dt ? '已打卡 ' + dt + '，点击取消' : '打卡'}">${dt ? '✓' : ''}</button>
        <span class="ci-name" title="${esc(it.name)}">${esc(it.name)}</span>
        <button type="button" class="ci-del" data-del="${it.id}" title="删除">✕</button>
      </div>${detail}</div>`;
  }).join('');
}

function toggleAdd(show) {
  $('addForm').style.display = show ? '' : 'none';
  $('addTog').textContent = show ? '✕' : '＋';
  if (show) $('addInp').focus();
  else $('addInp').value = '';
}

export function init() {
  $('addForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('addInp').value.trim();
    if (!v) return;
    S.data.fixed.push({ id: genId('i'), name: v });
    $('addInp').value = '';
    save(); render();
    $('addInp').focus();
  };

  $('addTog').onclick = () => toggleAdd($('addForm').style.display === 'none');
  $('addInp').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleAdd(false);
  });

  $('ciList').onclick = (e) => {
    const ck = e.target.closest('[data-ck]');
    const del = e.target.closest('[data-del]');
    if (ck) {
      const id = ck.dataset.ck, t = todayStr();
      S.data.recs[t] = S.data.recs[t] || {};
      if (S.data.recs[t][id]) {
        delete S.data.recs[t][id];
        if (!Object.keys(S.data.recs[t]).length) delete S.data.recs[t];
      } else {
        const n = new Date();
        S.data.recs[t][id] = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
        S.justCk = id;
      }
      save(); render(); S.justCk = null;
    } else if (del) {
      const id = del.dataset.del;
      const it = S.data.fixed.find((i) => i.id === id);
      if (!it) return;
      swalConfirm(`删除「${it.name}」？`, '其全部打卡记录将一并删除').then((ok) => {
        if (!ok) return;
        S.data.fixed = S.data.fixed.filter((i) => i.id !== id);
        for (const k in S.data.recs) {
          delete S.data.recs[k][id];
          if (!Object.keys(S.data.recs[k]).length) delete S.data.recs[k];
        }
        if (S.expandedId === id) S.expandedId = null;
        save(); render();
      });
    } else {
      const row = e.target.closest('.ci-row');
      if (row) {
        const id = row.parentElement.dataset.it;
        S.expandedId = S.expandedId === id ? null : id;
        render();
      }
    }
  };
}
