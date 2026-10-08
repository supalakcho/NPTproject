// schema ของงานแอดมิน: สมาชิก ค่าตั้งค่า audit log รายงาน
import { required, optional, str, email, int, bool, oneOf, dateTime, month, sortOf, id, NAME, PHONE, PAGING } from './rules.js';

export const USER_LIST = {
  keyword: [optional, str({ max: 100 })],
  roleId: [optional, id],
  isActive: [optional, bool],
  includeDeleted: [optional, bool],
  sort: [optional, sortOf(['createdAt', 'firstName', 'email', 'lastLoginAt'])],
  ...PAGING,
};

export const USER_UPDATE = {
  roleId: [optional, id],
  memberCode: [optional, str({ max: 30 })],
  email: [optional, str({ max: 255 }), email],
  firstName: [optional, ...NAME],
  lastName: [optional, ...NAME],
  phone: [optional, ...PHONE],
};

// key camelCase ตาม settings ใน SQL → ช่วงที่ยอมรับ
export const SETTING_RANGES = {
  maxLoanHours: [1, 24],
  reservationMaxDaysAhead: [1, 30],
  reservationGraceMinutes: [5, 120],
  reminderBeforeMinutes: [5, 240],
  maxActiveLoansPerUser: [1, 5],
};
export const SETTING_SCHEMA = Object.fromEntries(
  Object.entries(SETTING_RANGES).map(([key, [min, max]]) => [key, [optional, int({ min, max })]]),
);

export const AUDIT_ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'REGISTER', 'CREATE', 'UPDATE', 'DELETE', 'PERMISSION_DENIED'];
export const AUDIT_LIST = {
  userId: [optional, id],
  action: [optional, oneOf(AUDIT_ACTIONS)],
  targetTable: [optional, str({ max: 50 })],
  targetId: [optional, id],
  from: [optional, dateTime],
  to: [optional, dateTime],
  ...PAGING,
};

export const MONTH_RANGE = { fromMonth: [required, month], toMonth: [required, month] };
export const OUTSTANDING = { status: [optional, oneOf(['borrowing', 'overdue', 'return_pending'])], ...PAGING };
export const AVAILABLE = { brandId: [optional, id], modelId: [optional, id], ...PAGING };
