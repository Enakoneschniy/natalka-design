// screenshots at foldable viewports: Z Fold cover (348×890), inner portrait (697×837), inner landscape (837×697)
import { chromium } from '@playwright/test';
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['landing', 'preview', 'form'];
const vps = [{ n: 'fold-cover', w: 348, h: 890, m: true }, { n: 'fold-inner', w: 697, h: 837, m: true }, { n: 'fold-inner-land', w: 837, h: 697, m: true }];
const b = await chromium.connect(process.env.PW_TEST_CONNECT_WS_ENDPOINT);
for (const vp of vps) {
  const ctx = await b.newContext({ locale: 'uk-UA', viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, isMobile: vp.m, hasTouch: vp.m, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  for (const name of pages) {
    await p.goto(`http://astro:8080/design/${name}.html`, { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
    await p.screenshot({ path: `screenshots/${name}-${vp.n}.png`, fullPage: false });
    console.log('saved', `${name}-${vp.n}.png`);
  }
  await ctx.close();
}
await b.close();
