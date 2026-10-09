import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:5173/',
    timezoneId: 'UTC',
    // E2E ทำงานกับ mock API
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'nl.useMock', value: '1' }] }] },
  },
  webServer: { command: 'node tests/serve.mjs', url: 'http://localhost:5173/login.html', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 700 } } },
  ],
});
