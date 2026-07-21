import { $ } from './util.js';

export function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

// SweetAlert2 通常已由 app.html 的 defer <script> 加载，这里的懒加载只是兜底
function ensureSwal() {
  if (typeof Swal !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/assets/sweetalert2.all.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const BASE = { scrollbarPadding: false, heightAuto: false };

// 删除确认，返回 boolean
export async function swalConfirm(title, text) {
  try {
    await ensureSwal();
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

// 未保存修改的三选一：'save' | 'discard' | 'cancel'
export async function swalUnsaved() {
  try {
    await ensureSwal();
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
