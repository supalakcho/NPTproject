// เวลาปัจจุบันของแอป: โหมด mock ใช้ mockClock เพื่อให้หน้าจอกับ mock API เห็นเวลาเดียวกัน
import { USE_MOCK } from '../config.js';
import * as mockClock from '../mock/mockClock.js';

export function nowMs() {
  return USE_MOCK ? mockClock.now() : Date.now();
}

export function nowDate() {
  return new Date(nowMs());
}
