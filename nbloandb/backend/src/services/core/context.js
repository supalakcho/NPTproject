// ctx = ผู้กระทำ ส่งเป็น parameter แรกของทุกฟังก์ชัน service

/**
 * @typedef {{ userId?: number, roleId?: number, roleCode?: string, permissions?: Set<string>,
 *   ip?: string, userAgent?: string }} Ctx
 */

/**
 * ctx ของผู้ที่ยังไม่ login (register, login)
 * @param {{ ip?: string, userAgent?: string }} [req]
 * @returns {Ctx}
 */
export function anonymousCtx({ ip, userAgent } = {}) {
  return { ip, userAgent, permissions: new Set() };
}

/** ctx ของ scheduled job */
export const SYSTEM_CTX = Object.freeze({ ip: '127.0.0.1', userAgent: 'system-job', permissions: new Set() });
