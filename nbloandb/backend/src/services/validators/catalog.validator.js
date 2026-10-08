// schema ของยี่ห้อ รุ่น และเครื่อง
import { required, optional, str, int, num, upper, oneOf, bool, dateOnly, sortOf, id, PAGING } from './rules.js';

export const CONDITION_STATUSES = ['normal', 'damaged', 'maintenance', 'retired'];
export const CURRENT_STATUSES = ['available', 'borrowed', 'reserved', 'damaged', 'maintenance', 'retired'];

export const BRAND = { name: [required, str({ max: 100 })] };
export const BRAND_LIST = {
  keyword: [optional, str({ max: 100 })],
  sort: [optional, sortOf(['name', 'createdAt'])],
  includeDeleted: [optional, bool],
  ...PAGING,
};

const MODEL_FIELDS = {
  brandId: [required, id],
  modelName: [required, str({ max: 100 })],
  cpu: [required, str({ max: 100 })],
  ramGb: [required, int({ min: 1, max: 256 })],
  storageGb: [required, int({ min: 32, max: 8192 })], // ตาม CHECK ใน DB
  screenInch: [required, num({ min: 10, max: 18 })],
  os: [required, str({ max: 100 })],
  imagePath: [optional, str({ max: 255 })],
};
export const MODEL_CREATE = MODEL_FIELDS;
export const MODEL_UPDATE = Object.fromEntries(
  Object.entries(MODEL_FIELDS).map(([k, rules]) => [k, rules[0] === optional ? rules : [optional, ...rules.slice(1)]]),
);
export const MODEL_LIST = {
  brandId: [optional, id],
  keyword: [optional, str({ max: 100 })],
  sort: [optional, sortOf(['modelName', 'brandName', 'ramGb', 'createdAt'])],
  includeDeleted: [optional, bool],
  ...PAGING,
};

const NOTEBOOK_FIELDS = {
  modelId: [required, id],
  assetCode: [required, str({ max: 50 }), upper],
  serialNumber: [required, str({ max: 100 })],
  conditionStatus: [optional, oneOf(CONDITION_STATUSES)],
  conditionNote: [optional, str({ max: 255 })],
  purchasedAt: [optional, dateOnly],
};
export const NOTEBOOK_CREATE = NOTEBOOK_FIELDS;
export const NOTEBOOK_UPDATE = Object.fromEntries(
  Object.entries(NOTEBOOK_FIELDS).map(([k, rules]) => [k, rules[0] === optional ? rules : [optional, ...rules.slice(1)]]),
);
export const NOTEBOOK_LIST = {
  keyword: [optional, str({ max: 100 })],
  brandId: [optional, id],
  modelId: [optional, id],
  currentStatus: [optional, oneOf(CURRENT_STATUSES)],
  sort: [optional, sortOf(['assetCode', 'brandName', 'modelName', 'purchasedAt', 'createdAt'])],
  ...PAGING,
};
export const NOTEBOOK_LIST_ADMIN = {
  ...NOTEBOOK_LIST,
  conditionStatus: [optional, oneOf(CONDITION_STATUSES)],
  includeDeleted: [optional, bool],
};
