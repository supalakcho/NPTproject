// รายการแบ่งหน้า: โหลด -> ตาราง + pagination พร้อม loading / empty / error state
import { h, loadView } from '../core/dom.js';
import { dataTable } from './dataTable.js';
import { pagination } from './pagination.js';

/**
 * @param {{ fetch: (query: object) => Promise<{data: any[], meta: object}>, columns: object[], empty?: string, caption?: string,
 *   onQueryChange?: (query: object) => void }} opts
 * @returns {{ el: HTMLElement, setQuery: (q: object) => Promise<void>, reload: () => Promise<void>, getQuery: () => object }}
 */
export function createListView({ fetch, columns, empty, caption, onQueryChange }) {
  const el = h('div', { class: 'list-view' });
  let query = {};

  async function load() {
    await loadView(el, () => fetch(query), ({ data, meta }) => {
      return h('div', null,
        dataTable({ columns, rows: data, empty, caption }),
        pagination({ meta, onChange: (page) => setQuery({ ...query, page }) }));
    });
  }

  async function setQuery(next) {
    query = next;
    onQueryChange?.(query);
    await load();
  }

  return { el, setQuery, reload: load, getQuery: () => query };
}
