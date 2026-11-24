/* ChargePoint Digital Twin · Geometry engine (window.TwinGeo)
   One place for all site maths, in metres. Every drawing, check and export on the planner goes through it.
   1. Coordinates: WGS84 (lon, lat) to a local engineering plane (x east, y north, metres) and back.
      Local tangent plane on the WGS84 ellipsoid: x = Δλ·N(φ0)·cos φ0, y = Δφ·M(φ0), with M and N the meridian and
      prime-vertical radii of curvature. Exact inverse; within about 1 cm of the true geodesic over 1 km.
   2. Geometry: lengths, shoelace area, centroid, perimeter, rotated rectangles, point in polygon, segment and polygon
      intersection, separating-axis overlap, point-to-segment distance and snapping, grid and angle snapping, offsets.
   3. Parking (α = angle of the bays to the aisle): frontage F = W / sin α, depth D = L sin α + W cos α, bays N = ⌊S / F⌋, module 2D + aisle.
   4. Validation: severity 0 valid, 1 info, 2 warning, 3 review, 4 critical, each with objects, reason and measure.
   Imagery-derived positions are estimates: they are never presented as surveyed boundaries. */
(function (root) {
  const D2R = Math.PI / 180, A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), R_MEAN = 6371008.8;
  const radii = lat => { const s = Math.sin(lat * D2R), w = 1 - E2 * s * s; return { M: A * (1 - E2) / Math.pow(w, 1.5), N: A / Math.sqrt(w) }; };

  // ---- 1. coordinates ----
  function frame(lon0, lat0) { const { M, N } = radii(lat0), kx = N * Math.cos(lat0 * D2R) * D2R, ky = M * D2R;
    return { lon0, lat0, kx, ky,
      toLocal: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * ky],
      toGeo: (x, y) => [lon0 + x / kx, lat0 + y / ky],
      crs: `Local tangent plane on WGS84, origin ${lat0.toFixed(7)}°N ${lon0.toFixed(7)}°E, x east, y north, metres` }; }
  function haversine([lon1, lat1], [lon2, lat2]) { const dp = (lat2 - lat1) * D2R, dl = (lon2 - lon1) * D2R;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dl / 2) ** 2; return 2 * R_MEAN * Math.asin(Math.min(1, Math.sqrt(a))); }

  // ---- 2. geometry (points are [x, y] in metres) ----
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1], cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const polyLength = P => P.slice(1).reduce((s, p, i) => s + len(P[i], p), 0);
  const open = P => (P.length > 1 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) ? P.slice(0, -1) : P;
  function signedArea(P) { P = open(P); let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  const area = P => Math.abs(signedArea(P));
  const perimeter = P => { P = open(P); return P.reduce((s, p, i) => s + len(p, P[(i + 1) % P.length]), 0); };
  function centroid(P) { P = open(P); const As = signedArea(P); if (!As) return P.reduce((c, p) => [c[0] + p[0] / P.length, c[1] + p[1] / P.length], [0, 0]); let cx = 0, cy = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], k = a[0] * b[1] - b[0] * a[1]; cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k; } return [cx / (6 * As), cy / (6 * As)]; }
  const rot = (v, t) => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
  // rectangle of width W (along its own x) and length L (along its own y), centre c, turned by θ (counter-clockwise, radians)
  const rect = (c, W, L, t) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const r = rot([i * W / 2, j * L / 2], t); return [c[0] + r[0], c[1] + r[1]]; });
  function pointInPoly(p, P) { P = open(P); let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; }
  function segIntersect(p1, p2, q1, q2) { const r = sub(p2, p1), s = sub(q2, q1), d = cross(r, s); if (Math.abs(d) < 1e-12) return false;
    const t = cross(sub(q1, p1), s) / d, u = cross(sub(q1, p1), r) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; }
  function polysIntersect(P, Q) { P = open(P); Q = open(Q);
    for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) if (segIntersect(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length])) return true;
    return pointInPoly(P[0], Q) || pointInPoly(Q[0], P); }
  // P lies wholly inside Q (all corners in, no edge crossing)
  const contains = (Q, P) => open(P).every(p => pointInPoly(p, Q)) && !open(P).some((p, i, a) => open(Q).some((q, j, b) => segIntersect(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
  // separating axis test for two convex polygons; returns the overlap depth along the best axis (0 = apart)
  function satOverlap(P, Q) { P = open(P); Q = open(Q); let depth = Infinity;
    for (const S of [P, Q]) for (let i = 0; i < S.length; i++) { const e = sub(S[(i + 1) % S.length], S[i]), n = [-e[1], e[0]], m = Math.hypot(n[0], n[1]) || 1; n[0] /= m; n[1] /= m;
      const pr = X => X.reduce(([lo, hi], p) => { const v = dot(p, n); return [Math.min(lo, v), Math.max(hi, v)]; }, [Infinity, -Infinity]);
      const [a0, a1] = pr(P), [b0, b1] = pr(Q), o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return 0; depth = Math.min(depth, o); } return depth; }
  // nearest point on segment AB to P: t = (P−A)·(B−A)/|B−A|², clamped to [0, 1]
  function snapToSegment(p, a, b) { const ab = sub(b, a), L2 = dot(ab, ab); let t = L2 ? dot(sub(p, a), ab) / L2 : 0; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * ab[0], a[1] + t * ab[1]]; return { q, t, d: len(p, q) }; }
  const distPointPoly = (p, P) => { P = open(P); if (pointInPoly(p, P)) return 0; let d = Infinity; for (let i = 0; i < P.length; i++) d = Math.min(d, snapToSegment(p, P[i], P[(i + 1) % P.length]).d); return d; };
  const distPolyPoly = (P, Q) => polysIntersect(P, Q) ? 0 : Math.min(...open(P).map(p => distPointPoly(p, Q)), ...open(Q).map(q => distPointPoly(q, P)));
  const distPolyLine = (P, Lp) => { let d = Infinity; for (let i = 0; i + 1 < Lp.length; i++) { if (open(P).some((p, k, a) => segIntersect(p, a[(k + 1) % a.length], Lp[i], Lp[i + 1]))) return 0;
      open(P).forEach(p => { d = Math.min(d, snapToSegment(p, Lp[i], Lp[i + 1]).d); }); d = Math.min(d, distPointPoly(Lp[i], P), distPointPoly(Lp[i + 1], P)); } return d; };
  const snapGrid = (p, g) => [g * Math.round(p[0] / g), g * Math.round(p[1] / g)];
  const snapAngle = (t, dt) => dt * Math.round(t / dt);
  const bearing = (a, b) => { const t = Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R; return (t + 360) % 360; };   // degrees from north, clockwise
  function offsetSeg(a, b, d) { const u = sub(b, a), m = Math.hypot(u[0], u[1]) || 1, n = [-u[1] / m, u[0] / m]; return [[a[0] + d * n[0], a[1] + d * n[1]], [b[0] + d * n[0], b[1] + d * n[1]]]; }

  // ---- 3. parking (α in degrees: 90 = perpendicular bays) ----
  const parking = {
    // bays at angle α to the aisle: each takes W / sin α of kerb, and reaches L sin α + W cos α into the row (90° gives W and L)
    frontage: (W, L, a) => W / Math.sin(a * D2R),
    depth: (W, L, a) => L * Math.sin(a * D2R) + W * Math.cos(a * D2R),
    count: (S, F) => Math.floor(S / F + 1e-9),
    module: (D, aisle) => 2 * D + aisle };


  // ---- 5. shape of a set of points: convex hull (monotone chain) and the minimum-area rectangle by rotating calipers.
  //      For a convex polygon the smallest enclosing rectangle has one side on a hull edge (Freeman and Shapira 1975),
  //      so only the n edge directions need testing: area(θ) = (max u − min u)(max v − min v) with u, v the axes at θ.
  function convexHull(pts) { const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); }
  function minAreaRect(pts) { const H = convexHull(pts); if (H.length < 3) return null; let best = null;
    for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length], L = len(a, b); if (L < 1e-12) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; let u0 = 1e18, u1 = -1e18, v0 = 1e18, v1 = -1e18;
      for (const p of H) { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
      const A = (u1 - u0) * (v1 - v0); if (!best || A < best.area) best = { area: A, ux, uy, u0, u1, v0, v1 }; }
    const { ux, uy, u0, u1, v0, v1 } = best, P = (u, v) => [u * ux - v * uy, u * uy + v * ux], w = u1 - u0, h = v1 - v0;
    const ang = Math.atan2(uy, ux), long = w >= h ? ang : ang + Math.PI / 2;
    return { area: best.area, corners: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], length: Math.max(w, h), width: Math.min(w, h),
      angle: ((long * 180 / Math.PI) % 180 + 180) % 180, aspect: Math.max(w, h) / (Math.min(w, h) || 1e-9) }; }

  // ---- 6. Hough transform for straight lines: every point votes for all lines r = x cos θ + y sin θ through it;
  //      peaks in the (θ, r) accumulator are the painted lines. Returns the strongest directions with their vote counts.
  function houghAngles(pts, opt) { opt = opt || {}; const dT = opt.dTheta || 1, dR = opt.dR || 1, nT = Math.round(180 / dT);
    if (pts.length < 20) return []; let R = 0; pts.forEach(p => { R = Math.max(R, Math.hypot(p[0], p[1])); });
    const nR = Math.ceil(2 * R / dR) + 1, acc = new Uint32Array(nT * nR), C = [], S = [];
    for (let t = 0; t < nT; t++) { C.push(Math.cos(t * dT * Math.PI / 180)); S.push(Math.sin(t * dT * Math.PI / 180)); }
    for (const [x, y] of pts) for (let t = 0; t < nT; t++) acc[t * nR + Math.round((x * C[t] + y * S[t] + R) / dR)]++;
    // a direction scores by its line peaks (sum of the top cells above a minimum length), so many short dividers count as much as one long kerb
    const min = opt.minVotes || 12, score = new Float64Array(nT);
    for (let t = 0; t < nT; t++) { let s = 0; for (let r = 0; r < nR; r++) { const v = acc[t * nR + r]; if (v >= min) s += v * v; } score[t] = s; }
    const out = []; for (let t = 0; t < nT; t++) { const a = score[(t - 1 + nT) % nT], b = score[t], c = score[(t + 1) % nT]; if (b > 0 && b >= a && b >= c) {
        const den = a - 2 * b + c, off = den ? 0.5 * (a - c) / den : 0;   // parabolic refinement to a fraction of a degree
        out.push({ theta: ((t + off) * dT + 180) % 180, score: b }); } }
    return out.sort((p, q) => q.score - p.score).slice(0, opt.top || 4); }
  // the line direction from a Hough normal angle θ (lines run at θ + 90°), both in 0..180
  const lineDir = theta => (theta + 90) % 180;
  const angDiff = (a, b) => { const d = Math.abs(((a - b) % 180 + 180) % 180); return Math.min(d, 180 - d); };

  // ---- 7. site suitability (Site Radar) ----
  //  Kernel density of demand at x:  f(x) = Σ wᵢ K(dᵢ / h) / h²  with a Gaussian kernel K(t) = e^(−t²/2) / 2π  and bandwidth h.
  //  Gravity pull of anchors:         A(x) = Σ Pⱼ / max(dⱼ, d₀)^β
  //  Weighted linear combination:     S = Σ wₖ Xₖ  over criteria normalised to 0..100, weights summing to 1;
  //  a criterion with no data (for example the grid when no substation is mapped) is left out and the weights renormalised.
  const kde = (x, pts, h) => { let s = 0; for (const p of pts) { const d = len(x, p.xy || p), t = d / h; if (t < 4) s += (p.w || 1) * Math.exp(-t * t / 2); } return s / (2 * Math.PI * h * h); };
  const gravity = (x, pts, beta, d0) => { let s = 0; for (const p of pts) s += (p.w || 1) / Math.pow(Math.max(len(x, p.xy || p), d0 || 50), beta || 2); return s; };
  function wlc(X, W) { let s = 0, ws = 0; for (const k in W) { if (X[k] === null || X[k] === undefined || !isFinite(X[k])) continue; s += W[k] * X[k]; ws += W[k]; } return ws ? s / ws : 0; }
  // share of box B (a polygon) covered by a mask, sampled on a grid: |B ∩ M| / |B|. For a small box against a large mask this is the
  // useful form of intersection over union (the union would be dominated by the mask).
  function coverShare(poly, inMask, n) { n = n || 6; const [a, b] = [poly[0], poly[1]], d = poly[3]; let hit = 0, t = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const s = (i + 0.5) / n, r = (j + 0.5) / n; const p = [a[0] + (b[0] - a[0]) * s + (d[0] - a[0]) * r, a[1] + (b[1] - a[1]) * s + (d[1] - a[1]) * r]; t++; if (inMask(p)) hit++; }
    return hit / t; }


  // adaptive bandwidth (balloon / k-nearest-neighbour KDE): each source gets hᵢ = RMS distance to its k nearest neighbours,
  // clamped to [hMin, hMax]. Dense city blocks get a tight kernel, sparse suburbs a wide one, with no fixed radius anywhere.
  function adaptiveBandwidths(pts, k, hMin, hMax) { k = k || 5; return pts.map((p, i) => { const d = [];
      for (let j = 0; j < pts.length; j++) if (j !== i) d.push(len(p.xy || p, pts[j].xy || pts[j]));
      d.sort((a, b) => a - b); const n = Math.min(k, d.length); if (!n) return hMax || 400;
      const h = Math.sqrt(d.slice(0, n).reduce((s, x) => s + x * x, 0) / n); return Math.max(hMin || 60, Math.min(hMax || 600, h)); }); }
  const kdeAdaptive = (x, pts, hs) => { let s = 0; pts.forEach((p, i) => { const h = hs[i], t = len(x, p.xy || p) / h; if (t < 4) s += (p.w || 1) * Math.exp(-t * t / 2) / (2 * Math.PI * h * h); }); return s; };
  // Sutherland–Hodgman: clip polygon P by a convex polygon C (both counter- or clockwise, open rings). Exact overlap area = area(clip).
  function clipConvex(P, C) { let out = P.slice(); const ccw = signedArea(C) > 0;
    for (let i = 0; i < C.length && out.length; i++) { const a = C[i], b = C[(i + 1) % C.length], inp = out; out = [];
      const side = p => { const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? c >= 0 : c <= 0; };
      const cut = (p, q) => { const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1], d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d; return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]; };
      for (let j = 0; j < inp.length; j++) { const p = inp[j], q = inp[(j + 1) % inp.length], ip = side(p), iq = side(q);
        if (iq) { if (!ip) out.push(cut(p, q)); out.push(q); } else if (ip) out.push(cut(p, q)); } }
    return out; }
  // overlap of a convex box B with any polygon M (buildings are often concave): M is fanned into triangles from its first vertex...
  // that is only exact for convex M, so for a concave M the box is clipped by M's convex pieces from ear clipping instead.
  function earTriangles(R) { const P = R.slice(); if (P.length > 3 && len(P[0], P[P.length - 1]) < 1e-12) P.pop(); const ccw = signedArea(P) > 0, T = [], idx = P.map((_, i) => i);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    let guard = 0; while (idx.length > 3 && guard++ < 5000) { let cut = false;
      for (let i = 0; i < idx.length; i++) { const a = P[idx[(i - 1 + idx.length) % idx.length]], b = P[idx[i]], c = P[idx[(i + 1) % idx.length]], cr = cross(a, b, c);
        if (ccw ? cr <= 0 : cr >= 0) continue;
        if (idx.some(j => { const p = P[j]; if (p === a || p === b || p === c) return false; const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p); return ccw ? d1 > 0 && d2 > 0 && d3 > 0 : d1 < 0 && d2 < 0 && d3 < 0; })) continue;
        T.push([a, b, c]); idx.splice(i, 1); cut = true; break; }
      if (!cut) break; }
    if (idx.length === 3) T.push(idx.map(i => P[i])); return T; }
  const overlapArea = (box, poly) => earTriangles(poly).reduce((s, t) => { const c = clipConvex(box, t); return s + (c.length >= 3 ? area(c) : 0); }, 0);
  // intersection over union, and the share of the box that is covered (the useful number for a small bay against a large building)
  const iou = (a, b) => { const i = overlapArea(a, b), u = area(a) + area(b) - i; return u > 0 ? i / u : 0; };
  const coveredShare = (box, poly) => overlapArea(box, poly) / (area(box) || 1);



  // ---- 9. AHP (Saaty): criterion weights from pairwise judgements. w = principal eigenvector of the comparison matrix A (power iteration),
  //      λmax from A·w = λ·w, consistency index CI = (λmax − n)/(n − 1), consistency ratio CR = CI / RI(n); judgements are acceptable when CR < 0.10.
  const RI = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];
  function ahp(A) { const n = A.length; let w = new Array(n).fill(1 / n);
    for (let it = 0; it < 200; it++) { const v = A.map(r => r.reduce((s, a, j) => s + a * w[j], 0)), t = v.reduce((a, b) => a + b, 0); const nw = v.map(x => x / t);
      const d = nw.reduce((s, x, i) => s + Math.abs(x - w[i]), 0); w = nw; if (d < 1e-12) break; }
    const Aw = A.map(r => r.reduce((s, a, j) => s + a * w[j], 0)), lmax = Aw.reduce((s, x, i) => s + x / w[i], 0) / n, CI = n > 2 ? (lmax - n) / (n - 1) : 0;
    return { w, lmax, CI, CR: n > 2 ? CI / RI[n] : 0 }; }
  // ---- 10. TOPSIS (Hwang and Yoon): rows are sites, columns criteria (all "more is better" here). Vector-normalise each column,
  //      weight it, find the ideal best A⁺ and worst A⁻, and rank by closeness C = d⁻ / (d⁺ + d⁻), 0..1.
  function topsis(X, w) { const m = X.length, n = w.length; if (!m) return [];
    const norm = []; for (let j = 0; j < n; j++) norm.push(Math.sqrt(X.reduce((s, r) => s + r[j] * r[j], 0)) || 1);
    const V = X.map(r => r.map((x, j) => w[j] * x / norm[j])), best = [], worst = [];
    for (let j = 0; j < n; j++) { best.push(Math.max(...V.map(r => r[j]))); worst.push(Math.min(...V.map(r => r[j]))); }
    return V.map(r => { const dp = Math.sqrt(r.reduce((s, v, j) => s + (v - best[j]) ** 2, 0)), dm = Math.sqrt(r.reduce((s, v, j) => s + (v - worst[j]) ** 2, 0)); return dp + dm ? dm / (dp + dm) : 0; }); }
  // ---- 11. how much the ranking depends on the weights: N random weight sets drawn around w (each weight × a log-normal factor, σ = 0.35,
  //      renormalised), TOPSIS re-run each time; returns for every site the share of draws in which it came first and its median rank.
  function rankStability(X, w, N, seed) { let s = seed || 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()), m = X.length, first = new Array(m).fill(0), ranks = X.map(() => []);
    for (let k = 0; k < (N || 400); k++) { let ww = w.map(x => x * Math.exp(0.35 * gauss())); const t = ww.reduce((a, b) => a + b, 0); ww = ww.map(x => x / t);
      const c = topsis(X, ww), order = c.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); first[order[0][1]]++; order.forEach(([, i], r) => ranks[i].push(r + 1)); }
    return X.map((_, i) => { const r = ranks[i].sort((a, b) => a - b); return { first: first[i] / (N || 400), median: r[r.length >> 1] }; }); }
  // Site Radar judgements (Saaty 1–9 scale): row criterion compared with column criterion. A starting expert view, meant to be confirmed by the team:
  // demand matters most; the charging gap and car park size next; main road, anchors and grid least.
  const RADAR_C = ['demand', 'gap', 'size', 'road', 'anchors', 'grid'];
  const RADAR_AHP = [[1, 2, 2, 3, 3, 3], [1 / 2, 1, 1, 2, 2, 2], [1 / 2, 1, 1, 2, 2, 2], [1 / 3, 1 / 2, 1 / 2, 1, 1, 1], [1 / 3, 1 / 2, 1 / 2, 1, 1, 1], [1 / 3, 1 / 2, 1 / 2, 1, 1, 1]];

  // ---- 8. Site Radar scoring: every car park scored as a charging site by a weighted linear combination of six criteria ----
  //  demand  : adaptive-bandwidth KDE of destinations weighted by how long drivers stay there (k = 6 nearest neighbours)
  //  anchors : gravity pull Σ P / d² of big anchors (malls, hotels, stadiums, hospitals …), d floored at 60 m
  //  gap     : distance to the nearest mapped charger      road : distance to a motorway, trunk or primary road
  //  grid    : distance to the nearest mapped substation (left out when none is mapped)   size : spaces in the car park
  //  All distances in metres on the local tangent plane around the view (accurate to < 0.5% over 1.5 km anywhere on Earth).
  const RADAR_A = ahp(RADAR_AHP), RADAR_W = {}; RADAR_C.forEach((c, i) => { RADAR_W[c] = RADAR_A.w[i]; });
  function radar(lots, raw, ctx) { if (!lots.length) return lots; const DEST_W = ctx.DEST_W, DEST_N = ctx.DEST_N;
    const lat0 = lots.reduce((a, l) => a + l.lat, 0) / lots.length, lon0 = lots.reduce((a, l) => a + l.lon, 0) / lots.length, F = frame(lon0, lat0), L = (lo, la) => F.toLocal(lo, la);
    const dest = raw.dest.map(p => ({ xy: L(p.c[0], p.c[1]), w: DEST_W[p.k] || DEST_W[p.cl] || 0, k: p.k })).filter(p => p.w > 0);
    const hs = adaptiveBandwidths(dest, 6, 80, 600), anchors = dest.filter(p => p.w >= 2);
    const segs = []; raw.roads.forEach(r => { const G = r.g.type === 'LineString' ? [r.g.coordinates] : r.g.type === 'MultiLineString' ? r.g.coordinates : []; G.forEach(l => { for (let i = 0; i < l.length - 1; i++) segs.push([L(l[i][0], l[i][1]), L(l[i + 1][0], l[i + 1][1]), r.w]); }); });
    const subs = (raw.subs || []).map(q => L(q.lon, q.lat)), ch = raw.chargers.map(c => ({ xy: L(c.lon, c.lat), name: c.name }));
    const clamp = v => Math.round(Math.max(0, Math.min(100, v)));
    const scored = lots.map(l => { const x = L(l.lon, l.lat);
      const D = kdeAdaptive(x, dest, hs) * 2 * Math.PI * 250 * 250, g = gravity(x, anchors, 2, 60) * 3600;
      let road = 1e9; segs.forEach(([a, b, w]) => { const m = snapToSegment(x, a, b).d / w; if (m < road) road = m; });
      let near = 1e9, nearName = '', n1 = 0; ch.forEach(c => { const m = len(x, c.xy); if (m < near) { near = m; nearName = c.name; } if (m < 1000) n1++; });
      let sub = 1e9; subs.forEach(q => { sub = Math.min(sub, len(x, q)); });
      let nd = 0; const kinds = {}; dest.forEach(p => { if (len(x, p.xy) < 400) { nd++; kinds[p.k] = (kinds[p.k] || 0) + 1; } });
      const spaces = l.area ? Math.round(l.area / 25) : 0;
      const X = { demand: clamp(100 * Math.log1p(D) / Math.log1p(400)), anchors: clamp(100 * Math.log1p(g) / Math.log1p(12)), gap: near > 1e8 ? 100 : clamp(near / 20),
        road: road > 1e8 ? 0 : clamp(100 * (1 - (road - 120) / 1400)), grid: subs.length ? clamp(100 * (1 - (sub - 300) / 2700)) : null, size: spaces ? clamp(spaces / 3) : null };   // unmapped size is unknown, not zero
      const score = Math.round(wlc(X, RADAR_W));   // replaced below by the TOPSIS closeness once every site is known
      const f = { dwell: X.demand, gap: X.gap, road: X.road, size: X.size || 0, anchors: X.anchors, grid: X.grid };
      const fx = [['Demand', X.demand], ['Anchors', X.anchors], ['Charging gap', X.gap], ['Main road', X.road]].concat(X.grid === null ? [] : [['Grid', X.grid]], X.size === null ? [] : [['Size', X.size]]);
      const kind = f.road >= 70 && f.dwell < 55 ? 'dc' : 'ac', bays = Math.max(4, Math.min(40, Math.round((spaces || 120) * 0.03 / 2) * 2));
      const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => { const nm = DEST_N[n] || [n.replace(/_/g, ' '), n.replace(/_/g, ' ') + 's']; return `${c} ${c === 1 ? nm[0] : nm[1]}`; }).join(', ');
      return Object.assign(l, { score, X, f, fx, kind, bays, spaces, nd, top, near: near > 1e8 ? null : Math.round(near), nearName, n1, sub: sub > 1e8 ? null : Math.round(sub) });
    }).map((l, _, all) => l);
    // rank: TOPSIS over the criteria every site has data for (grid drops out when no substation is mapped), weights from AHP renormalised
    // a criterion known for at least half the sites is kept, its gaps filled with the median of the known values; otherwise it is left out
    const cols = RADAR_C.filter(c => scored.filter(l => l.X[c] !== null).length >= Math.max(1, scored.length / 2)), w0 = cols.map(c => RADAR_W[c]), ws = w0.reduce((a, b) => a + b, 0), w = w0.map(x => x / ws);
    const medOf = c => { const v = scored.map(l => l.X[c]).filter(x => x !== null).sort((a, b) => a - b); return v[v.length >> 1]; }, fill = {}; cols.forEach(c => { fill[c] = medOf(c); });
    const M2 = scored.map(l => cols.map(c => (l.X[c] === null ? fill[c] : l.X[c]) + 1)), C = topsis(M2, w), stab = scored.length > 1 ? rankStability(M2, w, 400) : scored.map(() => ({ first: 1, median: 1 }));
    scored.forEach((l, i) => { l.wlc = l.score; l.score = scored.length > 1 ? Math.round(100 * C[i]) : l.wlc; l.stab = stab[i]; l.method = { cols, w: w.map(x => +x.toFixed(3)), CR: +RADAR_A.CR.toFixed(3) }; });
    return scored.sort((a, b) => b.score - a.score || b.wlc - a.wlc); }

  // ---- 4. validation ----
  const SEV = ['Valid', 'Info', 'Warning', 'Review', 'Critical'];
  const issue = (sev, kind, objects, reason, measured, required) => ({ sev, level: SEV[sev], kind, objects, reason, measured, required });

  // ---- self test: the acceptance example and the round trip (run with TwinGeo.selfTest()) ----
  function selfTest() { const R = [], ok = (name, pass, detail) => R.push({ name, pass: !!pass, detail });
    const site = [[0, 0], [50, 0], [50, 30], [0, 30]];
    ok('Shoelace area of a 50 × 30 m site = 1,500 m²', Math.abs(area(site) - 1500) < 1e-9, area(site));
    ok('Perimeter = 160 m', Math.abs(perimeter(site) - 160) < 1e-9, perimeter(site));
    ok('Centroid = (25, 15)', len(centroid(site), [25, 15]) < 1e-9, centroid(site));
    const F90 = parking.frontage(2.5, 5, 90), D90 = Math.round(parking.depth(2.5, 5, 90) * 1e9) / 1e9, N = parking.count(50, F90), Dm = parking.module(D90, 6);
    ok('Bays along 50 m at 2.5 m = 20 per row, 40 in two rows', N === 20 && 2 * N === 40, N);
    ok('Double-row module 5 + 6 + 5 = 16 m, fits 30 m', Dm === 16 && Dm <= 30, Dm);
    const fr = frame(54.6085, 24.4886), [x, y] = fr.toLocal(54.6185, 24.4986), [lo, la] = fr.toGeo(x, y), back = Math.hypot((lo - 54.6185) * fr.kx, (la - 24.4986) * fr.ky);
    ok('Round trip WGS84 → local → WGS84 within 1 mm', back < 1e-3, back);
    const hv = haversine([54.6085, 24.4886], [54.6185, 24.4986]), lp = Math.hypot(x, y);
    ok('Local plane agrees with the geodesic within 0.5% over 1.5 km', Math.abs(lp - hv) / hv < 0.005, [lp, hv]);
    const r1 = rect([0, 0], 2.5, 5, 0.3), r2 = rect([2.5, 0], 2.5, 5, 0.3);
    ok('Rotation keeps dimensions (2.5 × 5 m)', Math.abs(len(r1[0], r1[1]) - 2.5) < 1e-9 && Math.abs(len(r1[1], r1[2]) - 5) < 1e-9);
    ok('Touching bays do not overlap; shifted ones do', satOverlap(r1, rect([2.6, 0], 2.5, 5, 0)) >= 0 && satOverlap(rect([0, 0], 2.5, 5, 0), rect([2.5, 0], 2.5, 5, 0)) < 1e-9 && satOverlap(r1, rect([1, 0], 2.5, 5, 0.3)) > 0);
    ok('Containment: a bay inside the site, not one across its edge', contains(site, rect([10, 10], 2.5, 5, 0)) && !contains(site, rect([49.5, 10], 2.5, 5, 0)));
    const F60 = parking.frontage(2.5, 5, 60), D60 = parking.depth(2.5, 5, 60);
    ok('60° bays: 2.887 m of kerb and 5.580 m deep each', Math.abs(F60 - 2.8868) < 1e-3 && Math.abs(D60 - 5.5801) < 1e-3, [F60, D60]);
    ok('Point-to-line snap', len(snapToSegment([3, 4], [0, 0], [10, 0]).q, [3, 0]) < 1e-12);
    const mar = minAreaRect(rot ? rect([5, 5], 4, 10, 0.5) : []);
    ok('Rotating calipers: a 4 × 10 m box turned 28.6° is found exactly', mar && Math.abs(mar.area - 40) < 1e-6 && Math.abs(mar.length - 10) < 1e-6 && Math.abs(mar.width - 4) < 1e-6, mar && [mar.area, mar.angle]);
    const hp = []; for (let k = 0; k < 5; k++) for (let i = 0; i < 40; i++) { const t = i * 0.25, a = 30 * Math.PI / 180; hp.push([k * 3 * Math.cos(a + Math.PI / 2) + t * Math.cos(a), k * 3 * Math.sin(a + Math.PI / 2) + t * Math.sin(a)]); }
    const ha = houghAngles(hp, { dR: 0.5, minVotes: 10 });
    ok('Hough: five parallel lines at 30° give one direction at 30°', ha.length && angDiff(lineDir(ha[0].theta), 30) < 1, ha[0] && lineDir(ha[0].theta));
    ok('Weighted score skips a missing criterion and renormalises', Math.abs(wlc({ a: 80, b: null, c: 40 }, { a: 0.5, b: 0.3, c: 0.2 }) - (0.5 * 80 + 0.2 * 40) / 0.7) < 1e-9);
    const hs = adaptiveBandwidths([[0, 0], [10, 0], [0, 10], [10, 10], [2000, 0], [2600, 0]], 2, 1, 5000);
    ok('Adaptive bandwidth: tight in a cluster, wide when isolated', hs[0] < 15 && hs[4] > 400, hs.map(h => Math.round(h)));
    const box = [[0, 0], [4, 0], [4, 4], [0, 4]], L = [[2, 2], [10, 2], [10, 10], [6, 10], [6, 6], [2, 6]];
    ok('Sutherland–Hodgman on an L-shaped building: overlap 4 m² of a 16 m² bay, IoU 4 / 60', Math.abs(overlapArea(box, L) - 4) < 1e-9 && Math.abs(iou(box, L) - 4 / 60) < 1e-9, [overlapArea(box, L), iou(box, L)]);
    const ah = ahp(RADAR_AHP);
    ok('AHP weights sum to 1 and the judgements are consistent (CR < 0.10)', Math.abs(ah.w.reduce((a, b) => a + b, 0) - 1) < 1e-9 && ah.CR < 0.1, { w: ah.w.map(x => +x.toFixed(3)), CR: +ah.CR.toFixed(4) });
    const ahC = ahp([[1, 2, 4], [1 / 2, 1, 2], [1 / 4, 1 / 2, 1]]);
    ok('AHP on a perfectly consistent matrix: weights 4/7, 2/7, 1/7 and CR = 0', Math.abs(ahC.w[0] - 4 / 7) < 1e-9 && Math.abs(ahC.CR) < 1e-9);
    const tp = topsis([[10, 10], [0, 0], [5, 5]], [0.5, 0.5]);
    ok('TOPSIS: the best site scores 1, the worst 0, the middle 0.5', Math.abs(tp[0] - 1) < 1e-9 && tp[1] < 1e-9 && Math.abs(tp[2] - 0.5) < 1e-9, tp);
    return R; }

  root.TwinGeo = { frame, haversine, len, polyLength, area, signedArea, perimeter, centroid, rect, rot, pointInPoly, segIntersect, polysIntersect, contains, satOverlap,
    snapToSegment, distPointPoly, distPolyPoly, distPolyLine, snapGrid, snapAngle, bearing, offsetSeg, parking, SEV, issue, selfTest,
    convexHull, minAreaRect, houghAngles, lineDir, angDiff, kde, gravity, wlc, coverShare, adaptiveBandwidths, kdeAdaptive, clipConvex, earTriangles, overlapArea, iou, coveredShare, radar, RADAR_W, ahp, topsis, rankStability, RADAR_AHP, RADAR_C };
})(typeof window !== 'undefined' ? window : globalThis);
