// รายงาน: อ่านอย่างเดียวจาก View v_notebook_status, v_loans, v_loan_monthly_summary
// รายงาน "โน๊ตบุ๊คทั้งหมด" ใช้ notebooks.list() ได้เลย
import { query } from './core/db.js';
import { toCamelRows } from './core/mapper.js';
import { buildWhere } from './core/sqlBuilder.js';
import * as notebooks from './notebooks.model.js';
import { listWhere as listLoansWhere } from './loans.model.js';

/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

/**
 * การ์ดสรุปบน Dashboard นับจากเครื่องที่ไม่ถูกลบ
 * @param {Options} [options]
 * @returns {Promise<{ total: number, available: number, borrowed: number, reserved: number,
 *   damaged: number, maintenance: number, retired: number }>}
 * @example
 * const summary = await reports.statusSummary();
 */
export async function statusSummary(options = {}) {
  const [row] = await query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(current_status = 'available'), 0) AS available,
            COALESCE(SUM(current_status = 'borrowed'), 0) AS borrowed,
            COALESCE(SUM(current_status = 'reserved'), 0) AS reserved,
            COALESCE(SUM(current_status = 'damaged'), 0) AS damaged,
            COALESCE(SUM(current_status = 'maintenance'), 0) AS maintenance,
            COALESCE(SUM(current_status = 'retired'), 0) AS retired
       FROM v_notebook_status`,
    [],
    options,
  );
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

/**
 * โน๊ตบุ๊คที่ยังไม่คืน (borrowing, overdue, return_pending) เกินกำหนดก่อน แล้วเรียงตามกำหนดคืน
 * @param {{ status?: 'borrowing'|'overdue'|'return_pending', page?: number, pageSize?: number }} [filter]
 * @param {Options} [options]
 * @returns {Promise<{ rows: import('./loans.model.js').Loan[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await reports.outstandingLoans({ status: 'overdue' });
 */
export async function outstandingLoans({ status, page, pageSize } = {}, options = {}) {
  return listLoansWhere(
    {
      conditions: [
        ["l.loan_status IN ('borrowing', 'overdue', 'return_pending')"],
        status !== undefined && ['l.loan_status = ?', status],
      ],
      orderBy: "ORDER BY l.loan_status = 'overdue' DESC, l.due_at ASC, l.id ASC",
      page,
      pageSize,
    },
    options,
  );
}

/**
 * โน๊ตบุ๊คที่ว่างตอนนี้ (สภาพปกติ ไม่ถูกยืม ไม่ถูกจองในขณะนั้น)
 * @param {{ brandId?: number, modelId?: number, page?: number, pageSize?: number }} [filter]
 * @param {Options} [options]
 * @returns {Promise<{ rows: import('./notebooks.model.js').Notebook[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await reports.availableNotebooks({ brandId: 1 });
 */
export async function availableNotebooks({ brandId, modelId, page, pageSize } = {}, options = {}) {
  return notebooks.list({ brandId, modelId, currentStatus: 'available', page, pageSize }, options);
}

/**
 * จำนวนการยืมต่อเดือน (ไม่นับที่ยกเลิก) คืนเฉพาะเดือนที่มีข้อมูล เดือนที่เป็น 0 ให้ service เติม
 * @param {{ fromMonth?: string, toMonth?: string }} [range] รูปแบบ 'YYYY-MM' รวมขอบ
 * @param {Options} [options]
 * @returns {Promise<Array<{ loanMonth: string, totalLoans: number, lateLoans: number }>>} เรียงตามเดือน
 * @example
 * const rows = await reports.monthlyLoans({ fromMonth: '2026-01', toMonth: '2026-12' });
 */
export async function monthlyLoans({ fromMonth, toMonth } = {}, options = {}) {
  const where = buildWhere([
    fromMonth !== undefined && ['loan_month >= ?', fromMonth],
    toMonth !== undefined && ['loan_month <= ?', toMonth],
  ]);
  const rows = await query(
    `SELECT loan_month, total_loans, late_loans FROM v_loan_monthly_summary ${where.sql} ORDER BY loan_month`,
    where.params,
    options,
  );
  return toCamelRows(rows, { totalLoans: 'number', lateLoans: 'number' });
}
