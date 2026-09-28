/* Natalka — natal wheel component + shared astro helpers.
   Everything is drawn from data (longitudes, cusps) so the same
   component serves hero / preview / badge sizes and the PDF spread. */

const NATALKA = (() => {
  // ---------- glyphs (24×24, stroke paths; no emoji fonts) ----------
  const SIGN_PATHS = [
    'M12 21V11C12 6 7 4 5 8M12 11C12 6 17 4 19 8',                                   // Aries
    'M4 4C5 9 8 11 12 11C16 11 19 9 20 4M12 21a5 5 0 1 0 0-10a5 5 0 0 0 0 10',       // Taurus
    'M9 6V18M15 6V18M5 5C8 7 16 7 19 5M5 19C8 17 16 17 19 19',                       // Gemini
    'M4 8C7 3 16 4 20 8M20 16C17 21 8 20 4 16M10 10a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0M19 14a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0', // Cancer
    'M9 18a3 3 0 1 1 0-6C8 8 9 4 12 4C15 4 16 8 15 11C14 14 13 16 14 18C15 20 18 19 18 17', // Leo
    'M4 8C4 5 8 5 8 8V17M8 8C8 5 12 5 12 8V17M12 8C12 5 16 5 16 8V14C16 17 13 19 10 19M16 14C18 14 20 16 19 20', // Virgo
    'M4 15H8A4 4 0 1 1 16 15H20M4 19H20',                                             // Libra
    'M4 8C4 5 8 5 8 8V17M8 8C8 5 12 5 12 8V17M12 8C12 5 16 5 16 8V16C16 18.5 17.5 19.5 20 19.5M18 17.5L20.5 19.5L18.5 21.5', // Scorpio
    'M5 19L19 5M12 5H19V12M8 10L14 16',                                               // Sagittarius
    'M4 6L8 12L12 5V15C12 19 15 20 17 18C19 16 17 13 14 14C11 15 10 18 12 21',        // Capricorn
    'M3 9l3-2.5 3 2.5 3-2.5 3 2.5 3-2.5 3 2.5M3 15l3-2.5 3 2.5 3-2.5 3 2.5 3-2.5 3 2.5', // Aquarius
    'M6 4C10 8 10 16 6 20M18 4C14 8 14 16 18 20M5 12H19',                             // Pisces
  ];
  const PLANET_PATHS = {
    sun:     'M19 12a7 7 0 1 1-14 0a7 7 0 0 1 14 0M13.5 12a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0',
    moon:    'M13 3A9 9 0 1 0 13 21A7 7 0 0 1 13 3Z',
    mercury: 'M16 11a4 4 0 1 1-8 0a4 4 0 0 1 8 0M12 15V21M9 18H15M8 3C8 6 10 7 12 7C14 7 16 6 16 3',
    venus:   'M17 9a5 5 0 1 1-10 0a5 5 0 0 1 10 0M12 14V21M9 18H15',
    mars:    'M15 14a5 5 0 1 1-10 0a5 5 0 0 1 10 0M13.5 10.5L20 4M15 4H20V9',
    jupiter: 'M5 8C5 4 10 3 11 7C11 10 7 12 4 13H18M15 3V20',
    saturn:  'M9 3H15M12 3V14M12 8C15 5 20 8 18 14C17 17 14 19 13 21',
    uranus:  'M6 4V16M18 4V16M6 10H18M12 4V15M14.5 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0',
    neptune: 'M5 5C5 12 8 13 12 13C16 13 19 12 19 5M12 3V21M8 18H16',
    pluto:   'M15 7a3 3 0 1 1-6 0a3 3 0 0 1 6 0M6 5C6 14 18 14 18 5M12 14V21M8 18H16',
    node:    'M8 19A7 7 0 1 1 16 19M4 19H8M16 19H20',
    asc:     '', mc: '',
  };
  const ASPECT_PATHS = {
    conj: 'M15 13a5 5 0 1 1-10 0a5 5 0 0 1 10 0M13 9L20 2',
    opp:  'M9 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0M23 17a4 4 0 1 1-8 0a4 4 0 0 1 8 0M8 10L16 14',
    tri:  'M12 4L21 20H3Z',
    sq:   'M4 4H20V20H4Z',
    sex:  'M12 3V21M4 7.5L20 16.5M4 16.5L20 7.5',
  };

  const SIGNS = ['Овен','Телець','Близнюки','Рак','Лев','Діва','Терези','Скорпіон','Стрілець','Козоріг','Водолій','Риби'];
  const SIGNS_LOC = ['Овні','Тельці','Близнюках','Раку','Леві','Діві','Терезах','Скорпіоні','Стрільці','Козерозі','Водолії','Рибах'];
  const ELEMENTS = ['fire','earth','air','water'];
  const ELEMENT_NAME = { fire:'Вогонь', earth:'Земля', air:'Повітря', water:'Вода' };
  const PLANET_NAMES = { sun:'Сонце', moon:'Місяць', mercury:'Меркурій', venus:'Венера', mars:'Марс', jupiter:'Юпітер', saturn:'Сатурн', uranus:'Уран', neptune:'Нептун', pluto:'Плутон', node:'Півн. вузол', asc:'Асцендент', mc:'MC' };
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

  // ---------- sample chart (Оксана, 14.05.1992 09:40, Київ) ----------
  const SAMPLE = {
    person: { name: 'Оксана', date: '14 травня 1992', time: '09:40', place: 'Київ, Україна', lat: '50°27′ пн. ш.', lon: '30°31′ сх. д.', tz: 'UTC+3' },
    planets: [
      { id:'sun',     lon: 54.40 },
      { id:'moon',    lon: 98.20 },
      { id:'mercury', lon: 41.05, retro:true },
      { id:'venus',   lon: 77.77 },
      { id:'mars',    lon: 19.52 },
      { id:'jupiter', lon: 155.03 },
      { id:'saturn',  lon: 318.28, retro:true },
      { id:'uranus',  lon: 287.67, retro:true },
      { id:'neptune', lon: 288.55, retro:true },
      { id:'pluto',   lon: 231.83, retro:true },
      { id:'node',    lon: 271.20 },
    ],
    cusps: [124.45, 148.10, 175.30, 202.17, 234.60, 268.40, 304.45, 328.10, 355.30, 22.17, 54.60, 88.40],
  };

  // ---------- helpers ----------
  const norm = a => ((a % 360) + 360) % 360;
  const signOf = lon => Math.floor(norm(lon) / 30);
  const elementOf = lon => ELEMENTS[signOf(lon) % 4];
  function fmtDeg(lon, withSign) {
    const inSign = norm(lon) % 30;
    const d = Math.floor(inSign);
    const m = Math.round((inSign - d) * 60);
    const s = `${String(d).padStart(2,'0')}°${String(m).padStart(2,'0')}′`;
    return withSign ? `${s} ${SIGNS[signOf(lon)]}` : s;
  }
  function houseOf(lon, cusps) {
    for (let i = 0; i < 12; i++) {
      const a = cusps[i], b = cusps[(i + 1) % 12];
      const span = norm(b - a), off = norm(lon - a);
      if (off < span) return i + 1;
    }
    return 12;
  }
  const ASPECT_DEFS = [
    { id:'conj', angle:0,   orb:8, kind:'neu' },
    { id:'opp',  angle:180, orb:8, kind:'tense' },
    { id:'tri',  angle:120, orb:7, kind:'harm' },
    { id:'sq',   angle:90,  orb:7, kind:'tense' },
    { id:'sex',  angle:60,  orb:5, kind:'harm' },
  ];
  function aspects(planets) {
    const out = [];
    for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
      let d = Math.abs(norm(planets[i].lon) - norm(planets[j].lon));
      if (d > 180) d = 360 - d;
      for (const def of ASPECT_DEFS) {
        if (Math.abs(d - def.angle) <= def.orb) { out.push({ a: planets[i].id, b: planets[j].id, ...def, orbActual: Math.abs(d - def.angle) }); break; }
      }
    }
    return out;
  }

  const svgEl = (tag, attrs = {}, children = []) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    children.forEach(c => el.appendChild(c));
    return el;
  };
  function glyph(path, size, x, y, color, sw) {
    const g = svgEl('g', { transform: `translate(${x - size/2} ${y - size/2}) scale(${size/24})` });
    g.appendChild(svgEl('path', { d: path, fill: 'none', stroke: color, 'stroke-width': sw || 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return g;
  }
  function inlineGlyph(path, cls) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="${cls||''}" aria-hidden="true"><path d="${path}"/></svg>`;
  }

  // ---------- wheel ----------
  // opts: { size, chart, detail: 'full'|'compact'|'mark', animate, highlight }
  function wheel(container, opts = {}) {
    const chart = opts.chart || SAMPLE;
    const size = opts.size || 480;
    const detail = opts.detail || (size < 160 ? 'mark' : size < 360 ? 'compact' : 'full');
    const asc = chart.cusps[0];
    const css = getComputedStyle(container);
    const v = n => css.getPropertyValue(n).trim();
    const C = { line: v('--wheel-line'), strong: v('--wheel-line-strong'), glyph: v('--wheel-glyph'), face: v('--wheel-face'), ring: v('--wheel-ring'),
      astro: v('--astro'), accent: v('--accent'), text2: v('--text-2'), tense: v('--aspect-tense'), harm: v('--aspect-harmonic'), neu: v('--aspect-neutral'),
      el: { fire: v('--fire'), earth: v('--earth'), air: v('--air'), water: v('--water') },
      elSoft: { fire: v('--fire-soft'), earth: v('--earth-soft'), air: v('--air-soft'), water: v('--water-soft') },
      sign: v('--wheel-sign'), sector: v('--wheel-sector'), labelBg: v('--surface-solid') || v('--wheel-face') };

    const R = size / 2, cx = R, cy = R;
    // ASC on the left, zodiac counter-clockwise
    const ang = lon => (norm(lon - asc)) * Math.PI / 180;
    const pt = (lon, r) => [cx - r * Math.cos(ang(lon)), cy + r * Math.sin(ang(lon))];
    const arc = (r, a0, a1) => { // a0->a1 increasing longitude
      const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
      const large = norm(a1 - a0) > 180 ? 1 : 0;
      return `M${x0} ${y0}A${r} ${r} 0 ${large} 0 ${x1} ${y1}`;
    };

    const rOuter = R - 1;
    const rZodIn = detail === 'mark' ? R * 0.72 : R * 0.86;
    const rTickOut = rZodIn, rTickIn = detail === 'full' ? R * 0.80 : R * 0.82;
    const rPlanet = detail === 'full' ? R * 0.705 : detail === 'compact' ? R * 0.70 : R * 0.60;
    const rHouseOut = detail === 'full' ? R * 0.53 : R * 0.54;
    const rHouseIn = detail === 'full' ? R * 0.47 : R * 0.48;
    const rAspect = detail === 'full' ? R * 0.45 : detail === 'compact' ? R * 0.46 : R * 0.62;
    const swThin = Math.max(0.6, size / 900), swMid = Math.max(0.8, size / 600), swStrong = Math.max(1.2, size / 400);

    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'wheel', role: 'img', 'aria-label': 'Натальна карта' });
    if (opts.responsive) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = 'auto'; }

    // face
    svg.appendChild(svgEl('circle', { cx, cy, r: rOuter, fill: C.face, stroke: C.line, 'stroke-width': swMid }));

    // zodiac ring: 12 sectors tinted by element
    for (let i = 0; i < 12; i++) {
      const a0 = i * 30, a1 = a0 + 30;
      const el = ELEMENTS[i % 4];
      const [xo0, yo0] = pt(a0, rOuter), [xo1, yo1] = pt(a1, rOuter), [xi1, yi1] = pt(a1, rZodIn), [xi0, yi0] = pt(a0, rZodIn);
      const d = `M${xo0} ${yo0}A${rOuter} ${rOuter} 0 0 0 ${xo1} ${yo1}L${xi1} ${yi1}A${rZodIn} ${rZodIn} 0 0 1 ${xi0} ${yi0}Z`;
      svg.appendChild(svgEl('path', { d, fill: C.sector || C.elSoft[el], stroke: 'none' }));
      // divider
      const [dx0, dy0] = pt(a0, rZodIn), [dx1, dy1] = pt(a0, rOuter);
      svg.appendChild(svgEl('line', { x1: dx0, y1: dy0, x2: dx1, y2: dy1, stroke: C.line, 'stroke-width': swThin }));
      // sign glyph
      const gs = detail === 'mark' ? size * 0.11 : detail === 'compact' ? size * 0.055 : size * 0.042;
      const [gx, gy] = pt(a0 + 15, (rOuter + rZodIn) / 2);
      svg.appendChild(glyph(SIGN_PATHS[i], gs, gx, gy, C.sign || C.el[el], detail === 'mark' ? 2.2 : 1.9));
    }
    svg.appendChild(svgEl('circle', { cx, cy, r: rZodIn, fill: 'none', stroke: C.line, 'stroke-width': swMid }));

    if (detail !== 'mark') {
      // degree ticks
      const step = detail === 'full' ? 1 : 5;
      for (let d = 0; d < 360; d += step) {
        const len = d % 10 === 0 ? (rTickOut - rTickIn) : d % 5 === 0 ? (rTickOut - rTickIn) * 0.6 : (rTickOut - rTickIn) * 0.3;
        const [x0, y0] = pt(d, rTickOut), [x1, y1] = pt(d, rTickOut - len);
        svg.appendChild(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: d % 10 === 0 ? C.text2 : C.line, 'stroke-width': swThin }));
      }
      svg.appendChild(svgEl('circle', { cx, cy, r: rTickIn, fill: 'none', stroke: C.line, 'stroke-width': swThin }));
    }

    // houses
    if (detail !== 'mark') {
      svg.appendChild(svgEl('circle', { cx, cy, r: rHouseOut, fill: C.ring, stroke: C.line, 'stroke-width': swMid }));
      svg.appendChild(svgEl('circle', { cx, cy, r: rHouseIn, fill: C.face, stroke: C.line, 'stroke-width': swMid }));
    }
    chart.cusps.forEach((c, i) => {
      const isAngle = i % 3 === 0;
      if (detail === 'mark' && !isAngle) return;
      const [x0, y0] = pt(c, rHouseIn), [x1, y1] = pt(c, isAngle ? rZodIn : rTickIn);
      svg.appendChild(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: isAngle ? C.strong : C.line, 'stroke-width': isAngle ? swStrong : swThin }));
      if (detail !== 'mark') {
        const next = chart.cusps[(i + 1) % 12];
        const mid = c + norm(next - c) / 2;
        const [tx, ty] = pt(mid, (rHouseOut + rHouseIn) / 2);
        const t = svgEl('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: C.text2, 'font-family': "'JetBrains Mono', monospace", 'font-size': detail === 'full' ? size * 0.021 : size * 0.028 });
        t.textContent = ROMAN[i];
        svg.appendChild(t);
      }
      if (isAngle && detail === 'full') {
        const label = ['AC', 'IC', 'DC', 'MC'][i / 3];
        const [lx, ly] = pt(c, rZodIn + (rOuter - rZodIn) * 0.5);
        // angle marker: small arrow head on zodiac ring
        const t = svgEl('text', { x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: C.strong, 'font-family': "'JetBrains Mono', monospace", 'font-weight': 500, 'font-size': size * 0.02 });
        t.textContent = label;
        const bg = svgEl('rect', { x: lx - size * 0.022, y: ly - size * 0.013, width: size * 0.044, height: size * 0.026, rx: size * 0.006, fill: C.labelBg, stroke: C.strong, 'stroke-width': swThin });
        svg.appendChild(bg); svg.appendChild(t);
      }
    });

    // aspects (drawn first so planets sit on top)
    const asp = aspects(chart.planets);
    const lonOf = id => chart.planets.find(p => p.id === id).lon;
    const gA = svgEl('g', { class: 'wheel-aspects' });
    asp.forEach(a => {
      if (a.id === 'conj') return;
      const [x0, y0] = pt(lonOf(a.a), rAspect), [x1, y1] = pt(lonOf(a.b), rAspect);
      const color = a.kind === 'tense' ? C.tense : a.kind === 'harm' ? C.harm : C.neu;
      const line = svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: color, 'stroke-width': a.orbActual < 2 ? swStrong : swMid, 'stroke-opacity': a.orbActual < 2 ? 0.9 : 0.55 });
      if (opts.animate) { const len = Math.hypot(x1 - x0, y1 - y0); line.setAttribute('stroke-dasharray', len); line.setAttribute('stroke-dashoffset', len); line.style.animation = `wheel-draw .9s cubic-bezier(.2,.7,.2,1) ${0.25 + Math.random() * .5}s forwards`; }
      gA.appendChild(line);
    });
    svg.appendChild(gA);

    // planets with collision avoidance
    const minSep = detail === 'full' ? 8 : detail === 'compact' ? 10 : 12;
    const sorted = chart.planets.map(p => ({ ...p, disp: norm(p.lon) })).sort((a, b) => norm(a.lon - asc) - norm(b.lon - asc));
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        const gap = norm(cur.disp - prev.disp);
        if (gap < minSep) { const push = (minSep - gap) / 2; prev.disp = norm(prev.disp - push); cur.disp = norm(cur.disp + push); }
      }
    }
    // degree labels: alternate two radii inside clusters so they never collide
    sorted.forEach((p, i) => { const prev = sorted[i - 1]; p.lvl = prev && norm(p.disp - prev.disp) < 14 ? (prev.lvl + 1) % 2 : 0; });
    const gP = svgEl('g', { class: 'wheel-planets' });
    sorted.forEach(p => {
      const isSun = p.id === 'sun';
      const isHl = opts.highlight === p.id;
      const color = isSun || isHl ? C.astro : C.glyph;
      const [ax, ay] = pt(p.lon, rTickIn);      // actual position on the ring
      if (detail === 'mark') {                   // mark: dots on the ring, Sun in apricot
        svg.appendChild(svgEl('circle', { cx: ax, cy: ay, r: isSun ? size * 0.028 : size * 0.014, fill: isSun ? C.astro : C.glyph }));
        return;
      }
      const [gx, gy] = pt(p.disp, rPlanet);     // glyph position
      const [px, py] = pt(p.disp, rPlanet + (detail === 'full' ? size * 0.04 : size * 0.05));
      svg.appendChild(svgEl('line', { x1: ax, y1: ay, x2: px, y2: py, stroke: isSun || isHl ? C.astro : C.line, 'stroke-width': swThin }));
      svg.appendChild(svgEl('circle', { cx: ax, cy: ay, r: Math.max(1.5, size * 0.006), fill: isSun || isHl ? C.astro : C.glyph }));
      const gs = detail === 'full' ? size * 0.045 : size * 0.06;
      if (isHl || isSun) gP.appendChild(svgEl('circle', { cx: gx, cy: gy, r: gs * 0.9, fill: v('--astro-soft') }));
      gP.appendChild(glyph(PLANET_PATHS[p.id], gs, gx, gy, color, isSun ? 2 : 1.9));
      if (detail === 'full') {
        const [tx, ty] = pt(p.disp, rPlanet - R * (0.085 + p.lvl * 0.055));
        const t = svgEl('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: isSun || isHl ? C.astro : C.text2, 'font-family': "'JetBrains Mono', monospace", 'font-size': size * 0.018 });
        t.textContent = fmtDeg(p.lon) + (p.retro ? ' R' : '');
        gP.appendChild(t);
      }
    });
    svg.appendChild(gP);

    container.innerHTML = '';
    container.appendChild(svg);
    return svg;
  }

  // ---------- positions table ----------
  function positionsTable(chart, opts = {}) {
    const rows = [...chart.planets.map(p => ({ ...p, kind: 'planet' })), { id: 'asc', lon: chart.cusps[0], kind: 'angle' }, { id: 'mc', lon: chart.cusps[9], kind: 'angle' }];
    const tr = rows.map(p => {
      const s = signOf(p.lon), el = elementOf(p.lon);
      const hl = opts.highlight === p.id ? ' is-hl' : '';
      const g = p.kind === 'planet' ? inlineGlyph(PLANET_PATHS[p.id]) : `<span class="mono" style="font-size:13px;width:18px;display:inline-block;text-align:center">${p.id === 'asc' ? 'AC' : 'MC'}</span>`;
      return `<tr class="${el}${hl} ${p.id}">
        <td><span class="pl">${g}${PLANET_NAMES[p.id]}</span></td>
        <td><span class="sg">${inlineGlyph(SIGN_PATHS[s])}${SIGNS[s]}</span></td>
        <td class="mono">${fmtDeg(p.lon)}</td>
        <td class="mono num">${p.kind === 'angle' ? (p.id === 'asc' ? '1' : '10') : houseOf(p.lon, chart.cusps)}</td>
        <td class="num">${p.retro ? '<span class="r">R</span>' : ''}</td>
      </tr>`;
    }).join('');
    return `<table class="positions"><thead><tr><th>Планета</th><th>Знак</th><th>Градус</th><th class="num">Дім</th><th class="num">R</th></tr></thead><tbody>${tr}</tbody></table>`;
  }

  // ---------- aspect grid ----------
  function aspectGrid(chart) {
    const ids = chart.planets.map(p => p.id);
    const asp = aspects(chart.planets);
    const find = (a, b) => asp.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    let html = '<table class="aspects" aria-label="Сітка аспектів">';
    for (let i = 1; i < ids.length; i++) {
      html += '<tr>';
      html += `<th title="${PLANET_NAMES[ids[i]]}">${inlineGlyph(PLANET_PATHS[ids[i]])}</th>`;
      for (let j = 0; j < i; j++) {
        const a = find(ids[i], ids[j]);
        html += a ? `<td class="${a.kind}" title="${PLANET_NAMES[ids[i]]} — ${PLANET_NAMES[ids[j]]}">${inlineGlyph(ASPECT_PATHS[a.id])}</td>` : '<td></td>';
      }
      html += '</tr>';
    }
    html += '<tr><th></th>' + ids.slice(0, -1).map(id => `<th title="${PLANET_NAMES[id]}">${inlineGlyph(PLANET_PATHS[id])}</th>`).join('') + '</tr>';
    return html + '</table>';
  }

  // ---------- badge «Сонце у Тельці» ----------
  function badge(planetId, lon, opts = {}) {
    const s = signOf(lon), el = elementOf(lon);
    const label = opts.label || `${PLANET_NAMES[planetId]} у ${SIGNS_LOC[s]}`;
    const deg = opts.deg ? `<span class="deg">${fmtDeg(lon)}</span>` : '';
    const pg = PLANET_PATHS[planetId] ? `<span class="glyph${planetId === 'sun' ? ' astro' : ''}">${inlineGlyph(PLANET_PATHS[planetId])}</span>` : '';
    return `<span class="badge ${el}${opts.astro ? ' astro' : ''}">${pg}<span class="sign">${inlineGlyph(SIGN_PATHS[s])}</span>${label}${deg}</span>`;
  }

  // ---------- logo mark: tiny wheel ----------
  function logoMark() {
    return `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="14" cy="14" r="8.5" stroke="currentColor" stroke-width="1.2"/>
      <path d="M1 14H27M14 1V27" stroke="currentColor" stroke-width="1.2"/>
      <path d="M7 19.5 L20 8 M8 8 L19.5 19.5" stroke="currentColor" stroke-width="1.2" opacity=".5"/>
      <circle cx="18.5" cy="9.5" r="2.3" fill="var(--astro)"/>
    </svg>`;
  }

  // ---------- theme toggle + auto-init ----------
  function initTheme() {
    const q = new URLSearchParams(location.search);
    if (q.get('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  }
  function mount(el) {
    const o = el.dataset;
    wheel(el, { size: +o.wheel || 480, detail: o.detail, animate: o.animate === 'true', highlight: o.highlight, responsive: o.responsive === 'true' });
  }
  function autoInit() {
    initTheme();
    document.querySelectorAll('[data-wheel]').forEach(mount);
    document.querySelectorAll('[data-positions]').forEach(el => el.innerHTML = positionsTable(SAMPLE, { highlight: el.dataset.highlight }));
    document.querySelectorAll('[data-aspects]').forEach(el => el.innerHTML = aspectGrid(SAMPLE));
    document.querySelectorAll('[data-badge]').forEach(el => { const p = SAMPLE.planets.find(x => x.id === el.dataset.badge) || { lon: el.dataset.badge === 'asc' ? SAMPLE.cusps[0] : 0 }; el.outerHTML = badge(el.dataset.badge, p.lon, { deg: el.dataset.deg === 'true', astro: el.dataset.astro === 'true' }); });
    document.querySelectorAll('[data-logo]').forEach(el => el.innerHTML = logoMark());
    document.querySelectorAll('[data-glyph]').forEach(el => el.innerHTML = inlineGlyph(PLANET_PATHS[el.dataset.glyph] || SIGN_PATHS[+el.dataset.glyph] || ASPECT_PATHS[el.dataset.glyph]));
  }
  document.addEventListener('DOMContentLoaded', autoInit);

  return { wheel, positionsTable, aspectGrid, badge, logoMark, SAMPLE, SIGNS, SIGNS_LOC, SIGN_PATHS, PLANET_PATHS, ASPECT_PATHS, PLANET_NAMES, ELEMENT_NAME, fmtDeg, signOf, elementOf, houseOf, aspects, inlineGlyph };
})();
