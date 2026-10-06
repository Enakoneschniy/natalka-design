import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { fakeApi, fakeEphemeris, fakeOutbound } from './test/fakes';

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
        // The text API and the ephemeris service, faked in Node (see test/fakes.ts).
        // api.stripe.com, faked too.
        outboundService: fakeOutbound,
        serviceBindings: { API: fakeApi, EPHEMERIS: fakeEphemeris },
        bindings: {
          TEST_MIGRATIONS: migrations,
          NATALKA_API_URL: 'https://api.test',
          NATALKA_API_KEY: 'test-api-key',
          RETENTION_DAYS: '30',
          SITE_URL: 'https://chronika.test',
          PRO_SITE_URL: 'https://pro.chronika.test',
          DATA_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          LINK_KEY: 'test-link-key',
          SESSION_KEY: 'test-session-key',
          PRO_API_KEY: 'test-pro-key',
          SITE_KEY: 'test-site-key',
          STRIPE_SECRET_KEY: 'sk_test_fake',
          STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
          // Letters go to the fake Resend in test/fakes.ts; the links are logged as on a laptop.
          RESEND_API_KEY: 're_test_fake',
          MAIL_LOG_LINKS: '1',
          ALERT_EMAIL: 'owner@alerts.test',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
