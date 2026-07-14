import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'path'

// Separate config for the mock eval suite (npm run evals:mock) — kept apart
// from vitest.config.ts, which excludes evals/** so plain `npm test` doesn't
// also run the eval suite.
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    env: loadEnv(mode, process.cwd(), ''),
    include: ['evals/mock.eval.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}))
