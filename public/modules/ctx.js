// S：全局共享状态；R：渲染注册表（跨模块刷新走 R.xxx()，避免循环 import）

export const S = {
  data: null,
  vD: new Date(),
  selDate: null,
  editMode: false,
  typeView: null,
  ntOpen: null,      // 展开阅读的笔记 id
  ntEdit: null,      // 正在编辑的笔记 id
  ntNew: false,      // 该笔记是否为本轮新建的草稿
  ntFocusTitle: false,
  edit: null,
  rz: null,
  selecting: false,
  picking: false,
  selA: null,
  selB: null,
  dragRect: null,
  occ: new Set()
};

export const R = {};
