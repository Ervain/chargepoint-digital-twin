/* ChargePoint Digital Twin · Streets and landmarks for the built site
   1. Streets: every mapped road within 900 m (OpenMapTiles), drawn as crisp asphalt over the satellite ground, rounded at the joins,
      with white edge lines and a dashed centre line on the larger roads. The satellite photo stays underneath for the verges.
   2. Street names: painted along the road, Apple Maps style, from the map's English name; repeated about every 170 m, never crowded.
   3. Capital Gate (ADNEC's leaning tower, 160 m, 35 floors, 18° lean to the west): a proper model when the site is within 2.5 km, with
      its diagrid glass skin, floor lines and the "splash" canopy at its foot, in place of the plain mapped block. The view reaches 3 km
      while a site is open so the tower stays in sight. */
(() => {
  const start = () => { const S = window.__twin; if (S && S.api && S.api.toXZ) init(S); };
  if (window.__twin && window.__twin.api) start(); else document.addEventListener('twin-ready', start, { once: true });

  function init(S) {
    const A = S.api, T = A.T, G = new T.Group(); G.name = 'twin-streets';
    const CG = { lat: 24.41871, lon: 54.43468, h: 160, floors: 35 };
    const RW = { motorway: 13, trunk: 12, primary: 11, secondary: 9, tertiary: 7.5, minor: 6.5 };
    const asphalt = new T.MeshStandardMaterial({ color: 0x34383d, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: T.DoubleSide });
    const paint = new T.MeshBasicMaterial({ color: 0xf3f3f1, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false, side: T.DoubleSide });
    let done = null, busy = false, seenToken = null, seenAt = 0, far0 = null;

    // ---------- geometry helpers (scene x = east, z = south, metres from the pin) ----------
    const quad = (pos, a, b, w, y) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) return; const nx = -dz / L * w / 2, nz = dx / L * w / 2;
      pos.push(a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] + nx, y, b[1] + nz, b[0] + nx, y, b[1] + nz, a[0] - nx, y, a[1] - nz, b[0] - nx, y, b[1] - nz); };
    const disc = (pos, c, r, y) => { const n = 14; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      pos.push(c[0], y, c[1], c[0] + Math.cos(a1) * r, y, c[1] + Math.sin(a1) * r, c[0] + Math.cos(a0) * r, y, c[1] + Math.sin(a0) * r); } };
    const shift = (p, q, d) => { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1; return [-dz / L * d, dx / L * d]; };
    const mesh = (pos, m) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const o = new T.Mesh(g, m); o.receiveShadow = true; o.raycast = () => {}; return o; };
    const lines = geom => (geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : []);
    const XZ = ([lo, la]) => A.toXZ(la, lo);

    // ---------- street name label: white Helvetica on a soft dark halo, lying on the road ----------
    function label(text, h) {
      const fs = 72, c = document.createElement('canvas'), g = c.getContext('2d'); g.font = `600 ${fs}px "Helvetica Neue", Helvetica, Arial`;
      const tw = Math.ceil(g.measureText(text).width); c.width = tw + 48; c.height = fs + 36;
      g.font = `600 ${fs}px "Helvetica Neue", Helvetica, Arial`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.lineJoin = 'round';
      g.lineWidth = 14; g.strokeStyle = 'rgba(20,22,26,0.75)'; g.strokeText(text, c.width / 2, c.height / 2); g.fillStyle = '#ffffff'; g.fillText(text, c.width / 2, c.height / 2);
      const tex = new T.CanvasTexture(c); tex.anisotropy = 8; if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; else tex.encoding = T.sRGBEncoding;
      const m = new T.Mesh(new T.PlaneGeometry(h * c.width / c.height, h), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.raycast = () => {}; return m; }

    // ---------- Capital Gate ----------
    function capitalGate(ring) {
      const grp = new T.Group(); grp.name = 'Capital Gate';
      let pts = ring ? ring.map(XZ) : null;
      if (pts && pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      const [cx, cz] = A.toXZ(CG.lat, CG.lon);
      if (!pts || pts.length < 5) { pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([cx + Math.cos(a) * 26, cz + Math.sin(a) * 17]); } }
      const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
      // resample the footprint to 32 evenly spaced points round the outline, so the skin and the diagrid are regular
      const per = []; let tot = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); per.push(L); tot += L; }
      const N = 32, R = []; for (let k = 0; k < N; k++) { let d = k / N * tot, i = 0; while (d > per[i]) { d -= per[i]; i++; } const a = pts[i], b = pts[(i + 1) % pts.length], t = per[i] ? d / per[i] : 0;
        R.push([a[0] + (b[0] - a[0]) * t - c[0], a[1] + (b[1] - a[1]) * t - c[1]]); }
      // the lean: straight for the first floors, then a growing overhang to the west (−x), about 24 m at the top (18° at the upper floors)
      const F = CG.floors, H = CG.h, fh = H / F, off = y => (y < 40 ? 0 : -24 * Math.pow((y - 40) / (H - 40), 1.35));
      const ringAt = k => { const y = k * fh, o = off(y), sw = 1 + 0.06 * Math.sin(Math.PI * k / F); return R.map(([x, z]) => [x * sw + o, y, z * sw]); };
      const rings = []; for (let k = 0; k <= F; k++) rings.push(ringAt(k));
      // glass skin
      const pos = []; for (let k = 0; k < F; k++) for (let i = 0; i < N; i++) { const a = rings[k][i], b = rings[k][(i + 1) % N], c2 = rings[k + 1][(i + 1) % N], d = rings[k + 1][i];
        pos.push(...a, ...b, ...c2, ...a, ...c2, ...d); }
      const top = rings[F], tc = top.reduce((s, p) => [s[0] + p[0] / N, s[1], s[2] + p[2] / N], [0, top[0][1], 0]);
      for (let i = 0; i < N; i++) pos.push(...tc, ...top[(i + 1) % N], ...top[i]);
      const glass = new T.MeshPhysicalMaterial({ color: 0x9cb9cc, metalness: 0.45, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3, side: T.DoubleSide });
      const skin = mesh(pos, glass); skin.castShadow = true; grp.add(skin);
      // diagrid (white steel diamonds every two floors) and the floor lines
      const dl = [], fl = [];
      for (let k = 0; k + 2 <= F; k += 2) for (let i = 0; i < N; i += 2) { const a = rings[k][i]; dl.push(...a, ...rings[k + 2][(i + 2) % N], ...a, ...rings[k + 2][(i - 2 + N) % N]); }
      for (let k = 1; k < F; k++) for (let i = 0; i < N; i++) fl.push(...rings[k][i], ...rings[k][(i + 1) % N]);
      const seg = (arr, col, op) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); const l = new T.LineSegments(g, new T.LineBasicMaterial({ color: col, transparent: true, opacity: op })); l.raycast = () => {}; return l; };
      grp.add(seg(dl, 0xf4f6f7, 0.95), seg(fl, 0xdfe7ec, 0.35));
      // crown: a slim white ring round the roof
      const crown = []; for (let i = 0; i < N; i++) quad(crown, [top[i][0], top[i][2]], [top[(i + 1) % N][0], top[(i + 1) % N][2]], 0.9, 0); const cr = mesh(crown.map((v, j) => (j % 3 === 1 ? H + 0.05 : v)), new T.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5 })); grp.add(cr);
      // the "splash": a white steel-and-glass shell that sweeps from the tower's east side down to the ground
      { const L = 70, Wd = 44, nu = 36, nv = 12, sp = [], s0 = Math.max(...R.map(p => p[0]));
        const P = (u, v) => { const x = s0 + u * L, z = (v - 0.5) * Wd * (1 - 0.35 * u), y = 22 * Math.pow(1 - u, 1.7) + 2.2 * Math.sin(Math.PI * v) * (1 - u); return [x, y, z]; };
        for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) { const p1 = P(a / nu, b / nv), p2 = P((a + 1) / nu, b / nv), p3 = P((a + 1) / nu, (b + 1) / nv), p4 = P(a / nu, (b + 1) / nv); sp.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4); }
        const sh = mesh(sp, new T.MeshStandardMaterial({ color: 0xeef1f2, roughness: 0.35, metalness: 0.2, side: T.DoubleSide })); sh.castShadow = true; grp.add(sh);
        const gl = []; for (let a = 0; a <= nu; a += 3) for (let b = 0; b < nv; b++) gl.push(...P(a / nu, b / nv), ...P(a / nu, (b + 1) / nv)); grp.add(seg(gl, 0x8a949c, 0.5)); }
      // name, floating above the crown
      const nm = label('Capital Gate · ADNEC', 9); nm.rotation.set(0, 0, 0); nm.material.depthTest = false; nm.renderOrder = 10;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: nm.material.map, depthTest: false, transparent: true, toneMapped: false })); const ar = nm.geometry.parameters.width / nm.geometry.parameters.height;
      sprite.scale.set(9 * ar, 9, 1); sprite.position.set(off(H), H + 14, 0); sprite.renderOrder = 10; grp.add(sprite);
      grp.position.set(c[0], 0, c[1]); return grp; }

    // ---------- build for the current site ----------
    async function build(token) {
      busy = true;
      try {
        const data = await A.probe([S.lon, S.lat], 15, m => ({
          r: m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }).map(f => ({ g: f.geometry, c: (f.properties || {}).class, b: (f.properties || {}).brunnel })),
          n: m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation_name' }).map(f => { const p = f.properties || {}; return { g: f.geometry, c: p.class, name: p['name:en'] || p.name_en || p['name:latin'] || p.name }; }),
          b: m.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }).filter(f => +(f.properties || {}).render_height >= 120).map(f => f.geometry) }));
        if (token !== S.token || !S.on) return;
        G.clear(); const LIM = 900, ap = [], pl = [], seen = new Set();
        for (const r of data.r) { const w = RW[r.c]; if (!w || r.b === 'tunnel') continue;
          for (const l of lines(r.g)) { const key = l.length + ':' + l[0].join(',') + ':' + l[l.length - 1].join(','); if (seen.has(key)) continue; seen.add(key);   // the tiles repeat lines across their edges
            const p = l.map(XZ); if (!p.some(q => Math.hypot(q[0], q[1]) < LIM)) continue;
            for (let i = 0; i < p.length - 1; i++) { quad(ap, p[i], p[i + 1], w, 0.03); }
            p.forEach(q => disc(ap, q, w / 2, 0.03));
            // edge lines 30 cm inside each side; a dashed centre line (3 m dash, 6 m gap) on primary roads and up
            for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], [ox, oz] = shift(a, b, w / 2 - 0.35);
              quad(pl, [a[0] + ox, a[1] + oz], [b[0] + ox, b[1] + oz], 0.15, 0.06); quad(pl, [a[0] - ox, a[1] - oz], [b[0] - ox, b[1] - oz], 0.15, 0.06);
              if (w >= 11) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d + 3 <= L; d += 9) { const t0 = d / L, t1 = (d + 3) / L;
                quad(pl, [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], 0.15, 0.06); } } } } }
        if (ap.length) G.add(mesh(ap, asphalt)); if (pl.length) G.add(mesh(pl, paint));
        // names: along each named road, every ~170 m, on a straight stretch long enough for the text
        const placed = [];
        for (const n of data.n) { if (!n.name || !RW[n.c]) continue; const h = Math.max(2.6, Math.min(4.6, RW[n.c] * 0.38));
          for (const l of lines(n.g)) { const p = l.map(XZ); let acc = 60;
            for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
              if (acc >= 170 && L > h * n.name.length * 0.55) { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
                if (Math.hypot(mx, mz) < LIM && !placed.some(q => Math.hypot(q[0] - mx, q[1] - mz) < (q[2] === n.name ? 150 : 35))) {
                  const lb = label(n.name, h); let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;   // never upside down
                  lb.rotation.set(-Math.PI / 2, 0, -ang); lb.position.set(mx, 0.08, mz); G.add(lb); placed.push([mx, mz, n.name]); acc = 0; } }
              acc += L; } } }
        // Capital Gate, when the site is within 2.5 km
        const [gx, gz] = A.toXZ(CG.lat, CG.lon);
        if (Math.hypot(gx, gz) < 2500) { let ring = null, bd = 120;
          for (const g of data.b) for (const pl2 of (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [])) { const r = pl2[0], cc = r.reduce((s, q) => [s[0] + q[0] / r.length, s[1] + q[1] / r.length], [0, 0]), [x, z] = XZ(cc);
            const d = Math.hypot(x - gx, z - gz); if (d < bd) { bd = d; ring = r; } }
          G.add(capitalGate(ring));
          (S.blds || []).forEach(m => { const b = m.userData && m.userData.box; if (b && b.max.y > 120 && gx > b.min.x - 5 && gx < b.max.x + 5 && gz > b.min.z - 5 && gz < b.max.z + 5) m.visible = false; }); }
        if (G.parent !== S.root) S.root.add(G); done = token; A.draw && A.draw();
      } catch (e) { console.warn('twin-streets', e); }
      finally { busy = false; } }

    // ---------- follow the site: build once the site's own buildings are in, hide when the site is left ----------
    setInterval(() => {
      const cam = A.camera; if (!cam) return;
      if (!S.on) { G.visible = false; if (far0 !== null) { cam.far = far0; cam.updateProjectionMatrix(); far0 = null; } return; }
      if (far0 === null) { far0 = cam.far; cam.far = Math.max(cam.far, 3200); cam.updateProjectionMatrix(); }
      G.visible = true;
      if (S.token !== seenToken) { seenToken = S.token; seenAt = Date.now(); }
      if (done !== S.token && !busy && ((S.blds && S.blds.length) || Date.now() - seenAt > 12000)) build(S.token);
    }, 700);
  }
})();
