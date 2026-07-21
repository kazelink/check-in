const LONG_PRESS_MS = 360;
const DRAG_CANCEL_PX = 8;
const SUPPRESS_MS = 600;

export const isCoarsePointer = () =>
  window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

export function bindDragSort({
  root,
  item,
  handle,
  ignore,
  idOf,
  move,
  render,
  save,
  sortingClass = 'sorting'
}) {
  let drag = null;
  let suppressUntil = 0;
  const el = () => typeof root === 'function' ? root() : root;
  const clear = () => { if (drag?.timer) clearTimeout(drag.timer); };
  const suppress = () => { suppressUntil = Date.now() + SUPPRESS_MS; };

  const activate = (pointerId) => {
    if (!drag || drag.pointerId !== pointerId) return;
    drag.active = true;
    suppress();
    el().classList.add(sortingClass);
    render();
  };

  const finish = () => {
    if (!drag) return;
    const { active, changed } = drag;
    clear();
    drag = null;
    el().classList.remove(sortingClass);
    if (!active) return;
    suppress();
    if (changed && save) save();
    render();
  };

  el().addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    const handleEl = e.target.closest(handle);
    if (ignore && e.target.closest(ignore)) return;
    if (isCoarsePointer() && !handleEl) return;
    const itemEl = e.target.closest(item);
    if (!itemEl) return;
    if (handleEl) e.preventDefault();

    clear();
    drag = {
      id: idOf(itemEl),
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: false,
      changed: false,
      timer: handleEl ? null : setTimeout(() => activate(e.pointerId), LONG_PRESS_MS)
    };
    if (handleEl) activate(e.pointerId);
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    if (!drag.active && moved > DRAG_CANCEL_PX) { finish(); return; }
    if (!drag.active) return;

    e.preventDefault();
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(item);
    if (target && move(drag.id, idOf(target))) {
      drag.changed = true;
      render();
      el().classList.add(sortingClass);
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (drag?.pointerId === e.pointerId) finish();
  });
  document.addEventListener('pointercancel', (e) => {
    if (drag?.pointerId === e.pointerId) finish();
  });

  return {
    isDragging: (id) => drag?.active && drag.id === id,
    suppressClick: (e) => {
      if (Date.now() >= suppressUntil) return false;
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  };
}
