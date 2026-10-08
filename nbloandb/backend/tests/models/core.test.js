import { pool, closePool, withRollback, unique } from '../helpers/testDb.js';
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { toCamel, toCamelRows, toSnake } from '../../src/models/core/mapper.js';
import { buildSet, buildInsert, buildOrderBy, buildPaging, buildWhere, likeParam } from '../../src/models/core/sqlBuilder.js';
import { DbError } from '../../src/models/core/DbError.js';
import { query, execute, withTransaction } from '../../src/models/core/db.js';
import { roles, brands, users, reservations } from '../../src/models/index.js';

after(closePool);

describe('mapper', () => {
  test('toCamel แปลงชื่อ field และชนิดข้อมูลตาม casts', () => {
    const due = new Date();
    assert.deepEqual(
      toCamel({ due_at: due, is_active: 1, old_values: '{"a":1}', ram_gb: '16' }, { isActive: 'bool', oldValues: 'json', ramGb: 'number' }),
      { dueAt: due, isActive: true, oldValues: { a: 1 }, ramGb: 16 },
    );
  });

  test('toCamel คง null ไว้และคืน null เมื่อไม่มีแถว', () => {
    assert.deepEqual(toCamel({ deleted_at: null, is_active: null }, { isActive: 'bool' }), { deletedAt: null, isActive: null });
    assert.equal(toCamel(undefined), null);
  });

  test('toCamelRows และ toSnake', () => {
    assert.deepEqual(toCamelRows([{ first_name: 'สมชาย' }, { first_name: 'สมหญิง' }]), [{ firstName: 'สมชาย' }, { firstName: 'สมหญิง' }]);
    assert.deepEqual(toSnake({ firstName: 'สมชาย', returnRequestedAt: null }), { first_name: 'สมชาย', return_requested_at: null });
  });
});

describe('sqlBuilder', () => {
  test('buildSet สร้าง SET จาก whitelist ข้าม undefined และแปลง boolean', () => {
    assert.deepEqual(buildSet({ firstName: 'A', isActive: false, phone: undefined }, ['firstName', 'isActive', 'phone']), {
      sql: 'first_name = ?, is_active = ?',
      params: ['A', 0],
    });
  });

  test('buildSet/buildInsert ปฏิเสธ field นอก whitelist ด้วย INVALID_COLUMN', () => {
    for (const build of [buildSet, buildInsert]) {
      assert.throws(() => build({ name: 'x', 'id = 1; --': 1 }, ['name']), (err) => err instanceof DbError && err.code === 'INVALID_COLUMN');
    }
  });

  test('buildInsert', () => {
    assert.deepEqual(buildInsert({ roleId: 2, email: 'a@b.c' }, ['roleId', 'email']), {
      sql: '(role_id, email) VALUES (?, ?)',
      params: [2, 'a@b.c'],
    });
  });

  test('buildOrderBy ใช้ whitelist, ค่าเริ่มต้น และปฏิเสธ field/ทิศแปลก', () => {
    const sortable = { createdAt: 'u.created_at', email: 'u.email' };
    assert.equal(buildOrderBy('createdAt:desc', sortable, 'email:asc'), 'ORDER BY u.created_at DESC');
    assert.equal(buildOrderBy(undefined, sortable, 'email:asc'), 'ORDER BY u.email ASC');
    assert.equal(buildOrderBy('email', sortable, 'email:asc'), 'ORDER BY u.email ASC');
    for (const bad of ['password_hash:asc', 'email:sideways', 'email:asc; DROP TABLE users', 'toString:asc']) {
      assert.throws(() => buildOrderBy(bad, sortable, 'email:asc'), (err) => err.code === 'INVALID_COLUMN', bad);
    }
  });

  test('buildPaging: page เริ่มที่ 1, ค่าเริ่มต้น 20, สูงสุด 100', () => {
    assert.deepEqual(buildPaging(3, 10), { sql: 'LIMIT ? OFFSET ?', params: [10, 20], page: 3, pageSize: 10 });
    assert.deepEqual(buildPaging(), { sql: 'LIMIT ? OFFSET ?', params: [20, 0], page: 1, pageSize: 20 });
    assert.equal(buildPaging(1, 500).pageSize, 100);
    assert.deepEqual(buildPaging(-2, 0).params, [20, 0]);
    assert.deepEqual(buildPaging('2', '5').params, [5, 5]);
  });

  test('buildWhere ข้ามเงื่อนไขที่เป็น false และรวม params ตามลำดับ', () => {
    assert.deepEqual(buildWhere([['a = ?', 1], false, null, ['b IN (?, ?)', 2, true]]), {
      sql: 'WHERE (a = ?) AND (b IN (?, ?))',
      params: [1, 2, 1],
    });
    assert.deepEqual(buildWhere([false]), { sql: '', params: [] });
  });

  test('likeParam escape อักขระพิเศษของ LIKE', () => {
    assert.equal(likeParam('50%_x'), '%50\\%\\_x%');
  });
});

describe('DbError', () => {
  test('แปลง errno เป็น code และดึงชื่อ constraint', () => {
    const cases = [
      [1062, "Duplicate entry 'a@b.com' for key 'uq_users_email'", 'DUPLICATE', 'uq_users_email'],
      [1452, 'Cannot add or update a child row: a foreign key constraint fails (`db`.`users`, CONSTRAINT `fk_users_role` FOREIGN KEY ...)', 'FK_NOT_FOUND', 'fk_users_role'],
      [1451, 'Cannot delete or update a parent row: a foreign key constraint fails (`db`.`users`, CONSTRAINT `fk_users_role` FOREIGN KEY ...)', 'FK_IN_USE', 'fk_users_role'],
      [4025, 'CONSTRAINT `chk_res_period` failed for `db`.`reservations`', 'CHECK_FAILED', 'chk_res_period'],
      [3819, "Check constraint 'chk_res_period' is violated.", 'CHECK_FAILED', 'chk_res_period'],
      [2002, 'connect ECONNREFUSED', 'DB_ERROR', null],
    ];
    for (const [errno, message, code, constraint] of cases) {
      const original = Object.assign(new Error(message), { errno });
      const err = DbError.from(original);
      assert.ok(err instanceof DbError);
      assert.equal(err.code, code);
      assert.equal(err.constraint, constraint);
      assert.equal(err.cause, original);
    }
  });

  test('DbError.from คืนตัวเดิมถ้าเป็น DbError อยู่แล้ว', () => {
    const err = new DbError('INVALID_COLUMN', 'x');
    assert.equal(DbError.from(err), err);
  });

  test('error จริงจาก DB ได้ code ถูก: DUPLICATE / FK_NOT_FOUND / FK_IN_USE / CHECK_FAILED', () =>
    withRollback(async (conn) => {
      await assert.rejects(roles.insert({ code: 'admin', name: 'ซ้ำ' }, { conn }), { code: 'DUPLICATE', constraint: 'uq_roles_code' });
      await assert.rejects(
        users.insert({ roleId: 250, email: `${unique('x')}@t.local`, passwordHash: 'x'.repeat(60), firstName: 'a', lastName: 'b', phone: '1' }, { conn }),
        { code: 'FK_NOT_FOUND', constraint: 'fk_users_role' },
      );
      await assert.rejects(roles.hardDelete(1, { conn }), { code: 'FK_IN_USE', constraint: 'fk_users_role' });
      const now = new Date();
      await assert.rejects(reservations.insert({ userId: 2, notebookId: 1, startAt: now, endAt: now }, { conn }), {
        code: 'CHECK_FAILED',
        constraint: 'chk_res_period',
      });
    }));
});

describe('db', () => {
  test('query/execute ทำงานกับ pool และคืนรูปแบบที่ตกลง', async () => {
    assert.deepEqual(await query('SELECT 1 AS ok'), [{ ok: 1 }]);
    await withRollback(async (conn) => {
      const result = await execute('INSERT INTO brands (name) VALUES (?)', [unique('B')], { conn });
      assert.equal(typeof result.insertId, 'number');
      assert.equal(result.affectedRows, 1);
    });
  });

  test('SQL ผิดถูกห่อเป็น DbError DB_ERROR', async () => {
    await assert.rejects(query('SELECT * FROM no_such_table'), (err) => err instanceof DbError && err.code === 'DB_ERROR');
  });

  test('session ใช้เวลาไทย +07:00', async () => {
    const [row] = await query('SELECT @@session.time_zone AS tz');
    assert.equal(row.tz, '+07:00');
  });

  test('strict mode: ค่ายาวเกิน column → DbError ไม่ถูกตัดทิ้งเงียบๆ', () =>
    withRollback(async (conn) => {
      await assert.rejects(brands.insert({ name: 'x'.repeat(51) }, { conn }), (err) => err instanceof DbError && err.code === 'DB_ERROR');
    }));

  test('withTransaction commit เมื่อสำเร็จ', async () => {
    const code = unique('tx');
    const role = await withTransaction((conn) => roles.insert({ code, name: 'commit test' }, { conn }));
    try {
      assert.equal((await roles.findByCode(code)).id, role.id);
    } finally {
      await roles.hardDelete(role.id);
    }
  });

  test('withTransaction rollback เมื่อ throw แล้ว throw ต่อ และคืน connection ให้ pool', async () => {
    const name = unique('Rollback');
    await assert.rejects(
      withTransaction(async (conn) => {
        await brands.insert({ name }, { conn });
        throw new Error('boom');
      }),
      { message: 'boom' },
    );
    assert.equal(await brands.findByName(name, { includeDeleted: true }), null);
    assert.equal(pool.pool._freeConnections.length, pool.pool._allConnections.length);
  });
});
