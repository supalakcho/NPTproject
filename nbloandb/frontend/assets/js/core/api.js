// fetch wrapper + แนบ JWT + แปลง response/error ตาม http-api-spec.md
// ทุกฟังก์ชันคืน { data, meta } เมื่อสำเร็จ และ throw ApiError เมื่อไม่สำเร็จ
// ถ้า config.USE_MOCK === true จะเรียก mockApi แทน fetch โดยหน้าจอไม่ต้องรู้
import { API_BASE_URL, USE_MOCK } from '../config.js';
import { ApiError } from '../utils/errors.js';
import { buildQuery } from '../utils/query.js';
import { validateImage } from '../utils/validate.js';
import { getToken, redirectToLogin } from './auth.js';

export { ApiError };

const NETWORK_MESSAGE = 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง';

// เริ่มโหลด mock ทันทีที่เปิดหน้า เพื่อให้ ?mockReset / ?mockNow ทำงาน และ window.__mock พร้อมใช้
const mockModule = USE_MOCK ? import('../mock/mockApi.js') : null;

async function transport({ method, path, query, body, file, token }) {
  if (USE_MOCK) {
    const { handle } = await mockModule;
    // ส่ง query เป็น string เหมือนที่ backend จริงจะได้รับ
    const q = Object.fromEntries(new URLSearchParams(buildQuery(query)));
    return handle({ method, path, query: q, body, file, token });
  }

  const qs = buildQuery(query);
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (file) {
    payload = new FormData();
    payload.append('image', file);
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    payload = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`, { method, headers, body: payload });
    return { status: res.status, body: await res.json() };
  } catch {
    // network error หรือ response ที่ไม่ใช่ JSON
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE });
  }
}

async function send({ method, path, query, body, file, auth = true }) {
  const token = auth ? getToken() : null;
  const res = await transport({ method, path, query, body, file, token });
  const json = res.body;

  if (json?.success) return { data: json.data, meta: json.meta };

  const e = json?.error ?? {};
  const err = new ApiError({ status: res.status, code: e.code, message: e.message, details: e.details });

  // 401 จาก API ใดก็ตาม -> ลบ session -> login พร้อม next
  // 403 ACCOUNT_SUSPENDED -> ลบ session -> login แสดงข้อความจาก backend
  if (token && (err.status === 401 || err.code === 'UNAUTHORIZED')) redirectToLogin();
  else if (token && err.code === 'ACCOUNT_SUSPENDED') redirectToLogin({ flash: err.message });

  throw err;
}

const get = (path, query) => send({ method: 'GET', path, query });
const post = (path, body) => send({ method: 'POST', path, body });
const patch = (path, body) => send({ method: 'PATCH', path, body });
const put = (path, body) => send({ method: 'PUT', path, body });
const del = (path) => send({ method: 'DELETE', path });

function upload(path, file) {
  const { valid, errors } = validateImage(file);
  if (!valid) throw new ApiError({ status: 400, code: 'INVALID_FILE', message: errors.image });
  return send({ method: 'POST', path, file });
}

// ---------- Auth ----------
// A1 POST /auth/register
export const register = (body) => send({ method: 'POST', path: '/auth/register', body, auth: false });
// A2 POST /auth/login
export const login = (body) => send({ method: 'POST', path: '/auth/login', body, auth: false });
// A3 POST /auth/logout
export const logout = () => post('/auth/logout');

// ---------- ข้อมูลของฉัน ----------
// M1 GET /me
export const getMe = () => get('/me');
// M2 PATCH /me
export const updateMe = (body) => patch('/me', body);
// M3 POST /me/avatar (multipart field image)
export const uploadAvatar = (file) => upload('/me/avatar', file);
// M4 PUT /me/password
export const changePassword = (body) => put('/me/password', body);
// M5 GET /me/loans
export const listMyLoans = (query) => get('/me/loans', query);
// M6 GET /me/reservations
export const listMyReservations = (query) => get('/me/reservations', query);
// M7 GET /me/notifications
export const listNotifications = (query) => get('/me/notifications', query);
// M8 GET /me/notifications/unread-count
export const getUnreadCount = () => get('/me/notifications/unread-count');
// M9 PATCH /me/notifications/:id/read
export const markNotificationRead = (id) => patch(`/me/notifications/${id}/read`);
// M10 PATCH /me/notifications/read-all
export const markAllNotificationsRead = () => patch('/me/notifications/read-all');

// ---------- ค่าตั้งค่า ----------
// S1 GET /settings/public
export const getPublicSettings = () => get('/settings/public');
// S2 GET /settings
export const listSettings = () => get('/settings');
// S3 PATCH /settings
export const updateSettings = (body) => patch('/settings', body);

// ---------- ยี่ห้อ ----------
// B1 GET /brands/options
export const listBrandOptions = () => get('/brands/options');
// B2 GET /brands
export const listBrands = (query) => get('/brands', query);
// B3 POST /brands
export const createBrand = (body) => post('/brands', body);
// B4 PATCH /brands/:id
export const updateBrand = (id, body) => patch(`/brands/${id}`, body);
// B5 DELETE /brands/:id
export const deleteBrand = (id) => del(`/brands/${id}`);
// B6 POST /brands/:id/restore
export const restoreBrand = (id) => post(`/brands/${id}/restore`);

// ---------- รุ่น ----------
// D1 GET /notebook-models
export const listModels = (query) => get('/notebook-models', query);
// D2 GET /notebook-models/:id
export const getModel = (id) => get(`/notebook-models/${id}`);
// D3 POST /notebook-models
export const createModel = (body) => post('/notebook-models', body);
// D4 PATCH /notebook-models/:id
export const updateModel = (id, body) => patch(`/notebook-models/${id}`, body);
// D5 POST /notebook-models/:id/image (multipart field image)
export const uploadModelImage = (id, file) => upload(`/notebook-models/${id}/image`, file);
// D6 DELETE /notebook-models/:id
export const deleteModel = (id) => del(`/notebook-models/${id}`);
// D7 POST /notebook-models/:id/restore
export const restoreModel = (id) => post(`/notebook-models/${id}/restore`);

// ---------- โน๊ตบุ๊ค ----------
// N1 GET /notebooks
export const listNotebooks = (query) => get('/notebooks', query);
// N2 GET /notebooks/available
export const searchAvailableNotebooks = (query) => get('/notebooks/available', query);
// N3 GET /notebooks/by-asset/:assetCode
export const getNotebookByAsset = (assetCode) => get(`/notebooks/by-asset/${encodeURIComponent(assetCode)}`);
// N4 GET /notebooks/:id
export const getNotebook = (id) => get(`/notebooks/${id}`);
// N5 POST /notebooks
export const createNotebook = (body) => post('/notebooks', body);
// N6 PATCH /notebooks/:id
export const updateNotebook = (id, body) => patch(`/notebooks/${id}`, body);
// N7 DELETE /notebooks/:id
export const deleteNotebook = (id) => del(`/notebooks/${id}`);
// N8 POST /notebooks/:id/restore
export const restoreNotebook = (id) => post(`/notebooks/${id}/restore`);

// ---------- การยืม ----------
// L1 POST /loans  (ส่ง notebookId หรือ assetCode อย่างใดอย่างหนึ่ง)
export const borrowNow = ({ notebookId, assetCode, dueAt }) =>
  post('/loans', { ...(notebookId !== undefined ? { notebookId } : { assetCode }), dueAt });
// L2 GET /loans/:id
export const getLoan = (id) => get(`/loans/${id}`);
// L3 POST /loans/:id/extend
export const extendLoan = (id, { newDueAt }) => post(`/loans/${id}/extend`, { newDueAt });
// L4 POST /loans/:id/return-request
export const requestReturn = (id) => post(`/loans/${id}/return-request`);
// L5 GET /loans
export const listLoans = (query) => get('/loans', query);
// L6 GET /loans/pending-return
export const listPendingReturn = (query) => get('/loans/pending-return', query);
// L7 POST /loans/:id/confirm-return
export const confirmReturn = (id, { returnCondition, returnNote, returnRequestedAt }) =>
  post(`/loans/${id}/confirm-return`, { returnCondition, returnNote: returnNote ?? null, returnRequestedAt: returnRequestedAt ?? null });
// L8 POST /loans/:id/cancel
export const cancelLoan = (id, { reason }) => post(`/loans/${id}/cancel`, { reason });

// ---------- การจอง ----------
// R1 POST /reservations
export const createReservation = ({ notebookId, startAt, endAt }) => post('/reservations', { notebookId, startAt, endAt });
// R2 GET /reservations/:id
export const getReservation = (id) => get(`/reservations/${id}`);
// R3 POST /reservations/:id/pickup
export const pickupReservation = (id) => post(`/reservations/${id}/pickup`);
// R4 POST /reservations/:id/cancel
export const cancelReservation = (id, { reason } = {}) => post(`/reservations/${id}/cancel`, reason ? { reason } : {});
// R5 GET /reservations
export const listReservations = (query) => get('/reservations', query);

// ---------- สมาชิก (แอดมิน) ----------
// U1 GET /users
export const listUsers = (query) => get('/users', query);
// U2 GET /users/:id
export const getUser = (id) => get(`/users/${id}`);
// U3 PATCH /users/:id
export const updateUser = (id, body) => patch(`/users/${id}`, body);
// U4 POST /users/:id/suspend
export const suspendUser = (id) => post(`/users/${id}/suspend`);
// U5 POST /users/:id/activate
export const activateUser = (id) => post(`/users/${id}/activate`);
// U6 DELETE /users/:id
export const deleteUser = (id) => del(`/users/${id}`);
// U7 POST /users/:id/restore
export const restoreUser = (id) => post(`/users/${id}/restore`);

// ---------- รายงาน ----------
// P1 GET /reports/summary
export const getReportSummary = () => get('/reports/summary');
// P2 GET /reports/notebooks
export const getReportNotebooks = (query) => get('/reports/notebooks', query);
// P3 GET /reports/outstanding-loans
export const getReportOutstandingLoans = (query) => get('/reports/outstanding-loans', query);
// P4 GET /reports/available-notebooks
export const getReportAvailableNotebooks = (query) => get('/reports/available-notebooks', query);
// P5 GET /reports/monthly-loans
export const getReportMonthlyLoans = (query) => get('/reports/monthly-loans', query);

// ---------- Audit Log ----------
// G1 GET /audit-logs
export const listAuditLogs = (query) => get('/audit-logs', query);
// G2 GET /audit-logs/:id
export const getAuditLog = (id) => get(`/audit-logs/${id}`);
