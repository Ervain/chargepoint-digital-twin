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

    async function photo(x0, y0, x1, y1) {   // stitched zoom-19 tiles covering a global-pixel box
      const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256), tx1 = Math.floor(x1 / 256), ty1 = Math.floor(y1 / 256);
      const c = document.createElement('canvas'); c.width = (tx1 - tx0 + 1) * 256; c.height = (ty1 - ty0 + 1) * 256; const g = c.getContext('2d', { willReadFrequently: true });
      const jobs = []; for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => { g.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256); res(1); }; im.onerror = () => res(0); im.src = `${A.ESRI}${Z}/${ty}/${tx}`; }));
      const ok = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
      return { c, g, ox: tx0 * 256, oy: ty0 * 256, ok };
    }

    async function run() {
      const map = A.map(); if (!map) return;
      if (map.getZoom() < 15) { hint('Zoom in to the car park first, then press Lane Vision.'); return; }
      const p = A.pin(), ctr = p ? [p.lon, p.lat] : [map.getCenter().lng, map.getCenter().lat];
      btn.disabled = true; hint('Lane Vision is reading the satellite photo…');
      const sw = A.dlg.querySelector('.tw-sweep'); if (sw) { sw.hidden = false; sw.classList.add('is-scan'); }
      try { await detect(map, ctr, p); } catch (e) { hint('Lane Vision could not read the photo here. Try again, or move the pin onto the car park.'); }
      if (sw) { sw.classList.remove('is-scan'); sw.hidden = true; } btn.disabled = false;
    }

    async function detect(map, ctr, p) {
      const mpp = 156543.034 * Math.cos(ctr[1] * Math.PI / 180) / 2 ** Z;            // metres per pixel
      // footprint: a picked car park's outline or lanes, else 75 m around the pin
      const lot = p && p.lot ? p.lot : null, R = 75 / mpp;
      let pts = lot && lot.ring ? lot.ring : lot && lot.lines ? lot.lines.flat() : null;
      const [cx, cy] = toPx(ctr[0], ctr[1]);
      let x0, y0, x1, y1;
      if (pts) { const P = pts.map(([lo, la]) => toPx(lo, la)); x0 = Math.min(...P.map(q => q[0])) - 12 / mpp; x1 = Math.max(...P.map(q => q[0])) + 12 / mpp; y0 = Math.min(...P.map(q => q[1])) - 12 / mpp; y1 = Math.max(...P.map(q => q[1])) + 12 / mpp;
        const lim = 160 / mpp; x0 = Math.max(x0, cx - lim); x1 = Math.min(x1, cx + lim); y0 = Math.max(y0, cy - lim); y1 = Math.min(y1, cy + lim); }
      else { x0 = cx - R; x1 = cx + R; y0 = cy - R; y1 = cy + R; }
      const ph = await photo(x0, y0, x1, y1); if (!ph.ok) throw new Error('no imagery');
      const w = ph.c.width, h = ph.c.height, img = ph.g.getImageData(0, 0, w, h).data;
      // mask of where parking can be
      const mc = document.createElement('canvas'); mc.width = w; mc.height = h; const mg = mc.getContext('2d');
      const L = ([lo, la]) => { const [x, y] = toPx(lo, la); return [x - ph.ox, y - ph.oy]; };
      mg.fillStyle = mg.strokeStyle = '#fff'; mg.lineCap = mg.lineJoin = 'round';
      if (lot && lot.ring) { mg.beginPath(); lot.ring.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }
      else if (lot && lot.lines) { mg.lineWidth = 19 / mpp; lot.lines.forEach(l => { mg.beginPath(); l.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke(); }); }
      else { mg.beginPath(); mg.arc(cx - ph.ox, cy - ph.oy, R, 0, 7); mg.fill(); }
      // take buildings and main roads out (from the same free map tiles)
      try { const raw = await A.probe(ctr, 17, m => ({ b: m.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }),
          r: m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }).filter(f => /motorway|trunk|primary|secondary|tertiary|minor/.test(f.properties.class) && f.properties.class !== 'service') }));
        mg.fillStyle = mg.strokeStyle = '#000';
        raw.b.forEach(f => { const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; polys.forEach(pl => { mg.beginPath(); pl[0].forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }); });
        mg.lineWidth = 9 / mpp; raw.r.forEach(f => { const g = f.geometry, ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; ls.forEach(l => { mg.beginPath(); l.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke(); }); });
      } catch (e) {}
      const mask = mg.getImageData(0, 0, w, h).data;
      // edge strength (Sobel) on brightness: parked cars are busy, lanes are smooth asphalt
      const gray = new Float32Array(w * h); for (let i = 0; i < w * h; i++) gray[i] = img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11;
      const G = new Float32Array(w * h), M = new Uint8Array(w * h); let nM = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (mask[i * 4] < 128) continue;
        const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
        const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
        G[i] = Math.min(255, Math.hypot(gx, gy)); M[i] = 1; nM++; }
      if (nM < 2000) { hint('Lane Vision found no open parking area here. Move the pin onto the car park and try again.'); return; }
      // the row direction: the angle whose cross-profile shows the strongest banding
      const bin = 0.5 / mpp, profileAt = (a, step) => { const ca = Math.cos(a), sa = Math.sin(a), D = Math.hypot(w, h), nb = Math.ceil(2 * D / bin) + 2, S2 = new Float64Array(nb), N = new Float64Array(nb);
          for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) { const i = y * w + x; if (!M[i]) continue; const v = -x * sa + y * ca, b = Math.floor((v + D) / bin); S2[b] += G[i]; N[b]++; }
          return { S2, N, nb, D }; };
      const contrast = pr => { const vals = []; for (let b = 0; b < pr.nb; b++) if (pr.N[b] > 6) vals.push(pr.S2[b] / pr.N[b]); if (vals.length < 20) return 0;
          const sm = vals.map((v, i) => (vals[i - 2] ?? v) * 0.1 + (vals[i - 1] ?? v) * 0.2 + v * 0.4 + (vals[i + 1] ?? v) * 0.2 + (vals[i + 2] ?? v) * 0.1);
          const m = sm.reduce((a, b) => a + b, 0) / sm.length; return Math.sqrt(sm.reduce((a, b) => a + (b - m) ** 2, 0) / sm.length) / (m || 1); };
      let best = 0, bestA = 0; for (let d = 0; d < 180; d += 3) { const c = contrast(profileAt(d * Math.PI / 180, 3)); if (c > best) { best = c; bestA = d; } }
      for (let d = bestA - 3; d <= bestA + 3; d++) { const c = contrast(profileAt(d * Math.PI / 180, 2)); if (c > best) { best = c; bestA = d; } }
      if (best < 0.12) { hint('Lane Vision could not find clear rows of cars here (the photo may show an empty or covered car park). You can still drop the pin and build.'); return; }
      const a = bestA * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), pr = profileAt(a, 1), nb = pr.nb, D = pr.D;
      const val = new Float64Array(nb); for (let b = 0; b < nb; b++) val[b] = pr.N[b] > 6 ? pr.S2[b] / pr.N[b] : NaN;
      const sm = Array.from(val, (v, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = val[i + k]; if (q === q && q !== undefined) { s += q; n++; } } return n ? s / n : NaN; });
      const good = sm.filter(v => v === v).sort((p, q) => p - q), T = (good[Math.floor(good.length * 0.3)] + good[Math.floor(good.length * 0.85)]) / 2;
      // bands above the threshold are parking rows; very wide bands are two rows nose to nose
      const rows = []; let s0 = -1;
      for (let b = 0; b <= nb; b++) { const on = b < nb && sm[b] === sm[b] && sm[b] > T; if (on && s0 < 0) s0 = b; if (!on && s0 >= 0) { const wM = (b - s0) * bin * mpp;
          if (wM >= 3.5 && wM <= 8.5) rows.push([s0, b]); else if (wM > 8.5 && wM <= 14) { const m = Math.round((s0 + b) / 2); rows.push([s0, m], [m, b]); } s0 = -1; } }
      if (!rows.length) { hint('Lane Vision could not separate the rows here clearly. You can still drop the pin and build.'); return; }
      // each row measured along its length (where its detail continues), then turned into map shapes
      const ub = 1 / mpp, out = { rows: [], bays: [], aisles: [] }; let spaces = 0;
      const toMap = (u, v) => { const x = u * ca - v * sa + ph.ox, y = u * sa + v * ca + ph.oy; return toLL(x, y); };
      const runs = [];
      rows.forEach(([b0, b1]) => { const v0 = b0 * bin - D, v1 = b1 * bin - D, nu = Math.ceil(2 * D / ub) + 2, Su = new Float64Array(nu), Nu = new Float64Array(nu);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!M[i]) continue; const v = -x * sa + y * ca; if (v < v0 || v > v1) continue; const u = x * ca + y * sa, k = Math.floor((u + D) / ub); Su[k] += G[i]; Nu[k]++; }
        let r0 = -1, gap = 0; const segs = [];
        for (let k = 0; k <= nu; k++) { const on = k < nu && Nu[k] > 4 && Su[k] / Nu[k] > T * 0.85;
          if (on) { if (r0 < 0) r0 = k; gap = 0; } else if (r0 >= 0) { gap++; if (gap * ub * mpp > 5 || k === nu) { const e = k - gap + 1; if ((e - r0) * ub * mpp >= 7.5) segs.push([r0 * ub - D, e * ub - D]); r0 = -1; gap = 0; } } }
        segs.forEach(([u0, u1]) => { const len = (u1 - u0) * mpp, n = Math.floor(len / BAY); if (n < 2) return; spaces += n;
          const ring = [toMap(u0, v0), toMap(u1, v0), toMap(u1, v1), toMap(u0, v1), toMap(u0, v0)], bays = [];
          for (let k = 0; k < n; k++) { const a0 = u0 + k * BAY / mpp, a1 = a0 + BAY / mpp, bb = { ring: [toMap(a0, v0), toMap(a1, v0), toMap(a1, v1), toMap(a0, v1), toMap(a0, v0)], c: toMap((a0 + a1) / 2, (v0 + v1) / 2), u: (a0 + a1) / 2, v: (v0 + v1) / 2 }; bays.push(bb); out.bays.push(bb); }
          out.rows.push(ring); runs.push({ v0, v1, u0, u1, ring, bays }); }); });
      // driving lanes: the smooth gap between two neighbouring rows
      runs.sort((p, q) => p.v0 - q.v0);
      for (let k = 0; k < runs.length - 1; k++) { const A1 = runs[k], B1 = runs[k + 1], gapM = (B1.v0 - A1.v1) * mpp;
        if (gapM >= 3.5 && gapM <= 10) { const u0 = Math.max(A1.u0, B1.u0), u1 = Math.min(A1.u1, B1.u1), v = (A1.v1 + B1.v0) / 2; if ((u1 - u0) * mpp > 6) out.aisles.push([toMap(u0, v), toMap(u1, v)]); } }
      if (!out.rows.length) { hint('Lane Vision could not measure clear rows here. You can still drop the pin and build.'); return; }
      // pin on the row closest to the pin, canopies along the rows
      const [pcx, pcy] = [cx - ph.ox, cy - ph.oy], pv = -pcx * sa + pcy * ca, pu = pcx * ca + pcy * sa;
      let nearest = runs[0], nd = 1e9; runs.forEach(r => { const vm = (r.v0 + r.v1) / 2, um = Math.max(r.u0, Math.min(r.u1, pu)), d = Math.hypot(vm - pv, um - pu); if (d < nd) { nd = d; nearest = r; } });
      const um = Math.max(nearest.u0, Math.min(nearest.u1, pu)), [plon, plat] = toMap(um, (nearest.v0 + nearest.v1) / 2);
      const rot = Math.round(((-bestA) % 180 + 180) % 180), name = (p && p.lot && p.lot.label) || (p && p.name) || 'Car park';
      A.setPin(plat, plon, (p && p.name) || null, { rot, lot: { label: name, kind: 'Surface', rows: out.rows, ring: null, lines: null, rot,
        capText: `about ${spaces.toLocaleString('en-US')} spaces in ${out.rows.length} rows, read from the satellite photo` } });
      LVS = { map, out, runs, nearest, pu: um, edited: false, bayPx: BAY / mpp }; hookMap(map); tools.hidden = false; draw(map, out);
      hint(`Lane Vision: ${out.rows.length} parking rows, ${out.aisles.length} driving lanes, about ${spaces.toLocaleString('en-US')} spaces, read from the satellite photo. Check it against the photo, then build.`);
    }

    // ---- drawing, in the style of a site design: every bay a white rectangle, the charging bays green with a badge, lanes dashed ----
    let LVS = null, badges = [];
    const fc = (arr, type) => ({ type: 'FeatureCollection', features: arr.map((c, i) => ({ type: 'Feature', properties: { i }, geometry: { type, coordinates: type === 'Polygon' ? [c] : c } })) });
    function draw(map, out) {
      const ids = ['lv-row', 'lv-bay', 'lv-ev', 'lv-evl', 'lv-aisle', 'lv-hov'];
      const add = () => { ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); }); ['lv-r', 'lv-b', 'lv-e', 'lv-a', 'lv-h'].forEach(id => { if (map.getSource(id)) map.removeSource(id); });
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
      const near = LVS.nearest, order = LVS.runs.slice().sort((p, q) => Math.abs((p.v0 + p.v1) / 2 - (near.v0 + near.v1) / 2) - Math.abs((q.v0 + q.v1) / 2 - (near.v0 + near.v1) / 2));
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
      + '<span class="tw-lvstat"></span><button type="button" class="tw-lvdxf" title="Download the layout as an AutoCAD drawing (DXF): bays, charging stalls, lanes, in metres">Site plan · DXF</button>';
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
      LVS.runs.forEach(q => { if (q === r) return; const d = ((q.v0 + q.v1) / 2 - vm) * side; if (d <= 0) return;
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

    // ---- the drawing for AutoCAD: DXF (R12, metres, north up, origin at the middle of the stalls) ----
    tools.querySelector('.tw-lvdxf').addEventListener('click', () => { if (!LVS) return;
      const ev = evBays(), all = LVS.runs.flatMap(r => r.bays), ref = (ev.length ? ev : all).reduce((a, b, _, arr) => [a[0] + b.c[0] / arr.length, a[1] + b.c[1] / arr.length], [0, 0]);
      const kx = 111320 * Math.cos(ref[1] * Math.PI / 180), ky = 110540, X = q => ((q[0] - ref[0]) * kx).toFixed(3), Y = q => ((q[1] - ref[1]) * ky).toFixed(3);
      const out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '5'];
      [['BAYS', 7], ['EV_AC', 3], ['EV_DC', 5], ['ROWS', 8], ['LANES', 2]].forEach(([n, c]) => out.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS'));
      out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
      const poly = (pts, layer, closed) => { out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'); pts.forEach(q => out.push('0', 'VERTEX', '8', layer, '10', X(q), '20', Y(q))); out.push('0', 'SEQEND', '8', layer); };
      const text = (q, s, layer, ht) => out.push('0', 'TEXT', '8', layer, '10', X(q), '20', Y(q), '40', String(ht), '1', s, '72', '1', '11', X(q), '21', Y(q));
      LVS.out.rows.forEach(r => poly(r.slice(0, 4), 'ROWS', true));
      all.forEach(b => poly(b.ring.slice(0, 4), b.ev === 'dc' ? 'EV_DC' : b.ev ? 'EV_AC' : 'BAYS', true));
      ev.forEach((b, i) => text(b.c, `${b.ev === 'dc' ? 'DC' : 'AC'}-${i + 1}`, b.ev === 'dc' ? 'EV_DC' : 'EV_AC', 0.5));
      LVS.out.aisles.forEach(l => poly(l, 'LANES', false));
      const p = A.pin(); text([ref[0], ref[1] + 0], '', 'ROWS', 0.1);
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
