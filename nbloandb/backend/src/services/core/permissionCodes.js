// รหัส permission ตาม seed ใน notebook_loan.sql (แก้ชื่อที่นี่ที่เดียวถ้า seed เปลี่ยน)
// งานของตัวเอง (โปรไฟล์ ประวัติ แจ้งเตือน) ผู้ที่ login แล้วทำได้โดยไม่ตรวจ permission ตาม business-logic-plan ข้อ 3.3

export const PERM = Object.freeze({
  NOTEBOOK_VIEW: 'notebook.view',
  NOTEBOOK_CREATE: 'notebook.create',
  NOTEBOOK_UPDATE: 'notebook.update',
  NOTEBOOK_DELETE: 'notebook.delete',
  BRAND_MANAGE: 'brand.manage',
  MODEL_MANAGE: 'model.manage',
  LOAN_CREATE: 'loan.create',
  LOAN_VIEW_ALL: 'loan.view_all',
  LOAN_RETURN_REQUEST: 'loan.return_request',
  LOAN_EXTEND: 'loan.extend',
  LOAN_RECEIVE: 'loan.receive',
  LOAN_CANCEL: 'loan.cancel',
  RESERVATION_CREATE: 'reservation.create',
  RESERVATION_VIEW_ALL: 'reservation.view_all',
  RESERVATION_CANCEL_OWN: 'reservation.cancel_own',
  RESERVATION_CANCEL_ANY: 'reservation.cancel_any',
  USER_VIEW_ALL: 'user.view_all',
  USER_UPDATE_ANY: 'user.update_any',
  REPORT_VIEW: 'report.view',
  SETTING_MANAGE: 'setting.manage',
  AUDIT_VIEW: 'audit.view',
});
