// Mock API: รับ request แบบเดียวกับ api.js แล้วตอบตาม http-api-spec.md
// ทำ: Auth, /me, settings/public, brands/options, models (อ่าน), notebooks (อ่าน),
//   loans L1-L8, reservations R1-R5  ·  endpoint จัดการข้อมูลของแอดมินอยู่ใน mockAdmin.js
import { MOCK_DB_KEY, MOCK_DELAY_MS } from '../config.js';
import { toThaiIso } from '../utils/datetime.js';
import { passwordPolicyError, validateProfile, validateRegister } from '../utils/validate.js';
import { registerAdminRoutes } from './mockAdmin.js';
import * as clock from './mockClock.js';
import { createSeed, PERMISSIONS, ROLES } from './mockData.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const FORCE_KEY = 'nl.mockForce';
const TOKEN_TTL = 8 * HOUR;

// ---------- Error ตามตารางข้อ 5 ของ spec ----------
const ERRORS = {
  VALIDATION_ERROR: [400, 'ข้อมูลไม่ถูกต้อง'],
  INVALID_FILE: [400, 'ไฟล์ต้องเป็นรูป jpg, png หรือ webp ขนาดไม่เกิน 2 MB'],
  INVALID_DUE_AT: [400, 'เวลาคืนไม่ถูกต้อง'],
  INVALID_TIME_RANGE: [400, 'ช่วงเวลาไม่ถูกต้อง'],
  RESERVATION_TOO_FAR_AHEAD: [400, 'จองล่วงหน้าได้ไม่เกิน {n} วัน'],
  CURRENT_PASSWORD_INCORRECT: [400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง'],
  UNKNOWN_SETTING: [400, 'ไม่มีค่าตั้งค่านี้ในระบบ'],
  UNAUTHORIZED: [401, 'กรุณาเข้าสู่ระบบใหม่'],
  INVALID_CREDENTIALS: [401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
  ACCOUNT_SUSPENDED: [403, 'บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ'],
  FORBIDDEN: [403, 'คุณไม่มีสิทธิ์ทำรายการนี้'],
  USER_NOT_FOUND: [404, 'ไม่พบผู้ใช้'],
  BRAND_NOT_FOUND: [404, 'ไม่พบยี่ห้อ'],
  MODEL_NOT_FOUND: [404, 'ไม่พบรุ่น'],
  NOTEBOOK_NOT_FOUND: [404, 'ไม่พบโน๊ตบุ๊ค'],
  LOAN_NOT_FOUND: [404, 'ไม่พบรายการยืม'],
  RESERVATION_NOT_FOUND: [404, 'ไม่พบการจอง'],
  NOTIFICATION_NOT_FOUND: [404, 'ไม่พบการแจ้งเตือน'],
  EMAIL_TAKEN: [409, 'อีเมลนี้ถูกใช้แล้ว'],
  MEMBER_CODE_TAKEN: [409, 'รหัสสมาชิกนี้ถูกใช้แล้ว'],
  BRAND_NAME_TAKEN: [409, 'มียี่ห้อนี้อยู่แล้ว'],
  MODEL_NAME_TAKEN: [409, 'มีรุ่นนี้ในยี่ห้อนี้อยู่แล้ว'],
  ASSET_CODE_TAKEN: [409, 'รหัสครุภัณฑ์นี้ถูกใช้แล้ว'],
  SERIAL_NUMBER_TAKEN: [409, 'Serial number นี้ถูกใช้แล้ว'],
  BRAND_IN_USE: [409, 'ลบไม่ได้ ยังมีรุ่นที่ใช้ยี่ห้อนี้'],
  MODEL_IN_USE: [409, 'ลบไม่ได้ ยังมีเครื่องที่ใช้รุ่นนี้'],
  NOTEBOOK_HAS_COMMITMENTS: [409, 'ทำรายการไม่ได้ เครื่องนี้มีการยืมหรือการจองค้างอยู่'],
  NOTEBOOK_NOT_AVAILABLE: [409, 'เครื่องนี้ไม่พร้อมให้ยืม'],
  NOTEBOOK_ALREADY_BORROWED: [409, 'เครื่องนี้ถูกยืมอยู่'],
  NOTEBOOK_NOT_RETURNED_YET: [409, 'ผู้ยืมคนก่อนยังไม่ได้คืนเครื่อง กรุณาติดต่อผู้ดูแลระบบ'],
  RESERVATION_CONFLICT: [409, 'ช่วงเวลานี้มีผู้จองไว้แล้ว'],
  OWN_RESERVATION_OVERLAP: [409, 'คุณมีการจองเครื่องนี้ในช่วงเวลานี้ กรุณารับเครื่องจากการจองหรือยกเลิกการจองก่อน'],
  LOAN_CONFLICT: [409, 'ช่วงเวลานี้เครื่องถูกยืมอยู่'],
  EXTEND_CONFLICT_RESERVATION: [409, 'ต่อเวลาไม่ได้ มีผู้จองเครื่องต่อจากคุณ'],
  LOAN_NOT_ACTIVE: [409, 'รายการยืมนี้ไม่อยู่ในสถานะที่ทำรายการได้'],
  LOAN_OVERDUE_CANNOT_EXTEND: [409, 'เกินกำหนดคืนแล้ว ไม่สามารถต่อเวลาได้'],
  RETURN_ALREADY_REQUESTED: [409, 'คุณกดคืนเครื่องนี้แล้ว รอผู้ดูแลยืนยัน'],
  LOAN_ALREADY_RETURNED: [409, 'รายการนี้รับคืนเรียบร้อยแล้ว'],
  LOAN_CANCELLED: [409, 'รายการนี้ถูกยกเลิกแล้ว'],
  LOAN_CANNOT_CANCEL: [409, 'ยกเลิกไม่ได้ รายการนี้รับคืนแล้วหรือถูกยกเลิกไปแล้ว'],
  LOAN_STATE_CHANGED: [409, 'สถานะรายการเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่'],
  RESERVATION_NOT_STARTED: [409, 'ยังไม่ถึงเวลารับเครื่อง'],
  RESERVATION_EXPIRED: [409, 'การจองหมดอายุแล้ว'],
  RESERVATION_CANCELLED: [409, 'การจองนี้ถูกยกเลิกแล้ว'],
  RESERVATION_ALREADY_PICKED_UP: [409, 'รับเครื่องตามการจองนี้แล้ว'],
  RESERVATION_CANNOT_CANCEL: [409, 'ยกเลิกการจองนี้ไม่ได้'],
  CANNOT_MODIFY_SELF: [409, 'ไม่สามารถทำรายการนี้กับบัญชีของตัวเองได้'],
  LAST_ADMIN: [409, 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน'],
  USER_HAS_ACTIVE_LOANS: [409, 'ลบไม่ได้ ผู้ใช้นี้ยังมีเครื่องที่ยังไม่คืน'],
  REFERENCE_NOT_FOUND: [409, 'ข้อมูลที่อ้างถึงไม่มีอยู่ในระบบ'],
  RESOURCE_IN_USE: [409, 'ข้อมูลนี้ถูกใช้งานอยู่'],
  LOAN_LIMIT_REACHED: [422, 'คุณยืมครบจำนวนสูงสุดแล้ว กรุณาคืนเครื่องก่อน'],
  LOAN_DURATION_EXCEEDED: [422, 'เวลายืมรวมเกิน {n} ชั่วโมง'],
  INTERNAL_ERROR: [500, 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'],
};

export class MockError extends Error {
  constructor(code, details, { vars, status, message } = {}) {
    const [defStatus, defMessage] = ERRORS[code] ?? ERRORS.INTERNAL_ERROR;
    super(message ?? defMessage.replace('{n}', vars?.n ?? ''));
    this.code = code;
    this.status = status ?? defStatus;
    this.details = details;
  }
}

const validationError = (errors) =>
  new MockError('VALIDATION_ERROR', Object.entries(errors).map(([field, message]) => ({ field, message })));

const ok = (data, { status = 200, meta } = {}) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const created = (data) => ok(data, { status: 201 });
const failure = (e) => ({
  status: e.status,
  body: { success: false, error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } },
});

// ---------- DB (localStorage ข้ามหน้า) ----------
export function loadDb() {
  try {
    const raw = localStorage.getItem(MOCK_DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ตกไปสร้างใหม่ */
  }
  const fresh = createSeed(clock.now());
  saveDb(fresh);
  return fresh;
}

export function saveDb(db) {
  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
}

export function resetDb() {
  saveDb(createSeed(clock.now()));
  localStorage.removeItem(FORCE_KEY);
}

const nextId = (db, key) => db.seq[key]++;

// ---------- Views ----------
const iso = (ms) => (ms === null || ms === undefined ? null : toThaiIso(ms));
const fullName = (u) => `${u.firstName} ${u.lastName}`;
const byId = (list, id) => list.find((x) => x.id === Number(id));

function userView(u, admin = false) {
  const base = {
    id: u.id, roleCode: u.roleCode, roleName: u.roleName, memberCode: u.memberCode, email: u.email,
    firstName: u.firstName, lastName: u.lastName, phone: u.phone, avatarUrl: u.avatarUrl, isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt), createdAt: iso(u.createdAt),
  };
  return admin ? { ...base, roleId: u.roleId, updatedAt: iso(u.updatedAt), deletedAt: iso(u.deletedAt) } : base;
}

function modelView(db, m) {
  const brand = byId(db.brands, m.brandId);
  return {
    id: m.id, brandId: m.brandId, brandName: brand?.name ?? null, modelName: m.modelName, cpu: m.cpu,
    ramGb: m.ramGb, storageGb: m.storageGb, screenInch: m.screenInch, os: m.os, imageUrl: m.imageUrl,
  };
}

const isLoanHeld = (l) => l.status === 'borrowing' || l.status === 'return_pending';
const activeLoanOf = (db, notebookId) => db.loans.find((l) => l.notebookId === notebookId && isLoanHeld(l));

export function loanStatus(l, now) {
  return l.status === 'borrowing' && now > l.dueAt ? 'overdue' : l.status;
}

function loanIsLate(l, now) {
  if (l.status === 'borrowing') return now > l.dueAt;
  if (l.status === 'return_pending' || l.status === 'returned') return l.returnRequestedAt > l.dueAt;
  return false;
}

export function reservationStatus(r, now) {
  if (r.status !== 'upcoming') return r.status;
  if (now > r.pickupDeadline) return 'expired';
  return now >= r.startAt ? 'active' : 'upcoming';
}

const isReservationLive = (r, now) => ['upcoming', 'active'].includes(reservationStatus(r, now));

function currentStatus(db, nb, now) {
  if (nb.conditionStatus !== 'normal') return nb.conditionStatus;
  if (activeLoanOf(db, nb.id)) return 'borrowed';
  const hasActive = db.reservations.some((r) => r.notebookId === nb.id && reservationStatus(r, now) === 'active');
  return hasActive ? 'reserved' : 'available';
}

function notebookView(db, nb, now, admin) {
  const m = byId(db.models, nb.modelId);
  const brand = byId(db.brands, m.brandId);
  const base = {
    id: nb.id, assetCode: nb.assetCode, currentStatus: currentStatus(db, nb, now), brandName: brand.name,
    modelName: m.modelName, cpu: m.cpu, ramGb: m.ramGb, storageGb: m.storageGb, screenInch: m.screenInch,
    os: m.os, imageUrl: m.imageUrl,
  };
  if (!admin) return base;
  return {
    ...base, modelId: m.id, brandId: brand.id, serialNumber: nb.serialNumber, conditionStatus: nb.conditionStatus,
    conditionNote: nb.conditionNote, purchasedAt: nb.purchasedAt, createdAt: iso(nb.createdAt),
    updatedAt: iso(nb.updatedAt), deletedAt: iso(nb.deletedAt),
  };
}

/** เพดานเวลาต่อสูงสุด = min(เวลายืม + maxLoanHours, เวลาเริ่มการจองถัดไปของเครื่องนี้) */
function extendLimits(db, l, now) {
  const durationCap = l.borrowedAt + db.settings.maxLoanHours * HOUR;
  const nextRes = db.reservations
    .filter((r) => r.notebookId === l.notebookId && isReservationLive(r, now) && r.startAt >= l.dueAt)
    .map((r) => r.startAt);
  const reservationCap = nextRes.length ? Math.min(...nextRes) : Infinity;
  return { durationCap, reservationCap, max: Math.min(durationCap, reservationCap) };
}

function loanView(db, l, now, { withActions = false } = {}) {
  const nb = byId(db.notebooks, l.notebookId);
  const m = byId(db.models, nb.modelId);
  const status = loanStatus(l, now);
  const view = {
    id: l.id, userId: l.userId, userFullName: fullName(byId(db.users, l.userId)), notebookId: l.notebookId,
    assetCode: nb.assetCode, modelName: m.modelName, reservationId: l.reservationId,
    borrowedAt: iso(l.borrowedAt), dueAt: iso(l.dueAt), returnRequestedAt: iso(l.returnRequestedAt),
    returnedAt: iso(l.returnedAt), receivedBy: l.receivedBy, returnCondition: l.returnCondition,
    returnNote: l.returnNote, cancelledAt: iso(l.cancelledAt), cancelReason: l.cancelReason,
    loanStatus: status, isLate: loanIsLate(l, now),
  };
  if (withActions) {
    const { max } = extendLimits(db, l, now);
    view.actions = {
      canExtend: status === 'borrowing' && max > l.dueAt,
      maxExtendDueAt: iso(max === Infinity ? l.dueAt : max),
      canRequestReturn: status === 'borrowing' || status === 'overdue',
    };
  }
  return view;
}

function reservationView(db, r, now) {
  const nb = byId(db.notebooks, r.notebookId);
  const m = byId(db.models, nb.modelId);
  return {
    id: r.id, userId: r.userId, userFullName: fullName(byId(db.users, r.userId)), notebookId: r.notebookId,
    assetCode: nb.assetCode, modelName: m.modelName, startAt: iso(r.startAt), endAt: iso(r.endAt),
    pickupDeadline: iso(r.pickupDeadline), status: reservationStatus(r, now), loanId: r.loanId,
    cancelledAt: iso(r.cancelledAt), cancelReason: r.cancelReason, createdAt: iso(r.createdAt),
  };
}

const notificationView = (n) => ({
  id: n.id, type: n.type, title: n.title, message: n.message, loanId: n.loanId,
  reservationId: n.reservationId, isRead: n.isRead, createdAt: iso(n.createdAt),
});

// ---------- helper ทั่วไป ----------
function parseTime(value, field) {
  const ms = Date.parse(value);
  if (!value || Number.isNaN(ms)) throw validationError({ [field]: 'รูปแบบวันเวลาไม่ถูกต้อง' });
  return ms;
}

/** แบ่งหน้า + เรียงตาม ?sort=field:dir แล้วแปลงด้วย mapFn */
export function listResult(items, query, sorts, defaultSort, mapFn) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));
  let [field, dir] = (query.sort || defaultSort).split(':');
  if (!sorts[field]) [field, dir] = defaultSort.split(':');
  const key = sorts[field];
  const sign = dir === 'desc' ? -1 : 1;
  const sorted = [...items].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
  const total = sorted.length;
  const data = sorted.slice((page - 1) * pageSize, page * pageSize).map(mapFn);
  return ok(data, { meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
}

const includesText = (haystack, needle) => haystack.toLowerCase().includes(needle.trim().toLowerCase());

function audit(ctx, action, targetTable, targetId, oldValues, newValues) {
  const { db, now, user } = ctx;
  db.auditLogs.unshift({
    id: nextId(db, 'auditLogs'), userId: user.id, action, targetTable, targetId, oldValues, newValues,
    ipAddress: '127.0.0.1', userAgent: 'mock', createdAt: now,
  });
}

function notify(db, now, userId, type, title, message, extra = {}) {
  db.notifications.unshift({
    id: nextId(db, 'notifications'), userId, type, title, message, loanId: null, reservationId: null,
    isRead: false, createdAt: now, ...extra,
  });
}

function findNotebook(db, { notebookId, assetCode }) {
  const nb = notebookId !== undefined
    ? byId(db.notebooks, notebookId)
    : db.notebooks.find((n) => n.assetCode === assetCode);
  if (!nb || nb.deletedAt) throw new MockError('NOTEBOOK_NOT_FOUND');
  return nb;
}

const userActiveLoanCount = (db, userId) => db.loans.filter((l) => l.userId === userId && isLoanHeld(l)).length;

function requireOwnLoan(ctx, id) {
  const l = byId(ctx.db.loans, id);
  if (!l || l.userId !== ctx.user.id) throw new MockError('LOAN_NOT_FOUND');
  return l;
}

function requireOwnReservation(ctx, id) {
  const r = byId(ctx.db.reservations, id);
  if (!r || r.userId !== ctx.user.id) throw new MockError('RESERVATION_NOT_FOUND');
  return r;
}

// ---------- Handlers ----------
const authPayload = (db, now, u) => ({
  token: `mock.${u.id}.${now + TOKEN_TTL}`,
  expiresAt: iso(now + TOKEN_TTL),
  user: userView(u, u.roleCode === 'admin'),
  permissions: PERMISSIONS[u.roleCode],
});

function register({ db, now, body }) {
  const { valid, errors } = validateRegister(body ?? {});
  if (!valid) throw validationError(errors);
  const email = body.email.trim();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new MockError('EMAIL_TAKEN');
  const code = (body.memberCode ?? '').trim();
  if (code && db.users.some((u) => u.memberCode === code)) throw new MockError('MEMBER_CODE_TAKEN');

  const u = {
    id: nextId(db, 'users'), roleId: ROLES.member.id, roleCode: 'member', roleName: ROLES.member.name,
    memberCode: code || null, email, password: body.password, firstName: body.firstName.trim(),
    lastName: body.lastName.trim(), phone: body.phone.trim(), avatarUrl: null, isActive: true,
    lastLoginAt: now, createdAt: now, updatedAt: now, deletedAt: null,
  };
  db.users.push(u);
  return created(authPayload(db, now, u));
}

function login({ db, now, body }) {
  const u = db.users.find((x) => !x.deletedAt && x.email.toLowerCase() === (body?.email ?? '').trim().toLowerCase());
  if (!u || u.password !== body?.password) throw new MockError('INVALID_CREDENTIALS');
  if (!u.isActive) throw new MockError('ACCOUNT_SUSPENDED');
  u.lastLoginAt = now;
  return ok(authPayload(db, now, u));
}

function updateMe({ db, now, user, body }) {
  const merged = { firstName: user.firstName, lastName: user.lastName, phone: user.phone };
  for (const k of Object.keys(merged)) if (body?.[k] !== undefined) merged[k] = body[k];
  const { valid, errors } = validateProfile(merged);
  if (!valid) throw validationError(errors);
  Object.assign(user, { firstName: merged.firstName.trim(), lastName: merged.lastName.trim(), phone: merged.phone.trim(), updatedAt: now });
  return ok(userView(user, user.roleCode === 'admin'));
}

function uploadAvatar({ now, user, file }) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new MockError('INVALID_FILE');
  }
  // mock ไม่เก็บไฟล์จริง สร้างรูปตัวอักษรแทน
  const letter = [...user.firstName][0] === '<' ? '?' : [...user.firstName][0] ?? '?';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#14213d"/>'
    + `<text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  user.avatarUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  user.updatedAt = now;
  return ok(userView(user, user.roleCode === 'admin'));
}

function changePassword({ user, body }) {
  if (body?.currentPassword !== user.password) throw new MockError('CURRENT_PASSWORD_INCORRECT');
  const policy = passwordPolicyError(body.newPassword);
  if (policy) throw validationError({ newPassword: policy });
  if (body.newPassword === user.password) throw validationError({ newPassword: 'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม' });
  user.password = body.newPassword;
  return ok(null);
}

function listMyLoans({ db, now, user, query }) {
  const items = db.loans.filter((l) => l.userId === user.id && (!query.status || loanStatus(l, now) === query.status));
  return listResult(items, query, { borrowedAt: (l) => l.borrowedAt, dueAt: (l) => l.dueAt }, 'borrowedAt:desc',
    (l) => loanView(db, l, now));
}

function listMyReservations({ db, now, user, query }) {
  const items = db.reservations.filter((r) => r.userId === user.id && (!query.status || reservationStatus(r, now) === query.status));
  return listResult(items, query, { startAt: (r) => r.startAt, createdAt: (r) => r.createdAt }, 'startAt:desc',
    (r) => reservationView(db, r, now));
}

function listNotifications({ db, user, query }) {
  const items = db.notifications.filter((n) => n.userId === user.id && (query.unreadOnly !== 'true' || !n.isRead));
  return listResult(items, query, { createdAt: (n) => n.createdAt }, 'createdAt:desc', notificationView);
}

const unreadCount = ({ db, user }) => ok({ count: db.notifications.filter((n) => n.userId === user.id && !n.isRead).length });

function markRead({ db, user, params }) {
  const n = db.notifications.find((x) => x.id === Number(params[0]) && x.userId === user.id);
  if (!n) throw new MockError('NOTIFICATION_NOT_FOUND');
  n.isRead = true;
  return ok(null);
}

function markAllRead({ db, user }) {
  const unread = db.notifications.filter((n) => n.userId === user.id && !n.isRead);
  unread.forEach((n) => { n.isRead = true; });
  return ok({ updated: unread.length });
}

const publicSettings = ({ db }) => {
  const { maxLoanHours, reservationMaxDaysAhead, reservationGraceMinutes, maxActiveLoansPerUser } = db.settings;
  return ok({ maxLoanHours, reservationMaxDaysAhead, reservationGraceMinutes, maxActiveLoansPerUser });
};

const brandOptions = ({ db }) =>
  ok(db.brands.filter((b) => !b.deletedAt).sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ id: b.id, name: b.name })));

function listModels({ db, query }) {
  const items = db.models.filter((m) => !m.deletedAt && !byId(db.brands, m.brandId)?.deletedAt
    && (!query.brandId || m.brandId === Number(query.brandId))
    && (!query.keyword || includesText(`${m.modelName} ${byId(db.brands, m.brandId).name}`, query.keyword)));
  return listResult(items, query, {
    modelName: (m) => m.modelName, brandName: (m) => byId(db.brands, m.brandId).name,
    ramGb: (m) => m.ramGb, createdAt: (m) => m.createdAt,
  }, 'modelName:asc', (m) => modelView(db, m));
}

function getModel({ db, params }) {
  const m = byId(db.models, params[0]);
  if (!m || m.deletedAt) throw new MockError('MODEL_NOT_FOUND');
  return ok(modelView(db, m));
}

function listNotebooks({ db, now, user, query }) {
  const admin = user.roleCode === 'admin';
  const items = db.notebooks.filter((nb) => {
    if (nb.deletedAt && !(admin && query.includeDeleted === 'true')) return false;
    const m = byId(db.models, nb.modelId);
    const brand = byId(db.brands, m.brandId);
    if (query.brandId && brand.id !== Number(query.brandId)) return false;
    if (query.modelId && m.id !== Number(query.modelId)) return false;
    if (query.currentStatus && currentStatus(db, nb, now) !== query.currentStatus) return false;
    if (admin && query.conditionStatus && nb.conditionStatus !== query.conditionStatus) return false;
    if (query.keyword && !includesText(`${nb.assetCode} ${nb.serialNumber} ${m.modelName} ${brand.name}`, query.keyword)) return false;
    return true;
  });
  const model = (nb) => byId(db.models, nb.modelId);
  return listResult(items, query, {
    assetCode: (nb) => nb.assetCode, brandName: (nb) => byId(db.brands, model(nb).brandId).name,
    modelName: (nb) => model(nb).modelName, purchasedAt: (nb) => nb.purchasedAt, createdAt: (nb) => nb.createdAt,
  }, 'assetCode:asc', (nb) => notebookView(db, nb, now, admin));
}

function checkRange(db, now, startAt, endAt) {
  const s = db.settings;
  if (startAt <= now || endAt <= startAt || endAt - startAt > s.maxLoanHours * HOUR) throw new MockError('INVALID_TIME_RANGE');
  if (startAt > now + s.reservationMaxDaysAhead * DAY) {
    throw new MockError('RESERVATION_TOO_FAR_AHEAD', undefined, { vars: { n: s.reservationMaxDaysAhead } });
  }
}

function searchAvailable({ db, now, user, query }) {
  const startAt = parseTime(query.startAt, 'startAt');
  const endAt = parseTime(query.endAt, 'endAt');
  checkRange(db, now, startAt, endAt);
  const admin = user.roleCode === 'admin';
  const items = db.notebooks.filter((nb) => {
    if (nb.deletedAt || nb.conditionStatus !== 'normal') return false;
    if (query.modelId && nb.modelId !== Number(query.modelId)) return false;
    if (db.reservations.some((r) => r.notebookId === nb.id && isReservationLive(r, now) && r.startAt < endAt && r.endAt > startAt)) return false;
    const loan = activeLoanOf(db, nb.id);
    return !(loan && loan.dueAt > startAt);
  });
  items.sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  return ok(items.map((nb) => notebookView(db, nb, now, admin)));
}

function notebookDetail(ctx, nb, { withReservations = false } = {}) {
  const { db, now, user } = ctx;
  const admin = user.roleCode === 'admin';
  const view = notebookView(db, nb, now, admin);
  if (admin) {
    const loan = activeLoanOf(db, nb.id);
    view.activeLoan = loan ? loanView(db, loan, now) : null;
    if (withReservations) {
      view.upcomingReservations = db.reservations
        .filter((r) => r.notebookId === nb.id && isReservationLive(r, now))
        .sort((a, b) => a.startAt - b.startAt)
        .map((r) => reservationView(db, r, now));
    }
  }
  return ok(view);
}

const notebookByAsset = (ctx) => {
  const nb = ctx.db.notebooks.find((n) => n.assetCode === decodeURIComponent(ctx.params[0]) && !n.deletedAt);
  if (!nb) throw new MockError('NOTEBOOK_NOT_FOUND');
  return notebookDetail(ctx, nb);
};

const notebookById = (ctx) => {
  const nb = byId(ctx.db.notebooks, ctx.params[0]);
  if (!nb || nb.deletedAt) throw new MockError('NOTEBOOK_NOT_FOUND');
  return notebookDetail(ctx, nb, { withReservations: true });
};

// L1 POST /loans
function borrowNow(ctx) {
  const { db, now, user, body } = ctx;
  const nb = findNotebook(db, body ?? {});
  if (nb.conditionStatus !== 'normal') throw new MockError('NOTEBOOK_NOT_AVAILABLE');
  if (activeLoanOf(db, nb.id)) throw new MockError('NOTEBOOK_ALREADY_BORROWED');

  const dueAt = parseTime(body.dueAt, 'dueAt');
  if (dueAt <= now || dueAt - now > db.settings.maxLoanHours * HOUR) throw new MockError('INVALID_DUE_AT');
  if (userActiveLoanCount(db, user.id) >= db.settings.maxActiveLoansPerUser) throw new MockError('LOAN_LIMIT_REACHED');

  const conflicts = db.reservations
    .filter((r) => r.notebookId === nb.id && isReservationLive(r, now) && r.startAt < dueAt && r.endAt > now)
    .sort((a, b) => a.startAt - b.startAt);
  if (conflicts.length) {
    const own = conflicts.find((r) => r.userId === user.id);
    if (own) throw new MockError('OWN_RESERVATION_OVERLAP', { reservationId: own.id });
    throw new MockError('RESERVATION_CONFLICT', { availableUntil: iso(conflicts[0].startAt) });
  }

  const loan = {
    id: nextId(db, 'loans'), userId: user.id, notebookId: nb.id, reservationId: null, borrowedAt: now, dueAt,
    returnRequestedAt: null, returnedAt: null, receivedBy: null, returnCondition: null, returnNote: null,
    cancelledAt: null, cancelReason: null, status: 'borrowing',
  };
  db.loans.push(loan);
  audit(ctx, 'CREATE', 'loans', loan.id, null, { dueAt: iso(dueAt), notebookId: nb.id });
  return created(loanView(db, loan, now, { withActions: true }));
}

// L2 GET /loans/:id
function getLoan(ctx) {
  const { db, now, user, params } = ctx;
  const l = byId(db.loans, params[0]);
  const canViewAll = PERMISSIONS[user.roleCode].includes('loan.view_all');
  if (!l || (l.userId !== user.id && !canViewAll)) throw new MockError('LOAN_NOT_FOUND');
  return ok(loanView(db, l, now, { withActions: true }));
}

// L3 POST /loans/:id/extend
function extendLoan(ctx) {
  const { db, now, params, body } = ctx;
  const l = requireOwnLoan(ctx, params[0]);
  const status = loanStatus(l, now);
  if (status === 'overdue') throw new MockError('LOAN_OVERDUE_CANNOT_EXTEND');
  if (status !== 'borrowing') throw new MockError('LOAN_NOT_ACTIVE');

  const newDueAt = parseTime(body?.newDueAt, 'newDueAt');
  if (newDueAt <= l.dueAt) throw new MockError('INVALID_DUE_AT');

  const { durationCap, reservationCap, max } = extendLimits(db, l, now);
  if (newDueAt > durationCap) {
    throw new MockError('LOAN_DURATION_EXCEEDED', { maxDueAt: iso(max) }, { vars: { n: db.settings.maxLoanHours } });
  }
  if (newDueAt > reservationCap) throw new MockError('EXTEND_CONFLICT_RESERVATION', { maxDueAt: iso(max) });

  const old = l.dueAt;
  l.dueAt = newDueAt;
  audit(ctx, 'UPDATE', 'loans', l.id, { dueAt: iso(old) }, { event: 'extend', dueAt: iso(newDueAt) });
  return ok(loanView(db, l, now, { withActions: true }));
}

// L4 POST /loans/:id/return-request
function requestReturn(ctx) {
  const { db, now, params } = ctx;
  const l = requireOwnLoan(ctx, params[0]);
  if (l.status === 'return_pending') throw new MockError('RETURN_ALREADY_REQUESTED');
  if (l.status !== 'borrowing') throw new MockError('LOAN_NOT_ACTIVE');
  l.status = 'return_pending';
  l.returnRequestedAt = now;
  audit(ctx, 'UPDATE', 'loans', l.id, { status: 'borrowing' }, { event: 'return_request' });
  return ok(loanView(db, l, now, { withActions: true }));
}

// L5 GET /loans
function listLoans({ db, now, query }) {
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;
  const items = db.loans.filter((l) =>
    (!query.userId || l.userId === Number(query.userId))
    && (!query.notebookId || l.notebookId === Number(query.notebookId))
    && (!query.status || loanStatus(l, now) === query.status)
    && (query.isLate === undefined || query.isLate === '' || loanIsLate(l, now) === (query.isLate === 'true'))
    && (from === null || l.borrowedAt >= from) && (to === null || l.borrowedAt <= to));
  return listResult(items, query, { borrowedAt: (l) => l.borrowedAt, dueAt: (l) => l.dueAt }, 'borrowedAt:desc',
    (l) => loanView(db, l, now));
}

// L6 GET /loans/pending-return
function listPendingReturn({ db, now, query }) {
  const items = db.loans.filter((l) => l.status === 'return_pending');
  return listResult(items, query, { returnRequestedAt: (l) => l.returnRequestedAt }, 'returnRequestedAt:asc',
    (l) => loanView(db, l, now));
}

// L7 POST /loans/:id/confirm-return
function confirmReturn(ctx) {
  const { db, now, user, params, body } = ctx;
  const l = byId(db.loans, params[0]);
  if (!l) throw new MockError('LOAN_NOT_FOUND');
  if (l.status === 'returned') throw new MockError('LOAN_ALREADY_RETURNED');
  if (l.status === 'cancelled') throw new MockError('LOAN_CANCELLED');

  const errors = {};
  const condition = body?.returnCondition;
  const note = (body?.returnNote ?? '').trim();
  if (!['normal', 'damaged'].includes(condition)) errors.returnCondition = 'กรุณาเลือกสภาพเครื่อง';
  if (condition === 'damaged' && (note.length < 1 || note.length > 500)) errors.returnNote = 'หมายเหตุต้องมี 1–500 ตัวอักษร';
  let requestedAt = l.returnRequestedAt ?? now;
  if (body?.returnRequestedAt) {
    const t = Date.parse(body.returnRequestedAt);
    if (Number.isNaN(t) || t < l.borrowedAt || t > now) errors.returnRequestedAt = 'เวลาที่คืนต้องอยู่ระหว่างเวลายืมถึงปัจจุบัน';
    else requestedAt = t;
  }
  if (Object.keys(errors).length) throw validationError(errors);

  Object.assign(l, {
    status: 'returned', returnRequestedAt: requestedAt, returnedAt: now, receivedBy: ctx.user.id,
    returnCondition: condition, returnNote: note || null,
  });

  const nb = byId(db.notebooks, l.notebookId);
  let affected = [];
  if (condition === 'damaged') {
    nb.conditionStatus = 'damaged';
    nb.conditionNote = note;
    nb.updatedAt = now;
    affected = db.reservations.filter((r) => r.notebookId === nb.id && isReservationLive(r, now))
      .map((r) => ({ id: r.id, startAt: iso(r.startAt), userFullName: fullName(byId(db.users, r.userId)) }));
  }
  audit({ db, now, user }, 'UPDATE', 'loans', l.id, { status: 'return_pending' }, { event: 'confirm_return', returnCondition: condition });
  return ok({ loan: loanView(db, l, now), warnings: { affectedReservations: affected } });
}

// L8 POST /loans/:id/cancel
function cancelLoan(ctx) {
  const { db, now, params, body } = ctx;
  const l = byId(db.loans, params[0]);
  if (!l) throw new MockError('LOAN_NOT_FOUND');
  if (l.status === 'returned' || l.status === 'cancelled') throw new MockError('LOAN_CANNOT_CANCEL');
  const reason = (body?.reason ?? '').trim();
  if (!reason) throw validationError({ reason: 'กรุณาระบุเหตุผล' });
  Object.assign(l, { status: 'cancelled', cancelledAt: now, cancelReason: reason });
  const nb = byId(db.notebooks, l.notebookId);
  notify(db, now, l.userId, 'loan_cancelled', 'รายการยืมถูกยกเลิก', `ผู้ดูแลยกเลิกรายการยืมเครื่อง ${nb.assetCode}`, { loanId: l.id });
  audit(ctx, 'UPDATE', 'loans', l.id, { status: 'borrowing' }, { event: 'cancel', reason });
  return ok(loanView(db, l, now));
}

// R1 POST /reservations
function createReservation(ctx) {
  const { db, now, user, body } = ctx;
  const startAt = parseTime(body?.startAt, 'startAt');
  const endAt = parseTime(body?.endAt, 'endAt');
  checkRange(db, now, startAt, endAt);
  const nb = findNotebook(db, { notebookId: body.notebookId });
  if (nb.conditionStatus !== 'normal') throw new MockError('NOTEBOOK_NOT_AVAILABLE');
  if (db.reservations.some((r) => r.notebookId === nb.id && isReservationLive(r, now) && r.startAt < endAt && r.endAt > startAt)) {
    throw new MockError('RESERVATION_CONFLICT');
  }
  const loan = activeLoanOf(db, nb.id);
  if (loan && loan.dueAt > startAt) throw new MockError('LOAN_CONFLICT');

  const r = {
    id: nextId(db, 'reservations'), userId: user.id, notebookId: nb.id, startAt, endAt,
    pickupDeadline: startAt + db.settings.reservationGraceMinutes * MIN, status: 'upcoming', loanId: null,
    cancelledAt: null, cancelReason: null, createdAt: now,
  };
  db.reservations.push(r);
  audit(ctx, 'CREATE', 'reservations', r.id, null, { startAt: iso(startAt), endAt: iso(endAt) });
  return created(reservationView(db, r, now));
}

// R2 GET /reservations/:id
function getReservation({ db, now, user, params }) {
  const r = byId(db.reservations, params[0]);
  if (!r || (r.userId !== user.id && !PERMISSIONS[user.roleCode].includes('reservation.view_all'))) {
    throw new MockError('RESERVATION_NOT_FOUND');
  }
  return ok(reservationView(db, r, now));
}

// R3 POST /reservations/:id/pickup
function pickupReservation(ctx) {
  const { db, now, user, params } = ctx;
  const r = requireOwnReservation(ctx, params[0]);
  if (r.status === 'cancelled') throw new MockError('RESERVATION_CANCELLED');
  if (r.status === 'fulfilled') throw new MockError('RESERVATION_ALREADY_PICKED_UP');
  if (r.status === 'expired' || now > r.pickupDeadline) throw new MockError('RESERVATION_EXPIRED');
  if (now < r.startAt) throw new MockError('RESERVATION_NOT_STARTED');

  const nb = byId(db.notebooks, r.notebookId);
  if (nb.conditionStatus !== 'normal') throw new MockError('NOTEBOOK_NOT_AVAILABLE');
  if (activeLoanOf(db, nb.id)) throw new MockError('NOTEBOOK_NOT_RETURNED_YET');
  if (userActiveLoanCount(db, user.id) >= db.settings.maxActiveLoansPerUser) throw new MockError('LOAN_LIMIT_REACHED');

  const loan = {
    id: nextId(db, 'loans'), userId: user.id, notebookId: nb.id, reservationId: r.id, borrowedAt: now, dueAt: r.endAt,
    returnRequestedAt: null, returnedAt: null, receivedBy: null, returnCondition: null, returnNote: null,
    cancelledAt: null, cancelReason: null, status: 'borrowing',
  };
  db.loans.push(loan);
  r.status = 'fulfilled';
  r.loanId = loan.id;
  audit(ctx, 'CREATE', 'loans', loan.id, null, { event: 'pickup', reservationId: r.id });
  return created(loanView(db, loan, now, { withActions: true }));
}

// R4 POST /reservations/:id/cancel
function cancelReservation(ctx) {
  const { db, now, user, params, body } = ctx;
  const r = byId(db.reservations, params[0]);
  const isOwner = r?.userId === user.id;
  const isAdmin = PERMISSIONS[user.roleCode].includes('reservation.cancel_any');
  if (!r || (!isOwner && !isAdmin)) throw new MockError('RESERVATION_NOT_FOUND');

  const reason = (body?.reason ?? '').trim();
  if (!isOwner && !reason) throw validationError({ reason: 'กรุณาระบุเหตุผล' });
  if (!isReservationLive(r, now)) throw new MockError('RESERVATION_CANNOT_CANCEL');

  Object.assign(r, { status: 'cancelled', cancelledAt: now, cancelReason: reason || null });
  if (!isOwner) {
    const nb = byId(db.notebooks, r.notebookId);
    notify(db, now, r.userId, 'reservation_cancelled', 'การจองถูกยกเลิก', `การจองเครื่อง ${nb.assetCode} ถูกยกเลิกโดยผู้ดูแล`, { reservationId: r.id });
  }
  audit(ctx, 'UPDATE', 'reservations', r.id, { status: 'upcoming' }, { event: 'cancel', reason });
  return ok(reservationView(db, r, now));
}

// R5 GET /reservations
function listReservations({ db, now, query }) {
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;
  const items = db.reservations.filter((r) =>
    (!query.userId || r.userId === Number(query.userId))
    && (!query.notebookId || r.notebookId === Number(query.notebookId))
    && (!query.status || reservationStatus(r, now) === query.status)
    && (from === null || r.startAt >= from) && (to === null || r.startAt <= to));
  return listResult(items, query, { startAt: (r) => r.startAt, createdAt: (r) => r.createdAt }, 'startAt:desc',
    (r) => reservationView(db, r, now));
}

// ---------- ตาราง route (ลำดับสำคัญ: route เฉพาะต้องมาก่อน /:id) ----------
const ID = '([^/]+)';
export const routes = [];
export function addRoute(method, pattern, handler, opts = {}) {
  routes.push({ method, regex: new RegExp(`^${pattern}$`), handler, ...opts });
}

addRoute('POST', '/auth/register', register, { auth: false });
addRoute('POST', '/auth/login', login, { auth: false });
addRoute('POST', '/auth/logout', () => ok(null));

addRoute('GET', '/me', ({ user }) => ok({ ...userView(user, user.roleCode === 'admin'), permissions: PERMISSIONS[user.roleCode] }));
addRoute('PATCH', '/me', updateMe);
addRoute('POST', '/me/avatar', uploadAvatar);
addRoute('PUT', '/me/password', changePassword);
addRoute('GET', '/me/loans', listMyLoans);
addRoute('GET', '/me/reservations', listMyReservations);
addRoute('GET', '/me/notifications', listNotifications);
addRoute('GET', '/me/notifications/unread-count', unreadCount);
addRoute('PATCH', '/me/notifications/read-all', markAllRead);
addRoute('PATCH', `/me/notifications/${ID}/read`, markRead);

addRoute('GET', '/settings/public', publicSettings);
addRoute('GET', '/brands/options', brandOptions, { perm: 'notebook.view' });
addRoute('GET', '/notebook-models', listModels, { perm: 'notebook.view' });
addRoute('GET', `/notebook-models/${ID}`, getModel, { perm: 'notebook.view' });

addRoute('GET', '/notebooks', listNotebooks, { perm: 'notebook.view' });
addRoute('GET', '/notebooks/available', searchAvailable, { perm: 'notebook.view' });
addRoute('GET', `/notebooks/by-asset/${ID}`, notebookByAsset, { perm: 'notebook.view' });
addRoute('GET', `/notebooks/${ID}`, notebookById, { perm: 'notebook.view' });

addRoute('POST', '/loans', borrowNow, { perm: 'loan.create' });
addRoute('GET', '/loans', listLoans, { perm: 'loan.view_all' });
addRoute('GET', '/loans/pending-return', listPendingReturn, { perm: 'loan.receive' });
addRoute('GET', `/loans/${ID}`, getLoan);
addRoute('POST', `/loans/${ID}/extend`, extendLoan, { perm: 'loan.extend' });
addRoute('POST', `/loans/${ID}/return-request`, requestReturn, { perm: 'loan.return_request' });
addRoute('POST', `/loans/${ID}/confirm-return`, confirmReturn, { perm: 'loan.receive' });
addRoute('POST', `/loans/${ID}/cancel`, cancelLoan, { perm: 'loan.cancel' });

addRoute('POST', '/reservations', createReservation, { perm: 'reservation.create' });
addRoute('GET', '/reservations', listReservations, { perm: 'reservation.view_all' });
addRoute('GET', `/reservations/${ID}`, getReservation);
addRoute('POST', `/reservations/${ID}/pickup`, pickupReservation, { perm: 'loan.create' });
addRoute('POST', `/reservations/${ID}/cancel`, cancelReservation);

registerAdminRoutes({
  addRoute, MockError, ok, created, listResult, byId, iso, nextId, audit, notebookView, modelView, userView, loanView,
  reservationView, currentStatus, loanStatus, loanIsLate, isReservationLive, activeLoanOf, isLoanHeld, includesText,
  validationError, listNotebooks, fullName,
});

// ---------- ตัวจัดการ request ----------
function authenticate(db, now, token) {
  const m = /^mock\.(\d+)\.(\d+)$/.exec(token ?? '');
  if (!m || Number(m[2]) <= now) throw new MockError('UNAUTHORIZED');
  const u = db.users.find((x) => x.id === Number(m[1]) && !x.deletedAt);
  if (!u) throw new MockError('UNAUTHORIZED');
  if (!u.isActive) throw new MockError('ACCOUNT_SUSPENDED');
  return u;
}

// error ที่ test สั่งให้ตอบในครั้งถัดไป (เก็บใน localStorage เพื่อข้ามหน้า)
const readForced = () => {
  try {
    return JSON.parse(localStorage.getItem(FORCE_KEY)) ?? [];
  } catch {
    return [];
  }
};

/** สั่งให้ request ถัดไปที่ตรงเงื่อนไขตอบ error นี้ เช่น queueError('POST', '^/loans$', { code: 'NOTEBOOK_ALREADY_BORROWED' }) */
export function queueError(method, pathPattern, { code, status, message, details } = {}) {
  localStorage.setItem(FORCE_KEY, JSON.stringify([...readForced(), { method, pathPattern, code, status, message, details }]));
}

function takeForced(method, path) {
  const list = readForced();
  const i = list.findIndex((f) => f.method === method && new RegExp(f.pathPattern).test(path));
  if (i < 0) return null;
  const [f] = list.splice(i, 1);
  localStorage.setItem(FORCE_KEY, JSON.stringify(list));
  return f;
}

let delayRange = MOCK_DELAY_MS;
export const setDelay = (range) => { delayRange = range; };
const sleep = () => {
  const [lo, hi] = delayRange;
  return hi > 0 ? new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo))) : Promise.resolve();
};

/**
 * @param {{ method: string, path: string, query?: object, body?: any, file?: File, token?: string | null }} req
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handle({ method, path, query = {}, body, file, token }) {
  await sleep();
  const db = loadDb();
  const now = clock.now();
  try {
    const route = routes.find((r) => r.method === method && r.regex.test(path));
    if (!route) throw new MockError('INTERNAL_ERROR', undefined, { message: `mock ยังไม่รองรับ ${method} ${path}` });

    let user = null;
    if (route.auth !== false) {
      user = authenticate(db, now, token);
      if (route.perm && !PERMISSIONS[user.roleCode].includes(route.perm)) throw new MockError('FORBIDDEN');
    }

    const forced = takeForced(method, path);
    if (forced) throw new MockError(forced.code, forced.details, { status: forced.status, message: forced.message });

    const params = route.regex.exec(path).slice(1);
    const result = route.handler({ db, now, user, params, query, body, file });
    if (method !== 'GET') saveDb(db);
    return result;
  } catch (e) {
    if (e instanceof MockError) return failure(e); // handler ตรวจกฎก่อนแก้ข้อมูล จึงไม่ต้องบันทึก db
    throw e;
  }
}

// ---------- เริ่มต้นตอนโหลดหน้า ----------
export function initMock(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  const reset = params.get('mockReset') === '1';
  if (reset) clock.reset();
  clock.initFromUrl(search);
  if (reset || !localStorage.getItem(MOCK_DB_KEY)) resetDb();
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  initMock();
  // เครื่องมือสำหรับ test / ผู้พัฒนา เปิดจาก console หรือ page.evaluate
  window.__mock = {
    queueError,
    setDelay,
    reset: resetDb,
    getDb: loadDb,
    setDb: saveDb,
    setNow: (value, opts) => clock.set(value, opts),
    advance: clock.advance,
    addNotification(userId, partial = {}) {
      const db = loadDb();
      notify(db, clock.now(), userId, partial.type ?? 'loan_due_soon', partial.title ?? 'ใกล้ครบกำหนดคืน',
        partial.message ?? 'แจ้งเตือนทดสอบ', partial);
      saveDb(db);
    },
  };
}
