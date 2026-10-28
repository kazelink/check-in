import { $, todayStr } from './util.js';
import { S, R } from './ctx.js';
import { toast } from './ui.js';
import { mountIcons } from './icons.js';
import { hasSession, initLogin, showLogin, onSessionExpired } from './auth.js';
import { loadLocal, adoptRemote, flush, refresh } from './store.js';
import * as notes from './notes.js';
import * as planner from './planner.js';
import * as calendar from './calendar.js';
import * as stats from './stats.js';

R.notes = notes.render;
R.plan = planner.renderPlan;
R.view = planner.renderView;
R.cal = calendar.render;
R.stats = stats.render;

S.selDate = todayStr();
S.data = loadLocal();

mountIcons();

document.addEventListener('contextmenu', (e) => e.preventDefault());

let started = false;

function startApp() {
  if (started) return;
  started = true;

  $('appView').style.display = '';

  planner.initRange();
  notes.init();
  planner.init();
  calendar.init();
  stats.init();

  $('syncBtn').onclick = async () => {
    const btn = $('syncBtn');
    if (btn.classList.contains('spin')) return;
    btn.classList.add('spin');
    try {
      await refresh();
      R.notes(); R.cal(); R.plan();
      toast('已同步最新数据');
    } catch (e) {
      if (!(e && e.unauth)) toast('同步失败，请检查网络');
    } finally {
      btn.classList.remove('spin');
    }
  };

  R.notes();
  R.cal();
  R.plan();

  const lp = setInterval(() => {
    if (window.Lunar) { clearInterval(lp); R.cal(); }
  }, 200);
  setTimeout(() => clearInterval(lp), 6000);

  let curDay = todayStr();
  setInterval(() => {
    flush();
    if (todayStr() !== curDay) {
      curDay = todayStr();
      R.cal(); R.plan();
      return;
    }
    if (S.editMode) planner.updNow();
    else if (!S.typeView && S.data.plans[S.selDate]) R.view();
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  window.addEventListener('online', () => { flush(); });
}

onSessionExpired(() => showLogin('登录已过期，请重新输入密码'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
  });
}

function reportLoadError(error) {
  console.error('[state]', error);
  if (!navigator.onLine) {
    toast('离线模式：数据暂存本地，恢复网络后自动同步');
    return;
  }
  const status = Number(error?.status) || 0;
  toast(status ? `数据加载失败（HTTP ${status}）` : '数据加载失败，已使用本地缓存');
}

initLogin(async () => {
  if (started) {
    try {
      await adoptRemote();
      R.notes(); R.cal(); R.plan();
    } catch (e) {
      reportLoadError(e);
    }
    return;
  }
  try {
    await adoptRemote();
  } catch (e) {
    reportLoadError(e);
  }
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
      reportLoadError(e);
    }
  }
})();
