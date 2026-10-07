import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/terrasim/',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing', '--num-raster-threads=1', '--renderer-process-limit=1', '--disable-threaded-animation', '--disable-threaded-scrolling'] },
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/terrasim/',
    url: 'http://127.0.0.1:4173/terrasim/',
    reuseExistingServer: false,
  },
});
