// helper สร้าง element แบบปลอดภัย: ข้อความทุกตัวเป็น text node ไม่ใช้ innerHTML กับข้อมูลผู้ใช้/API

/**
 * h('button', { class: 'btn', onClick: fn, 'aria-label': 'x' }, 'ข้อความ', childEl)
 * - props ที่ขึ้นต้นด้วย on + ตัวใหญ่ = event listener
 * - dataset: { key: value } = data-* attribute
 * - null/undefined/false = ข้าม
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (/^on[A-Z]/.test(key)) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** แทนที่เนื้อหาทั้งหมดของ el */
export function replaceContent(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * ป้องกันกดซ้ำ: ปิดปุ่มและแสดงสถานะกำลังทำงานจนกว่า fn จะเสร็จ
 * ถ้ากำลังทำงานอยู่แล้วจะไม่เรียก fn ซ้ำ
 */
export async function runExclusive(button, fn, busyText = 'กำลังดำเนินการ...') {
  if (button.dataset.busy === '1') return undefined;
  const original = button.textContent;
  button.dataset.busy = '1';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = busyText;
  try {
    return await fn();
  } finally {
    delete button.dataset.busy;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = original;
  }
}

/** แสดง skeleton ระหว่างโหลด */
export function skeleton(count = 3) {
  return h('div', { 'aria-busy': 'true', 'aria-label': 'กำลังโหลด' },
    Array.from({ length: count }, () => h('div', { class: 'skeleton', style: 'margin-bottom:8px' })));
}

export function emptyState(message) {
  return h('p', { class: 'empty-state' }, message);
}

/** error state พร้อมปุ่มลองใหม่ */
export function errorState(message, onRetry) {
  return h('div', { class: 'error-state', role: 'alert' },
    h('p', null, message),
    onRetry && h('button', { class: 'btn', type: 'button', onClick: onRetry }, 'ลองใหม่'));
}

/**
 * แสดง skeleton -> เรียก loader -> วาดผลด้วย render ; ถ้าล้มเหลวแสดง error state พร้อมปุ่มลองใหม่
 * @returns {Promise<any>} ผลของ loader (undefined เมื่อล้มเหลว)
 */
export async function loadView(container, loader, render) {
  // กันผลของ request เก่าที่ตอบช้ากว่ามาทับผลล่าสุด (เช่น กดค้นหาซ้ำเร็วๆ)
  const token = Symbol('load');
  container.loadToken = token;
  replaceContent(container, skeleton());
  try {
    const result = await loader();
    if (container.loadToken !== token) return undefined;
    replaceContent(container, render(result));
    return result;
  } catch (err) {
    if (container.loadToken !== token) return undefined;
    if (err.code === 'UNAUTHORIZED' || err.code === 'ACCOUNT_SUSPENDED') return undefined; // กำลัง redirect ไป login
    replaceContent(container, errorState(err.message || 'เกิดข้อผิดพลาด', () => loadView(container, loader, render)));
    return undefined;
  }
}
