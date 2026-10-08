// สร้างข้อมูลตั้งต้นสำหรับ test ผ่าน model (ทุกอย่างอยู่ใน transaction ของ test และถูก rollback)
import { unique } from './testDb.js'; // ต้องมาก่อน models เพื่อให้ pool ชี้ไปที่ฐานทดสอบ
import { users, brands, notebookModels, notebooks, roles } from '../../src/models/index.js';

export const FAKE_HASH = '$2b$10$abcdefghijklmnopqrstuuSx2bJ2s0a0bq4mJxXlY9nN6v2Zf0yK3'; // 60 ตัวอักษร

export async function createUser(conn, overrides = {}) {
  const role = await roles.findByCode(overrides.roleCode ?? 'member', { conn });
  const { roleCode, ...data } = overrides;
  return users.insert(
    {
      roleId: role.id,
      email: `${unique('u')}@test.local`,
      passwordHash: FAKE_HASH,
      firstName: 'ทดสอบ',
      lastName: 'ระบบ',
      phone: '0800000000',
      ...data,
    },
    { conn },
  );
}

export async function createNotebook(conn, overrides = {}) {
  const brand = await brands.insert({ name: unique('Brand') }, { conn });
  const model = await notebookModels.insert(
    { brandId: brand.id, modelName: unique('Model'), cpu: 'Core i5', ramGb: 16, storageGb: 512, screenInch: 14.0, os: 'Windows 11' },
    { conn },
  );
  return notebooks.insert({ modelId: model.id, assetCode: unique('A'), serialNumber: unique('S'), ...overrides }, { conn });
}
