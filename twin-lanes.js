/* ChargePoint Digital Twin · Lane Vision
   Finds every parking row and driving lane of a car park from the satellite photo itself, so lanes are outlined even where no map data exists.
   1. Car park footprint: the mapped outline or mapped lanes when they exist, otherwise the area around the pin minus buildings and roads.
   2. The sharpest satellite photo (Esri, zoom 19, about 30 cm a pixel) is read pixel by pixel.
   3. Row direction: every angle is tried; the one where detail lines up in regular bands (car rows) against smooth bands (lanes) wins.
   4. Across the rows, busy bands are parking rows, smooth bands are driving lanes. Each row is measured along its length.
   5. Drawn like a site design: rows outlined, bays every 2.5 m, lanes dashed, with a space count. An image reading, to check against the photo. */
(() => {
  const start = () => { const S = window.__twin; if (S && S.api && S.api.map) init(S); };
  if (window.__twin) start(); else document.addEventListener('twin-ready', start, { once: true });

  function init(S) {
    const A = S.api, Z = 19, BAY = 2.5;
    const head = A.dlg.querySelector('.tw-map-head'), pk = head.querySelector('.tw-pk');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tw-lv'; btn.textContent = 'Lane Vision';
    btn.title = 'Read the satellite photo and outline every parking row, bay and driving lane around the pin';
    pk.after(btn);
    const hint = A.hint;

    // ---- tile maths (Web Mercator, global pixels at zoom 19) ----
    const W = 256 * 2 ** Z, toPx = (lon, lat) => { const r = lat * Math.PI / 180; return [(lon + 180) / 360 * W, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * W]; };
    const toLL = (x, y) => [x / W * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / W))) * 180 / Math.PI];

    async function photo(x0, y0, x1, y1, z = Z) {   // stitched tiles (zoom 19 unless told) covering a global-pixel box at that zoom
      const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256), tx1 = Math.floor(x1 / 256), ty1 = Math.floor(y1 / 256);
      const c = document.createElement('canvas'); c.width = (tx1 - tx0 + 1) * 256; c.height = (ty1 - ty0 + 1) * 256; const g = c.getContext('2d', { willReadFrequently: true });
      const jobs = []; for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => { g.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256); res(1); }; im.onerror = () => res(0); im.src = `${A.ESRI}${z}/${ty}/${tx}`; }));
      const ok = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
      return { c, g, ox: tx0 * 256, oy: ty0 * 256, ok };
    }

    async function run() {
      const map = A.map(); if (!map) return;
      if (map.getZoom() < 15) { hint('Zoom in to the car park first, then press Lane Vision.'); return; }
      const p = A.pin(), ctr = p ? [p.lon, p.lat] : [map.getCenter().lng, map.getCenter().lat];
      // a new reading starts clean: the last drawing, stalls and badges go
      LVS = null; badges.forEach(mk => mk.remove()); badges = []; tools.hidden = true; ['lv-r', 'lv-b', 'lv-e', 'lv-a', 'lv-h'].forEach(id => { const src = map.getSource(id); if (src) src.setData({ type: 'FeatureCollection', features: [] }); });
      btn.disabled = true; hint('Lane Vision is reading the satellite photo…');
      const sw = A.dlg.querySelector('.tw-sweep'); if (sw) { sw.hidden = false; sw.classList.add('is-scan'); }
      try { await detect(map, ctr, p); } catch (e) { hint('Lane Vision could not read the photo here. Try again, or move the pin onto the car park.'); }
      if (sw) { sw.classList.remove('is-scan'); sw.hidden = true; } btn.disabled = false;
    }

    // ---- every car park in view: each one read in turn, the bays merged into one plan (duplicates where car parks overlap removed) ----
    const allBtn = document.createElement('button'); allBtn.type = 'button'; allBtn.className = 'tw-lv tw-lvall'; allBtn.textContent = 'All car parks';
    allBtn.title = 'Read every car park in the map view with Lane Vision and draw all their bays together'; btn.after(allBtn);
    let ALL = null;
    async function runAll() {
      const map = A.map(); if (!map) return;
      if (ALL) { ALL.stop = true; allBtn.textContent = 'Stopping…'; return; }
      if (map.getZoom() < 14.5) { hint('Zoom in to a district or a mall first (a few streets across), then press All car parks.'); return; }
      ALL = { stop: false }; allBtn.textContent = 'Stop'; btn.disabled = true;
      LVS = null; badges.forEach(mk => mk.remove()); badges = []; tools.hidden = true; ['lv-r', 'lv-b', 'lv-e', 'lv-a', 'lv-h', 'lv-k'].forEach(id => { const src = map.getSource(id); if (src) src.setData({ type: 'FeatureCollection', features: [] }); });
      const sw = A.dlg.querySelector('.tw-sweep'); if (sw) { sw.hidden = false; sw.classList.add('is-scan'); }
      try {
        // the car parks: the list from Outline parking, found first if it is empty or belongs to another view
        const b = map.getBounds(), inView = l => b.contains([l.lon, l.lat]);
        if (!A.PK.list.length || !A.PK.list.some(inView)) { hint('Finding the car parks in this view…'); A.dlg.querySelector('.tw-pk').click();
          for (let t = 0; t < 50 && !(A.PK.list.length && A.PK.list.some(inView)); t++) await new Promise(r => setTimeout(r, 500)); await new Promise(r => setTimeout(r, 1500)); }
        const c = map.getCenter(), kx = 111320 * Math.cos(c.lat * Math.PI / 180), dC = l => Math.hypot((l.lon - c.lng) * kx, (l.lat - c.lat) * 110540);
        const lots = A.PK.list.filter(inView).sort((x, y) => dC(x) - dC(y)).slice(0, 20);
        if (!lots.length) { hint('No car parks are mapped in this view. Move the map, or use Lane Vision on a dropped pin.'); return; }
        const out = { rows: [], bays: [], aisles: [], blocks: [] }, runs = [], OB = { blds: [], roads: [], aisles: [] }, seen = new Map(); let spaces = 0, read = 0, mpp = 0;
        const key = ll => Math.round(ll[0] * kx / 1.5) + ':' + Math.round(ll[1] * 110540 / 1.5);   // 1.5 m cells: one bay per spot across overlapping car parks
        for (let i = 0; i < lots.length && !ALL.stop; i++) { const l = lots[i]; hint(`Lane Vision is reading car park ${i + 1} of ${lots.length}${l.name ? ' (' + l.name + ')' : ''}… ${spaces ? spaces + ' spaces so far.' : ''}`);
          let r = null; try { r = await detect(map, [l.lon, l.lat], { lot: l, name: l.label, lat: l.lat, lon: l.lon }, { collect: true }); } catch (e) { r = null; }
          if (!r) continue; read++; mpp = mpp || r.mpp; ['blds', 'roads', 'aisles'].forEach(k => (r.OBST[k] || []).forEach(x => OB[k].push(x)));
          r.runs.forEach(run => { run.comp = (i + 1) * 100000 + run.comp; run.bays = run.bays.filter(bb => { const k = key(bb.c); if (seen.has(k)) return false; seen.set(k, 1); return true; });
            if (run.bays.length < 2) return; runs.push(run); out.rows.push(run.ring); run.bays.forEach(bb => out.bays.push(bb)); spaces += run.bays.length; });
          r.out.aisles.forEach(a => out.aisles.push(a)); r.out.blocks.forEach(a => out.blocks.push(a));
          if (runs.length) { LVS = { map, out, runs, nearest: runs[0], pu: runs[0].bays[0].u, edited: false, bayPx: BAY / mpp, mpp, obst: OB, lot: null }; draw(map, out); } }
        if (!runs.length) { hint('Lane Vision found no parking rows in the car parks of this view. Try zooming in on one car park.'); return; }
        // the pin goes to the bay closest to the centre of the view; canopies follow that row
        let nearest = runs[0], nb = runs[0].bays[0], nd = 1e9; runs.forEach(r => r.bays.forEach(bb => { const d = Math.hypot((bb.c[0] - c.lng) * kx, (bb.c[1] - c.lat) * 110540); if (d < nd) { nd = d; nearest = r; nb = bb; } }));
        A.setPin(nb.c[1], nb.c[0], null, { rot: nearest.rot, lot: { label: `${read} car parks`, kind: 'Surface', rows: out.rows, ring: null, lines: null, rot: nearest.rot,
          capText: `about ${spaces.toLocaleString('en-US')} spaces in ${out.rows.length} rows across ${read} car parks, read from the satellite photo` } });
        LVS = { map, out, runs, nearest, pu: nb.u, edited: false, bayPx: BAY / mpp, mpp, obst: OB, lot: null }; hookMap(map); tools.hidden = false; draw(map, out);
        hint(`Lane Vision read ${read} of ${lots.length} car parks${ALL.stop ? ' (stopped)' : ''}: ${out.rows.length} parking rows, about ${spaces.toLocaleString('en-US')} spaces. The pin is on the bay nearest the centre of the view; drag across bays to place stalls, or use Cover whole car park.`);
      } finally { if (sw) { sw.classList.remove('is-scan'); sw.hidden = true; } ALL = null; allBtn.textContent = 'All car parks'; btn.disabled = false; }
    }
    allBtn.addEventListener('click', runAll);

    // ---- rows drawn by hand: for car parks the photo cannot read (unmarked, empty or covered). Click where the first row starts and
    //      where it ends; choose how many rows and the layout; the rows join the plan like detected ones (stalls, cover, DXF all work) ----
    const rowsBtn = document.createElement('button'); rowsBtn.type = 'button'; rowsBtn.className = 'tw-lv tw-lvrows'; rowsBtn.textContent = '＋ Rows';
    rowsBtn.title = 'Draw parking rows yourself: click the start and the end of the first row, then choose how many rows'; allBtn.after(rowsBtn);
    { const st = document.createElement('style'); st.textContent = `.tw-rowpop{position:absolute;right:16px;top:64px;z-index:40;width:270px;background:#fff;border-radius:16px;box-shadow:0 10px 34px rgba(0,0,0,.22);padding:14px;font:500 13px var(--display,Helvetica);color:#1d1d1f}
.tw-rowpop h4{margin:0 0 8px;font:700 14px var(--display,Helvetica)}.tw-rowpop label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0}.tw-rowpop input,.tw-rowpop select{width:96px;font:500 13px var(--display,Helvetica);padding:4px 6px;border:1px solid #d2d2d7;border-radius:8px}
.tw-rowpop .btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.tw-rowpop button{appearance:none;border:0;border-radius:999px;padding:7px 12px;font:600 12px var(--display,Helvetica);cursor:pointer;background:#f2f2f4;color:#1d1d1f}
.tw-rowpop button.go{background:linear-gradient(135deg,#3BA9E0,#8DC63F);color:#fff}.tw-rowpop p{margin:6px 0 0;color:#6e6e73;font-size:12px;line-height:1.35}.tw-rowpop .grp{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:6px 0}.tw-rowpop .grp span{min-width:62px;color:#6e6e73}.tw-rowpop .grp button{padding:5px 8px}`; document.head.appendChild(st); }
    const ROWS = { mode: 0, p0: null, p1: null, ll0: null, pop: null, blocks: [], cur: null };
    const prevSrc = { type: 'FeatureCollection', features: [] };
    const showPrev = (map, rings) => { prevSrc.features = rings.map(r => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } }));
      if (!map.getSource('lv-rowprev')) { map.addSource('lv-rowprev', { type: 'geojson', data: prevSrc }); map.addLayer({ id: 'lv-rowprev', type: 'line', source: 'lv-rowprev', paint: { 'line-color': '#3BA9E0', 'line-width': 2, 'line-dasharray': [2, 1.5] } }); }
      else map.getSource('lv-rowprev').setData(prevSrc); };
    // the layout across the rows, in metres from the drawn line: back-to-back pairs with a lane after each pair, or a lane after every row
    function plan(o) { const rows = []; let v = 0;
      for (let i = 0; i < o.n; i++) { rows.push([v, v + o.d]); v += o.d; const pairEnd = o.layout === 'pairs' ? i % 2 === 1 : true; if (pairEnd && i < o.n - 1) v += o.lane; }
      return rows; }
    const mppAt = lat => 156543.034 * Math.cos(lat * Math.PI / 180) / 2 ** Z;
    // one block of rows from its line (p0 to p1, global pixels at zoom 19) and its options
    function make(b) { const mpp = mppAt(b.lat), mP = 1 / mpp, o = b.o;
      const [x0, y0] = b.p0, [x1, y1] = b.p1, Lp = Math.hypot(x1 - x0, y1 - y0); if (Lp * mpp < o.w) return { runs: [], lanes: [] };
      const U = [(x1 - x0) / Lp, (y1 - y0) / Lp], N = [-U[1] * o.side, U[0] * o.side], toM = (u, v) => toLL(x0 + u * U[0] + v * N[0], y0 + u * U[1] + v * N[1]);
      const rows = plan(o), nB = Math.floor(Lp * mpp / o.w), bp = o.w * mP, s0 = (Lp - nB * bp) / 2, rot = Math.round(((-Math.atan2(U[1], U[0]) * 180 / Math.PI) % 180 + 180) % 180);
      const runs = rows.map(([a, c]) => { const v0 = a * mP, v1 = c * mP, bays = [];
        for (let j = 0; j < nB; j++) { const a0 = s0 + j * bp, a1 = a0 + bp; bays.push({ ring: [toM(a0, v0), toM(a1, v0), toM(a1, v1), toM(a0, v1), toM(a0, v0)], c: toM((a0 + a1) / 2, (v0 + v1) / 2), u: (a0 + a1) / 2, v: (v0 + v1) / 2 }); }
        return { v0, v1, u0: s0, u1: s0 + nB * bp, ring: [toM(s0, v0), toM(s0 + nB * bp, v0), toM(s0 + nB * bp, v1), toM(s0, v1), toM(s0, v0)], bays, comp: b.comp, rot, bayM: o.w, toMap: toM, shear: 0, bayAngle: 90, manual: true, block: b }; });
      const lanes = []; for (let k = 0; k < rows.length - 1; k++) { const g0 = rows[k][1], g1 = rows[k + 1][0]; if (g1 - g0 >= 3) { const vm = (g0 + g1) / 2 * mP; lanes.push([toM(s0, vm), toM(s0 + nB * bp, vm)]); } }
      return { runs, lanes, nB, depth: rows.length ? rows[rows.length - 1][1] : 0 }; }
    // put a block into the plan (replacing its previous rows), or take it out
    function place(b) { const map = A.map(), r = make(b);
      if (!LVS) { if (!r.runs.length) return r; LVS = { map, out: { rows: [], bays: [], aisles: [], blocks: [] }, runs: [], nearest: r.runs[0], pu: r.runs[0].bays[0].u, edited: false, bayPx: BAY / mppAt(b.lat), mpp: mppAt(b.lat), obst: { blds: [], roads: [], aisles: [] }, lot: null };
        A.setPin(r.runs[0].bays[0].c[1], r.runs[0].bays[0].c[0], null, { rot: r.runs[0].rot, lot: { label: 'Rows drawn by hand', kind: 'Surface', rows: [], ring: null, lines: null, rot: r.runs[0].rot, capText: 'rows drawn on the map' } }); }
      const was = LVS.nearest && LVS.nearest.block === b;
      LVS.runs = LVS.runs.filter(x => x.block !== b).concat(r.runs); LVS.out.rows = LVS.runs.map(x => x.ring); LVS.out.bays = LVS.runs.flatMap(x => x.bays);
      LVS.out.aisles = LVS.out.aisles.filter(l => !(b.lanes || []).includes(l)).concat(r.lanes); b.lanes = r.lanes; b.runs = r.runs;
      if ((was || !LVS.runs.includes(LVS.nearest)) && LVS.runs.length) { LVS.nearest = LVS.runs[0]; LVS.pu = LVS.runs[0].bays[0].u; }
      hookMap(map); tools.hidden = false; draw(map, LVS.out); return r; }
    function remove(b) { if (!LVS) return; LVS.runs = LVS.runs.filter(x => x.block !== b); LVS.out.rows = LVS.runs.map(x => x.ring); LVS.out.bays = LVS.runs.flatMap(x => x.bays);
      LVS.out.aisles = LVS.out.aisles.filter(l => !(b.lanes || []).includes(l)); if (!LVS.runs.includes(LVS.nearest) && LVS.runs.length) { LVS.nearest = LVS.runs[0]; LVS.pu = LVS.runs[0].bays[0].u; }
      ROWS.blocks = ROWS.blocks.filter(x => x !== b); draw(LVS.map, LVS.out); }
    // transforms of a block's line: turn about its middle, move by metres, lengthen or shorten by whole bays
    const turn = (b, deg) => { const cx = (b.p0[0] + b.p1[0]) / 2, cy = (b.p0[1] + b.p1[1]) / 2, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const R = ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; b.p0 = R(b.p0); b.p1 = R(b.p1); b.angle = (b.angle || 0) + deg; };
    const move = (b, east, north) => { const mP = 1 / mppAt(b.lat); [b.p0, b.p1] = [b.p0, b.p1].map(([x, y]) => [x + east * mP, y - north * mP]); };
    const stretch = (b, bays) => { const L = Math.hypot(b.p1[0] - b.p0[0], b.p1[1] - b.p0[1]), add = bays * b.o.w / mppAt(b.lat); if (L + add < b.o.w / mppAt(b.lat)) return;
      const ux = (b.p1[0] - b.p0[0]) / L, uy = (b.p1[1] - b.p0[1]) / L; b.p1 = [b.p1[0] + ux * add, b.p1[1] + uy * add]; };
    function closePop() { if (ROWS.pop) { ROWS.pop.remove(); ROWS.pop = null; } const map = A.map(); if (map && map.getSource('lv-rowprev')) map.getSource('lv-rowprev').setData({ type: 'FeatureCollection', features: [] }); }
    const optsHTML = o => '<label>Number of rows <input type="number" name="n" min="1" max="40" value="' + o.n + '"></label>'
      + '<label>Layout <select name="layout"><option value="pairs"' + (o.layout === 'pairs' ? ' selected' : '') + '>Back-to-back pairs, lane between</option><option value="each"' + (o.layout === 'each' ? ' selected' : '') + '>A lane after every row</option></select></label>'
      + '<label>Bay width (m) <input type="number" name="w" step="0.1" min="2.2" max="4" value="' + o.w + '"></label><label>Bay depth (m) <input type="number" name="d" step="0.1" min="4" max="6.5" value="' + o.d + '"></label>'
      + '<label>Lane width (m) <input type="number" name="lane" step="0.5" min="3" max="9" value="' + o.lane + '"></label>';
    const readOpts = (pop, side) => { const f = n => pop.querySelector(`[name=${n}]`).value; return { n: Math.max(1, Math.min(40, parseInt(f('n'), 10) || 1)), layout: f('layout'), w: parseFloat(f('w')) || 2.5, d: parseFloat(f('d')) || 5, lane: parseFloat(f('lane')) || 6, side }; };
    // the new block: preview first, Add makes it real and opens its edit panel
    function openNew() { closePop(); const b = { p0: ROWS.p0, p1: ROWS.p1, lat: ROWS.ll0[1], o: { n: 2, layout: 'pairs', w: 2.5, d: 5, lane: 6, side: 1 }, comp: 700000 + Math.floor(Math.random() * 90000) * 10 };
      const pop = ROWS.pop = document.createElement('div'); pop.className = 'tw-rowpop';
      pop.innerHTML = '<h4>Rows to add</h4>' + optsHTML(b.o) + '<div class="btns"><button type="button" class="go" data-a="add">Add rows</button><button type="button" data-a="flip">Other side</button><button type="button" data-a="x">Cancel</button></div><p></p>';
      A.dlg.appendChild(pop);
      const preview = () => { b.o = readOpts(pop, b.o.side); const r = make(b); showPrev(A.map(), r.runs.flatMap(x => x.bays.map(y => y.ring)));
        pop.querySelector('p').textContent = r.runs.length ? `${b.o.n} row${b.o.n > 1 ? 's' : ''} × ${r.nB} bays = ${b.o.n * r.nB} spaces, ${r.depth.toFixed(1)} m deep. Dashed blue is the preview.` : 'The line is shorter than one bay.'; };
      pop.addEventListener('input', preview);
      pop.addEventListener('click', e => { const t = e.target.closest('button'); if (!t) return; const a = t.dataset.a;
        if (a === 'x') return closePop(); if (a === 'flip') { b.o.side *= -1; return preview(); }
        if (a === 'add') { b.o = readOpts(pop, b.o.side); const r = place(b); if (!r.runs.length) { hint('Draw a longer line: it must be longer than one bay.'); return; }
          ROWS.blocks.push(b); b.name = 'Block ' + ROWS.blocks.length; openEdit(b); hint(`${b.name}: ${r.runs.length} rows, ${r.runs.length * r.nB} spaces. Turn, move or resize it in the panel; drag across bays to place stalls.`); } });
      preview(); }
    // edit panel for a block already in the plan: everything changes live
    function openEdit(b) { closePop(); ROWS.cur = b; const pop = ROWS.pop = document.createElement('div'); pop.className = 'tw-rowpop';
      pop.innerHTML = `<h4>${b.name}</h4>`
        + '<div class="grp"><span>Turn</span><button type="button" data-t="-15">↺ 15°</button><button type="button" data-t="-5">↺ 5°</button><button type="button" data-t="5">↻ 5°</button><button type="button" data-t="15">↻ 15°</button></div>'
        + '<label>Angle <input type="range" name="ang" min="-180" max="180" step="1" value="' + Math.round(b.angle || 0) + '" style="width:130px"><output>' + Math.round(b.angle || 0) + '°</output></label>'
        + '<div class="grp"><span>Move 1 m</span><button type="button" data-m="0,1">↑</button><button type="button" data-m="0,-1">↓</button><button type="button" data-m="-1,0">←</button><button type="button" data-m="1,0">→</button></div>'
        + '<div class="grp"><span>Length</span><button type="button" data-l="-1">− 1 bay</button><button type="button" data-l="1">+ 1 bay</button></div>'
        + optsHTML(b.o) + '<div class="btns"><button type="button" class="go" data-a="done">Done</button><button type="button" data-a="flip">Other side</button><button type="button" data-a="del">Delete block</button></div><p></p>';
      A.dlg.appendChild(pop);
      const info = () => { const r = b.runs || []; pop.querySelector('p').textContent = `${r.length} rows × ${r.length ? r[0].bays.length : 0} bays = ${r.reduce((t, x) => t + x.bays.length, 0)} spaces.`; pop.querySelector('output').textContent = Math.round(b.angle || 0) + '°'; pop.querySelector('[name=ang]').value = Math.round(b.angle || 0); };
      const redo = () => { place(b); info(); };
      pop.addEventListener('input', e => { if (e.target.name === 'ang') { turn(b, (+e.target.value) - (b.angle || 0)); redo(); return; } b.o = readOpts(pop, b.o.side); redo(); });
      pop.addEventListener('click', e => { const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.t) { turn(b, +t.dataset.t); return redo(); }
        if (t.dataset.m) { const [ex, ny] = t.dataset.m.split(',').map(Number); move(b, ex, ny); return redo(); }
        if (t.dataset.l) { stretch(b, +t.dataset.l); return redo(); }
        const a = t.dataset.a; if (a === 'done') { closePop(); ROWS.cur = null; hint(`${b.name} set. Press ＋ Rows to draw more or to edit a block again.`); return; }
        if (a === 'flip') { b.o.side *= -1; return redo(); }
        if (a === 'del') { remove(b); closePop(); ROWS.cur = null; hint(`${b.name} deleted.`); } });
      info(); }
    // ＋ Rows: draw a new block, or pick one to edit when there are some
    function openPick() { closePop(); const pop = ROWS.pop = document.createElement('div'); pop.className = 'tw-rowpop';
      pop.innerHTML = '<h4>Rows</h4><div class="btns"><button type="button" class="go" data-a="new">Draw new rows</button>' + ROWS.blocks.map((b, i) => `<button type="button" data-i="${i}">Edit ${b.name}</button>`).join('') + '<button type="button" data-a="x">Close</button></div>';
      A.dlg.appendChild(pop);
      pop.addEventListener('click', e => { const t = e.target.closest('button'); if (!t) return; if (t.dataset.i) return openEdit(ROWS.blocks[+t.dataset.i]);
        if (t.dataset.a === 'x') return closePop(); startDraw(); }); }
    function startDraw() { const map = A.map(); if (!map) return; closePop(); ROWS.mode = 1; map.getCanvas().style.cursor = 'crosshair'; hint('Click where the first row starts, then where it ends (along the row). Esc to cancel.'); }
    rowsBtn.addEventListener('click', () => { const map = A.map(); if (!map) return; if (ROWS.mode) { ROWS.mode = 0; map.getCanvas().style.cursor = ''; hint('Drawing rows cancelled.'); return; }
      const live = LVS ? ROWS.blocks.filter(b => LVS.runs.some(r => r.block === b)) : []; ROWS.blocks = live; if (live.length) openPick(); else startDraw(); });
    { const cc = () => A.map() && A.map().getCanvasContainer(); let down = null;
      const onDown = e => { if (!ROWS.mode) return; down = [e.clientX, e.clientY]; };
      const onClick = e => { const map = A.map(); if (!ROWS.mode || !map || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return; e.stopPropagation(); e.preventDefault();
        const r = map.getCanvas().getBoundingClientRect(), ll = map.unproject([e.clientX - r.left, e.clientY - r.top]), px = toPx(ll.lng, ll.lat);
        if (ROWS.mode === 1) { ROWS.p0 = px; ROWS.ll0 = [ll.lng, ll.lat]; ROWS.mode = 2; hint('Now click where the row ends.'); }
        else { ROWS.p1 = px; ROWS.mode = 0; map.getCanvas().style.cursor = ''; openNew(); hint('Choose the rows, check the dashed preview, then Add rows. Other side flips which side of the line they go.'); } };
      A.dlg.addEventListener('mousedown', e => { if (cc() && cc().contains(e.target)) onDown(e); }, true);
      A.dlg.addEventListener('click', e => { if (cc() && cc().contains(e.target)) onClick(e); }, true);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && ROWS.mode) { ROWS.mode = 0; const m = A.map(); if (m) m.getCanvas().style.cursor = ''; hint('Drawing rows cancelled.'); } }); }

    async function extent(ctr, raw, RW) {
      const z = 17, W17 = 256 * 2 ** z, to17 = (lo, la) => { const r = la * Math.PI / 180; return [(lo + 180) / 360 * W17, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * W17]; };
      const m17 = 156543.034 * Math.cos(ctr[1] * Math.PI / 180) / 2 ** z, [px, py] = to17(ctr[0], ctr[1]), Rc = 450 / m17;
      const ph = await photo(px - Rc, py - Rc, px + Rc, py + Rc, z); if (!ph.ok) return null;
      const w = ph.c.width, h = ph.c.height, img = ph.g.getImageData(0, 0, w, h).data, qx = px - ph.ox, qy = py - ph.oy, Lz = ([lo, la]) => { const [x, y] = to17(lo, la); return [x - ph.ox, y - ph.oy]; };
      const mc = document.createElement('canvas'); mc.width = w; mc.height = h; const mg = mc.getContext('2d'); mg.fillStyle = '#fff'; mg.fillRect(0, 0, w, h); mg.fillStyle = mg.strokeStyle = '#000'; mg.lineCap = mg.lineJoin = 'round';
      if (raw) { raw.b.forEach(f => { const g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).forEach(pl => { mg.beginPath(); pl[0].forEach((q, i) => { const [x, y] = Lz(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }); });
        raw.r.forEach(f => { if (f.properties.class === 'service') return; mg.lineWidth = RW[f.properties.class] / m17; const g = f.geometry; (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []).forEach(l => { mg.beginPath(); l.forEach((q, i) => { const [x, y] = Lz(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke(); }); }); }
      const mk = mg.getImageData(0, 0, w, h).data;
      // the asphalt's own colour round the pin, then grass, trees, water and sand by how far they stray from it
      const ref = []; for (let y = Math.max(0, Math.round(qy - 10 / m17)); y < Math.min(h, qy + 10 / m17); y++) for (let x = Math.max(0, Math.round(qx - 10 / m17)); x < Math.min(w, qx + 10 / m17); x++) { const i = (y * w + x) * 4; ref.push([img[i + 1] - img[i], img[i + 1] - img[i + 2], img[i] - img[i + 2], img[i] + img[i + 1] + img[i + 2]]); }
      const md = k => { const v = ref.map(q => q[k]).sort((a, b) => a - b); return v[v.length >> 1] || 0; }, gr = Math.max(0, Math.min(18, md(0))), gb = Math.max(0, Math.min(18, md(1))), wm = md(2), lm = md(3);
      const nat = i => { const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2]; return (g > r + 8 + gr && g > b + 2 + gb) || (r - b > wm + 22 && r + g + b > lm + 60); };
      const cs = 2, gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), N = gw * gh, pav = new Uint8Array(N), seen = new Uint8Array(N);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { let n = 0, t = 0, k = 0; for (let y = gy * cs - 1; y <= gy * cs + cs; y++) for (let x = gx * cs - 1; x <= gx * cs + cs; x++) { if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; t++; if (nat(i)) n++; if (mk[i * 4] < 128) k++; } pav[gy * gw + gx] = t && n <= t * 0.35 && k < t * 0.5 ? 1 : 0; }
      let s0 = -1, sd = 1e9; for (let c = 0; c < N; c++) { if (!pav[c]) continue; const d = Math.hypot((c % gw) * cs + 1 - qx, ((c / gw) | 0) * cs + 1 - qy); if (d < sd) { sd = d; s0 = c; } }
      if (s0 < 0 || sd * m17 > 15) return null;
      const q = [s0]; seen[s0] = 1; let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, n = 0;
      while (q.length) { const c = q.pop(), x = c % gw, y = (c / gw) | 0; n++; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const o = ny * gw + nx; if (pav[o] && !seen[o]) { seen[o] = 1; q.push(o); } } }
      window._lvExt = { n, m2: Math.round(n * (cs * m17) ** 2), box: [bx0, by0, bx1, by1].map(v => Math.round(v * cs * m17)), gr, gb };
      if (n * (cs * m17) ** 2 < 400) return null;
      // to zoom-19 pixels, 15 m spare round it, at most 760 m across (centred on the pin beyond that)
      const f = 2 ** (Z - z), mz = 156543.034 * Math.cos(ctr[1] * Math.PI / 180) / 2 ** Z, sp = 15 / mz, lim = 380 / mz, [cx, cy] = toPx(ctr[0], ctr[1]);
      let X0 = (bx0 * cs + ph.ox) * f - sp, Y0 = (by0 * cs + ph.oy) * f - sp, X1 = ((bx1 + 1) * cs + ph.ox) * f + sp, Y1 = ((by1 + 1) * cs + ph.oy) * f + sp;
      X0 = Math.max(X0, cx - lim); X1 = Math.min(X1, cx + lim); Y0 = Math.max(Y0, cy - lim); Y1 = Math.min(Y1, cy + lim);
      return [X0, Y0, X1, Y1]; }

    async function detect(map, ctr, p, opt) {
      const G2 = window.TwinGeo, collect = !!(opt && opt.collect), hint = collect ? () => {} : A.hint;
      const mpp = 156543.034 * Math.cos(ctr[1] * Math.PI / 180) / 2 ** Z;            // metres per pixel
      // footprint: a picked car park's outline or lanes, else 75 m around the pin
      // footprint without an outline: a coarse look first (zoom 17, about 1 m a pixel, 450 m round) finds how far the paved surface joined
      // to the pin reaches, so a long car park is read to its far end; the detailed photo then covers exactly that
      const lot = p && p.lot ? p.lot : null, R0 = 75 / mpp; let R = (lot ? 75 : 250) / mpp, ext = null;
      const RW = { motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, minor: 8, busway: 7, service: 5.5 };
      let RAW = null; try { RAW = await A.probe(ctr, 17, m => ({ b: m.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }),
          r: m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }).filter(f => { const P = f.properties || {}; return RW[P.class] && P.service !== 'parking_aisle' && !(lot && P.class === 'service'); }),
          a: m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }).filter(A.AISLE_OK) })); } catch (e) {}
      if (!lot) { try { ext = await extent(ctr, RAW, RW); } catch (e) {} if (ext) R = 1e9; }
      let pts = lot && lot.ring ? lot.ring : lot && lot.lines ? lot.lines.flat() : null;
      const [cx, cy] = toPx(ctr[0], ctr[1]);
      let x0, y0, x1, y1;
      if (pts) { const P = pts.map(([lo, la]) => toPx(lo, la)); x0 = Math.min(...P.map(q => q[0])) - 12 / mpp; x1 = Math.max(...P.map(q => q[0])) + 12 / mpp; y0 = Math.min(...P.map(q => q[1])) - 12 / mpp; y1 = Math.max(...P.map(q => q[1])) + 12 / mpp;
        const lim = 160 / mpp; x0 = Math.max(x0, cx - lim); x1 = Math.min(x1, cx + lim); y0 = Math.max(y0, cy - lim); y1 = Math.min(y1, cy + lim); }
      else if (ext) [x0, y0, x1, y1] = ext;
      else { x0 = cx - R; x1 = cx + R; y0 = cy - R; y1 = cy + R; }
      const ph = await photo(x0, y0, x1, y1); if (!ph.ok) throw new Error('no imagery');
      const w = ph.c.width, h = ph.c.height, img = ph.g.getImageData(0, 0, w, h).data;
      // mask of where parking can be
      const mc = document.createElement('canvas'); mc.width = w; mc.height = h; const mg = mc.getContext('2d');
      const L = ([lo, la]) => { const [x, y] = toPx(lo, la); return [x - ph.ox, y - ph.oy]; };
      mg.fillStyle = mg.strokeStyle = '#fff'; mg.lineCap = mg.lineJoin = 'round';
      if (lot && lot.ring) { mg.beginPath(); lot.ring.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }
      else if (lot && lot.lines) { mg.lineWidth = 19 / mpp; lot.lines.forEach(l => { mg.beginPath(); l.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke(); }); }
      else if (ext) mg.fillRect(0, 0, w, h); else { mg.beginPath(); mg.arc(cx - ph.ox, cy - ph.oy, R, 0, 7); mg.fill(); }
      // take buildings and every road that is not a parking aisle out (from the same free map tiles)
      const OBST = { blds: [], roads: [], aisles: [] };
      try { const raw = RAW; if (!raw) throw 0;
        raw.a.forEach(f => { const g = f.geometry; (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []).forEach(l => OBST.aisles.push(l)); });
        // structures 5 m tall or less are shade canopies, carports or kiosks: parking under them still counts, so they are kept apart from real buildings
        // a mapped structure is a shade or carport only when it is low (5 m or less; the free tiles give 5 m to any building without a height)
        // and long and narrow like a row of parking, 4 to 12.5 m across; a wider block is a building, whatever its height
        const low = (f, ring) => { const hh = +f.properties.render_height; if (!(hh > 0 && hh <= 5)) return false; const mr = G2.minAreaRect(ring.map(L)); return !!mr && mr.width * mpp <= 12.5 && mr.length * mpp >= 8; }; OBST.shades = [];
        raw.b.forEach(f => { const g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).forEach(pl => (low(f, pl[0]) ? OBST.shades : OBST.blds).push(pl[0])); });
        raw.r.forEach(f => { const g = f.geometry; (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []).forEach(l => OBST.roads.push({ line: l, w: RW[f.properties.class], cls: f.properties.class })); });
        mg.fillStyle = mg.strokeStyle = '#000';
        raw.b.forEach(f => { const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; polys.forEach(pl => { mg.beginPath(); pl[0].forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }); });
        raw.r.forEach(f => { mg.lineWidth = RW[f.properties.class] / mpp; const g = f.geometry, ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; ls.forEach(l => { mg.beginPath(); l.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke(); }); });
      } catch (e) {}
      const mask = mg.getImageData(0, 0, w, h).data, WH = w * h;
      // service roads (access roads and lanes along a car park) are part of the paved surface for finding the car park's extent, though no bay is put on them
      const SVC = new Uint8Array(WH); if (!lot && OBST.roads.some(r => r.cls === 'service')) { const vc = document.createElement('canvas'); vc.width = w; vc.height = h; const vg = vc.getContext('2d'); vg.strokeStyle = '#fff'; vg.lineCap = vg.lineJoin = 'round';
        OBST.roads.filter(r => r.cls === 'service').forEach(rd => { vg.lineWidth = (rd.w + 2) / mpp; vg.beginPath(); rd.line.forEach((q, i) => { const [x, y] = L(q); i ? vg.lineTo(x, y) : vg.moveTo(x, y); }); vg.stroke(); });
        const vd = vg.getImageData(0, 0, w, h).data, px0 = cx - ph.ox, py0 = cy - ph.oy; for (let i = 0; i < WH; i++) if (vd[i * 4] > 128 && Math.hypot(i % w - px0, ((i / w) | 0) - py0) <= R) SVC[i] = 1; }
      // 1. colour model: asphalt and parked cars stay; grass and trees (green), sand and roof tiles (warm beige) and white roofs go.
      //    Judged over a 3 m window, so a single white or beige car is never taken out, only whole surfaces.
      //    The asphalt tint is learnt from this photo (median warmth and brightness inside the footprint), so warm UAE asphalt is not mistaken for sand.
      const smp = []; for (let i = 0; i < w * h; i += 7) if (mask[i * 4] > 128) smp.push([img[i * 4] - img[i * 4 + 2], img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]]);
      const med = k => { const v = smp.map(q => q[k]).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; }, warm0 = med(0), lum0 = med(1);
      // colour cast of the photo, learnt from the asphalt (the 10 m round the pin when no outline is mapped): some Esri tiles are tinted green,
      // and grey asphalt must never pass as grass. Vegetation is judged by how much greener it is than this asphalt (0 on a neutral photo).
      const cast = []; { const pr = 10 / mpp, px = cx - ph.ox, py = cy - ph.oy; for (let y = Math.max(0, Math.round(py - pr)); y < Math.min(h, py + pr); y += 2) for (let x = Math.max(0, Math.round(px - pr)); x < Math.min(w, px + pr); x += 2) { const i = (y * w + x) * 4; if (lot ? mask[i] > 128 : Math.hypot(x - px, y - py) <= pr) cast.push([img[i + 1] - img[i], img[i + 1] - img[i + 2]]); } }
      if (cast.length < 40) for (let i = 0; i < w * h; i += 7) if (mask[i * 4] > 128) cast.push([img[i * 4 + 1] - img[i * 4], img[i * 4 + 1] - img[i * 4 + 2]]);
      const cmed = k => { const v = cast.map(q => q[k]).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; }, gr0 = Math.max(0, Math.min(18, cmed(0))), gb0 = Math.max(0, Math.min(18, cmed(1))); window._lvCast = [gr0, gb0];
      const II = new Uint32Array((w + 1) * (h + 1)), II2 = new Uint32Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) { let rs = 0, rs2 = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, r = img[i], g = img[i + 1], b = img[i + 2];
          const bad = (g > r + 8 + gr0 && g > b + 2 + gb0) || (r - b > warm0 + 22 && r + g + b > lum0 + 60) || Math.min(r, g, b) > 215 ? 1 : 0; rs += bad; II[(y + 1) * (w + 1) + x + 1] = II[y * (w + 1) + x + 1] + rs; rs2 += (g > r + 8 + gr0 && g > b + 2 + gb0) || (r - b > warm0 + 22 && r + g + b > lum0 + 60) ? 1 : 0; II2[(y + 1) * (w + 1) + x + 1] = II2[y * (w + 1) + x + 1] + rs2; } }
      const hw = Math.max(2, Math.round(1.5 / mpp)), badAt = (x, y) => { const x0 = Math.max(0, x - hw), x1 = Math.min(w, x + hw), y0 = Math.max(0, y - hw), y1 = Math.min(h, y + hw);
          return (II[y1 * (w + 1) + x1] - II[y0 * (w + 1) + x1] - II[y1 * (w + 1) + x0] + II[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
      const natAt = (x, y) => { const x0 = Math.max(0, x - hw), x1 = Math.min(w, x + hw), y0 = Math.max(0, y - hw), y1 = Math.min(h, y + hw);   // grass, trees, water and sand only
          return (II2[y1 * (w + 1) + x1] - II2[y0 * (w + 1) + x1] - II2[y1 * (w + 1) + x0] + II2[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
      // 1b. no mapped outline: the car park is the paved surface joined to the pin (2 m cells of asphalt or cars, not sand, grass, trees,
      //     water or white roofs), closed over 4 m so white cars do not punch holes in it. A beach, a park or the sea beside the car park is
      //     then never read as parking, and the shoreline no longer sets the row direction (ADNEC waterfront car park, 26 Nov 2026).
      let paved = false;
      if (!lot) { const c2 = Math.max(3, Math.round(2 / mpp)), gw3 = Math.ceil(w / c2), gh3 = Math.ceil(h / c2), N3 = gw3 * gh3, pav = new Uint8Array(N3), seen = new Uint8Array(N3);
        for (let gy = 0; gy < gh3; gy++) for (let gx = 0; gx < gw3; gx++) { const x = Math.min(w - 1, gx * c2 + (c2 >> 1)), y = Math.min(h - 1, gy * c2 + (c2 >> 1)); pav[gy * gw3 + gx] = (mask[(y * w + x) * 4] > 128 || SVC[y * w + x]) && natAt(x, y) < 0.35 ? 1 : 0; }
        const px0 = cx - ph.ox, py0 = cy - ph.oy; let s0 = -1, sd = 1e9;
        for (let s = 0; s < N3; s++) { if (!pav[s]) continue; const d = Math.hypot((s % gw3) * c2 + c2 / 2 - px0, ((s / gw3) | 0) * c2 + c2 / 2 - py0); if (d < sd) { sd = d; s0 = s; } }
        window._lvPv = { pav: pav.reduce((a, b) => a + b, 0), N3, sd: +(sd * mpp).toFixed(1) };
        if (s0 >= 0 && sd * mpp < 15) { const q = [s0]; seen[s0] = 1; let n = 0;
          while (q.length) { const c = q.pop(), x = c % gw3, y = (c / gw3) | 0; n++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw3 || ny >= gh3) continue; const o = ny * gw3 + nx; if (pav[o] && !seen[o]) { seen[o] = 1; q.push(o); } } }
          window._lvPv.n = n; if (n * (c2 * mpp) ** 2 >= 400) {
            const grow = (src, val) => { const o2 = new Uint8Array(N3); for (let y = 0; y < gh3; y++) for (let x = 0; x < gw3; x++) { let hit = !val; for (let dy = -2; dy <= 2 && hit !== val; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; const v = nx < 0 || ny < 0 || nx >= gw3 || ny >= gh3 ? 0 : src[ny * gw3 + nx]; if (!!v === val) { hit = val; break; } } o2[y * gw3 + x] = hit ? 1 : 0; } return o2; };
            const closed = grow(grow(seen, true), false);   // dilate then erode: a morphological closing
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (mask[i * 4] > 128 && !closed[((y / c2) | 0) * gw3 + ((x / c2) | 0)]) mask[i * 4] = 0; }
            paved = true; } }
        if (!paved) { const px0 = cx - ph.ox, py0 = cy - ph.oy; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - px0, y - py0) > R0) mask[(y * w + x) * 4] = 0; }
        window._lvPaved = paved; }
      // edge strength (Sobel) on brightness: parked cars and bay lines are busy, lanes are smooth asphalt
      const gray = new Float32Array(WH); for (let i = 0; i < WH; i++) gray[i] = img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11;
      const G = new Float32Array(WH), M = new Uint8Array(WH); let nM = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (mask[i * 4] < 128 || badAt(x, y) > 0.55) continue;
        const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
        const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
        G[i] = Math.min(255, Math.hypot(gx, gy)); M[i] = 1; nM++; }
      // segmentation of the photo, pixel by pixel: vegetation by the excess-green index ExG = 2G − R − B (trees, grass, palms),
      // painted lines as pixels clearly brighter than their 2 m surroundings and white or yellow (bay dividers, kerbs, arrows)
      const VEG = new Uint8Array(WH), PAINT = new Uint8Array(WH), IG = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) { let rs = 0; for (let x = 0; x < w; x++) { rs += gray[y * w + x]; IG[(y + 1) * (w + 1) + x + 1] = IG[y * (w + 1) + x + 1] + rs; } }
      const pr2 = Math.max(3, Math.round(1 / mpp));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2];
        if (g > r + 14 + gr0 && g > b + 10 + gb0 && 2 * g - r - b > 32 + gr0 + gb0 && g > 50 && r + g + b < 480) VEG[i] = 1;
        if (!M[i]) continue; const xa = Math.max(0, x - pr2), xb = Math.min(w, x + pr2 + 1), ya = Math.max(0, y - pr2), yb = Math.min(h, y + pr2 + 1);
        const mean = (IG[yb * (w + 1) + xb] - IG[ya * (w + 1) + xb] - IG[yb * (w + 1) + xa] + IG[ya * (w + 1) + xa]) / ((xb - xa) * (yb - ya));
        if (gray[i] > mean + 22 && ((Math.min(r, g, b) > 135) || (r > 150 && g > 125 && b < 110))) PAINT[i] = 1; }
      const GF = G2.frame(ctr[0], ctr[1]), BLD = OBST.blds.map(r => { const P = r.map(q => GF.toLocal(q[0], q[1])); let a = 1e9, b = 1e9, c = -1e9, d = -1e9; P.forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }); return { P, bb: [a, b, c, d] }; });
      const bldShare = ring => { const P = ring.slice(0, 4).map(q => GF.toLocal(q[0], q[1])); let a = 1e9, b = 1e9, c = -1e9, d = -1e9; P.forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); });
        let s = 0; BLD.forEach(q => { if (q.bb[0] > c || q.bb[2] < a || q.bb[1] > d || q.bb[3] < b) return; try { s += G2.overlapArea(P, q.P); } catch (e) {} }); return s / (G2.area(P) || 1); };
      const FILT = window._lvFilt = { bld: 0, veg: 0, paved: 0, vegPx: VEG.reduce((a, b) => a + b, 0), paintPx: PAINT.reduce((a, b) => a + b, 0), WH };
      // little open asphalt is not the end: a fully shaded car park is found by its shade structures (step 7)
      // 2. parking blocks: the paved area split into separate pieces (2 m cells, joined side to side), each read on its own,
      //    so two car parks at different angles each get their own direction
      const cs = Math.max(3, Math.round(2 / mpp)), gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), cellOn = new Uint8Array(gw * gh), lab = new Int32Array(gw * gh).fill(-1);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { let n = 0, t = 0; for (let y = gy * cs; y < Math.min(h, gy * cs + cs); y++) for (let x = gx * cs; x < Math.min(w, gx * cs + cs); x++) { t++; n += M[y * w + x]; } cellOn[gy * gw + gx] = n > t * 0.5 ? 1 : 0; }
      const comps = []; for (let s = 0; s < gw * gh; s++) { if (!cellOn[s] || lab[s] >= 0) continue; const k = comps.length, q = [s]; lab[s] = k; let n = 0, bx0 = 1e9, by0 = 1e9, bx1 = 0, by1 = 0;
        while (q.length) { const c = q.pop(), cx2 = c % gw, cy2 = (c / gw) | 0; n++; bx0 = Math.min(bx0, cx2); bx1 = Math.max(bx1, cx2); by0 = Math.min(by0, cy2); by1 = Math.max(by1, cy2);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = cx2 + dx, ny = cy2 + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return; const o = ny * gw + nx; if (cellOn[o] && lab[o] < 0) { lab[o] = k; q.push(o); } }); }
        comps.push({ k, n, box: [bx0 * cs, by0 * cs, Math.min(w, (bx1 + 1) * cs), Math.min(h, (by1 + 1) * cs)] }); }
      const inC = (k, x, y) => M[y * w + x] && lab[((y / cs) | 0) * gw + ((x / cs) | 0)] === k;
      const bin = 0.5 / mpp, out = { rows: [], bays: [], aisles: [], blocks: [] }, runs = []; let spaces = 0, kept = 0; const dbg = window._lvDbg = { nM, warm0, lum0, comps: comps.length, blocks: [] };
      // 2a. lane model: where driving lanes are mapped, bays sit on both sides of each lane. For every lane the cross-profile of edge strength
      //     shows where the smooth driving surface ends; a 5 m strip from there is searched for parked cars and paint. A row is kept where the
      //     strip is clearly busier than the lane itself, so full rows, empty painted rows and mixed rows are all found, and nothing lands on the lane.
      const AIS = (lot && lot.lines ? lot.lines : OBST.aisles).map(l => l.map(L));
      const dp = (P, tol) => { if (P.length < 3) return P; let k = 0, dm = 0; const [a, b] = [P[0], P[P.length - 1]], ab = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
        for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / ab; if (d > dm) { dm = d; k = i; } }
        return dm > tol ? dp(P.slice(0, k + 1), tol).slice(0, -1).concat(dp(P.slice(k), tol)) : [a, b]; };
      const usedC = [], q4 = 0.25 / mpp, dbgA = dbg.aisles = [];
      // edge strength on every pixel of the footprint (the colour filter is not applied here: shade roofs and white cars are parking too)
      const SH = new Uint8Array(WH); if (AIS.length && OBST.shades && OBST.shades.length) { const sc = document.createElement('canvas'); sc.width = w; sc.height = h; const sg = sc.getContext('2d'); sg.fillStyle = '#fff';
        // only shades standing over the car park itself (a quarter of the roof or more over it), never a pavilion in a park beside it
        const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
        const over = (P, skip) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; P.forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }); const st = Math.max(1, 1 / mpp); let n = 0, t = 0;
          for (let y = b; y <= d; y += st) for (let x = a; x <= c; x += st) { if (!pip(x, y, P) || (skip && pip(x, y, skip))) continue; t++; const xi = Math.round(x), yi = Math.round(y); if (xi >= 0 && yi >= 0 && xi < w && yi < h && mask[(yi * w + xi) * 4] > 128) n++; } return t ? n / t : 0; };
        // (a shade is drawn black into the footprint like any building, so it is judged by the 1.5 m ring round it: 30% or more of that ring on the car park)
        const ringOver = P => { const cxr = P.reduce((p, q) => p + q[0], 0) / P.length, cyr = P.reduce((p, q) => p + q[1], 0) / P.length, g = 1.5 / mpp; return over(P.map(([x, y]) => { const dx = x - cxr, dy = y - cyr, l = Math.hypot(dx, dy) || 1; return [x + dx / l * g, y + dy / l * g]; }), P); };
        OBST.shades.forEach(r => { const P = r.map(L); if (ringOver(P) < 0.3) return; sg.beginPath(); P.forEach(([x, y], i) => { i ? sg.lineTo(x, y) : sg.moveTo(x, y); }); sg.closePath(); sg.fill(); });
        const sd2 = sg.getImageData(0, 0, w, h).data; for (let i = 0; i < WH; i++) SH[i] = sd2[i * 4] > 128 ? 1 : 0; }
      const inLot = i => mask[i * 4] > 128 || SH[i];
      const GA = new Float32Array(WH); if (AIS.length) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!inLot(i)) continue;
        const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1], gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]; GA[i] = Math.min(255, Math.hypot(gx, gy)); }
      AIS.forEach((line, li) => { const S2 = dp(line, 1.5 / mpp); for (let k = 0; k < S2.length - 1; k++) { const p0 = S2[k], p1 = S2[k + 1], Lp = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (Lp * mpp < 9) continue;
        const dx = (p1[0] - p0[0]) / Lp, dy = (p1[1] - p0[1]) / Lp, at = (u, v) => [p0[0] + u * dx - v * dy, p0[1] + u * dy + v * dx];
        const Gv = (u, v) => { const [x, y] = at(u, v), xi = Math.round(x), yi = Math.round(y); if (xi < 1 || yi < 1 || xi >= w - 1 || yi >= h - 1) return -1; const i = yi * w + xi; return inLot(i) ? GA[i] : -1; };
        // cross profile, 0.5 m bins from −12 m to +12 m
        const vb = 0.5 / mpp, nV = 49, CS = new Float64Array(nV), CN = new Float64Array(nV), CT = new Float64Array(nV);
        for (let j = 0; j < nV; j++) { const v = (j - 24) * vb; for (let u = 0; u < Lp; u += 1) { const g = Gv(u, v); CT[j]++; if (g >= 0) { CS[j] += g; CN[j]++; } } }
        const meanB = (j0, j1) => { let s = 0, n = 0; for (let j = Math.max(0, j0); j <= Math.min(nV - 1, j1); j++) { s += CS[j]; n += CN[j]; } return n ? s / n : 0; };
        const cov = (j0, j1) => { let n = 0, t = 0; for (let j = Math.max(0, j0); j <= Math.min(nV - 1, j1); j++) { n += CN[j]; t += CT[j]; } return t ? n / t : 0; };
        // the real lane: the smoothest 4 m band within 4 m of the mapped line (mapped lines are often a metre or two off the photo)
        let cB = 24, cm = 1e9; for (let j = 16; j <= 32; j++) { const m0 = meanB(j - 4, j + 4); if (cov(j - 4, j + 4) > 0.6 && m0 < cm) { cm = m0; cB = j; } }
        const Ga = meanB(cB - 4, cB + 4) || 1, rowRot = Math.round(((-Math.atan2(dy, dx) * 180 / Math.PI) % 180 + 180) % 180), toMapS = (u, v) => { const [x, y] = at(u, v); return toLL(x + ph.ox, y + ph.oy); };
        const comp = 1000 + li * 100 + k, segRuns = [];
        [-1, 1].forEach(sd => { let bo = 0, bs = -1e9;
          // the row starts where texture jumps: the 5 m strip beyond the edge against the 2 m just inside it
          for (let o = 1.5; o <= 6; o += 0.5) { const jo = Math.round(o / 0.5), sig = sd > 0 ? meanB(cB + jo, cB + jo + 10) - meanB(cB + jo - 4, cB + jo - 1) : meanB(cB - jo - 10, cB - jo) - meanB(cB - jo + 1, cB - jo + 4); if (sig > bs) { bs = sig; bo = o; } }
          const jo = Math.round(bo / 0.5), j0 = sd > 0 ? cB + jo : cB - jo - 10, j1 = j0 + 10, Gs = meanB(j0, j1), cv = cov(j0, j1), vc = (cB - 24) * 0.5;
          const db2 = { seg: k, side: sd, o: bo, c: vc, Ga: +Ga.toFixed(1), Gs: +Gs.toFixed(1), cov: +cv.toFixed(2) }; dbgA.push(db2);
          if (cv < 0.45 || Gs < Ga * 1.2) return;
          const v0 = (vc + (sd > 0 ? bo : -(bo + 5))) / mpp, v1 = v0 + 5 / mpp, nu = Math.ceil(Lp / q4) + 1, Su = new Float64Array(nu), Nu = new Float64Array(nu);
          for (let u = 0; u < Lp; u += 1) for (let v = v0; v < v1; v += 1) { const g = Gv(u, v); if (g < 0) continue; const b = Math.floor(u / q4); Su[b] += g; Nu[b]++; }
          const per = Array.from(Su, (x, b) => Nu[b] > 2 ? x / Nu[b] : 0), m5 = Math.round(5 / 0.25), thr = Ga * 1.15, segs = []; let r0 = -1, gap = 0;
          for (let b = 0; b <= nu; b++) { let sm = 0, n = 0; for (let j = Math.max(0, b - m5 / 2); j < Math.min(nu, b + m5 / 2); j++) if (Nu[j] > 2) { sm += per[j]; n++; }
            const on = b < nu && n >= m5 / 3 && sm / n > thr; if (on) { if (r0 < 0) r0 = b; gap = 0; } else if (r0 >= 0) { gap++; if (gap * 0.25 > 4 || b === nu) { const e = b - gap + 1; if ((e - r0) * 0.25 >= 5) segs.push([r0, e]); r0 = -1; gap = 0; } } }
          db2.stretches = segs.length;
          segs.forEach(([k0, k1]) => { const P = per.slice(k0, k1), Z = P.map((x, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 10); j <= Math.min(P.length - 1, i + 10); j++) { s += P[j]; n++; } return x - s / n; }), E = Z.reduce((x, y) => x + y * y, 0) || 1;
            let pk = 0, lag = 10; for (let Lg = 9; Lg <= 12; Lg++) { let sm = 0; for (let i = 0; i + Lg < Z.length; i++) sm += Z[i] * Z[i + Lg]; sm /= E * (Z.length - Lg) / Z.length; if (sm > pk) { pk = sm; lag = Lg; } }
            if (pk < 0.1) lag = 10;
            let ph0 = 0, phs = -1; for (let o = 0; o < lag; o++) { let sm = 0; for (let i = o; i < P.length; i += lag) sm += P[i]; if (sm > phs) { phs = sm; ph0 = o; } }
            const bp = lag * q4, uS = (k0 + ph0) * q4, n = Math.floor(((k1 - k0 - ph0) * q4) / bp), bays = [];
            for (let j = 0; j < n; j++) { const a0 = uS + j * bp, a1 = a0 + bp, cu = (a0 + a1) / 2, cvv = (v0 + v1) / 2, [cx2, cy2] = at(cu, cvv);
              if (usedC.some(([x, y]) => Math.hypot(x - cx2, y - cy2) < bp * 0.6)) continue;
              let t = 0, gd = 0, vg = 0; for (let su = 0.15; su < 1; su += 0.23) for (let sv = 0.12; sv < 1; sv += 0.19) { t++; const [x, y] = at(a0 + su * (a1 - a0), v0 + sv * (v1 - v0)), xi = Math.round(x), yi = Math.round(y);
                if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue; const i = yi * w + xi; if (inLot(i)) gd++; if (VEG[i] && GA[i] > 28) vg++; }
              if (gd / t < 0.6) { FILT.paved++; continue; } if (vg / t > 0.15) { FILT.veg++; continue; }
              const ring = [toMapS(a0, v0), toMapS(a1, v0), toMapS(a1, v1), toMapS(a0, v1), toMapS(a0, v0)]; if (BLD.length && bldShare(ring) > 0.10) { FILT.bld++; continue; }
              usedC.push([cx2, cy2]); const bb = { ring, c: toMapS(cu, cvv), u: cu, v: cvv }; bays.push(bb); }
            if (bays.length < 2) return;
            bays.forEach(b => out.bays.push(b)); const u0 = Math.min(...bays.map(b => b.u)) - bp / 2, u1 = Math.max(...bays.map(b => b.u)) + bp / 2;
            const ring = [toMapS(u0, v0), toMapS(u1, v0), toMapS(u1, v1), toMapS(u0, v1), toMapS(u0, v0)]; out.rows.push(ring); spaces += bays.length;
            const run = { v0, v1, u0, u1, ring, bays, comp, rot: rowRot, bayM: lag * 0.25, toMap: toMapS, shear: 0, bayAngle: 90, lane: true }; runs.push(run); segRuns.push(run); }); });
        if (segRuns.length) { kept++; const u0 = Math.min(...segRuns.map(r => r.u0)), u1 = Math.max(...segRuns.map(r => r.u1)); out.aisles.push([toMapS(u0, (cB - 24) * 0.5 / mpp), toMapS(u1, (cB - 24) * 0.5 / mpp)]); } } });
      const useLanes = out.bays.length >= 4; dbg.laneBays = out.bays.length;
      if (!useLanes) { out.rows.length = 0; out.bays.length = 0; out.aisles.length = 0; runs.length = 0; spaces = 0; kept = 0; usedC.length = 0; }
      if (!useLanes) comps.filter(c => c.n * (cs * mpp) ** 2 >= 220).sort((p, q) => q.n - p.n).slice(0, 12).forEach(cp => {
        const [X0, Y0, X1, Y1] = cp.box, D = Math.hypot(w, h);
        // 3. orientation by a Radon-style projection: the angle whose cross-profile of edge strength bands most strongly
        const profileAt = (a, step) => { const ca = Math.cos(a), sa = Math.sin(a), nb = Math.ceil(2 * D / bin) + 2, S2 = new Float64Array(nb), N = new Float64Array(nb);
          for (let y = Math.max(1, Y0); y < Math.min(h - 1, Y1); y += step) for (let x = Math.max(1, X0); x < Math.min(w - 1, X1); x += step) { if (!inC(cp.k, x, y)) continue; const i = y * w + x, v = -x * sa + y * ca, b = Math.floor((v + D) / bin); S2[b] += G[i]; N[b]++; }
          return { S2, N, nb }; };
        const contrast = pr => { const vals = []; for (let b = 0; b < pr.nb; b++) if (pr.N[b] > 6) vals.push(pr.S2[b] / pr.N[b]); if (vals.length < 14) return 0;
          const sm = vals.map((v, i) => (vals[i - 2] ?? v) * 0.1 + (vals[i - 1] ?? v) * 0.2 + v * 0.4 + (vals[i + 1] ?? v) * 0.2 + (vals[i + 2] ?? v) * 0.1);
          const m = sm.reduce((a, b) => a + b, 0) / sm.length; return Math.sqrt(sm.reduce((a, b) => a + (b - m) ** 2, 0) / sm.length) / (m || 1); };
        let best = 0, bestA = 0; for (let d = 0; d < 180; d += 3) { const c = contrast(profileAt(d * Math.PI / 180, 3)); if (c > best) { best = c; bestA = d; } }
        for (let d = bestA - 3; d <= bestA + 3; d++) { const c = contrast(profileAt(d * Math.PI / 180, 2)); if (c > best) { best = c; bestA = d; } }
        const db = { n: cp.n, best: +best.toFixed(3), ang: bestA, rows: 0, segs: 0, pk: [] }; dbg.blocks.push(db);
        // the block's own outline by rotating calipers (minimum-area rectangle of its cells), drawn and used as a second opinion on direction
        const cellPts = []; for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (lab[gy * gw + gx] === cp.k) { const x = gx * cs, y = gy * cs; cellPts.push([x, y], [x + cs, y], [x, y + cs], [x + cs, y + cs]); }
        const mar = G2.minAreaRect(cellPts); if (mar) { db.mar = +mar.angle.toFixed(1); db.aspect = +mar.aspect.toFixed(2); }
        // Hough transform of the painted lines in this block: the long lines that run with the rows refine the angle to a fraction of a degree,
        // the short dividers across them give the bay angle (90° straight in, 45–75° angled parking)
        const pp = []; for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (PAINT[y * w + x] && inC(cp.k, x, y)) pp.push([(x - (X0 + X1) / 2) * mpp, (y - (Y0 + Y1) / 2) * mpp]);
        const step = Math.max(1, Math.ceil(pp.length / 6000)), HA = pp.length > 60 ? G2.houghAngles(pp.filter((_, i) => i % step === 0), { dR: 0.3, minVotes: Math.max(8, Math.round(2 / mpp / step)), top: 6 }).map(q => ({ dir: G2.lineDir(q.theta), score: q.score })) : [];
        db.paint = pp.length; db.hough = HA.slice(0, 3).map(q => +q.dir.toFixed(1));
        if (best < 0.12) { const pm = mar && mar.aspect >= 2.2 && HA.find(q => G2.angDiff(q.dir, mar.angle) < 6); if (!pm) return; best = 0.12; bestA = pm.dir; db.fallback = 'calipers+hough'; }
        else { const along = HA.find(q => G2.angDiff(q.dir, bestA) < 4); if (along) { bestA = ((along.dir % 180) + 180) % 180; db.refined = +bestA.toFixed(2); } }
        // bay angle: each candidate (straight in, and every angled direction the Hough found) is tested by shearing the painted pixels
        // so that dividers of that slope collapse onto single points along the row; the right slope gives the sharpest histogram (a sheared Radon test)
        const a1 = bestA * Math.PI / 180, c1 = Math.cos(a1), s1 = Math.sin(a1), PV = pp.map(([x, y]) => [x * c1 + y * s1, -x * s1 + y * c1]);
        const sharp = sh => { if (PV.length < 60) return 0; const H = new Map(); PV.forEach(([u, v]) => { const k = Math.round((u - sh * v) / 0.25); H.set(k, (H.get(k) || 0) + 1); });
          const vals = [...H.values()], m = vals.reduce((x, y) => x + y, 0) / vals.length; return Math.sqrt(vals.reduce((x, y) => x + (y - m) ** 2, 0) / vals.length) / (m || 1); };
        const cands = [{ shear: 0, al: 90, sc: sharp(0) }];
        HA.forEach(q => { const al = G2.angDiff(q.dir, bestA); if (al < 35 || al > 80) return; const t = (q.dir - bestA) * Math.PI / 180; if (Math.abs(Math.sin(t)) < 0.2) return; const sh = Math.cos(t) / Math.sin(t); cands.push({ shear: sh, al, sc: sharp(sh) }); });
        cands.sort((x, y) => y.sc - x.sc);
        const win = cands[0].shear && cands[0].sc > cands.find(c => !c.shear).sc * 1.15 ? cands[0] : cands.find(c => !c.shear);   // angled only when clearly sharper
        const shear = win.shear, div = { dir: bestA + win.al }; db.shear = +shear.toFixed(3); db.cands = cands.map(c => [Math.round(c.al), +c.sc.toFixed(2)]); if (shear) db.bayAngle = +win.al.toFixed(1);
        // (the block's own rectangle is used for direction only; it is not drawn)
        const a = bestA * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), pr = profileAt(a, 1), nb = pr.nb;
        const val = new Float64Array(nb); for (let b = 0; b < nb; b++) val[b] = pr.N[b] > 6 ? pr.S2[b] / pr.N[b] : NaN;
        const sm = Array.from(val, (v, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = val[i + k]; if (q === q && q !== undefined) { s += q; n++; } } return n ? s / n : NaN; });
        const good = sm.filter(v => v === v).sort((p, q) => p - q); if (good.length < 10) return;
        const T = (good[Math.floor(good.length * 0.3)] + good[Math.floor(good.length * 0.85)]) / 2;
        const rows = []; let s0 = -1;
        for (let b = 0; b <= nb; b++) { const on = b < nb && sm[b] === sm[b] && sm[b] > T; if (on && s0 < 0) s0 = b; if (!on && s0 >= 0) { const wM = (b - s0) * bin * mpp;
            if (wM >= 3.5 && wM <= 8.5) rows.push([s0, b]); else if (wM > 9 && wM <= 14) { const m = Math.round((s0 + b) / 2); rows.push([s0, m], [m, b]); } s0 = -1; } }
        db.rows = rows.length;
        const toMap = (u, v) => { const x = u * ca - v * sa + ph.ox, y = u * sa + v * ca + ph.oy; return toLL(x, y); };
        const inside = (u, v) => { const x = Math.round(u * ca - v * sa), y = Math.round(u * sa + v * ca); return x > 0 && y > 0 && x < w - 1 && y < h - 1 && inC(cp.k, x, y); };
        const cRuns = [];
        rows.forEach(([b0, b1]) => { const v0 = b0 * bin - D, v1 = b1 * bin - D, q = 0.25 / mpp, nu = Math.ceil(2 * D / q) + 2, Su = new Float64Array(nu), Nu = new Float64Array(nu);
          for (let y = Math.max(1, Y0); y < Math.min(h - 1, Y1); y++) for (let x = Math.max(1, X0); x < Math.min(w - 1, X1); x++) { if (!inC(cp.k, x, y)) continue; const v = -x * sa + y * ca; if (v < v0 || v > v1) continue; const u = x * ca + y * sa, k = Math.floor((u + D) / q); Su[k] += G[y * w + x]; Nu[k]++; }
          // where the row continues: busy, covered stretches at least 7.5 m long, gaps over 4 m end a stretch
          const per = Array.from(Su, (s, k) => Nu[k] > 2 ? s / Nu[k] : 0), m4 = Math.round(1 / 0.25);
          let r0 = -1, gap = 0; const segs = [];
          for (let k = 0; k <= nu; k += 1) { let s = 0, n = 0; for (let j = k; j < Math.min(nu, k + m4); j++) if (Nu[j] > 2) { s += per[j]; n++; } const on = k < nu && n >= m4 / 2 && s / n > T * 0.85;
            if (on) { if (r0 < 0) r0 = k; gap = 0; } else if (r0 >= 0) { gap++; if (gap * 0.25 > 4 || k === nu) { const e = k - gap + 1; if ((e - r0) * 0.25 >= 7.5) segs.push([r0, e]); r0 = -1; gap = 0; } } }
          segs.forEach(([k0, k1]) => {
            // 4. the rhythm of real bays: autocorrelation of the edge profile along the row must peak at a bay width (2.2 to 3.1 m).
            //    Roads, roofs and sand have no such beat. The peak also gives this car park's own bay width.
            const P = per.slice(k0, k1), Z = P.map((x, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 10); j <= Math.min(P.length - 1, i + 10); j++) { s += P[j]; n++; } return x - s / n; }), E = Z.reduce((x, y) => x + y * y, 0) || 1;   // detrended over 5 m
            let pk = 0, lag = 10; for (let L = 9; L <= 12; L++) { let s = 0; for (let i = 0; i + L < Z.length; i++) s += Z[i] * Z[i + L]; s /= E * (Z.length - L) / Z.length; if (s > pk) { pk = s; lag = L; } }
            db.segs++; db.pk.push(+pk.toFixed(2));
            // inside a mapped car park a clear row is trusted even when the beat is weak (empty or full rows); elsewhere the beat is required
            if (pk < 0.07) { if (!(lot && best >= 0.2)) return; lag = 10; }
            // stripes finer than a bay (zebra crossings, hatching) also echo at a bay width, as a harmonic: their beat at half that
            // distance is as strong, and real bays have none there
            if (pk >= 0.07) { const hl = Math.round(lag / 2); let hs = 0; for (let i = 0; i + hl < Z.length; i++) hs += Z[i] * Z[i + hl]; hs /= E * (Z.length - hl) / Z.length; if (hs > 0.12 && hs > pk * 0.6) { db.zebra = (db.zebra || 0) + 1; return; } }
            const bayM = lag * 0.25, bp = bayM / mpp;
            // phase: start the bays on the painted lines (the strongest edges at the bay rhythm)
            let ph0 = 0, phs = -1; for (let o = 0; o < lag; o++) { let s = 0; for (let i = o; i < P.length; i += lag) s += P[i]; if (s > phs) { phs = s; ph0 = o; } }
            const uStart = (k0 + ph0) * q - D, n = Math.floor(((k1 - k0 - ph0) * 0.25) / bayM);
            // 5. every bay checked on its own: at least 55% of it must be paved car park, else it is dropped
            const vm = (v0 + v1) / 2, sh = v => shear * (v - vm), vegAt = (u, v) => { const x = Math.round(u * ca - v * sa), y = Math.round(u * sa + v * ca); return x >= 0 && y >= 0 && x < w && y < h && VEG[y * w + x] && G[y * w + x] > 28; };
            const ringOf = (a0, a1) => [toMap(a0 + sh(v0), v0), toMap(a1 + sh(v0), v0), toMap(a1 + sh(v1), v1), toMap(a0 + sh(v1), v1), toMap(a0 + sh(v0), v0)];
            // 6. obstacle filter: a bay is dropped when more than 15% of it is tree canopy in the photo (green and textured, so green paint does not count), or more than 10% lies under a mapped
            //    building (exact polygon overlap by Sutherland–Hodgman clipping)
            const ok = []; for (let j = 0; j < n; j++) { const a0 = uStart + j * bp, a1 = a0 + bp; let t = 0, gd = 0, vg = 0;
              for (let su = 0.15; su < 1; su += 0.23) for (let sv = 0.12; sv < 1; sv += 0.19) { t++; const vv = v0 + sv * (v1 - v0), uu = a0 + su * (a1 - a0) + sh(vv); if (inside(uu, vv)) gd++; if (vegAt(uu, vv)) vg++; }
              let good = gd / t >= 0.55; if (!good) FILT.paved++; if (good && vg / t > 0.15) { good = false; FILT.veg++; } if (good && BLD.length && bldShare(ringOf(a0, a1)) > 0.10) { good = false; FILT.bld++; } ok.push(good); }
            let j = 0; while (j < n) { if (!ok[j]) { j++; continue; } let e = j; while (e + 1 < n && ok[e + 1]) e++; const cnt = e - j + 1;
              if (cnt >= 3) { const u0 = uStart + j * bp, u1 = uStart + (e + 1) * bp, bays = [];
                for (let t = j; t <= e; t++) { const a0 = uStart + t * bp, a1 = a0 + bp, bb = { ring: ringOf(a0, a1), c: toMap((a0 + a1) / 2, (v0 + v1) / 2), u: (a0 + a1) / 2, v: (v0 + v1) / 2 }; bays.push(bb); out.bays.push(bb); }
                const ring = ringOf(u0, u1); out.rows.push(ring); spaces += cnt;
                const run = { v0, v1, u0, u1, ring, bays, comp: cp.k, rot: Math.round(((-bestA) % 180 + 180) % 180), bayM, toMap, shear, bayAngle: shear ? Math.round(win.al) : 90 }; runs.push(run); cRuns.push(run); }
              j = e + 1; } }); });
        // driving lanes: the smooth gap between two neighbouring rows of this block
        cRuns.sort((p, q2) => p.v0 - q2.v0);
        for (let k = 0; k < cRuns.length - 1; k++) { const A1 = cRuns[k], B1 = cRuns[k + 1], gapM = (B1.v0 - A1.v1) * mpp;
          if (gapM >= 3.5 && gapM <= 10) { const u0 = Math.max(A1.u0, B1.u0), u1 = Math.min(A1.u1, B1.u1), v = (A1.v1 + B1.v0) / 2; if ((u1 - u0) * mpp > 6) out.aisles.push([toMap(u0, v), toMap(u1, v)]); } }
        if (cRuns.length) kept++; });
      // 6b. layout fit, section by section: an open car park is a regular lattice, so a model is fitted to it rather than guessed bay by bay.
      //     Rows run at an angle θ; across them the pattern repeats every P metres as [row d][row d][lane a] (P = 2d + a, double-loaded);
      //     along them bays repeat every w metres. θ maximises the banding of edge strength (Radon transform), (P, d, φ) maximise the
      //     correlation r between the cross-profile and the ±1 template of that pattern, w comes from the autocorrelation along the rows.
      //     Every stretch of every fitted row is then checked against the photo on its own: over a 10 m window the row must be clearly
      //     busier than its own driving lane (cars or bay lines against smooth asphalt, ratio ≥ 1.2), so a section laid out differently
      //     never gets bays from the wrong grid. What a section explains is removed and the fit runs again on the rest (up to 6 sections),
      //     so a car park built in parts at different angles or spacings is read in full. Bays: N = Σ over verified stretches of
      //     floor(length / w); the capacity A / (w·(d + a/2)) of the whole paved area is given alongside as a check.
      if (lot || AIS.length || paved) { const st0 = Math.max(1, Math.round(0.5 / mpp)), RPall = [];
        for (let y = 2; y < h - 2; y += st0) for (let x = 2; x < w - 2; x += st0) { const i = y * w + x; if (inLot(i)) RPall.push(i); }
        const pxA = (st0 * mpp) ** 2, areaAll = RPall.length * pxA;
        if (areaAll >= 1200) {
          const GF2 = GA.some(v => v > 0) ? GA : (() => { const g = new Float32Array(WH); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!inLot(i)) continue;
            const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1], gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]; g[i] = Math.min(255, Math.hypot(gx, gy)); } return g; })();
          const avail = new Uint8Array(WH); RPall.forEach(i => { avail[i] = 1; });
          const fitRuns = [], fitAisles = [], secs = dbg.fit = []; secs.area = Math.round(areaAll);
          // after the first section, what is left is split into separate pieces (2 m cells, eroded by one cell so the thin strips left along
          // lanes and kerbs fall away) and each piece is fitted on its own, largest first; a piece that fits no lattice is set aside
          const c3 = Math.max(2, Math.round(2 / mpp)), gw4 = Math.ceil(w / c3), gh4 = Math.ceil(h / c3), N4 = gw4 * gh4, cellOf = i => (((i / w) | 0) / c3 | 0) * gw4 + ((i % w) / c3 | 0);
          const pieces = () => { const cnt = new Uint16Array(N4), tot = new Uint16Array(N4); RPall.forEach(i => { const c = cellOf(i); tot[c]++; if (avail[i]) cnt[c]++; });
            const on = new Uint8Array(N4); for (let c = 0; c < N4; c++) on[c] = tot[c] && cnt[c] >= tot[c] * 0.5 ? 1 : 0;
            const er = new Uint8Array(N4); for (let c = 0; c < N4; c++) { if (!on[c]) continue; const x = c % gw4, y = (c / gw4) | 0; er[c] = x > 0 && y > 0 && x < gw4 - 1 && y < gh4 - 1 && on[c - 1] && on[c + 1] && on[c - gw4] && on[c + gw4] ? 1 : 0; }
            const lab = new Int32Array(N4).fill(-1), P = []; for (let c0 = 0; c0 < N4; c0++) { if (!er[c0] || lab[c0] >= 0) continue; const k = P.length, q = [c0], cells = []; lab[c0] = k;
              while (q.length) { const c = q.pop(); cells.push(c); const x = c % gw4, y = (c / gw4) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw4 || ny >= gh4) continue; const o = ny * gw4 + nx; if (er[o] && lab[o] < 0) { lab[o] = k; q.push(o); } } }
              P.push(cells); }
            return P.map(cells => { const inP = new Uint8Array(N4); cells.forEach(c => { const x = c % gw4, y = (c / gw4) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < gw4 && ny < gh4) inP[ny * gw4 + nx] = 1; } });
              return RPall.filter(i => avail[i] && inP[cellOf(i)]); }).filter(p => p.length * pxA >= 600).sort((p, q) => q.length - p.length); };
          for (let it = 0, tries = 0; it < 8 && tries < 12; tries++) {
            let RP = RPall.filter(i => avail[i]); if (RP.length * pxA < 600) break;
            if (it > 0) { const P = pieces(); if (!P.length) break; RP = P[0]; }
            const fr0 = fitRuns.length, fa0 = fitAisles.length, setAside = () => { RP.forEach(i => { avail[i] = 0; }); };
            let cxp = 0, cyp = 0; RP.forEach(i => { cxp += i % w; cyp += (i / w) | 0; }); cxp /= RP.length; cyp /= RP.length;
            const prof = (a, bin) => { const ca = Math.cos(a), sa = Math.sin(a), S = new Map(); RP.forEach(i => { const x = i % w - cxp, y = ((i / w) | 0) - cyp, v = Math.floor((-x * sa + y * ca) * mpp / bin); const e = S.get(v) || [0, 0]; e[0] += GF2[i]; e[1]++; S.set(v, e); }); return S; };
            const band = a => { const S = prof(a, 0.5), vals = [...S.values()].filter(e => e[1] > 8).map(e => e[0] / e[1]); if (vals.length < 20) return 0; const m = vals.reduce((p, q) => p + q, 0) / vals.length; return Math.sqrt(vals.reduce((p, q) => p + (q - m) ** 2, 0) / vals.length) / (m || 1); };
            let bA = 0, bS = -1; for (let d = 0; d < 180; d += 2) { const sc = band(d * Math.PI / 180); if (sc > bS) { bS = sc; bA = d; } }
            for (let d = bA - 2; d <= bA + 2; d += 0.25) { const sc = band(d * Math.PI / 180); if (sc > bS) { bS = sc; bA = d; } }
            const th = bA * Math.PI / 180, ca = Math.cos(th), sa = Math.sin(th);
            const S = prof(th, 0.25), keys = [...S.keys()].filter(k => S.get(k)[1] > 4); if (keys.length < 40) { if (it === 0) break; setAside(); continue; }
            const kMin = Math.min(...keys), kMax = Math.max(...keys), nV = kMax - kMin + 1, Zv = new Float64Array(nV), Cv = new Uint8Array(nV);
            keys.forEach(k => { const e = S.get(k); Zv[k - kMin] = e[0] / e[1]; Cv[k - kMin] = 1; });
            const zs = keys.map(k => Zv[k - kMin]), zm = zs.reduce((p, q) => p + q, 0) / zs.length, zsd = Math.sqrt(zs.reduce((p, q) => p + (q - zm) ** 2, 0) / zs.length) || 1; for (let j = 0; j < nV; j++) if (Cv[j]) Zv[j] = (Zv[j] - zm) / zsd;
            let fit = { r: -1 }; const nCov = keys.length;
            for (let P = 14.5; P <= 19.01; P += 0.25) for (let d = 4.5; d <= 5.76; d += 0.25) { const a = P - 2 * d; if (a < 4.5 || a > 8) continue; const nP = Math.round(P / 0.25), nD = Math.round(d / 0.25);
              for (let f = 0; f < nP; f++) { let sm = 0; for (let j = 0; j < nV; j++) { if (!Cv[j]) continue; const ph2 = ((j - f) % nP + nP) % nP; sm += ph2 < 2 * nD ? Zv[j] : -Zv[j]; } const r = sm / nCov; if (r > fit.r) fit = { r, P, d, a, f, nP, nD }; } }
            const sec = { ang: +bA.toFixed(2), band: +bS.toFixed(3), r: +fit.r.toFixed(3), P: fit.P, d: fit.d, a: fit.a, area: Math.round(RP.length * pxA), n: 0 }; secs.push(sec);
            if (fit.r < (it ? 0.3 : 0.2)) { if (it === 0) break; setAside(); continue; }
            // every sample assigned to its row (kk, side s2) or lane kk of the lattice, binned at 0.25 m along the rows
            const { f, nP, nD } = fit, cell = i => { const x = i % w - cxp, y = ((i / w) | 0) - cyp, j = Math.floor((-x * sa + y * ca) * mpp / 0.25) - kMin, ph2 = ((j - f) % nP + nP) % nP, kk = Math.floor((j - f) / nP);
              return { kk, s2: ph2 < nD ? 0 : ph2 < 2 * nD ? 1 : 2, ub: Math.floor((x * ca + y * sa) * mpp / 0.25) }; };
            let ubMin = 1e9, ubMax = -1e9; const C = RP.map(i => { const c = cell(i); ubMin = Math.min(ubMin, c.ub); ubMax = Math.max(ubMax, c.ub); return c; }); const nU = ubMax - ubMin + 1;
            const acc = new Map(), get = key => { let e = acc.get(key); if (!e) { e = { S: new Float64Array(nU), N: new Float64Array(nU) }; acc.set(key, e); } return e; };
            RP.forEach((i, n) => { const c = C[n], e = get(c.s2 === 2 ? 'L' + c.kk : c.kk + ',' + c.s2); e.S[c.ub - ubMin] += GF2[i]; e.N[c.ub - ubMin]++; });
            const win = 20, sumW = (arr, b) => { let s = 0; for (let j = Math.max(0, b - win); j <= Math.min(nU - 1, b + win); j++) s += arr[j]; return s; };
            const expRow = nD * 0.25 / (st0 * mpp) * (0.25 / (st0 * mpp)) * (2 * win + 1), expLane = (nP - 2 * nD) * 0.25 / (st0 * mpp) * (0.25 / (st0 * mpp)) * (2 * win + 1);
            const laneMeans = []; acc.forEach((e, key) => { if (key[0] !== 'L') return; const s = e.S.reduce((p, q) => p + q, 0), n = e.N.reduce((p, q) => p + q, 0); if (n > 50) laneMeans.push(s / n); });
            laneMeans.sort((p, q) => p - q); const medLane = laneMeans.length ? laneMeans[laneMeans.length >> 1] : 1e9;
            const toMapF = (u, v) => toLL(cxp + u * ca - v * sa + ph.ox, cyp + u * sa + v * ca + ph.oy), pxAt = (u, v) => { const xi = Math.round(cxp + u * ca - v * sa), yi = Math.round(cyp + u * sa + v * ca); return xi < 0 || yi < 0 || xi >= w || yi >= h ? -1 : yi * w + xi; };
            const mP = 1 / mpp, keptBins = new Map(), stretches = [];
            acc.forEach((e, key) => { if (key[0] === 'L') return; const [kk, s2] = key.split(',').map(Number), lane = acc.get('L' + (s2 === 1 ? kk : kk - 1)), ok = new Uint8Array(nU);
              for (let b = 0; b < nU; b++) { const rn = sumW(e.N, b); if (rn < expRow * 0.6) continue; const rm = sumW(e.S, b) / rn, ln = lane ? sumW(lane.N, b) : 0, lm = ln >= expLane * 0.3 ? sumW(lane.S, b) / ln : medLane; if (rm > lm * 1.2) ok[b] = 1; }
              // verified stretches: at least 10 m long in the first section (7.5 m after), gaps of up to 1 m bridged; a grid that only half matches a
              // part of the car park leaves that part whole for its own fit
              let b0 = -1, gap = 0; for (let b = 0; b <= nU; b++) { const on = b < nU && ok[b] && e.N[b] > 0; if (on) { if (b0 < 0) b0 = b; gap = 0; } else if (b0 >= 0) { gap++; if (gap > 4 || b === nU) { const b1 = b - gap + 1; if ((b1 - b0) * 0.25 >= (it ? 7.5 : 10)) stretches.push({ kk, s2, b0, b1, e }); b0 = -1; gap = 0; } } } });
            if (!stretches.length) { if (it === 0) break; setAside(); continue; }
            // bay width w from the rhythm along the verified stretches (2.25 to 3 m), each stretch then phased on its own painted lines
            let pkU = 0, lagU = 10; { const Zs = stretches.map(s => { const P2 = []; for (let b = s.b0; b < s.b1; b++) P2.push(s.e.N[b] ? s.e.S[b] / s.e.N[b] : 0); return P2.map((x, i) => { let sm = 0, n = 0; for (let j = Math.max(0, i - 12); j <= Math.min(P2.length - 1, i + 12); j++) { sm += P2[j]; n++; } return x - sm / n; }); });
              for (let Lg = 9; Lg <= 12; Lg++) { let sm = 0, E = 0; Zs.forEach(Z => { for (let i = 0; i < Z.length; i++) { E += Z[i] * Z[i]; if (i + Lg < Z.length) sm += Z[i] * Z[i + Lg]; } }); const v = sm / (E || 1); if (v > pkU) { pkU = v; lagU = Lg; } } }
            if (pkU < 0.05) lagU = 10; const wB = lagU * 0.25, bpx = wB * mP, rot = Math.round(((-bA) % 180 + 180) % 180), lanesU = new Map(); let got = 0;
            stretches.forEach(s => { const v0 = ((s.kk * nP + f + s.s2 * nD) + kMin) * 0.25 * mP, v1 = v0 + nD * 0.25 * mP;
              let phU = 0, phS = -1; for (let o = 0; o < lagU; o++) { let sm = 0; for (let b = s.b0 + o; b < s.b1; b += lagU) sm += s.e.N[b] ? s.e.S[b] / s.e.N[b] : 0; if (sm > phS) { phS = sm; phU = o; } }
              let cur = null; const kb = keptBins.get(s.kk + ',' + s.s2) || new Uint8Array(nU); keptBins.set(s.kk + ',' + s.s2, kb);
              const close = () => { if (cur && cur.bays.length >= 2) { fitRuns.push(cur); got += cur.bays.length; cur.bays.forEach(bb => { for (let b = bb.b; b < bb.b + lagU; b++) kb[b] = 1; });
                const lid = s.s2 === 1 ? s.kk : s.kk - 1, L0 = lanesU.get(lid) || [1e9, -1e9]; L0[0] = Math.min(L0[0], cur.bays[0].u - bpx / 2); L0[1] = Math.max(L0[1], cur.bays[cur.bays.length - 1].u + bpx / 2); lanesU.set(lid, L0); } cur = null; };
              for (let b = s.b0 + phU; b + lagU <= s.b1 + 2; b += lagU) { const a0 = (b + ubMin) * 0.25 * mP, a1 = a0 + bpx; let t = 0, gd = 0, vg = 0;
                for (let su = 0.15; su < 1; su += 0.23) for (let sv = 0.12; sv < 1; sv += 0.19) { const i = pxAt(a0 + su * bpx, v0 + sv * (v1 - v0)); t++; if (i < 0) continue; if (inLot(i)) gd++; if (VEG[i] && GF2[i] > 28) vg++; }
                if (gd / t < 0.6 || vg / t > 0.15) { if (vg / t > 0.15) FILT.veg++; close(); continue; }
                const ring = [toMapF(a0, v0), toMapF(a1, v0), toMapF(a1, v1), toMapF(a0, v1), toMapF(a0, v0)]; if (BLD.length && bldShare(ring) > 0.10) { FILT.bld++; close(); continue; }
                if (!cur) cur = { v0, v1, bays: [], comp: 800000 + it * 1000 + s.kk * 2 + s.s2, rot, bayM: wB, toMap: toMapF, shear: 0, bayAngle: 90, fit: true };
                cur.bays.push({ ring, c: toMapF((a0 + a1) / 2, (v0 + v1) / 2), u: (a0 + a1) / 2, v: (v0 + v1) / 2, b: b }); }
              close(); });
            lanesU.forEach(([u0, u1], lid) => { const vm = ((lid * nP + f + 2 * nD) + kMin + (nP - 2 * nD) / 2) * 0.25 * mP; fitAisles.push([toMapF(u0, vm), toMapF(u1, vm)]); });
            sec.n = got; sec.w = wB; if (got < 8) { fitRuns.length = fr0; fitAisles.length = fa0; sec.n = 0; if (it === 0) { secs.weak = 1; break; } setAside(); continue; }
            // what this section explains (its verified rows and the lanes between them) is taken out before the next fit
            let gone = 0; RP.forEach((i, n) => { const c = C[n], b = c.ub - ubMin; let hit = false;
              if (c.s2 < 2) { const kb = keptBins.get(c.kk + ',' + c.s2); hit = !!(kb && kb[Math.max(0, b - 2)] | kb[b] | kb[Math.min(nU - 1, b + 2)]); }
              else { const k1 = keptBins.get(c.kk + ',1'), k2 = keptBins.get((c.kk + 1) + ',0'); hit = !!((k1 && k1[b]) || (k2 && k2[b])); }
              if (hit) { avail[i] = 0; gone++; } });
            it++; if (gone * pxA < 100) setAside(); }
          fitRuns.forEach(r => { r.u0 = Math.min(...r.bays.map(b => b.u)) - r.bayM / mpp / 2; r.u1 = Math.max(...r.bays.map(b => b.u)) + r.bayM / mpp / 2; r.ring = [r.toMap(r.u0, r.v0), r.toMap(r.u1, r.v0), r.toMap(r.u1, r.v1), r.toMap(r.u0, r.v1), r.toMap(r.u0, r.v0)]; r.bays.forEach(b => { delete b.b; }); });
          const nFit = fitRuns.reduce((p, r) => p + r.bays.length, 0), nOld = runs.reduce((p, r) => p + r.bays.length, 0); secs.n = nFit; secs.old = nOld;
          // the fitted layout replaces the patchwork when it explains the photo and finds at least as much
          if (nFit >= 8 && nFit >= nOld * 0.8) { const s0 = secs.find(s => s.n) || secs[0]; runs.length = 0; fitRuns.forEach(r => runs.push(r)); out.rows = runs.map(r => r.ring); out.bays = runs.flatMap(r => r.bays); spaces = out.bays.length;
            out.aisles = fitAisles; kept = secs.filter(s => s.n >= 8).length;
            FILT.fit = { n: nFit, P: s0.P, d: s0.d, a: +s0.a.toFixed(2), w: s0.w, ang: s0.ang, sections: kept, est: Math.round(areaAll / (s0.w * (s0.d + s0.a / 2))), area: Math.round(areaAll) };
            if (lot && lot.ring) out.blocks = [lot.ring]; } } }

      // 7. shade structures: long bright roofs 4 to 12 m wide (one or two rows of cars) whose surface carries a regular stripe every 2.2 to 3.4 m,
      //    one stripe per bay. Found anywhere in the photo except on mapped tall buildings and roads, whatever the colour filter said about them;
      //    where one is found, its bays replace anything the other readings placed there.
      { const ob = document.createElement('canvas'); ob.width = w; ob.height = h; const og = ob.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, w, h); og.fillStyle = og.strokeStyle = '#000'; og.lineCap = 'round';
        OBST.blds.forEach(r => { og.beginPath(); r.forEach((q, i) => { const [x, y] = L(q); i ? og.lineTo(x, y) : og.moveTo(x, y); }); og.closePath(); og.fill(); });
        OBST.roads.forEach(rd => { og.lineWidth = rd.w / mpp; og.beginPath(); rd.line.forEach((q, i) => { const [x, y] = L(q); i ? og.lineTo(x, y) : og.moveTo(x, y); }); og.stroke(); });
        const od = og.getImageData(0, 0, w, h).data, base = lum0 / 3, roof = i => { const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2]; return od[i * 4] > 128 && gray[i] > base + 28 && Math.min(r, g, b) > 105 && !(g > r + 8 && g > b + 2); };
        const c1 = Math.max(2, Math.round(1.5 / mpp)), gw2 = Math.ceil(w / c1), gh2 = Math.ceil(h / c1), on = new Uint8Array(gw2 * gh2), lb = new Int32Array(gw2 * gh2).fill(-1);
        for (let gy = 0; gy < gh2; gy++) for (let gx = 0; gx < gw2; gx++) { let n = 0, t = 0; for (let y = gy * c1; y < Math.min(h, gy * c1 + c1); y++) for (let x = gx * c1; x < Math.min(w, gx * c1 + c1); x++) { t++; if (roof(y * w + x)) n++; } on[gy * gw2 + gx] = n > t * 0.4 ? 1 : 0; }
        const shades = dbg.shades = [], placed = [];
        for (let s0 = 0; s0 < gw2 * gh2; s0++) { if (!on[s0] || lb[s0] >= 0) continue; const k = shades.length + 1, q = [s0], pts = []; lb[s0] = k;
          while (q.length) { const c = q.pop(), cx = c % gw2, cy = (c / gw2) | 0; pts.push([cx * c1, cy * c1], [cx * c1 + c1, cy * c1], [cx * c1, cy * c1 + c1], [cx * c1 + c1, cy * c1 + c1]);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw2 || ny >= gh2) return; const o = ny * gw2 + nx; if (on[o] && lb[o] < 0) { lb[o] = k; q.push(o); } }); }
          const nC = pts.length / 4, aM = nC * (c1 * mpp) ** 2; if (aM < 50) continue;
          const mr = G2.minAreaRect(pts); if (!mr) continue; const Wm = mr.width * mpp, Lm = mr.length * mpp, fill = aM / (mr.area * mpp * mpp);
          const d = { area: Math.round(aM), L: +Lm.toFixed(1), W: +Wm.toFixed(1), fill: +fill.toFixed(2) }; shades.push(d);
          if (Lm < 10 || Wm < 4 || fill < (lot ? 0.45 : 0.65)) continue;
          // the long and short sides of the rectangle
          const P = mr.corners, e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1]], e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1]], l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
          const [U, Lp, V, Wp] = l1 >= l2 ? [[e1[0] / l1, e1[1] / l1], l1, [e2[0] / l2, e2[1] / l2], l2] : [[e2[0] / l2, e2[1] / l2], l2, [e1[0] / l1, e1[1] / l1], l1];
          const at = (u, v) => [P[0][0] + u * U[0] + v * V[0], P[0][1] + u * U[1] + v * V[1]], toM = (u, v) => { const [x, y] = at(u, v); return toLL(x + ph.ox, y + ph.oy); };
          const pix = (u, v) => { const [x, y] = at(u, v), xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= w || yi >= h ? -1 : yi * w + xi; };
          // rows of shades merged into one shape (joined at their ends) are split into bright bands across the short side
          let bands = [[0, Wp]];
          if (Wm > 12.5) { const vb = 0.5 / mpp, nv = Math.floor(Wp / vb), fr = []; for (let j = 0; j < nv; j++) { let n = 0, t = 0; for (let uu = 0; uu < Lp; uu += 2) { const i = pix(uu, (j + 0.5) * vb); if (i < 0) continue; t++; if (roof(i)) n++; } fr.push(t ? n / t : 0); }
            bands = []; let b0 = -1; for (let j = 0; j <= nv; j++) { const onB = j < nv && fr[j] > 0.45; if (onB && b0 < 0) b0 = j; if (!onB && b0 >= 0) { const wm = (j - b0) * 0.5; if (wm >= 4 && wm <= 12.5) bands.push([b0 * vb, j * vb]); b0 = -1; } } }
          d.bands = bands.length;
          bands.forEach(([vA, vB], bi) => { const Wb = (vB - vA) * mpp;
            { let n = 0, t = 0; for (let uu = 0; uu < Lp; uu += 3) for (let vv = vA; vv < vB; vv += 3) { const i = pix(uu, vv); if (i < 0) continue; t++; if (inLot(i)) n++; } if (!t || n / t < 0.5) return; }   // only shades over the car park itself
            // brightness along the roof (middle 60% of the band): the stripes
            const q4 = 0.25 / mpp, nb = Math.floor(Lp / q4), prof = new Float64Array(nb), cov = new Float64Array(nb);
            for (let b = 0; b < nb; b++) { let sm = 0, n = 0, rf = 0; for (let uu = b * q4; uu < (b + 1) * q4; uu += 1) for (let vv = vA + (vB - vA) * 0.2; vv < vA + (vB - vA) * 0.8; vv += 1) { const i = pix(uu, vv); if (i < 0) continue; sm += gray[i]; n++; if (roof(i)) rf++; } prof[b] = n ? sm / n : 0; cov[b] = n ? rf / n : 0; }
            // the stretch of the band that is really roof (ends trimmed where it fades into lane or sand)
            let k0 = 0, k1 = nb; const cw = (i0) => { let sm = 0, n = 0; for (let j = i0; j < Math.min(nb, i0 + 12); j++) { sm += cov[j]; n++; } return n ? sm / n : 0; };
            while (k0 < nb - 12 && cw(k0) < 0.4) k0++; while (k1 > k0 + 12 && cw(k1 - 12) < 0.4) k1--;
            const P2 = Array.from(prof.slice(k0, k1)), m2 = P2.length; if (m2 * 0.25 < 10) return;
            const Z = P2.map((x, i) => { let sm = 0, n = 0; for (let j = Math.max(0, i - 12); j <= Math.min(m2 - 1, i + 12); j++) { sm += P2[j]; n++; } return x - sm / n; }), E = Z.reduce((a, b) => a + b * b, 0) || 1;
            // one stripe per bay (2.2 to 3.4 m), or one tent per two bays (4.5 to 7 m, each split in two)
            const ac = Lg => { let sm = 0; for (let i = 0; i + Lg < m2; i++) sm += Z[i] * Z[i + Lg]; return sm / (E * (m2 - Lg) / m2); };
            let pk = 0, lag = 10, per2 = 1; for (let Lg = 9; Lg <= 14; Lg++) { const v = ac(Lg); if (v > pk) { pk = v; lag = Lg; } }
            let pk2 = 0, lag2 = 22; for (let Lg = 18; Lg <= 28; Lg++) { const v = ac(Lg); if (v > pk2) { pk2 = v; lag2 = Lg; } }
            if (pk2 > pk * 1.3 && pk2 >= 0.2) { pk = pk2; lag = lag2; per2 = 2; }
            (d.pk = d.pk || []).push(+pk.toFixed(2) + (per2 > 1 ? 't' : '')); if (pk < 0.15) return;
            // bays start on the dark stripes (the gaps between roof panels sit over the bay lines)
            let ph0 = 0, best = 1e18; for (let o = 0; o < lag; o++) { let sm = 0, n = 0; for (let i = o; i < m2; i += lag) { sm += P2[i]; n++; } if (n && sm / n < best) { best = sm / n; ph0 = o; } }
            const bp = lag * q4 / per2, uS = (k0 + ph0 + 0.5) * q4, nBay = Math.floor(((k1 - k0 - ph0 - 0.5) * q4) / bp); if (nBay < 3) return;
            const rowsV = Wb < 7.5 ? [[vA, vB]] : [[vA, (vA + vB) / 2], [(vA + vB) / 2, vB]], comp = 900000 + k * 10 + bi, rot = Math.round(((-Math.atan2(U[1], U[0]) * 180 / Math.PI) % 180 + 180) % 180);
            // clear anything placed here by the other readings
            const inside = c => { const [x, y] = toPx(c[0], c[1]), dx = x - ph.ox - P[0][0], dy = y - ph.oy - P[0][1], u = dx * U[0] + dy * U[1], v = dx * V[0] + dy * V[1]; return u > uS - 2 && u < uS + nBay * bp + 2 && v > vA - 2 && v < vB + 2; };
            for (let r = runs.length - 1; r >= 0; r--) { const R = runs[r]; if (R.shade) continue; R.bays = R.bays.filter(bb => !inside(bb.c)); if (R.bays.length < 2) runs.splice(r, 1); }
            let got = 0; rowsV.forEach(([v0, v1]) => { const bays = [];
              for (let j = 0; j < nBay; j++) { const a0 = uS + j * bp, a1 = a0 + bp, ring = [toM(a0, v0), toM(a1, v0), toM(a1, v1), toM(a0, v1), toM(a0, v0)];
                if (BLD.length && bldShare(ring) > 0.10) { FILT.bld++; continue; } bays.push({ ring, c: toM((a0 + a1) / 2, (v0 + v1) / 2), u: (a0 + a1) / 2, v: (v0 + v1) / 2 }); }
              if (bays.length < 2) return; got += bays.length; const u0 = Math.min(...bays.map(b => b.u)) - bp / 2, u1 = Math.max(...bays.map(b => b.u)) + bp / 2;
              runs.push({ v0, v1, u0, u1, ring: [toM(u0, v0), toM(u1, v0), toM(u1, v1), toM(u0, v1), toM(u0, v0)], bays, comp, rot, bayM: lag * 0.25 / per2, toMap: toM, shear: 0, bayAngle: 90, shade: true }); });
            if (got) { d.bays = (d.bays || 0) + got; if (!placed.includes(d)) placed.push(d); } }); }
        if (placed.length) { out.rows = runs.map(r => r.ring); out.bays = runs.flatMap(r => r.bays); spaces = out.bays.length; kept = Math.max(kept, 1) + placed.length; FILT.shade = placed.reduce((a, d) => a + d.bays, 0); } }
      if (collect) return out.rows.length ? { out, runs, spaces, kept, mpp, OBST, FILT } : null;
      if (!out.rows.length) { hint('Lane Vision found no rows with the regular rhythm of parking bays here (the photo may show an empty, covered or unmarked area). You can still drop the pin and build.'); return; }
      // pin on the row closest to the pin, canopies along that row
      const kx = 111320 * Math.cos(ctr[1] * Math.PI / 180), dist = (q2) => Math.hypot((q2[0] - ctr[0]) * kx, (q2[1] - ctr[1]) * 110540);
      let nearest = runs[0], nb2 = null, nd = 1e9; runs.forEach(r => r.bays.forEach(b => { const d = dist(b.c); if (d < nd) { nd = d; nearest = r; nb2 = b; } }));
      const [plon, plat] = nb2.c, rot = nearest.rot, name = (p && p.lot && p.lot.label) || (p && p.name) || 'Car park';
      A.setPin(plat, plon, (p && p.name) || null, { rot, lot: { label: name, kind: 'Surface', rows: out.rows, ring: null, lines: null, rot,
        capText: `about ${spaces.toLocaleString('en-US')} spaces in ${out.rows.length} rows, read from the satellite photo` } });
      LVS = { map, out, runs, nearest, pu: nb2.u, edited: false, bayPx: BAY / mpp, mpp, obst: OBST, lot: lot || null }; hookMap(map); tools.hidden = false; draw(map, out);
      const bw = nearest.bayM.toFixed(2);
      const ang = runs.filter(r => r.shear).length, dropped = FILT.bld + FILT.veg; dbg.filtered = FILT;
      hint(`Lane Vision: ${out.rows.length} parking rows in ${kept} block${kept > 1 ? 's' : ''}, ${out.aisles.length} driving lanes, about ${spaces.toLocaleString('en-US')} spaces (bays ${bw} m wide${nearest.shear ? `, angled at ${nearest.bayAngle}°` : ''}).${ang ? ` ${ang} row${ang > 1 ? 's' : ''} of angled parking.` : ''}${FILT.shade ? ` ${FILT.shade} bays read from the stripes of shade structures.` : ''}${FILT.fit ? ` Fitted layout${FILT.fit.sections > 1 ? ` in ${FILT.fit.sections} sections` : ''}: rows every ${FILT.fit.P} m (bays ${FILT.fit.d} m deep, lanes ${FILT.fit.a} m), ${FILT.fit.n} spaces counted, each row checked against the photo; the ${FILT.fit.area.toLocaleString('en-US')} m² paved area would hold about ${FILT.fit.est} at this layout.` : ''}${dropped ? ` ${dropped} bay${dropped > 1 ? 's' : ''} left out under trees or buildings.` : ''}`);
    }

    // ---- drawing, in the style of a site design: every bay a white rectangle, the charging bays green with a badge, lanes dashed ----
    let LVS = null, badges = [];
    const fc = (arr, type) => ({ type: 'FeatureCollection', features: arr.map((c, i) => ({ type: 'Feature', properties: { i }, geometry: { type, coordinates: type === 'Polygon' ? [c] : c } })) });
    function draw(map, out) {
      const ids = ['lv-blk', 'lv-row', 'lv-bay', 'lv-ev', 'lv-evl', 'lv-aisle', 'lv-hov'];
      const add = () => { ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); }); ['lv-k', 'lv-r', 'lv-b', 'lv-e', 'lv-a', 'lv-h'].forEach(id => { if (map.getSource(id)) map.removeSource(id); });
        map.addSource('lv-k', { type: 'geojson', data: fc((out.blocks || []).map(r => r), 'LineString') });
        map.addLayer({ id: 'lv-blk', type: 'line', source: 'lv-k', paint: { 'line-color': '#8DC63F', 'line-width': 2, 'line-opacity': 0.95 } });
        map.addSource('lv-r', { type: 'geojson', data: fc(out.rows, 'Polygon') }); map.addSource('lv-b', { type: 'geojson', data: fc([], 'Polygon') });
        map.addSource('lv-e', { type: 'geojson', data: fc([], 'Polygon') }); map.addSource('lv-a', { type: 'geojson', data: fc(out.aisles, 'LineString') }); map.addSource('lv-h', { type: 'geojson', data: fc([], 'Polygon') });
        map.addLayer({ id: 'lv-row', type: 'fill', source: 'lv-r', paint: { 'fill-color': '#0b0f16', 'fill-opacity': 0.35 } });
        map.addLayer({ id: 'lv-ev', type: 'fill', source: 'lv-e', paint: { 'fill-color': '#2fb344', 'fill-opacity': 0.78 } });
        map.addLayer({ id: 'lv-bay', type: 'line', source: 'lv-b', paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-opacity': 0.95 } });
        map.addLayer({ id: 'lv-evl', type: 'line', source: 'lv-e', paint: { 'line-color': '#ffffff', 'line-width': 3 } });
        map.addLayer({ id: 'lv-hov', type: 'fill', source: 'lv-h', paint: { 'fill-color': '#3BA9E0', 'fill-opacity': 0.45 } });
        map.addLayer({ id: 'lv-aisle', type: 'line', source: 'lv-a', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [3, 3], 'line-opacity': 0 } });
        // bays appear row by row
        let k = 0; const rowsB = LVS ? LVS.runs.map(r => r.bays) : [out.bays], step = () => { k++; map.getSource('lv-b').setData(fc(rowsB.slice(0, k).flat().map(b => b.ring), 'Polygon'));
          if (k < rowsB.length) setTimeout(step, 90); else map.setPaintProperty('lv-aisle', 'line-opacity', 0.85); };
        step(); markEV(); };
      if (map.style && map.style._loaded) add(); else map.once('styledata', add);
      map.once('style.load', () => draw(map, out));
    }
    // ---- the charging stalls: placed for you near the pin, then yours to edit like a design tool ----
    // drag across bays to draw stalls (they snap to the bays found in the photo), click a bay to add or remove it,
    // right-click a stall for: duplicate the row, mirror across the lane, swap AC and DC, add a bay, remove.
    const $ = q => A.dlg.querySelector(q), BOLT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1 3 9h4l-1 6 6-8H8z" fill="currentColor"/></svg>';
    const kindNow = () => ($('.tw-kind').value === 'dc' ? 'dc' : 'ac');
    let quiet = false;
    function autoEV() { if (!LVS) return; const n = Math.max(1, Math.min(40, parseInt($('.tw-spots').value, 10) || 8)), k = kindNow();
      LVS.runs.forEach(r => r.bays.forEach(b => { b.ev = null; }));
      const near = LVS.nearest, order = LVS.runs.slice().sort((p, q) => (p.comp !== near.comp) - (q.comp !== near.comp) || Math.abs((p.v0 + p.v1) / 2 - (near.v0 + near.v1) / 2) - Math.abs((q.v0 + q.v1) / 2 - (near.v0 + near.v1) / 2));
      let left = n; order.forEach(r => { if (left <= 0) return; r.bays.slice().sort((p, q) => Math.abs(p.u - LVS.pu) - Math.abs(q.u - LVS.pu)).slice(0, left).forEach(b => { b.ev = k; left--; }); });
      paint(); }
    function markEV() { if (LVS && !LVS.edited) autoEV(); else paint(); }
    const evBays = () => LVS ? LVS.runs.flatMap(r => r.bays.filter(b => b.ev)) : [];
    function paint() { if (!LVS) return; const map = LVS.map, ev = evBays();
      if (map.getSource('lv-e')) map.getSource('lv-e').setData(fc(ev.map(b => b.ring), 'Polygon'));
      badges.forEach(m => m.remove()); badges = ev.map(b => { const el = document.createElement('div'); el.className = 'lv-badge' + (b.ev === 'dc' ? ' is-dc' : '');
        el.innerHTML = BOLT + `<b>${b.ev === 'dc' ? 'DC' : 'AC'}</b>`; return new maplibregl.Marker({ element: el }).setLngLat(b.c).addTo(map); });
      // keep the form, the pin and the 3D build in step with the drawing
      if (LVS.edited && ev.length) { quiet = true; $('.tw-spots').value = ev.length; const dc = ev.filter(b => b.ev === 'dc').length; $('.tw-kind').value = dc > ev.length / 2 ? 'dc' : 'ac'; quiet = false;
        const p = A.pin(); if (p) { const c = ev.reduce((a, b) => [a[0] + b.c[0] / ev.length, a[1] + b.c[1] / ev.length], [0, 0]); A.setPin(c[1], c[0], p.name || null, Object.assign({}, p, { lat: c[1], lon: c[0] })); } }
      const st = $('.tw-lvstat'); if (st) { const dc = ev.filter(b => b.ev === 'dc').length; st.textContent = ev.length ? `${ev.length} charging stalls · ${ev.length - dc} AC · ${dc} DC` : 'No charging stalls yet: drag across bays to draw them'; }
      LVS.ev = ev.map(b => ({ c: b.c, kind: b.ev, ring: b.ring })); }
    $('.tw-spots').addEventListener('input', () => { if (quiet || !LVS) return; LVS.edited = false; autoEV(); });
    $('.tw-kind').addEventListener('change', () => { if (quiet || !LVS) return; if (LVS.edited) { const k = kindNow(); evBays().forEach(b => { b.ev = k; }); paint(); } else autoEV(); });

    // tools bar under the map, shown once the bays are read
    const tools = document.createElement('div'); tools.className = 'tw-lvtools'; tools.hidden = true;
    tools.innerHTML = '<button type="button" class="tw-lvdraw" aria-pressed="false" title="Drag across bays to make them charging stalls. Hold Shift to remove. Right-click a stall for more.">✎ Draw stalls</button>'
      + '<span class="tw-lvstat"></span><button type="button" class="tw-lvcover" title="Put canopies along every parking row found, staying inside the car park, then build">▦ Cover whole car park</button><button type="button" class="tw-lvdxf" title="Save the layout as an AutoCAD drawing (DXF): real coordinates (UTM), layers, bays, charging stalls, canopies, cable routes, dimensions, title block and charger schedule">AutoCAD plan · DXF</button>';
    A.dlg.querySelector('.tw-map-foot').before(tools);
    const drawBtn = tools.querySelector('.tw-lvdraw'); let drawing = false;
    const setDraw = on => { drawing = on; drawBtn.setAttribute('aria-pressed', on); const map = LVS && LVS.map; if (!map) return;
      map.getCanvasContainer().classList.toggle('is-lvdraw', on); on ? map.dragPan.disable() : map.dragPan.enable(); };
    drawBtn.addEventListener('click', () => setDraw(!drawing));

    // which bay is under a screen point, and which bays a screen box covers
    const bayAt = pt => { if (!LVS) return null; const map = LVS.map; let best = null, bd = 1e9;
      LVS.runs.forEach((r, ri) => r.bays.forEach((b, bi) => { const P = b.ring.slice(0, 4).map(q => map.project(q));
        let inside = false; for (let a = 0, z = 3; a < 4; z = a++) { if ((P[a].y > pt.y) !== (P[z].y > pt.y) && pt.x < (P[z].x - P[a].x) * (pt.y - P[a].y) / (P[z].y - P[a].y) + P[a].x) inside = !inside; }
        if (inside) { const c = map.project(b.c), d = Math.hypot(c.x - pt.x, c.y - pt.y); if (d < bd) { bd = d; best = { r, ri, b, bi }; } } })); return best; };
    const inBox = (a, z) => { const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x), y0 = Math.min(a.y, z.y), y1 = Math.max(a.y, z.y);
      return LVS.runs.flatMap(r => r.bays.filter(b => { const c = LVS.map.project(b.c); return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1; })); };
    let dragA = null, box = null;
    function hookMap(map) { if (map._lvHooked) return; map._lvHooked = true; const cc = map.getCanvasContainer();
      map.on('mousedown', e => { if (!drawing || !LVS || e.originalEvent.button !== 0) return; dragA = e.point;
        box = document.createElement('div'); box.className = 'lv-box'; cc.appendChild(box); });
      map.on('mousemove', e => { if (!dragA || !box) return; const z = e.point; Object.assign(box.style, { left: Math.min(dragA.x, z.x) + 'px', top: Math.min(dragA.y, z.y) + 'px', width: Math.abs(z.x - dragA.x) + 'px', height: Math.abs(z.y - dragA.y) + 'px' });
        const hit = new Set(inBox(dragA, z)); if (map.getSource('lv-h')) map.getSource('lv-h').setData(fc([...hit].map(b => b.ring), 'Polygon')); });
      map.on('mouseup', e => { if (!dragA) return; const a = dragA; dragA = null; if (box) { box.remove(); box = null; } if (map.getSource('lv-h')) map.getSource('lv-h').setData(fc([], 'Polygon'));
        const rm = e.originalEvent.shiftKey, k = kindNow();
        if (Math.hypot(e.point.x - a.x, e.point.y - a.y) < 4) { const h = bayAt(e.point); if (!h) return; h.b.ev = h.b.ev ? null : k; }
        else inBox(a, e.point).forEach(b => { b.ev = rm ? null : (b.ev || k); });
        LVS.edited = true; paint(); });
      // clicking a bay outside draw mode also toggles it (handy for one-off fixes)
      map.on('click', e => { if (drawing || !LVS || !e.originalEvent.altKey) return; const h = bayAt(e.point); if (h) { h.b.ev = h.b.ev ? null : kindNow(); LVS.edited = true; paint(); } });
      map.on('contextmenu', e => { if (!LVS) return; const h = bayAt(e.point); if (!h || !h.b.ev) { closeMenu(); return; } e.preventDefault(); openMenu(h, e.point); });
      map.on('movestart', closeMenu); }

    // ---- right-click menu ----
    let menu = null; const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
    const groupOf = h => { const bays = h.r.bays; let a = h.bi, z = h.bi; while (a > 0 && bays[a - 1].ev) a--; while (z < bays.length - 1 && bays[z + 1].ev) z++; return bays.slice(a, z + 1); };
    // the row across the nearest lane (or the next row) on a given side
    // the nearest row on one side that has bays facing the whole group (rows may be cut into pieces by trees or islands)
    const rowBeside = (r, side, grp) => { const vm = (r.v0 + r.v1) / 2, g0 = Math.min(...grp.map(b => b.u)), g1 = Math.max(...grp.map(b => b.u)); let best = null, bs = -1e9;
      LVS.runs.forEach(q => { if (q === r || q.comp !== r.comp) return; const d = ((q.v0 + q.v1) / 2 - vm) * side; if (d <= 0) return;
        const cover = grp.filter(b => q.bays.some(c => Math.abs(c.u - b.u) < LVS.bayPx * 0.6)).length, sc = cover * 1000 - d; if (cover && sc > bs) { bs = sc; best = q; } });
      return best && (best.v0 + best.v1) / 2 - vm ? best : null; };
    const copyTo = (grp, q, kind) => { let n = 0; grp.forEach(b => { let t = null, td = 1e9; q.bays.forEach(c => { const d = Math.abs(c.u - b.u); if (d < td) { td = d; t = c; } }); if (t && td < LVS.bayPx * 0.6) { t.ev = kind || b.ev; n++; } }); return n; };
    function openMenu(h, pt) { closeMenu(); const grp = groupOf(h), dc = grp.every(b => b.ev === 'dc'), map = LVS.map;
      menu = document.createElement('div'); menu.className = 'lv-menu'; menu.setAttribute('role', 'menu');
      const items = [['dup', `Duplicate row (${grp.length} stalls)`], ['mirror', 'Mirror across the lane'], ['swap', dc ? 'Swap to AC · Halo' : 'Swap to DC fast · Halo Ray'], ['grow', 'Add one stall'], ['shrink', 'Remove one stall'], ['del', 'Remove these stalls']];
      menu.innerHTML = `<p>${grp.length} ${dc ? 'DC' : 'AC'} stall${grp.length > 1 ? 's' : ''}</p>` + items.map(([k, t]) => `<button type="button" role="menuitem" data-k="${k}">${t}</button>`).join('');
      menu.style.left = Math.min(pt.x, map.getCanvas().clientWidth - 230) + 'px'; menu.style.top = Math.min(pt.y, map.getCanvas().clientHeight - 240) + 'px';
      map.getCanvasContainer().appendChild(menu);
      menu.addEventListener('mousedown', ev => ev.stopPropagation());
      menu.addEventListener('click', ev => { const k = ev.target.dataset && ev.target.dataset.k; if (!k) return; let msg = '';
        if (k === 'dup' || k === 'mirror') { const q1 = rowBeside(h.r, 1, grp), q2 = rowBeside(h.r, -1, grp), dist = q => q ? Math.abs((q.v0 + q.v1 - h.r.v0 - h.r.v1) / 2) : 1e9, q = dist(q1) <= dist(q2) ? q1 : q2; if (!q) msg = 'No other row beside this one.';
          else { const n = copyTo(grp, q); if (k === 'mirror') grp.forEach(b => { b.ev = null; }); const st = n === 1 ? 'stall' : 'stalls'; msg = n ? (k === 'dup' ? `Duplicated ${n} ${st} onto the facing row.` : `Mirrored ${n} ${st} across the lane.`) : 'That row has no bays opposite these.'; } }
        if (k === 'swap') grp.forEach(b => { b.ev = dc ? 'ac' : 'dc'; });
        if (k === 'grow') { const bays = h.r.bays, a = bays.indexOf(grp[0]), z = bays.indexOf(grp[grp.length - 1]); const nx = bays[z + 1] && !bays[z + 1].ev ? bays[z + 1] : bays[a - 1] && !bays[a - 1].ev ? bays[a - 1] : null; if (nx) nx.ev = grp[0].ev; else msg = 'The row is full here.'; }
        if (k === 'shrink') grp[grp.length - 1].ev = null;
        if (k === 'del') grp.forEach(b => { b.ev = null; });
        LVS.edited = true; paint(); closeMenu(); if (msg) setTimeout(() => hint(msg), 30); });
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); if (drawing) setDraw(false); } });

    // ---- cover the whole car park: a canopy row along every parking row found, never outside a row, never two canopies on top of each other ----
    let COVER = null; const cvBtn = tools.querySelector('.tw-lvcover');
    A.dlg.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tw-build') && !(COVER && COVER.starting)) COVER = null; }, true);
    cvBtn.addEventListener('click', () => { if (!LVS || !LVS.runs.length) return; const p = A.pin(); if (!p) return;
      COVER = { starting: true, runs: LVS.runs, mpp: LVS.mpp, on: true, lot: LVS.lot };
      quiet = true; $('.tw-spots').value = 4; quiet = false;
      if (p.rot === undefined) A.setPin(p.lat, p.lon, p.name || null, Object.assign({}, p, { rot: LVS.nearest.rot }));
      $('.tw-build').click(); COVER.starting = false; applyCover(); });
    // ---- the same cover, from the 3D site panel after Build: this car park, or every car park around the site ----
    { const rotL = A.bar.querySelector('.tw-rot').closest('label'), row = document.createElement('div'); row.className = 'tw-sb-row tw-coverbar';
      row.innerHTML = '<span>Cover</span><button type="button" data-c="one" title="Put canopies along every parking row of this car park, staying inside it">▦ Whole car park</button>'
        + '<button type="button" data-c="all" title="Read every car park around the site and put canopies along all their rows">▦ All car parks</button>';
      const st = document.createElement('style'); st.textContent = `.tw-coverbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tw-coverbar>span{min-width:38px}
.tw-coverbar button{appearance:none;border:0;border-radius:999px;background:linear-gradient(135deg,#3BA9E0,#8DC63F);color:#fff;font:700 12px var(--display,Helvetica);padding:7px 12px;cursor:pointer}
.tw-coverbar button:disabled{opacity:.5;cursor:default}`; document.head.appendChild(st);
      rotL.after(row);
      let busy = false; const btns = () => row.querySelectorAll('button');
      row.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b || busy) return; const p = A.pin(), map = A.map();
        if (!p || !map) { A.say('Pick a site on the map and build it first.'); return; }
        busy = true; btns().forEach(x => { x.disabled = true; }); const label = b.textContent;
        try {
          if (b.dataset.c === 'all') { b.textContent = 'Reading car parks…'; A.say('Reading every car park around the site. This takes about a minute…');
            map.jumpTo({ center: [p.lon, p.lat], zoom: Math.min(map.getZoom(), 16.3) < 15 ? 16.3 : Math.min(map.getZoom(), 16.3) }); await new Promise(r => setTimeout(r, 1500));
            await runAll(); }
          else if (!LVS || !LVS.runs.length || (LVS.lot && p.lot && LVS.lot.label !== p.lot.label)) { b.textContent = 'Reading the car park…'; A.say('Reading this car park from the satellite photo…');
            map.jumpTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 17) }); await new Promise(r => setTimeout(r, 800));
            await detect(map, [p.lon, p.lat], p); }
          if (!LVS || !LVS.runs.length) { A.say('No parking rows could be read here, so there is nothing to cover. Try Lane Vision on the map, or move the pin onto the car park.'); return; }
          b.textContent = 'Placing canopies…'; cvBtn.click();
        } catch (err) { A.say('The car park could not be read. Try again in a moment.'); }
        finally { busy = false; btns().forEach(x => { x.disabled = false; }); b.textContent = label; } }); }

    // three.js copies userData as JSON, which fails on the scene's links between parts; clone without it, then share it back
    function cloneUnit(src) { const keep = []; src.traverse(o => { keep.push(o.userData); o.userData = {}; });
      let c; try { c = src.clone(true); } finally { let i = 0; src.traverse(o => { o.userData = keep[i++]; }); }
      let j = 0; const srcs = []; src.traverse(o => srcs.push(o)); c.traverse(o => { o.userData = srcs[j++].userData; }); return c; }
    const pathOf = (root, o) => { const P = []; while (o && o !== root) { if (!o.parent) return null; P.unshift(o.parent.children.indexOf(o)); o = o.parent; } return o === root ? P : null; };   // null for a part outside the template unit
    const atPath = (root, P) => P.reduce((o, i) => o && o.children[i], root);
    function applyCover() { const P = S.product; if (!COVER || !COVER.on || !P || !P.children.length) return; const T = A.T;
      const tpl = P.children[0], key = (S.list && S.list[0]) || 'main';
      P.rotation.y = 0; P.position.set(0, 0, 0); tpl.rotation.set(0, 0, 0); tpl.position.set(0, 0, 0); P.updateMatrixWorld(true);
      const bx = A.boxOf(tpl), sz = bx.getSize(new T.Vector3()), bc = bx.getCenter(new T.Vector3()), W = sz.x, Dp = sz.z, gap = 0.6;
      const slotPaths = (S.carSlots || []).map(x => ({ p: pathOf(tpl, x.car), kind: x.kind })).filter(x => x.p);
      const perUnit = { main: 4, dc: 4, ac: 2, single: 1 }[key] || 4;   // bays one canopy serves, as the build counts them
      // where the canopies go: evenly along each row, centred on it
      // every candidate canopy is a rectangle in metres (geometry engine, local plane on WGS84 at the site), checked before it is built:
      // critical (removed): stands in a mapped building, on a road at its mapped width, on another canopy, or outside a mapped car park;
      // warning (kept): reaches into the driving lane, or stands closer than 1 m to a building; info: positions are read from imagery
      const G = window.TwinGeo, fr = G.frame(S.lon, S.lat), L = q => fr.toLocal(q[0], q[1]), ob = LVS && LVS.obst ? LVS.obst : { blds: [], roads: [] };
      const blds = ob.blds.map(r => r.map(L)), roads = ob.roads.map(r => ({ line: r.line.map(L), w: r.w, cls: r.cls })), lotRing = COVER.lot && COVER.lot.ring ? COVER.lot.ring.map(L) : null;
      const plan = [], issues = []; let skipped = 0, id = 0;
      COVER.runs.forEach((r, ri) => { const Lm = (r.u1 - r.u0) * COVER.mpp, n = Math.floor((Lm + gap) / (W + gap)), rowD = (r.v1 - r.v0) * COVER.mpp; if (n < 1) { skipped++; issues.push(G.issue(1, 'fit', [`row ${ri + 1}`], 'Row shorter than one canopy', `${Lm.toFixed(1)} m`, `${W.toFixed(1)} m`)); return; }
        const s0 = (Lm - (n * W + (n - 1) * gap)) / 2, th = T.MathUtils.degToRad(r.rot), vm = (r.v0 + r.v1) / 2;
        const e0 = L(r.toMap(r.u0, vm)), e1 = L(r.toMap(r.u1, vm)), thL = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]);
        for (let k = 0; k < n; k++) { const a = s0 + W / 2 + k * (W + gap), ll = r.toMap(r.u0 + a / COVER.mpp, vm), [x, z] = A.toXZ(ll[1], ll[0]), c = L(ll), name = `C${++id}`;
          const poly = G.rect(c, W, Dp, thL), bad = [];
          blds.forEach(b => { if (G.polysIntersect(poly, b)) bad.push(G.issue(4, 'building', [name, 'building'], 'Stands in a mapped building', '0 m', '> 0 m')); });
          if (!bad.length) roads.forEach(rd => { const d = G.distPolyLine(poly, rd.line); if (d < rd.w / 2) bad.push(G.issue(4, 'road', [name, `${rd.cls} road`], 'On a road (centre line plus half its mapped width)', `${d.toFixed(1)} m from centre`, `≥ ${(rd.w / 2).toFixed(1)} m`)); });
          if (!bad.length) plan.forEach(q => { const o = G.satOverlap(poly, q.poly); if (o > 0.05) bad.push(G.issue(4, 'clash', [name, q.name], 'Overlaps another canopy', `${o.toFixed(2)} m`, '0 m')); });
          if (!bad.length && lotRing && !G.contains(lotRing, poly)) bad.push(G.issue(4, 'boundary', [name, 'car park'], 'Outside the mapped car park boundary', 'crosses edge', 'inside'));
          if (bad.length) { skipped++; issues.push(bad[0]); continue; }
          if (Dp - rowD > 1) issues.push(G.issue(2, 'aisle', [name], 'Canopy reaches into the driving lane', `${(Dp - rowD).toFixed(1)} m`, 'check clear height and turning'));
          const dB = blds.length ? Math.min(...blds.map(b => G.distPolyPoly(poly, b))) : Infinity; if (dB < 1) issues.push(G.issue(2, 'clearance', [name, 'building'], 'Close to a building', `${dB.toFixed(2)} m`, '≥ 1.0 m'));
          plan.push({ x, z, th, name, poly, c, thL }); } });
      issues.push(G.issue(1, 'source', ['all'], 'Positions read from satellite imagery, not surveyed', 'imagery', 'site survey before construction'));
      COVER.issues = issues;
      // at most 150 canopies in 3D (more slows the view): the ones nearest the pin first, and the check says how many more would fit
      const cap = 150, fitAll = plan.length; if (plan.length > cap) { plan.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)); plan.length = cap;
        issues.push(G.issue(1, 'limit', ['all'], `Showing the ${cap} canopies nearest the pin; ${fitAll - cap} more pass the checks and would fit`, `${fitAll} fit`, `${cap} shown`)); }
      // build the units
      const tplCopy = tpl; P.clear(); const slots = [];
      plan.forEach(R => { const c = cloneUnit(tplCopy); c.rotation.set(0, R.th, 0);
        const ox = bc.x * Math.cos(R.th) + bc.z * Math.sin(R.th), oz = -bc.x * Math.sin(R.th) + bc.z * Math.cos(R.th); c.position.set(R.x - ox, 0, R.z - oz);
        R.ox = bc.x; R.oz = bc.z; R.obj = c; P.add(c); slotPaths.forEach(sp => { const car = atPath(c, sp.p); if (car) slots.push({ car, kind: sp.kind }); }); });
      P.userData.cover = true; S.carSlots = slots; S.list = plan.map(() => key); S.spots = plan.length * perUnit;
      COVER.plan = plan; COVER.rot0 = S.rot; COVER.W = W; COVER.Dp = Dp; COVER.frame = fr; report(issues, plan.length);
      // buildings: only those a canopy actually stands in are hidden
      unhide(plan);
      // title card and camera
      const li = document.querySelectorAll('#tw-stats li b'); if (li.length >= 3) { const unit = (li[1].textContent.split('× ')[1] || 'canopy').split(' +')[0];
        li[0].textContent = String(S.spots); li[1].textContent = `${plan.length} × ${unit}`; li[2].textContent = `${(S.spots * 45).toLocaleString('en-US')} kWh`; }
      if (COVER.quiet) { A.draw(); return; }   // re-laid after an option change: keep the camera where the viewer has it
      const all = A.boxOf(P), c0 = all.getCenter(new T.Vector3()), s3 = all.getSize(new T.Vector3()), rr = Math.max(s3.x, s3.z) * 0.5 + 10;
      A.controls.dispatchEvent({ type: 'start' }); A.controls.target.copy(c0); A.camera.position.copy(c0).add(new T.Vector3(0.6, 0.75, 0.9).normalize().multiplyScalar(rr * 2.1)); A.controls.update(); A.draw();
      const msg = `Whole car park covered: ${plan.length} canopies over ${S.spots} bays along ${COVER.runs.length} rows, all inside the parking rows.${skipped ? ` ${skipped} spot${skipped > 1 ? 's were' : ' was'} left out where a row is shorter than a canopy or two canopies would touch.` : ''} Turn rotates each canopy in place.`;
      [300, 9000].forEach(t => setTimeout(() => { if (COVER && COVER.on && S.on) A.say(msg); }, t));
    }
    // every canopy option (half depth, halo roof, floor plate, cover, colours, accessories) rebuilds the site's canopy from scratch, which
    // dropped the covered layout and left a single canopy; whenever a new canopy is put on the site while the car park is covered,
    // the cover is laid again from it, so the options apply to every canopy in the car park
    { let cur = S.product; Object.defineProperty(S, 'product', { configurable: true, enumerable: true, get: () => cur,
        set: v => { cur = v; if (!(COVER && COVER.on && COVER.plan) || COVER.starting || !v || (v.userData && v.userData.cover)) return;
          clearTimeout(COVER.t); COVER.t = setTimeout(() => { if (S.product !== v || !COVER || !COVER.on || !S.on) return; COVER.quiet = true;
            try { applyCover(); } finally { COVER.quiet = false; } }, 0); } }); }
    function unhide(plan) { const boxes = plan.map(R => A.boxOf(R.obj).expandByScalar(1)); boxes.forEach(b => { b.min.y = -10; b.max.y = 200; });
      (S.blds || []).forEach(m => { m.visible = !boxes.some(b => m.userData.box && m.userData.box.intersectsBox(b)); }); }
    // validation report on the 3D stage: counts by severity, then the issues, most severe first
    function report(issues, built) { let el = A.stage.querySelector('.tw-val'); if (!el) { el = document.createElement('aside'); el.className = 'tw-val'; el.setAttribute('aria-live', 'polite'); A.stage.appendChild(el); }
      const G = window.TwinGeo, n = [0, 0, 0, 0, 0]; issues.forEach(x => n[x.sev]++); const crit = issues.filter(x => x.sev === 4).length;
      const rows = issues.slice().sort((a, b) => b.sev - a.sev).slice(0, 9).map(x => `<li class="s${x.sev}"><b>${x.level}</b> ${x.objects.join(' · ')}: ${x.reason} <span>${x.measured}${x.required ? ` (needs ${x.required})` : ''}</span></li>`).join('');
      el.innerHTML = `<header><strong>Engineering check</strong><button type="button" aria-label="Close">×</button></header><p>${built} canopies pass: inside the rows, clear of mapped buildings and roads, no clashes.${crit ? ` ${crit} removed as critical.` : ''}</p>`
        + `<div class="tw-val-n">${[4, 3, 2, 1].map(k => `<span class="s${k}">${n[k]} ${G.SEV[k]}</span>`).join('')}</div><ul>${rows}</ul>`;
      el.hidden = false; el.querySelector('button').onclick = () => { el.hidden = true; }; }
    // Turn: each canopy turns about its own centre, the layout stays on the rows
    A.bar.querySelector('.tw-rot').addEventListener('input', () => { if (!COVER || !COVER.on || !COVER.plan || !S.product || !S.product.userData.cover) return; const P = S.product, d = A.T.MathUtils.degToRad(S.rot - COVER.rot0);
      P.rotation.y = 0; COVER.plan.forEach(R => placeUnit(R, d)); unhide(COVER.plan); if (PICK.sel) PICK.box.update(); A.draw(); });
    // one canopy placed at the layout's turn d plus its own extra turn (R.dth), turning about its own centre
    function placeUnit(R, d) { const th = R.th + d + (R.dth || 0), ox = R.ox * Math.cos(th) + R.oz * Math.sin(th), oz = -R.ox * Math.sin(th) + R.oz * Math.cos(th); R.obj.rotation.y = th; R.obj.position.set(R.x - ox, 0, R.z - oz); }
    const layoutTurn = () => A.T.MathUtils.degToRad(S.rot - (COVER.rot0 || 0));
    // ---- pick one canopy of a covered car park and turn it on its own: click it in 3D, then use the small panel ----
    const PICK = { sel: null, box: null, panel: null };
    { const cv = A.renderer.domElement; let down = null;
      const st = document.createElement('style'); st.textContent = `.tw-pick{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);z-index:30;background:rgba(18,20,24,.94);color:#fff;border-radius:14px;padding:10px 12px;
font:500 12px var(--display,Helvetica);display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 8px 30px rgba(0,0,0,.35);max-width:min(560px,92vw)}
.tw-pick b{font-weight:700;margin-right:2px}.tw-pick button{appearance:none;border:0;border-radius:8px;background:rgba(255,255,255,.12);color:#fff;font:600 12px var(--display,Helvetica);padding:6px 9px;cursor:pointer}
.tw-pick button:hover{background:rgba(255,255,255,.22)}.tw-pick button.del{background:rgba(255,80,80,.22)}.tw-pick input{width:120px}.tw-pick output{min-width:34px;text-align:right}
.tw-pick .warn{flex-basis:100%;color:#ffcf66;font-size:11px}.tw-pick .ok{flex-basis:100%;color:#9fd98a;font-size:11px}`; document.head.appendChild(st);
      const clear = () => { if (PICK.box) { A.scene.remove(PICK.box); PICK.box = null; } if (PICK.panel) { PICK.panel.remove(); PICK.panel = null; } PICK.sel = null; A.draw(); };
      // does the turned canopy now overlap a neighbour? the same rectangle test as the engineering check
      const clashes = R => { const G = window.TwinGeo; if (!G || !R.c || !COVER.W) return []; const d = layoutTurn(), poly = G.rect(R.c, COVER.W, COVER.Dp, R.thL + d + (R.dth || 0));
        return COVER.plan.filter(Q => Q !== R && Q.c && Math.hypot(Q.c[0] - R.c[0], Q.c[1] - R.c[1]) < COVER.W + COVER.Dp).filter(Q => G.satOverlap(poly, G.rect(Q.c, COVER.W, COVER.Dp, Q.thL + d + (Q.dth || 0))) > 0.05).map(Q => Q.name); };
      const refresh = () => { const R = PICK.sel; if (!R || !PICK.panel) return; const deg = Math.round((R.dth || 0) * 180 / Math.PI); PICK.panel.querySelector('input').value = deg; PICK.panel.querySelector('output').textContent = (deg > 0 ? '+' : '') + deg + '°';
        const c = clashes(R), m = PICK.panel.querySelector('.msg'); m.className = 'msg ' + (c.length ? 'warn' : 'ok'); m.textContent = c.length ? `Now overlaps ${c.join(', ')}. Turn it a little more, or remove one.` : 'Clear of its neighbours.'; };
      const turn = deg => { const R = PICK.sel; if (!R) return; R.dth = deg * Math.PI / 180; placeUnit(R, layoutTurn()); PICK.box.update(); unhide(COVER.plan); A.draw(); refresh(); };
      function select(R) { clear(); PICK.sel = R; PICK.box = new A.T.BoxHelper(R.obj, 0x3BA9E0); A.scene.add(PICK.box);
        const pn = PICK.panel = document.createElement('div'); pn.className = 'tw-pick';
        pn.innerHTML = `<b>${R.name}</b><span>Turn this canopy</span><button type="button" data-t="-15">↺ 15°</button><input type="range" min="-180" max="180" step="1" aria-label="Turn this canopy"><output></output>`
          + '<button type="button" data-t="15">↻ 15°</button><button type="button" data-t="90">90°</button><button type="button" data-t="0">Reset</button><button type="button" class="del">Remove</button><button type="button" data-x="1" aria-label="Close">✕</button><span class="msg ok"></span>';
        A.stage.appendChild(pn);
        pn.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
          if (b.dataset.x) return clear();
          if (b.classList.contains('del')) { const R2 = PICK.sel; R2.obj.parent.remove(R2.obj); COVER.plan.splice(COVER.plan.indexOf(R2), 1); S.list = COVER.plan.map(() => S.list[0]); A.say(`${R2.name} removed. ${COVER.plan.length} canopies left.`); clear(); return; }
          const t = +b.dataset.t, cur = Math.round((PICK.sel.dth || 0) * 180 / Math.PI); turn(t === 0 ? 0 : t === 90 ? ((cur + 90 + 180) % 360) - 180 : Math.max(-180, Math.min(180, cur + t))); });
        pn.querySelector('input').addEventListener('input', e => turn(+e.target.value));
        refresh(); A.draw(); A.say(`${R.name} selected. Turn it with the buttons or the slider; click another canopy to pick it, or empty ground to finish.`); }
      cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
      cv.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; down = null;
        if (!COVER || !COVER.plan || !S.product || !S.product.userData.cover || (S.cable && S.cable.picking)) { if (PICK.sel) clear(); return; }
        const r = cv.getBoundingClientRect(), ray = new A.T.Raycaster(); ray.setFromCamera(new A.T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), A.camera);
        const hit = ray.intersectObjects(COVER.plan.map(R => R.obj), true)[0];
        if (!hit) { if (PICK.sel) clear(); return; }
        let o = hit.object; const R = COVER.plan.find(Q => { let x = o; while (x) { if (x === Q.obj) return true; x = x.parent; } return false; }); if (R) select(R); });
      // a new layout clears the choice
      setInterval(() => { if (PICK.sel && (!COVER || !COVER.plan || !COVER.plan.includes(PICK.sel) || !S.on)) clear(); }, 700); }
    // other controls rebuild the canopies (another model, AC or DC): the cover is laid out again with the new unit
    setInterval(() => { if (COVER && COVER.on && S.on && S.product && !S.product.userData.cover && !COVER.starting) applyCover(); if (COVER && !S.on) { COVER = null; const v = A.stage.querySelector('.tw-val'); if (v) v.hidden = true; } }, 600);

    // ---- the drawing for AutoCAD: DXF (R12, metres, north up, origin at the middle of the stalls) ----
    tools.querySelector('.tw-lvdxf').addEventListener('click', () => { if (!LVS) return;
      if (S.cadExport) { S.cadExport({ LVS, COVER, ev: evBays() }); return; }   // the full AutoCAD drawing (twin-cad.js); the plain export below stays as a fallback
      const ev = evBays(), all = LVS.runs.flatMap(r => r.bays), ref = (ev.length ? ev : all).reduce((a, b, _, arr) => [a[0] + b.c[0] / arr.length, a[1] + b.c[1] / arr.length], [0, 0]);
      const G = window.TwinGeo, fr = G.frame(ref[0], ref[1]), X = q => fr.toLocal(q[0], q[1])[0].toFixed(3), Y = q => fr.toLocal(q[0], q[1])[1].toFixed(3);
      const meta = ['ChargePoint Digital Twin site plan', fr.crs, `Origin WGS84 ${ref[1].toFixed(7)}, ${ref[0].toFixed(7)}`, 'Units: metres. Source: Esri World Imagery (zoom 19) read by Lane Vision, OpenStreetMap for buildings and roads',
        'Accuracy: imagery-derived estimate, NOT a survey. Check every dimension on site before design or construction', `Exported ${new Date().toISOString()}`];
      const out = [...meta.flatMap(m => ['999', m]), '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '8'];
      [['BAYS', 7], ['EV_AC', 3], ['EV_DC', 5], ['ROWS', 8], ['LANES', 2], ['CANOPY', 4], ['NOTES', 1], ['CABLE', 30]].forEach(([n, c]) => out.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS'));
      out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
      const poly = (pts, layer, closed) => { out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'); pts.forEach(q => out.push('0', 'VERTEX', '8', layer, '10', X(q), '20', Y(q))); out.push('0', 'SEQEND', '8', layer); };
      const text = (q, s, layer, ht) => out.push('0', 'TEXT', '8', layer, '10', X(q), '20', Y(q), '40', String(ht), '1', s, '72', '1', '11', X(q), '21', Y(q));
      LVS.out.rows.forEach(r => poly(r.slice(0, 4), 'ROWS', true));
      all.forEach(b => poly(b.ring.slice(0, 4), b.ev === 'dc' ? 'EV_DC' : b.ev ? 'EV_AC' : 'BAYS', true));
      ev.forEach((b, i) => text(b.c, `${b.ev === 'dc' ? 'DC' : 'AC'}-${i + 1}`, b.ev === 'dc' ? 'EV_DC' : 'EV_AC', 0.5));
      LVS.out.aisles.forEach(l => poly(l, 'LANES', false));
      if (COVER && COVER.plan && COVER.frame) COVER.plan.forEach(c => { const g = c.poly.map(q => COVER.frame.toGeo(q[0], q[1])); poly(g, 'CANOPY', true); text(COVER.frame.toGeo(c.c[0], c.c[1]), c.name, 'CANOPY', 0.8); });
      text(ref, 'ORIGIN 0,0  imagery-derived, not surveyed', 'NOTES', 0.6);
      // cable routes from the 3D site (scene metres back to WGS84, then into this drawing's plane)
      if (S.cableDXF && S.on) { const g3 = (x, z) => [S.lon + x / A.mLon(S.lat), S.lat - z / A.M_LAT]; S.cableDXF().forEach(r => { poly(r.pts.map(q => g3(q[0], q[1])), 'CABLE', false); const e = r.pts[r.pts.length - 1]; text(g3(e[0], e[1] + 1.5), `${r.name} feeder`, 'CABLE', 0.5); }); }
      const p = A.pin();
      out.push('0', 'ENDSEC', '0', 'EOF');
      const note = `ChargePoint site plan. ${p && p.name ? p.name + '. ' : ''}${ev.length} charging stalls on ${all.length} bays. Origin ${ref[1].toFixed(6)}, ${ref[0].toFixed(6)}. Read from satellite imagery: survey before construction.`;
      const blob = new Blob([out.join('\r\n') + '\r\n'], { type: 'application/dxf' });
      const name = `chargepoint-${(S.slug || (x => 'site'))((p && p.name) || 'site')}-plan.dxf`;
      (S.saveFile ? S.saveFile(name, blob) : Promise.resolve()).then(() => hint('Site plan saved as DXF (opens in AutoCAD): bays, charging stalls, lanes, in metres. ' + note.split('. ').slice(-1)[0]));
    });
    btn.addEventListener('click', run);

    // ---- every build lines the canopies up with the parking, wherever the pin is ----
    // a pin with no direction (a plain click on the map) gets one before the build: first the parking rows in the
    // satellite photo around the pin, then the nearest mapped car park. The Turn slider stays free to adjust afterwards.
    async function rowAngleAt(lon, lat) {
      const mpp = 156543.034 * Math.cos(lat * Math.PI / 180) / 2 ** Z, R = 40 / mpp, [cx, cy] = toPx(lon, lat);
      const ph = await photo(cx - R, cy - R, cx + R, cy + R); if (!ph.ok) return null;
      const w = ph.c.width, h = ph.c.height, img = ph.g.getImageData(0, 0, w, h).data, ox = cx - ph.ox, oy = cy - ph.oy;
      const gray = new Float32Array(w * h); for (let i = 0; i < w * h; i++) gray[i] = img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11;
      const pts = []; for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) { if ((x - ox) ** 2 + (y - oy) ** 2 > R * R) continue; const i = y * w + x;
        const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1], gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
        pts.push(x, y, Math.min(255, Math.hypot(gx, gy))); }
      const bin = 0.5 / mpp, D = 2 * R + 4, score = a => { const ca = Math.cos(a), sa = Math.sin(a), nb = Math.ceil(2 * D / bin) + 2, S2 = new Float64Array(nb), N = new Float64Array(nb);
        for (let k = 0; k < pts.length; k += 3) { const v = -(pts[k] - ox) * sa + (pts[k + 1] - oy) * ca, b = Math.floor((v + D) / bin); S2[b] += pts[k + 2]; N[b]++; }
        const vals = []; for (let b = 0; b < nb; b++) if (N[b] > 4) vals.push(S2[b] / N[b]); if (vals.length < 20) return 0;
        const m = vals.reduce((x, y) => x + y, 0) / vals.length; return Math.sqrt(vals.reduce((x, y) => x + (y - m) ** 2, 0) / vals.length) / (m || 1); };
      let best = 0, bestA = 0; for (let d = 0; d < 180; d += 3) { const c = score(d * Math.PI / 180); if (c > best) { best = c; bestA = d; } }
      for (let d = bestA - 2; d <= bestA + 2; d++) { const c = score(d * Math.PI / 180); if (c > best) { best = c; bestA = d; } }
      return best >= 0.1 ? Math.round(((-bestA) % 180 + 180) % 180) : null;
    }
    const nearestLotRot = (lon, lat) => { const L = (A.PK && A.PK.list) || [], kx = 111320 * Math.cos(lat * Math.PI / 180); let r = null, bd = 90;
      L.forEach(l => { if (l.rot === undefined || l.lat === undefined) return; const d = Math.hypot((l.lon - lon) * kx, (l.lat - lat) * 110540); if (d < bd) { bd = d; r = l.rot; } }); return r; };
    let aligning = false;
    A.dlg.addEventListener('click', async e => { const b = e.target.closest && e.target.closest('.tw-build'); if (!b || aligning) return;
      const p = A.pin(); if (!p || p.rot !== undefined) return;
      e.stopImmediatePropagation(); e.preventDefault(); aligning = true; b.disabled = true; hint('Reading the parking direction around the pin…');
      let rot = null, from = 'the parking rows in the satellite photo'; try { rot = await rowAngleAt(p.lon, p.lat); } catch (x) {}
      if (rot === null) { rot = nearestLotRot(p.lon, p.lat); from = 'the nearest mapped car park'; }
      if (rot !== null) A.setPin(p.lat, p.lon, p.name || null, Object.assign({}, p, { rot }));
      b.disabled = false; aligning = true; b.click(); aligning = false;
      const msg = rot === null ? 'No parking rows found at the pin, so the canopies keep their last direction. Use Turn to line them up.' : `Canopies lined up with ${from} (${rot}°). Use Turn to fine-tune.`;
      [600, 9000].forEach(t => setTimeout(() => A.say && A.say(msg), t));
      if (0) setTimeout(() => A.say && A.say(rot === null ? 'No parking rows found at the pin, so the canopies keep their last direction. Use Turn to line them up.' : `Canopies lined up with ${from} (${rot}°). Use Turn to fine-tune.`), 400);
    }, true);
  }
})();
