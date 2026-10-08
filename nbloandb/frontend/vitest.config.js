import { defineConfig } from 'vitest/config';

// T-01: ให้ process ทดสอบเป็น UTC เพื่อพิสูจน์ว่าการแสดงเวลาไม่ขึ้นกับ timezone เครื่อง
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/component/**/*.test.js'],
  },
});
