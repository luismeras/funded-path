/* Exportación a Excel (.xlsx) con ExcelJS, todo en el navegador: ningún dato sale del equipo.
   ExcelJS se carga solo al exportar: primero js/vendor/exceljs.min.js (si lo copias ahí funciona sin internet),
   si no existe, desde cdnjs en versión fija (solo se descarga la librería; no se envía nada).
   Hojas: Resumen (tarjetas con fórmulas) · Dias (fórmulas + columnas para anotar con listas) · Referencias (texto +
   imágenes incrustadas) · Patrones (tablas con fórmulas; etiquetas del texto) · Graficos (canvas) · Feedback. */
(function (TJ) {
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const LOCAL = 'js/vendor/exceljs.min.js';
  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = () => { s.remove(); rej(new Error(src)); };
    document.head.appendChild(s);
  });
  TJ.loadExcelJS = async () => {
    if (window.ExcelJS) return window.ExcelJS;
    try { await loadScript(LOCAL); } catch (e) { /* no vendor copy: use the CDN */ }
    if (!window.ExcelJS) await loadScript(CDN);
    if (!window.ExcelJS) throw new Error('ExcelJS');
    return window.ExcelJS;
  };

  const MONEY = '"$"#,##0;[Red]-"$"#,##0', PCT = '0.0%', RATIO = '0.00';
  const DARK = 'FF111111', SOFT = 'FFF2F2F2', NOTE = 'FFFFF8E1', GREEN = 'FF0F7A45', RED = 'FFC8210A';
  const colL = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }; // 0 → A
  const head = (row, fill) => row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill || DARK } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  const fill = (c, argb) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };

  // ---------- images ----------
  // Stored images are WebP; Excel needs PNG/JPEG → redraw on a canvas (max 640×360, shown at half size).
  async function toJpeg(ref) {
    try {
      const blob = TJ.images.isId(ref) ? await TJ.images.getImage(ref) : TJ.images.dataUrlToBlob(ref);
      if (!blob) return null;
      const bmp = await createImageBitmap(blob), k = Math.min(1, 640 / bmp.width, 360 / bmp.height);
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      return { buf: await out.arrayBuffer(), w: c.width / 2, h: c.height / 2 };
    } catch (e) { return null; }
  }

  // ---------- charts (canvas → PNG) ----------
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.font = '14px Arial'; return [c, g]; };
  const png = async c => (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer();
  const usd = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  function axes(g, W, H, P, lo, hi, n, labels) {
    g.strokeStyle = '#e3e3e3'; g.fillStyle = '#666'; g.lineWidth = 1; g.textAlign = 'right';
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = P.t + (1 - i / 4) * (H - P.t - P.b); g.beginPath(); g.moveTo(P.l, y); g.lineTo(W - P.r, y); g.stroke(); g.fillText(usd(v), P.l - 8, y + 5); }
    g.textAlign = 'center';
    labels.forEach(([k, s]) => g.fillText(s, P.l + (n > 1 ? k / (n - 1) : 0.5) * (W - P.l - P.r), H - P.b + 22));
  }
  async function chartBalance(list, r, L) {
    const S = TJ.calc(list, r), W = 1100, H = 420, P = { l: 90, r: 30, t: 50, b: 50 }, [c, g] = canvas(W, H);
    const bal = [S.size].concat(S.rows.map(x => x.bal)), fl = [S.size - r.mll].concat(S.rows.map(x => x.floor)), tgt = S.size + S.target, n = bal.length;
    let lo = Math.min(...bal, ...fl), hi = Math.max(...bal, tgt); const m = (hi - lo) * 0.08 || 100; lo -= m; hi += m;
    const X = i => P.l + (n > 1 ? i / (n - 1) : 0) * (W - P.l - P.r), Y = v => P.t + (hi - v) / (hi - lo) * (H - P.t - P.b);
    g.fillStyle = '#111'; g.font = 'bold 18px Arial'; g.textAlign = 'left'; g.fillText(L.chBal, P.l, 28); g.font = '13px Arial';
    const step = Math.max(1, Math.ceil(n / 6)), lab = []; for (let i = 0; i < n; i += step) lab.push([i, i ? S.rows[i - 1].date.slice(5) : L.start]);
    axes(g, W, H, P, lo, hi, n, lab);
    g.setLineDash([8, 6]); g.strokeStyle = '#999'; g.beginPath(); g.moveTo(P.l, Y(tgt)); g.lineTo(W - P.r, Y(tgt)); g.stroke(); g.setLineDash([]);
    const line = (arr, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); arr.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); };
    line(fl, '#c8210a', 2); line(bal, '#0f7a45', 3);
    g.font = '13px Arial'; g.textAlign = 'left';
    [['#0f7a45', L.chEq], ['#c8210a', L.chFloor], ['#999', L.chTgt]].forEach(([col, s], i) => { g.fillStyle = col; g.fillRect(W - 360 + i * 120, 18, 18, 4); g.fillStyle = '#333'; g.fillText(s, W - 336 + i * 120, 25); });
    return png(c);
  }
  async function chartPnl(list, r, L) {
    const W = 1100, H = 380, P = { l: 90, r: 30, t: 50, b: 50 }, [c, g] = canvas(W, H), n = list.length;
    const vals = list.map(e => e.pnl); let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals); if (lo === hi) hi = 1;
    const Y = v => P.t + (hi - v) / (hi - lo) * (H - P.t - P.b), bw = (W - P.l - P.r) / Math.max(1, n);
    g.fillStyle = '#111'; g.font = 'bold 18px Arial'; g.textAlign = 'left'; g.fillText(L.chPnl, P.l, 28); g.font = '13px Arial';
    const step = Math.max(1, Math.ceil(n / 8)), lab = []; for (let i = 0; i < n; i += step) lab.push([i, list[i].date.slice(5)]);
    axes(g, W, H, { l: P.l + bw / 2, r: P.r + bw / 2, t: P.t, b: P.b }, lo, hi, n, lab);
    list.forEach((e, i) => { const o = TJ.outcome(e.pnl, r.be); g.fillStyle = o === 'win' ? '#0f7a45' : o === 'loss' ? '#c8210a' : '#9a9a9a'; const y0 = Y(0), y1 = Y(e.pnl); g.fillRect(P.l + i * bw + bw * 0.15, Math.min(y0, y1), bw * 0.7, Math.max(1, Math.abs(y1 - y0))); });
    g.strokeStyle = '#333'; g.beginPath(); g.moveTo(P.l, Y(0)); g.lineTo(W - P.r, Y(0)); g.stroke();
    return png(c);
  }
  async function chartWL(list, r, L) {
    const W = 1100, H = 260, [c, g] = canvas(W, H), cnt = { win: 0, loss: 0, be: 0 };
    list.forEach(e => cnt[TJ.outcome(e.pnl, r.be)]++);
    const tot = Math.max(1, list.length), rows = [['win', L.won, '#0f7a45'], ['loss', L.lost, '#c8210a'], ['be', L.be, '#9a9a9a']];
    g.fillStyle = '#111'; g.font = 'bold 18px Arial'; g.fillText(L.chWL, 40, 32);
    rows.forEach(([k, s, col], i) => {
      const y = 60 + i * 62, w = (W - 360) * cnt[k] / tot;
      g.fillStyle = '#333'; g.font = '15px Arial'; g.fillText(s, 40, y + 26);
      g.fillStyle = '#eee'; g.fillRect(180, y, W - 360, 36); g.fillStyle = col; g.fillRect(180, y, w, 36);
      g.fillStyle = '#111'; g.font = 'bold 15px Arial'; g.fillText(cnt[k] + '  (' + Math.round(cnt[k] / tot * 100) + '%)', W - 160, y + 25);
    });
    return png(c);
  }

  /**
   * o = { tt, name, r, list, fb: rendered feedback { title, rows:[[label,value]], pros:[], cons:[], top:[[name,days,net,avg]],
   *       actions:[], mc, cmp:[[metric, prev, now]] } }
   */
  TJ.buildXlsx = async function (o) {
    const ExcelJS = await TJ.loadExcelJS();
    const X = o.tt.xl, r = o.r, list = o.list, n = list.length, S = TJ.calc(list, r);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Funded Path'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    const q = s => "'" + s + "'!";
    const SUM = q(X.sSum), DAYS = q(X.sDays);
    const first = 2, last = Math.max(n + 1, 2), rng = col => DAYS + '$' + col + '$' + first + ':$' + col + '$' + last;
    const W_ = X.win, LO = X.loss, BE_ = X.be;

    // ---- Resumen: parámetros (los usan las fórmulas de Dias) ----
    const ws = wb.addWorksheet(X.sSum, { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 26 }, { width: 3 }, { width: 26 }, { width: 3 }, { width: 26 }, { width: 4 }, { width: 24 }, { width: 16 }];
    ws.mergeCells('A1:E1'); ws.getCell('A1').value = 'Funded Path — ' + o.name; ws.getCell('A1').font = { bold: true, size: 18 };
    ws.mergeCells('A2:E2'); ws.getCell('A2').value = o.sub; ws.getCell('A2').font = { color: { argb: 'FF666666' } };
    const P = { ini: 'H5', tgt: 'H6', mll: 'H7', type: 'H8', be: 'H9' }, ref = k => SUM + '$' + P[k][0] + '$' + P[k].slice(1);
    ws.getCell('G4').value = X.params; head(ws.getRow(4)); ws.getCell('A4').value = null;
    [['G5', X.pIni, r.size, MONEY], ['G6', X.pTgt, S.target, MONEY], ['G7', X.pMll, r.mll, MONEY], ['G8', X.pType, r.type, null], ['G9', X.pBe, r.be, MONEY]].forEach(([c, l, v, f]) => {
      ws.getCell(c).value = l; const vc = ws.getCell('H' + c.slice(1)); vc.value = v; if (f) vc.numFmt = f; fill(vc, NOTE);
    });
    ws.getCell('G10').value = X.paramsNote; ws.getCell('G10').font = { italic: true, size: 9, color: { argb: 'FF888888' } };
    ws.getCell('G10').alignment = { wrapText: true }; ws.mergeCells('G10:H12');

    // ---- Dias ----
    const wd = wb.addWorksheet(X.sDays, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    const cols = [
      [X.cDate, 12], [X.cWd, 11], [X.cTk, 8], ['P&L', 11], [X.cRes, 12], [X.cCum, 12], [X.cBal, 12], [X.cPeak, 12], [X.cFloor, 12], [X.cCush, 11], [X.cPctT, 11], [X.cPlan, 10],
      [X.cLs, 8], [X.cWs, 8],
      [X.aDir, 13], [X.aBias, 13], [X.aInv, 16], [X.aBroke, 14], [X.aWith, 14], [X.aPd, 14], [X.aModel, 18], [X.aErr, 18], [X.aLesson, 30], [X.aGrade, 12],
      [X.cStatus, 16]];
    // Account status on every row (last column, so the formula columns keep their letters).
    const accStatus = r.closed ? o.tt.stClosed : S.lost ? o.tt.stLost : S.ok ? (S.mode === 'funded' ? o.tt.stPayout : o.tt.stOk) : X.stOpen;
    wd.columns = cols.map(([h, w]) => ({ header: h, width: w }));
    head(wd.getRow(1)); wd.getRow(1).height = 32;
    for (let c = 14; c < 24; c++) { const h = wd.getRow(1).getCell(c + 1); fill(h, 'FF5A4A00'); } // annotation columns: different header color
    ['H', 'M', 'N'].forEach(c => { wd.getColumn(c).hidden = true; }); // helper columns (peak, streaks)
    const bandOk = `AND(D{r}>0,D{r}>=${ref('be')})`, bandLo = `AND(D{r}<0,D{r}<=-${ref('be')})`;
    list.forEach((e, i) => {
      const row = i + 2, R = s => s.replace(/\{r\}/g, row).replace(/\{p\}/g, row - 1), calcRow = S.rows[i];
      const [y, m, d] = e.date.split('-').map(Number), o2 = TJ.outcome(e.pnl, r.be);
      const vals = [new Date(Date.UTC(y, m - 1, d)), o.tt.wdLong[new Date(e.date + 'T12:00:00').getDay()], e.tk || 'NQ', e.pnl,
        { formula: R(`IF(${bandOk},"${W_}",IF(${bandLo},"${LO}","${BE_}"))`), result: o2 === 'win' ? W_ : o2 === 'loss' ? LO : BE_ },
        { formula: i ? R('F{p}+D{r}') : R('D{r}'), result: calcRow.bal - r.size },
        { formula: R(`${ref('ini')}+F{r}`), result: calcRow.bal },
        { formula: i ? R('MAX(H{p},G{r})') : R(`MAX(${ref('ini')},G{r})`), result: 0 },
        { formula: R(`IF(${ref('type')}="trailing",MIN(${ref('ini')},H{r}-${ref('mll')}),${ref('ini')}-${ref('mll')})`), result: calcRow.floor },
        { formula: R('G{r}-I{r}'), result: calcRow.cush },
        { formula: R(`IFERROR(F{r}/${ref('tgt')},0)`), result: S.target ? (calcRow.bal - r.size) / S.target : 0 },
        e.plan ? o.tt.yes : o.tt.no,
        { formula: i ? R(`IF(E{r}="${LO}",M{p}+1,0)`) : R(`IF(E{r}="${LO}",1,0)`), result: 0 },
        { formula: i ? R(`IF(E{r}="${W_}",N{p}+1,0)`) : R(`IF(E{r}="${W_}",1,0)`), result: 0 },
        e.dir === 'long' ? 'Long' : e.dir === 'short' ? 'Short' : e.dir === 'none' ? X.noEntry : null];
      const rw = wd.addRow(vals);
      rw.getCell(1).numFmt = 'yyyy-mm-dd';
      [4, 6, 7, 9, 10].forEach(c => { rw.getCell(c).numFmt = MONEY; }); rw.getCell(11).numFmt = PCT;
      rw.getCell(4).font = { bold: true, color: { argb: o2 === 'win' ? GREEN : o2 === 'loss' ? RED : 'FF666666' } };
      for (let c = 15; c <= 24; c++) fill(rw.getCell(c), NOTE);
      rw.getCell(25).value = accStatus; rw.getCell(25).font = { bold: true, color: { argb: r.closed ? 'FF666666' : 'FF111111' } };
      const dv = (c, list2) => { rw.getCell(c).dataValidation = { type: 'list', allowBlank: true, showErrorMessage: false, formulae: ['"' + list2.join(',') + '"'] }; };
      dv(15, ['Long', 'Short', X.noEntry]); dv(16, X.biasOpts); dv(18, [o.tt.yes, o.tt.no]); dv(19, [X.with, X.against]);
      dv(20, X.pdOpts); dv(22, X.errOpts);
      rw.getCell(24).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, showErrorMessage: true, formulae: [1, 5], errorTitle: X.aGrade, error: '1-5' };
      [17, 21, 23].forEach(c => { rw.getCell(c).alignment = { wrapText: true, vertical: 'top' }; });
    });
    wd.autoFilter = { from: 'A1', to: colL(cols.length - 1) + '1' };

    // ---- Resumen: tarjetas (fórmulas) ----
    let ws0 = 0, wsMax = 0;
    list.forEach(e => { if (TJ.outcome(e.pnl, r.be) === 'win') { ws0++; wsMax = Math.max(wsMax, ws0); } else ws0 = 0; });
    const avg = (k) => `IFERROR(AVERAGEIF(${rng('E')},"${k}",${rng('D')}),0)`;
    const cards = [
      [X.kNet, `SUM(${rng('D')})`, MONEY, S.net], [X.kPctTgt, `IFERROR(SUM(${rng('D')})/${ref('tgt')},0)`, PCT, S.target ? S.net / S.target : 0],
      [X.kBal, `${ref('ini')}+SUM(${rng('D')})`, MONEY, S.bal],
      [X.kWr, `IFERROR(COUNTIF(${rng('E')},"${W_}")/(COUNTIF(${rng('E')},"${W_}")+COUNTIF(${rng('E')},"${LO}")),0)`, PCT, S.wr / 100],
      [X.kLossPct, `IFERROR(COUNTIF(${rng('E')},"${LO}")/COUNT(${rng('D')}),0)`, PCT, n ? S.loss.length / n : 0],
      [X.kBePct, `IFERROR(COUNTIF(${rng('E')},"${BE_}")/COUNT(${rng('D')}),0)`, PCT, n ? (n - S.wins.length - S.loss.length) / n : 0],
      [X.kPf, `IFERROR(SUMIF(${rng('E')},"${W_}",${rng('D')})/ABS(SUMIF(${rng('E')},"${LO}",${rng('D')})),0)`, RATIO, S.pf],
      [X.kAvgW, avg(W_), MONEY, S.avgW], [X.kAvgL, avg(LO), MONEY, -S.avgL],
      [X.kRatio, `IFERROR(${avg(W_)}/ABS(${avg(LO)}),0)`, RATIO, S.avgL ? S.avgW / S.avgL : 0],
      [X.kExp, `IFERROR(AVERAGE(${rng('D')}),0)`, MONEY, S.exp], [X.kDays, `COUNT(${rng('D')})`, '0', n],
      [X.kBest, `IFERROR(MAX(${rng('D')}),0)`, MONEY, S.best], [X.kWorst, `IFERROR(MIN(${rng('D')}),0)`, MONEY, list.reduce((a, e) => Math.min(a, e.pnl), 0)],
      [X.kLs, `IFERROR(MAX(${rng('M')}),0)`, '0', S.ms], [X.kWs, `IFERROR(MAX(${rng('N')}),0)`, '0', wsMax],
      [X.kDd, `IFERROR(MAX(INDEX(${rng('H')}-${rng('G')},0)),0)`, MONEY, S.dd], [X.kCush, `IFERROR(MIN(${rng('J')}),${ref('ini')}-${ref('mll')})`, MONEY, S.rows.length ? Math.min(...S.rows.map(x => x.cush)) : r.mll]];
    cards.forEach(([label, formula, fmt, result], i) => {
      const col = ['A', 'C', 'E'][i % 3], row = 4 + Math.floor(i / 3) * 3;
      const lc = ws.getCell(col + row), vc = ws.getCell(col + (row + 1));
      lc.value = label; lc.font = { size: 9, bold: true, color: { argb: 'FF666666' } }; fill(lc, SOFT);
      vc.value = { formula, result }; vc.numFmt = fmt; vc.font = { size: 16, bold: true }; fill(vc, SOFT);
      vc.border = { bottom: { style: 'thick', color: { argb: 'FF111111' } } };
    });

    // ---- Referencias: texto + imágenes incrustadas + anotaciones ----
    const wr = wb.addWorksheet(X.sRefs, { views: [{ state: 'frozen', ySplit: 1 }] });
    wr.columns = [{ header: X.cDate, width: 12 }, { header: 'P&L', width: 10 }, { header: 'Pre Market Analysis', width: 42 }, { header: 'Entry', width: 42 },
      { header: X.rPmaImg, width: 47 }, { header: X.rEntryImg, width: 47 }, { header: X.rNotes, width: 36 }];
    head(wr.getRow(1)); wr.getRow(1).height = 24;
    let rr = 2;
    for (const e of list) {
      const im = { pma: (e.pmaImgs || (e.img ? [e.img] : [])), entry: e.entryImgs || [] };
      const k = Math.max(1, im.pma.length, im.entry.length), start = rr;
      for (let j = 0; j < k; j++) wr.addRow([]);
      const top = wr.getRow(start);
      top.getCell(1).value = e.date; top.getCell(2).value = e.pnl; top.getCell(2).numFmt = MONEY;
      top.getCell(3).value = e.pma || ''; top.getCell(4).value = e.notes || '';
      [1, 2, 3, 4, 7].forEach(c => { top.getCell(c).alignment = { wrapText: true, vertical: 'top' }; if (k > 1) wr.mergeCells(start, c, start + k - 1, c); });
      fill(top.getCell(7), NOTE);
      for (let j = 0; j < k; j++) {
        const row = wr.getRow(start + j); let hgt = 0;
        for (const [zone, col] of [['pma', 4], ['entry', 5]]) {
          const ref = im[zone][j]; if (!ref) continue;
          const pic = await toJpeg(ref); if (!pic) continue;
          const id = wb.addImage({ buffer: pic.buf, extension: 'jpeg' });
          wr.addImage(id, { tl: { col: col + 0.04, row: start + j - 1 + 0.06 }, ext: { width: pic.w, height: pic.h }, editAs: 'oneCell' });
          hgt = Math.max(hgt, pic.h);
        }
        row.height = hgt ? hgt * 0.75 + 10 : Math.min(160, 15 * Math.max(2, Math.ceil(Math.max((e.pma || '').length, (e.notes || '').length) / 48)));
      }
      rr = start + k;
    }

    // ---- Patrones ----
    const wp = wb.addWorksheet(X.sPat, { views: [{ showGridLines: false }] });
    wp.columns = [{ width: 26 }, { width: 10 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 14 }];
    let pr = 1;
    const section = (title, note, items) => {
      wp.getCell('A' + pr).value = title; wp.getCell('A' + pr).font = { bold: true, size: 13 };
      if (note) { wp.getCell('C' + pr).value = note; wp.getCell('C' + pr).font = { italic: true, size: 9, color: { argb: 'FF888888' } }; }
      pr++;
      const h = wp.getRow(pr); h.values = [X.pName, X.pDays, X.pWr, X.pNet, X.pAvg, '']; head(h); pr++;
      items.forEach(it => {
        const row = wp.getRow(pr);
        row.getCell(1).value = it.name;
        ['days', 'wr', 'net', 'avg'].forEach((k, i) => { row.getCell(i + 2).value = it[k]; });
        row.getCell(3).numFmt = PCT; row.getCell(4).numFmt = MONEY; row.getCell(5).numFmt = MONEY;
        row.getCell(6).value = { formula: `IF(B${pr}<3,"${X.few}","")`, result: '' }; row.getCell(6).font = { italic: true, color: { argb: 'FFB26B00' } };
        pr++;
      });
      pr++;
    };
    // Tables from Dias columns: formulas, so they update as you annotate the Dias sheet.
    const fx = (col, crit) => ({
      days: { formula: `COUNTIF(${rng(col)},"${crit}")`, result: 0 },
      wr: { formula: `IFERROR(COUNTIFS(${rng(col)},"${crit}",${rng('E')},"${W_}")/(COUNTIFS(${rng(col)},"${crit}",${rng('E')},"${W_}")+COUNTIFS(${rng(col)},"${crit}",${rng('E')},"${LO}")),0)`, result: 0 },
      net: { formula: `SUMIF(${rng(col)},"${crit}",${rng('D')})`, result: 0 },
      avg: { formula: `IFERROR(AVERAGEIF(${rng(col)},"${crit}",${rng('D')}),0)`, result: 0 }
    });
    section(X.tWd, null, [1, 2, 3, 4, 5].map(i => Object.assign({ name: o.tt.wdLong[i] }, fx('B', o.tt.wdLong[i]))));
    section(X.tTk, null, ['NQ', 'ES', 'YM'].map(k => Object.assign({ name: k }, fx('C', k))));
    section(X.tPlan, null, [[o.tt.followed, o.tt.yes], [o.tt.broke, o.tt.no]].map(([nm, v]) => Object.assign({ name: nm }, fx('L', v))));
    section(X.tDir, X.fromNotes, [['Long', 'Long'], ['Short', 'Short'], [X.noEntry, X.noEntry]].map(([nm, v]) => Object.assign({ name: nm }, fx('O', v))));
    section(X.tBias, X.fromNotes, [X.with, X.against].map(v => Object.assign({ name: v }, fx('S', v))));
    const tags = TJ.groups(list, r.be).filter(g => g.type === 'tag');
    section(X.tTags, X.tagsNote, TJ.TAGS.map(([nm]) => { const g = tags.find(x => x.name === nm) || { n: 0, wr: 0, net: 0, avg: 0 }; return { name: nm, days: g.n, wr: g.wr / 100, net: g.net, avg: g.avg }; }));

    // ---- Graficos ----
    const wg = wb.addWorksheet(X.sCharts, { views: [{ showGridLines: false }] });
    wg.getColumn(1).width = 4;
    const LC = { chBal: X.chBal, chPnl: X.chPnl, chWL: X.chWL, chEq: X.chEq, chFloor: X.chFloor, chTgt: X.chTgt, start: X.start, won: X.won, lost: X.lost, be: BE_ };
    const charts = [[await chartBalance(list, r, LC), 420], [await chartPnl(list, r, LC), 380], [await chartWL(list, r, LC), 260]];
    let gy = 1;
    charts.forEach(([buf, h]) => { const id = wb.addImage({ buffer: buf, extension: 'png' }); wg.addImage(id, { tl: { col: 1, row: gy }, ext: { width: 825, height: h * 0.75 } }); gy += Math.ceil(h * 0.75 / 20) + 2; });

    // ---- Feedback ----
    const wf = wb.addWorksheet(X.sFb, { views: [{ showGridLines: false }] });
    wf.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }];
    const fb = o.fb; let fr = 1;
    const line = (txt, font, color) => { const c = wf.getCell('A' + fr); wf.mergeCells(fr, 1, fr, 4); c.value = txt; c.font = Object.assign({}, font, color ? { color: { argb: color } } : {}); c.alignment = { wrapText: true, vertical: 'top' }; wf.getRow(fr).height = Math.max(18, 15 * Math.ceil(String(txt).length / 95)); fr++; };
    line(fb.title, { bold: true, size: 16 });
    fb.rows.forEach(([l, v]) => { wf.getCell('A' + fr).value = l; wf.getCell('A' + fr).font = { color: { argb: 'FF666666' } }; wf.getCell('B' + fr).value = v; wf.getCell('B' + fr).font = { bold: true }; fr++; });
    fr++;
    const list2 = (title, items, color) => { line(title, { bold: true, size: 13 }, color); (items.length ? items : [fb.none]).forEach(s => line('• ' + s, {})); fr++; };
    list2(X.fPros, fb.pros, GREEN); list2(X.fCons, fb.cons, RED);
    line(X.fTop, { bold: true, size: 13 });
    const th = wf.getRow(fr); th.values = [X.pName, X.pDays, X.pNet, X.pAvg]; head(th); fr++;
    (fb.top.length ? fb.top : [[fb.none, '', '', '']]).forEach(t => { const row = wf.getRow(fr); row.values = t; [3, 4].forEach(c => { row.getCell(c).numFmt = MONEY; }); fr++; });
    fr++;
    list2(X.fActs, fb.actions);
    line(fb.mc, { bold: true });
    if (fb.cmp && fb.cmp.length) {
      fr++; line(X.fCmp, { bold: true, size: 13 });
      const ch = wf.getRow(fr); ch.values = [X.fMetric, X.fPrev, X.fNow, 'Δ']; head(ch); fr++;
      fb.cmp.forEach(c => { wf.getRow(fr).values = c; fr++; });
    }

    // Orden de hojas como en la especificación: Resumen, Dias, Referencias, Patrones, Graficos, Feedback.
    return wb.xlsx.writeBuffer();
  };
})(window.TJ = window.TJ || {});
