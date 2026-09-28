/* Natalka — shared header / footer for mockup pages */
(() => {
  const NAV = (active, variant) => `
  <header class="nav">
    <div class="container">
      <a class="logo" href="landing.html"><span data-logo></span>Natalka</a>
      ${variant === 'app' ? `
      <nav class="nav-links">
        <a href="account.html" ${active === 'account' ? 'aria-current="page"' : ''}>Мої замовлення</a>
        <a href="landing.html#products">Продукти</a>
        <a href="landing.html#faq">Допомога</a>
      </nav>
      <div class="nav-actions">
        <span class="small muted">oksana@gmail.com</span>
        <a class="btn btn-ghost btn-sm" href="landing.html">Вийти</a>
      </div>` : variant === 'flow' ? `
      <div class="nav-actions">
        <span class="small muted">Потрібна допомога? <a href="mailto:hi@natalka.app">hi@natalka.app</a></span>
      </div>` : `
      <nav class="nav-links">
        <a href="landing.html#products" ${active === 'products' ? 'aria-current="page"' : ''}>Продукти</a>
        <a href="landing.html#how">Як це працює</a>
        <a href="preview.html">Приклад розбору</a>
        <a href="landing.html#faq">Питання</a>
      </nav>
      <div class="nav-actions">
        <a class="btn btn-ghost btn-sm" href="account.html">Увійти</a>
        <a class="btn btn-primary btn-sm" href="form.html">Побудувати карту</a>
      </div>`}
      <button class="nav-burger" aria-label="Меню"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h14M3 10h14M3 14h14"/></svg></button>
    </div>
  </header>`;

  const FOOTER = `
  <footer class="footer">
    <div class="container">
      <div class="cols">
        <div>
          <a class="logo" href="landing.html" style="margin-bottom:14px"><span data-logo></span>Natalka</a>
          <p class="small">Автоматичні натальні карти українською. Розрахунок за швейцарськими ефемеридами, текст — з урахуванням вашої карти, а не знака Сонця.</p>
        </div>
        <div>
          <h4>Продукти</h4>
          <ul><li><a href="landing.html#products">Натальна карта</a></li><li><a href="landing.html#products">Прогноз на 12 місяців</a></li><li><a href="landing.html#products">Сумісність</a></li><li><a href="landing.html#products">Дитяча карта</a></li><li><a href="landing.html#products">Повний розбір</a></li></ul>
        </div>
        <div>
          <h4>Документи</h4>
          <ul><li><a href="#">Публічна оферта</a></li><li><a href="#">Політика конфіденційності</a></li><li><a href="#">Повернення коштів</a></li><li><a href="#">Умови використання</a></li></ul>
        </div>
        <div>
          <h4>Контакти</h4>
          <ul><li><a href="mailto:hi@natalka.app">hi@natalka.app</a></li><li>Пн–Пт, 10:00–19:00 за Києвом</li><li><a href="#">Instagram</a> · <a href="#">TikTok</a></li></ul>
        </div>
      </div>
      <div class="legal">
        <span>ФОП Іваненко Наталія Олегівна · РНОКПП 3141592653 · вул. Володимирська, 12, Київ, 01001</span>
        <span>Розбір має розважально-пізнавальний характер і не є медичною, психологічною чи фінансовою порадою.</span>
      </div>
    </div>
  </footer>`;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-nav]').forEach(el => { el.outerHTML = NAV(el.dataset.nav, el.dataset.variant); });
    document.querySelectorAll('[data-footer]').forEach(el => { el.outerHTML = FOOTER; });
    document.querySelectorAll('[data-logo]').forEach(el => el.innerHTML = NATALKA.logoMark());
  });
})();
