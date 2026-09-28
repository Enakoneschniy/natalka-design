// Screenshots of every mockup at 1440 / 390, light + dark, via pw-server.
// usage: node design/shots.mjs [page ...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://astro:8080/design/';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
const ALL = ['landing', 'form', 'preview', 'checkout', 'generating', 'account', 'pdf', 'components'];
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const viewports = [{ name: '1440', width: 1440, height: 900 }, { name: '390', width: 390, height: 844, mobile: true }];
const themes = ['dark'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.connect(process.env.PW_TEST_CONNECT_WS_ENDPOINT);
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const name of pages) for (const theme of themes) {
    await page.goto(`${BASE}${name}.html?toggle=0`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const file = `${OUT}${name}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log('saved', file.replace(OUT, ''));
  }
  await ctx.close();
}
await browser.close();
