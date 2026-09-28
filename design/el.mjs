import { chromium } from '@playwright/test';
const [url, sel, out, w=1440] = process.argv.slice(2);
const b = await chromium.connect(process.env.PW_TEST_CONNECT_WS_ENDPOINT);
const p = await (await b.newContext({ locale: 'uk-UA', viewport: { width: +w, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })).newPage();
await p.goto(url, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
await p.locator(sel).first().screenshot({ path: out }); await b.close(); console.log('ok', out);
