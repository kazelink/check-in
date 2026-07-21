export const $ = (id) => document.getElementById(id);

export const DAY = 86400000;
export const SH = 20; // 与 CSS .pl-row 高度一致
export const WD = ['日', '一', '二', '三', '四', '五', '六'];

export const TYPES = [
  { k: 'w', cls: 'tw', n: '工作' },
  { k: 's', cls: 'ts', n: '学习' },
  { k: 'y', cls: 'ty', n: '运动' },
  { k: 'l', cls: 'tl', n: '生活' },
  { k: 'f', cls: 'tf', n: '娱乐' }
];

export const tCls = (k) => (TYPES.find((t) => t.k === k) || TYPES[0]).cls;

export const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayStr = () => fmt(new Date());

export function parseDs(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const fmtT = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const fmtH = (min) => (min / 60).toFixed(1).replace(/\.0$/, '') + ' 小时';

export const genId = (pre) => pre + Date.now().toString(36) + Math.floor(Math.random() * 1e3);

export function dispDate(ds, short) {
  const [y, m, d] = ds.split('-').map(Number);
  const wd = WD[new Date(y, m - 1, d).getDay()];
  const yr = y !== new Date().getFullYear() ? y + '年' : '';
  return `${yr}${m}月${d}日 ${short ? '周' : '星期'}${wd}` + (ds === todayStr() ? ' · 今天' : '');
}
