/* ChargePoint Digital Twin · Cable routing (preliminary)
   1. Power source: one click on the ground in the 3D site sets the main board or transformer position.
   2. Site graph: a 1 m grid over the site (metres, same frame as the 3D scene). Mapped buildings are blocked; road surfaces
      cost more (crossing needs permits and traffic management); trench already dug costs less, so cables share it.
      Edge cost w(e) = length × (1 + road + shared-trench terms), 8 neighbours.
   3. Routes: A* shortest path from the source to each canopy feeder point, nearest canopy first, so later cables follow
      the trench already laid (an approximation of the minimum trench network, a Steiner tree).
   4. Quantities: trench length (shared), cable length per feeder, procurement length L(1 + α) + terminations.
   5. Electrical: feeder current I = P / (√3 · V · cos φ). Cable size, voltage drop, protection and approvals are for the
      electrical engineer under the authority's rules (DEWA, ADDC or others): map geometry cannot decide them.
   All inputs marked as assumptions are editable and are printed with the results. */
(() => {
  const start = () => { const S = window.__twin; if (S && S.api && S.api.bar) init(S); };
  if (window.__twin) start(); else document.addEventListener('twin-ready', start, { once: true });

  function init(S) {
    const A = S.api, T = A.T, row = A.bar.querySelector('.tw-sb-main');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tw-cablebtn'; b.textContent = '⚡ Cable routing';
    b.title = 'Click the ground to set the power source; cables are routed to every canopy around buildings, sharing trenches'; row.appendChild(b);
    const SOCK = { main: 4, dc: 4, ac: 2, single: 1 };
    const C = S.cable = { src: null, picking: false, group: null, res: null,
      opt: { alpha: 10, term: 2, volt: 400, pf: 0.95, kwAC: 22, kwDC: '' } };   // planning assumptions, editable in the panel

    // ---- 1. power source by a click on the ground (a click, not a drag) ----
    const cv = A.renderer.domElement; let down = null;
    cv.addEventListener('pointerdown', e => { down = C.picking ? [e.clientX, e.clientY] : null; });
    cv.addEventListener('pointerup', e => { if (!C.picking || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = cv.getBoundingClientRect(), ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), A.camera);
      const p = new T.Vector3(); if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p)) return;
      C.src = [p.x, p.z]; C.picking = false; cv.style.cursor = ''; route(); });
    // pressing the button routes at once: from the point you set, or else from an assumed source on the nearest mapped road edge
    // (where a supply usually arrives). A click on the ground then moves the source and re-routes.
    function defaultSrc() { const tg = targets(); if (!tg.length) return null; const cx = tg.reduce((a, t) => a + t.x, 0) / tg.length, cz = tg.reduce((a, t) => a + t.z, 0) / tg.length;
      const far = (x, z) => tg.every(t => Math.hypot(x - t.x, z - t.z) > 9); let best = null, bd = 1e9;
      (S.roads || []).forEach(m => { const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) { const x = a[i], z = a[i + 2], d = Math.hypot(x - cx, z - cz); if (d < bd && d < 150 && far(x, z)) { bd = d; best = [x, z]; } } });
      if (best) return { p: best, how: 'the nearest mapped road edge' };
      const xs = tg.map(t => t.x), zs = tg.map(t => t.z); return { p: [Math.min(...xs) - 12, Math.min(...zs) - 12], how: 'a corner 12 m from the canopies' }; }
    b.addEventListener('click', () => { if (!S.on || !S.product) { A.say('Build the site first, then press Cable routing.'); return; }
      C.picking = true; cv.style.cursor = 'crosshair';
      if (!C.src) { const d = defaultSrc(); if (d) { C.src = d.p; route(); setTimeout(() => A.say(`Cables routed from an assumed source at ${d.how} (the orange box). Click the ground to put it on the real main board, substation or transformer.`), 1200); return; } }
      else route();
      A.say('Click the ground to move the power source (main board or transformer).'); });
    C.route = () => { if (C.src && C.res) route(); };

    // ---- the canopies to feed: centre of each unit in the 3D scene ----
    function targets() { const P = S.product; if (!P) return []; P.updateMatrixWorld(true);
      return P.children.map((u, i) => { const c = A.boxOf(u).getCenter(new T.Vector3()), key = (S.list && S.list[i]) || 'main'; return { x: c.x, z: c.z, key, name: `C${i + 1}`, sockets: SOCK[key] || 4, dc: key === 'dc' }; }); }

    // ---- 2. the site grid: buildings blocked, roads costly ----
    function grid(pts) { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), M = 30;
      let x0 = Math.floor(Math.min(...xs) - M), x1 = Math.ceil(Math.max(...xs) + M), z0 = Math.floor(Math.min(...zs) - M), z1 = Math.ceil(Math.max(...zs) + M);
      const cell = Math.max(1, Math.ceil(Math.max(x1 - x0, z1 - z0) / 420)), w = Math.ceil((x1 - x0) / cell), h = Math.ceil((z1 - z0) / cell);
      const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h; const g = cvs.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const X = x => (x - x0) / cell, Z = z => (z - z0) / cell;
      g.fillStyle = 'rgb(0,255,0)'; (S.roads || []).forEach(m => { const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 9) { g.beginPath(); g.moveTo(X(a[i]), Z(a[i + 2])); g.lineTo(X(a[i + 3]), Z(a[i + 5])); g.lineTo(X(a[i + 6]), Z(a[i + 8])); g.closePath(); g.fill(); } });
      g.fillStyle = 'rgb(255,0,0)'; (S.blds || []).forEach(m => { if (!m.visible) return; const sh = m.geometry.parameters && m.geometry.parameters.shapes; if (!sh) return;
        (Array.isArray(sh) ? sh : [sh]).forEach(s => { const P = s.getPoints(); g.beginPath(); P.forEach((v, k) => { const x = X(v.x), z = Z(-v.y); k ? g.lineTo(x, z) : g.moveTo(x, z); }); g.closePath(); g.fill(); }); });
      const d = g.getImageData(0, 0, w, h).data, cost = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) cost[i] = d[i * 4] > 127 ? Infinity : d[i * 4 + 1] > 127 ? 6 : 1;   // building blocked · road 6× · open ground 1×
      return { x0, z0, cell, w, h, cost, toCell: (x, z) => [Math.max(0, Math.min(w - 1, Math.floor(X(x)))), Math.max(0, Math.min(h - 1, Math.floor(Z(z))))], toXZ: (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell] }; }

    // ---- 3. A* on the grid (binary heap), shared trench cheaper ----
    function astar(Gd, s, t, trench) { const { w, h, cost } = Gd, N = w * h, gS = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const si = s[1] * w + s[0], ti = t[1] * w + t[0], H = i => Math.hypot(i % w - t[0], ((i / w) | 0) - t[1]) * 0.3;
      const heap = [], push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      const cst = i => cost[i] === Infinity ? Infinity : trench[i] ? 0.3 : cost[i];
      gS[si] = 0; push(H(si), si); const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
      while (heap.length) { const [, i] = pop(); if (closed[i]) continue; closed[i] = 1; if (i === ti) break; const x = i % w, y = (i / w) | 0;
        for (const [dx, dy, l] of D8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (closed[j]) continue;
          const c = (cst(i) + cst(j)) / 2; if (c === Infinity) continue; const ng = gS[i] + l * c; if (ng < gS[j]) { gS[j] = ng; from[j] = i; push(ng + H(j), j); } } }
      if (from[ti] < 0 && ti !== si) return null; const path = []; for (let k = ti; k >= 0; k = k === si ? -1 : from[k]) path.push(k); return path.reverse(); }
    // keep only the corners of a path
    const simplify = P => P.filter((p, i) => i === 0 || i === P.length - 1 || Math.abs((p[0] - P[i - 1][0]) * (P[i + 1][1] - p[1]) - (p[1] - P[i - 1][1]) * (P[i + 1][0] - p[0])) > 1e-6);
    // a canopy's own footprint is never "building": start and end cells are always open
    function route() { const tg = targets(); if (!C.src || !tg.length) return; A.say('Routing cables around the buildings…');
      const Gd = grid([C.src, ...tg.map(t => [t.x, t.z])]), trench = new Uint8Array(Gd.w * Gd.h), s = Gd.toCell(C.src[0], C.src[1]);
      Gd.cost[s[1] * Gd.w + s[0]] = 1; tg.forEach(t => { const c = Gd.toCell(t.x, t.z); Gd.cost[c[1] * Gd.w + c[0]] = 1; });
      const order = tg.slice().sort((a, b) => Math.hypot(a.x - C.src[0], a.z - C.src[1]) - Math.hypot(b.x - C.src[0], b.z - C.src[1]));
      const runs = []; let fail = 0;
      order.forEach(t => { const p = astar(Gd, s, Gd.toCell(t.x, t.z), trench); if (!p) { fail++; return; } p.forEach(i => { trench[i] = 1; });
        const pts = simplify(p.map(i => Gd.toXZ(i % Gd.w, (i / Gd.w) | 0))); pts[0] = C.src.slice(); pts[pts.length - 1] = [t.x, t.z];
        let L = 0, road = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        p.forEach(i => { if (Gd.cost[i] === 6) road += Gd.cell; }); runs.push({ t, pts, L, road }); });
      let trenchLen = 0; for (let i = 0; i < trench.length; i++) if (trench[i]) trenchLen += Gd.cell; trenchLen = Math.max(0, trenchLen - Gd.cell);
      C.res = { runs, trenchLen, fail, cell: Gd.cell }; drawRoutes(); panel(); }

    // ---- drawing: glowing orange trench lines on the ground, the source as a cabinet ----
    function drawRoutes() { if (C.group) { A.scene.remove(C.group); C.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } const g = C.group = new T.Group();
      const mat = new T.MeshBasicMaterial({ color: 0xff8a00, transparent: true, opacity: 0.95, depthWrite: false }), seen = new Set();
      C.res.runs.forEach(r => { for (let k = 1; k < r.pts.length; k++) { const a = r.pts[k - 1], c = r.pts[k], key = [a, c].map(q => q.map(v => v.toFixed(1)).join(',')).sort().join('|'); if (seen.has(key)) continue; seen.add(key);
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.01) continue; const m = new T.Mesh(new T.PlaneGeometry(L, 0.45), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(c[1] - a[1], c[0] - a[0]);
        m.position.set((a[0] + c[0]) / 2, 0.06, (a[1] + c[1]) / 2); m.renderOrder = 2; g.add(m); } });
      const cab = new T.Mesh(new T.BoxGeometry(2.4, 2.1, 1.2), new T.MeshStandardMaterial({ color: 0x5b6570, roughness: 0.6, metalness: 0.3 })); cab.position.set(C.src[0], 1.05, C.src[1]); cab.castShadow = true; g.add(cab);
      const ring = new T.Mesh(new T.RingGeometry(1.8, 2.3, 48), new T.MeshBasicMaterial({ color: 0xff8a00, transparent: true, opacity: 0.8, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(C.src[0], 0.07, C.src[1]); g.add(ring);
      A.scene.add(g); A.draw(); }

    // ---- 4 and 5. quantities and feeder currents ----
    function panel() { let el = A.stage.querySelector('.tw-cable'); if (!el) { el = document.createElement('aside'); el.className = 'tw-val tw-cable'; A.stage.appendChild(el); }
      const o = C.opt, R = C.res, f = (v, d = 1) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
      const cable = R.runs.reduce((s, r) => s + r.L, 0), proc = R.runs.reduce((s, r) => s + r.L * (1 + o.alpha / 100) + 2 * o.term, 0), road = R.runs.reduce((s, r) => s + r.road, 0);
      const amps = r => { const kw = r.t.dc ? parseFloat(o.kwDC) : o.kwAC; if (!(kw > 0)) return null; const P = kw * 1000 * r.t.sockets; return P / (Math.sqrt(3) * o.volt * o.pf); };
      const rows = R.runs.slice().sort((a, b) => a.t.name.localeCompare(b.t.name, 'en', { numeric: true })).map(r => { const I = amps(r); return `<tr><td>${r.t.name}</td><td>${r.t.sockets} ${r.t.dc ? 'DC' : 'AC'}</td><td>${f(r.L)}</td><td>${f(r.L * (1 + o.alpha / 100) + 2 * o.term)}</td><td>${I === null ? 'enter kW' : f(I, 0) + ' A'}</td></tr>`; }).join('');
      el.innerHTML = `<header><strong>Cable routing · preliminary</strong><button type="button" aria-label="Close">×</button></header>`
        + `<p>${R.runs.length} feeders routed around mapped buildings${R.fail ? `, <b class="s4">${R.fail} could not be reached</b>` : ''}. Shared trench <b>${f(R.trenchLen, 0)} m</b> (${f(road, 0)} m under mapped roads and aisles). Cable route total <b>${f(cable, 0)} m</b>, to order about <b>${f(proc, 0)} m</b>.</p>`
        + `<table><thead><tr><th>Feeder</th><th>Sockets</th><th>Route m</th><th>Order m</th><th>Current</th></tr></thead><tbody>${rows}</tbody></table>`
        + `<details><summary>Planning assumptions (edit)</summary><div class="tw-cab-in">`
        + [['alpha', 'Installation allowance α (%)'], ['term', 'Termination length per end (m)'], ['volt', 'Line voltage V (3-phase)'], ['pf', 'Power factor cos φ'], ['kwAC', 'AC kW per socket'], ['kwDC', 'DC kW per socket']]
          .map(([k, t]) => `<label>${t}<input data-k="${k}" type="number" step="any" value="${o[k]}"></label>`).join('') + `</div></details>`
        + `<p class="tw-cab-note">Order m = route × (1 + α) + 2 terminations. Current I = P / (√3 · V · cos φ), P = sockets × kW. Cable size, voltage drop, protection and approvals are for the electrical engineer under the authority's rules. Grid ${R.cell} m, buildings from OpenStreetMap: not a survey.</p>`
        + `<div class="tw-cab-act"><button type="button" class="tw-cab-move">Move source</button><button type="button" class="tw-cab-off">Hide cables</button></div>`;
      A.stage.querySelectorAll('.tw-val:not(.tw-cable)').forEach(v => { v.hidden = true; });   // one panel at a time on the right
      el.hidden = false; el.querySelector('header button').onclick = () => { el.hidden = true; };
      el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('change', () => { const v = inp.value; C.opt[inp.dataset.k] = inp.dataset.k === 'kwDC' ? v : (parseFloat(v) || 0); panel(); el.querySelector('details').open = true; }));
      el.querySelector('.tw-cab-move').onclick = () => b.click();
      el.querySelector('.tw-cab-off').onclick = () => { if (C.group) C.group.visible = !C.group.visible; el.querySelector('.tw-cab-off').textContent = C.group && C.group.visible ? 'Hide cables' : 'Show cables'; A.draw(); };
      A.say(`Cables routed: ${f(R.trenchLen, 0)} m of shared trench to ${R.runs.length} canopies. Details in the panel.`); }

    // leaving the site or rebuilding clears the routes (they belong to one layout)
    setInterval(() => { if (C.group && (!S.on || (C.prod && C.prod !== S.product))) { A.scene.remove(C.group); C.group = null; C.res = null; C.src = S.on ? C.src : null; const el = A.stage.querySelector('.tw-cable'); if (el) el.hidden = true; } C.prod = S.product; }, 700);
    S.cableDXF = () => C.res ? C.res.runs.map(r => ({ name: r.t.name, pts: r.pts })) : [];
  }
})();
// the ruler lives in its own file next to this one
(() => { const me = document.currentScript; ['twin-measure', 'twin-move', 'twin-awm'].forEach(n => { if (document.querySelector(`script[src*="${n}"]`)) return; const s = document.createElement('script');
  s.src = (me && me.src ? me.src : 'twin-cable.js').replace(/twin-cable\.js(\?.*)?$/, n + '.js'); document.head.appendChild(s); }); })();
