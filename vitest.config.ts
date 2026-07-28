import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))
const alias = { '#': src, '@': src }

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: no DOM, no framework. The attribution state machine and
        // the redaction rules live here and must stay testable in isolation.
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // `*.dom.test.ts` also ends in `.test.ts`; without this the DOM
          // specs run a second time in node, where there is no document.
          exclude: ['src/**/*.dom.test.*'],
        },
      },
      {
        // The thin DOM adapter and React bindings. Events here are synthetic —
        // real clipboard fidelity is the Playwright layer's job.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.dom.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
