/* Feedback de sesión: reglas sobre los datos (sin API externa). Funciones puras, sin DOM → probadas en tests.html.
   Devuelve claves + parámetros; los textos ES/EN viven en i18n.js (T[lang].fb). */
(function (TJ) {
  // Etiquetas que se detectan en el texto del día (Pre Market Analysis + Entry). Mayúsculas/minúsculas da igual.
  TJ.TAGS = [
    ['H4 GAP', /\bh4\s*gap\b/i],
    ['90m Cycle', /\b90\s*m(in)?\s*cycle\b/i],
    ['SMT', /\bsmt\b/i],
    ['IFVG', /\bifvg\b/i],
    ['CISD', /\bcisd\b/i],
    ['FVG', /(^|[^a-z])fvg\b/i], // no cuenta los IFVG
    ['TPD', /\btpd\b/i],
    ['FOMO', /\bfomo\b/i],
    ['recuperar', /recuper/i],
    ['no cambié de bias', /no\s+cambi[eé]\s+(de\s+)?bias/i]
  ];
  // Palabras de error: se cuentan todas las apariciones y lo que costaron los días donde aparecen.
  TJ.ERROR_WORDS = [['FOMO', /\bfomo\b/gi], ['anticipé', /anticip[eéo]/gi], ['recuperar', /recuper/gi]];
  const NO_ENTRY = /sin\s+entrada|no\s+entr[eé]|no\s+oper[eé]|sin\s+operar|no\s+trade|no\s+entry|no\s+trades?\s+taken/i;

  TJ.dayText = e => ((e.pma || '') + '\n' + (e.notes || '')).trim();
  TJ.tagsOf = e => { const s = TJ.dayText(e); return TJ.TAGS.filter(([, re]) => re.test(s)).map(([n]) => n); };
  // Dirección: campo estructurado si existe; si no, se infiere del texto cuando solo menciona una.
  TJ.dirOf = e => {
    if (e.dir === 'long' || e.dir === 'short' || e.dir === 'none') return e.dir;
    const s = TJ.dayText(e), L = /\blong\b|\bcompr[aé]/i.test(s), S = /\bshort\b|\bvend[ií]/i.test(s);
    return L && !S ? 'long' : S && !L ? 'short' : null;
  };
  TJ.isNoEntry = e => e.dir === 'none' || NO_ENTRY.test(TJ.dayText(e));

  // Estadísticas de un grupo de días.
  TJ.stats = (list, be) => {
    const n = list.length, net = list.reduce((a, e) => a + e.pnl, 0);
    const w = list.filter(e => TJ.outcome(e.pnl, be) === 'win').length, l = list.filter(e => TJ.outcome(e.pnl, be) === 'loss').length;
    return { n, net, avg: n ? net / n : 0, wr: w + l ? w / (w + l) * 100 : 0, wins: w, losses: l, few: n < 3 };
  };

  // Grupos para comparar: día de la semana, activo, plan seguido, dirección y etiquetas del texto.
  TJ.groups = (list, be) => {
    const g = [], add = (type, name, sub) => { if (sub.length) g.push(Object.assign({ type, name }, TJ.stats(sub, be))); };
    [1, 2, 3, 4, 5].forEach(d => add('wd', d, list.filter(e => new Date(e.date + 'T12:00:00').getDay() === d)));
    ['NQ', 'ES', 'YM'].forEach(k => add('tk', k, list.filter(e => (e.tk || 'NQ') === k)));
    add('plan', 'y', list.filter(e => e.plan)); add('plan', 'n', list.filter(e => !e.plan));
    ['long', 'short'].forEach(d => add('dir', d, list.filter(e => TJ.dirOf(e) === d)));
    TJ.TAGS.forEach(([name]) => add('tag', name, list.filter(e => TJ.tagsOf(e).includes(name))));
    return g;
  };

  /** Feedback de una sesión. list: días ordenados; r: reglas de la sub-cuenta. */
  TJ.feedback = function (list, r) {
    const S = TJ.calc(list, r), be = r.be, pros = [], cons = [], acts = [];
    const status = S.lost ? 'lost' : S.ok ? 'ok' : 'run';
    const groups = TJ.groups(list, be);

    // 1) Patrón con mejor y peor expectativa frente al resto (mínimo 3 días y que exista "resto").
    const cmp = groups.filter(x => x.n >= 3 && x.n < S.n).map(x => Object.assign({}, x, { rest: (S.net - x.net) / (S.n - x.n) })).map(x => Object.assign(x, { diff: x.avg - x.rest }));
    if (cmp.length) {
      const best = cmp.reduce((a, b) => b.diff > a.diff ? b : a), worst = cmp.reduce((a, b) => b.diff < a.diff ? b : a);
      if (best.diff > 0) pros.push({ k: 'bestPattern', p: { g: best, avg: best.avg, rest: best.rest } });
      // If it's the only eligible group and it's negative, it was not reported as "best" above.
      if (worst.diff < 0) { cons.push({ k: 'worstPattern', p: { g: worst, avg: worst.avg, rest: worst.rest } }); acts.push({ k: 'actWorst', p: { g: worst } }); }
    }
    // 2) Long contra Short: diferencia de win rate > 30 puntos.
    const L = groups.find(x => x.type === 'dir' && x.name === 'long'), Sh = groups.find(x => x.type === 'dir' && x.name === 'short');
    if (L && Sh && L.n >= 2 && Sh.n >= 2 && Math.abs(L.wr - Sh.wr) > 30) {
      const weak = L.wr < Sh.wr ? L : Sh, strong = weak === L ? Sh : L;
      cons.push({ k: 'dirGap', p: { weak: weak.name, strong: strong.name, wrWeak: weak.wr, wrStrong: strong.wr } });
      acts.push({ k: 'actDir', p: { weak: weak.name } });
    }
    // 3) Racha perdedora de 3 o más.
    if (S.ms >= 3) { cons.push({ k: 'streak', p: { n: S.ms } }); acts.push({ k: 'actStreak', p: {} }); }
    // 4) Neto con plan seguido contra sin seguirlo.
    const py = TJ.stats(list.filter(e => e.plan), be), pn = TJ.stats(list.filter(e => !e.plan), be);
    if (pn.n > 0 && (pn.net < 0 || pn.avg < py.avg)) { cons.push({ k: 'planCost', p: { yNet: py.net, nNet: pn.net, yN: py.n, nN: pn.n } }); acts.push({ k: 'actPlan', p: {} }); }
    else if (pn.n === 0 && S.n >= 3) pros.push({ k: 'planAll', p: { n: S.n } });
    // 5) Neto sin los 4 mejores días.
    if (S.n > 4 && S.net > 0) {
      const top4 = list.map(e => e.pnl).sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0), rest = S.net - top4;
      if (rest <= 0) { cons.push({ k: 'top4', p: { net: S.net, rest } }); acts.push({ k: 'actTop4', p: {} }); }
      else pros.push({ k: 'robust', p: { rest } });
    }
    // 6) Drawdown máximo > 70% del límite de pérdida.
    if (S.dd > 0.7 * r.mll) { cons.push({ k: 'ddHigh', p: { dd: S.dd, pct: S.dd / r.mll * 100 } }); acts.push({ k: 'actDD', p: { lim: Math.round(r.mll * 0.25) } }); }
    else if (S.n >= 3) pros.push({ k: 'ddOk', p: { dd: S.dd, pct: S.dd / r.mll * 100 } });
    // 7) Mejor día > 40% del neto.
    if (S.net > 0 && S.n >= 3 && S.best > 0.4 * S.net) cons.push({ k: 'concentration', p: { best: S.best, pct: S.best / S.net * 100 } });
    // 8) Días sin entrada = disciplina.
    const noEntry = list.filter(TJ.isNoEntry).length;
    if (noEntry) pros.push({ k: 'noEntry', p: { n: noEntry } });
    // 9) Palabras de error repetidas en las notas.
    const errs = TJ.ERROR_WORDS.map(([w, re]) => {
      let count = 0; const days = list.filter(e => { const m = TJ.dayText(e).match(re); if (m) count += m.length; return !!m; });
      return { w, count, days: days.length, cost: days.reduce((a, e) => a + e.pnl, 0) };
    }).filter(x => x.count > 0).sort((a, b) => a.cost - b.cost);
    errs.forEach(x => cons.push({ k: 'errWord', p: x }));
    if (errs.length) acts.push({ k: 'actErr', p: { w: errs[0].w } });

    // Los 3 patrones (etiquetas del texto) que más se repiten, con su efecto en el P&L.
    const top = groups.filter(x => x.type === 'tag').sort((a, b) => b.n - a.n || b.net - a.net).slice(0, 3);

    // 3 acciones SI… ENTONCES…: primero las que salen de los contras; si faltan, generales.
    // Si el peor patrón es una dirección y ya hay alerta Long/Short, no repetir la misma idea dos veces.
    if (acts.some(a => a.k === 'actDir')) { const i = acts.findIndex(a => a.k === 'actWorst' && a.p.g.type === 'dir'); if (i >= 0) acts.splice(i, 1); }
    const actions = [];
    acts.concat([{ k: 'actDefaultStop', p: {} }, { k: 'actDefaultJournal', p: {} }, { k: 'actDefaultSize', p: {} }])
      .forEach(a => { if (actions.length < 3 && !actions.some(x => x.k === a.k)) actions.push(a); });

    const mc = S.n ? TJ.sim(list, r, 30, 1).pass : 0;
    return { status, net: S.net, days: S.n, pctTarget: S.target ? S.net / S.target * 100 : 0, wr: S.wr, pf: S.pf, dd: S.dd, best: S.best,
      worst: list.reduce((a, e) => Math.min(a, e.pnl), 0), pros, cons, top, actions, mc };
  };

  // Resumen compacto que se guarda en tj_feedback (para comparar sesiones).
  TJ.feedbackSnapshot = (fb, closedAt) => ({ closedAt, savedAt: new Date().toISOString(), status: fb.status, net: fb.net, days: fb.days, pctTarget: fb.pctTarget, wr: fb.wr, pf: fb.pf, dd: fb.dd, mc: fb.mc });
})(window.TJ = window.TJ || {});
