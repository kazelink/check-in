import { $, fmt, todayStr } from './util.js';
import { S, R } from './ctx.js';
import { gotoDate } from './planner.js';

function mkCell(y, m, d, isOth, isT) {
  const curr = new Date(y, m, d), dw = curr.getDay();
  const ds = fmt(curr);
  let cls = isOth ? 'c-it oth' : 'c-it', lt = '', tag = '', dot = '';
  let isRest = !isOth && (dw === 0 || dw === 6);

  if (window.Lunar) {
    try {
      const l = window.Lunar.fromDate(curr);
      lt = l.getDayInChinese();
      if (lt === '初一') lt = l.getMonthInChinese() + '月';
      if (!isOth && window.HolidayUtil) {
        const h = window.HolidayUtil.getHoliday(y, m + 1, d);
        if (h) {
          if (h.isWork()) {
            isRest = false; cls += ' work';
            tag = '<div class="c-tg tg-w">班</div>';
          } else {
            isRest = true; lt = h.getName().slice(0, 3);
            tag = '<div class="c-tg tg-r">休</div>';
          }
        }
      }
    } catch { /* 农历库异常时退化为普通日历 */ }
  }

  if (isRest) {
    cls += ' rest';
    if (!tag) tag = '<div class="c-tg tg-r">休</div>';
  }
  if (isT) cls += ' today';
  if (!isOth) {
    if ((S.data.plans[ds] || []).length) dot = '<div class="c-dot"></div>';
    if (ds === S.selDate) cls += ' sel';
  }
  return `<div class="${cls}" data-date="${ds}"><span class="c-d">${d}</span><span class="c-l">${lt || '--'}</span>${tag}${dot}</div>`;
}

export function render() {
  const y = S.vD.getFullYear(), m = S.vD.getMonth(), now = new Date();
  $('cm').textContent = `${y}年${m + 1}月`;

  const cells = ['一', '二', '三', '四', '五', '六', '日'].map((t) => `<div class="c-hd">${t}</div>`);
  const off = (new Date(y, m, 1).getDay() + 6) % 7;
  const prevEnd = new Date(y, m, 0).getDate();

  for (let i = 0; i < off; i++) cells.push(mkCell(y, m - 1, prevEnd - off + 1 + i, true, false));

  const days = new Date(y, m + 1, 0).getDate();
  for (let i = 1; i <= days; i++) {
    const isT = y === now.getFullYear() && m === now.getMonth() && i === now.getDate();
    cells.push(mkCell(y, m, i, false, isT));
  }

  const rem = (7 - ((off + days) % 7)) % 7;
  for (let i = 1; i <= rem; i++) cells.push(mkCell(y, m + 1, i, true, false));

  $('cg').innerHTML = cells.join('');
  R.stats();
}

export function init() {
  $('cc').onclick = (e) => {
    const dir = e.target.dataset.dir;
    if (dir) {
      S.vD.setMonth(S.vD.getMonth() + parseInt(dir));
      render();
      if (S.typeView) R.plan();   // 类型汇总视图跟随翻月
    }
  };
  $('calToday').onclick = () => gotoDate(todayStr());
  $('cg').onclick = (e) => {
    const c = e.target.closest('[data-date]');
    if (!c) return;
    gotoDate(c.dataset.date);
  };
}
