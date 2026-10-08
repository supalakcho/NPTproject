// แปลง object จาก model เป็น object ที่ส่งออก API (ตาม http-api-spec ข้อ 3) วันเวลาเป็น Date ให้ HTTP layer แปลงเป็น ISO +07:00

const fileUrl = (p) => (p ? `/${String(p).replace(/\\/g, '/').replace(/^\/+/, '')}` : null);
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

const USER_FIELDS = ['id', 'roleCode', 'roleName', 'memberCode', 'email', 'firstName', 'lastName', 'phone', 'isActive', 'lastLoginAt', 'createdAt'];
const USER_ADMIN_FIELDS = ['roleId', 'updatedAt', 'deletedAt'];

/** @param {object} user @param {{ admin?: boolean }} [opts] */
export function userDto(user, { admin = false } = {}) {
  const out = { ...pick(user, USER_FIELDS), avatarUrl: fileUrl(user.avatarPath) };
  return admin ? { ...out, ...pick(user, USER_ADMIN_FIELDS) } : out;
}

const NOTEBOOK_FIELDS = ['id', 'assetCode', 'currentStatus', 'brandName', 'modelName', 'cpu', 'ramGb', 'storageGb', 'screenInch', 'os'];
const NOTEBOOK_ADMIN_FIELDS = ['modelId', 'brandId', 'serialNumber', 'conditionStatus', 'conditionNote', 'purchasedAt', 'createdAt', 'updatedAt', 'deletedAt'];

/** @param {object} nb @param {{ internal?: boolean }} [opts] internal = แอดมินเห็น serial และสภาพเครื่อง */
export function notebookDto(nb, { internal = false } = {}) {
  const out = { ...pick(nb, NOTEBOOK_FIELDS), imageUrl: fileUrl(nb.imagePath) };
  return internal ? { ...out, ...pick(nb, NOTEBOOK_ADMIN_FIELDS) } : out;
}

/** @param {object} m */
export function modelDto(m) {
  return {
    ...pick(m, ['id', 'brandId', 'brandName', 'modelName', 'cpu', 'ramGb', 'storageGb', 'screenInch', 'os', 'createdAt', 'updatedAt', 'deletedAt']),
    imageUrl: fileUrl(m.imagePath),
  };
}

/** @param {object} b */
export const brandDto = (b) => pick(b, ['id', 'name', 'createdAt', 'updatedAt', 'deletedAt']);

const LOAN_FIELDS = [
  'id', 'userId', 'userFullName', 'notebookId', 'assetCode', 'modelName', 'reservationId', 'borrowedAt', 'dueAt',
  'returnRequestedAt', 'returnedAt', 'receivedBy', 'returnCondition', 'returnNote', 'cancelledAt', 'cancelReason',
  'loanStatus', 'isLate',
];

/** @param {object} loan @param {object} [actions] { canExtend, maxExtendDueAt, canRequestReturn } */
export function loanDto(loan, actions) {
  const out = pick(loan, LOAN_FIELDS);
  return actions ? { ...out, actions } : out;
}

const RESERVATION_FIELDS = [
  'id', 'userId', 'userFullName', 'notebookId', 'assetCode', 'modelName', 'startAt', 'endAt', 'status', 'loanId',
  'cancelledAt', 'cancelReason', 'createdAt',
];

/** @param {object} r @param {number} graceMinutes */
export function reservationDto(r, graceMinutes) {
  return { ...pick(r, RESERVATION_FIELDS), pickupDeadline: new Date(r.startAt.getTime() + graceMinutes * 60_000) };
}
