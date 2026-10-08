// เรียกฟังก์ชันของ service จาก command line เพื่อทดลองกฎธุรกิจโดยไม่ต้องเปิด server
//
// ใช้งาน (รันจากโฟลเดอร์ backend):
//   node tests/services/testdea.js list                                   ดูฟังก์ชันทั้งหมด
//   node tests/services/testdea.js <service>.<function> (--test-db | --main-db) [--as <email>] [args...]
//
// args แต่ละตัว:
//   12                  → ตัวเลข (เช่น id)
//   key=value           → รวมเป็น object เดียว เช่น notebookId=1 dueAt=2026-10-09T17:00
//   '{"a":1}'           → JSON (ใน PowerShell 5.1 ใช้ key=value จะง่ายกว่า)
//
// ตัวอย่าง:
//   node tests/services/testdea.js notebooks.list --test-db --as member@example.com pageSize=3
//   node tests/services/testdea.js loans.borrowNow --test-db --as member@example.com notebookId=1 dueAt=2026-10-09T17:00
//   node tests/services/testdea.js loans.extend --test-db --as member@example.com 1 newDueAt=2026-10-09T20:00
//   node tests/services/testdea.js reports.monthlyLoans --main-db --as admin@example.com fromMonth=2026-01 toMonth=2026-10
//
// ต้องระบุฐานข้อมูลทุกครั้ง (อย่างใดอย่างหนึ่ง):
//   --test-db  ใช้ฐานทดสอบ DB_TEST_NAME (สร้างใหม่ด้วย npm run test:setup-db)
//   --main-db  ใช้ฐานจริง DB_NAME และ "บันทึกข้อมูลจริง"
// --as  เรียกในฐานะผู้ใช้คนนั้น (ไม่ต้องใช้รหัสผ่าน · ไม่ใส่ = ยังไม่ login)
//
// รันจากโฟลเดอร์ไหนก็ได้ (อ่าน .env ของ backend เสมอ) เช่น ใน tests/services: node testdea.js list
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(BACKEND_DIR, '.env'), quiet: true });
process.env.LOG_DIR = path.resolve(BACKEND_DIR, process.env.LOG_DIR ?? 'logs');
process.env.UPLOAD_DIR = path.resolve(BACKEND_DIR, process.env.UPLOAD_DIR ?? 'uploads');

const argv = process.argv.slice(2);
const flags = { as: null, testDb: false, mainDb: false };
const rest = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--as') flags.as = argv[++i];
  else if (argv[i] === '--test-db') flags.testDb = true;
  else if (argv[i] === '--main-db') flags.mainDb = true;
  else rest.push(argv[i]);
}
const [target, ...rawArgs] = rest;
const isHelp = !target || target === 'list' || target === 'help';

if (!isHelp && flags.testDb === flags.mainDb) {
  console.error('✖ ต้องระบุฐานข้อมูลอย่างใดอย่างหนึ่ง: --test-db (ฐานทดสอบ) หรือ --main-db (ฐานจริง)');
  process.exit(1);
}

if (flags.testDb) await import('../helpers/testEnv.js'); // ต้องมาก่อน models: ชี้ pool ไปฐานทดสอบ
const services = await import('../../src/services/index.js');
const { users, closePool } = await import('../../src/models/index.js');
const { getPermissions } = await import('../../src/services/core/authorize.js');
const { jsonReplacer } = await import('../../src/controllers/respond.js');

/** แปลง args จาก command line: ตัวเลข / key=value (รวมเป็น object เดียว) / JSON / ข้อความ */
export function parseArgs(args) {
  const out = [];
  let pairs = null;
  for (const arg of args) {
    const pair = /^([A-Za-z_]\w*)=(.*)$/s.exec(arg);
    if (pair) {
      if (!pairs) out.push((pairs = {}));
      pairs[pair[1]] = pair[2];
    } else if (/^-?\d+(\.\d+)?$/.test(arg)) {
      out.push(Number(arg));
    } else {
      try {
        out.push(JSON.parse(arg));
      } catch {
        out.push(arg);
      }
    }
  }
  return out;
}

/** ctx ของผู้ใช้ตามอีเมล (เหมือนที่ middleware สร้างหลัง login) หรือ ctx ของผู้ที่ยังไม่ login */
export async function ctxFor(email) {
  const info = { ip: '127.0.0.1', userAgent: 'testdea-cli' };
  if (!email) return services.anonymousCtx(info);
  const user = await users.findByEmail(email.toLowerCase());
  if (!user) throw new Error(`ไม่พบผู้ใช้ ${email}`);
  return { userId: user.id, roleId: user.roleId, roleCode: user.roleCode, permissions: await getPermissions(user.roleId), ...info };
}

function listFunctions() {
  for (const [name, mod] of Object.entries(services)) {
    if (typeof mod === 'object' && mod) console.log(`${name}: ${Object.keys(mod).join(', ')}`);
  }
}

async function main() {
  if (isHelp) {
    console.log('ใช้งาน: node tests/services/testdea.js <service>.<function> (--test-db | --main-db) [--as <email>] [args...]\n');
    listFunctions();
    return 0;
  }
  const [serviceName, fnName] = target.split('.');
  const fn = services[serviceName]?.[fnName];
  if (typeof fn !== 'function') {
    console.error(`ไม่พบฟังก์ชัน "${target}" ดูรายการด้วย: node tests/services/testdea.js list`);
    return 1;
  }
  const ctx = await ctxFor(flags.as);
  const args = parseArgs(rawArgs);
  console.log(`▶ ${target} as ${flags.as ?? '(ยังไม่ login)'} · DB=${process.env.DB_NAME}`);
  console.log('  args:', JSON.stringify(args));
  try {
    const result = await fn(ctx, ...args);
    console.log('✔ สำเร็จ');
    console.log(JSON.stringify(result, jsonReplacer, 2));
    return 0;
  } catch (err) {
    console.log(`✖ ${err.code ?? err.name} (${err.status ?? '-'}): ${err.message}`);
    if (err.details !== undefined) console.log(JSON.stringify(err.details, jsonReplacer, 2));
    return 1;
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  console.error('✖', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
