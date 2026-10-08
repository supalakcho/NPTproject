// จุดเริ่มต้นของทุกหน้า: guard -> layout -> คืน <main> ให้หน้านั้นวาดเนื้อหา
import { requireLogin, requirePermission, requireRole } from './guard.js';
import { render } from './layout.js';

/**
 * @param {{ role?: 'member'|'admin', permission?: string, active?: string }} opts
 * @returns {Promise<HTMLElement>} <main id="main">
 */
export async function startPage({ role, permission, active } = {}) {
  if (role) await requireRole(role);
  else await requireLogin();
  if (permission) await requirePermission(permission);
  render({ active });
  return document.getElementById('main');
}
