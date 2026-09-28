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
      const words = h1.textContent.trim().split(/\s+/);
      h1.innerHTML = words.map(w => `<span class="w" style="display:inline-block;overflow:hidden;vertical-align:top"><span style="display:inline-block">${w}</span></span>`).join(' ');
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
    ambient();
    hero();
    otherWheels();
    reveals();
    generating();
    transitions();
  });
  window.NATALKA_MOTION = { wheelIntro };
})();
