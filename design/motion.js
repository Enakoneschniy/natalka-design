/* Natalka — motion (GSAP 3.13 + ScrollTrigger + DrawSVG)
   One orchestrated intro (the wheel builds itself), ambient life (stars, orbits, glow),
   scroll reveals, wheel/table hover sync, and page fades. Respects prefers-reduced-motion. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  const hasGsap = typeof gsap !== 'undefined';
  if (hasGsap) { gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin); gsap.defaults({ ease: 'power3.out' }); }

  /* ---------- wheel intro: the chart draws itself ---------- */
  function wheelIntro(svg, opts = {}) {
    if (!hasGsap || reduce) return gsap && gsap.timeline();
    const q = s => svg.querySelectorAll(s);
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: opts.delay || 0 });
    const scale = opts.scale ?? 1;
    tl.from(svg, { opacity: 0, scale: 0.92, transformOrigin: '50% 50%', duration: 1.1, ease: 'power2.out' }, 0)
      .from(q('.wheel-zodiac'), { rotate: -28, transformOrigin: '50% 50%', duration: 1.6 * scale, ease: 'power3.out' }, 0)
      .from(q('.wheel-sign'), { opacity: 0, scale: 0.4, stagger: { each: 0.05, from: 'start' }, duration: 0.5 }, 0.25)
      .from(q('.wheel-ticks'), { opacity: 0, duration: 0.8 }, 0.5)
      .from(q('.wheel-houses circle'), { scale: 0.6, opacity: 0, transformOrigin: '50% 50%', duration: 0.9 }, 0.55)
      .from(q('.wheel-cusp'), { drawSVG: '0%', stagger: 0.04, duration: 0.6 }, 0.7)
      .from(q('.wheel-num, .wheel-angle'), { opacity: 0, duration: 0.5, stagger: 0.02 }, 1.0)
      .from(q('.wheel-planet'), { opacity: 0, scale: 0, stagger: { each: 0.08, from: 'random' }, duration: 0.6, ease: 'back.out(2)' }, 1.05)
      .from(q('.wheel-aspect'), { drawSVG: '50% 50%', stagger: 0.05, duration: 0.7, ease: 'power2.inOut' }, 1.5);
    return tl;
  }

  /* ---------- ambient: twinkling stars + orbit rings ---------- */
  function ambient() {
    const sky = document.querySelector('.sky');
    if (sky && !reduce) {
      let seed = 21; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const n = isMobile ? 18 : 36;
      for (let i = 0; i < n; i++) {
        const d = document.createElement('i');
        d.className = 'twinkle' + (rnd() < 0.3 ? ' warm' : '');
        d.style.left = (rnd() * 100).toFixed(2) + '%';
        d.style.top = (rnd() * 100).toFixed(2) + '%';
        d.style.setProperty('--d', (3 + rnd() * 5).toFixed(2) + 's');
        d.style.setProperty('--o', (rnd() * 6).toFixed(2) + 's');
        sky.appendChild(d);
      }
    }
    document.querySelectorAll('.hero-wheel .wheel-glow, .preview-wheel .wheel-glow').forEach(w => {
      ['orbit orbit-1', 'orbit orbit-2'].forEach(c => { const o = document.createElement('span'); o.className = c; o.setAttribute('aria-hidden', 'true'); w.appendChild(o); });
    });
  }

  /* ---------- hero: headline by words, counters, parallax tilt ---------- */
  function hero() {
    const h1 = document.querySelector('.hero-text h1');
    if (!h1 || !hasGsap) return;
    const wheelSvg = document.querySelector('.hero-wheel .wheel');
    const master = gsap.timeline();
    if (wheelSvg) master.add(wheelIntro(wheelSvg, { delay: 0.15 }), 0);
    if (!reduce) {
      const splitWords = el => [...el.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.data.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const o = document.createElement('span'); o.className = 'w'; o.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top';
            const i = document.createElement('span'); i.style.display = 'inline-block'; i.textContent = part; o.appendChild(i); frag.appendChild(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) splitWords(n);
      });
      h1.dataset.i18nBlock = h1.innerHTML;
      splitWords(h1);
      document.addEventListener('natalka:lang', () => splitWords(h1));
      master.from(h1.querySelectorAll('.w > span'), { yPercent: 110, opacity: 0, rotate: 3, stagger: 0.09, duration: 1.0, ease: 'power4.out' }, 0.2)
        .from('.hero-text .lead', { y: 24, opacity: 0, duration: 0.9 }, 0.8)
        .from('.hero-cta > *', { y: 20, opacity: 0, stagger: 0.1, duration: 0.7 }, 1.0)
        .from('.hero-facts li', { y: 16, opacity: 0, stagger: 0.1, duration: 0.6 }, 1.2)
        .from('.hero-caption > *', { y: 12, opacity: 0, stagger: 0.12, duration: 0.6 }, 1.9);
      // counters
      document.querySelectorAll('.hero-facts strong').forEach(el => {
        const m = el.textContent.match(/^([^\d]*)([\d\s]+)(.*)$/);
        if (!m) return;
        const target = parseInt(m[2].replace(/\s/g, ''), 10);
        if (!target || target < 20) return;
        const o = { v: 0 };
        master.to(o, { v: target, duration: 1.8, ease: 'power2.out', onUpdate: () => { el.textContent = m[1] + Math.round(o.v).toLocaleString('uk-UA').replace(/,/g, ' ') + m[3]; } }, 1.3);
      });
      // parallax tilt (desktop only)
      const glow = document.querySelector('.hero-wheel .wheel-glow');
      if (glow && !isMobile) {
        const hero = document.querySelector('.hero');
        hero.style.perspective = '1400px';
        const qx = gsap.quickTo(glow, 'rotationY', { duration: 0.8, ease: 'power3' });
        const qy = gsap.quickTo(glow, 'rotationX', { duration: 0.8, ease: 'power3' });
        hero.addEventListener('pointermove', e => {
          const r = hero.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          qx(x * 10); qy(-y * 10);
        });
        hero.addEventListener('pointerleave', () => { qx(0); qy(0); });
      }
    }
  }

  /* ---------- scroll reveals ---------- */
  function reveals() {
    if (!hasGsap || reduce) return;
    const up = (sel, vars = {}) => gsap.utils.toArray(sel).forEach(el => gsap.from(el, { y: 32, opacity: 0, duration: 1, scrollTrigger: { trigger: el, start: 'top 88%', once: true }, ...vars }));
    up('.section-title, .reading article, .paywall-card, .cta-card, .account-head, .preview-head, .narrow > h1, .narrow > .lead');
    // staggered groups
    const group = (sel, childSel, vars = {}) => gsap.utils.toArray(sel).forEach(el => {
      const kids = el.querySelectorAll(childSel); if (!kids.length) return;
      gsap.from(kids, { y: 28, opacity: 0, duration: 0.8, stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 85%', once: true }, ...vars });
    });
    group('.grid', ':scope > .card');
    group('.toc', 'li');
    group('.steps', 'li');
    group('.faq', 'details');
    group('.orders', '.order');
    group('.form', ':scope > .card');
    group('.gen-steps', 'li', { x: -16, y: 0 });
    group('.aspect-legend', 'li', { x: 12, y: 0, stagger: 0.06 });
    // zodiac strip lights up as a wave
    gsap.utils.toArray('.zodiac-strip').forEach(el => gsap.fromTo(el.querySelectorAll('i'), { opacity: 0.15, y: 6 }, { opacity: 1, y: 0, stagger: 0.06, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 90%', once: true } }));
    // PDF spread opens as you scroll
    gsap.utils.toArray('.spread').forEach(el => {
      const [a, b] = el.children;
      gsap.fromTo(a, { rotationY: 38, x: 30, opacity: 0.4 }, { rotationY: 6, x: 4, opacity: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 45%', scrub: 0.6 } });
      gsap.fromTo(b, { rotationY: -38, x: -30, opacity: 0.4 }, { rotationY: -6, x: -4, opacity: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 45%', scrub: 0.6 } });
    });
    // bundle: gold rim sweeps in
    gsap.utils.toArray('.bundle').forEach(el => gsap.from(el, { scale: 0.97, opacity: 0, duration: 1, scrollTrigger: { trigger: el, start: 'top 85%', once: true } }));
    // steps: gold accent line draws
    gsap.utils.toArray('.steps li').forEach(li => gsap.fromTo(li, { '--w': '0px' }, { '--w': '48px', duration: 1, delay: 0.4, scrollTrigger: { trigger: li, start: 'top 85%', once: true } }));
    // positions table rows
    gsap.utils.toArray('[data-positions] tbody').forEach(tb => gsap.from(tb.querySelectorAll('tr'), { x: -12, opacity: 0, stagger: 0.05, duration: 0.6, scrollTrigger: { trigger: tb, start: 'top 85%', once: true } }));
    gsap.utils.toArray('[data-aspects]').forEach(t => gsap.from(t.querySelectorAll('td svg'), { scale: 0, opacity: 0, stagger: { each: 0.03, from: 'random' }, duration: 0.5, transformOrigin: '50% 50%', scrollTrigger: { trigger: t, start: 'top 85%', once: true } }));
  }

  /* ---------- secondary wheels: build on enter; mark wheels rotate slowly ---------- */
  function otherWheels() {
    if (!hasGsap || reduce) return;
    document.querySelectorAll('.wheel').forEach(svg => {
      if (svg.closest('.hero-wheel')) return;
      if (svg.classList.contains('wheel-mark')) { gsap.to(svg.querySelector('.wheel-zodiac'), { rotate: 360, transformOrigin: '50% 50%', duration: 240, ease: 'none', repeat: -1 }); return; }
      const tl = wheelIntro(svg, { scale: 0.8 }); tl.pause();
      ScrollTrigger.create({ trigger: svg, start: 'top 85%', once: true, onEnter: () => tl.play() });
    });
  }

  /* ---------- generating screen: progress feels alive ---------- */
  function generating() {
    const bar = document.querySelector('.gen-card .progress > span');
    if (!bar || !hasGsap || reduce) return;
    gsap.fromTo(bar, { width: '38%' }, { width: '55%', duration: 2.4, ease: 'power2.inOut', delay: 0.6 });
    gsap.to(bar, { boxShadow: '0 0 28px rgba(231,183,92,.9)', duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  /* ---------- rotating testimonials ---------- */
  function quotes() {
    const wrap = document.querySelector('[data-quotes]'); if (!wrap) return;
    const items = [...wrap.querySelectorAll('.quote')], dots = document.querySelector('[data-quotes-dots]');
    const DUR = 7000; let i = 0, timer;
    wrap.style.setProperty('--quote-dur', DUR + 'ms');
    if (dots) dots.innerHTML = items.map((_, k) => `<button type="button" aria-label="${k + 1}"></button>`).join('');
    const show = k => { i = (k + items.length) % items.length; items.forEach((q, n) => q.classList.toggle('is-on', n === i)); dots && [...dots.children].forEach((d, n) => d.setAttribute('aria-current', n === i)); };
    const start = () => { clearInterval(timer); if (!reduce) timer = setInterval(() => show(i + 1), DUR); };
    dots && dots.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; show([...dots.children].indexOf(b)); start(); });
    // size the stage to the tallest quote so the layout never jumps
    const fit = () => { wrap.style.minHeight = Math.max(...items.map(q => { q.style.position = 'static'; const h = q.offsetHeight; q.style.position = ''; return h; })) + 'px'; };
    fit(); window.addEventListener('resize', fit); document.addEventListener('natalka:lang', () => setTimeout(fit, 0));
    show(0); start();
  }

  /* ---------- cursor comet (desktop, pointer devices only) ---------- */
  function comet() {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const c = document.createElement('canvas'); c.className = 'comet'; document.body.appendChild(c);
    const ctx = c.getContext('2d'); const pts = []; let mx = -100, my = -100, raf;
    const size = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
    size(); addEventListener('resize', size);
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(draw); });
    function draw() {
      raf = 0;
      pts.push({ x: mx, y: my, a: 1 }); if (pts.length > 14) pts.shift();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      pts.forEach((p, k) => { const t = k / pts.length; ctx.beginPath(); ctx.arc(p.x, p.y, 1 + t * 2.2, 0, Math.PI * 2); ctx.fillStyle = `rgba(240,185,91,${t * .55})`; ctx.fill(); });
      const last = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(last.x, last.y, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,230,180,.9)'; ctx.shadowColor = 'rgba(240,185,91,.9)'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      if (pts.length > 1) raf = requestAnimationFrame(() => { pts.shift(); draw(); });
    }
  }

  /* ---------- magnetic primary buttons ---------- */
  function magnetic() {
    if (!hasGsap || reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.btn-primary').forEach(b => {
      const x = gsap.quickTo(b, 'x', { duration: .5, ease: 'power3' }), y = gsap.quickTo(b, 'y', { duration: .5, ease: 'power3' });
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * .18); y((e.clientY - r.top - r.height / 2) * .28); });
      b.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }

  /* ---------- smooth scroll (Lenis) wired to ScrollTrigger ---------- */
  function smooth() {
    if (typeof Lenis === 'undefined' || !hasGsap || reduce || window.matchMedia('(hover: none)').matches) return;
    const lenis = new Lenis({ lerp: 0.09, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
    window.NATALKA_LENIS = lenis;
  }

  /* ---------- page fade on internal navigation ---------- */
  function transitions() {
    if (reduce) return;
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/\.html($|\?)/.test(url.pathname + url.search) || url.pathname === location.pathname) return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(() => { location.href = a.href; }, 240);
    });
    window.addEventListener('pageshow', () => document.body.classList.remove('is-leaving'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    smooth();
    ambient();
    hero();
    quotes();
    comet();
    magnetic();
    otherWheels();
    reveals();
    generating();
    transitions();
  });
  window.NATALKA_MOTION = { wheelIntro };
})();
