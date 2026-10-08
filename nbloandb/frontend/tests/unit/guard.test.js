import { describe, expect, it } from 'vitest';
import { checkAccess } from '../../assets/js/core/guard.js';

const NOW = Date.parse('2026-10-08T10:00:00+07:00');
const make = (roleCode, permissions = [], expiresAt = '2026-10-08T18:00:00+07:00') => ({
  token: 't', expiresAt, user: { roleCode }, permissions,
});

describe('checkAccess', () => {
  it('P-05 ยังไม่ login -> ไปหน้า login', () => {
    expect(checkAccess(null, { role: 'member' }, NOW)).toEqual({ ok: false, to: 'login' });
  });

  it('P-02 session หมดอายุ -> ไปหน้า login', () => {
    expect(checkAccess(make('member', [], '2026-10-08T09:00:00+07:00'), { role: 'member' }, NOW)).toEqual({ ok: false, to: 'login' });
  });

  it('P-01 สมาชิกเปิดหน้าแอดมิน -> ไป member/home.html', () => {
    expect(checkAccess(make('member'), { role: 'admin' }, NOW)).toEqual({ ok: false, to: 'home', path: 'member/home.html' });
  });

  it('แอดมินเปิดหน้าสมาชิก -> ไป admin/returns.html', () => {
    expect(checkAccess(make('admin'), { role: 'member' }, NOW)).toEqual({ ok: false, to: 'home', path: 'admin/returns.html' });
  });

  it('role ตรง -> ผ่าน', () => {
    expect(checkAccess(make('member'), { role: 'member' }, NOW)).toEqual({ ok: true });
    expect(checkAccess(make('admin'), { role: 'admin' }, NOW)).toEqual({ ok: true });
  });

  it('ไม่มี permission -> forbidden', () => {
    expect(checkAccess(make('admin', ['loan.view_all']), { permission: 'report.view' }, NOW))
      .toEqual({ ok: false, to: 'forbidden', path: 'admin/returns.html' });
  });

  it('มี permission -> ผ่าน', () => {
    expect(checkAccess(make('admin', ['report.view']), { permission: 'report.view' }, NOW)).toEqual({ ok: true });
  });

  it('requireLogin อย่างเดียว ไม่เช็ค role', () => {
    expect(checkAccess(make('member'), {}, NOW)).toEqual({ ok: true });
  });
});
