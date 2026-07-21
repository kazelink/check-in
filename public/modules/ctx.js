// S：全局共享状态；R：渲染注册表（跨模块刷新走 R.xxx()，避免循环 import）

export const S = {
  data: null,
  vD: new Date(),
  selDate: null,
  editMode: false,
  typeView: null,
  expandedId: null,
  justCk: null,
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
