import { defineConfig, mergeConfig } from 'vitest/config';
import vite from './vite.config';

export default mergeConfig(
  vite,
  defineConfig({
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
      setupFiles: ['test/setup.ts'],
    },
  }),
);
