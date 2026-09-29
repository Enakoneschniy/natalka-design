/* Chronika — shared header / footer for mockup pages */
(() => {
  const NAV = (active, variant) => `
  <header class="nav">
    <div class="container">
      <a class="logo" href="landing.html"><span data-logo></span>Chronika</a>
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
      <div class="nav-actions"></div>` : `
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
      <span data-lang-slot="lang-nav"></span>
      <button class="nav-burger" aria-label="Меню" aria-expanded="false" aria-controls="menu"><span></span><span></span></button>
    </div>
  </header>
  <div class="menu" id="menu" aria-hidden="true">
    <div class="menu-inner">
      <nav class="menu-links">
        <a href="landing.html#products">Продукти</a>
        <a href="landing.html#how">Як це працює</a>
        <a href="preview.html">Приклад розбору</a>
        <a href="landing.html#faq">Питання</a>
        <a href="account.html">Мої замовлення</a>
      </nav>
      <div class="menu-foot">
        <span data-lang-slot="lang-menu"></span>
        <a class="btn btn-primary btn-lg btn-block" href="form.html">Побудувати карту</a>
        <a class="small muted" href="mailto:hi@chronika.me">hi@chronika.me</a>
      </div>
    </div>
  </div>`;

  const FOOTER = `
  <footer class="footer">
    <div class="container">
      <div class="cols">
        <div>
          <a class="logo" href="landing.html" style="margin-bottom:14px"><span data-logo></span>Chronika</a>
          <p class="small">Автоматичні натальні карти українською. Розрахунок за астрономічними ефемеридами, текст — з урахуванням вашої карти, а не знака Сонця.</p>
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
          <ul><li><a href="mailto:hi@chronika.me">hi@chronika.me</a></li><li>Пн–Пт, 10:00–19:00 за Києвом</li><li><a href="#">Instagram</a> · <a href="#">TikTok</a></li></ul>
        </div>
      </div>
      <div class="row between" style="margin-top:40px">
        <span data-moon-now></span>
        <span class="small muted">chronika.me</span>
      </div>
      <div class="legal">
        <span>ФОП Іваненко Наталія Олегівна · РНОКПП 3141592653 · вул. Володимирська, 12, Київ, 01001</span>
        <span>Розбір має розважально-пізнавальний характер і не є медичною, психологічною чи фінансовою порадою.</span>
      </div>
      <div class="footer-mark" aria-hidden="true">Chronika</div>
    </div>
  </footer>`;

  // live Moon: low-precision Meeus, good to ~1° — enough for sign and phase
  function moonNow(lang) {
    const now = new Date(), JD = now / 86400000 + 2440587.5, T = (JD - 2451545) / 36525;
    const rad = d => d * Math.PI / 180, norm = a => ((a % 360) + 360) % 360;
    const Lp = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T, Mp = 134.9633964 + 477198.8675055 * T, F = 93.272 + 483202.0175233 * T;
    const moon = norm(Lp + 6.289 * Math.sin(rad(Mp)) + 1.274 * Math.sin(rad(2 * D - Mp)) + 0.658 * Math.sin(rad(2 * D)) + 0.214 * Math.sin(rad(2 * Mp)) - 0.186 * Math.sin(rad(M)) - 0.114 * Math.sin(rad(2 * F)));
    const sun = norm(280.46646 + 36000.76983 * T + 1.914602 * Math.sin(rad(M)) + 0.019993 * Math.sin(rad(2 * M)));
    const phase = norm(moon - sun), lit = (1 - Math.cos(rad(phase))) / 2, waxing = phase < 180;
    const sign = Math.floor(moon / 30);
    const L = {
      uk: { pre: 'Сьогодні Місяць у', signs: NATALKA.SIGNS_LOC, wax: 'зростає', wane: 'спадає', lit: 'освітлено' },
      en: { pre: 'Tonight the Moon is in', signs: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'], wax: 'waxing', wane: 'waning', lit: 'lit' },
      pl: { pre: 'Dziś Księżyc', signs: ['w Baranie','w Byku','w Bliźniętach','w Raku','we Lwie','w Pannie','w Wadze','w Skorpionie','w Strzelcu','w Koziorożcu','w Wodniku','w Rybach'], wax: 'przybywa', wane: 'ubywa', lit: 'oświetlony' },
      de: { pre: 'Heute steht der Mond', signs: ['im Widder','im Stier','in den Zwillingen','im Krebs','im Löwen','in der Jungfrau','in der Waage','im Skorpion','im Schützen','im Steinbock','im Wassermann','in den Fischen'], wax: 'zunehmend', wane: 'abnehmend', lit: 'beleuchtet' },
      fr: { pre: 'Ce soir, la Lune est en', signs: ['Bélier','Taureau','Gémeaux','Cancer','Lion','Vierge','Balance','Scorpion','Sagittaire','Capricorne','Verseau','Poissons'], wax: 'croissante', wane: 'décroissante', lit: 'éclairée à' },
      cs: { pre: 'Dnes je Měsíc', signs: ['v Beranu','v Býku','v Blížencích','v Raku','ve Lvu','v Panně','ve Vahách','ve Štíru','ve Střelci','v Kozorohu','ve Vodnáři','v Rybách'], wax: 'dorůstá', wane: 'couvá', lit: 'osvětlen' },
      sk: { pre: 'Dnes je Mesiac', signs: ['v Baranovi','v Býkovi','v Blížencoch','v Rakovi','v Levovi','v Panne','vo Váhach','v Škorpiónovi','v Strelcovi','v Kozorožcovi','vo Vodnárovi','v Rybách'], wax: 'dorastá', wane: 'cúva', lit: 'osvetlený' },
      bg: { pre: 'Днес Луната е в', signs: ['Овен','Телец','Близнаци','Рак','Лъв','Дева','Везни','Скорпион','Стрелец','Козирог','Водолей','Риби'], wax: 'расте', wane: 'намалява', lit: 'осветена' },
      ro: { pre: 'Azi Luna este în', signs: ['Berbec','Taur','Gemeni','Rac','Leu','Fecioară','Balanță','Scorpion','Săgetător','Capricorn','Vărsător','Pești'], wax: 'crește', wane: 'descrește', lit: 'iluminată' },
      es: { pre: 'Hoy la Luna está en', signs: ['Aries','Tauro','Géminis','Cáncer','Leo','Virgo','Libra','Escorpio','Sagitario','Capricornio','Acuario','Piscis'], wax: 'creciente', wane: 'menguante', lit: 'iluminada al' },
      ru: { pre: 'Сегодня Луна в', signs: ['Овне','Тельце','Близнецах','Раке','Льве','Деве','Весах','Скорпионе','Стрельце','Козероге','Водолее','Рыбах'], wax: 'растёт', wane: 'убывает', lit: 'освещено' },
      it: { pre: 'Oggi la Luna è in', signs: ['Ariete','Toro','Gemelli','Cancro','Leone','Vergine','Bilancia','Scorpione','Sagittario','Capricorno','Acquario','Pesci'], wax: 'crescente', wane: 'calante', lit: 'illuminata al' },
    }[lang] || {};
    // disc: lit side on the right while waxing, left while waning (northern hemisphere)
    const r = 13, cx = 15, cy = 15, rx = Math.abs(r * Math.cos(rad(phase))).toFixed(2);
    const gib = (waxing ? phase > 90 : phase < 270);
    const path = waxing
      ? `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${gib ? 1 : 0} ${cx} ${cy - r}Z`
      : `M${cx} ${cy - r}A${r} ${r} 0 0 0 ${cx} ${cy + r}A${rx} ${r} 0 0 ${gib ? 0 : 1} ${cx} ${cy - r}Z`;
    const svg = `<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.25)" stroke-width="1"/><path d="${path}" fill="#EAD7A6"/></svg>`;
    const pct = Math.round(lit * 100);
    return `${svg}<span><b>${L.pre} ${L.signs[sign]}</b> · ${waxing ? L.wax : L.wane}, ${L.lit} ${pct}% <span class="mono">${(moon % 30).toFixed(0).padStart(2, '0')}°</span></span>`;
  }
  function renderMoon() { const lang = document.documentElement.lang || 'uk'; document.querySelectorAll('[data-moon-now]').forEach(el => { el.className = 'moon-now'; el.setAttribute('data-no-i18n', ''); el.innerHTML = moonNow(lang); }); }
  document.addEventListener('natalka:lang', renderMoon);

  // zodiac marquee: glyph + sign name, doubled for a seamless loop
  function marquee() {
    document.querySelectorAll('[data-marquee]').forEach(el => {
      const items = NATALKA.SIGNS.map((n, i) => `<span><i>${NATALKA.inlineGlyph(NATALKA.SIGN_PATHS[i])}</i>${n}</span>`).join('');
      el.innerHTML = items + items;
    });
  }

  // star field: fixed canvas behind everything, subtle and static (no twinkle noise)
  function sky() {
    const wrap = document.createElement('div'); wrap.className = 'sky'; wrap.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); wrap.appendChild(c);
    document.body.prepend(wrap);
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      c.width = w * dpr; c.height = h * dpr;
      const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const n = Math.round((w * h) / 9000);
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, r = rnd() < 0.08 ? 1.3 : rnd() < 0.5 ? 0.9 : 0.6, a = 0.15 + rnd() * 0.55;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = rnd() < 0.12 ? `rgba(240,200,140,${a})` : `rgba(220,228,255,${a})`;
        ctx.fill();
      }
    };
    draw(); let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 150); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.body.hasAttribute('data-no-sky')) sky();
    document.querySelectorAll('[data-nav]').forEach(el => { el.outerHTML = NAV(el.dataset.nav, el.dataset.variant); });
    document.querySelectorAll('[data-footer]').forEach(el => { el.outerHTML = FOOTER; });
    document.querySelectorAll('[data-logo]').forEach(el => el.innerHTML = NATALKA.logoMark());
    marquee();
    setTimeout(renderMoon, 0);   // after i18n picked the language
    // mobile menu
    const burger = document.querySelector('.nav-burger'), menu = document.getElementById('menu');
    if (burger && menu) {
      const toggle = open => { document.body.classList.toggle('menu-open', open); burger.setAttribute('aria-expanded', open); menu.setAttribute('aria-hidden', !open); };
      burger.addEventListener('click', () => toggle(!document.body.classList.contains('menu-open')));
      menu.addEventListener('click', e => { if (e.target.closest('a')) toggle(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
    }
  });
})();
