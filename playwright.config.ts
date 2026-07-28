import { defineConfig, devices } from '@playwright/test'

// Chromium only: clipboard read/write permissions are not grantable in
// Firefox or WebKit, and the whole point of this suite is real paste paths.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Tests normally finish in seconds. This budget exists for the pathological
  // case — a cold dev server compiling while the machine is busy elsewhere —
  // and must comfortably exceed the readiness gate in helpers.ts, or a slow
  // hydration blows the test timeout instead of simply waiting.
  timeout: 60_000,
  // Compiles every route once before the workers start; see the file for why.
  globalSetup: './tests/e2e/global-setup.ts',
  // Every worker loads pages from ONE Vite dev server, and the axe scans are
  // CPU-heavy in-page. At four workers the whole suite intermittently starved
  // that server — layout.spec passes 16/16 in 23s on its own, but failed in
  // roughly one full run in three. Two workers is slower and deterministic,
  // which is the right trade for a gate you are meant to trust.
  workers: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
