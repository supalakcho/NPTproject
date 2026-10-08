import { h } from '../core/dom.js';

/**
 * @param {{ meta: { page: number, totalPages: number, total: number }, onChange: (page: number) => void }} opts
 */
export function pagination({ meta, onChange }) {
  if (!meta || meta.total === 0) return h('div');
  const { page, totalPages, total } = meta;
  return h('nav', { class: 'pagination', 'aria-label': 'เปลี่ยนหน้า' },
    h('button', { class: 'btn', type: 'button', disabled: page <= 1, onClick: () => onChange(page - 1) }, 'ก่อนหน้า'),
    h('span', null, `หน้า ${page} จาก ${totalPages} (ทั้งหมด ${total} รายการ)`),
    h('button', { class: 'btn', type: 'button', disabled: page >= totalPages, onClick: () => onChange(page + 1) }, 'ถัดไป'));
}
