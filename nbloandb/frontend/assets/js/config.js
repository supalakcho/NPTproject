// ค่าตั้งต้นของ frontend ทั้งหมดอยู่ที่นี่ที่เดียว
export const API_BASE_URL = 'http://localhost:3000/api/v1';

// true = ใช้ข้อมูลจำลอง (mock) ไม่ต่อ backend จริง
export const USE_MOCK = true;

export const POLL_INTERVAL_MS = 60_000; // M8 กระดิ่งแจ้งเตือน
export const COUNTDOWN_INTERVAL_MS = 30_000; // ตัวนับถอยหลังบนบัตรยืม
export const DUE_SOON_MINUTES = 60; // S1 ไม่ส่ง notifyBeforeDueMinutes มา จึงใช้ค่าคงที่นี้

export const SESSION_KEY = 'nl.session';
export const VERIFIED_KEY = 'nl.verifiedToken'; // sessionStorage: tab นี้เรียก GET /me แล้ว
export const FLASH_KEY = 'nl.flash'; // sessionStorage: ข้อความส่งไปหน้า login

export const MOCK_DB_KEY = 'nl.mockDb';
export const MOCK_CLOCK_KEY = 'nl.mockClock';
export const MOCK_DELAY_MS = [200, 400];

// root ของแอป คำนวณจากตำแหน่งไฟล์นี้ ทำให้วางใน htdocs โฟลเดอร์ใดก็ได้
export const APP_ROOT = new URL('../../', import.meta.url).href;

/** แปลง path ภายในแอป (เช่น 'member/home.html') เป็น URL เต็ม */
export function appUrl(path = '') {
  return new URL(path, APP_ROOT).href;
}

/** URL ของรูปที่ backend ส่งมา (เช่น /uploads/avatars/15.webp) ชี้ไปที่ host ของ API; data: และ http(s) ใช้ตามเดิม */
export function mediaUrl(path) {
  if (!path) return null;
  if (/^(data:|https?:)/.test(path)) return path;
  return new URL(path, API_BASE_URL).href;
}
