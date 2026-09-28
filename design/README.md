# Natalka — дизайн-макети

HTML/CSS-макети сервісу автоматичних натальних карт. Відкрити `index.html`
(через будь-який статичний сервер, напр. `npm run serve` → http://localhost:8080/design/).

- `tokens.css` — дизайн-токени: темна палітра (глибокий синій, золото, індигове свічення), шрифти (Playfair Display / Golos Text / JetBrains Mono), радіуси.
- `base.css` — компоненти: кнопки, поля, чекбокси, картки, бейджі, таблиця позицій, сітка аспектів, степер, FAQ, футер.
- `pages.css` — розкладки екранів.
- `wheel.js` — компонент колеса карти (SVG з даних: довготи планет, куспіди домів, аспекти), таблиця позицій, сітка аспектів, бейдж, гліфи планет і знаків (SVG-контури, без emoji-шрифтів).
- `chrome.js` — спільна шапка/футер макетів і зоряне поле (canvas).
- `motion.js` — анімації на GSAP 3.13 (CDN): інтро колеса, заголовок по словах, лічильники, паралакс, скрол-реврли, hover-синхронізація колеса й таблиці, переходи між сторінками. Поважає `prefers-reduced-motion`.
- `i18n.js` + `i18n/<lang>.js` — мови. Українська — джерело в розмітці; словники підміняють текст на льоту. Підтримка: uk, en, pl, de, fr, cs, sk, bg, ro, es, it (343 рядки на мову; перевірка повноти — `node -e` у README нижче). Російської немає ніде: не пропонується, пристрої з ru-локаллю отримують українську; для RU-гео — `unavailable.html`. Ціни: ₴ / € / zł (орієнтовні, задаються у словниках).
- `fold.mjs` — скриншоти для складних (Galaxy Z Fold: зовнішній 348×890, внутрішній 697×837 і альбом). CSS: `@media (horizontal-viewport-segments: 2)` для шарніра, `(vertical-viewport-segments: 2)` для flex-режиму.
- `frames.mjs` — кадри інтро-анімації для перевірки (`node design/frames.mjs <url> <prefix> [width] [selector]`).
- `shots.mjs` — скриншоти всіх екранів 1440 / 390 → `screenshots/` (`npm run shots`).

Екрани: `landing` · `form` · `preview` · `checkout` · `generating` · `account` · `pdf` · `components` · `unavailable`.
Мова примусово: `?lang=de` тощо. Гео на проді: `<html data-country="XX">` → мапа COUNTRY у `i18n.js`; RU → `unavailable.html`.
