import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/office/**/*.test.ts'], testTimeout: 60000, hookTimeout: 60000, maxWorkers: 1 } });
