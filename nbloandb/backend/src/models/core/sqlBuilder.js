// สร้างส่วนของ SQL จาก whitelist ของแต่ละ model
// ชื่อ column ใส่เป็น ? ไม่ได้ จึงต้องมาจาก whitelist เท่านั้น ส่วนค่าข้อมูลทุกตัวส่งผ่าน ?
import { camelToSnake } from './mapper.js';
import { DbError } from './DbError.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

function toParam(value) {
  return typeof value === 'boolean' ? Number(value) : value;
}

// คืน [ชื่อ column snake_case, ค่า] ของ field ที่ไม่ใช่ undefined; field นอก whitelist → INVALID_COLUMN
function writableEntries(data, writableColumns) {
  const entries = [];
  for (const [field, value] of Object.entries(data)) {
    if (!writableColumns.includes(field)) {
      throw new DbError('INVALID_COLUMN', `Column "${field}" is not writable`);
    }
    if (value !== undefined) entries.push([camelToSnake(field), toParam(value)]);
  }
  return entries;
}

/**
 * สร้าง `a = ?, b = ?` สำหรับ UPDATE (ข้าม field ที่เป็น undefined)
 * @param {Record<string, unknown>} data key เป็น camelCase
 * @param {string[]} writableColumns ชื่อ field camelCase ที่อนุญาตให้เขียน
 * @returns {{ sql: string, params: unknown[] }} sql เป็น '' ถ้าไม่มี field ให้แก้
 * @example
 * buildSet({ firstName: 'A' }, ['firstName']); // { sql: 'first_name = ?', params: ['A'] }
 */
export function buildSet(data, writableColumns) {
  const entries = writableEntries(data, writableColumns);
  return {
    sql: entries.map(([column]) => `${column} = ?`).join(', '),
    params: entries.map(([, value]) => value),
  };
}

/**
 * สร้าง `(a, b) VALUES (?, ?)` สำหรับ INSERT (ข้าม field ที่เป็น undefined)
 * @param {Record<string, unknown>} data
 * @param {string[]} writableColumns
 * @returns {{ sql: string, params: unknown[] }}
 * @example
 * buildInsert({ name: 'HP' }, ['name']); // { sql: '(name) VALUES (?)', params: ['HP'] }
 */
export function buildInsert(data, writableColumns) {
  const entries = writableEntries(data, writableColumns);
  return {
    sql: `(${entries.map(([column]) => column).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
    params: entries.map(([, value]) => value),
  };
}

/**
 * แปลง 'createdAt:desc' เป็น `ORDER BY <expr> DESC`
 * @param {string | undefined} sort รูปแบบ 'field:asc' หรือ 'field:desc' (ไม่ใส่ทิศ = asc)
 * @param {Record<string, string>} sortableColumns field camelCase → SQL expression เช่น { createdAt: 'u.created_at' }
 * @param {string} defaultSort ใช้เมื่อไม่ส่ง sort
 * @returns {string}
 * @example
 * buildOrderBy('createdAt:desc', { createdAt: 'u.created_at' }, 'createdAt:asc'); // 'ORDER BY u.created_at DESC'
 */
export function buildOrderBy(sort, sortableColumns, defaultSort) {
  const [field, direction = 'asc'] = (sort || defaultSort).split(':');
  const expr = Object.hasOwn(sortableColumns, field) ? sortableColumns[field] : undefined;
  const dir = direction.toLowerCase();
  if (!expr || (dir !== 'asc' && dir !== 'desc')) {
    throw new DbError('INVALID_COLUMN', `Cannot sort by "${sort}"`);
  }
  return `ORDER BY ${expr} ${dir.toUpperCase()}`;
}

/**
 * สร้าง `LIMIT ? OFFSET ?` page เริ่มที่ 1, pageSize ค่าเริ่มต้น 20 สูงสุด 100
 * @param {number} [page]
 * @param {number} [pageSize]
 * @returns {{ sql: string, params: number[], page: number, pageSize: number }}
 * @example
 * buildPaging(3, 10); // { sql: 'LIMIT ? OFFSET ?', params: [10, 20], page: 3, pageSize: 10 }
 */
export function buildPaging(page, pageSize) {
  const p = Number.isInteger(Number(page)) && Number(page) >= 1 ? Number(page) : 1;
  const sizeInput = Number(pageSize);
  const size = Number.isInteger(sizeInput) && sizeInput >= 1 ? Math.min(sizeInput, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { sql: 'LIMIT ? OFFSET ?', params: [size, (p - 1) * size], page: p, pageSize: size };
}

/**
 * รวมเงื่อนไขเป็น WHERE ... AND ... (ข้ามเงื่อนไขที่เป็น null/false)
 * @param {Array<[string, ...unknown[]] | null | false | undefined>} conditions [sql, ...ค่าของ ? ใน sql]
 * @returns {{ sql: string, params: unknown[] }}
 * @example
 * buildWhere([['u.id = ?', 5], keyword && ['u.email LIKE ?', likeParam(keyword)]]);
 */
export function buildWhere(conditions) {
  const used = conditions.filter(Boolean);
  return {
    sql: used.length ? `WHERE ${used.map(([sql]) => `(${sql})`).join(' AND ')}` : '',
    params: used.flatMap(([, ...params]) => params.map(toParam)),
  };
}

/**
 * ค่าสำหรับ `LIKE ?` แบบค้นบางส่วน โดย escape % และ _ ที่ผู้ใช้พิมพ์มา
 * @param {string} keyword
 * @returns {string}
 * @example
 * likeParam('50%'); // '%50\\%%'
 */
export function likeParam(keyword) {
  return `%${String(keyword).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
