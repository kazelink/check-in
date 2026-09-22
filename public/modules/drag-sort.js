export const isCoarsePointer = () =>
  window.matchMedia?.('(hover: none), (pointer: coarse)').matches;

const SUPPRESS_MS = 600;

export function bindDragSort({ root, item, handle, ignore, idOf, move, render, save }) {
  let drag = null;
  let suppressUntil = 0;
  const suppress = () => { suppressUntil = Date.now() + SUPPRESS_MS; };

  const finish = () => {
    if (!drag) return;
    const { active, changed } = drag;
    drag = null;
    root.classList.remove('sorting');
    if (!active) return;
    suppress();
    if (changed) save();
    render();
  };

  root.addEventListener('pointerdown', (e) => {
    if ((e.button && e.button !== 0) || !e.target.closest(handle) || (ignore && e.target.closest(ignore))) return;
    const itemEl = e.target.closest(item);
    if (!itemEl) return;
    e.preventDefault();
    drag = { id: idOf(itemEl), pointerId: e.pointerId, active: true, changed: false };
    suppress();
    root.classList.add('sorting');
    render();
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(item);
    if (target && move(drag.id, idOf(target))) {
      drag.changed = true;
      render();
      root.classList.add('sorting');
    }
  });
  document.addEventListener('pointerup', (e) => { if (drag?.pointerId === e.pointerId) finish(); });
  document.addEventListener('pointercancel', (e) => { if (drag?.pointerId === e.pointerId) finish(); });

  return {
    isDragging: (id) => drag?.active && drag.id === id,
    suppressClick: (e) => {
      if (Date.now() >= suppressUntil) return false;
      e.preventDefault(); e.stopPropagation(); return true;
    }
  };
}
