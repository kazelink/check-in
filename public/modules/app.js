// 入口：登录 → 对齐云端数据 → 启动应用

import { $, todayStr } from './util.js';
import { S, R } from './ctx.js';
import { toast } from './ui.js';
import { hasSession, initLogin, showLogin, onSessionExpired } from './auth.js';
import { loadLocal, adoptRemote, save, flush } from './store.js';
import * as checkin from './checkin.js';
import * as planner from './planner.js';
import * as calendar from './calendar.js';
import * as stats from './stats.js';

// 渲染注册表：跨模块刷新统一走 R.xxx()
R.items = checkin.render;
R.plan = planner.renderPlan;
R.view = planner.renderView;
R.cal = calendar.render;
R.stats = stats.render;

S.selDate = todayStr();
S.data = loadLocal();

let started = false;

function startApp() {
  if (started) return;
  started = true;

  $('appView').style.display = '';

  planner.initRange();
  checkin.init();
  planner.init();
  calendar.init();

  R.items();
  R.cal();       // 内部会顺带刷新本月统计
  R.plan();

  // 农历库为 defer 异步加载，加载完成后补一次日历渲染
  const lp = setInterval(() => {
    if (window.Lunar) { clearInterval(lp); R.cal(); }
  }, 200);
  setTimeout(() => clearInterval(lp), 6000);

  // 跨天刷新 / 进行中状态 / 当前时刻线 / 云端补同步
  let curDay = todayStr();
  setInterval(() => {
    flush();
    if (todayStr() !== curDay) {
      curDay = todayStr();
      R.items(); R.cal(); R.plan();
      return;
    }
    if (S.editMode) planner.updNow();
    else if (S.data.plans[S.selDate]) R.view();
  }, 30000);

  // 切到后台前尽量把未同步的数据推上去
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// 会话过期：弹出登录层，本地数据与界面保持不动
onSessionExpired(() => showLogin('登录已过期，请重新输入密码'));

// 登录成功：首登对齐云端数据；会话过期重登则把本地改动补同步
initLogin(async () => {
  if (started) {
    save();
    await flush();
    return;
  }
  try {
    await adoptRemote();
  } catch { /* 拉取失败时先用本地数据进入 */ }
  startApp();
});

// 启动
(async () => {
  if (!hasSession()) {
    showLogin();
    return;
  }
  try {
    await adoptRemote();
    startApp();
  } catch (e) {
    if (e && e.unauth) {
      showLogin();
    } else {
      startApp();
      toast('离线模式：数据暂存本地，恢复网络后自动同步');
    }
  }
})();
