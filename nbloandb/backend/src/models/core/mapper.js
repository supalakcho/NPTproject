// แปลงชื่อ field snake_case ⇄ camelCase และแปลงชนิดข้อมูล

/** @param {string} name เช่น 'due_at' → 'dueAt' */
export function snakeToCamel(name) {
  return name.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

/** @param {string} name เช่น 'dueAt' → 'due_at' */
export function camelToSnake(name) {
  return name.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

const CASTERS = {
  bool: (v) => Boolean(Number(v)),
  number: (v) => Number(v),
  json: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
};

/**
 * แปลง 1 แถวจาก DB เป็น object camelCase พร้อมแปลงชนิดตาม casts (ค่า null คงเป็น null)
 * @param {Record<string, unknown> | null | undefined} row
 * @param {Record<string, 'bool'|'number'|'json'>} [casts] key เป็นชื่อ camelCase
 * @returns {Record<string, unknown> | null}
 * @example
 * toCamel({ due_at: d, is_active: 1 }, { isActive: 'bool' }); // { dueAt: d, isActive: true }
 */
export function toCamel(row, casts = {}) {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const name = snakeToCamel(key);
    const cast = casts[name];
    out[name] = cast && value !== null && value !== undefined ? CASTERS[cast](value) : value;
  }
  return out;
}

/**
 * แปลงทั้ง array
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, 'bool'|'number'|'json'>} [casts]
 * @returns {Array<Record<string, unknown>>}
 * @example
 * toCamelRows([{ first_name: 'สมชาย' }]); // [{ firstName: 'สมชาย' }]
 */
export function toCamelRows(rows, casts = {}) {
  return rows.map((row) => toCamel(row, casts));
}

/**
 * แปลง key ของ object เป็น snake_case (ค่าไม่เปลี่ยน)
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 * @example
 * toSnake({ firstName: 'สมชาย' }); // { first_name: 'สมชาย' }
 */
export function toSnake(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [camelToSnake(key), value]));
}
