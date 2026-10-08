// กฎช่วงเวลาจอง และการจองในอนาคตของเครื่อง ใช้ร่วมกันใน reservations, notebooks, loans service
import { reservations } from '../../models/index.js';
import { AppError } from './AppError.js';
import { now } from './clock.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * startAt อยู่ในอนาคต · endAt > startAt · ยาวไม่เกิน maxLoanHours · startAt ไม่เกิน reservationMaxDaysAhead วัน
 * @param {Date} startAt
 * @param {Date} endAt
 * @param {{ maxLoanHours: number, reservationMaxDaysAhead: number }} s
 */
export function assertReservationRange(startAt, endAt, { maxLoanHours, reservationMaxDaysAhead }) {
  const t = now().getTime();
  if (startAt.getTime() <= t) throw new AppError('INVALID_TIME_RANGE', { details: { reason: 'startAt ต้องอยู่ในอนาคต' } });
  if (endAt <= startAt) throw new AppError('INVALID_TIME_RANGE', { details: { reason: 'endAt ต้องหลัง startAt' } });
  if (endAt - startAt > maxLoanHours * HOUR) {
    throw new AppError('INVALID_TIME_RANGE', { details: { reason: `ยาวได้ไม่เกิน ${maxLoanHours} ชั่วโมง` } });
  }
  if (startAt.getTime() > t + reservationMaxDaysAhead * DAY) {
    throw new AppError('RESERVATION_TOO_FAR_AHEAD', { params: { n: reservationMaxDaysAhead } });
  }
}

/**
 * การจองที่ยังมีผล (รอใช้/ถึงเวลาใช้) ของเครื่องนี้ตั้งแต่ตอนนี้ไปถึงช่วงจองล่วงหน้าสูงสุด
 * @param {number} notebookId
 * @param {number} maxDaysAhead
 * @param {import('mysql2/promise').PoolConnection} [conn]
 * @returns {Promise<Array<{ id: number, startAt: Date, endAt: Date, userFullName: string }>>}
 */
export async function futureReservations(notebookId, maxDaysAhead, conn) {
  const from = now();
  const to = new Date(from.getTime() + (maxDaysAhead + 1) * DAY);
  const rows = await reservations.findOverlapping(notebookId, from, to, { conn });
  return rows.map(({ id, startAt, endAt, userFullName }) => ({ id, startAt, endAt, userFullName }));
}
