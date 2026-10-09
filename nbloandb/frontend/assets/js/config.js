// ค่าตั้งต้นของ frontend ทั้งหมดอยู่ที่นี่ที่เดียว
// เปิดผ่าน `npm run serve` (พอร์ต 5173) จะใช้ path แบบ relative แล้วให้ dev server ส่งต่อไป backend (ไม่ต้องใช้ CORS)
// เปิดจาก XAMPP/ที่อื่น จะเรียก backend ตรงๆ ซึ่งต้องเปิด CORS ที่ backend
const DEV_PROXY = globalThis.location?.port === '5173';
export const API_BASE_URL = DEV_PROXY ? '/api/v1' : 'http://localhost:3000/api/v1';

/**
 * โหมดข้อมูลจำลอง (mock) ไม่ต่อ backend จริง — ค่าเริ่มต้นคือ "ต่อ backend จริง"
 * เปิด mock: เติม ?mock=1 ที่ URL หน้าใดก็ได้ (จำค่าไว้ในเบราว์เซอร์) ปิด: ?mock=0
 */
function detectMock() {
  try {
    const flag = new URLSearchParams(globalThis.location?.search ?? '').get('mock');
    if (flag === '1') localStorage.setItem('nl.useMock', '1');
    if (flag === '0') localStorage.removeItem('nl.useMock');
    return localStorage.getItem('nl.useMock') === '1';
  } catch {
    return false;
  }
}
export const USE_MOCK = detectMock();

export const POLL_INTERVAL_MS = 60_000; // M8 กระดิ่งแจ้งเตือน
export const COUNTDOWN_INTERVAL_MS = 30_000; // ตัวนับถอยหลังบนบัตรยืม
export const DUE_SOON_MINUTES = 60; // S1 ไม่ส่ง reminderBeforeMinutes มา จึงใช้ค่าคงที่นี้

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
  return API_BASE_URL.startsWith('/') ? path : new URL(path, API_BASE_URL).href; // /uploads ผ่าน dev proxy ได้เหมือนกัน
}
