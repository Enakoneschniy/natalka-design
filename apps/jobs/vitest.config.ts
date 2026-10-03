import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The real wrangler.jsonc names service bindings (the API container, the ephemeris service, the
// bot) that do not exist in a test run, so the runtime is described here instead. Keys are fixed
// test values, never the production secrets.
const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)));

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      miniflare: {
        compatibilityDate: '2026-09-01',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['DOCS'],
        queueProducers: { JOBS: 'natalka-jobs' },
        bindings: {
          TEST_MIGRATIONS: migrations,
          NATALKA_API_URL: 'https://api.test',
          RETENTION_DAYS: '30',
          SITE_URL: 'https://chronika.test',
          PRO_SITE_URL: 'https://pro.chronika.test',
          DATA_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          LINK_KEY: 'test-link-key',
          SESSION_KEY: 'test-session-key',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
