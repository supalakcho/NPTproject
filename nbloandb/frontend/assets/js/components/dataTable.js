// ตารางข้อมูล: เลื่อนแนวนอนในกรอบของตัวเอง ข้อมูลทุกช่องเป็น text node (ปลอดภัยจาก XSS)
import { emptyState, h } from '../core/dom.js';

/**
 * @param {{ columns: { key: string, header: string, render?: (row: any) => Node | string }[],
 *   rows: any[], empty?: string, caption?: string }} opts
 */
export function dataTable({ columns, rows, empty = 'ไม่พบข้อมูล', caption }) {
  if (!rows.length) return emptyState(empty);

  return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': caption ?? 'ตารางข้อมูล' },
    h('table', { class: 'table' },
      caption && h('caption', { class: 'sr-only' }, caption),
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col' }, c.header)))),
      h('tbody', null, rows.map((row) =>
        h('tr', null, columns.map((c) => h('td', null, c.render ? c.render(row) : row[c.key])))))));
}
