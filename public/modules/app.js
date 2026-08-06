import { $, todayStr } from './util.js';
import { S, R } from './ctx.js';
import { toast } from './ui.js';
import { hasSession, initLogin, showLogin, onSessionExpired } from './auth.js';
import { loadLocal, adoptRemote, save, flush } from './store.js';
import * as checkin from './checkin.js';
import * as planner from './planner.js';
import * as calendar from './calendar.js';
import * as stats from './stats.js';

R.items = checkin.render;
R.plan = planner.renderPlan;
R.view = planner.renderView;
R.cal = calendar.render;
R.stats = stats.render;

S.selDate = todayStr();
S.data = loadLocal();

document.addEventListener('contextmenu', (e) => e.preventDefault());

let started = false;

function startApp() {
  if (started) return;
  started = true;

  $('appView').style.display = '';

  planner.initRange();
  checkin.init();
  planner.init();
  calendar.init();
  stats.init();

  R.items();
  R.cal();
  R.plan();

  // 农历库 defer 加载完成后补一次日历渲染
  const lp = setInterval(() => {
    if (window.Lunar) { clearInterval(lp); R.cal(); }
  }, 200);
  setTimeout(() => clearInterval(lp), 6000);

  let curDay = todayStr();
  setInterval(() => {
    flush();
    if (todayStr() !== curDay) {
      curDay = todayStr();
      R.items(); R.cal(); R.plan();
      return;
    }
    if (S.editMode) planner.updNow();
    else if (!S.typeView && S.data.plans[S.selDate]) R.view();
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

onSessionExpired(() => showLogin('登录已过期，请重新输入密码'));

initLogin(async () => {
  if (started) {
    save();
    await flush();
    return;
  }
  try {
    await adoptRemote();
  } catch { }
  startApp();
});

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
