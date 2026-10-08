// schema ของการยืมและการจอง
import { required, optional, str, upper, oneOf, bool, dateTime, sortOf, id, PAGING } from './rules.js';

export const LOAN_STATUSES = ['borrowing', 'overdue', 'return_pending', 'returned', 'cancelled'];
export const RESERVATION_STATUSES = ['upcoming', 'active', 'fulfilled', 'expired', 'cancelled'];

export const BORROW = {
  notebookId: [optional, id],
  assetCode: [optional, str({ max: 50 }), upper],
  dueAt: [required, dateTime],
};
export const EXTEND = { newDueAt: [required, dateTime] };
export const CONFIRM_RETURN = {
  returnCondition: [required, oneOf(['normal', 'damaged'])],
  returnNote: [optional, str({ max: 255 })], // column return_note VARCHAR(255)
  returnRequestedAt: [optional, dateTime],
};
export const CANCEL_LOAN = { reason: [required, str({ max: 255 })] };

export const LOAN_LIST_MINE = {
  status: [optional, oneOf(LOAN_STATUSES)],
  sort: [optional, sortOf(['borrowedAt', 'dueAt'])],
  ...PAGING,
};
export const LOAN_LIST_ALL = {
  ...LOAN_LIST_MINE,
  userId: [optional, id],
  notebookId: [optional, id],
  isLate: [optional, bool],
  from: [optional, dateTime],
  to: [optional, dateTime],
};

export const RESERVATION_CREATE = {
  notebookId: [required, id],
  startAt: [required, dateTime],
  endAt: [required, dateTime],
};
export const TIME_RANGE = {
  startAt: [required, dateTime],
  endAt: [required, dateTime],
  modelId: [optional, id],
};
export const CANCEL_RESERVATION = { reason: [optional, str({ max: 255 })] };
export const RESERVATION_LIST_MINE = {
  status: [optional, oneOf(RESERVATION_STATUSES)],
  sort: [optional, sortOf(['startAt', 'createdAt'])],
  ...PAGING,
};
export const RESERVATION_LIST_ALL = {
  ...RESERVATION_LIST_MINE,
  userId: [optional, id],
  notebookId: [optional, id],
  from: [optional, dateTime],
  to: [optional, dateTime],
};
