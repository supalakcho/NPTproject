import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { barcodeInput } from '../../assets/js/components/barcodeInput.js';
import { confirmDialog } from '../../assets/js/components/confirmDialog.js';
import { dataTable } from '../../assets/js/components/dataTable.js';
import { dateTimeRange } from '../../assets/js/components/dateTimeRange.js';
import { createField, readForm, showErrors } from '../../assets/js/components/fieldError.js';
import { openModal } from '../../assets/js/components/modal.js';
import { pagination } from '../../assets/js/components/pagination.js';
import { lateBadge, statusBadge } from '../../assets/js/components/statusBadge.js';
import { showToast } from '../../assets/js/components/toast.js';
import { h, runExclusive } from '../../assets/js/core/dom.js';
import { buildNavItems, startPolling } from '../../assets/js/core/layout.js';

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('statusBadge', () => {
  it('มีข้อความกำกับเสมอ ไม่ใช้สีอย่างเดียว', () => {
    const el = statusBadge('notebook', 'borrowed');
    expect(el.textContent).toBe('ถูกยืม');
    expect(el.className).toContain('badge-busy');
    expect(statusBadge('loan', 'return_pending').textContent).toBe('รอยืนยันรับคืน');
    expect(lateBadge().textContent).toBe('คืนช้า');
  });
});

describe('dom.h / X-01', () => {
  it('ข้อความเป็น text node ไม่ถูกตีความเป็น HTML', () => {
    const el = h('p', null, '<script>window.__pwned = true</script>');
    document.body.append(el);
    expect(el.textContent).toBe('<script>window.__pwned = true</script>');
    expect(el.querySelector('script')).toBeNull();
    expect(window.__pwned).toBeUndefined();
  });

  it('props: event, dataset, boolean, ข้าม null/false', () => {
    const fn = vi.fn();
    const el = h('button', { onClick: fn, dataset: { a: '1' }, disabled: true, hidden: false, title: null }, 'x');
    expect(h('button', { onClick: fn }, 'y').click()).toBeUndefined();
    expect(fn).toHaveBeenCalledOnce();
    expect(el.dataset.a).toBe('1');
    expect(el.disabled).toBe(true);
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
  });
});

describe('dataTable', () => {
  it('X-01 ชื่อผู้ใช้ที่มี <script> แสดงเป็นข้อความ ไม่ถูกรัน', () => {
    const name = '<script>window.__xss = 1</script>';
    const el = dataTable({ columns: [{ key: 'name', header: 'ชื่อ' }], rows: [{ name }] });
    document.body.append(el);
    expect(el.querySelector('td').textContent).toBe(name);
    expect(el.querySelector('script')).toBeNull();
    expect(window.__xss).toBeUndefined();
  });

  it('render ที่คืน Node ใช้ได้ และมี empty state', () => {
    const el = dataTable({ columns: [{ key: 'a', header: 'A', render: (r) => statusBadge('loan', r.a) }], rows: [{ a: 'overdue' }] });
    expect(el.querySelector('td .badge').textContent).toBe('เกินกำหนด');
    expect(dataTable({ columns: [], rows: [], empty: 'ยังไม่มีรายการ' }).textContent).toBe('ยังไม่มีรายการ');
  });

  it('ตารางอยู่ในกรอบที่เลื่อนแนวนอนได้เอง', () => {
    const el = dataTable({ columns: [{ key: 'a', header: 'A' }], rows: [{ a: 1 }] });
    expect(el.className).toContain('table-scroll');
  });
});

describe('modal (X-02)', () => {
  it('โฟกัสเข้า modal, กด Esc ปิด และคืนโฟกัสให้ปุ่มเดิม', () => {
    const opener = h('button', null, 'เปิด');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const m = openModal({ title: 'ทดสอบ', content: h('input', { 'aria-label': 'ช่อง' }), onClose });
    expect(m.el.contains(document.activeElement)).toBe(true);
    expect(m.el.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.contains(m.el)).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Tab วนอยู่ภายใน modal ทั้งไปหน้าและย้อนกลับ', () => {
    const outside = h('button', null, 'ข้างนอก');
    document.body.append(outside);
    const m = openModal({
      title: 'ทดสอบ', content: h('input', { 'aria-label': 'ช่อง' }),
      actions: [{ label: 'ยกเลิก', onClick: () => {} }, { label: 'ตกลง', onClick: () => {} }],
    });
    const [input, cancel, ok] = m.el.querySelectorAll('input, button');

    ok.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    input.focus();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(document.activeElement).toBe(ok);
    expect(cancel).toBeTruthy();
    m.close();
  });

  it('ปุ่มใน modal เรียก onClick พร้อม api', () => {
    const onClick = vi.fn();
    const m = openModal({ title: 't', content: 'c', actions: [{ label: 'ตกลง', onClick }] });
    m.buttons[0].click();
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ close: expect.any(Function) }));
    m.close();
  });
});

describe('confirmDialog', () => {
  it('ยืนยัน -> true, ยกเลิก -> false', async () => {
    const p = confirmDialog({ title: 'คืนเครื่อง', message: 'ยืนยัน?', confirmLabel: 'คืนเครื่อง' });
    document.querySelectorAll('.modal-actions button')[1].click();
    expect(await p).toBe(true);

    const q = confirmDialog({ title: 'คืนเครื่อง', confirmLabel: 'คืนเครื่อง' });
    document.querySelectorAll('.modal-actions button')[0].click();
    expect(await q).toBe(false);
  });

  it('Esc นับเป็นยกเลิก', async () => {
    const p = confirmDialog({ title: 'x', confirmLabel: 'ตกลง' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBe(false);
  });

  it('A-06 บังคับเหตุผล: ปุ่มยืนยันกดไม่ได้จนกว่าจะกรอก', async () => {
    const p = confirmDialog({ title: 'ยกเลิกรายการ', confirmLabel: 'ยกเลิกรายการ', danger: true, reason: { label: 'เหตุผล', required: true } });
    const confirmBtn = document.querySelectorAll('.modal-actions button')[1];
    const input = document.querySelector('textarea');
    expect(confirmBtn.disabled).toBe(true);
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    expect(confirmBtn.disabled).toBe(true);
    input.value = 'บันทึกผิดเครื่อง';
    input.dispatchEvent(new Event('input'));
    expect(confirmBtn.disabled).toBe(false);
    confirmBtn.click();
    expect(await p).toBe('บันทึกผิดเครื่อง');
  });

  it('ยกเลิกตอนมีช่องเหตุผล -> null', async () => {
    const p = confirmDialog({ title: 'x', confirmLabel: 'ตกลง', reason: { label: 'เหตุผล', required: true } });
    document.querySelectorAll('.modal-actions button')[0].click();
    expect(await p).toBeNull();
  });
});

describe('barcodeInput (A-01)', () => {
  it('Enter ส่งรหัสไป onScan แล้วล้างช่อง', () => {
    const onScan = vi.fn();
    const b = barcodeInput({ onScan });
    document.body.append(b.el);
    b.input.value = '  NB-2025-0007 ';
    b.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onScan).toHaveBeenCalledWith('NB-2025-0007');
    expect(b.input.value).toBe('');
  });

  it('ช่องว่างไม่เรียก onScan, ปุ่มค้นหาใช้ได้', () => {
    const onScan = vi.fn();
    const b = barcodeInput({ onScan });
    b.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onScan).not.toHaveBeenCalled();
    b.input.value = 'NB-1';
    b.el.querySelector('button').click();
    expect(onScan).toHaveBeenCalledWith('NB-1');
  });

  it('ไม่ส่งซ้ำเมื่อกด Enter สองครั้ง (ช่องถูกล้างแล้ว)', () => {
    const onScan = vi.fn();
    const b = barcodeInput({ onScan });
    b.input.value = 'NB-1';
    const press = () => b.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    press();
    press();
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});

describe('runExclusive (B-06)', () => {
  it('กดซ้ำเร็วๆ ส่ง request ครั้งเดียว และปิดปุ่มระหว่างทำงาน', async () => {
    const button = h('button', null, 'ยืนยันยืม');
    document.body.append(button);
    let resolve;
    const fn = vi.fn(() => new Promise((r) => { resolve = r; }));

    const first = runExclusive(button, fn, 'กำลังยืม...');
    runExclusive(button, fn);
    runExclusive(button, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('กำลังยืม...');

    resolve('ok');
    await first;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('ยืนยันยืม');
  });

  it('เปิดปุ่มคืนเมื่อ fn โยน error', async () => {
    const button = h('button', null, 'ตกลง');
    await expect(runExclusive(button, async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(button.disabled).toBe(false);
  });
});

describe('fieldError / form', () => {
  it('showErrors วาง error ใต้ช่อง ตั้ง aria-invalid และโฟกัสช่องแรกที่ผิด', () => {
    const form = h('form', null, createField({ name: 'email', label: 'อีเมล' }), createField({ name: 'phone', label: 'เบอร์' }));
    document.body.append(form);
    const first = showErrors(form, { phone: 'เบอร์ผิด', email: 'อีเมลผิด' });
    expect(form.querySelector('#f-phone-err').textContent).toBe('เบอร์ผิด');
    expect(form.querySelector('[name="phone"]').getAttribute('aria-invalid')).toBe('true');
    expect(form.querySelector('[name="email"]').getAttribute('aria-describedby')).toContain('f-email-err');
    expect(document.activeElement).toBe(first);
    expect(first.name).toBe('phone'); // ตามลำดับที่ส่ง error มา
  });

  it('error ที่ไม่มีช่อง แสดงรวมด้านบนฟอร์ม', () => {
    const form = h('form', null, createField({ name: 'email', label: 'อีเมล' }));
    showErrors(form, { form: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    expect(form.querySelector('.form-error').textContent).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('readForm อ่านค่าจากฟอร์ม', () => {
    const form = h('form', null, createField({ name: 'email', label: 'อีเมล', value: 'a@b.co' }));
    expect(readForm(form)).toEqual({ email: 'a@b.co' });
  });
});

describe('dateTimeRange (T-01)', () => {
  it('อ่านค่าเป็น ISO +07:00 เสมอ ไม่ขึ้นกับ timezone เครื่อง', () => {
    const r = dateTimeRange();
    document.body.append(r.el);
    r.el.querySelector('[name="startAt"]').value = '2026-10-09T09:00';
    r.el.querySelector('[name="endAt"]').value = '2026-10-09T12:00';
    expect(r.getValue()).toEqual({ startAt: '2026-10-09T09:00:00+07:00', endAt: '2026-10-09T12:00:00+07:00' });
  });

  it('ยังไม่เลือก -> null และ setValue ใส่ค่าเป็นเวลาไทย', () => {
    const r = dateTimeRange({ min: '2026-10-08T10:00:00+07:00' });
    expect(r.getValue()).toEqual({ startAt: null, endAt: null });
    expect(r.el.querySelector('[name="startAt"]').getAttribute('min')).toBe('2026-10-08T10:00');
    r.setValue({ endAt: '2026-10-09T08:00:00Z' });
    expect(r.el.querySelector('[name="endAt"]').value).toBe('2026-10-09T15:00');
  });
});

describe('toast / pagination', () => {
  it('toast แสดงข้อความและปุ่ม action', () => {
    const onClick = vi.fn();
    const t = showToast('ผิดพลาด', { type: 'error', extra: 'ยืมได้ถึง 9 ต.ค.', action: { label: 'ลองใหม่', onClick } });
    expect(t.textContent).toContain('ผิดพลาด');
    expect(t.textContent).toContain('ยืมได้ถึง 9 ต.ค.');
    t.querySelector('button').click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(document.body.contains(t)).toBe(false);
    expect(document.getElementById('toast-region').getAttribute('aria-live')).toBe('polite');
  });

  it('pagination ปิดปุ่มที่ขอบและเรียก onChange', () => {
    const onChange = vi.fn();
    const el = pagination({ meta: { page: 1, totalPages: 3, total: 57 }, onChange });
    const [prev, next] = el.querySelectorAll('button');
    expect(prev.disabled).toBe(true);
    next.click();
    expect(onChange).toHaveBeenCalledWith(2);
    expect(el.textContent).toContain('หน้า 1 จาก 3');
  });
});

describe('layout', () => {
  it('สมาชิกมี 4 เมนู', () => {
    expect(buildNavItems('member').map((i) => i.label)).toEqual(['หน้าแรก', 'ค้นหา', 'ประวัติ', 'โปรไฟล์']);
  });

  it('แอดมินซ่อนเมนูตาม permission (เช่น รายงาน)', () => {
    const all = ['loan.confirm_return', 'catalog.manage', 'report.view'];
    expect(buildNavItems('admin', all).map((i) => i.key)).toContain('reports');
    expect(buildNavItems('admin', ['loan.confirm_return']).map((i) => i.key)).toEqual(['returns', 'profile']);
  });

  it('N-01 polling: เรียกทันที, ทุกช่วง, หยุดเมื่อ tab ถูกซ่อน และเรียกใหม่เมื่อกลับมา', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

    const stop = startPolling(fn, 60_000, document);
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(2);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(180_000);
    expect(fn).toHaveBeenCalledTimes(2);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(4);

    stop();
    vi.advanceTimersByTime(120_000);
    expect(fn).toHaveBeenCalledTimes(4);
    delete document.hidden;
  });
});
