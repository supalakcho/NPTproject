// helper ของ test ชั้น service: service เปิด transaction เอง ข้อมูลจึง commit ลงฐานทดสอบจริง
// (ฐานทดสอบถูกสร้างใหม่ทุกครั้งที่รัน npm test) ใช้ค่า unique() กันข้อมูลชนกัน
import os from 'node:os';
import path from 'node:path';
import { unique, closePool, fromNow, HOUR, MINUTE } from './testDb.js'; // ต้องมาก่อน models/services

process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.LOG_DIR = path.join(os.tmpdir(), 'nbloan-test-logs');
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'nbloan-test-uploads');
process.env.JOBS_ENABLED = 'false';
process.env.BCRYPT_ROUNDS = '4';

const { users, roles, brands, notebookModels, notebooks, loans, reservations, auditLogs } = await import('../../src/models/index.js');
const { getPermissions } = await import('../../src/services/core/authorize.js');

export { unique, closePool, fromNow, HOUR, MINUTE };
export const FAKE_HASH = '$2b$10$abcdefghijklmnopqrstuuSx2bJ2s0a0bq4mJxXlY9nN6v2Zf0yK3';

/** สร้างผู้ใช้ (commit) roleCode: 'member' | 'admin' */
export async function createUser({ roleCode = 'member', ...data } = {}) {
  const role = await roles.findByCode(roleCode);
  return users.insert({
    roleId: role.id,
    email: `${unique('u')}@test.local`,
    passwordHash: FAKE_HASH,
    firstName: 'ทดสอบ',
    lastName: 'ระบบ',
    phone: '0800000000',
    ...data,
  });
}

/** ctx แบบเดียวกับที่ auth.authenticate สร้าง */
export async function ctxFor(user) {
  return {
    userId: user.id,
    roleId: user.roleId,
    roleCode: user.roleCode,
    permissions: await getPermissions(user.roleId),
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };
}

export async function memberCtx(data) {
  const user = await createUser(data);
  return { user, ctx: await ctxFor(user) };
}

export async function adminCtx(data) {
  const user = await createUser({ roleCode: 'admin', ...data });
  return { user, ctx: await ctxFor(user) };
}

/** ยี่ห้อ + รุ่น + เครื่องใหม่ (commit) */
export async function createNotebook(overrides = {}) {
  const brand = await brands.insert({ name: unique('Brand') });
  const model = await notebookModels.insert({
    brandId: brand.id, modelName: unique('Model'), cpu: 'Core i5', ramGb: 16, storageGb: 512, screenInch: 14.0, os: 'Windows 11',
  });
  return notebooks.insert({ modelId: model.id, assetCode: unique('A').toUpperCase(), serialNumber: unique('S'), ...overrides });
}

/** สร้างการยืมตรงผ่าน model (ข้ามกฎของ service) สำหรับเตรียมสถานการณ์ */
export function insertLoan(user, nb, borrowedOffset, dueOffset, extra = {}) {
  return loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(borrowedOffset), dueAt: fromNow(dueOffset), ...extra });
}

/** สร้างการจองตรงผ่าน model (ข้ามกฎของ service) เช่น การจองที่เริ่มไปแล้ว */
export function insertReservation(user, nb, startOffset, endOffset) {
  return reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(startOffset), endAt: fromNow(endOffset) });
}

/** audit ล่าสุดของ target */
export async function lastAudit(filter) {
  const { rows } = await auditLogs.list({ ...filter, pageSize: 1 });
  return rows[0] ?? null;
}

/** assert.rejects ด้วย AppError code */
export const code = (expected) => (err) => {
  if (err?.code !== expected) throw new Error(`expected ${expected}, got ${err?.code}: ${err?.message}`);
  return true;
};
