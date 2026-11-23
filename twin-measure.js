/* ChargePoint Digital Twin · Measure
   A ruler on the site map, in true metres on the ground (geometry engine, local plane on WGS84): never screen pixels, so
   zoom never changes a result. Click to add points (the map still pans by dragging); a live line follows the cursor; every
   segment is labelled on the map; click the first point or double-click to close a shape for area and perimeter.
   Backspace undoes, Esc ends. While measuring, clicks belong to the ruler only: they never move the pin or pick a car park. */
(() => {
  const start = () => { const S = window.__twin; if (S && S.api && S.api.map) init(S); };
  if (window.__twin) start(); else document.addEventListener('twin-ready', start, { once: true });
  function init(S) {
    const A = S.api, hint = A.hint, head = A.dlg.querySelector('.tw-map-head');
    head.querySelectorAll('.tw-meas').forEach(x => x.remove());   // an older ruler, if a cached script still made one
    const st = document.createElement('style'); st.textContent = '.tw-meas{appearance:none;border:1px solid rgba(15,18,22,.15);cursor:pointer;font:700 13px var(--display);padding:9px 12px;border-radius:10px;background:#fff;color:#0f1216;white-space:nowrap}.tw-meas[aria-pressed=true]{background:#FFD23F}\n.is-measuring,.is-measuring canvas{cursor:crosshair!important}\n.ms-lab{padding:2px 7px;border-radius:7px;background:#0f1216;color:#FFD23F;font:700 12px var(--display);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none}\n.ms-lab.is-live{background:#FFD23F;color:#0f1216}.ms-lab.is-area{display:flex;flex-direction:column;align-items:center;padding:5px 10px;font-size:14px}.ms-lab.is-area span{font-size:11px;font-weight:600;opacity:.85}\n.ms-card{position:absolute;left:16px;bottom:96px;z-index:7;min-width:220px;max-width:280px;background:rgba(15,18,22,.94);color:#fff;border-radius:12px;padding:10px 12px;font:500 13px/1.4 var(--display);box-shadow:0 10px 28px rgba(0,0,0,.35)}\n.ms-card[hidden]{display:none}.ms-card p{margin:3px 0}.ms-card b{color:#FFD23F}.ms-card .ms-t{font-weight:800;letter-spacing:.02em}.ms-card .ms-h{opacity:.7;font-size:12px}\n.ms-card div{display:flex;gap:6px;margin-top:8px}.ms-card button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:5px 10px;font:700 12px var(--display);cursor:pointer}.ms-card button[data-k=done]{background:#FFD23F;color:#0f1216;border-color:#FFD23F}\n'; document.head.appendChild(st);
    const mBtn = document.createElement('button'); mBtn.type = 'button'; mBtn.className = 'tw-meas'; mBtn.textContent = '📏 Measure'; mBtn.setAttribute('aria-pressed', 'false');
    mBtn.title = 'Click points on the map to measure distance and bearing; click the first point again to close a shape and get its area. Esc to finish.';
    (head.querySelector('.tw-lv') || head.querySelector('.tw-pk')).after(mBtn);
    // ---- measuring, in metres on the local plane (not in screen pixels, so it never changes with zoom) ----
    // click to add points (the map stays draggable), a live line follows the cursor, every segment is labelled on the map,
    // click the first point (or double-click) to close the shape and get area and perimeter. Backspace undoes, Esc ends.
    // While measuring, clicks belong to the ruler only: they never move the pin or pick a car park.
    let MS = null, msLabs = [], msCard = null, msDown = null;
    const G0 = () => window.TwinGeo, mapView = () => A.dlg.querySelector('.tw-map-view');
    const fmtM = v => v >= 1000 ? `${(v / 1000).toFixed(3)} km` : `${v.toFixed(2)} m`;
    function msFC(cur) { if (!MS) return { type: 'FeatureCollection', features: [] }; const P = MS.pts, F = [];
      const line = MS.closed ? [...P, P[0]] : cur && P.length ? [...P, cur] : P;
      if (MS.closed && P.length > 2) F.push({ type: 'Feature', properties: { k: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...P, P[0]]] } });
      if (line.length > 1) F.push({ type: 'Feature', properties: { k: 'line' }, geometry: { type: 'LineString', coordinates: line } });
      P.forEach((q, i) => F.push({ type: 'Feature', properties: { k: i === 0 ? 'first' : 'pt' }, geometry: { type: 'Point', coordinates: q } }));
      return { type: 'FeatureCollection', features: F }; }
    function msLayers(map) { if (map.getSource('ms')) return;
      map.addSource('ms', { type: 'geojson', data: msFC() });
      map.addLayer({ id: 'ms-f', type: 'fill', source: 'ms', filter: ['==', 'k', 'fill'], paint: { 'fill-color': '#FFD23F', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'ms-h', type: 'line', source: 'ms', filter: ['==', 'k', 'line'], paint: { 'line-color': '#0f1216', 'line-width': 5, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'ms-l', type: 'line', source: 'ms', filter: ['==', 'k', 'line'], paint: { 'line-color': '#FFD23F', 'line-width': 3 } });
      map.addLayer({ id: 'ms-p', type: 'circle', source: 'ms', filter: ['in', 'k', 'pt', 'first'], paint: { 'circle-radius': ['case', ['==', ['get', 'k'], 'first'], 7, 5], 'circle-color': '#FFD23F', 'circle-stroke-color': '#0f1216', 'circle-stroke-width': 2 } });
      map.once('style.load', () => { msLayers(map); msDraw(map); }); }
    const lab = (map, ll, html, cls) => { const el = document.createElement('div'); el.className = 'ms-lab ' + (cls || ''); el.innerHTML = html; const m = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map); msLabs.push(m); return m; };
    function msDraw(map, cur) { try { if (!map.getSource('ms')) msLayers(map); map.getSource('ms').setData(msFC(cur)); } catch (e) { map.once('idle', () => msDraw(map)); }   // map still loading: draw when ready
      msLabs.forEach(m => m.remove()); msLabs = [];
      if (!MS) { if (msCard) msCard.hidden = true; return; } const G = G0(), P = MS.pts; if (!P.length) { card(null); return; }
      const fr = G.frame(P[0][0], P[0][1]), L = q => fr.toLocal(q[0], q[1]), ring = MS.closed ? [...P, P[0]] : cur ? [...P, cur] : P;
      for (let i = 1; i < ring.length; i++) { const a = L(ring[i - 1]), b = L(ring[i]), d = G.len(a, b); if (d < 0.01) continue;
        lab(map, [(ring[i - 1][0] + ring[i][0]) / 2, (ring[i - 1][1] + ring[i][1]) / 2], fmtM(d), !MS.closed && cur && i === ring.length - 1 ? 'is-live' : ''); }
      const LP = P.map(L), tot = G.polyLength(MS.closed ? [...LP, LP[0]] : cur ? [...LP, L(cur)] : LP);
      if (MS.closed) { const ar = G.area(LP), c = fr.toGeo(...G.centroid(LP)); lab(map, c, `<b>${ar.toLocaleString('en-US', { maximumFractionDigits: 1 })} m²</b><span>${(ar / 1e4).toFixed(3)} ha</span>`, 'is-area'); }
      card({ n: P.length, tot, closed: MS.closed, area: MS.closed ? G.area(LP) : 0, last: !MS.closed && cur ? G.len(LP[LP.length - 1], L(cur)) : 0, brg: !MS.closed && cur ? G.bearing(LP[LP.length - 1], L(cur)) : (P.length > 1 ? G.bearing(LP[LP.length - 2], LP[LP.length - 1]) : 0) }); }
    function card(r) { if (!msCard) { msCard = document.createElement('div'); msCard.className = 'ms-card'; mapView().parentElement.appendChild(msCard);
        msCard.addEventListener('click', e => { const k = e.target.dataset && e.target.dataset.k, map = A.map(); if (!k || !map || !MS) return; e.stopPropagation();
          if (k === 'undo') { if (MS.closed) MS.closed = false; else MS.pts.pop(); } if (k === 'clear') { MS.pts = []; MS.closed = false; } if (k === 'done') { mBtn.click(); return; } msDraw(map); }); }
      msCard.hidden = false;
      msCard.innerHTML = `<p class="ms-t">📏 Measuring</p>` + (!r ? `<p>Click on the map to place the first point.</p>`
        : r.closed ? `<p><b>${r.area.toLocaleString('en-US', { maximumFractionDigits: 1 })} m²</b> · ${(r.area / 1e4).toFixed(3)} ha</p><p>Perimeter <b>${fmtM(r.tot)}</b> · ${r.n} corners</p>`
        : `<p>Total <b>${fmtM(r.tot)}</b> · ${Math.max(0, r.n - 1)} segment${r.n === 2 ? '' : 's'}</p><p>${r.last ? `Next ${fmtM(r.last)} · bearing ${r.brg.toFixed(1)}°` : r.n > 1 ? `Bearing ${r.brg.toFixed(1)}°` : 'Click the next point.'}</p><p class="ms-h">${r.n > 2 ? 'Click the first point or double-click to close the shape.' : 'Click to add points.'}</p>`)
        + `<div><button type="button" data-k="undo">Undo</button><button type="button" data-k="clear">Clear</button><button type="button" data-k="done">Done</button></div>`; }
    // clicks on the map view, caught before the map sees them
    const onDown = e => { if (MS) msDown = [e.clientX, e.clientY]; };
    function onClick(e) { if (!MS) return; const map = A.map(); if (!map || !mapView().contains(e.target) || (msCard && msCard.contains(e.target))) return; e.stopPropagation(); e.preventDefault();
      if (msDown && Math.hypot(e.clientX - msDown[0], e.clientY - msDown[1]) > 4) return;   // that was a drag to pan
      const r = map.getCanvas().getBoundingClientRect(), pt = [e.clientX - r.left, e.clientY - r.top], ll = map.unproject(pt), q = [ll.lng, ll.lat];
      if (MS.closed) { MS.pts = []; MS.closed = false; }
      if (MS.pts.length > 2) { const a = map.project(MS.pts[0]); if (Math.hypot(a.x - pt[0], a.y - pt[1]) < 12) { MS.closed = true; msDraw(map); return; } }
      MS.pts.push(q); msDraw(map, q); }
    function onDbl(e) { if (!MS || !mapView().contains(e.target)) return; e.stopPropagation(); e.preventDefault(); const map = A.map();
      if (MS.pts.length > 1 && MS.pts.length > 2) { const a = MS.pts[MS.pts.length - 1], b = MS.pts[MS.pts.length - 2]; if (a[0] === b[0] && a[1] === b[1]) MS.pts.pop(); MS.closed = MS.pts.length > 2; } msDraw(map); }
    function onMove(e) { if (!MS || MS.closed || !MS.pts.length) return; const map = A.map(); if (!map || !mapView().contains(e.target)) return;
      const r = map.getCanvas().getBoundingClientRect(), ll = map.unproject([e.clientX - r.left, e.clientY - r.top]); msDraw(map, [ll.lng, ll.lat]); }
    A.dlg.addEventListener('mousedown', onDown, true); A.dlg.addEventListener('click', onClick, true); A.dlg.addEventListener('dblclick', onDbl, true); A.dlg.addEventListener('mousemove', onMove, true);
    mBtn.addEventListener('click', () => { const map = A.map(); if (!map) return; const on = !MS; mBtn.setAttribute('aria-pressed', on);
      mapView().classList.toggle('is-measuring', on); on ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();
      MS = on ? { pts: [], closed: false } : null; msDraw(map); hint(on ? 'Measuring: click points on the map. True metres on the ground; the map still pans by dragging.' : 'Measuring ended.'); });
    document.addEventListener('keydown', e => { if (!MS || A.dlg.hidden) return; if (e.key === 'Escape') mBtn.click(); if (e.key === 'Backspace' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); if (MS.closed) MS.closed = false; else MS.pts.pop(); msDraw(A.map()); } });

  }
})();
