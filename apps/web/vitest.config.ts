import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // next-intl's ESM imports `next/server` without an extension; bundling it lets Vite resolve it.
    server: { deps: { inline: ['next-intl'] } },
  },
});
