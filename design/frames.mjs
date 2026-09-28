// capture intro frames of a page (no reduced-motion) + console errors
import { chromium } from '@playwright/test';
const [url, prefix, w = 1440, sel = ''] = process.argv.slice(2);
const b = await chromium.connect(process.env.PW_TEST_CONNECT_WS_ENDPOINT);
const ctx = await b.newContext({ viewport: { width: +w, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(url, { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
for (const t of [400, 1200, 2600]) {
  const wait = t - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait);
  const target = sel ? p.locator(sel).first() : p;
  await target.screenshot({ path: `${prefix}-${t}.png` });
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
