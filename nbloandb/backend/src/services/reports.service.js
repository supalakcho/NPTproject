// รายงานสำหรับแอดมิน
import { reports, notebooks } from '../models/index.js';
import { requirePermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { notebookDto, loanDto } from './core/dto.js';
import { validate, invalid, paging, compact } from './validators/rules.js';
import { NOTEBOOK_LIST_ADMIN } from './validators/catalog.validator.js';
import { MONTH_RANGE, OUTSTANDING, AVAILABLE } from './validators/admin.validator.js';

const MAX_MONTH_GAP = 24;
const toInternal = (result) => ({ ...result, rows: result.rows.map((nb) => notebookDto(nb, { internal: true })) });

/** การ์ดสรุปบน Dashboard */
export async function summary(ctx) {
  await requirePermission(ctx, PERM.REPORT_VIEW);
  return reports.statusSummary();
}

/** โน๊ตบุ๊คทั้งหมดพร้อมสถานะ (filter เหมือน N1 แบบแอดมิน) */
export async function allNotebooks(ctx, filter = {}) {
  await requirePermission(ctx, PERM.REPORT_VIEW);
  const { includeDeleted, ...rest } = paging(validate(filter, NOTEBOOK_LIST_ADMIN));
  return toInternal(await notebooks.list(compact(rest), { includeDeleted: Boolean(includeDeleted) }));
}

/** ยังไม่คืน เกินกำหนดก่อน */
export async function outstandingLoans(ctx, filter = {}) {
  await requirePermission(ctx, PERM.REPORT_VIEW);
  const result = await reports.outstandingLoans(compact(paging(validate(filter, OUTSTANDING))));
  return { ...result, rows: result.rows.map((l) => loanDto(l)) };
}

export async function availableNotebooks(ctx, filter = {}) {
  await requirePermission(ctx, PERM.REPORT_VIEW);
  return toInternal(await reports.availableNotebooks(compact(paging(validate(filter, AVAILABLE)))));
}

const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const monthOf = (index) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/**
 * ทุกเดือนในช่วงมีข้อมูล เดือนที่ไม่มีการยืมเป็น 0 (ไม่นับรายการที่ยกเลิก)
 * @returns {Promise<Array<{ loanMonth: string, totalLoans: number, lateLoans: number }>>}
 */
export async function monthlyLoans(ctx, input) {
  await requirePermission(ctx, PERM.REPORT_VIEW);
  const { fromMonth, toMonth } = validate(input, MONTH_RANGE);
  const from = monthIndex(fromMonth);
  const to = monthIndex(toMonth);
  if (from > to) throw invalid('fromMonth', 'fromMonth ต้องไม่หลัง toMonth');
  if (to - from > MAX_MONTH_GAP) throw invalid('toMonth', `ช่วงห่างได้ไม่เกิน ${MAX_MONTH_GAP} เดือน`);
  const byMonth = new Map((await reports.monthlyLoans({ fromMonth, toMonth })).map((r) => [r.loanMonth, r]));
  const out = [];
  for (let i = from; i <= to; i += 1) {
    const loanMonth = monthOf(i);
    out.push(byMonth.get(loanMonth) ?? { loanMonth, totalLoans: 0, lateLoans: 0 });
  }
  return out;
}
