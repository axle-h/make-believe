import { defineConfig } from 'vitest/config'

/**
 * One project per package. Vitest 4 replaced `vitest.workspace.ts` with
 * `test.projects`. e2e is Playwright and is not run here.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: 'packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: 'packages/server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          root: 'packages/web',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
})
