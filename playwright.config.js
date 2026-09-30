import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium', headless: true,
    launchOptions: { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] },
    viewport: { width: 1440, height: 960 }, screenshot: 'only-on-failure',
  },
});
