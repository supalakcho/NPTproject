// ตรวจสิทธิ์ก่อนแสดงหน้า: requireLogin(), requireRole(), requirePermission()
// ถ้าไม่ผ่านจะ redirect แล้ว "ค้าง" promise ไว้ เพื่อไม่ให้โค้ดของหน้าทำงานต่อ
import { VERIFIED_KEY, appUrl } from '../config.js';
import { toMs } from '../utils/datetime.js';
import * as auth from './auth.js';
import { nowMs } from './clock.js';
import { getMe } from './api.js';

const halt = () => new Promise(() => {});

/**
 * ตัดสินว่า session นี้เข้าหน้านี้ได้หรือไม่ (pure ทดสอบง่าย)
 * @returns {{ ok: true } | { ok: false, to: 'login' } | { ok: false, to: 'home' | 'forbidden', path: string }}
 */
export function checkAccess(session, { role, permission } = {}, now = nowMs()) {
  if (!session?.token || !session.expiresAt || toMs(session.expiresAt) <= toMs(now)) {
    return { ok: false, to: 'login' };
  }
  const roleCode = session.user?.roleCode;
  const home = auth.homePathFor(roleCode);
  if (role && roleCode !== role) return { ok: false, to: 'home', path: home };
  if (permission && !(session.permissions ?? []).includes(permission)) return { ok: false, to: 'forbidden', path: home };
  return { ok: true };
}

/** เรียก GET /me ครั้งเดียวต่อ tab เพื่อยืนยันว่า token ยังใช้ได้และอัปเดต user/permissions */
async function verifyOnce() {
  const token = auth.getToken();
  if (sessionStorage.getItem(VERIFIED_KEY) === token) return true;
  try {
    const { data } = await getMe();
    const { permissions, ...user } = data;
    auth.updateSession({ user, permissions });
    sessionStorage.setItem(VERIFIED_KEY, token);
    return true;
  } catch (err) {
    if (err.code === 'UNAUTHORIZED' || err.code === 'ACCOUNT_SUSPENDED') return false; // api.js redirect ไปแล้ว
    return true; // เครือข่ายมีปัญหา ใช้ session เดิมไปก่อน หน้าจอจะแสดง error ของตัวเอง
  }
}

function showForbidden() {
  const main = document.getElementById('main');
  if (main) main.textContent = 'คุณไม่มีสิทธิ์เข้าหน้านี้';
}

async function enforce(opts) {
  let result = checkAccess(auth.getSession(), opts);
  if (result.to === 'login') {
    auth.redirectToLogin();
    return halt();
  }

  if (!(await verifyOnce())) return halt();

  result = checkAccess(auth.getSession(), opts);
  if (result.ok) return auth.getSession();

  const target = appUrl(result.path);
  if (result.to === 'forbidden' && location.href.split('?')[0] === target) {
    showForbidden(); // อยู่ที่หน้าแรกของ role อยู่แล้ว ไม่ redirect วน
  } else {
    location.replace(target);
  }
  return halt();
}

export const requireLogin = () => enforce({});
export const requireRole = (role) => enforce({ role });
export const requirePermission = (permission) => enforce({ permission });
