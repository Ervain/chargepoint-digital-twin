// AutoCAD site plan: turns the layout built on the map (bays, charging stalls, rows, lanes, canopies, cable routes) into an engineer-ready DXF.
// Real-world coordinates (WGS 84 / UTM, metres) so it lines up with survey drawings; named layers with colours and line types;
// row dimensions, a north arrow and scale bar, a title block, and a charger schedule. DXF R12 (AC1009): the most widely readable form,
// opened directly by AutoCAD 2027 on Mac and Windows and by every other CAD tool. Imagery-derived, so it says clearly it is not a survey.
(() => {
  // ---- WGS 84 to UTM (Transverse Mercator, Snyder 1987 series; well under a millimetre within a zone) ----
  function utm(lon, lat, zone) {
    const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996, R = Math.PI / 180;
    const z = zone || Math.floor((lon + 180) / 6) + 1, l0 = ((z - 1) * 6 - 180 + 3) * R, p = lat * R, l = lon * R;
    const s = Math.sin(p), c = Math.cos(p), t = Math.tan(p), N = a / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, A = c * (l - l0);
    const e4 = e2 * e2, e6 = e4 * e2;
    const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let Nn = k0 * (M + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) Nn += 10000000;
    return [E, Nn, z];
  }

  // ---- a small DXF R12 writer ----
  function Dxf() {
    const ent = [], f = v => (Math.round(v * 1000) / 1000).toFixed(3), bb = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (x, y) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); };
    const clean = s => String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '');   // R12 text: plain ASCII
    return {
      bb,
      line(a, b, layer) { grow(...a); grow(...b); ent.push('0', 'LINE', '8', layer, '10', f(a[0]), '20', f(a[1]), '30', '0.0', '11', f(b[0]), '21', f(b[1]), '31', '0.0'); },
      poly(pts, layer, closed) { if (pts.length < 2) return; ent.push('0', 'POLYLINE', '8', layer, '66', '1', '10', '0.0', '20', '0.0', '30', '0.0', '70', closed ? '1' : '0');
        pts.forEach(q => { grow(...q); ent.push('0', 'VERTEX', '8', layer, '10', f(q[0]), '20', f(q[1]), '30', '0.0'); }); ent.push('0', 'SEQEND', '8', layer); },
      solid(a, b, c, d, layer) { [a, b, c, d].forEach(q => grow(...q)); ent.push('0', 'SOLID', '8', layer, '10', f(a[0]), '20', f(a[1]), '30', '0.0', '11', f(b[0]), '21', f(b[1]), '31', '0.0', '12', f(c[0]), '22', f(c[1]), '32', '0.0', '13', f(d[0]), '23', f(d[1]), '33', '0.0'); },
      circle(c, r, layer) { grow(c[0] - r, c[1] - r); grow(c[0] + r, c[1] + r); ent.push('0', 'CIRCLE', '8', layer, '10', f(c[0]), '20', f(c[1]), '30', '0.0', '40', f(r)); },
      // align: 0 left, 1 centre, 2 right; valign: 0 baseline, 2 middle
      text(q, s, layer, h, { rot = 0, align = 0, valign = 0 } = {}) { grow(...q); ent.push('0', 'TEXT', '8', layer, '10', f(q[0]), '20', f(q[1]), '30', '0.0', '40', f(h), '1', clean(s), '50', f(rot), '7', 'STANDARD');
        if (align || valign) ent.push('72', String(align), '73', String(valign), '11', f(q[0]), '21', f(q[1]), '31', '0.0'); },
      build(layers, comments) {
        const o = [];
        comments.forEach(c => o.push('999', clean(c)));
        o.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '9', '$MEASUREMENT', '70', '1', '9', '$LUNITS', '70', '2', '9', '$LUPREC', '70', '3',
          '9', '$EXTMIN', '10', f(bb[0]), '20', f(bb[1]), '30', '0.0', '9', '$EXTMAX', '10', f(bb[2]), '20', f(bb[3]), '30', '0.0',
          '9', '$LIMMIN', '10', f(bb[0]), '20', f(bb[1]), '9', '$LIMMAX', '10', f(bb[2]), '20', f(bb[3]), '9', '$LTSCALE', '40', '1.0', '9', '$TEXTSTYLE', '7', 'STANDARD', '0', 'ENDSEC');
        o.push('0', 'SECTION', '2', 'TABLES');
        o.push('0', 'TABLE', '2', 'LTYPE', '70', '3',
          '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0',
          '0', 'LTYPE', '2', 'DASHED', '70', '0', '3', '__ __ __ __', '72', '65', '73', '2', '40', '1.5', '49', '1.0', '49', '-0.5',
          '0', 'LTYPE', '2', 'CENTER', '70', '0', '3', '____ _ ____ _', '72', '65', '73', '4', '40', '3.0', '49', '2.0', '49', '-0.4', '49', '0.2', '49', '-0.4', '0', 'ENDTAB');
        o.push('0', 'TABLE', '2', 'LAYER', '70', String(layers.length + 1), '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
        layers.forEach(([n, c, lt]) => o.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', lt || 'CONTINUOUS'));
        o.push('0', 'ENDTAB', '0', 'TABLE', '2', 'STYLE', '70', '1', '0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '1.0', '3', 'txt', '4', '', '0', 'ENDTAB', '0', 'ENDSEC');
        o.push('0', 'SECTION', '2', 'BLOCKS', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...ent, '0', 'ENDSEC', '0', 'EOF');
        return o.join('\r\n') + '\r\n'; } };
  }

  const LAYERS = [
    ['CP-BAYS', 8], ['CP-EV-AC', 3], ['CP-EV-DC', 5], ['CP-EV-LABEL', 7], ['CP-ROWS', 9], ['CP-LANES', 2, 'DASHED'], ['CP-CANOPY', 4], ['CP-CANOPY-LABEL', 4],
    ['CP-CABLE', 30], ['CP-CABLE-LABEL', 30], ['CP-DIMS', 1], ['CP-CONTEXT-BLDG', 252], ['CP-CONTEXT-ROAD', 253, 'CENTER'], ['CP-ANNO', 7], ['CP-TITLE', 7], ['CP-SCHEDULE', 7]];

  // build the drawing from what the planner holds. ctx: { LVS, COVER, ev } from the lanes module; S is the twin
  function build(S, A, ctx) {
    const { LVS, COVER } = ctx, ev = ctx.ev || [], all = LVS ? LVS.runs.flatMap(r => r.bays) : [];
    const p = A.pin && A.pin(), refLL = (ev.length ? ev : all).reduce((a, b, _, arr) => [a[0] + b.c[0] / arr.length, a[1] + b.c[1] / arr.length], [0, 0]);
    const zone = Math.floor((refLL[0] + 180) / 6) + 1, hemi = refLL[1] >= 0 ? 'N' : 'S', epsg = (refLL[1] >= 0 ? 32600 : 32700) + zone;
    const U = q => { const r = utm(q[0], q[1], zone); return [r[0], r[1]]; };
    const g3 = (x, z) => [S.lon + x / A.mLon(S.lat), S.lat - z / A.M_LAT];   // 3D scene metres back to WGS 84
    const D = Dxf();
    const ringU = r => { const pts = r.map(U); const a = pts[0], b = pts[pts.length - 1]; if (pts.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) pts.pop(); return pts; };

    // site geometry first, so the annotation can be laid out around its extents
    const rows = LVS ? LVS.out.rows : [], aisles = LVS ? LVS.out.aisles : [];
    rows.forEach(r => D.poly(ringU(r.slice(0, 4)), 'CP-ROWS', true));
    all.forEach(b => D.poly(ringU(b.ring.slice(0, 4)), b.ev === 'dc' ? 'CP-EV-DC' : b.ev ? 'CP-EV-AC' : 'CP-BAYS', true));
    aisles.forEach(l => D.poly(l.map(U), 'CP-LANES', false));
    const canopies = (COVER && COVER.plan && COVER.frame) ? COVER.plan : [];
    canopies.forEach(c => D.poly(c.poly.map(q => U(COVER.frame.toGeo(q[0], q[1]))), 'CP-CANOPY', true));
    const cables = (S.cableDXF && S.on) ? S.cableDXF().map(r => ({ name: r.name, pts: r.pts.map(q => U(g3(q[0], q[1]))) })) : [];
    const len = pts => pts.reduce((s, q, i) => i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);
    cables.forEach(r => { r.len = len(r.pts); D.poly(r.pts, 'CP-CABLE', false); });
    const site = D.bb.slice(), W = Math.max(site[2] - site[0], 20), Hs = Math.max(site[3] - site[1], 20), h = Math.max(0.35, Math.min(2.5, Math.max(W, Hs) / 180));   // text height follows the site size

    // context: OpenStreetMap buildings and roads the map is showing around the site, light grey, for orientation only
    let nCtx = 0; try { const map = A.map && A.map(), m = 40, box = [site[0] - m, site[1] - m, site[2] + m, site[3] + m];
      if (map) { const seen = new Set(), inBox = pts => pts.some(q => q[0] > box[0] && q[0] < box[2] && q[1] > box[1] && q[1] < box[3]);
        map.queryRenderedFeatures().forEach(ft => { const sl = ft.sourceLayer || '', g = ft.geometry; if (!g) return;
          const key = sl + JSON.stringify(g.coordinates).slice(0, 80); if (seen.has(key)) return; seen.add(key);
          if (/building/i.test(sl) && (g.type === 'Polygon' || g.type === 'MultiPolygon')) (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(pl => { const r = ringU(pl[0]); if (r.length > 2 && inBox(r)) { D.poly(r, 'CP-CONTEXT-BLDG', true); nCtx++; } });
          if (/transportation|road/i.test(sl) && (g.type === 'LineString' || g.type === 'MultiLineString')) (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach(l => { const r = l.map(U); if (r.length > 1 && inBox(r)) { D.poly(r, 'CP-CONTEXT-ROAD', false); nCtx++; } }); }); } } catch (e) { /* context is optional */ }

    // labels: charging stalls numbered, canopies named, cables with their length
    const evList = ev.map((b, i) => ({ id: `${b.ev === 'dc' ? 'DC' : 'AC'}-${String(i + 1).padStart(2, '0')}`, type: b.ev === 'dc' ? 'DC fast' : 'AC', c: U(b.c) }));
    evList.forEach(e => D.text(e.c, e.id, 'CP-EV-LABEL', h * 0.9, { align: 1, valign: 2 }));
    canopies.forEach(c => { const q = U(COVER.frame.toGeo(c.c[0], c.c[1])); D.text([q[0], q[1] + h * 1.6], c.name || 'Canopy', 'CP-CANOPY-LABEL', h, { align: 1, valign: 2 }); });
    cables.forEach(r => { const e = r.pts[r.pts.length - 1]; D.text([e[0] + h * 0.4, e[1] + h * 0.4], `${r.name} ${r.len.toFixed(0)} m`, 'CP-CABLE-LABEL', h * 0.5); });   // short: the cable schedule lists them all

    // dimensions: each row's length along its long side, drawn just outside the row with ticks, plus its bay count and width
    rows.forEach((r, i) => { const q = ringU(r.slice(0, 4)); if (q.length < 4) return;
      const e = [0, 1, 2, 3].map(k => [q[k], q[(k + 1) % 4]]), L = s => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), long = e.reduce((a, s) => L(s) > L(a) ? s : a);
      const cx = q.reduce((a, v) => a + v[0] / 4, 0), cy = q.reduce((a, v) => a + v[1] / 4, 0), [a, b] = long, ux = (b[0] - a[0]) / L(long), uy = (b[1] - a[1]) / L(long);
      let nx = -uy, ny = ux; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const o = 1.2, A1 = [a[0] + nx * o, a[1] + ny * o], B1 = [b[0] + nx * o, b[1] + ny * o], t = 0.35;
      D.line(A1, B1, 'CP-DIMS'); [A1, B1].forEach(P => D.line([P[0] - (ux + nx) * t, P[1] - (uy + ny) * t], [P[0] + (ux + nx) * t, P[1] + (uy + ny) * t], 'CP-DIMS'));
      D.line(a, [a[0] + nx * (o + 0.3), a[1] + ny * (o + 0.3)], 'CP-DIMS'); D.line(b, [b[0] + nx * (o + 0.3), b[1] + ny * (o + 0.3)], 'CP-DIMS');
      let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const run = LVS.runs[i], n = run && run.bays ? run.bays.length : 0, bw = n ? L(long) / n : 0;
      D.text([mx + nx * (o + h * 0.9), my + ny * (o + h * 0.9)], `${L(long).toFixed(2)} m${n ? `  (${n} bays @ ${bw.toFixed(2)} m)` : ''}`, 'CP-DIMS', h * 0.8, { rot: ang, align: 1, valign: 2 }); });

    // north arrow and scale bar, top left and bottom left of the site
    { const s = h * 4, x = site[0] - s * 2.2, y = site[3] - s; D.poly([[x, y + s], [x - s * 0.45, y - s * 0.6], [x, y - s * 0.25], [x + s * 0.45, y - s * 0.6]], 'CP-ANNO', true);
      D.solid([x, y + s], [x, y - s * 0.25], [x + s * 0.45, y - s * 0.6], [x + s * 0.45, y - s * 0.6], 'CP-ANNO'); D.text([x, y + s * 1.35], 'N', 'CP-ANNO', h * 1.8, { align: 1, valign: 2 });
      D.text([x, y - s * 1.2], 'GRID NORTH', 'CP-ANNO', h * 0.6, { align: 1, valign: 2 }); }
    { const step = [5, 10, 20, 50, 100].find(v => v * 4 >= W * 0.25) || 100, x0 = site[0], y0 = site[1] - h * 6;
      for (let k = 0; k < 4; k++) { const a = [x0 + k * step, y0], b = [x0 + (k + 1) * step, y0 + h * 0.8]; D.poly([a, [b[0], a[1]], b, [a[0], b[1]]], 'CP-ANNO', true); if (k % 2 === 0) D.solid(a, [b[0], a[1]], [a[0], b[1]], b, 'CP-ANNO'); D.text([x0 + k * step, y0 - h * 1.4], String(k * step), 'CP-ANNO', h * 0.8, { align: 1, valign: 2 }); }
      D.text([x0 + 4 * step, y0 - h * 1.4], `${4 * step} m`, 'CP-ANNO', h * 0.8, { align: 1, valign: 2 }); D.text([x0, y0 - h * 3.2], 'SCALE BAR, METRES. Drawing is 1 unit = 1 m: plot to any scale.', 'CP-ANNO', h * 0.6); }

    // title block and charger schedule, to the right of the site
    let cabY = null; const nAC = ev.filter(b => b.ev !== 'dc').length, nDC = ev.length - nAC, cableTot = cables.reduce((s, r) => s + r.len, 0);
    const slug = (S.slug || (x => 'site'))((p && p.name) || S.name || 'site'), drawNo = `CP-SP-${slug.toUpperCase().slice(0, 24)}-001`, today = new Date().toISOString().slice(0, 10);
    const tb = h * Math.max(1, Math.min(3, Math.max(W, Hs) / (46 * h * 3))), TW = tb * 46, x0 = site[2] + h * 8, top = site[3], lh = tb * 1.9, Lx = x0 + h, cell = (y, a, b) => { D.text([Lx, y], a, 'CP-TITLE', tb * 0.7); D.text([Lx + tb * 14, y], b, 'CP-TITLE', tb * 0.9); };
    const fields = [['SITE', (p && p.name) || S.name || 'Chosen site'], ['LOCATION', ((p && p.full) || S.place || '').slice(0, 60) || 'TBD'],
      ['WGS 84', `${refLL[1].toFixed(6)} N, ${refLL[0].toFixed(6)} E`], ['GRID', `WGS 84 / UTM zone ${zone}${hemi} (EPSG:${epsg}), metres`],
      ['BAYS', `${all.length} parking bays in ${rows.length} rows`], ['CHARGING', `${ev.length} stalls: ${nAC} AC, ${nDC} DC`],
      ['CANOPIES', canopies.length ? `${canopies.length} solar canopies` : 'None placed'], ['CABLE', cables.length ? `${cables.length} runs, ${cableTot.toFixed(1)} m on plan` : 'Not routed'],
      ['SOURCE', nCtx ? 'Satellite imagery read by Lane Vision; OSM context' : 'Satellite imagery read by Lane Vision'], ['STATUS', 'PRELIMINARY. NOT FOR CONSTRUCTION'],
      ['DRAWN', 'ChargePoint Digital Twin'], ['DATE', today], ['DRAWING NO', drawNo], ['REVISION', 'P01']];
    const TH = lh * (fields.length + 4.2);
    D.poly([[x0, top], [x0 + TW, top], [x0 + TW, top - TH], [x0, top - TH]], 'CP-TITLE', true);
    D.text([Lx, top - lh * 1.3], 'CHARGEPOINT', 'CP-TITLE', tb * 1.8); D.text([Lx, top - lh * 2.4], 'EV CHARGING SITE PLAN', 'CP-TITLE', tb * 1.1);
    D.line([x0, top - lh * 3.1], [x0 + TW, top - lh * 3.1], 'CP-TITLE');
    fields.forEach(([a, b], i) => { const y = top - lh * (4.1 + i); cell(y, a, b); D.line([x0, y - lh * 0.45], [x0 + TW, y - lh * 0.45], 'CP-TITLE'); });
    D.text([Lx, top - TH + lh * 0.2], 'Imagery-derived estimate. Survey and verify every dimension before design or construction.', 'CP-TITLE', tb * 0.55);
    // schedule: one line per charging stall with its grid position, so the electrical engineer can take it straight into the SLD and BoQ
    if (evList.length) { const sy = top - TH - lh * 2, colX = [Lx, Lx + tb * 9, Lx + tb * 19, Lx + tb * 32], shown = evList.slice(0, 80);
      D.text([Lx, sy], 'CHARGER SCHEDULE', 'CP-SCHEDULE', tb * 1.1);
      ['ID', 'TYPE', 'EASTING (m)', 'NORTHING (m)'].forEach((t, k) => D.text([colX[k], sy - lh * 1.4], t, 'CP-SCHEDULE', tb * 0.7));
      D.line([x0, sy - lh * 1.8], [x0 + TW, sy - lh * 1.8], 'CP-SCHEDULE');
      shown.forEach((e, i) => { const y = sy - lh * (2.6 + i); [e.id, e.type, e.c[0].toFixed(2), e.c[1].toFixed(2)].forEach((t, k) => D.text([colX[k], y], t, 'CP-SCHEDULE', tb * 0.75)); });
      const yEnd = sy - lh * (2.6 + shown.length);
      if (evList.length > shown.length) D.text([Lx, yEnd], `+ ${evList.length - shown.length} more (see the twin)`, 'CP-SCHEDULE', tb * 0.7);
      D.poly([[x0, sy + lh], [x0 + TW, sy + lh], [x0 + TW, yEnd - lh * 0.6], [x0, yEnd - lh * 0.6]], 'CP-SCHEDULE', true); cabY = yEnd - lh * 2.5; }
    // cable schedule: every feeder with its route length on plan, in two columns
    if (cables.length) { const sy = cabY !== null ? cabY : top - TH - lh * 2, shown = cables.slice(0, 160), per = Math.ceil(shown.length / 2), cols = [Lx, Lx + tb * 9, Lx + TW / 2, Lx + TW / 2 + tb * 9];
      D.text([Lx, sy], `CABLE SCHEDULE (${cableTot.toFixed(0)} m on plan in all)`, 'CP-SCHEDULE', tb * 1.1);
      [['FEEDER', 0], ['LENGTH (m)', 1], ['FEEDER', 2], ['LENGTH (m)', 3]].forEach(([t, k]) => D.text([cols[k], sy - lh * 1.4], t, 'CP-SCHEDULE', tb * 0.7)); D.line([x0, sy - lh * 1.8], [x0 + TW, sy - lh * 1.8], 'CP-SCHEDULE');
      shown.forEach((r, i) => { const c = i < per ? 0 : 2, y = sy - lh * (2.6 + (i % per)); D.text([cols[c], y], r.name, 'CP-SCHEDULE', tb * 0.7); D.text([cols[c + 1], y], r.len.toFixed(1), 'CP-SCHEDULE', tb * 0.7); });
      const yEnd = sy - lh * (2.6 + per); D.text([Lx, yEnd], 'Plan lengths only: add vertical runs, slack and terminations for the BoQ.', 'CP-SCHEDULE', tb * 0.55);
      D.poly([[x0, sy + lh], [x0 + TW, sy + lh], [x0 + TW, yEnd - lh * 0.8], [x0, yEnd - lh * 0.8]], 'CP-SCHEDULE', true); }

    const comments = ['ChargePoint Digital Twin site plan', `Coordinate system: WGS 84 / UTM zone ${zone}${hemi} (EPSG:${epsg}), metres, grid north up`,
      `Reference point ${refLL[1].toFixed(7)} N, ${refLL[0].toFixed(7)} E`, 'Imagery-derived estimate, NOT a survey', `Exported ${new Date().toISOString()}`];
    return { text: D.build(LAYERS, comments), name: `chargepoint-${slug}-site-plan.dxf`, summary: { bays: all.length, rows: rows.length, ac: nAC, dc: nDC, canopies: canopies.length, cable: cableTot, zone, epsg, drawNo } };
  }

  const start = () => { const S = window.__twin; if (!S || !S.api) return; const A = S.api;
    S.cadBuild = ctx => build(S, A, ctx);
    S.cadExport = ctx => { const r = build(S, A, ctx), blob = new Blob([r.text], { type: 'application/dxf' }), s = r.summary;
      const msg = `AutoCAD site plan saved (${r.name}): ${s.bays} bays, ${s.ac + s.dc} charging stalls${s.canopies ? `, ${s.canopies} canopies` : ''}${s.cable ? `, ${s.cable.toFixed(0)} m of cable` : ''}. Real coordinates (UTM ${s.zone}N), layers, dimensions, title block and charger schedule. Open it in AutoCAD and type ZOOM, then E.`;
      return (S.saveFile ? S.saveFile(r.name, blob) : Promise.resolve()).then(() => { (A.hint || A.say)(msg); return r; }); };
    S.utm = utm; };
  if (window.__twin && window.__twin.api) start(); else document.addEventListener('twin-ready', start, { once: true });
})();
