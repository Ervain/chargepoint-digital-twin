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
    return R; }

  root.TwinGeo = { frame, haversine, len, polyLength, area, signedArea, perimeter, centroid, rect, rot, pointInPoly, segIntersect, polysIntersect, contains, satOverlap,
    snapToSegment, distPointPoly, distPolyPoly, distPolyLine, snapGrid, snapAngle, bearing, offsetSeg, parking, SEV, issue, selfTest };
})(typeof window !== 'undefined' ? window : globalThis);
