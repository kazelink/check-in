import { $ } from './util.js';
import { S, R } from './ctx.js';

export function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

const redraw = () => {
  if (R.items) R.items();
  if (R.plan) R.plan();
};

let armT = null;

// 两步确认删除：第一次点击变红色「确认」，2.6 秒内再点执行
export function arm(key, fn) {
  if (S.armed === key) {
    clearTimeout(armT);
    S.armed = null;
    fn();
    return;
  }
  if (S.armed) clearTimeout(armT);
  S.armed = key;
  redraw();
  armT = setTimeout(() => {
    S.armed = null;
    redraw();
  }, 2600);
}
