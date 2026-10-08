// เก็บ/อ่าน/ลบ session ใน localStorage (MPA โหลดหน้าใหม่ทุกครั้ง จึงต้องเก็บข้ามหน้า)
import { APP_ROOT, FLASH_KEY, SESSION_KEY, VERIFIED_KEY, appUrl } from '../config.js';
import { toMs } from '../utils/datetime.js';
import { nowMs } from './clock.js';

const local = () => globalThis.localStorage;
const tab = () => globalThis.sessionStorage;

export function getSession() {
  try {
    return JSON.parse(local().getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

/** @param {{ token: string, expiresAt: string, user: object, permissions: string[] }} session */
export function saveSession(session) {
  local().setItem(SESSION_KEY, JSON.stringify(session));
}

export function updateSession(patch) {
  const s = getSession();
  if (s) saveSession({ ...s, ...patch });
}

export function clearSession() {
  try {
    local().removeItem(SESSION_KEY);
    tab().removeItem(VERIFIED_KEY);
  } catch {
    /* ignore */
  }
}

export function isExpired(now = nowMs()) {
  const s = getSession();
  if (!s?.expiresAt) return true;
  return toMs(s.expiresAt) <= toMs(now);
}

export const getToken = () => getSession()?.token ?? null;
export const getUser = () => getSession()?.user ?? null;
export const getPermissions = () => getSession()?.permissions ?? [];
export const hasPermission = (p) => getPermissions().includes(p);

export function homePathFor(roleCode) {
  return roleCode === 'admin' ? 'admin/returns.html' : 'member/home.html';
}

/**
 * ตรวจ ?next= ว่าเป็น path ภายในแอปเท่านั้น (กัน open redirect)
 * คืน path+query ที่ปลอดภัย หรือ null
 */
export function resolveNext(next, origin = globalThis.location?.origin, appRoot = APP_ROOT) {
  if (!next || typeof next !== 'string') return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return null;
    if (!url.pathname.startsWith(new URL(appRoot).pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** ข้อความที่ต้องส่งต่อไปแสดงที่หน้า login (เช่น บัญชีถูกระงับ) */
export function setFlash(message) {
  try {
    tab().setItem(FLASH_KEY, message);
  } catch {
    /* ignore */
  }
}

export function takeFlash() {
  try {
    const m = tab().getItem(FLASH_KEY);
    tab().removeItem(FLASH_KEY);
    return m;
  } catch {
    return null;
  }
}

/** ลบ session แล้วไปหน้า login พร้อม next = หน้าปัจจุบัน */
export function redirectToLogin({ flash, next = location.pathname + location.search } = {}) {
  clearSession();
  if (flash) setFlash(flash);
  const url = new URL(appUrl('login.html'));
  if (next && !location.pathname.endsWith('/login.html')) url.searchParams.set('next', next);
  location.replace(url.href);
}
