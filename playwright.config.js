import { defineConfig } from '@playwright/test';

const pythonCommand = process.platform === 'win32'
  ? '.venv\\Scripts\\python.exe run.py'
  : '.venv/bin/python run.py';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: pythonCommand,
    url: 'http://127.0.0.1:8765/api/health',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
