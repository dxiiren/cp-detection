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
  // Every worker loads pages from ONE Vite dev server, so the ceiling here is
  // that server's throughput, NOT the core count — this box has 32 cores and
  // the suite stops getting faster long before it runs out of them.
  //
  // Two workers dated from before globalSetup warmed the routes: back then the
  // lazy first-compile of a route was paid inside the tests, four workers all
  // piled onto it at once, and layout.spec failed roughly one run in three.
  // With warming moved out of the tests the ceiling is much higher. Measured
  // on this machine, whole suite, dev server restarted before each run:
  //
  //   workers=2 → 57s   workers=4 → 44s   workers=8 → 36s   workers=16 → 38s
  //
  // Eight is the knee; past it the single dev server saturates and wall-clock
  // gets worse, not better. Held at eight for four consecutive runs: 67/67
  // passed every time, zero flaky (35s / 40s / 35s / 34s).
  //
  // If you make the in-page work heavier (more axe scans, say), re-measure —
  // this number tracks the server, not the hardware.
  workers: 8,
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
