/* Capa de acceso a datos. Hoy: localStorage (claves tj_lang, tj_theme, tj_accounts, tj_entries, tj_rules).
   Para pasar a backend + autenticación, reemplaza estas funciones manteniendo la misma interfaz.

   Modelo:
   - tj_accounts: { subs: { Backtest: [{id, name}], Demo: [...], Live: [...] }, active: { Backtest: id, ... } }
   - tj_entries:  { [subId]: [{date, tk, pnl, plan, pma, img, notes}] }
   - tj_rules:    { [subId]: {size, pct, mll, type, be} }
   Las sub-cuentas iniciales usan como id el nombre del tipo ('Backtest', 'Demo', 'Live'), así los datos
   guardados antes de existir sub-cuentas siguen funcionando sin migración. */
(function (TJ) {
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  TJ.defaultAccounts = () => ({
    subs: { Backtest: [{ id: 'Backtest', name: 'Backtest 1' }], Demo: [{ id: 'Demo', name: 'Demo 1' }] },
    active: { Backtest: 'Backtest', Demo: 'Demo' }
  });

  TJ.store = {
    pref(k) { try { return localStorage.getItem('tj_' + k); } catch (e) { return null; } },
    setPref(k, v) { try { localStorage.setItem('tj_' + k, v); } catch (e) {} },

    loadAccounts() {
      const v = read('tj_accounts'), d = TJ.defaultAccounts();
      if (!isObj(v) || !isObj(v.subs)) return d;
      TJ.ACCOUNTS.forEach(a => {
        const subs = (Array.isArray(v.subs[a]) ? v.subs[a] : []).filter(s => s && typeof s.id === 'string' && typeof s.name === 'string');
        if (subs.length) d.subs[a] = subs;
        const act = v.active && v.active[a];
        d.active[a] = d.subs[a].some(s => s.id === act) ? act : d.subs[a][0].id;
      });
      return d;
    },
    // Keeps sub-account lists of types no longer shown (e.g. Live) so their saved data stays linked.
    saveAccounts(acc) {
      const prev = read('tj_accounts'), out = { subs: Object.assign({}, acc.subs), active: Object.assign({}, acc.active) };
      if (isObj(prev) && isObj(prev.subs)) Object.keys(prev.subs).forEach(k => { if (!TJ.ACCOUNTS.includes(k)) { out.subs[k] = prev.subs[k]; if (prev.active && prev.active[k]) out.active[k] = prev.active[k]; } });
      write('tj_accounts', out);
    },

    loadEntries() {
      const v = read('tj_entries'), out = {};
      if (isObj(v)) Object.keys(v).forEach(k => { if (Array.isArray(v[k])) out[k] = v[k]; });
      return out;
    },
    // Bytes used by this app in localStorage (UTF-16 → 2 bytes per char). Browsers cap it around 5 MB.
    textUsage() {
      let n = 0;
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('tj_')) n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {}
      return n;
    },
    // True only when tj_entries exists and parses (used before deleting orphan images).
    hasEntries() { return isObj(read('tj_entries')); },
    saveEntries(entries) {
      // Cuota llena (imágenes): no se escribe nada y se devuelve false; lo ya guardado queda intacto
      // y la app avisa en el formulario en vez de borrar imágenes de otros días.
      try { localStorage.setItem('tj_entries', JSON.stringify(entries)); return true; }
      catch (e) { return false; }
    },

    loadRules() {
      const v = read('tj_rules'), out = {};
      if (isObj(v)) Object.keys(v).forEach(k => { if (isObj(v[k]) && typeof v[k].size === 'number') out[k] = v[k]; });
      // Break-even band default moved from ±$50 to under $150: upgrade accounts still on the old default once.
      if (!this.pref('be150')) {
        Object.keys(out).forEach(k => { if (out[k].be === 50) out[k] = Object.assign({}, out[k], { be: 150 }); });
        this.saveRules(out); this.setPref('be150', '1');
      }
      return out;
    },
    saveRules(rules) { write('tj_rules', rules); },

    // Feedback de sesiones cerradas: { [subId]: [ {closedAt, savedAt, status, net, days, pctTarget, wr, pf, dd, mc} ] }
    loadFeedback() { const v = read('tj_feedback'); return isObj(v) ? v : {}; },
    saveFeedback(fb) { write('tj_feedback', fb); }
  };
})(window.TJ = window.TJ || {});
