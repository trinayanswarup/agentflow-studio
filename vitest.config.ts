import { defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'path'

// evals/mock.eval.test.ts is a separate suite (npm run evals:mock), run via
// vitest.evals.config.ts — excluded here so plain `npm test` stays scoped to
// the existing unit/integration tests (Vitest's `exclude` wins over any
// explicit file path passed on the CLI, so it can't just be filtered in).
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    env: loadEnv(mode, process.cwd(), ''),
    exclude: [...configDefaults.exclude, 'evals/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}))
