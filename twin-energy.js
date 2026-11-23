/* ChargePoint Digital Twin · Energy Twin
   A 24-hour simulation of the station on its real site: the real sun crosses the sky and moves the shadows, solar output follows it,
   cars arrive and leave, energy streams from the roof into each car (green from the sun, blue from the grid), and the battery columns
   absorb the midday surplus and shave the evening peak. Every assumption is on screen and adjustable. A simulation, not measured data. */
(() => {
  const start = () => { const S = window.__twin; if (S && S.api) init(S); };
  if (window.__twin) start(); else document.addEventListener('twin-ready', start, { once: true });

  function init(S) {
    const { T, scene, draw, sunPos, RAD, bar, stage, LV, setLive, applyLive } = S.api;
    const STEPS = 96, DT = 0.25;                                   // 15-minute steps
    const PROFILES = {
      retail: [5, 3, 2, 2, 2, 3, 8, 15, 25, 40, 55, 70, 80, 80, 75, 70, 75, 85, 95, 100, 95, 75, 45, 20],
      workplace: [2, 2, 2, 2, 3, 10, 35, 85, 100, 95, 90, 85, 80, 85, 85, 80, 60, 35, 15, 8, 5, 4, 3, 2],
      residential: [85, 90, 90, 90, 85, 70, 50, 30, 20, 15, 15, 15, 15, 15, 20, 25, 35, 55, 75, 90, 100, 100, 95, 90],
      highway: [15, 10, 8, 6, 8, 15, 35, 60, 75, 70, 65, 70, 80, 75, 70, 75, 85, 95, 100, 90, 75, 55, 35, 20] };
    const STAY = { retail: [1.5, 0.75], workplace: [6, 2], residential: [9, 3], highway: [0.6, 0.3] };   // hours: mean, spread
    const A = { site: 'retail', busy: 1, pr: 0.8, acKw: 11, dcKw: 90, needAc: 20, needDc: 35, eff: 0.21, grid: null, co2: 0.4 };
    const PANEL_M2 = 2.382 * 1.131, PER_BAY_PANELS = 6, BAT_PER_BAY = 45;

    // ---- interface ----
    const row = bar.querySelector('.tw-sb-main'), btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tw-energy-btn'; btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Energy Twin';
    btn.title = 'Simulate a full day at this site: sun, shadows, solar, cars, batteries and the grid';
    row.insertBefore(btn, row.querySelector('.tw-prop'));
    const P = document.createElement('div'); P.className = 'tw-energy'; P.hidden = true; P.setAttribute('role', 'region'); P.setAttribute('aria-label', 'Energy Twin');
    P.innerHTML = `
      <div class="te-head"><div><b>Energy Twin</b><span>A day at this site, simulated</span></div><button type="button" class="te-x" aria-label="Close the Energy Twin">×</button></div>
      <div class="te-clock"><button type="button" class="te-play" aria-label="Play the day">▶</button><output class="te-time">12:00</output>
        <input class="te-slider" type="range" min="0" max="${STEPS - 1}" step="0.01" value="48" aria-label="Time of day"><button type="button" class="te-now">Now</button></div>
      <canvas class="te-chart" width="1040" height="220" aria-label="Solar, charging demand and grid power over the day"></canvas>
      <div class="te-legend"><span class="s">Solar</span><span class="d">Charging</span><span class="g">Grid</span><span class="b">Battery</span></div>
      <div class="te-kpis"></div>
      <details class="te-set"><summary>Assumptions</summary>
        <label>Site pattern <select class="te-site"><option value="retail">Retail / mall</option><option value="workplace">Workplace</option><option value="residential">Residential</option><option value="highway">Highway / fleet</option></select></label>
        <label>Busy <input class="te-busy" type="range" min="0.4" max="1.6" step="0.05" value="1"><output class="te-busyv">100%</output></label>
        <label>Grid limit <input class="te-grid" type="range" min="0" max="100" step="1"><output class="te-gridv"></output></label>
        <p>AC ${A.acKw} kW per car, DC ${A.dcKw} kW per car, ${A.needAc} kWh (AC) or ${A.needDc} kWh (DC) per visit, solar modules ${Math.round(A.eff * 100)}% efficient with ${Math.round(A.pr * 100)}% system performance (heat, dust, inverter), ${BAT_PER_BAY} kWh battery per bay, grid ${A.co2} kg CO₂ per kWh. Clear-sky solar adjusted for today's cloud. A simulation with these stated assumptions, not measured data.</p>
      </details>`;
    stage.appendChild(P);
    const $ = s => P.querySelector(s);
    const chart = $('.te-chart'), g = chart.getContext('2d');

    // ---- the day, simulated ----
    let SIM = null, t = 48, playing = false, last = 0, open = false, VIS = []; const VISUSED = new Set();   // VIS: car model index → socket index
    const seeded = n => { let x = n * 9301 + 49297; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
    function simulate() {
      const SOCK = { main: ['ac', 4], ac: ['ac', 2], dc: ['dc', 4], single: [null, 0] }, slots = [];
      (S.list || []).forEach(k => { const [kind, n2] = SOCK[k] || [null, 0]; for (let q = 0; q < n2; q++) slots.push({ kind }); });
      VIS = (S.carSlots || []).map(c => { const k = slots.findIndex((x, i) => x.kind === c.kind && !VISUSED.has(i)); if (k >= 0) VISUSED.add(k); return k; }); VISUSED.clear();
      const n = slots.length, bays = S.spots || n, day = siteMidnight();
      const cloud = LV.wx ? LV.wx.cloud / 100 : 0, area = bays * PER_BAY_PANELS * PANEL_M2, cap = bays * BAT_PER_BAY;
      const peakKw = slots.reduce((a, s) => a + (s.kind === 'dc' ? A.dcKw : A.acKw), 0) || 1;
      if (A.grid === null || A.grid > peakKw) A.grid = Math.max(11, Math.round(peakKw * 0.35));
      const prof = PROFILES[A.site], stay = STAY[A.site], rnd = seeded(n * 31 + Math.round(A.busy * 100) + A.site.length);
      const occ = [], chg = [], sol = [], dem = [], grid = [], soc = [], dis = [], noBat = [];
      const st = slots.map(() => ({ left: 0, need: 0 }));
      let b = cap * 0.5, solarInBat = cap * 0.25, delivered = 0, solarUsed = 0, sessions = 0, unserved = 0;
      for (let i = 0; i < STEPS; i++) {
        const when = new Date(day.valueOf() + i * DT * 3600e3 + DT * 1800e3), h = Math.floor(i * DT), p = prof[h] / 100 * A.busy;
        const sp = sunPos(when, S.lat, S.lon), ghi = sp.alt > 0 ? 1050 * Math.pow(Math.sin(sp.alt), 1.15) * (1 - 0.75 * Math.pow(cloud, 3.4)) : 0;
        const pv = area * A.eff * ghi / 1000 * A.pr;   // performance ratio: heat, dust, wiring and inverter losses
        const o = [], c = []; let D = 0;
        slots.forEach((s, k) => { const q = st[k];
          if (q.left <= 0 && rnd() < Math.min(0.9, p * (s.kind === 'dc' ? 0.6 : 0.35))) {
            q.left = Math.max(0.25, stay[0] + (rnd() * 2 - 1) * stay[1]) * (s.kind === 'dc' ? 0.5 : 1);
            q.need = (s.kind === 'dc' ? A.needDc : A.needAc) * (0.6 + rnd() * 0.8); sessions++; }
          const here = q.left > 0, kw = here && q.need > 0 ? Math.min(s.kind === 'dc' ? A.dcKw : A.acKw, q.need / DT) : 0;
          if (here) { q.left -= DT; q.need -= kw * DT; } o.push(here); c.push(kw); D += kw; });
        // dispatch: sun first, battery stores the surplus and covers anything above the grid limit, quiet hours top the battery up
        let net = D - pv, gr = 0, d = 0;
        if (net <= 0) { const room = (cap * 0.95 - b) / DT, ch = Math.max(0, Math.min(-net, room, cap * 0.5)); b += ch * DT * 0.95; solarInBat += ch * DT * 0.95; }
        else { gr = Math.min(net, A.grid); const short = net - gr; d = Math.max(0, Math.min(short, (b - cap * 0.1) / DT, cap * 0.5));
          const frac = b > 0 ? solarInBat / b : 0; b -= d * DT; solarInBat = Math.max(0, solarInBat - d * DT * frac); solarUsed += d * DT * frac; unserved += (short - d) * DT; }
        if (h < 6 && b < cap * 0.6 && gr < A.grid) { const top = Math.min(A.grid - gr, (cap * 0.6 - b) / DT, cap * 0.25); gr += top; b += top * DT * 0.95; }
        solarUsed += Math.min(pv, D) * DT; delivered += Math.min(D, pv + A.grid + d) * DT;
        occ.push(o); chg.push(c); sol.push(pv); dem.push(D); grid.push(gr); soc.push(cap ? b / cap : 0); dis.push(d); noBat.push(Math.max(0, net));
      }
      SIM = { n, cap, peakKw, occ, chg, sol, dem, grid, soc, dis, delivered, solarUsed, sessions, unserved,
        gridPeak: Math.max(...grid), noBatPeak: Math.max(...noBat), day, maxY: Math.max(1, ...dem, ...sol, ...grid) * 1.1 };
      $('.te-grid').max = Math.round(peakKw); $('.te-grid').value = A.grid; $('.te-gridv').textContent = `${A.grid} kW`;
      kpis(); paint();
    }
    const f0 = v => Math.round(v).toLocaleString('en-US');
    function kpis() { if (!SIM) return; const i = Math.floor(t), share = SIM.delivered ? SIM.solarUsed / SIM.delivered : 0, carsNow = SIM.chg[i].filter(k => k > 0).length;
      $('.te-kpis').innerHTML = [
        ['Delivered today', `${f0(SIM.delivered)} kWh`, `${SIM.sessions} charging visits`],
        ['From the sun', `${Math.round(share * 100)}%`, `${f0(SIM.solarUsed)} kWh solar used`],
        ['Grid peak', `${f0(SIM.gridPeak)} kW`, `${f0(SIM.noBatPeak)} kW without batteries`],
        ['CO₂ avoided', `${f0(SIM.solarUsed * A.co2)} kg`, 'solar energy, today'],
        ['Now', `${carsNow}/${SIM.n} sockets charging`, `solar ${f0(SIM.sol[i])} kW · grid ${f0(SIM.grid[i])} kW`],
        ['Battery', `${Math.round(SIM.soc[i] * 100)}%`, `${f0(SIM.cap)} kWh across the columns`]]
        .map(([a, b, c]) => `<div><span>${a}</span><b>${b}</b><em>${c}</em></div>`).join(''); }
    function paint() { if (!SIM) return; const W = chart.width, H = chart.height, pad = 18, x = i => pad + (W - 2 * pad) * i / (STEPS - 1), y = v => H - pad - (H - 2 * pad) * v / SIM.maxY;
      g.clearRect(0, 0, W, H); g.font = '20px Helvetica Neue, Helvetica, Arial'; g.fillStyle = 'rgba(255,255,255,.35)';
      [0, 6, 12, 18, 24].forEach(hh => { const xx = x(Math.min(STEPS - 1, hh * 4)); g.fillRect(xx, pad, 1, H - 2 * pad); g.fillText(String(hh).padStart(2, '0'), xx + 4, H - 2); });
      const area = (arr, col) => { g.beginPath(); g.moveTo(x(0), y(0)); arr.forEach((v, i) => g.lineTo(x(i), y(v))); g.lineTo(x(STEPS - 1), y(0)); g.closePath(); g.fillStyle = col; g.fill(); };
      const line = (arr, col, w, dash) => { g.beginPath(); arr.forEach((v, i) => i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))); g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); };
      const gr = g.createLinearGradient(0, pad, 0, H); gr.addColorStop(0, 'rgba(141,198,63,.65)'); gr.addColorStop(1, 'rgba(141,198,63,.05)'); area(SIM.sol, gr);
      line(SIM.dem, '#3BA9E0', 3); line(SIM.grid, '#ffffff', 2, [8, 6]); line(SIM.soc.map(v => v * SIM.maxY), '#ffb84d', 2, [2, 5]);
      const cx = x(t); g.fillStyle = '#fff'; g.fillRect(cx - 1, pad, 2, H - 2 * pad); g.beginPath(); g.arc(cx, y(SIM.dem[Math.floor(t)]), 6, 0, 7); g.fill(); }

    // ---- energy streams: particles flow from the roof into every charging car ----
    const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'), r = q.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.65)'); r.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = r; q.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
    const PER = 30; let pts = null, seeds = [];
    function buildParticles() { if (pts) { scene.remove(pts); pts.geometry.dispose(); } const n = (S.carSlots || []).length * PER, geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(n * 3), 3));
      pts = new T.Points(geo, new T.PointsMaterial({ size: 0.75, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false }));
      pts.frustumCulled = false; pts.renderOrder = 15; scene.add(pts); seeds = Array.from({ length: n }, (_, k) => [((k * 0.6180339) % 1), (k * 0.37) % 1, ((k * 7.13) % 1) - 0.5]); }
    const GREEN = new T.Color(0x8DC63F), BLUE = new T.Color(0x3BA9E0), tmp = new T.Vector3();
    function flow(now) { if (!pts || !SIM) return; const i = Math.floor(t), pos = pts.geometry.attributes.position, col = pts.geometry.attributes.color;
      const solarFrac = SIM.dem[i] > 0 ? Math.min(1, (Math.min(SIM.sol[i], SIM.dem[i]) + SIM.dis[i] * 0.7) / SIM.dem[i]) : 0;
      (S.carSlots || []).forEach((s, k) => { const on = VIS[k] >= 0 && SIM.chg[i][VIS[k]] > 0; s.car.getWorldPosition(tmp);
        for (let j = 0; j < PER; j++) { const id = k * PER + j, sd = seeds[id], u = (sd[0] + now / 1400 * (0.8 + sd[1] * 0.5)) % 1;
          if (!on) { pos.setXYZ(id, 0, -999, 0); continue; }
          const yy = 3.35 - u * 2.55, sway = Math.sin(u * Math.PI) * 0.55 * sd[2];
          pos.setXYZ(id, tmp.x + sway, yy, tmp.z + sway * 0.6); const c = sd[1] < solarFrac ? GREEN : BLUE, fade = Math.sin(u * Math.PI);
          col.setXYZ(id, c.r * fade, c.g * fade, c.b * fade); } });
      pos.needsUpdate = true; col.needsUpdate = true; }

    // ---- clock ----
    const label = () => { const m = Math.floor(t * DT * 60), hh = String(Math.floor(m / 60) % 24).padStart(2, '0'), mm = String(m % 60).padStart(2, '0'); return `${hh}:${mm}`; };
    function setT(v, fromUser) { t = ((v % STEPS) + STEPS) % STEPS; $('.te-slider').value = t; $('.te-time').textContent = label();
      if (SIM) { const i = Math.floor(t); (S.carSlots || []).forEach((s, k) => { s.car.visible = VIS[k] >= 0 ? SIM.occ[i][VIS[k]] : false; });
        LV.simDate = new Date(SIM.day.valueOf() + t * DT * 3600e3); applyLive(); kpis(); paint(); }
      if (fromUser) { playing = false; $('.te-play').textContent = '▶'; } draw(); }
    function loop(now) { if (!open) return; requestAnimationFrame(loop);
      if (playing) { const dt = Math.min(0.1, (now - (last || now)) / 1000); setT(t + dt * 2); } last = now; flow(now); }
    // the day runs on the site's local clock (UTC offset from the weather service, UAE time until it answers)
    const offMs = () => ((LV.wx && LV.wx.off != null) ? LV.wx.off : 14400) * 1000, DAY = 864e5;
    function siteMidnight() { const now = Date.now(); return new Date(Math.floor((now + offMs()) / DAY) * DAY - offMs()); }
    function nowStep() { return ((Date.now() + offMs()) % DAY) / 900e3; }

    function openTwin() { if (!S.on || !(S.carSlots || []).length) { S.api.say('Build a site first, then open the Energy Twin.'); return; }
      open = true; P.hidden = false; btn.setAttribute('aria-pressed', 'true'); stage.classList.add('is-energy');
      if (!LV.on) setLive(true); buildParticles(); simulate(); setT(nowStep()); playing = true; $('.te-play').textContent = '❚❚'; last = 0; requestAnimationFrame(loop); }
    function closeTwin() { open = false; playing = false; P.hidden = true; btn.setAttribute('aria-pressed', 'false'); stage.classList.remove('is-energy');
      if (pts) { scene.remove(pts); pts.geometry.dispose(); pts = null; }
      (S.carSlots || []).forEach(s => { s.car.visible = true; }); LV.simDate = null; if (S.on) applyLive(); draw(); }
    btn.addEventListener('click', () => (open ? closeTwin() : openTwin()));
    $('.te-x').addEventListener('click', closeTwin);
    $('.te-play').addEventListener('click', () => { playing = !playing; $('.te-play').textContent = playing ? '❚❚' : '▶'; last = 0; });
    $('.te-now').addEventListener('click', () => setT(nowStep(), true));
    $('.te-slider').addEventListener('input', e => setT(+e.target.value, true));
    $('.te-site').addEventListener('change', e => { A.site = e.target.value; simulate(); setT(t); });
    $('.te-busy').addEventListener('input', e => { A.busy = +e.target.value; $('.te-busyv').textContent = `${Math.round(A.busy * 100)}%`; simulate(); setT(t); });
    $('.te-grid').addEventListener('input', e => { A.grid = +e.target.value; $('.te-gridv').textContent = `${A.grid} kW`; simulate(); setT(t); });
    // the site changes (new build, leaving) close the twin
    bar.querySelector('.tw-leave').addEventListener('click', () => { if (open) closeTwin(); });
    const mo = new MutationObserver(() => { if (open && (!S.on || bar.hidden)) closeTwin(); }); mo.observe(bar, { attributes: true, attributeFilter: ['hidden'] });
    S.energy = { open: openTwin, close: closeTwin };
  }
})();
