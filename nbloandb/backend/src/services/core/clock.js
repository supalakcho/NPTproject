// เวลาปัจจุบันของกฎธุรกิจทั้งหมดมาจากที่นี่ (test เลื่อนเวลาได้) ตัดมิลลิวินาทีทิ้งเพราะ DATETIME เก็บแค่วินาที
let fixedNow = null;

/** @returns {Date} */
export function now() {
  const d = fixedNow ? new Date(fixedNow) : new Date();
  d.setMilliseconds(0);
  return d;
}

/**
 * ใช้ใน test เท่านั้น ส่ง null เพื่อกลับไปใช้เวลาจริง
 * หมายเหตุ: สถานะใน View (loanStatus, reservation status) ยังใช้ NOW() ของ DB
 * @param {Date|null} date
 */
export function setNowForTest(date) {
  fixedNow = date ? new Date(date) : null;
}
