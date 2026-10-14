/* Trading Journal — UI. Rutas por hash: #/ (portada), #/resumen, #/registros, #/registrar, #/simulador, #/ajustes */
(function (TJ) {
  const { T, ACCOUNTS, calc, sim, store, fmt } = TJ;
  const $ = fmt.usd, $s = fmt.usdS, pc = fmt.pct;
  const SCREENS = ['resumen', 'registros', 'registrar', 'simulador', 'ajustes', 'feedback']; // feedback: session feedback (not in the nav)
  const MOB = 760;
  const EASE = 'cubic-bezier(.16,1,.3,1)';

  const blankForm = () => ({ date: TJ.today(), dir: 'gan', beSign: '+', amt: '', tk: 'NQ', pma: '', pmaImgs: [], plan: 'y', notes: '', entryImgs: [] });
  const MAX_IMGS = 4;
  // Images of a record by section. Records saved before sections existed kept one chart in `img`: it belongs to the Pre Market Analysis.
  const imgsOf = e => ({ pma: e.pmaImgs || (e.img ? [e.img] : []), entry: e.entryImgs || [] });
  const idsOf = e => { const i = imgsOf(e); return i.pma.concat(i.entry).filter(TJ.images.isId); };
  // <img> source for a stored image: ids load from IndexedDB (src filled once loaded, see hydrateImages);
  // legacy base64 data URLs still render directly until they are migrated.
  const imgSrc = ref => { if (!TJ.images.isId(ref)) return `src="${ref}"`; const u = TJ.images.url(ref); return (u ? `src="${u}" ` : '') + `data-img-id="${ref}"`; };
  const hasDetail = e => { const i = imgsOf(e); return !!(i.pma.length || i.entry.length || e.pma || e.notes); };
  // Signed P&L from the form: Ganancia +, Pérdida −, Break even uses its own +/− toggle.
  const signedAmt = F => { const a = parseFloat(F.amt) || 0; return F.dir === 'gan' ? a : F.dir === 'per' ? -a : (F.beSign === '-' ? -a : a); };
  const navLang = (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';

  const st = {
    acc: 'Backtest',
    lang: ['es', 'en'].includes(store.pref('lang')) ? store.pref('lang') : navLang,
    theme: store.pref('theme') === 'light' ? 'light' : 'dark',
    cal: null, seed: 1, hz: 60, toast: '', formErr: '', pasteMsg: '', pendingDel: null, editing: null, editDate: null, viewImg: null, zoom: null, bkMsg: null,
    accounts: store.loadAccounts(), entries: store.loadEntries(), rules: store.loadRules(), form: blankForm()
  };
  // Every sub-account needs its own entries list and rules. Rules saved before account types existed
  // get a type (Demo → Evaluación, others → Backtest) and the Topstep fields; their values stay as they were.
  ACCOUNTS.forEach(a => st.accounts.subs[a].forEach(s => {
    if (!st.entries[s.id]) st.entries[s.id] = [];
    st.rules[s.id] = st.rules[s.id] ? TJ.completeRule(st.rules[s.id], a) : TJ.defaultRule(a);
  }));

  const root = document.getElementById('app');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastKey = '', mob = innerWidth < MOB, delTimer, lastPick = null;

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const screen = () => { const h = location.hash.replace(/^#\/?/, ''); return SCREENS.includes(h) ? h : 'login'; };
  const t = () => T[st.lang];
  const dd = s => { const d = new Date(s + 'T12:00:00'), tt = t(); return st.lang === 'en' ? tt.dw[d.getDay()] + ' ' + tt.ms[d.getMonth()] + ' ' + d.getDate() : tt.dw[d.getDay()] + ' ' + d.getDate() + ' ' + tt.ms[d.getMonth()]; };
  const OC = { win: 'var(--gain)', loss: 'var(--loss)', be: 'var(--muted)' };
  // Ticker colors from the MVP design (Records table).
  const TKC = { NQ: '#0091BA', ES: '#C4162E', YM: '#13A3D7' };
  const col = (p, be) => OC[TJ.outcome(p, be)];
  const outLabel = (p, be) => { const tt = t(); return { win: tt.oWin, loss: tt.oLoss, be: tt.oBE }[TJ.outcome(p, be)]; };
  const arrow = n => n > 0 ? '▲' : n < 0 ? '▼' : '■';
  // Cushion to the trailing floor: green above $1,250, red (alert: close to losing the account) below $750,
  // neutral in between. Thresholds scale with the drawdown limit (62.5% / 37.5% of it = $1,250 / $750 on $2,000).
  const cushColor = (cush, mll) => cush > mll * 0.625 ? 'var(--gain)' : cush < mll * 0.375 ? 'var(--loss)' : 'var(--text)';
  const svg = (d, s) => `<svg width="${s || 18}" height="${s || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="${d}"></path></svg>`;
  const ARW = '<svg class="arw" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M5 12h14 M12 5l7 7-7 7"></path></svg>';
  // Active sub-account of an account type (Backtest / Demo / Live).
  const sid = type => st.accounts.active[type || st.acc];
  const subOf = type => st.accounts.subs[type || st.acc].find(s => s.id === sid(type));
  // "Backtest 1" stays as is; "Octubre" becomes "Backtest · Octubre".
  const accLabel = () => { const n = subOf().name; return n.toLowerCase().startsWith(st.acc.toLowerCase()) ? n : st.acc + ' · ' + n; };
  const list = () => st.entries[sid()];
  const rules = () => st.rules[sid()];
  let settled = false;
  const rv = d => settled ? 'data-rv="in"' : `data-rv style="--d:${d || 0}s"`;
  const anim = (name, dur, delay) => `animation:${name} ${dur}s ${delay}s ${EASE} backwards`;

  const NAV = [
    ['resumen', 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z'],
    ['registros', 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01'],
    ['registrar', 'M12 5v14 M5 12h14'],
    ['simulador', 'M22 12h-4l-3 9L9 3l-3 9H2'],
    ['ajustes', 'M21 4h-7 M10 4H3 M21 12h-9 M8 12H3 M21 20h-5 M12 20H3 M14 2v4 M8 10v4 M16 18v4']];
  const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4';
  const MOON = 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z';

  // ---------- shared bits ----------
  const langSw = thin => `<div class="langsw${thin ? ' thin' : ''}">${['es', 'en'].map(l => `<button data-action="lang" data-arg="${l}" aria-label="${l === 'es' ? 'Español' : 'English'}" class="${st.lang === l ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>`;
  // Ticker options carry their own underline color (NQ/ES/YM).
  // Underline color per option: ticker colors; Profit/Yes green, Loss/No red, Break even gray.
  const SEGC = { 'form-tk': TKC, 'form-dir': { gan: 'var(--gain)', per: 'var(--loss)', be: 'color-mix(in srgb, var(--text) 70%, var(--bg))' }, 'form-plan': { y: 'var(--gain)', n: 'var(--loss)' } };
  const seg = (opts, cur, action, cls) => `<div class="seg${cls ? ' ' + cls : ''}${action === 'form-tk' ? ' tk' : ''}" style="grid-template-columns:repeat(${opts.length},${cls === 'hz' ? 'auto' : '1fr'})">${opts.map(([v, l]) => `<button data-action="${action}" data-arg="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}"${SEGC[action] && SEGC[action][v] ? ` style="--c:${SEGC[action][v]}"` : ''}>${esc(l)}</button>`).join('')}</div>`;

  // ---------- LOGIN ----------
  // Home page from the MVP design: trading-chart crosshair that follows the mouse (dashed lines, glowing
  // point and a price tag on the right edge), and the example curve "climb → get comfortable → break the
  // plan → floor". Single-user app → one "Entrar" button.
  function loginView() {
    const tt = t(), lp = tt.lp, a = (n, d) => `animation:fadeUp ${n}s ${d}s ${EASE} backwards`;
    const curve = 'M0 209C60 205 100 190 150 172S240 140 285 112S350 62 390 56';
    const fall = 'M390 56C430 50 455 130 495 200S555 285 585 305';
    return `<div class="lp" data-lproot>
      <div class="lp-cur glow" data-cur="glow"></div>
      <div class="lp-cur hline" data-cur="h"></div><div class="lp-cur vline" data-cur="v"></div>
      <div class="lp-cur pt" data-cur="pt"></div><div class="lp-cur tag mono" data-cur="tag"></div>
      <canvas class="lp-stars" data-stars aria-hidden="true"></canvas>
      <div class="lp-nebula" aria-hidden="true"></div>
      <div class="lp-orb a" aria-hidden="true"></div><div class="lp-orb b" aria-hidden="true"></div>
      <header class="lp-head">
        <div class="lp-brand" style="${a(.8, .05)}"><img src="assets/logo.png" alt="Funded Path" width="64" height="64" class="lp-logo-img"></div>
        <div class="lp-tools" style="${a(.8, .15)}"><span class="lp-status"><span class="lp-live"></span>${lp.status}</span>${langSw()}</div>
      </header>
      <main class="lp-main">
        <div class="lp-copy">
          <div class="lp-eyebrow" style="${a(.8, .2)}"><span class="lp-line"></span>${lp.eyebrow}<span class="lp-caret"></span></div>
          <h1><span class="mut" style="${a(.9, .3)}">${lp.h1a}</span><span class="acc" style="${a(.9, .42)}">${lp.h1b}</span></h1>
          <p style="${a(.8, .7)}">${lp.p}</p>
          <div class="lp-cta" style="${a(.8, .9)}"><button class="btn btn-primary lp-enter" data-action="enter">${tt.enter} ${ARW}</button><span class="lp-note">${lp.note}</span></div>
        </div>
        <div class="lp-viz" style="${a(1, .4)}">
          <svg class="lp-orbits" viewBox="0 0 100 100" aria-hidden="true">
            <g class="lp-spin slow"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width=".18" stroke-dasharray=".5 1.6"></circle><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-opacity=".1" stroke-width=".14"></circle><circle cx="98" cy="50" r=".45" fill="currentColor" fill-opacity=".5"></circle></g>
            <g class="lp-spin rev"><circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width=".14" stroke-dasharray="1 2.4"></circle><circle cx="50" cy="19" r=".5" fill="currentColor" fill-opacity=".45"></circle><circle cx="19" cy="50" r=".35" fill="currentColor" fill-opacity=".35"></circle></g>
          </svg>
          <svg viewBox="0 0 620 370" role="img" aria-label="${lp.alt}">
            <defs>
              <linearGradient id="lpW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--text)" stop-opacity=".16"></stop><stop offset="1" stop-color="var(--text)" stop-opacity="0"></stop></linearGradient>
              <linearGradient id="lpR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--loss)" stop-opacity=".24"></stop><stop offset="1" stop-color="var(--loss)" stop-opacity="0"></stop></linearGradient>
              <linearGradient id="lpM" gradientUnits="userSpaceOnUse" x1="390" y1="0" x2="480" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"></stop><stop offset="1" stop-color="#fff" stop-opacity="1"></stop></linearGradient>
              <mask id="lpMk" maskUnits="userSpaceOnUse" x="0" y="0" width="620" height="370"><rect width="620" height="370" fill="url(#lpM)"></rect></mask>
            </defs>
            <path d="M0 40H620" stroke="var(--text)" stroke-opacity=".35" stroke-width="1" stroke-dasharray="2 6" fill="none" style="animation:fadeIn 1s 1s backwards"></path>
            <path d="M0 209H620" stroke="var(--muted)" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 6" fill="none" style="animation:fadeIn 1s 1s backwards"></path>
            <path d="M0 322H620" stroke="var(--loss)" stroke-width="1.5" stroke-dasharray="3 7" fill="none" style="animation:fadeIn 1s 1s backwards"></path>
            <path d="${curve}${fall.replace('M390 56', '')}L585 322L0 322Z" fill="url(#lpW)" style="animation:fadeIn 1.6s 1.6s backwards"></path>
            <path d="${curve}${fall.replace('M390 56', '')}L585 322L0 322Z" fill="url(#lpR)" mask="url(#lpMk)" style="animation:fadeIn 1s 3.4s backwards"></path>
            <path d="${curve}" pathLength="1" class="lp-up" style="stroke-dasharray:1;animation:draw 2.4s .8s cubic-bezier(.3,.6,.2,1) both"></path>
            <path d="${fall}" pathLength="1" class="lp-down" style="stroke-dasharray:1;animation:draw 1.3s 3.2s cubic-bezier(.5,0,.8,.6) both"></path>
            <circle cx="0" cy="209" r="4" fill="var(--text)" style="animation:pop .4s .8s backwards"></circle>
            <circle cx="390" cy="56" r="5" fill="var(--bg)" stroke="var(--text)" stroke-width="2.5" style="animation:pop .5s 3.1s backwards"></circle>
            <path d="M585 311V322V334" stroke="var(--loss)" stroke-width="1.5" style="animation:fadeIn .5s 4.6s backwards"></path>
            <circle cx="585" cy="305" r="16" fill="var(--loss)" class="lp-pulse"></circle>
            <circle cx="585" cy="305" r="6" fill="var(--loss)" style="animation:pop .5s 4.4s backwards"></circle>
          </svg>
          <div class="lp-labels" aria-hidden="true">
            <div class="l tgt" style="animation:fadeIn 1s 1.2s backwards">${lp.tgt}</div>
            <div class="l st" style="animation:fadeIn 1s 1.2s backwards">${lp.stL}</div>
            <div class="l flr" style="animation:fadeIn 1s 1.2s backwards">${lp.flr}</div>
            <div class="l pk" style="animation:fadeUp .7s 3.2s ${EASE} backwards"><div class="a">${lp.pk1}</div><div class="b">${lp.pk2}</div></div>
            <div class="l dr" style="animation:fadeUp .7s 4s ${EASE} backwards"><div class="a">${lp.dr1}</div><div class="b">${lp.dr2}</div></div>
            <div class="l cv" style="animation:fadeUp .7s 4.7s ${EASE} backwards">${lp.cVal} ${lp.cSub}</div>
          </div>
          <p class="lp-cap" style="animation:fadeIn 1s 4.9s backwards">${lp.cap}</p>
        </div>
      </main>
    </div>`;
  }

  // Crosshair cursor on the home page (mouse only; off with reduced motion): the glow trails softly,
  // the dashed lines and glowing point follow exactly, and the tag on the right edge reads a price
  // for the cursor's height ($53,000 at the top → $47,000 at the bottom), like a chart's price axis.
  const fine = window.matchMedia('(pointer: fine)');
  const cur = { raf: 0 };
  window.addEventListener('mousemove', e => {
    cur.x = e.clientX; cur.y = e.clientY;
    if (cur.gx === undefined) { cur.gx = cur.x; cur.gy = cur.y; }
  }, { passive: true });
  document.addEventListener('mouseover', e => {
    const p = document.querySelector('[data-cur="pt"]');
    if (p) p.classList.toggle('big', !!(e.target.closest && e.target.closest('button,a,input,select,textarea,label')));
  });
  // Starry sky on the home page (design: Funded Path): twinkling stars with a slight mouse parallax,
  // two faint constellations and a shooting star every 6–11 s. Static with reduced motion.
  const sky = { raf: 0 };
  function drawStars(c, t) {
    const host = c.parentElement, w = host.clientWidth, h = host.clientHeight, d = Math.min(2, window.devicePixelRatio || 1), rm = reduced.matches, tt = t / 1000;
    if (!w || !h) return;
    if (c.__w !== w || c.__h !== h) {
      c.__w = w; c.__h = h; c.width = w * d; c.height = h * d;
      c.__s = Array.from({ length: Math.round(w * h / 4200) }, () => ({ x: Math.random(), y: Math.random(), r: 0.3 + Math.pow(Math.random(), 3) * 1.5, p: Math.random() * 6.28, v: 0.6 + Math.random() * 1.8, z: Math.random() }));
    }
    const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    const light = st.theme === 'light', ink = light ? '#0a0a0a' : '#fff', k0 = light ? 0.5 : 1;
    const mx = cur.x === undefined ? 0 : cur.x / innerWidth - 0.5, my = cur.y === undefined ? 0 : cur.y / innerHeight - 0.5;
    g.fillStyle = ink;
    c.__s.forEach(s => {
      const a = rm ? 0.7 : 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(tt * s.v + s.p)), x = s.x * w - mx * 30 * s.z, y = s.y * h - my * 30 * s.z;
      g.globalAlpha = a * (0.3 + s.z * 0.7) * k0; g.beginPath(); g.arc(x, y, s.r, 0, 6.283); g.fill();
      if (s.r > 1.3) { g.globalAlpha = a * 0.5 * k0; g.fillRect(x - s.r * 3, y - 0.3, s.r * 6, 0.6); g.fillRect(x - 0.3, y - s.r * 3, 0.6, s.r * 6); }
    });
    [[[.07, .22], [.105, .175], [.155, .2], [.19, .15]], [[.8, .84], [.845, .875], [.895, .845]]].forEach(cs => {
      const pts = cs.map(([a, b]) => [a * w - mx * 16, b * h - my * 16]);
      g.globalAlpha = light ? 0.1 : 0.14; g.strokeStyle = ink; g.lineWidth = 0.8;
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      pts.forEach(([x, y], i) => { g.globalAlpha = (rm ? 0.8 : 0.5 + 0.4 * Math.sin(tt * 1.3 + i * 1.7)) * k0; g.beginPath(); g.arc(x, y, 1.4, 0, 6.283); g.fill(); });
    });
    if (!rm) {
      if (!c.__sh && tt > (c.__nx || 3)) { c.__sh = { t0: tt, x: Math.random() * w * 0.6, y: Math.random() * h * 0.3, a: 0.45 + Math.random() * 0.3 }; c.__nx = tt + 6 + Math.random() * 5; }
      const sh = c.__sh;
      if (sh) {
        const k = (tt - sh.t0) / 1.1;
        if (k > 1) c.__sh = null;
        else {
          const L = 170, dx = Math.cos(sh.a), dy = Math.sin(sh.a), x = sh.x + k * 460 * dx, y = sh.y + k * 460 * dy, gr = g.createLinearGradient(x, y, x - dx * L, y - dy * L);
          const rgb = light ? '10,10,10' : '255,255,255';
          gr.addColorStop(0, 'rgba(' + rgb + ',' + (1 - k) + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
          g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - dx * L, y - dy * L); g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
  }
  function skyLoop() {
    const c = root.querySelector('canvas[data-stars]');
    if (!c) { cancelAnimationFrame(sky.raf); sky.raf = 0; return; }
    if (reduced.matches) { requestAnimationFrame(() => drawStars(c, 0)); return; }
    if (sky.raf) return;
    const tick = tm => { const cc = root.querySelector('canvas[data-stars]'); if (!cc) { sky.raf = 0; return; } drawStars(cc, tm); sky.raf = requestAnimationFrame(tick); };
    sky.raf = requestAnimationFrame(tick);
  }

  function cursorLoop() {
    const lpRoot = root.querySelector('[data-lproot]');
    const on = !!lpRoot && fine.matches && !reduced.matches;
    if (lpRoot) lpRoot.classList.toggle('crosshair', on); // hides the system cursor only while ours is drawn
    if (!on) { cancelAnimationFrame(cur.raf); cur.raf = 0; return; }
    if (cur.raf) return;
    const tick = () => {
      const r0 = root.querySelector('[data-lproot]');
      if (!r0) { cur.raf = 0; return; }
      cur.raf = requestAnimationFrame(tick);
      if (cur.x === undefined) return;
      cur.gx += (cur.x - cur.gx) * 0.1; cur.gy += (cur.y - cur.gy) * 0.1;
      const put = (k, tf) => { const el = r0.querySelector(`[data-cur="${k}"]`); if (el) { el.style.transform = tf; el.classList.add('on'); } };
      put('glow', `translate(${cur.gx}px,${cur.gy}px)`);
      put('h', `translateY(${cur.y}px)`); put('v', `translateX(${cur.x}px)`);
      put('pt', `translate(${cur.x}px,${cur.y}px)`); put('tag', `translateY(${cur.y}px)`);
      const tag = r0.querySelector('[data-cur="tag"]');
      if (tag) tag.textContent = '$' + Math.round(53000 - cur.y / innerHeight * 6000).toLocaleString('en-US');
    };
    cur.raf = requestAnimationFrame(tick);
  }

  // ---------- APP SHELL ----------
  function appView(scr) {
    const tt = t();
    const navBtns = NAV.map(([k], i) => `<button data-action="go" data-arg="${k}" class="${scr === k ? 'on' : ''}"${scr === k ? ' aria-current="page"' : ''}>${tt.navL[i]}</button>`).join('');
    const accts = ACCOUNTS.map(n => {
      const c = calc(st.entries[sid(n)], st.rules[sid(n)]);
      const cl = !!st.rules[sid(n)].closed, sx = cl ? tt.stClosed : c.lost ? tt.stLost : c.ok ? (c.mode === 'funded' ? tt.stPayout : tt.stOk) : tt.stRun;
      const dot = cl ? 'var(--muted)' : c.lost ? 'var(--loss)' : c.ok ? 'var(--ok)' : (c.n ? 'var(--accent)' : 'var(--rule)');
      return `<button data-action="acc" data-arg="${n}" class="${n === st.acc ? 'on' : ''}" aria-pressed="${n === st.acc}">
        <span class="nm lbl"><span class="sq8" style="background:${dot}"></span>${n}</span>
        <span class="bal">${$(c.bal)}</span>
        ${mob ? '' : `<span class="st">${esc(subOf(n).name)} · ${sx}</span>`}</button>`;
    }).join('');
    const body = { resumen: resumenView, registros: registrosView, registrar: registrarView, simulador: simView, ajustes: ajustesView, feedback: feedbackView }[scr]();
    return `<div class="shell">
      <header class="hdr${scrollY > 8 ? ' scrolled' : ''}" id="hdr">
        <div class="brand"><img src="assets/logo.png" alt="" width="34" height="34" class="brand-logo"><span>Funded Path</span></div>
        ${mob ? '<div style="flex:1"></div>' : `<nav class="topnav" aria-label="Principal">${navBtns}</nav>`}
        <div class="hdr-tools">
          ${langSw(true)}
          <button class="btn btn-secondary btn-icon" data-action="theme" aria-label="${tt.themeAria}" title="${tt.themeAria}">${svg(st.theme === 'dark' ? SUN : MOON)}</button>
          <button class="btn btn-secondary" data-action="logout">${tt.logout}</button>
        </div>
      </header>
      <div class="accts">${accts}</div>
      ${subsBar()}
      <div class="hline"></div>
      <main class="${settled ? 'settled' : ''}">
        ${st.toast ? `<div class="toast" role="status">${esc(st.toast)}</div>` : ''}
        ${body}
      </main>
      ${scr === 'registros' ? lightboxView() : ''}
      ${mob ? `<nav class="tabs" aria-label="Principal">${NAV.map(([k, d], i) => `<button data-action="go" data-arg="${k}" class="${scr === k ? 'on' : ''}">${svg(d, 20)}<span>${tt.navS[i]}</span></button>`).join('')}</nav>` : ''}
    </div>`;
  }

  // "Eliminar sesión" (Resumen and feedback screen): same two-click delete as the trash icon in the sessions bar.
  const delSessionBtn = () => {
    const tt = t(), pend = st.pendingDel === 'sub:' + sid();
    return `<button class="btn rowbtn delbtn${pend ? ' confirm' : ''}" data-action="sub-del">${pend ? tt.delSessionConfirm : tt.delSession}</button>`;
  };

  // ---------- SUB-ACCOUNTS BAR ----------
  const PENCIL = 'M17 3l4 4L7 21H3v-4z';
  const TRASH = 'M3 6h18 M8 6V3h8v3 M6 6l1 15h10l1-15';
  function subsBar() {
    const tt = t(), subs = st.accounts.subs[st.acc], cur = sid(), confirming = st.pendingDel === 'sub:' + cur;
    const chips = subs.map(s => st.editing === s.id
      ? `<input class="input subinput" data-subname="${esc(s.id)}" value="${esc(s.name)}" maxlength="40" aria-label="${tt.subRename}">`
      : `<button class="subchip${s.id === cur ? ' on' : ''}" data-action="sub" data-arg="${esc(s.id)}" role="tab" aria-selected="${s.id === cur}" title="${tt.subDblHint}">${esc(s.name)}<span class="mono">${(st.entries[s.id] || []).length}</span></button>`).join('');
    return `<div class="subs">
      <div class="subs-list" role="tablist" aria-label="${tt.subsAria} ${st.acc}">
        ${chips}
        <button class="subadd" data-action="sub-new">+ ${tt.subNew}</button>
      </div>
      <div class="subs-tools">
        <button class="btn btn-secondary btn-icon sm" data-action="sub-rename" aria-label="${tt.subRename}" title="${tt.subRename}">${svg(PENCIL, 16)}</button>
        ${confirming
          ? `<button class="btn delbtn confirm" data-action="sub-del" aria-label="${tt.delConfirm}">${tt.delConfirm}</button>`
          : `<button class="btn btn-secondary btn-icon sm" data-action="sub-del" aria-label="${tt.subDelete}" title="${tt.subDelete}">${svg(TRASH, 16)}</button>`}
      </div>
    </div>`;
  }

  // ---------- EQUITY CURVE ----------
  // Money in the chart follows the language (Intl), no decimals, explicit sign on P&L.
  const money = n => new Intl.NumberFormat(st.lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)).replace('-', '−');
  const moneyS = n => (Math.round(n) > 0 ? '+' : '') + money(n);
  const sd = s => { const d = new Date(s + 'T12:00:00'), tt = t(); return st.lang === 'en' ? tt.ms[d.getMonth()] + ' ' + d.getDate() : d.getDate() + ' ' + tt.ms[d.getMonth()]; };

  // Series for the active account: point 0 = starting balance the day before the first record,
  // then one point per day with its P&L, running balance and the floor at that day's close.
  function eqSeries() {
    const r = rules(), L = list(), S = calc(L, r);
    const d0 = L.length ? new Date(L[0].date + 'T12:00:00') : new Date();
    d0.setDate(d0.getDate() - 1);
    const pts = [{ date: TJ.isoDate(d0), start: true, pnl: 0, bal: S.size, floor: S.size - r.mll }]
      .concat(S.rows.map(x => ({ date: x.date, pnl: x.pnl, bal: x.bal, floor: x.floor })));
    let lostK = -1, okK = -1;
    pts.forEach((p, k) => {
      if (!k) return;
      if (lostK < 0 && p.bal <= p.floor) lostK = k;
      if (okK < 0 && p.bal - S.size >= S.target) okK = k;
    });
    return { pts, size: S.size, target: S.size + S.target, be: r.be, trailing: r.type === 'trailing', lostK, okK };
  }

  function equitySection(S, r, delay) {
    const tt = t(), c = S.net === 0 ? 'var(--text)' : col(S.net, 0);
    const pct = (S.net >= 0 ? '+' : '−') + Math.abs(S.net / S.size * 100).toFixed(2) + '%';
    return `<section ${rv(delay)} class="box pad">
      <div class="eq-top">
        <div>
          <h5>${tt.equityCurve}</h5>
          <div class="eq-head"><span class="eq-bal mono" data-v="${S.bal}">${money(S.bal)}</span><span class="eq-net mono" data-v="${S.net}" style="color:${c}">${arrow(S.net)} ${moneyS(S.net)}</span><span class="eq-pct mono muted">${pct}</span><span class="eq-when">${tt.eqNow}</span></div>
        </div>
        <div class="legend">
          <span><span style="width:16px;height:3px;background:var(--gain)"></span>${tt.equity}</span>
          <span><span style="width:16px;height:0;border-top:3px solid var(--loss)"></span>${r.type === 'trailing' ? tt.floor : tt.floorS}</span>
          <span><span style="width:16px;height:0;border-top:3px dashed var(--muted)"></span>${tt.target}</span>
        </div>
      </div>
      <div class="eqc" id="eqc" tabindex="0" role="group" aria-label="${tt.eqAria}"></div>
    </section>`;
  }

  // Monotone cubic path through [x, y] points (Fritsch–Carlson, like d3's curveMonotoneX):
  // smooth, but never overshoots — a flat stretch stays flat and no fake highs or lows appear.
  function smooth(P) {
    const f = v => v.toFixed(1), n = P.length;
    if (n < 3) return P.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('');
    const h = [], s = [];
    for (let i = 0; i < n - 1; i++) { h.push(P[i + 1][0] - P[i][0]); s.push((P[i + 1][1] - P[i][1]) / h[i]); }
    const m = [s[0]];
    for (let i = 1; i < n - 1; i++) {
      if (s[i - 1] * s[i] <= 0) m.push(0);
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m.push((w1 + w2) / (w1 / s[i - 1] + w2 / s[i])); }
    }
    m.push(s[n - 2]);
    let d = 'M' + f(P[0][0]) + ' ' + f(P[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const t = h[i] / 3;
      d += `C${f(P[i][0] + t)} ${f(P[i][1] + m[i] * t)} ${f(P[i + 1][0] - t)} ${f(P[i + 1][1] - m[i + 1] * t)} ${f(P[i + 1][0])} ${f(P[i + 1][1])}`;
    }
    return d;
  }

  let eqRO = null;
  // Drawn after render, at the container's real pixel width (no stretched viewBox).
  function drawEquity(animate) {
    const box = root.querySelector('#eqc');
    if (!box) return;
    const tt = t(), E = eqSeries(), pts = E.pts, n = pts.length;
    const W = Math.max(280, Math.round(box.clientWidth)), H = mob ? 230 : 320;
    const pad = { l: mob ? 50 : 62, r: 16, t: 30, b: 34 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    // Y domain = [min(floor, balance) − margin, max(target, balance) + margin].
    const vals = pts.flatMap(p => [p.bal, p.floor]).concat(E.target);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const m = (hi - lo) * 0.1 || 100; lo -= m; hi += m;
    const X = k => pad.l + (n > 1 ? k / (n - 1) : 0) * pw, Y = v => pad.t + (hi - v) / (hi - lo) * ph, f = v => v.toFixed(1);
    // Round Y ticks ($52,500…) and at most ~6 date labels.
    const raw = (hi - lo) / (mob ? 4 : 5), p10 = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(x => x * p10).find(s => s >= raw);
    const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const mX = Math.min(n, mob ? 4 : 6), xi = n === 1 ? [0] : [...new Set(Array.from({ length: mX }, (_, j) => Math.round(j * (n - 1) / (mX - 1))))];
    // Equity and floor share the same smooth monotone curve: follows every day without inventing peaks.
    const eqXY = pts.map((p, k) => [X(k), Y(p.bal)]);
    const flXY = n > 1 ? pts.map((p, k) => [X(k), Y(p.floor)]) : [[X(0), Y(pts[0].floor)], [W - pad.r, Y(pts[0].floor)]];
    const line = n > 1 ? smooth(eqXY) : '', floorP = smooth(flXY), base = H - pad.b;
    const area = n > 1 ? `${line}L${f(X(n - 1))} ${base}L${f(X(0))} ${base}Z` : '';
    const floorArea = `${floorP}L${f(flXY[flXY.length - 1][0])} ${base}L${f(flXY[0][0])} ${base}Z`;
    const dx = n > 1 ? pw / (n - 1) : pw;
    const dot = p => ({ win: 'var(--gain)', loss: 'var(--loss)', be: 'var(--muted)' })[TJ.outcome(p.pnl, E.be)];
    const A = (dur, delay) => animate ? `style="animation:${dur};animation-delay:${delay}s"` : '';
    // Only the target carries a label; it steps aside if the curve runs right under it.
    const tY = Y(E.target) - 8, tX0 = W - pad.r - (tt.target.length + 8) * 6.8;
    const showTarget = !pts.some((p, k) => k && X(k) >= tX0 - 8 && Math.abs(Y(p.bal) - (tY - 4)) < 12);
    let pointsSvg = '';
    if (n > 1) pts.forEach((p, k) => {
      if (!k) return;
      const x = X(k), y = Y(p.bal), last = k === n - 1, d = (0.3 + k * 0.9 / n).toFixed(2);
      if (k === E.lostK || k === E.okK) pointsSvg += `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="none" stroke="${k === E.lostK ? 'var(--loss)' : 'var(--gain)'}" stroke-width="1.5" ${A('pop .45s cubic-bezier(.2,.9,.3,1.4) both', d)}></circle>`;
      if (last) pointsSvg += `<circle class="eq-halo" cx="${f(x)}" cy="${f(y)}" r="12" fill="${dot(p)}"></circle>`;
      pointsSvg += `<circle class="eq-pt${last ? ' last' : ''}" data-k="${k}" cx="${f(x)}" cy="${f(y)}" r="${last ? 5 : 3}" fill="${dot(p)}" stroke="var(--bg)" stroke-width="${last ? 2 : 1.5}" ${A('pop .45s cubic-bezier(.2,.9,.3,1.4) both', d)}></circle>`;
    });
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gain)" stop-opacity=".22"></stop><stop offset="1" stop-color="var(--gain)" stop-opacity="0"></stop></linearGradient>
        <linearGradient id="flGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--loss)" stop-opacity=".10"></stop><stop offset="1" stop-color="var(--loss)" stop-opacity="0"></stop></linearGradient>
      </defs>
      ${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${f(Y(v))}" y2="${f(Y(v))}" class="eq-grid"></line><text class="eq-axis" x="${pad.l - 10}" y="${f(Y(v) + 4)}" text-anchor="end">${money(v)}</text>`).join('')}
      ${xi.map(k => `<text class="eq-axis" x="${f(X(k))}" y="${H - pad.b + 22}" text-anchor="${n === 1 ? 'start' : k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle'}">${k === 0 ? tt.start : sd(pts[k].date)}</text>`).join('')}
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${base}" y2="${base}" class="eq-frame"></line>
      <path d="${floorArea}" fill="url(#flGrad)" ${A('fadeIn 1s ease-out both', .4)}></path>
      ${area ? `<path d="${area}" fill="url(#eqGrad)" ${A('fadeIn 1s ease-out both', .5)}></path>` : ''}
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${f(Y(E.target))}" y2="${f(Y(E.target))}" class="eq-target"></line>
      <path d="${floorP}" class="eq-floor" ${animate ? 'pathLength="1" style="stroke-dasharray:1;animation:draw 1.2s ease-out both;animation-delay:.1s"' : ''}></path>
      ${n > 1 ? `<path d="${line}" class="eq-line" ${animate ? 'pathLength="1" style="stroke-dasharray:1;animation:draw 1.2s ease-out both;animation-delay:.2s"' : ''}></path>` : ''}
      ${showTarget ? `<text class="eq-ref muted" x="${W - pad.r}" y="${f(tY)}" text-anchor="end">${tt.target} ${money(E.target)}</text>` : ''}
      <line class="eq-guide" x1="0" x2="0" y1="${pad.t - 8}" y2="${base}"></line>
      ${pointsSvg}
    </svg>
    <div class="eq-tip" role="status" aria-live="polite"></div>`;
    box.__eq = { X, Y, pts, n, pad, W, dx, E };
    bindEquity(box);
    // Redraw at the new width when the container resizes (no animation).
    if (eqRO) eqRO.disconnect();
    if (window.ResizeObserver) {
      let w0 = box.clientWidth;
      eqRO = new ResizeObserver(() => { if (Math.abs(box.clientWidth - w0) > 2) { w0 = box.clientWidth; drawEquity(false); } });
      eqRO.observe(box);
    }
  }

  // Count-up from the MVP design: numbers marked data-count roll from $0 to their value (1.6s, ease-out)
  // when a screen opens. data-pre = arrow prefix, data-fmt="p" = percentage. Text already holds the final
  // value, so with reduced motion (or if frames are throttled) the correct number is always shown.
  function countUp() {
    if (reduced.matches) return;
    root.querySelectorAll('[data-count]').forEach(el => {
      const to = parseFloat(el.dataset.count);
      if (isNaN(to) || !to) return;
      const pre = el.dataset.pre, pct = el.dataset.fmt === 'p', sg = to < 0 ? '−' : '+', final = el.textContent;
      const fmt = v => pct ? sg + Math.abs(v).toFixed(2) + '%' : (pre ? pre + ' ' : '') + sg + '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
      const t0 = performance.now() + 150, D = 1600;
      el.textContent = fmt(0);
      const step = now => {
        const k = Math.max(0, Math.min(1, (now - t0) / D));
        el.textContent = k === 1 ? final : fmt(to * (1 - Math.pow(2, -10 * k)));
        if (k < 1) el.__raf = requestAnimationFrame(step);
      };
      el.__raf = requestAnimationFrame(step);
      setTimeout(() => { cancelAnimationFrame(el.__raf); el.textContent = final; }, D + 400);
    });
  }

  // Animate a number shown in `el` from its current value to `to` (~280ms, ease-out). Instant with reduced motion.
  function tween(el, to, fmt) {
    if (!el) return;
    // Start from the number currently on screen, so fast cursor moves count on smoothly.
    const from = el.__cur !== undefined ? el.__cur : el.dataset.v !== undefined ? Number(el.dataset.v) : to;
    const set = v => { el.__cur = v; el.textContent = fmt(v); };
    el.__v = to;
    cancelAnimationFrame(el.__raf); clearTimeout(el.__end);
    if (reduced.matches || from === to) return set(to);
    const t0 = performance.now(), dur = 280;
    const step = now => {
      const q = Math.min(1, (now - t0) / dur);
      set(from + (to - from) * (1 - Math.pow(1 - q, 3)));
      if (q < 1) el.__raf = requestAnimationFrame(step);
    };
    el.__raf = requestAnimationFrame(step);
    // If frames get throttled (background tab), still land exactly on the final value.
    el.__end = setTimeout(() => { if (el.__v === to) { cancelAnimationFrame(el.__raf); set(to); } }, dur + 60);
  }

  // Tooltip + vertical guide: mouse/touch over the chart, or ← → / Home / End with keyboard focus.
  function bindEquity(box) {
    const show = k => {
      const g = box.__eq; if (!g || g.n < 2) return;
      k = Math.max(1, Math.min(g.n - 1, k)); box.__k = k;
      const tt = t(), p = g.pts[k], x = g.X(k), left = g.E.target - p.bal;
      const cum = p.bal - g.E.size; // running P&L from the start up to this day
      const guide = box.querySelector('.eq-guide'), tip = box.querySelector('.eq-tip');
      guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.classList.add('on');
      box.querySelectorAll('.eq-pt.on').forEach(el => el.classList.remove('on'));
      const pt = box.querySelector(`.eq-pt[data-k="${k}"]`); if (pt) pt.classList.add('on');
      tip.innerHTML = `<div class="lbl">${dd(p.date)}</div>
        <div class="eq-tip-row eq-tip-cum"><span>P&amp;L</span><b style="color:${cum === 0 ? 'inherit' : col(cum, 0)}">${moneyS(cum)}</b></div>
        <div class="eq-tip-row"><span>${tt.balance}</span><b>${money(p.bal)}</b></div>
        <div class="eq-tip-row"><span>${tt.tipTarget}</span><b style="color:${left <= 0 ? 'var(--gain)' : 'inherit'}">${left <= 0 ? tt.reached : money(left)}</b></div>`;
      tip.classList.add('on');
      const tw = tip.offsetWidth;
      tip.style.left = (x + 14 + tw > g.W ? x - 14 - tw : x + 14) + 'px';
      tip.style.top = g.pad.t + 'px';
      headAt(k, tt.eqAt(dd(p.date)));
    };
    const hide = () => {
      box.__k = null;
      box.querySelectorAll('.eq-guide.on, .eq-tip.on, .eq-pt.on').forEach(el => el.classList.remove('on'));
      const g = box.__eq; if (g) headAt(g.n - 1, t().eqNow);
    };
    // Big header follows the cursor: balance and cumulative P&L count up/down to the hovered day.
    const headAt = (k, when) => {
      const g = box.__eq, h = box.closest('section') && box.closest('section').querySelector('.eq-head');
      if (!g || !h) return;
      const p = g.pts[k], cum = p.bal - g.E.size;
      tween(h.querySelector('.eq-bal'), p.bal, v => money(v));
      const net = h.querySelector('.eq-net');
      net.style.color = cum === 0 ? 'var(--text)' : col(cum, 0);
      tween(net, cum, v => arrow(Math.round(v)) + ' ' + moneyS(v));
      h.querySelector('.eq-pct').textContent = (cum >= 0 ? '+' : '−') + Math.abs(cum / g.E.size * 100).toFixed(2) + '%';
      h.querySelector('.eq-when').textContent = when;
    };
    if (box.__bound) return;
    box.__bound = true;
    box.addEventListener('pointermove', e => {
      const g = box.__eq; if (!g || g.n < 2) return;
      const r = box.getBoundingClientRect();
      show(Math.round((e.clientX - r.left - g.pad.l) / g.dx));
    });
    box.addEventListener('pointerleave', () => { if (document.activeElement !== box) hide(); });
    box.addEventListener('focus', () => { const g = box.__eq; if (g && g.n > 1) show(g.n - 1); });
    box.addEventListener('blur', hide);
    box.addEventListener('keydown', e => {
      const g = box.__eq; if (!g || g.n < 2) return;
      const k = box.__k || g.n - 1;
      const nk = { ArrowLeft: k - 1, ArrowRight: k + 1, Home: 1, End: g.n - 1 }[e.key];
      if (nk !== undefined) { e.preventDefault(); show(nk); }
      else if (e.key === 'Escape') hide();
    });
  }

  // ---------- RESUMEN ----------
  function resumenView() {
    const tt = t(), r = rules(), L = list(), S = calc(L, r), be = r.be, mode = S.mode, fund = mode === 'funded';
    const closed = !!r.closed;
    const status = closed ? tt.stClosed : S.lost ? tt.stLost : S.ok ? (fund ? tt.stPayout : tt.stOk) : tt.stRun;
    // Status badge [background, text, border, dot]: closed = muted outline, lost = red, passed = green, running = outline + green dot.
    const stC = closed ? ['transparent', 'var(--muted)', 'var(--muted)', 'var(--muted)'] : S.lost ? ['var(--loss)', 'var(--bg)', 'var(--loss)', 'var(--bg)']
      : S.ok ? ['var(--ok)', 'var(--bg)', 'var(--ok)', 'var(--bg)'] : ['transparent', 'var(--text)', 'var(--text)', 'var(--ok)'];
    const stNote = closed ? tt.stnClosed(dd(r.closed)) : S.lost ? tt.stnLost : S.ok ? (fund ? tt.stnPayout : tt.stnOk)
      : mode === 'eval' && S.hit ? (S.n < r.minDays ? tt.stnMinDays : tt.stnMaxDay) : tt.stnRun(S.n);
    const closing = st.pendingDel === 'close:' + sid();
    const cushPct = Math.max(0, Math.min(1, S.cush / r.mll));
    const cushC = cushColor(S.cush, r.mll);
    const prog = Math.max(0, Math.min(1, S.net / S.target));
    const netColor = S.net === 0 ? 'var(--text)' : col(S.net, 0);
    const netPct = (S.net >= 0 ? '+' : '−') + Math.abs(S.net / S.size * 100).toFixed(2) + '%';
    // Funded accounts track the payout instead of a profit target.
    const bar1 = fund
      ? { label: tt.barPayout + ' ' + $(r.pay), pct: Math.min(S.payN, r.payDays) + '/' + r.payDays, w: Math.min(1, S.payN / r.payDays) * 100, c: 'var(--gain)', a: S.payN + ' ' + tt.daysL, b: r.payDays + ' ' + tt.daysL }
      : { label: tt.barTarget + ' +' + r.pct + '% · ' + $(S.target), pct: pc(prog * 100, 1), w: prog * 100, c: 'var(--gain)', a: $s(S.net), b: $(S.target) };
    const bars = [bar1,
      { label: tt.barCush, pct: pc(cushPct * 100, 0), w: cushPct * 100, c: cushC, a: $(S.cush) + ' ' + tt.free, b: tt.floorW + ' ' + $(S.floor) }];
    // Topstep compliance (✓ met · ✕ broken · · pending) for Evaluación and Fondeada.
    const ck = (l, v, k) => ({ l, v, k });
    const ddCk = ck(tt.ckDD, $(S.cush) + ' ' + tt.free, S.lost ? -1 : 1);
    const checks = mode === 'eval'
      ? [ck(tt.target, $s(S.net) + ' / ' + $(S.target), S.hit ? 1 : 0), ck(tt.ckMinDays, S.n + ' / ' + r.minDays, S.n >= r.minDays ? 1 : 0), ck(tt.ckBest + ' ' + $(r.maxDay), $(S.best), S.best > r.maxDay ? -1 : 1), ddCk]
      : fund ? [ck(tt.ckPayDays + ' ' + $(r.pay), S.payN + ' / ' + r.payDays, S.payN >= r.payDays ? 1 : 0), ddCk] : [];

    let html = `
    <section ${rv(0)} class="gridrule hero">
      <div class="cell">
        <div class="lbl">${tt.netPL} · ${esc(accLabel())}</div>
        <div class="big${S.net > 0 ? ' glow' : ''}" style="color:${netColor}" data-count="${S.net}" data-pre="${arrow(S.net)}">${arrow(S.net)} ${$s(S.net)}</div>
        ${fund && !S.size ? `<div class="mono muted" style="font-size:14px;margin-top:6px">${tt.fundNote}</div>`
          : `<div class="mono muted" style="font-size:14px;margin-top:6px"><span data-count="${S.net / S.size * 100}" data-fmt="p">${netPct}</span> ${tt.over} ${$(S.size)}</div>`}
      </div>
      <div class="cell">
        <div class="lbl">${tt.lastDay}</div>
        <div class="mono" style="font-weight:600;font-size:28px;margin-top:8px;color:${S.last ? col(S.last.pnl, 0) : 'var(--muted)'}"${S.last ? ` data-count="${S.last.pnl}" data-pre="${arrow(S.last.pnl)}"` : ''}>${S.last ? arrow(S.last.pnl) + ' ' + $s(S.last.pnl) : '—'}</div>
        <div class="muted" style="font-size:13px;margin-top:6px">${S.last ? dd(S.last.date) : tt.noRec}</div>
      </div>
      <div class="cell">
        <div class="lbl">${tt.accStatus}</div>
        <div class="chip" style="background:${stC[0]};color:${stC[1]};border-color:${stC[2]}"><span class="dot" style="background:${stC[3]}"></span>${status}</div>
        <div class="muted" style="font-size:13px;margin-top:8px">${stNote}</div>
        <div class="st-acts">
          ${closed ? `<button class="btn btn-primary" style="padding:8px 12px;font-size:13px" data-action="go" data-arg="feedback">${tt.viewFb}</button>` : ''}
          <button class="btn rowbtn closebtn${closing ? ' confirm' : ''}" data-action="close-acc">${closed ? tt.reopenAcc : closing ? tt.closeConfirm : tt.closeAcc}</button>
          ${delSessionBtn()}
        </div>
      </div>
    </section>
    <section ${rv(.09)} class="gridrule" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${bars.map(b => `<div class="cell">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap"><span class="lbl">${b.label}</span><span class="mono" style="font-size:14px;font-weight:600">${b.pct}</span></div>
        <div class="bar" style="margin:10px 0 8px" role="progressbar" aria-valuenow="${Math.round(b.w)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${b.w}%;background:${b.c}"></div></div>
        <div class="mono muted" style="display:flex;justify-content:space-between;font-size:13px"><span>${b.a}</span><span>${b.b}</span></div>
      </div>`).join('')}
    </section>
    ${checks.length ? `<section ${rv(.13)} class="box">
      <div class="panel-h lbl">${mode === 'eval' ? tt.ckTitleEval : tt.ckTitleFunded}</div>
      <div class="gridrule checks">${checks.map(c => `<div class="cell ck">
        <div><div class="muted" style="font-size:12px">${c.l}</div><div class="mono" style="font-size:18px;font-weight:600;margin-top:4px">${c.v}</div></div>
        <span class="ck-mark ${c.k === 1 ? 'ok' : c.k === -1 ? 'bad' : 'wait'}" aria-label="${c.k === 1 ? tt.ckOk : c.k === -1 ? tt.ckBad : tt.ckWait}">${c.k === 1 ? '✓' : c.k === -1 ? '✕' : '·'}</span>
      </div>`).join('')}</div>
    </section>` : ''}`;

    if (!S.n) {
      // Empty account: the chart still shows starting balance, target and floor.
      return html + equitySection(S, r, .18) + `<section ${rv(.27)} class="box empty">
        <h3 style="margin:0 0 8px">${tt.noRecIn} ${esc(accLabel())}</h3>
        <p>${tt.emptyTxt($(S.size), $(S.floor))}</p>
        <button class="btn btn-primary" style="padding:12px 18px" data-action="go" data-arg="registrar">${tt.firstDay}</button>
      </section>`;
    }

    html += equitySection(S, r, .27);

    // strip
    const strip = L.slice(-20);
    html += `
    <section ${rv(.36)} class="box pad">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <h5>${tt.lastN} 20 ${tt.recordsL}</h5><span class="muted" style="font-size:12px">${tt.stripLegend}</span>
      </div>
      <div class="strip">${strip.map((e, i) => `<div title="${esc(dd(e.date) + ' ' + $s(e.pnl))}" style="background:${({ win: 'var(--gain)', loss: 'var(--loss)', be: 'var(--rule)' })[TJ.outcome(e.pnl, be)]};animation-delay:${i * 28}ms"></div>`).join('')}</div>
    </section>`;

    // KPIs
    const kp = [
      [tt.kWin, pc(S.wr, 0), S.wins.length + ' ' + tt.wl[0] + ' · ' + S.loss.length + ' ' + tt.wl[1] + ' · ' + (S.n - S.wins.length - S.loss.length) + ' BE', 'var(--text)'],
      [tt.kPf, S.pf.toFixed(2), tt.kGP, S.pf >= 1 ? 'var(--gain)' : 'var(--loss)'],
      [tt.kExp, $s(S.exp), tt.kPerDay, col(S.exp, 0)],
      [tt.kAvgW, $s(S.avgW), tt.kWd, 'var(--gain)'],
      [tt.kAvgL, S.avgL ? '−' + $(S.avgL) : '$0', tt.kLd, 'var(--loss)'],
      [tt.kStreak, String(S.ms), tt.kMs, 'var(--text)'],
      [tt.kMdd, '−' + $(S.dd), tt.kPv, 'var(--loss)']];
    html += `
    <section ${rv(0)}>
      <h5 style="margin:0 0 8px">${tt.indicators}</h5>
      <div class="gridrule kpis">${kp.map(([l, v, sub, c], i) => `<div class="cell" style="animation-delay:${i * 100}ms">
        <div class="lbl">${l}</div><div class="mono" style="font-size:24px;font-weight:600;margin-top:6px;color:${c}">${v}</div><div class="muted" style="font-size:12px;margin-top:2px">${sub}</div></div>`).join('')}</div>
    </section>`;

    // breakdowns
    const grp = (title, keyFn, items) => {
      const rows = items.map(it => { const g = L.filter(e => keyFn(e) === it.id); const p = g.reduce((a, e) => a + e.pnl, 0); const w = g.filter(e => TJ.outcome(e.pnl, be) === 'win').length, l = g.filter(e => TJ.outcome(e.pnl, be) === 'loss').length; return { name: it.name, n: g.length, p, wr: w + l ? w / (w + l) * 100 : null }; });
      const mx = Math.max(1, ...rows.map(x => Math.abs(x.p)));
      return `<div class="cell">
        <h5 style="margin:0 0 4px">${title}</h5>
        <div class="grp-row grp-head"><span></span><span class="r">${tt.days}</span><span class="r">${tt.win}</span><span class="r">P&amp;L</span></div>
        ${rows.map(x => { const c = x.n ? col(x.p, 0) : 'var(--muted)'; return `<div class="grp-item">
          <div class="grp-row"><span style="font-weight:600;min-width:0">${x.name}</span><span class="r mono muted">${x.n}</span><span class="r mono muted">${x.wr === null ? '—' : pc(x.wr)}</span><span class="r mono" style="font-weight:600;color:${c}">${x.n ? $s(x.p) : '—'}</span></div>
          <div class="minibar"><div style="width:${Math.abs(x.p) / mx * 100}%;background:${c}"></div></div></div>`; }).join('')}
      </div>`;
    };
    html += `
    <section ${rv(.45)} class="gridrule" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${grp(tt.gDay, e => new Date(e.date + 'T12:00:00').getDay(), [1, 2, 3, 4, 5].map((id, i) => ({ id, name: tt.wdFull[i] })))}
      ${grp(tt.gDisc, e => e.plan ? 'y' : 'n', [{ id: 'y', name: tt.followed }, { id: 'n', name: tt.broke }])}
    </section>`;

    // calendar
    const lastD = new Date(S.last.date + 'T12:00:00');
    const cm = st.cal || { y: lastD.getFullYear(), m: lastD.getMonth() };
    const first = new Date(cm.y, cm.m, 1), lead = (first.getDay() + 6) % 7, nd = new Date(cm.y, cm.m + 1, 0).getDate();
    const byDate = {}; L.forEach(e => byDate[e.date] = e.pnl);
    const cells = []; for (let i = 0; i < lead; i++) cells.push({ day: '', v: '', bg: 'var(--surface)', c: '' });
    let mt = 0, md = 0;
    for (let d = 1; d <= nd; d++) {
      const k = cm.y + '-' + String(cm.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), p = byDate[k], wk = (lead + d - 1) % 7 > 4;
      if (p !== undefined) { mt += p; md++; }
      cells.push({ day: d, v: p === undefined ? '' : (p > 0 ? '+' : p < 0 ? '−' : '') + '$' + Math.abs(p).toLocaleString('en-US'), bg: p === undefined ? (wk ? 'var(--surface)' : 'var(--bg)') : ({ win: 'var(--gainBg)', loss: 'var(--lossBg)', be: 'var(--surface)' })[TJ.outcome(p, be)], c: p === undefined ? '' : col(p, be) });
    }
    while (cells.length % 7) cells.push({ day: '', v: '', bg: 'var(--surface)', c: '' });
    html += `
    <section ${rv(.54)} class="box pad">
      <div class="cal-top">
        <div class="cal-nav">
          <button class="btn btn-secondary btn-icon" data-action="cal" data-arg="-1" aria-label="${tt.prevMonth}">${svg('m15 18-6-6 6-6')}</button>
          <h5 aria-live="polite">${tt.mn[cm.m]} ${cm.y}</h5>
          <button class="btn btn-secondary btn-icon" data-action="cal" data-arg="1" aria-label="${tt.nextMonth}">${svg('m9 18 6-6-6-6')}</button>
        </div>
        <div class="mono" style="font-size:14px">${tt.month}: <strong style="color:${md ? col(mt, 0) : 'var(--muted)'}">${md ? $s(mt) : '—'}</strong> · ${md} ${tt.daysL}</div>
      </div>
      <div class="cal">
        ${tt.head.map(h => `<div class="hd">${h}</div>`).join('')}
        ${cells.map(c => `<div class="dc" style="background:${c.bg}"><span class="d">${c.day}</span><span class="v" style="color:${c.c}">${c.v}</span></div>`).join('')}
      </div>
    </section>`;
    return html + xlsRow();
  }

  // ---------- REGISTROS ----------
  function registrosView() {
    const tt = t(), r = rules(), S = calc(list(), r), be = r.be;
    let html = `<div class="pagehead">
      <div><h2>${tt.recordsTitle}</h2><div class="sub">${esc(accLabel())} · ${S.n} ${tt.daysL}. ${tt.rowNote}</div></div>
      <button class="btn btn-primary" style="padding:10px 16px" data-action="go" data-arg="registrar">${tt.logDay}</button>
    </div>`;
    if (!S.n) {
      return html + `<section ${rv(0)} class="box empty">
        <h3 style="margin:0 0 8px">${tt.noRecords}</h3>
        <p>${tt.emptyReg}</p>
        <div class="gridrule" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:20px">
          <div class="cell" style="padding:12px"><div class="lbl">${tt.balance}</div><div class="mono">${$(S.size)}</div></div>
          <div class="cell" style="padding:12px"><div class="lbl">${tt.floorS}</div><div class="mono">${$(S.floor)}</div></div>
          <div class="cell" style="padding:12px"><div class="lbl">${tt.target}</div><div class="mono">${$s(S.target)}</div></div>
        </div>
        <button class="btn btn-primary" style="padding:12px 18px" data-action="go" data-arg="registrar">${tt.firstDay}</button>
      </section>`;
    }
    const rows = S.rows.slice().reverse().map((x, i) => {
      const k = esc(x.date), pend = st.pendingDel === x.date;
      return {
        d: Math.min(i, 14) * 35, tk: esc(x.tk || 'NQ'), tkc: TKC[x.tk || 'NQ'] || 'var(--text)', tint: 'color-mix(in srgb,' + col(x.pnl, be) + ' 7%,transparent)', rules: x.plan ? tt.yes : tt.no, rc: x.plan ? 'var(--gain)' : 'var(--loss)',
        out: outLabel(x.pnl, be), date: dd(x.date), pnl: $s(x.pnl), c: col(x.pnl, be),
        thumb: thumbOf(x, k),
        acts: rules().closed ? `<span class="row-acts"><span class="ro-tag">${svg('M6 11V8a6 6 0 0 1 12 0v3 M5 11h14v10H5z', 13)}${tt.readOnly}</span></span>` : `<span class="row-acts">
          <button class="btn rowbtn" data-action="edit" data-arg="${k}" aria-label="${tt.editAria} ${dd(x.date)}">${tt.edit}</button>
          <button class="btn rowbtn delbtn${pend ? ' confirm' : ''}" data-action="del" data-arg="${k}" aria-label="${pend ? tt.delConfirm : tt.delAria + ' ' + dd(x.date)}">${pend ? tt.delConfirm : tt.del}</button>
        </span>`
      };
    });
    if (!mob) {
      html += `<section ${rv(.09)} class="box" role="table" aria-label="${tt.recordsTitle}">
        <div class="rec-grid rec-head lbl" role="row"><span></span><span role="columnheader">${tt.date}</span><span role="columnheader">${tt.tickerL}</span><span role="columnheader" class="r">P&amp;L</span><span role="columnheader">${tt.rulesF}</span><span role="columnheader">${tt.outcome}</span><span role="columnheader">${tt.chartCol}</span><span></span></div>
        ${rows.map(x => `<div class="rec-grid rec-row" role="row" style="animation-delay:${x.d}ms;background:${x.tint}">
          <span class="stripe" style="background:${x.c}"></span>
          <span class="body" role="cell">${x.date}</span>
          <span role="cell" style="font-weight:700;color:${x.tkc}">${x.tk}</span>
          <span role="cell" class="r" style="font-weight:600;color:${x.c}">${x.pnl}</span>
          <span role="cell" class="body" style="color:${x.rc}">${x.rules}</span>
          <span role="cell"><span class="badge" style="color:${x.c}">${x.out}</span></span>
          <span role="cell">${x.thumb}</span>
          <span role="cell" class="r">${x.acts}</span>
        </div>`).join('')}
      </section>`;
    } else {
      html += `<section ${rv(.18)} class="rec-cards">
        ${rows.map(x => `<div class="rec-card" style="animation-delay:${x.d}ms;background:${x.tint}">
          <span style="background:${x.c}"></span>
          <div class="in-c">
            <div class="top"><span style="font-weight:600">${x.date}</span><span class="mono" style="font-weight:600;font-size:18px;color:${x.c}">${x.pnl}</span></div>
            <div class="meta">
              <div><div class="ml">${tt.tickerL}</div><span class="mono" style="font-weight:700;color:${x.tkc}">${x.tk}</span></div>
              <div><div class="ml">${tt.rulesF}</div><span style="font-weight:600;color:${x.rc}">${x.rules}</span></div>
              <div><div class="ml">${tt.outcome}</div><span style="font-weight:800;color:${x.c}">${x.out}</span></div>
            </div>
            <div class="rec-card-foot">${x.thumb}${x.acts}</div>
          </div>
        </div>`).join('')}
      </section>`;
    }
    return html + xlsRow();
  }

  // Framed thumbnail for the Records table: first image (PMA first, then Entry) with a count badge.
  // Text-only days get a text tile so their analysis is still one click away; nothing at all → dashed frame.
  function thumbOf(x, k) {
    const tt = t(), i = imgsOf(x), all = i.pma.concat(i.entry), lbl = `${tt.viewChart} ${dd(x.date)}`;
    if (all.length) return `<button class="thumb" data-action="lb-open" data-arg="${k}" aria-label="${lbl}" title="${lbl}"><img ${imgSrc(all[0])} alt="" loading="lazy">${all.length > 1 ? `<span class="thumb-count mono">+${all.length - 1}</span>` : ''}<span class="thumb-zoom">${svg(ZOOM, 14)}</span></button>`;
    if (x.pma || x.notes) return `<button class="thumb textonly" data-action="lb-open" data-arg="${k}" aria-label="${lbl}" title="${lbl}"><span>Aa</span><span class="thumb-zoom">${svg(ZOOM, 14)}</span></button>`;
    return `<span class="thumb empty" title="${tt.noChart}" aria-label="${tt.noChart}">—</span>`;
  }

  // ---------- CHART LIGHTBOX ----------
  const ZOOM = 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7';
  const CLOSE = 'M18 6 6 18 M6 6l12 12';
  function lightboxView() {
    const e = st.viewImg && list().find(x => x.date === st.viewImg);
    if (!e || !hasDetail(e)) return '';
    const tt = t(), be = rules().be, c = col(e.pnl, be);
    const out = outLabel(e.pnl, be);
    // One section per part of the day: Pre Market Analysis, then Entry. Each shows its text first, then its images.
    const sec = (zone, label, text) => {
      const imgs = imgsOf(e)[zone];
      if (!imgs.length && !text) return '';
      return `<section class="lb-sec">
        <div class="lb-sec-h"><span class="sq8"></span><span class="lbl">${label}</span>${imgs.length ? `<span class="mono muted" style="font-size:12px">${tt.imgCount(imgs.length)}</span>` : ''}</div>
        ${text ? `<p class="lb-text">${esc(text)}</p>` : ''}
        ${imgs.length ? `<div class="lb-gallery${imgs.length > 1 ? ' multi' : ''}">${imgs.map((src, i) => `<figure class="lb-fig">
          <div class="lb-img"><img ${imgSrc(src)} alt="${label} · ${tt.imgN(i + 1, imgs.length)} · ${dd(e.date)}" data-action="lb-full" data-arg="${zone}:${i}"></div>
          <figcaption><span class="mono">${tt.imgN(i + 1, imgs.length)}</span>
            <button class="btn btn-secondary" style="padding:6px 12px;font-size:13px" data-action="lb-full" data-arg="${zone}:${i}">${tt.openFull} ${svg(ZOOM, 14)}</button></figcaption>
        </figure>`).join('')}</div>` : ''}
      </section>`;
    };
    return lightboxShell(e, tt, c, out, sec);
  }

  // In-page full-size viewer, stacked over the lightbox. Navigates across all images of the day.
  function zoomView() {
      const e = st.viewImg && list().find(x => x.date === st.viewImg), tt = t();
      if (!st.zoom || !e) return '';
      const i = imgsOf(e), all = [...i.pma.map((src, n) => ({ src, zone: 'pma', n, of: i.pma.length, label: 'Pre Market Analysis' })), ...i.entry.map((src, n) => ({ src, zone: 'entry', n, of: i.entry.length, label: tt.notes }))];
      const k = all.findIndex(x => x.zone === st.zoom.zone && x.n === st.zoom.i);
      if (k < 0) return '';
      const cur = all[k], nav = (d, icon, lbl) => `<button class="btn btn-secondary btn-icon" data-action="zoom-go" data-arg="${all[(k + d + all.length) % all.length].zone}:${all[(k + d + all.length) % all.length].n}" aria-label="${lbl}" title="${lbl}">${svg(icon)}</button>`;
      return `<div class="zv" role="dialog" aria-modal="true" aria-label="${cur.label} · ${tt.imgN(cur.n + 1, cur.of)}">
        <div class="zv-backdrop" data-action="zoom-close"></div>
        <figure class="zv-fig">
          <div class="zv-bar">
            <span class="sq8"></span><span class="lbl">${cur.label}</span><span class="mono muted" style="font-size:12px">${tt.imgN(cur.n + 1, cur.of)}</span>
            <span class="zv-tools">
              ${all.length > 1 ? nav(-1, 'm15 18-6-6 6-6', tt.prevImg) + nav(1, 'm9 18 6-6-6-6', tt.nextImg) : ''}
              <button class="btn btn-secondary btn-icon zv-x" data-action="zoom-close" aria-label="${tt.close}" title="${tt.close} (Esc)">${svg(CLOSE)}</button>
            </span>
          </div>
          <div class="zv-img"><img ${imgSrc(cur.src)} alt="${cur.label} · ${tt.imgN(cur.n + 1, cur.of)} · ${dd(e.date)}"></div>
        </figure>
      </div>`;
  }

  function lightboxShell(e, tt, c, out, sec) {
    return `<div class="lb" role="dialog" aria-modal="true" aria-labelledby="lb-title">
      <div class="lb-backdrop" data-action="lb-close"></div>
      <div class="lb-card">
        <div class="lb-head">
          <div style="min-width:0">
            <div class="lbl">${tt.chartCol} · ${esc(accLabel())}</div>
            <div class="lb-title" id="lb-title">${dd(e.date)} <span class="muted">·</span> <span class="mono">${esc(e.tk || 'NQ')}</span> <span class="muted">·</span> <span class="mono" style="color:${c}">${$s(e.pnl)}</span>
              <span class="badge" style="color:${c}">${out}</span></div>
          </div>
          <button class="btn btn-secondary btn-icon lb-x" data-action="lb-close" aria-label="${tt.close}" title="${tt.close} (Esc)">${svg(CLOSE)}</button>
        </div>
        ${sec('pma', 'Pre Market Analysis', e.pma)}
        ${sec('entry', tt.notes, e.notes)}
        <div class="lb-foot">
          ${rules().closed ? `<span class="ro-tag">${tt.readOnly}</span>` : `<button class="btn btn-primary" style="padding:8px 14px" data-action="edit" data-arg="${esc(e.date)}">${tt.editDay}</button>`}
        </div>
      </div>
      ${zoomView()}
    </div>`;
  }

  // ---------- REGISTRAR ----------
  function projView() {
    const tt = t(), r = rules(), F = st.form;
    const amt = parseFloat(F.amt) || 0, signed = signedAmt(F), has = amt || F.dir === 'be';
    const P = calc([...list().filter(e => e.date !== F.date && e.date !== st.editDate), { date: F.date, pnl: signed }].sort((a, b) => a.date < b.date ? -1 : 1), r);
    const proj = [
      { l: tt.dayPL, v: has ? $s(signed) : '—', c: has ? col(signed, 0) : 'var(--muted)' },
      // How the day will be classified with the account's break-even band.
      { l: tt.outcome, v: has ? outLabel(signed, r.be) : '—', c: has ? col(signed, r.be) : 'var(--muted)' },
      { l: tt.balance, v: $(P.bal), c: 'var(--text)' },
      { l: tt.floor, v: $(P.floor), c: 'var(--muted)' },
      { l: tt.cushion, v: $(P.cush), c: cushColor(P.cush, r.mll) },
      { l: tt.progTarget, v: pc(Math.max(0, P.net) / P.target * 100, 1), c: 'var(--text)' }];
    return `<div class="panel-h lbl">${tt.afterRec}</div>
      ${proj.map(p => `<div class="kv"><span style="font-size:14px">${p.l}</span><span class="mono" style="font-weight:600;font-size:18px;color:${p.c}">${p.v}</span></div>`).join('')}`;
  }

  // Image strip under a text field: framed tiles with remove button, plus a paste tile while under the limit.
  function imgZone(zone, label) {
    const tt = t(), imgs = st.form[zone + 'Imgs'], msg = st.pasteMsg && st.pasteMsg.zone === zone ? st.pasteMsg.msg : '';
    return `<div class="imgzone">
      <div class="imgzone-h"><span>${tt.imgsOf(label)}</span><span class="mono muted">${imgs.length}/${MAX_IMGS}</span></div>
      <div class="imgzone-grid">
        ${imgs.map((src, i) => `<figure class="imgtile">
          <img ${imgSrc(src)} alt="${label} · ${tt.imgN(i + 1, imgs.length)}">
          <span class="imgtile-n mono">${i + 1}</span>
          <button class="imgtile-x" data-action="img-remove" data-arg="${zone}:${i}" aria-label="${tt.imgRemove} ${i + 1}" title="${tt.imgRemove}">${svg(CLOSE, 14)}</button>
        </figure>`).join('')}
        ${imgs.length < MAX_IMGS ? `<div class="paste imgadd" tabindex="0" role="button" data-action="paste" data-arg="${zone}" aria-label="${tt.imgAdd} · ${label}">
          <span class="t">+ ${tt.imgAdd}</span><span class="h">${tt.imgAddHelp}</span></div>` : ''}
      </div>
      <div class="imgzone-f">
        ${imgs.length < MAX_IMGS ? `<label class="linkbtn">${tt.imgUpload}<input type="file" accept="image/*" multiple data-upload="${zone}" hidden></label>` : `<span>${tt.imgMax(MAX_IMGS)}</span>`}
        ${msg ? `<span class="err" style="font-size:13px">${msg}</span>` : ''}
      </div>
    </div>`;
  }

  // Day result: Profit (green), Loss (red) and Break even (gray, only valid under the band).
  function dirView() {
    const tt = t(), F = st.form;
    return `<div class="flabel">${tt.dayResult}</div>${seg([['gan', tt.profit], ['per', tt.loss], ['be', tt.oBE]], F.dir, 'form-dir')}
      <div class="be-row">
        ${F.dir === 'be' ? `<div class="seg be-sign" style="grid-template-columns:1fr 1fr" role="group" aria-label="${tt.beSignAria}">${[['+', '+'], ['-', '−']].map(([v, l]) => `<button data-action="form-besign" data-arg="${v}" class="${F.beSign === v ? 'on' : ''}" aria-pressed="${F.beSign === v}">${l}</button>`).join('')}</div>` : ''}
        <span class="be-hint">${tt.beHint($(rules().be))}</span>
      </div>`;
  }

  function registrarView() {
    const tt = t(), F = st.form, ed = st.editDate;
    return `<div><h2>${ed ? tt.editDay : tt.logDay}</h2><div class="sub muted" style="font-size:14px;margin-top:4px">${ed ? `${tt.editingRec} <strong style="color:var(--accent)">${dd(ed)}</strong> · ${esc(accLabel())}.` : `${tt.savedIn} ${esc(accLabel())}. ${tt.onePerDay}`}</div></div>${rules().closed ? `<div class="closed-banner"><span>${tt.closedMsg}</span><button class="btn btn-secondary" style="padding:8px 12px" data-action="close-acc">${tt.reopenAcc}</button></div>` : ''}
    <div class="two">
      <section ${rv(0)} class="box form">
        <div class="pair">
          <div class="field"><label for="f-date">${tt.date}</label><input id="f-date" class="input" type="date" value="${esc(F.date)}" data-field="date" required></div>
          <div class="field"><label for="f-amt">${tt.amount}</label><input id="f-amt" class="input mono" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(F.amt)}" data-field="amt"></div>
        </div>
        <div id="dirbox">${dirView()}</div>
        <div><div class="flabel">${tt.tickerL}</div>${seg([['NQ', 'NQ'], ['ES', 'ES'], ['YM', 'YM']], F.tk, 'form-tk')}</div>
        <div class="zone" data-zone="pma">
          <div class="field"><label for="f-pma">Pre Market Analysis</label><textarea id="f-pma" class="input autogrow" rows="4" placeholder="${tt.pmaPh}" data-field="pma">${esc(F.pma)}</textarea></div>
          ${imgZone('pma', 'Pre Market Analysis')}
        </div>
        <div class="zone" data-zone="entry">
          <div class="field"><label for="f-notes">${tt.notes}</label><textarea id="f-notes" class="input autogrow" rows="4" placeholder="${tt.notesPh}" data-field="notes">${esc(F.notes)}</textarea></div>
          ${imgZone('entry', tt.notes)}
        </div>
        <div class="pair"><div><div class="flabel">${tt.followRules}</div>${seg([['y', tt.yes], ['n', tt.no]], F.plan, 'form-plan')}</div></div>
        ${st.formErr ? `<div class="err" role="alert">${st.formErr}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" style="padding:12px 20px" data-action="save">${ed ? tt.saveChanges : tt.saveDay}</button>
          <button class="btn btn-secondary" style="padding:12px 20px" data-action="go" data-arg="registros">${tt.cancel}</button>
        </div>
      </section>
      <section ${rv(.09)} class="box" id="proj" aria-live="polite">${projView()}</section>
    </div>`;
  }

  // ---------- FEEDBACK DE SESIÓN ----------
  const gLabel = g => { const F = t().fb; return g.type === 'wd' ? t().wdFull[g.name - 1] : g.type === 'tk' ? g.name : g.type === 'plan' ? (g.name === 'y' ? F.gPlanY : F.gPlanN) : g.type === 'dir' ? (g.name === 'long' ? F.gLong : F.gShort) : F.gTag(g.name); };
  function fbText(it) {
    const F = t().fb, p = it.p || {}, D = d => d === 'long' ? 'Long' : 'Short', R = Math.round;
    const fmt = {
      bestPattern: () => F.bestPattern(gLabel(p.g), $s(p.avg), $s(p.rest)), worstPattern: () => F.worstPattern(gLabel(p.g), $s(p.avg), $s(p.rest)),
      dirGap: () => F.dirGap(D(p.weak), D(p.strong), R(p.wrWeak), R(p.wrStrong)), streak: () => F.streak(p.n),
      planCost: () => F.planCost($s(p.yNet), $s(p.nNet), p.yN, p.nN), planAll: () => F.planAll(p.n), top4: () => F.top4($s(p.net), $s(p.rest)), robust: () => F.robust($s(p.rest)),
      ddHigh: () => F.ddHigh($(p.dd), R(p.pct)), ddOk: () => F.ddOk($(p.dd), R(p.pct)), concentration: () => F.concentration($s(p.best), R(p.pct)), noEntry: () => F.noEntry(p.n),
      errWord: () => F.errWord(p.w, p.count, p.days, $s(p.cost)), actWorst: () => F.actWorst(gLabel(p.g)), actDir: () => F.actDir(D(p.weak)), actDD: () => F.actDD($(p.lim)), actErr: () => F.actErr(p.w)
    }[it.k];
    return fmt ? fmt() : F[it.k];
  }
  // Previous closed session of the same account type (by close date), for the comparison.
  function prevSnap() {
    const all = store.loadFeedback(), mine = (all[sid()] || []).slice(-1)[0], cur = rules().closed ? mine : null;
    const cands = st.accounts.subs[st.acc].flatMap(s => (all[s.id] || []).map(x => Object.assign({ name: s.name }, x))).filter(x => !cur || x.savedAt !== cur.savedAt);
    const ref = cur ? cur.savedAt : new Date().toISOString();
    return cands.filter(x => x.savedAt < ref).sort((a, b) => a.savedAt < b.savedAt ? 1 : -1)[0] || null;
  }
  function fbModel() {
    const tt = t(), F = tt.fb, r = rules(), fb = TJ.feedback(list(), r), prev = prevSnap(), pct = v => Math.round(v) + '%';
    const cmp = prev ? [[F.net, $s(prev.net), $s(fb.net), $s(fb.net - prev.net)], [F.days, prev.days, fb.days, (fb.days - prev.days > 0 ? '+' : '') + (fb.days - prev.days)],
      [F.wr, pct(prev.wr), pct(fb.wr), (fb.wr - prev.wr >= 0 ? '+' : '') + Math.round(fb.wr - prev.wr) + ' pts'], [F.pf, prev.pf.toFixed(2), fb.pf.toFixed(2), (fb.pf - prev.pf >= 0 ? '+' : '') + (fb.pf - prev.pf).toFixed(2)],
      [F.dd, $(prev.dd), $(fb.dd), $s(fb.dd - prev.dd)], [F.mcShort, pct(prev.mc), pct(fb.mc), (fb.mc - prev.mc >= 0 ? '+' : '') + Math.round(fb.mc - prev.mc) + ' pts']] : [];
    return { fb, prev, cmp, title: F.title(accLabel()), status: F.status[fb.status],
      rows: [[F.result, F.status[fb.status]], [F.net, $s(fb.net)], [F.days, String(fb.days)], [F.pctT, fb.pctTarget.toFixed(1) + '%'], [F.wr, pct(fb.wr)], [F.pf, fb.pf.toFixed(2)], [F.dd, $(fb.dd)]],
      pros: fb.pros.map(fbText), cons: fb.cons.map(fbText), actions: fb.actions.map(fbText),
      top: fb.top.map(g => [g.name, g.n, g.net, g.avg]), mc: fb.days ? F.mc(Math.round(fb.mc)) : F.mcNone, none: F.none };
  }
  // Feedback screen in the Funded Path layout: stats strip, pros/cons side by side, patterns, numbered actions,
  // Monte Carlo + comparison, and the export buttons at the bottom right.
  function feedbackView() {
    const tt = t(), F = tt.fb, r = rules(), m = fbModel(), fb = m.fb;
    const sCol = [fb.status === 'lost' ? 'var(--loss)' : fb.status === 'ok' ? 'var(--gain)' : 'var(--text)', col(fb.net, 0)];
    const li = (arr, c) => arr.length ? arr.map(s => `<div class="fb-item"><span class="sq" style="background:${c}"></span><span>${esc(s)}</span></div>`).join('') : `<p class="muted" style="margin:0">${F.none}</p>`;
    const dl = (v, c) => /^[+−-]/.test(String(v)) ? (String(v)[0] === '+' ? (c ? 'var(--loss)' : 'var(--gain)') : (c ? 'var(--gain)' : 'var(--loss)')) : 'var(--text)';
    return `<div class="pagehead"><div><h2>${esc(m.title)}</h2><div class="sub">${r.closed ? tt.stnClosed(dd(r.closed)) : F.notClosed}</div></div>
      <div class="fb-btns">
        <button class="btn btn-secondary" style="padding:8px 12px;font-size:13px" data-action="go" data-arg="resumen">${F.back}</button>
        ${r.closed ? `<button class="btn btn-secondary" style="padding:8px 12px;font-size:13px" data-action="close-acc">${tt.reopenAcc}</button>` : ''}
        ${delSessionBtn()}
      </div></div>
    <section ${rv(0)} class="fb-stats">
      ${m.rows.map(([l, v], i) => `<div><div class="lbl">${l}</div><div class="mono fb-v" style="color:${i < 2 ? sCol[i] : 'var(--text)'}">${esc(String(v))}</div></div>`).join('')}
    </section>
    <section ${rv(.06)} class="fb-pc">
      <div><div class="lbl" style="color:var(--gain)">${F.pros}</div>${li(m.pros, 'var(--gain)')}</div>
      <div><div class="lbl" style="color:var(--loss)">${F.cons}</div>${li(m.cons, 'var(--loss)')}</div>
    </section>
    <section ${rv(.1)} class="box"><div class="panel-h lbl">${F.top}</div>
      ${m.top.length ? m.top.map(x => `<div class="fb-row"><span style="font-weight:800">${esc(x[0])}</span><span class="mono" style="font-size:14px;color:${col(x[2], 0)}">${x[1]} ${tt.daysL} · ${$s(x[2])} · ${tt.xl.pAvg.toLowerCase()} ${$s(x[3])}</span></div>`).join('') : `<div class="fb-row muted">${F.topNone}</div>`}
    </section>
    <section ${rv(.14)} class="box"><div class="panel-h lbl">${F.acts}</div>
      ${m.actions.map((s, i) => `<div class="fb-row act"><span class="mono muted" style="font-weight:600">0${i + 1}</span><span>${esc(s)}</span></div>`).join('')}
    </section>
    <section ${rv(.18)} class="fb-pc">
      <div><div class="lbl">${F.mcT}</div><div class="mono fb-big">${fb.days ? Math.round(fb.mc) + '%' : '—'}</div><div class="muted" style="font-size:13px;margin-top:6px">${m.mc}</div></div>
      <div><div class="lbl">${F.cmp}</div>
        ${m.prev ? `<div class="muted" style="font-size:13px">${F.cmpOf(esc(m.prev.name))}</div>${m.cmp.map((c, i) => `<div class="fb-cmp"><span class="muted">${c[0]}</span><span class="mono" style="color:${dl(c[3], i === 4)}">${c[1]} → ${c[2]}</span></div>`).join('')}` : `<div class="muted" style="font-size:14px">${F.noCmp}</div>`}
      </div>
    </section>
    ${st.promptText ? `<textarea class="input" id="fb-prompt" rows="8" readonly>${esc(st.promptText)}</textarea>` : ''}
    <div class="fb-foot">
      <button class="btn btn-secondary" style="padding:8px 12px;font-size:13px" data-action="copy-prompt">${F.copy}</button>
      <button class="btn btn-primary" style="padding:8px 12px;font-size:13px" data-action="export-xls">${svg('M12 3v12 M7 10l5 5 5-5 M4 20h16', 16)}${F.export}</button>
    </div>`;
  }
  async function exportXlsx() {
    const tt = t(), r = rules();
    st.toast = tt.xlLoading; render();
    try {
      const m = fbModel(), mode = { eval: tt.mEval, funded: tt.mFunded, backtest: 'Backtest' }[r.mode || 'backtest'];
      const buf = await TJ.buildXlsx({ tt, name: accLabel(), sub: mode + ' · ' + m.status + ' · ' + TJ.today(), r, list: list(), fb: m });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = ('Funded-Path_' + accLabel() + '_' + TJ.today()).replace(/[^\w.-]+/g, '-') + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      st.toast = tt.xlDone;
    } catch (e) { exportXls(); st.toast = tt.xlFail; }
    render();
  }
  async function copyPrompt() {
    const tt = t(), F = tt.fb, m = fbModel(), r = rules();
    const days = list().map(e => [e.date, e.tk || 'NQ', $s(e.pnl), e.plan ? tt.yes : tt.no, TJ.tagsOf(e).join(' '), TJ.dayText(e).replace(/\s+/g, ' ').slice(0, 160)].join(' | '));
    const txt = [F.prompt, '', accLabel() + ' · ' + JSON.stringify({ size: r.size, target: TJ.target(r), mll: r.mll, type: r.type, be: r.be, mode: r.mode }),
      m.rows.map(x => x.join(': ')).join(' · '), '', F.pros + ':', ...m.pros.map(s => '- ' + s), '', F.cons + ':', ...m.cons.map(s => '- ' + s), '', m.mc, '',
      tt.date + ' | Ticker | P&L | ' + tt.rulesF + ' | Tags | Pre Market + Entry', ...days].join('\n');
    try { await navigator.clipboard.writeText(txt); st.promptText = null; st.toast = F.copied; render(); }
    catch (e) { st.promptText = txt; st.toast = F.copyFail; render(); const ta = document.getElementById('fb-prompt'); if (ta) { ta.focus(); ta.select(); } }
  }

  // ---------- SIMULADOR ----------
  function simView() {
    const tt = t(), r = rules(), L = list(), S = calc(L, r);
    let html = `<div class="pagehead">
      <div><h2>${tt.simTitle}</h2><div class="sub">${tt.simSub(esc(accLabel()))}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${seg([30, 60, 90].map(h => [String(h), h + ' ' + tt.dayU]), String(st.hz), 'hz', 'hz')}
        <button class="btn btn-secondary" style="padding:9px 14px" data-action="reseed">${tt.resim}</button>
      </div>
    </div>`;
    if (S.n < 10) {
      return html + `<section ${rv(0)} class="box empty">
        <h3 style="margin:0 0 8px">${tt.simLockedT}</h3>
        <p style="margin-bottom:16px">${tt.simLock(S.n)}</p>
        <div class="bar" style="max-width:420px;margin-bottom:20px"><div style="width:${Math.min(100, S.n / 10 * 100)}%;background:var(--text)"></div></div>
        <button class="btn btn-primary" style="padding:12px 18px" data-action="go" data-arg="registrar">${tt.logDay}</button>
      </section>`;
    }
    const res = sim(L, r, st.hz, st.seed), pass = Math.round(res.pass), bust = Math.round(res.bust), open = Math.max(0, 100 - pass - bust);
    const v = TJ.verdict(res);
    const [vt, vc, vx] = v === 'clear' ? [tt.vClear, 'var(--gain)', tt.vxClear(pass, bust)] : v === 'marginal' ? [tt.vMarg, 'var(--warn)', tt.vxMarg] : [tt.vNone, 'var(--loss)', tt.vxNone(pass, bust)];
    const probs = [
      { l: tt.pPass, v: pass, c: 'var(--gain)', n: tt.reach + ' ' + $(S.target) + ' ' + tt.beforeFloor },
      { l: tt.pBust, v: bust, c: 'var(--loss)', n: tt.touch },
      { l: tt.pOpen, v: open, c: 'var(--muted)', n: tt.stillOpen + ' ' + st.hz + ' ' + tt.dayU }];
    const facts = [
      { l: tt.fTyp, v: res.med ? res.med + ' ' + tt.dayU : '—' }, { l: tt.fWr, v: pc(S.wr) },
      { l: tt.fExp, v: $s(S.exp) + tt.perDayU }, { l: tt.fHz, v: st.hz + ' ' + tt.dayU }];
    return html + `
    <section ${rv(.09)} class="verdict" style="border-left-color:${vc}">
      <div class="lbl">${tt.verdict}</div>
      <div class="vt" style="color:${vc}">${vt}</div>
      <div style="font-size:16px;max-width:680px">${vx}</div>
    </section>
    <section ${rv(.18)} class="gridrule probs">
      ${probs.map(p => `<div class="cell"><div class="lbl">${p.l}</div><div class="pv" style="color:${p.c}">${p.v}%</div>
        <div style="height:10px;background:var(--surface)" class="minibar"><div style="width:${p.v}%;background:${p.c}"></div></div>
        <div class="muted" style="font-size:12px;margin-top:8px">${p.n}</div></div>`).join('')}
    </section>
    <section ${rv(.27)} class="gridrule facts">
      ${facts.map(f => `<div class="cell"><div class="lbl">${f.l}</div><div class="mono" style="font-size:18px;font-weight:600;margin-top:4px">${f.v}</div></div>`).join('')}
    </section>`;
  }

  // ---------- AJUSTES ----------
  function ajustesView() {
    const tt = t(), r = rules(), mode = r.mode || 'backtest', lock = mode !== 'backtest', dis = lock ? ' disabled' : '';
    const notes = [
      ...(mode === 'eval' ? [{ l: tt.nMinDays, v: String(r.minDays) }, { l: tt.nMaxDay, v: $(r.maxDay) }] : []),
      ...(mode === 'funded' ? [{ l: tt.nPayMin, v: $(r.pay) }, { l: tt.nPayDays, v: String(r.payDays) }] : []),
      { l: tt.initBal, v: $(r.size) }, { l: tt.tgtGain, v: $s(TJ.target(r)) + (mode === 'funded' ? ' (' + r.payDays + ' × ' + $(r.pay) + ')' : ' (+' + r.pct + '%)') },
      { l: tt.initFloor, v: $(r.size - r.mll) }, { l: tt.maxFloor, v: r.type === 'trailing' ? $(r.size) + ' ' + tt.locks : tt.fixed },
      { l: tt.be, v: tt.beUnder($(r.be)) }];
    return `<div><h2>${tt.settings}</h2><div class="muted" style="font-size:14px;margin-top:4px">${tt.rulesOf} ${esc(accLabel())}. ${tt.eachOwn}</div></div>
    <div class="two">
      <section ${rv(0)} class="box form">
        <div><div class="flabel">${tt.accType}</div>${seg([['eval', tt.mEval], ['funded', tt.mFunded], ['backtest', 'Backtest']], mode, 'mode')}
          ${lock ? `<div class="lock-note">${svg('M6 11V8a6 6 0 0 1 12 0v3 M5 11h14v10H5z', 14)}${tt.lockNote}</div>` : ''}</div>
        <div class="field"><label for="r-size">${tt.accSize}</label>
          <select id="r-size" class="input mono" data-rule="size"${mode === 'funded' ? ' disabled' : ''}>${(mode === 'funded' ? [0] : [50000, 100000, 150000]).map(v => `<option value="${v}"${r.size === v ? ' selected' : ''}>$${v.toLocaleString('en-US')}</option>`).join('')}</select></div>
        <div class="pair">
          <div class="field"><label for="r-pct">${tt.profitPct}</label><input id="r-pct" class="input mono" type="number" step="0.5" min="0.5" value="${r.pct}" data-rule="pct"${dis}></div>
          <div class="field"><label for="r-tgt">${tt.targetUsd}</label><input id="r-tgt" class="input mono" style="opacity:.7" readonly value="${$s(TJ.target(r))}"></div>
        </div>
        <div class="field"><label for="r-mll">${tt.maxDD}</label><input id="r-mll" class="input mono" type="number" min="1" value="${r.mll}" data-rule="mll"${dis}></div>
        <div><div class="flabel">${tt.ddType}</div>${seg([['trailing', tt.trail], ['static', tt.stat]], r.type, 'ddtype', lock ? 'locked' : '')}</div>
        <div class="field"><label for="r-be">${tt.beBand}</label><input id="r-be" class="input mono" type="number" min="0" value="${r.be}" data-rule="be"></div>
        <div><button class="btn btn-secondary" style="padding:10px 16px" data-action="reset-rules">${tt.resetRules}</button></div>
      </section>
      <section ${rv(.09)} class="box">
        <div class="panel-h lbl">${tt.howApplied}</div>
        ${notes.map(p => `<div class="kv"><span style="font-size:14px">${p.l}</span><span class="mono" style="font-weight:600;text-align:right">${p.v}</span></div>`).join('')}
        <div class="muted" style="padding:14px 20px;font-size:13px">${r.type === 'trailing' ? tt.helpT : tt.helpS}</div>
      </section>
    </div>
    <section ${rv(.18)} class="box">
      <div class="panel-h lbl">${tt.bkTitle}</div>
      <div class="bk">
        <p class="muted">${tt.bkHelp}</p>
        <div class="bk-actions">
          <button class="btn btn-primary" style="padding:10px 16px" data-action="backup-export">${svg('M12 3v12 M7 10l5 5 5-5 M4 21h16', 16)}${tt.bkExport}</button>
          <label class="btn btn-secondary" style="padding:10px 16px">${svg('M12 21V9 M7 14l5-5 5 5 M4 3h16', 16)}${tt.bkImport}<input type="file" accept="application/json,.json" data-backup-file hidden></label>
        </div>
        ${st.bkMsg ? `<div class="${st.bkMsg.ok ? 'bk-ok' : 'err'}" role="status">${esc(st.bkMsg.text)}</div>` : ''}
      </div>
    </section>`;
  }

  // ---------- render ----------
  let io;
  function scan() {
    if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
    root.querySelectorAll('[data-rv]:not(.in):not([data-rv="in"])').forEach(el => io.observe(el));
    // Fallback from the design: if the observer hasn't fired (background tab, throttled browser),
    // reveal whatever is already on screen after 900ms.
    clearTimeout(scan.t);
    scan.t = setTimeout(() => root.querySelectorAll('[data-rv]:not(.in):not([data-rv="in"])').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.top < innerHeight && b.bottom > 0) el.classList.add('in');
    }), 900);
  }

  function render() {
    const scr = screen();
    const key = scr + '|' + sid();
    settled = key === lastKey;
    lastKey = key;
    document.documentElement.lang = st.lang;
    document.documentElement.dataset.theme = st.theme;
    document.querySelector('meta[name=theme-color]').content = st.theme === 'dark' ? '#000000' : '#f4f4f4';
    document.title = scr === 'login' ? 'Funded Path' : (scr === 'feedback' ? 'Feedback' : t().navL[SCREENS.indexOf(scr)]) + ' · Funded Path';
    document.body.classList.toggle('is-mob', mob);
    if (!settled) screenAt = performance.now();
    // Keep focus and caret in a text box across re-renders (e.g. pasting an image while typing).
    const ae = document.activeElement, keep = settled && ae && ae.id && /^(INPUT|TEXTAREA)$/.test(ae.tagName) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
    // Opening/closing the full-size viewer re-renders the lightbox: keep its scroll and don't replay its entrance.
    const oldCard = root.querySelector('.lb-card'), cardScroll = oldCard ? oldCard.scrollTop : 0, zvWas = !!root.querySelector('.zv');
    root.innerHTML = scr === 'login' ? loginView() : appView(scr);
    const newLb = root.querySelector('.lb');
    if (newLb && oldCard) { newLb.classList.add('still'); newLb.querySelector('.lb-card').scrollTop = cardScroll; }
    const zv = root.querySelector('.zv');
    if (zv && zvWas) zv.classList.add('still');
    if (zv && zoomFocus) { zoomFocus = false; zv.querySelector('.zv-x').focus(); }
    if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch (x) {} } }
    if (!settled) scan();
    if (root.querySelector('#eqc')) drawEquity(!settled); else if (eqRO) { eqRO.disconnect(); eqRO = null; }
    root.querySelectorAll('textarea.autogrow').forEach(grow);
    hydrateImages();
    cursorLoop();
    skyLoop();
    // Underline grows only on the option just picked (the others stay still across re-renders).
    if (lastPick) { const p = root.querySelector(`[data-action="${lastPick[0]}"][data-arg="${CSS.escape(lastPick[1] || '')}"].on`); if (p) p.classList.add('pick'); lastPick = null; }
    if (!settled) countUp();
    const si = root.querySelector('.subinput');
    if (si) { si.focus(); si.select(); }
    const lb = root.querySelector('.lb');
    document.body.classList.toggle('lb-lock', !!lb);
    if (lb && lbFocus) { lbFocus = false; lb.querySelector('.lb-x').focus(); }
  }

  // Fill <img data-img-id> from IndexedDB, then (a moment later) revoke object URLs of images
  // that left the screen. The delay avoids reloading thumbnails on quick re-renders.
  let sweepT;
  function hydrateImages() {
    root.querySelectorAll('img[data-img-id]:not([src])').forEach(img => {
      TJ.images.load(img.dataset.imgId)
        .then(u => { if (u) img.src = u; else img.classList.add('img-missing'); })
        .catch(() => img.classList.add('img-missing'));
    });
    clearTimeout(sweepT);
    sweepT = setTimeout(() => {
      const keep = new Set([...root.querySelectorAll('img[data-img-id]')].map(i => i.dataset.imgId));
      st.form.pmaImgs.concat(st.form.entryImgs).forEach(id => keep.add(id)); // form tiles survive leaving the form
      TJ.images.release(keep);
    }, 2000);
  }
  let lbFocus = false, lbReturn = null, screenAt = 0, zoomFocus = false, zoomReturn = null;
  // Swap only the viewer element: the lightbox behind keeps its DOM, so its scroll and images stay exactly as they were.
  function paintZoom() {
    const lb = root.querySelector('.lb');
    if (!lb) return render();
    const old = lb.querySelector('.zv'), tmp = document.createElement('div');
    tmp.innerHTML = zoomView();
    const nz = tmp.firstElementChild;
    if (old && nz) { nz.classList.add('still'); old.replaceWith(nz); }
    else if (old) old.remove();
    else if (nz) lb.appendChild(nz);
    hydrateImages();
  }
  const closeZoom = () => {
    st.zoom = null; paintZoom();
    // Back to the image button that opened it.
    const b = zoomReturn && root.querySelector(`.lb-fig button[data-arg="${zoomReturn}"]`);
    if (b) b.focus({ preventScroll: true });
  };
  // Textareas grow with their text. Browsers with CSS field-sizing do it natively; others get this.
  const nativeGrow = window.CSS && CSS.supports && CSS.supports('field-sizing', 'content');
  function grow(el) {
    if (nativeGrow) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px'; // + top/bottom 1px border (border-box)
  }
  const closeLb = () => {
    st.viewImg = null; st.zoom = null; render();
    // Return focus to the thumbnail that opened it.
    const b = lbReturn && root.querySelector(`.thumb[data-arg="${lbReturn}"]`);
    if (b) b.focus({ preventScroll: true });
  };

  // Images pasted into the form are stored right away; until the day is saved they're tracked here
  // so an abandoned form doesn't leave orphan files behind.
  const formNew = new Set();
  const inUse = id => Object.values(st.entries).some(L => L.some(e => idsOf(e).includes(id)));
  const discardFormImages = () => { formNew.forEach(id => { if (!inUse(id)) TJ.images.deleteImage(id).catch(() => {}); }); formNew.clear(); };
  const deleteImages = ids => ids.forEach(id => TJ.images.deleteImage(id).catch(() => {}));
  const mb = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  // Storage error with how much room is left (estimate is async, so the message upgrades when it arrives).
  const spaceMsg = (set, base) => {
    set(base(null));
    TJ.images.space().then(s => { if (s && s.quota) { set(base(s)); render(); } });
  };

  // Leaving the form (or switching account) abandons an in-progress edit.
  const endEdit = () => { if (st.editDate) { discardFormImages(); st.editDate = null; st.form = blankForm(); } };

  const go = s => {
    st.toast = ''; st.formErr = ''; st.pendingDel = null; st.viewImg = null; st.bkMsg = null;
    if (s !== 'registrar') endEdit();
    const target = s === 'login' ? '#/' : '#/' + s;
    if (location.hash === target) render(); else location.hash = target;
    if (s !== 'login') window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
  };

  function save() {
    const tt = t(), F = st.form, L = list();
    if (rules().closed) { st.formErr = tt.errClosed; return render(); } // closed account: re-open it first
    const amt = parseFloat(F.amt) || 0, signed = signedAmt(F), band = rules().be;
    if (F.dir === 'be') {
      // Break even allows $0 but must stay under the band.
      if (amt < 0) { st.formErr = tt.errAmt; return render(); }
      if (amt >= band) { st.formErr = tt.errBe($(band)); return render(); }
    } else if (!(amt > 0)) { st.formErr = tt.errAmt; return render(); }
    if (!F.date) { st.formErr = tt.errDate; return render(); }
    const ed = st.editDate;
    // When editing, the record's own original date doesn't count as a duplicate.
    if (L.some(e => e.date === F.date && e.date !== ed)) { st.formErr = tt.errDup; return render(); }
    const prev = ed ? L.find(e => e.date === ed) : null;
    const ne = Object.assign({}, prev, { date: F.date, tk: F.tk, pnl: signed, pma: F.pma, pmaImgs: F.pmaImgs.slice(), plan: F.plan === 'y', notes: F.notes, entryImgs: F.entryImgs.slice() });
    delete ne.img; // legacy single chart now lives in pmaImgs
    const rest = ed ? L.filter(e => e.date !== ed) : L;
    const before = st.entries;
    st.entries = Object.assign({}, st.entries, { [sid()]: [...rest, ne].sort((a, b) => a.date < b.date ? -1 : 1) });
    // Storage full: keep the form (text and images) exactly as it is and say how much room is left.
    if (!store.saveEntries(st.entries)) {
      st.entries = before;
      // Record text lives in localStorage (~5 MB cap, separate from the image storage): report that.
      st.formErr = tt.errSaveDay(mb(store.textUsage()), '~5 MB');
      return render();
    }
    // Saved: images removed while editing are deleted now; the new ones belong to the record.
    if (prev) deleteImages(idsOf(prev).filter(id => !idsOf(ne).includes(id)));
    formNew.clear();
    const toast = (ed ? tt.updated : tt.logged) + ' ' + dd(F.date) + ' · ' + $s(signed);
    st.form = blankForm(); st.cal = null; st.editDate = null;
    go('registros');
    st.toast = toast;
    render();
  }

  // Shrink to max 1280px wide and encode as WebP 0.75 (JPEG 0.75 where WebP encoding isn't supported).
  const webpOK = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').startsWith('data:image/webp'); } catch (e) { return false; } })();
  function compress(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const s = Math.min(1, 1280 / im.width), c = document.createElement('canvas');
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        const g = c.getContext('2d');
        if (!webpOK) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } // JPEG has no transparency
        g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('encode')), webpOK ? 'image/webp' : 'image/jpeg', 0.75);
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
      im.src = url;
    });
  }

  async function addImgs(zone, files) {
    const key = zone + 'Imgs', tt = t();
    files = files.filter(Boolean);
    if (!files.length) return;
    const room = MAX_IMGS - st.form[key].length;
    st.pasteMsg = files.length > room ? { zone, msg: tt.imgMax(MAX_IMGS) } : null;
    for (const f of files.slice(0, Math.max(0, room))) {
      let blob;
      try { blob = await compress(f); } catch (e) { st.pasteMsg = { zone, msg: tt.imgBad }; continue; }
      try {
        const id = await TJ.images.saveImage(blob);
        formNew.add(id);
        st.form[key] = [...st.form[key], id];
      } catch (e) {
        // IndexedDB full (or unavailable): the text already typed stays; say how much room is left.
        spaceMsg(m => { st.pasteMsg = { zone, msg: m }; }, s => tt.errImgSpace(s && mb(s.free), s && mb(s.quota)));
        break;
      }
    }
    render();
  }

  async function pasteFromClipboard(zone) {
    const tt = t();
    try {
      const files = [];
      for (const it of await navigator.clipboard.read()) {
        const ty = it.types.find(x => x.startsWith('image/'));
        if (ty) files.push(await it.getType(ty));
      }
      if (files.length) return addImgs(zone, files);
      st.pasteMsg = { zone, msg: tt.pNone };
    } catch (e) { st.pasteMsg = { zone, msg: tt.pKey }; }
    render();
  }

  // Which section a Ctrl+V goes to: the one holding focus (its text box or its paste tile); otherwise the last one used.
  let lastZone = 'pma';
  root.addEventListener('focusin', e => { const z = e.target.closest('[data-zone]'); if (z) lastZone = z.dataset.zone; });


  // Two-step confirm shared by record and sub-account deletes: first call arms "Confirmar" for 4s, second returns true.
  function confirmStep(key) {
    clearTimeout(delTimer);
    if (st.pendingDel !== key) {
      st.pendingDel = key;
      delTimer = setTimeout(() => { st.pendingDel = null; render(); }, 4000);
      render();
      return false;
    }
    st.pendingDel = null;
    return true;
  }

  const saveAccounts = () => store.saveAccounts(st.accounts);
  const pickSub = id => { st.accounts.active[st.acc] = id; saveAccounts(); st.cal = null; st.toast = ''; st.pendingDel = null; st.viewImg = null; endEdit(); };

  function commitRename(value) {
    const id = st.editing;
    if (!id) return;
    st.editing = null;
    const name = (value || '').trim().slice(0, 40);
    const s = st.accounts.subs[st.acc].find(x => x.id === id);
    if (s && name) { s.name = name; saveAccounts(); }
    render();
  }

  const setRule = (k, v) => { st.rules = Object.assign({}, st.rules, { [sid()]: Object.assign({}, rules(), { [k]: v }) }); store.saveRules(st.rules); render(); };

  const actions = {
    enter: () => go('resumen'),
    logout: () => go('login'),
    go: a => go(a),
    lang: l => { st.lang = l; store.setPref('lang', l); render(); },
    theme: () => { st.theme = st.theme === 'dark' ? 'light' : 'dark'; store.setPref('theme', st.theme); render(); },
    acc: a => { st.acc = a; st.cal = null; st.toast = ''; st.pendingDel = null; st.viewImg = null; endEdit(); render(); },
    edit: date => {
      const e = list().find(x => x.date === date);
      if (!e) return;
      if (rules().closed) { st.toast = t().errClosed; return render(); } // read-only session
      st.form = { date: e.date, dir: TJ.outcome(e.pnl, rules().be) === 'be' ? 'be' : e.pnl < 0 ? 'per' : 'gan', beSign: e.pnl < 0 ? '-' : '+', amt: String(Math.abs(e.pnl)), tk: e.tk || 'NQ', pma: e.pma || '', pmaImgs: imgsOf(e).pma.slice(), plan: e.plan ? 'y' : 'n', notes: e.notes || '', entryImgs: imgsOf(e).entry.slice() };
      st.editDate = date; st.pasteMsg = null;
      go('registrar');
    },
    'lb-open': date => { st.viewImg = date; st.zoom = null; st.pendingDel = null; lbFocus = true; lbReturn = date; render(); },
    'lb-close': () => closeLb(),
    // "Abrir en tamaño completo": same page, centered viewer over a blurred backdrop.
    'lb-full': arg => {
      const [zone, i] = String(arg).split(':');
      st.zoom = { zone, i: Number(i) }; zoomReturn = arg; paintZoom(); root.querySelector('.zv-x').focus();
    },
    'zoom-go': arg => { const [zone, i] = String(arg).split(':'); st.zoom = { zone, i: Number(i) }; zoomReturn = arg; paintZoom(); root.querySelector('.zv-x').focus(); },
    'zoom-close': () => closeZoom(),
    cal: d => {
      const L = list(), last = L[L.length - 1], base = last ? new Date(last.date + 'T12:00:00') : new Date();
      const cm = st.cal || { y: base.getFullYear(), m: base.getMonth() };
      const nd = new Date(cm.y, cm.m + Number(d), 1); st.cal = { y: nd.getFullYear(), m: nd.getMonth() }; render();
    },
    'form-dir': v => { st.form.dir = v; st.formErr = ''; render(); },
    'form-besign': v => { st.form.beSign = v; render(); },
    'form-tk': v => { st.form.tk = v; render(); },
    'form-plan': v => { st.form.plan = v; render(); },
    paste: zone => pasteFromClipboard(zone),
    'img-remove': arg => {
      const [zone, i] = String(arg).split(':'), key = zone + 'Imgs', id = st.form[key][Number(i)];
      st.form[key] = st.form[key].filter((_, j) => j !== Number(i));
      // Pasted in this form and never saved → delete now. Already part of a record → deleted when the edit is saved.
      if (formNew.has(id)) { formNew.delete(id); deleteImages([id]); }
      st.pasteMsg = null; render();
    },
    del: date => {
      if (rules().closed) { st.toast = t().errClosed; return render(); } // read-only session
      if (!confirmStep(date)) return;
      const e = list().find(x => x.date === date);
      if (!e) return render();
      st.entries = Object.assign({}, st.entries, { [sid()]: list().filter(x => x.date !== date) });
      store.saveEntries(st.entries);
      deleteImages(idsOf(e));
      st.cal = null;
      st.toast = t().deleted + ' ' + dd(date) + ' · ' + $s(e.pnl);
      render();
    },
    sub: id => { if (id !== sid()) { pickSub(id); render(); } },
    'sub-new': () => {
      const subs = st.accounts.subs[st.acc];
      let n = subs.length + 1;
      while (subs.some(s => s.name === st.acc + ' ' + n)) n++;
      const id = st.acc.slice(0, 2).toLowerCase() + '-' + Date.now().toString(36);
      subs.push({ id, name: st.acc + ' ' + n });
      st.entries = Object.assign({}, st.entries, { [id]: [] });
      // New sub-account starts with the same rules as the one you were on.
      st.rules = Object.assign({}, st.rules, { [id]: Object.assign({}, rules()) });
      store.saveEntries(st.entries); store.saveRules(st.rules);
      pickSub(id);
      st.editing = id;
      render();
    },
    'sub-rename': () => { st.editing = sid(); render(); },
    // Eliminar sesión: deletes the active sub-account with its days, images, rules and saved feedback
    // (second click within 4s confirms). If it was the only one of its type, a fresh empty one takes its place.
    'sub-del': () => {
      const subs = st.accounts.subs[st.acc], id = sid();
      if (!confirmStep('sub:' + id)) return;
      const label = accLabel(), keepRules = Object.assign({}, rules(), { closed: null });
      let rest = subs.filter(s => s.id !== id);
      const entries = Object.assign({}, st.entries), rls = Object.assign({}, st.rules), gone = (entries[id] || []).flatMap(idsOf);
      delete entries[id]; delete rls[id];
      if (!rest.length) {
        const nid = st.acc.slice(0, 2).toLowerCase() + '-' + Date.now().toString(36);
        rest = [{ id: nid, name: st.acc + ' 1' }]; entries[nid] = []; rls[nid] = keepRules;
      }
      st.accounts.subs[st.acc] = rest;
      st.entries = entries; st.rules = rls;
      store.saveEntries(st.entries); store.saveRules(st.rules);
      const fbAll = store.loadFeedback(); if (fbAll[id]) { delete fbAll[id]; store.saveFeedback(fbAll); }
      deleteImages(gone);
      pickSub(rest[0].id);
      if (screen() === 'feedback') { go('resumen'); }
      st.toast = t().subDeleted + ' ' + label;
      render();
    },
    save,
    hz: v => { st.hz = Number(v); render(); },
    reseed: () => { st.seed++; render(); },
    'backup-export': () => exportBackup(),
    'export-xls': () => exportXlsx(),
    'copy-prompt': () => copyPrompt(),
    // Close / re-open the session (active sub-account). Closing needs a second click within 4s (like Eliminar),
    // stores the close date, makes the session read-only, saves a feedback snapshot in tj_feedback and opens
    // the feedback screen. Re-opening keeps everything (the snapshot stays for later comparisons).
    'close-acc': () => {
      const r = rules(), setRules = patch => { st.rules = Object.assign({}, st.rules, { [sid()]: Object.assign({}, r, patch) }); store.saveRules(st.rules); };
      if (r.closed) { setRules({ closed: null }); st.toast = t().reopenToast; return render(); }
      if (!confirmStep('close:' + sid())) return;
      const day = TJ.today();
      setRules({ closed: day });
      const all = store.loadFeedback();
      (all[sid()] = all[sid()] || []).push(TJ.feedbackSnapshot(TJ.feedback(list(), rules()), day));
      store.saveFeedback(all);
      go('feedback');
      st.toast = t().closedToast; render();
    },
    ddtype: v => { if ((rules().mode || 'backtest') === 'backtest') setRule('type', v); },
    // Reset keeps the account type and the break-even band; everything else back to the type's defaults.
    'reset-rules': () => { const r = rules(); st.rules = Object.assign({}, st.rules, { [sid()]: Object.assign(TJ.defaultRule(st.acc), r.mode === 'backtest' ? TJ.modePreset('eval') : TJ.modePreset(r.mode, r.size), { mode: r.mode, be: r.be }) }); store.saveRules(st.rules); render(); },
    // Account type: Evaluación / Fondeada apply Topstep's fixed values (break-even band is yours, kept); Backtest leaves values
    // editable (coming from Fondeada's $0 balance, it starts from the 50K values instead).
    mode: m => {
      const r = rules(), keep = r.size > 0 && r.pct > 0;
      st.rules = Object.assign({}, st.rules, { [sid()]: Object.assign({}, r, m !== 'backtest' ? TJ.modePreset(m, keep ? r.size : 50000) : keep ? {} : TJ.modePreset('eval'), { mode: m, be: r.be }) });
      store.saveRules(st.rules); render();
    }
  };

  // ---------- events ----------
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    // Ignore the second click of a double-click that lands on the screen just opened
    // (e.g. "Editar" → "Quitar" imagen sitting under the pointer).
    if (e.detail > 1 && performance.now() - screenAt < 500) return;
    if (el && root.contains(el)) { if (!el.classList.contains('on')) lastPick = [el.dataset.action, el.dataset.arg]; actions[el.dataset.action](el.dataset.arg); }
  });
  root.addEventListener('dblclick', e => {
    const el = e.target.closest('.subchip');
    if (el) { pickSub(el.dataset.arg); st.editing = el.dataset.arg; render(); }
  });
  // Inline rename: Enter/blur saves, Escape cancels.
  root.addEventListener('focusout', e => { if (e.target.classList.contains('subinput')) commitRename(e.target.value); });
  root.addEventListener('keydown', e => {
    if (e.target.classList.contains('subinput')) {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target.value); }
      else if (e.key === 'Escape') { st.editing = null; render(); }
      return;
    }
    const el = e.target.closest('.paste');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pasteFromClipboard(el.dataset.arg); }
  });
  // Backup file chosen in Ajustes.
  root.addEventListener('change', e => { if (e.target.matches('[data-backup-file]') && e.target.files[0]) importBackup(e.target.files[0]); });
  // "Subir desde tu equipo" file picker.
  root.addEventListener('change', e => {
    const z = e.target.dataset.upload;
    if (z) addImgs(z, [...e.target.files]);
  });
  // Form fields: update state without re-rendering (keeps focus); refresh only the projection panel.
  root.addEventListener('input', e => {
    const k = e.target.dataset.field;
    if (!k) return;
    st.form[k] = e.target.value;
    if (e.target.classList.contains('autogrow')) grow(e.target);
    if (st.formErr) { st.formErr = ''; const er = root.querySelector('.err[role=alert]'); if (er) er.remove(); }
    if (k === 'amt' || k === 'date') { const p = document.getElementById('proj'); if (p) p.innerHTML = projView(); }
  });
  root.addEventListener('change', e => {
    const k = e.target.dataset.rule;
    if (!k) return;
    const raw = e.target.value;
    const v = k === 'size' ? parseInt(raw, 10) : parseFloat(raw);
    const ok = k === 'be' ? v >= 0 : v > 0;
    const md = rules().mode || 'backtest';
    // Evaluation: only the size can change, and it brings its own Max Loss Limit (50K → 2,000 · 100K → 3,000 · 150K → 4,500).
    if (k === 'size' && md === 'eval' && TJ.EVAL_MLL[v]) {
      st.rules = Object.assign({}, st.rules, { [sid()]: Object.assign({}, rules(), TJ.modePreset('eval', v)) });
      store.saveRules(st.rules); render(); return;
    }
    if (k !== 'be' && md !== 'backtest') { e.target.value = rules()[k]; return; } // fixed Topstep rules
    if (isNaN(v) || !ok) { e.target.value = rules()[k]; return; }
    setRule(k, v);
  });
  document.addEventListener('keydown', e => {
    if (!st.viewImg) return;
    // Esc closes the full-size viewer first, then the lightbox. ←/→ move between images in the viewer.
    if (e.key === 'Escape') { e.preventDefault(); st.zoom ? closeZoom() : closeLb(); return; }
    if (st.zoom && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const b = root.querySelectorAll('.zv [data-action=zoom-go]')[e.key === 'ArrowLeft' ? 0 : 1];
      if (b) { e.preventDefault(); b.click(); }
      return;
    }
    // Keep Tab focus inside the top dialog.
    if (e.key === 'Tab') {
      const f = [...root.querySelectorAll(st.zoom ? '.zv button' : '.lb-card button')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener('paste', e => {
    if (screen() !== 'registrar') return;
    const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile());
    if (!files.length) return; // plain text keeps pasting into the text box
    e.preventDefault();
    const z = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-zone]');
    addImgs(z ? z.dataset.zone : lastZone, files);
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('resize', () => {
    const m = innerWidth < MOB;
    if (m !== mob) { mob = m; render(); } else root.querySelectorAll('textarea.autogrow').forEach(grow);
  });

  // Header gains background on scroll; particles parallax.
  const particles = document.getElementById('particles');
  window.addEventListener('scroll', () => {
    const h = document.getElementById('hdr');
    if (h) h.classList.toggle('scrolled', scrollY > 8);
    if (particles && !reduced.matches) particles.style.setProperty('--sy', scrollY);
  }, { passive: true });

  // Background particles: 3 layers of random box-shadow dots (1/2/3px), no canvas.
  (function initParticles() {
    if (!particles) return;
    const counts = [90, 45, 22];
    particles.querySelectorAll('.pl i').forEach((el, i) => {
      const dots = [];
      // Extend beyond 100vh so parallax never reveals an empty band.
      for (let n = 0; n < counts[i]; n++) dots.push((Math.random() * 100).toFixed(2) + 'vw ' + (Math.random() * 160).toFixed(2) + 'vh currentColor');
      el.style.boxShadow = dots.join(',');
    });
  })();

  render();

  // First start after the IndexedDB switch: move base64 images still inside tj_entries to IndexedDB
  // (re-encoded at 1280px WebP/JPEG) and keep only their ids. Images that fail stay as they were and
  // keep rendering. Then drop orphan files (not referenced by any record) older than a day.
  async function migrateImages() {
    let changed = false;
    for (const key of Object.keys(st.entries)) {
        for (const e of st.entries[key]) {
          const i = imgsOf(e), out = {};
          let moved = false;
          for (const zone of ['pma', 'entry']) {
            out[zone] = [];
            for (const ref of i[zone]) {
              if (typeof ref === 'string' && ref.startsWith('data:')) {
                try {
                  const raw = TJ.images.dataUrlToBlob(ref);
                  const blob = await compress(raw).catch(() => raw);
                  out[zone].push(await TJ.images.saveImage(blob)); moved = true;
                } catch (x) { out[zone].push(ref); }
              } else out[zone].push(ref);
            }
          }
          if (moved || e.img !== undefined) { e.pmaImgs = out.pma; e.entryImgs = out.entry; delete e.img; changed = true; }
        }
      }
    if (changed) { st.entries = Object.assign({}, st.entries); store.saveEntries(st.entries); render(); }
  }

  // ---------- EXCEL EXPORT (design MVP) ----------
  // One .xls (SpreadsheetML, opens in Excel) for the active sub-account: a summary sheet with the account
  // status and a records sheet with every day, its balance, floor, cushion, outcome, PMA and Entry.
  function xlsRow() {
    const tt = t();
    return `<div class="xls-row"><span>${esc(accLabel())} · ${tt.exportNote}</span><button class="btn btn-secondary" style="padding:8px 12px;font-size:13px" data-action="export-xls">${svg('M12 3v12 M7 10l5 5 5-5 M4 20h16', 16)}${tt.exportXls}</button></div>`;
  }
  function exportXls() {
    const tt = t(), r = rules(), c = calc(list(), r), en = st.lang === 'en', L2 = (a, b) => en ? b : a;
    const x = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    const cell = (v, sty) => '<Cell' + (sty ? ' ss:StyleID="' + sty + '"' : '') + '><Data ss:Type="' + (typeof v === 'number' ? 'Number' : 'String') + '">' + x(v) + '</Data></Cell>';
    const mode = { eval: tt.mEval, funded: tt.mFunded, backtest: 'Backtest' }[r.mode || 'backtest'];
    const status = r.closed ? tt.stClosed : c.lost ? tt.stLost : c.ok ? (r.mode === 'funded' ? tt.stPayout : tt.stOk) : tt.stOpen;
    const sum = [[L2('Cuenta', 'Account'), accLabel()], [L2('Tipo', 'Type'), mode], [L2('Estado', 'Status'), status], [L2('Fecha de cierre', 'Closed on'), r.closed || '—'],
      [tt.initBal, c.size, 1], [L2('Balance actual', 'Current balance'), c.bal, 1], [tt.netPL, c.net, 1], [tt.target, c.target, 1], [tt.floor, c.floor, 1], [tt.cushion, c.cush, 1],
      [L2('Días registrados', 'Days logged'), c.n], ['Win rate %', Math.round(c.wr * 10) / 10], ['Profit factor', Math.round(c.pf * 100) / 100], ['Max drawdown', c.dd, 1], [L2('Exportado el', 'Exported on'), TJ.today()]];
    const head = [tt.date, 'Ticker', 'P&L', tt.balance, tt.floorS, tt.cushion, tt.rulesF, tt.outcome, 'Pre Market Analysis', 'Entry'];
    const body = c.rows.map(e => '<Row>' + [cell(e.date), cell(e.tk || 'NQ'), cell(e.pnl, 'm'), cell(e.bal, 'm'), cell(e.floor, 'm'), cell(e.cush, 'm'), cell(e.plan ? tt.yes : tt.no), cell(outLabel(e.pnl, r.be)), cell(e.pma || ''), cell(e.notes || '')].join('') + '</Row>').join('');
    const xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#111111" ss:Pattern="Solid"/></Style><Style ss:ID="m"><NumberFormat ss:Format="&quot;$&quot;#,##0;[Red]-&quot;$&quot;#,##0"/></Style></Styles>'
      + '<Worksheet ss:Name="' + x(tt.navL[0]) + '"><Table><Column ss:Width="140"/><Column ss:Width="160"/>' + sum.map(s => '<Row>' + cell(s[0], 'h') + cell(s[1], s[2] ? 'm' : '') + '</Row>').join('') + '</Table></Worksheet>'
      + '<Worksheet ss:Name="' + x(tt.recordsTitle) + '"><Table><Column ss:Width="80"/><Column ss:Width="55"/><Column ss:Width="75"/><Column ss:Width="85"/><Column ss:Width="85"/><Column ss:Width="75"/><Column ss:Width="95"/><Column ss:Width="80"/><Column ss:Width="320"/><Column ss:Width="320"/>'
      + '<Row>' + head.map(h => cell(h, 'h')).join('') + '</Row>' + body + '</Table></Worksheet></Workbook>';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel' }));
    a.download = ('Funded-Path_' + accLabel() + '_' + TJ.today()).replace(/[^\w.-]+/g, '-') + '.xls';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- BACKUP (export / import) ----------
  // Export: every tj_* key plus all images as data URLs, in one JSON file.
  // Import: accepts that file or the design's tj-backup.json. It MERGES — days already present
  // (same sub-account and date) are kept untouched and never duplicated; nothing is deleted.
  const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  async function exportBackup() {
    const tt = t(), ls = {}, images = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('tj_')) ls[k] = localStorage.getItem(k); }
    try { for (const id of await TJ.images.listImageIds()) { const b = await TJ.images.getImage(id); if (b) images[id] = await blobToDataUrl(b); } } catch (x) {}
    const data = { app: 'trading-journal-50k', version: 2, exportedAt: new Date().toISOString(), localStorage: ls, images };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'tj-backup-' + TJ.today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const days = Object.values(st.entries).reduce((n, L) => n + L.length, 0);
    st.bkMsg = { ok: true, text: tt.bkDone(days, Object.keys(images).length) }; render();
  }

  async function importBackup(file) {
    const tt = t();
    let data;
    try { data = JSON.parse(await file.text()); } catch (x) { st.bkMsg = { ok: false, text: tt.bkBad }; return render(); }
    const src = data && data.localStorage ? data.localStorage : data; // ours, or the design's flat tj-backup.json
    const val = k => { const v = src && src[k]; if (v == null) return null; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (x) { return null; } };
    const inEntries = val('tj_entries'), inRules = val('tj_rules') || {}, inAcc = val('tj_accounts');
    if (!inEntries || typeof inEntries !== 'object') { st.bkMsg = { ok: false, text: tt.bkBad }; return render(); }
    // Images first, under their original ids, so imported records point at them.
    let imgs = 0;
    for (const [id, url] of Object.entries((data && data.images) || {})) {
      try { if (!(await TJ.images.getImage(id))) { await TJ.images.putImage(id, TJ.images.dataUrlToBlob(url)); imgs++; } } catch (x) {}
    }
    const typeIn = id => (inAcc && inAcc.subs && ACCOUNTS.find(a => (inAcc.subs[a] || []).some(s => s.id === id))) || (ACCOUNTS.includes(id) ? id : 'Backtest');
    const nameIn = id => { const s = inAcc && inAcc.subs && ACCOUNTS.flatMap(a => inAcc.subs[a] || []).find(x => x.id === id); return s ? s.name : id; };
    const entries = Object.assign({}, st.entries), rls = Object.assign({}, st.rules);
    let added = 0, kept = 0;
    for (const [id, L] of Object.entries(inEntries)) {
      if (!Array.isArray(L)) continue;
      // Live is no longer part of the app: its records are not imported into Backtest/Demo.
      if (id === 'Live' || (inAcc && inAcc.subs && (inAcc.subs.Live || []).some(s => s.id === id))) continue;
      const type = typeIn(id);
      if (!ACCOUNTS.some(a => st.accounts.subs[a].some(s => s.id === id))) st.accounts.subs[type].push({ id, name: nameIn(id) });
      const mine = entries[id] ? entries[id].slice() : [];
      for (const e of L) {
        if (!e || !e.date || typeof e.pnl !== 'number') continue;
        if (mine.some(x => x.date === e.date)) { kept++; continue; }
        mine.push(Object.assign({}, e)); added++;
      }
      entries[id] = mine.sort((a, b) => a.date < b.date ? -1 : 1);
      if (!rls[id] && inRules[id]) rls[id] = TJ.completeRule(inRules[id], type);
      if (!rls[id]) rls[id] = TJ.defaultRule(type);
    }
    st.entries = entries; st.rules = rls;
    if (!store.saveEntries(st.entries)) { st.bkMsg = { ok: false, text: tt.errSaveDay(mb(store.textUsage()), '~5 MB') }; return render(); }
    store.saveRules(st.rules); store.saveAccounts(st.accounts);
    // Session feedback history: add what this browser doesn't have (same savedAt = same snapshot).
    const inFb = val('tj_feedback');
    if (inFb && typeof inFb === 'object') {
      const fbAll = store.loadFeedback();
      Object.entries(inFb).forEach(([id, arr]) => { if (!Array.isArray(arr) || !st.entries[id]) return; const mine = fbAll[id] || []; arr.forEach(x => { if (x && !mine.some(y => y.savedAt === x.savedAt)) mine.push(x); }); fbAll[id] = mine; });
      store.saveFeedback(fbAll);
    }
    st.cal = null;
    st.bkMsg = { ok: true, text: tt.bkImported(added, kept, imgs) };
    render();
    try { await migrateImages(); } catch (x) {} // base64 images from the design's backup → IndexedDB
  }

  (async function migrateAndClean() {
    try {
      await migrateImages();
      if (!store.hasEntries()) return; // never clean against an unreadable/missing record set
      const used = new Set(Object.values(st.entries).flatMap(L => L.flatMap(idsOf)).concat(st.form.pmaImgs, st.form.entryImgs));
      const dayAgo = Date.now() - 864e5;
      for (const id of await TJ.images.listImageIds()) {
        if (!used.has(id) && TJ.images.idTime(id) < dayAgo) await TJ.images.deleteImage(id);
      }
    } catch (x) { /* IndexedDB unavailable: base64 images keep working from localStorage */ }
  })();
})(window.TJ);
