// ข้อมูลตั้งต้นของ mock (สร้างสัมพัทธ์กับเวลาปัจจุบันของ mockClock)
// เวลาเก็บเป็น ms ภายใน mock แล้วค่อยแปลงเป็น ISO +07:00 ตอนตอบ
import { bangkokAt } from '../utils/datetime.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

export const PASSWORD = 'Passw0rd';

export const ROLES = {
  admin: { id: 1, code: 'admin', name: 'ผู้ดูแลระบบ' },
  member: { id: 2, code: 'member', name: 'สมาชิก' },
};

export const PERMISSIONS = {
  member: ['notebook.view', 'loan.create', 'loan.extend', 'loan.return', 'reservation.create'],
  admin: [
    'notebook.view', 'catalog.manage', 'loan.view_all', 'loan.confirm_return', 'loan.cancel',
    'reservation.view_all', 'reservation.cancel_any', 'user.manage', 'report.view', 'setting.manage', 'audit.view',
  ],
};

export function createSeed(now) {
  const t = (offsetMs) => now + offsetMs;
  const day = (offset, hh, mm = 0) => bangkokAt(now, offset, hh, mm);
  const ago = (ms) => now - ms;

  const user = (id, role, email, firstName, lastName, extra = {}) => ({
    id, roleId: ROLES[role].id, roleCode: role, roleName: ROLES[role].name,
    memberCode: null, email, password: PASSWORD, firstName, lastName, phone: '0812345678',
    avatarUrl: null, isActive: true, lastLoginAt: null, createdAt: ago(30 * 24 * HOUR), updatedAt: ago(30 * 24 * HOUR),
    deletedAt: null, ...extra,
  });

  const users = [
    user(1, 'admin', 'admin@example.com', 'ผู้ดูแล', 'ระบบ', { phone: '0800000001' }),
    user(2, 'member', 'member@example.com', 'สมชาย', 'ใจดี', { memberCode: '6501234', phone: '0812345678' }),
    user(3, 'member', 'member2@example.com', 'สมหญิง', 'รักเรียน', { memberCode: '6501235', phone: '0823456789' }),
    user(4, 'member', 'suspended@example.com', 'สุรชัย', 'ถูกระงับ', { memberCode: '6501236', isActive: false }),
    // ใช้ทดสอบ X-01: ชื่อมี tag ต้องแสดงเป็นข้อความ ไม่ถูกรัน
    user(5, 'member', 'xss@example.com', '<script>alert("xss")</script>', 'ทดสอบ', { memberCode: '6501237' }),
    user(6, 'member', 'member3@example.com', 'ประภา', 'ตัวอย่าง', { memberCode: '6501238' }),
    user(7, 'member', 'member4@example.com', 'วิชัย', 'ใจเร็ว', { memberCode: '6501239' }),
  ];

  const brands = [
    { id: 1, name: 'Lenovo', createdAt: ago(60 * 24 * HOUR), updatedAt: ago(60 * 24 * HOUR), deletedAt: null },
    { id: 2, name: 'Dell', createdAt: ago(60 * 24 * HOUR), updatedAt: ago(60 * 24 * HOUR), deletedAt: null },
    { id: 3, name: 'HP', createdAt: ago(60 * 24 * HOUR), updatedAt: ago(60 * 24 * HOUR), deletedAt: null },
    { id: 4, name: 'ASUS', createdAt: ago(60 * 24 * HOUR), updatedAt: ago(60 * 24 * HOUR), deletedAt: null },
    { id: 5, name: 'Acer', createdAt: ago(60 * 24 * HOUR), updatedAt: ago(2 * 24 * HOUR), deletedAt: ago(2 * 24 * HOUR) },
  ];

  const model = (id, brandId, modelName, cpu, ramGb, storageGb, screenInch, os) => ({
    id, brandId, modelName, cpu, ramGb, storageGb, screenInch, os, imageUrl: null,
    createdAt: ago(50 * 24 * HOUR), updatedAt: ago(50 * 24 * HOUR), deletedAt: null,
  });
  const models = [
    model(1, 1, 'ThinkPad E14 Gen 5', 'Intel Core i5-1335U', 16, 512, 14.0, 'Windows 11 Pro'),
    model(2, 1, 'ThinkPad T14 Gen 4', 'Intel Core i7-1355U', 32, 1024, 14.0, 'Windows 11 Pro'),
    model(3, 2, 'Latitude 5440', 'Intel Core i5-1335U', 16, 512, 14.0, 'Windows 11 Pro'),
    model(4, 3, 'ProBook 440 G10', 'Intel Core i5-1335U', 8, 256, 14.0, 'Windows 11 Pro'),
    model(5, 4, 'VivoBook 15', 'AMD Ryzen 5 7530U', 16, 512, 15.6, 'Windows 11 Home'),
  ];

  const nb = (id, modelId, condition = 'normal', extra = {}) => ({
    id, modelId, assetCode: `NB-2025-${String(id).padStart(4, '0')}`, serialNumber: `SN${String(id).padStart(6, '0')}`,
    conditionStatus: condition, conditionNote: null, purchasedAt: '2025-06-15',
    createdAt: ago(40 * 24 * HOUR), updatedAt: ago(40 * 24 * HOUR), deletedAt: null, ...extra,
  });
  // ครอบคลุมทุก currentStatus: available, borrowed, reserved, damaged, maintenance, retired
  const notebooks = [
    nb(1, 1), // ว่าง
    nb(2, 2), // ว่าง แต่มีการจองพรุ่งนี้ 09:00-12:00 (ทับเวลาที่ผู้ใช้น่าจะเลือก)
    nb(3, 1), // ถูกยืม (สมหญิง กำลังยืม)
    nb(4, 3), // ถูกจอง (การจองของสมชาย ถึงเวลาแล้ว)
    nb(5, 4, 'damaged', { conditionNote: 'จอแตก' }),
    nb(6, 5, 'maintenance', { conditionNote: 'ส่งซ่อมแป้นพิมพ์' }),
    nb(7, 5, 'retired', { conditionNote: 'ปลดระวางตามอายุใช้งาน' }),
    nb(8, 1), // เกินกำหนด (วิชัย)
    nb(9, 2), // รอยืนยันรับคืน (ชื่อมี tag)
    nb(10, 3), // รอยืนยันรับคืน (คืนช้า)
    nb(11, 4), // รอยืนยันรับคืน (บัญชีถูกระงับ)
    nb(12, 3), // ว่าง
    nb(13, 4), // ว่าง
    nb(14, 5), // ว่าง
    nb(15, 1, 'normal', { deletedAt: ago(5 * 24 * HOUR) }), // ถูกลบแล้ว
  ];

  const loan = (id, userId, notebookId, borrowedAt, dueAt, extra = {}) => ({
    id, userId, notebookId, reservationId: null, borrowedAt, dueAt,
    returnRequestedAt: null, returnedAt: null, receivedBy: null, returnCondition: null, returnNote: null,
    cancelledAt: null, cancelReason: null, status: 'borrowing', ...extra,
  });
  const loans = [
    // กำลังยืม: เหลือ 3 ชม. (สมหญิง)
    loan(1, 3, 3, ago(1 * HOUR), t(3 * HOUR)),
    // เกินกำหนด 25 นาที (วิชัย)
    loan(2, 7, 8, ago(5 * HOUR), ago(25 * MIN)),
    // รอยืนยันรับคืน 3 รายการ (1 รายการคืนช้า)
    loan(3, 5, 9, ago(4 * HOUR), t(1 * HOUR), { status: 'return_pending', returnRequestedAt: ago(10 * MIN) }),
    loan(4, 6, 10, ago(8 * HOUR), ago(2 * HOUR), { status: 'return_pending', returnRequestedAt: ago(90 * MIN) }),
    loan(5, 4, 11, ago(3 * HOUR), t(2 * HOUR), { status: 'return_pending', returnRequestedAt: ago(20 * MIN) }),
    // ประวัติของสมชาย
    loan(6, 2, 1, ago(10 * 24 * HOUR), ago(10 * 24 * HOUR - 6 * HOUR), {
      status: 'returned', returnRequestedAt: ago(10 * 24 * HOUR - 5 * HOUR), returnedAt: ago(10 * 24 * HOUR - 5 * HOUR + 10 * MIN),
      receivedBy: 1, returnCondition: 'normal',
    }),
    loan(7, 2, 12, ago(6 * 24 * HOUR), ago(6 * 24 * HOUR - 4 * HOUR), {
      status: 'returned', returnRequestedAt: ago(6 * 24 * HOUR - 5 * HOUR), returnedAt: ago(6 * 24 * HOUR - 5 * HOUR + 15 * MIN),
      receivedBy: 1, returnCondition: 'normal', // คืนช้า 1 ชม.
    }),
    loan(8, 2, 13, ago(3 * 24 * HOUR), ago(3 * 24 * HOUR - 3 * HOUR), {
      status: 'cancelled', cancelledAt: ago(3 * 24 * HOUR - 1 * HOUR), cancelReason: 'บันทึกผิดเครื่อง',
    }),
  ];

  // ประวัติย้อนหลังหลายเดือน (ใช้กับรายงานรายเดือน P5) ของสมาชิกอื่นที่ไม่ใช่ member@example.com
  const old = (id, userId, notebookId, daysAgo, late) => {
    const borrowedAt = ago(daysAgo * 24 * HOUR);
    const dueAt = borrowedAt + 4 * HOUR;
    const requestedAt = late ? dueAt + 30 * MIN : dueAt - 20 * MIN;
    return loan(id, userId, notebookId, borrowedAt, dueAt, {
      status: 'returned', returnRequestedAt: requestedAt, returnedAt: requestedAt + 10 * MIN, receivedBy: 1, returnCondition: 'normal',
    });
  };
  loans.push(old(9, 3, 12, 33, false), old(10, 6, 13, 35, true), old(11, 7, 14, 40, false),
    old(12, 3, 12, 64, false), old(13, 6, 13, 70, true), old(14, 7, 14, 95, false));

  const reservation = (id, userId, notebookId, startAt, endAt, extra = {}) => ({
    id, userId, notebookId, startAt, endAt, pickupDeadline: startAt + 30 * MIN, status: 'upcoming',
    loanId: null, cancelledAt: null, cancelReason: null, createdAt: ago(1 * 24 * HOUR), ...extra,
  });
  const reservations = [
    // ถึงเวลาใช้แล้ว (รับเครื่องได้) ของสมชาย
    reservation(1, 2, 4, ago(5 * MIN), t(3 * HOUR)),
    // พรุ่งนี้ 09:00-12:00 ของสมหญิง บนเครื่อง 2
    reservation(2, 3, 2, day(1, 9), day(1, 12)),
    // ของสมชาย อีก 2 วัน 13:00-16:00 (ยกเลิกได้)
    reservation(3, 2, 12, day(2, 13), day(2, 16)),
    // ประวัติของสมชาย
    reservation(4, 2, 13, ago(4 * 24 * HOUR), ago(4 * 24 * HOUR - 3 * HOUR), {
      status: 'cancelled', cancelledAt: ago(5 * 24 * HOUR), cancelReason: 'เครื่องส่งซ่อม',
    }),
    reservation(5, 2, 1, ago(8 * 24 * HOUR), ago(8 * 24 * HOUR - 3 * HOUR), { status: 'expired' }),
    reservation(6, 2, 12, ago(6 * 24 * HOUR), ago(6 * 24 * HOUR - 4 * HOUR), { status: 'fulfilled', loanId: 7 }),
  ];
  loans[6].reservationId = 6;

  const notification = (id, userId, type, title, message, extra = {}) => ({
    id, userId, type, title, message, loanId: null, reservationId: null, isRead: false, createdAt: ago(id * 7 * MIN), ...extra,
  });
  const notifications = [
    notification(1, 2, 'loan_due_soon', 'ใกล้ครบกำหนดคืน', 'เครื่อง NB-2025-0001 ครบกำหนดคืนใน 30 นาที', { loanId: 6 }),
    notification(2, 2, 'loan_cancelled', 'รายการยืมถูกยกเลิก', 'ผู้ดูแลยกเลิกรายการยืมเครื่อง NB-2025-0013', { loanId: 8, isRead: true }),
    notification(3, 2, 'reservation_cancelled', 'การจองถูกยกเลิก', 'การจองเครื่อง NB-2025-0013 ถูกยกเลิก', { reservationId: 4, isRead: true }),
    notification(4, 3, 'loan_due_soon', 'ใกล้ครบกำหนดคืน', 'เครื่อง NB-2025-0003 ครบกำหนดคืนใน 3 ชั่วโมง', { loanId: 1 }),
  ];

  const settings = {
    maxLoanHours: 24,
    reservationMaxDaysAhead: 7,
    reservationGraceMinutes: 30,
    notifyBeforeDueMinutes: 30,
    maxActiveLoansPerUser: 1,
  };

  return {
    users, brands, models, notebooks, loans, reservations, notifications, settings,
    auditLogs: [
      {
        id: 3, userId: 1, action: 'UPDATE', targetTable: 'users', targetId: 4,
        oldValues: { isActive: true }, newValues: { event: 'suspend', isActive: false },
        ipAddress: '192.168.1.20', userAgent: 'Mozilla/5.0', createdAt: ago(1 * 24 * HOUR),
      },
      {
        id: 2, userId: 1, action: 'UPDATE', targetTable: 'notebooks', targetId: 5,
        oldValues: { conditionStatus: 'normal' }, newValues: { conditionStatus: 'damaged', conditionNote: 'จอแตก' },
        ipAddress: '192.168.1.20', userAgent: 'Mozilla/5.0', createdAt: ago(2 * 24 * HOUR),
      },
      {
        id: 1, userId: 1, action: 'CREATE', targetTable: 'brands', targetId: 3,
        oldValues: null, newValues: { name: 'HP' },
        ipAddress: '192.168.1.21', userAgent: 'Mozilla/5.0', createdAt: ago(3 * 24 * HOUR),
      },
    ],
    seq: { users: 8, brands: 6, models: 6, notebooks: 16, loans: 15, reservations: 7, notifications: 5, auditLogs: 4 },
  };
}
