import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@king-david/contracts': path.resolve('packages/contracts/src'), '@king-david/db': path.resolve('packages/db/src'), '@king-david/policy': path.resolve('packages/policy/src'), '@king-david/config': path.resolve('packages/config/src') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
});
