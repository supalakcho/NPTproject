import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession, getSession, hasPermission, homePathFor, isExpired, resolveNext, saveSession, setFlash, takeFlash,
} from '../../assets/js/core/auth.js';

const session = (expiresAt) => ({
  token: 't', expiresAt, user: { id: 1, roleCode: 'member' }, permissions: ['loan.create'],
});
const NOW = Date.parse('2026-10-08T10:00:00+07:00');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('session', () => {
  it('บันทึกและอ่านกลับได้ใน key nl.session', () => {
    saveSession(session('2026-10-08T18:00:00+07:00'));
    expect(JSON.parse(localStorage.getItem('nl.session')).token).toBe('t');
    expect(getSession().user.id).toBe(1);
    expect(hasPermission('loan.create')).toBe(true);
    expect(hasPermission('user.manage')).toBe(false);
  });

  it('ลบ session', () => {
    saveSession(session('2026-10-08T18:00:00+07:00'));
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('P-02 expiresAt ผ่านไปแล้ว -> หมดอายุ', () => {
    saveSession(session('2026-10-08T09:59:59+07:00'));
    expect(isExpired(NOW)).toBe(true);
  });

  it('expiresAt = ตอนนี้พอดี ถือว่าหมดอายุ, ก่อนหน้านั้นยังใช้ได้', () => {
    saveSession(session('2026-10-08T10:00:00+07:00'));
    expect(isExpired(NOW)).toBe(true);
    expect(isExpired(NOW - 1)).toBe(false);
  });

  it('ไม่มี session ถือว่าหมดอายุ', () => {
    expect(isExpired(NOW)).toBe(true);
  });

  it('JSON เสียไม่ทำให้พัง', () => {
    localStorage.setItem('nl.session', '{broken');
    expect(getSession()).toBeNull();
  });

  it('หน้าแรกตาม role', () => {
    expect(homePathFor('member')).toBe('member/home.html');
    expect(homePathFor('admin')).toBe('admin/returns.html');
  });

  it('flash ใช้ได้ครั้งเดียว', () => {
    setFlash('บัญชีถูกระงับ');
    expect(takeFlash()).toBe('บัญชีถูกระงับ');
    expect(takeFlash()).toBeNull();
  });
});

describe('resolveNext (P-04 กัน open redirect)', () => {
  const origin = 'http://localhost';
  const root = 'http://localhost/htdocs/nl/';

  it('path ภายในแอปใช้ได้ พร้อม query', () => {
    expect(resolveNext('/htdocs/nl/member/home.html?x=1', origin, root)).toBe('/htdocs/nl/member/home.html?x=1');
  });

  it.each([
    'https://evil.example',
    '//evil.example/htdocs/nl/x',
    'http://localhost.evil.example/htdocs/nl/x',
    '/\\evil.example',
    'javascript:alert(1)',
    '/other-app/page.html',
    '',
    null,
    undefined,
  ])('ปฏิเสธ %s', (next) => {
    expect(resolveNext(next, origin, root)).toBeNull();
  });

  it('URL เต็มที่ origin เดียวกันและอยู่ในแอปใช้ได้', () => {
    expect(resolveNext('http://localhost/htdocs/nl/profile.html', origin, root)).toBe('/htdocs/nl/profile.html');
  });
});
