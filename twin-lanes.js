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
      // a new reading starts clean: the last drawing, stalls and badges go
      LVS = null; badges.forEach(mk => mk.remove()); badges = []; tools.hidden = true; ['lv-r', 'lv-b', 'lv-e', 'lv-a', 'lv-h'].forEach(id => { const src = map.getSource(id); if (src) src.setData({ type: 'FeatureCollection', features: [] }); });
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
      // take buildings and every road that is not a parking aisle out (from the same free map tiles)
      const RW = { motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, minor: 8, busway: 7, service: 5.5 };
      const OBST = { blds: [], roads: [] };
      try { const raw = await A.probe(ctr, 17, m => ({ b: m.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }),
          r: m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }).filter(f => { const P = f.properties || {}; return RW[P.class] && P.service !== 'parking_aisle' && !(lot && P.class === 'service'); }) }));
        raw.b.forEach(f => { const g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).forEach(pl => OBST.blds.push(pl[0])); });
        raw.r.forEach(f => { const g = f.geometry; (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []).forEach(l => OBST.roads.push({ line: l, w: RW[f.properties.class], cls: f.properties.class })); });
        mg.fillStyle = mg.strokeStyle = '#000';
        raw.b.forEach(f => { const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; polys.forEach(pl => { mg.beginPath(); pl[0].forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }); });
        raw.r.forEach(f => { mg.lineWidth = RW[f.properties.class] / mpp; const g = f.geometry, ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; ls.forEach(l => { mg.beginPath(); l.forEach((q, i) => { const [x, y] = L(q); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke(); }); });
      } catch (e) {}
      const mask = mg.getImageData(0, 0, w, h).data, WH = w * h;
      // 1. colour model: asphalt and parked cars stay; grass and trees (green), sand and roof tiles (warm beige) and white roofs go.
      //    Judged over a 3 m window, so a single white or beige car is never taken out, only whole surfaces.
      //    The asphalt tint is learnt from this photo (median warmth and brightness inside the footprint), so warm UAE asphalt is not mistaken for sand.
      const smp = []; for (let i = 0; i < w * h; i += 7) if (mask[i * 4] > 128) smp.push([img[i * 4] - img[i * 4 + 2], img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]]);
      const med = k => { const v = smp.map(q => q[k]).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; }, warm0 = med(0), lum0 = med(1);
      const II = new Uint32Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) { let rs = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, r = img[i], g = img[i + 1], b = img[i + 2];
          const bad = (g > r + 8 && g > b + 2) || (r - b > warm0 + 22 && r + g + b > lum0 + 60) || Math.min(r, g, b) > 215 ? 1 : 0; rs += bad; II[(y + 1) * (w + 1) + x + 1] = II[y * (w + 1) + x + 1] + rs; } }
      const hw = Math.max(2, Math.round(1.5 / mpp)), badAt = (x, y) => { const x0 = Math.max(0, x - hw), x1 = Math.min(w, x + hw), y0 = Math.max(0, y - hw), y1 = Math.min(h, y + hw);
          return (II[y1 * (w + 1) + x1] - II[y0 * (w + 1) + x1] - II[y1 * (w + 1) + x0] + II[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
      // edge strength (Sobel) on brightness: parked cars and bay lines are busy, lanes are smooth asphalt
      const gray = new Float32Array(WH); for (let i = 0; i < WH; i++) gray[i] = img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11;
      const G = new Float32Array(WH), M = new Uint8Array(WH); let nM = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (mask[i * 4] < 128 || badAt(x, y) > 0.55) continue;
        const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
        const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
        G[i] = Math.min(255, Math.hypot(gx, gy)); M[i] = 1; nM++; }
      if (nM < 2000) { hint('Lane Vision found no open parking area here. Move the pin onto the car park and try again.'); return; }
      // 2. parking blocks: the paved area split into separate pieces (2 m cells, joined side to side), each read on its own,
      //    so two car parks at different angles each get their own direction
      const cs = Math.max(3, Math.round(2 / mpp)), gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), cellOn = new Uint8Array(gw * gh), lab = new Int32Array(gw * gh).fill(-1);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { let n = 0, t = 0; for (let y = gy * cs; y < Math.min(h, gy * cs + cs); y++) for (let x = gx * cs; x < Math.min(w, gx * cs + cs); x++) { t++; n += M[y * w + x]; } cellOn[gy * gw + gx] = n > t * 0.5 ? 1 : 0; }
      const comps = []; for (let s = 0; s < gw * gh; s++) { if (!cellOn[s] || lab[s] >= 0) continue; const k = comps.length, q = [s]; lab[s] = k; let n = 0, bx0 = 1e9, by0 = 1e9, bx1 = 0, by1 = 0;
        while (q.length) { const c = q.pop(), cx2 = c % gw, cy2 = (c / gw) | 0; n++; bx0 = Math.min(bx0, cx2); bx1 = Math.max(bx1, cx2); by0 = Math.min(by0, cy2); by1 = Math.max(by1, cy2);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = cx2 + dx, ny = cy2 + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return; const o = ny * gw + nx; if (cellOn[o] && lab[o] < 0) { lab[o] = k; q.push(o); } }); }
        comps.push({ k, n, box: [bx0 * cs, by0 * cs, Math.min(w, (bx1 + 1) * cs), Math.min(h, (by1 + 1) * cs)] }); }
      const inC = (k, x, y) => M[y * w + x] && lab[((y / cs) | 0) * gw + ((x / cs) | 0)] === k;
      const bin = 0.5 / mpp, out = { rows: [], bays: [], aisles: [] }, runs = []; let spaces = 0, kept = 0; const dbg = window._lvDbg = { nM, warm0, lum0, comps: comps.length, blocks: [] };
      comps.filter(c => c.n * (cs * mpp) ** 2 >= 220).sort((p, q) => q.n - p.n).slice(0, 12).forEach(cp => {
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
        const db = { n: cp.n, best: +best.toFixed(3), ang: bestA, rows: 0, segs: 0, pk: [] }; dbg.blocks.push(db); if (best < 0.12) return;
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
            const ok = []; for (let j = 0; j < n; j++) { const a0 = uStart + j * bp, a1 = a0 + bp; let t = 0, gd = 0;
              for (let su = 0.15; su < 1; su += 0.23) for (let sv = 0.12; sv < 1; sv += 0.19) { t++; if (inside(a0 + su * (a1 - a0), v0 + sv * (v1 - v0))) gd++; } ok.push(gd / t >= 0.55); }
            let j = 0; while (j < n) { if (!ok[j]) { j++; continue; } let e = j; while (e + 1 < n && ok[e + 1]) e++; const cnt = e - j + 1;
              if (cnt >= 3) { const u0 = uStart + j * bp, u1 = uStart + (e + 1) * bp, bays = [];
                for (let t = j; t <= e; t++) { const a0 = uStart + t * bp, a1 = a0 + bp, bb = { ring: [toMap(a0, v0), toMap(a1, v0), toMap(a1, v1), toMap(a0, v1), toMap(a0, v0)], c: toMap((a0 + a1) / 2, (v0 + v1) / 2), u: (a0 + a1) / 2, v: (v0 + v1) / 2 }; bays.push(bb); out.bays.push(bb); }
                const ring = [toMap(u0, v0), toMap(u1, v0), toMap(u1, v1), toMap(u0, v1), toMap(u0, v0)]; out.rows.push(ring); spaces += cnt;
                const run = { v0, v1, u0, u1, ring, bays, comp: cp.k, rot: Math.round(((-bestA) % 180 + 180) % 180), bayM, toMap }; runs.push(run); cRuns.push(run); }
              j = e + 1; } }); });
        // driving lanes: the smooth gap between two neighbouring rows of this block
        cRuns.sort((p, q2) => p.v0 - q2.v0);
        for (let k = 0; k < cRuns.length - 1; k++) { const A1 = cRuns[k], B1 = cRuns[k + 1], gapM = (B1.v0 - A1.v1) * mpp;
          if (gapM >= 3.5 && gapM <= 10) { const u0 = Math.max(A1.u0, B1.u0), u1 = Math.min(A1.u1, B1.u1), v = (A1.v1 + B1.v0) / 2; if ((u1 - u0) * mpp > 6) out.aisles.push([toMap(u0, v), toMap(u1, v)]); } }
        if (cRuns.length) kept++; });
      if (!out.rows.length) { hint('Lane Vision found no rows with the regular rhythm of parking bays here (the photo may show an empty, covered or unmarked area). You can still drop the pin and build.'); return; }
      // pin on the row closest to the pin, canopies along that row
      const kx = 111320 * Math.cos(ctr[1] * Math.PI / 180), dist = (q2) => Math.hypot((q2[0] - ctr[0]) * kx, (q2[1] - ctr[1]) * 110540);
      let nearest = runs[0], nb2 = null, nd = 1e9; runs.forEach(r => r.bays.forEach(b => { const d = dist(b.c); if (d < nd) { nd = d; nearest = r; nb2 = b; } }));
      const [plon, plat] = nb2.c, rot = nearest.rot, name = (p && p.lot && p.lot.label) || (p && p.name) || 'Car park';
      A.setPin(plat, plon, (p && p.name) || null, { rot, lot: { label: name, kind: 'Surface', rows: out.rows, ring: null, lines: null, rot,
        capText: `about ${spaces.toLocaleString('en-US')} spaces in ${out.rows.length} rows, read from the satellite photo` } });
      LVS = { map, out, runs, nearest, pu: nb2.u, edited: false, bayPx: BAY / mpp, mpp, obst: OBST, lot: lot || null }; hookMap(map); tools.hidden = false; draw(map, out);
      const bw = nearest.bayM.toFixed(2);
      hint(`Lane Vision: ${out.rows.length} parking rows in ${kept} block${kept > 1 ? 's' : ''}, ${out.aisles.length} driving lanes, about ${spaces.toLocaleString('en-US')} spaces (bays measured ${bw} m wide). Rows were kept only where the photo shows the regular rhythm of parking bays.`);
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
      + '<span class="tw-lvstat"></span><button type="button" class="tw-lvcover" title="Put canopies along every parking row found, staying inside the car park, then build">▦ Cover whole car park</button><button type="button" class="tw-lvdxf" title="Download the layout as an AutoCAD drawing (DXF): bays, charging stalls, lanes, in metres">Site plan · DXF</button>';
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
    // three.js copies userData as JSON, which fails on the scene's links between parts; clone without it, then share it back
    function cloneUnit(src) { const keep = []; src.traverse(o => { keep.push(o.userData); o.userData = {}; });
      let c; try { c = src.clone(true); } finally { let i = 0; src.traverse(o => { o.userData = keep[i++]; }); }
      let j = 0; const srcs = []; src.traverse(o => srcs.push(o)); c.traverse(o => { o.userData = srcs[j++].userData; }); return c; }
    const pathOf = (root, o) => { const P = []; while (o && o !== root) { P.unshift(o.parent.children.indexOf(o)); o = o.parent; } return o === root ? P : null; };
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
      const cap = 80; if (plan.length > cap) plan.length = cap;
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
      const all = A.boxOf(P), c0 = all.getCenter(new T.Vector3()), s3 = all.getSize(new T.Vector3()), rr = Math.max(s3.x, s3.z) * 0.5 + 10;
      A.controls.dispatchEvent({ type: 'start' }); A.controls.target.copy(c0); A.camera.position.copy(c0).add(new T.Vector3(0.6, 0.75, 0.9).normalize().multiplyScalar(rr * 2.1)); A.controls.update(); A.draw();
      const msg = `Whole car park covered: ${plan.length} canopies over ${S.spots} bays along ${COVER.runs.length} rows, all inside the parking rows.${skipped ? ` ${skipped} spot${skipped > 1 ? 's were' : ' was'} left out where a row is shorter than a canopy or two canopies would touch.` : ''} Turn rotates each canopy in place.`;
      [300, 9000].forEach(t => setTimeout(() => { if (COVER && COVER.on && S.on) A.say(msg); }, t));
    }
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
      P.rotation.y = 0; COVER.plan.forEach(R => { const th = R.th + d, ox = R.ox * Math.cos(th) + R.oz * Math.sin(th), oz = -R.ox * Math.sin(th) + R.oz * Math.cos(th); R.obj.rotation.y = th; R.obj.position.set(R.x - ox, 0, R.z - oz); }); unhide(COVER.plan); A.draw(); });
    // other controls rebuild the canopies (another model, AC or DC): the cover is laid out again with the new unit
    setInterval(() => { if (COVER && COVER.on && S.on && S.product && !S.product.userData.cover && !COVER.starting) applyCover(); if (COVER && !S.on) { COVER = null; const v = A.stage.querySelector('.tw-val'); if (v) v.hidden = true; } }, 600);

    // ---- the drawing for AutoCAD: DXF (R12, metres, north up, origin at the middle of the stalls) ----
    tools.querySelector('.tw-lvdxf').addEventListener('click', () => { if (!LVS) return;
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
