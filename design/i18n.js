/* Natalka — i18n
   Ukrainian is the source language in the markup; dictionaries in i18n/<lang>.js map
   Ukrainian strings → translations, applied to text nodes and a few attributes.
   Supported: uk, en, pl. Russian is deliberately not a language of this product:
   it is never offered, and devices with a ru-* locale are served Ukrainian. */
const NATALKA_LANG = (() => {
  const SUPPORTED = ['uk', 'en', 'pl', 'de', 'fr', 'cs', 'sk', 'bg', 'ro', 'es', 'it'];
  const LABELS = { uk: 'UA', en: 'EN', pl: 'PL', de: 'DE', fr: 'FR', cs: 'CS', sk: 'SK', bg: 'BG', ro: 'RO', es: 'ES', it: 'IT' };
  const NAMES = { uk: 'Українська', en: 'English', pl: 'Polski', de: 'Deutsch', fr: 'Français', cs: 'Čeština', sk: 'Slovenčina', bg: 'Български', ro: 'Română', es: 'Español', it: 'Italiano' };
  // geo → language (production: server sets <html data-country> from CF-IPCountry; RU → /unavailable)
  const COUNTRY = { UA: 'uk', PL: 'pl', DE: 'de', AT: 'de', CH: 'de', LI: 'de', FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', CZ: 'cs', SK: 'sk', BG: 'bg', RO: 'ro', MD: 'ro', ES: 'es', AR: 'es', MX: 'es', CL: 'es', CO: 'es', PE: 'es', IT: 'it', SM: 'it' };
  const ATTRS = ['placeholder', 'aria-label', 'title'];

  function detect() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && SUPPORTED.includes(q)) return q;
    try { const s = localStorage.getItem('natalka.lang'); if (s && SUPPORTED.includes(s)) return s; } catch (e) {}
    // Production: the server sets this from geo (CF-IPCountry): UA → uk, PL → pl, everything else → en; RU → /unavailable.
    const country = document.documentElement.dataset.country;
    if (country && COUNTRY[country]) return COUNTRY[country];
    for (const l of navigator.languages || [navigator.language || 'en']) {
      const base = l.slice(0, 2).toLowerCase();
      if (base === 'ru') return 'uk';           // never Russian; Ukrainian-speaking users on ru-locale devices get Ukrainian
      if (SUPPORTED.includes(base)) return base;
    }
    return 'en';
  }

  const originals = new WeakMap();           // node → source text, so switching back works
  function walk(root, fn) {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('script, style, [data-no-i18n]')) return NodeFilter.FILTER_REJECT;
      return n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    } });
    let n; while ((n = it.nextNode())) fn(n);
  }

  function apply(lang) {
    const dict = (window.NATALKA_I18N && window.NATALKA_I18N[lang]) || {};
    const t = s => { const k = s.replace(/\s+/g, ' ').trim(); return Object.prototype.hasOwnProperty.call(dict, k) ? dict[k] : null; };
    // blocks that other scripts restructure (e.g. word-split headlines) are restored from their source markup first
    document.querySelectorAll('[data-i18n-block]').forEach(el => { el.innerHTML = el.dataset.i18nBlock; });
    walk(document.body, n => {
      if (!originals.has(n)) originals.set(n, n.data);
      const src = originals.get(n);
      const tr = t(src);
      n.data = tr !== null ? src.replace(src.trim(), tr) : src;
    });
    document.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(el => ATTRS.forEach(a => {
      if (!el.hasAttribute(a)) return;
      const key = 'i18n' + a.replace(/-(.)/g, (_, c) => c.toUpperCase());
      if (!el.dataset[key]) el.dataset[key] = el.getAttribute(a);
      const tr = t(el.dataset[key]); el.setAttribute(a, tr !== null ? tr : el.dataset[key]);
    }));
    // product prices: "<num><small>грн</small>" — the dictionary already carries the currency, so drop the unit
    document.querySelectorAll('.price').forEach(p => {
      const small = p.querySelector('small'); if (!small) return;
      small.style.display = lang === 'uk' ? '' : 'none';
    });
    if (!document.title.includes('|')) { if (!document.documentElement.dataset.i18nTitle) document.documentElement.dataset.i18nTitle = document.title; const tt = t(document.documentElement.dataset.i18nTitle); document.title = tt !== null ? tt : document.documentElement.dataset.i18nTitle; }
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    document.querySelectorAll('[data-lang-switch] button[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lang));
    document.querySelectorAll('[data-lang-current]').forEach(el => el.textContent = LABELS[lang]);
  }

  function set(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try { localStorage.setItem('natalka.lang', lang); } catch (e) {}
    const u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null, '', u);
    apply(lang);
    document.dispatchEvent(new CustomEvent('natalka:lang', { detail: { lang } }));
  }

  function switcherHTML(kind = 'lang-nav') {
    const items = SUPPORTED.map(l => `<button type="button" data-lang="${l}" aria-pressed="false" lang="${l}"><span class="lang-code">${LABELS[l]}</span><span class="lang-name">${NAMES[l]}</span></button>`).join('');
    if (kind === 'lang-menu') return `<div class="lang lang-grid" data-lang-switch role="group" aria-label="Мова">${items}</div>`;
    return `<div class="lang lang-drop" data-lang-switch>
      <button type="button" class="lang-current" aria-haspopup="listbox" aria-expanded="false" aria-label="Мова"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2.5 2.5 2.5 10.5 0 13M8 1.5c-2.5 2.5-2.5 10.5 0 13"/></svg><span class="lang-code" data-lang-current></span><svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3.5l3 3 3-3"/></svg></button>
      <div class="lang-list" role="listbox">${items}</div>
    </div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-lang-slot]').forEach(el => { el.outerHTML = switcherHTML(el.dataset.langSlot); });
    document.addEventListener('click', e => {
      const cur = e.target.closest('.lang-current');
      if (cur) { const open = cur.getAttribute('aria-expanded') === 'true'; document.querySelectorAll('.lang-current').forEach(c => c.setAttribute('aria-expanded', 'false')); cur.setAttribute('aria-expanded', !open); return; }
      const b = e.target.closest('[data-lang-switch] button[data-lang]');
      if (b) set(b.dataset.lang);
      document.querySelectorAll('.lang-current').forEach(c => c.setAttribute('aria-expanded', 'false'));
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.lang-current').forEach(c => c.setAttribute('aria-expanded', 'false')); });
    apply(detect());
  });

  return { SUPPORTED, LABELS, NAMES, detect, set, apply, get current() { return document.documentElement.lang || 'uk'; } };
})();
