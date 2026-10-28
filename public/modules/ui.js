import { $ } from './util.js';

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;

export function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

const BASE = { scrollbarPadding: false, heightAuto: false, allowOutsideClick: false };

export async function swalConfirm(title, text) {
  try {
    const r = await Swal.fire({
      ...BASE,
      title,
      text: text || '',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonColor: '#ef4444'
    });
    return r.isConfirmed;
  } catch (e) {
    console.error(e);
    return window.confirm(`${title}${text ? '\n' + text : ''}`);
  }
}

export async function swalUnsaved() {
  try {
    const r = await Swal.fire({
      ...BASE,
      title: '有未保存的修改',
      icon: 'warning',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: '保存',
      denyButtonText: '不保存',
      cancelButtonText: '继续编辑',
      confirmButtonColor: '#4e6ef2'
    });
    return r.isConfirmed ? 'save' : (r.isDenied ? 'discard' : 'cancel');
  } catch (e) {
    console.error(e);
    return window.confirm('保存本次修改？') ? 'save' : 'discard';
  }
}
