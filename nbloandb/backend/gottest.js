// เพิ่มผู้ใช้ 1 คนลงฐานข้อมูล (DB_NAME ใน .env) ผ่าน model layer
// node gottest.js --email a@b.com --password 1234abcd --first-name สมชาย --last-name ใจดี --phone 0812345678 [--member-code 65000002] [--role member]
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { users, roles, DbError, closePool } from './src/models/index.js';

const USAGE = `วิธีใช้:
  node gottest.js --email <อีเมล> --password <รหัสผ่าน> --first-name <ชื่อ> --last-name <นามสกุล> --phone <เบอร์โทร>
                  [--member-code <รหัสสมาชิก>] [--role <member|admin>]`;

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
    phone: { type: 'string' },
    'member-code': { type: 'string' },
    role: { type: 'string', default: 'member' },
  },
});

const missing = ['email', 'password', 'first-name', 'last-name', 'phone'].filter((key) => !args[key]);
if (missing.length) {
  console.error(`ขาดค่า: ${missing.map((key) => `--${key}`).join(', ')}\n\n${USAGE}`);
  process.exit(1);
}

try {
  const role = await roles.findByCode(args.role);
  if (!role) throw new Error(`ไม่พบ role "${args.role}"`);

  const user = await users.insert({
    roleId: role.id,
    email: args.email,
    passwordHash: await bcrypt.hash(args.password, 10),
    firstName: args['first-name'],
    lastName: args['last-name'],
    phone: args.phone,
    memberCode: args['member-code'],
  });
  console.log('เพิ่มผู้ใช้สำเร็จ:');
  console.log(user);
} catch (err) {
  if (err instanceof DbError && err.code === 'DUPLICATE') {
    console.error(`ข้อมูลซ้ำกับผู้ใช้ที่มีอยู่แล้ว (${err.constraint})`);
  } else {
    console.error(`เพิ่มผู้ใช้ไม่สำเร็จ: ${err.message}`);
  }
  process.exitCode = 1;
} finally {
  await closePool();
}
