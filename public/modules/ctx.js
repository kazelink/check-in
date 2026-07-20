// 全局可变状态（单页应用的共享上下文）与渲染注册表。
// 各模块把自己的渲染函数注册到 R 上，跨模块刷新统一走 R.xxx()，避免循环 import。

export const S = {
  data: null,          // 持久化数据（store.js 负责读写）
  vD: new Date(),      // 日历显示的月份
  selDate: null,       // 正在查看/编辑的日期（app.js 初始化为今天）
  editMode: false,     // 日程卡片：展示 / 编辑
  typeView: null,      // 类型汇总视图：显示日历当前月某类型的全部时段（类型 key 或 null）
  expandedId: null,    // 展开统计的打卡事项
  justCk: null,        // 刚打卡的事项（打勾动画用）
  edit: null,          // 就地编辑器状态 { id|null, s, e, t }
  rz: null,            // 调整时间块大小的状态
  selecting: false,    // 时间轴按住拖选中
  picking: false,      // 已点击起点，等待第二次点击选择结束时间
  selA: null,
  selB: null,
  dragRect: null,      // 拖选/调整时缓存的时间轴位置
  occ: new Set(),      // 当前视图中被日程占用的格子
  armed: null          // 两步删除确认的目标
};

export const R = {
  items: null,   // 打卡列表
  plan: null,    // 日程卡片（含模式切换）
  view: null,    // 日程展示清单
  cal: null,     // 日历
  stats: null    // 本月统计
};
