// Al Wahda Mall basement, richer: real surface detail and a fuller car park around the two charging bays, plus Add car / Clear cars.
// Everything here is added to the project's own basement group, so it shows only on the Al Wahda Mall project.
(() => {
  const start = () => { const S = window.__twin, H = window.__twinAWM; if (!S || !S.api || !H) return; const A = S.api, T = A.T, AWM = H.AWM, E = AWM.env;
    const BW = 2.6, Z0 = 0.25, BL = 5.2, WALL = -0.75, CEIL = 3.3;
    let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const canvasTex = (w, h, draw, rep, srgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; };
    // soft value noise: random cells at several scales, each smoothed by drawing a small canvas large
    const noise = (c, w, h, oct, base, amp) => { c.fillStyle = `rgb(${base},${base},${base})`; c.fillRect(0, 0, w, h);
      oct.forEach(([n, a]) => { const s = document.createElement('canvas'); s.width = s.height = n; const g = s.getContext('2d'), im = g.createImageData(n, n);
        for (let i = 0; i < n * n; i++) { const v = 128 + (rnd() - 0.5) * 255 * a; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255 * amp; } g.putImageData(im, 0, 0);
        c.imageSmoothingEnabled = true; c.globalCompositeOperation = 'overlay'; c.drawImage(s, 0, 0, w, h); c.globalCompositeOperation = 'source-over'; }); };
    const find = (fn) => E.children.find(fn);
    const plane = (w, h) => o => o.isMesh && o.geometry.type === 'PlaneGeometry' && Math.abs(o.geometry.parameters.width - w) < 0.01 && Math.abs(o.geometry.parameters.height - h) < 0.01;

    // ---- 1. floor: sealed concrete that reads as a real basement slab: trowel variation, expansion joints every 5 m, and a satin sheen that varies ----
    const floor = find(o => plane(80, 80)(o) && o.position.y < 0.1);
    if (floor) { const m = floor.material;
      m.bumpMap = canvasTex(1024, 1024, (c, w, h) => { noise(c, w, h, [[8, 0.5], [32, 0.5], [128, 0.4], [512, 0.35]], 128, 0.6);
        c.strokeStyle = 'rgb(40,40,40)'; c.lineWidth = 5; c.strokeRect(0, 0, w, h); }, [16, 16]); m.bumpScale = 0.018;
      m.roughnessMap = canvasTex(1024, 1024, (c, w, h) => { noise(c, w, h, [[4, 0.8], [16, 0.6], [64, 0.4]], 140, 0.7); }, [16, 16]); m.roughness = 0.95; m.envMapIntensity = 0.9;
      m.color.set(0x55585b); m.needsUpdate = true; }

    // ---- 2. walls: fine plaster relief and the grime a basement wall collects near the floor ----
    E.children.filter(o => o.isMesh && o.geometry.type === 'PlaneGeometry' && Math.abs(o.geometry.parameters.height - CEIL) < 0.01 && o.material.map && o.material.color.getHex() === 0xece5d4 && Math.abs(o.geometry.parameters.width - 60) > 0.01)
      .forEach(o => { const m = o.material; m.bumpMap = canvasTex(512, 512, (c, w, h) => noise(c, w, h, [[16, 0.6], [64, 0.5], [256, 0.4]], 128, 0.6), [o.geometry.parameters.width / 2, 2]); m.bumpScale = 0.01; m.needsUpdate = true; });
    const grime = new T.MeshBasicMaterial({ map: canvasTex(16, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(40,34,26,0)'); g.addColorStop(0.75, 'rgba(40,34,26,.22)'); g.addColorStop(1, 'rgba(30,26,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false });
    const G = new T.Group(); E.add(G);
    // the back wall either side of the artwork keeps its original cream plaster, untouched (owner's choice)
    const LX = -BW - 1.3, gl = new T.Mesh(new T.PlaneGeometry(15, 0.7), grime); gl.rotation.y = Math.PI / 2; gl.position.set(LX + 0.003, 0.35, WALL + 7.5); G.add(gl);

    // ---- 3. ceiling: board-marked concrete soffit, downstand beams every 5.2 m, and linear LED fittings ----
    const ceil = find(o => plane(80, 80)(o) && o.position.y > 3);
    const conc = new T.MeshStandardMaterial({ color: 0x9a9894, roughness: 0.92, bumpMap: canvasTex(512, 512, (c, w, h) => { noise(c, w, h, [[16, 0.6], [64, 0.5], [256, 0.5]], 128, 0.6);
      c.strokeStyle = 'rgba(70,70,70,.16)'; c.lineWidth = 2; for (let y = 0; y < h; y += h / 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }, [20, 20]), bumpScale: 0.012 });
    if (ceil) { ceil.material = conc.clone(); ceil.material.bumpMap = conc.bumpMap; }
    for (let k = 0; k < 4; k++) { const z = WALL + 0.25 + k * 5.2; const b = new T.Mesh(new T.BoxGeometry(60, 0.5, 0.4), conc); b.position.set(0, CEIL - 0.25, z); b.receiveShadow = true; G.add(b); }
    const tubeM = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); tubeM.color.setScalar(1.6); const FIT = [];
    const housing = new T.MeshStandardMaterial({ color: 0xd9d9d6, roughness: 0.5, metalness: 0.3 });
    for (const z of [2.0, 7.2, 12.4]) for (const x of [-7.8, -3.9, 0, 3.9, 7.8]) { if (z === 2.0 && Math.abs(x) < 3) continue;
      const hs = new T.Mesh(new T.BoxGeometry(1.5, 0.06, 0.12), housing); hs.position.set(x, CEIL - 0.06, z); G.add(hs);
      const tb = new T.Mesh(new T.BoxGeometry(1.42, 0.02, 0.06), tubeM); tb.position.set(x, CEIL - 0.1, z); G.add(tb); FIT.push([x, z]); }

    // ---- 4. structure: concrete columns either side of the charging bays, with the car park's blue banding and a corner guard ----
    const colM = new T.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.85, bumpMap: conc.bumpMap, bumpScale: 0.008 });
    const bandM = new T.MeshStandardMaterial({ color: 0x2c4f9c, roughness: 0.7 }), guardM = new T.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 }), blackM = new T.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.7 });
    for (const x of [-(3 * BW + 0.95), 3 * BW + 0.95]) { const z = WALL + 0.35;   // the two beside the charging wall were taken out (owner's choice)
      const c = new T.Mesh(new T.BoxGeometry(0.5, CEIL, 0.6), colM); c.position.set(x, CEIL / 2, z); c.castShadow = c.receiveShadow = true; G.add(c);
      for (const y of [1.72, 2.02]) { const b = new T.Mesh(new T.BoxGeometry(0.512, 0.14, 0.612), bandM); b.position.set(x, y, z); G.add(b); }
      for (let i = 0; i < 6; i++) { const s = new T.Mesh(new T.BoxGeometry(0.52, 0.12, 0.62), i % 2 ? blackM : guardM); s.position.set(x, 0.06 + i * 0.12, z); G.add(s); } }

    // ---- 5. neighbouring bays (ordinary parking) either side, so the charging bays sit in a real row ----
    const lineM = new T.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.6 });
    const xs = [-3 * BW / 2 - 0.65, -5 * BW / 2 - 0.65, 3 * BW / 2 + 0.65, 5 * BW / 2 + 0.65];   // bay centres beside the columns
    xs.forEach(x => [x - BW / 2, x + BW / 2].forEach(xl => { const l = new T.Mesh(new T.PlaneGeometry(0.1, BL), lineM); l.rotation.x = -Math.PI / 2; l.position.set(xl, 0.003, Z0 + BL / 2); l.receiveShadow = true; G.add(l); }));
    const stainM = new T.MeshBasicMaterial({ map: canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 14; i++) { const x = w / 2 + (rnd() - 0.5) * w * 0.5, y = h / 2 + (rnd() - 0.5) * h * 0.4, r = 10 + rnd() * 40;
        const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(15,15,15,.28)'); g.addColorStop(1, 'rgba(15,15,15,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } }), transparent: true, depthWrite: false });
    xs.forEach(x => { const s = new T.Mesh(new T.PlaneGeometry(1.6, 2.2), stainM); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.004, Z0 + BL * 0.62); G.add(s); });
    // tyre marks along the driving lane
    const tyre = new T.MeshBasicMaterial({ map: canvasTex(512, 128, (c, w, h) => { c.strokeStyle = 'rgba(20,20,20,.16)'; c.lineCap = 'round';
        for (let i = 0; i < 26; i++) { c.lineWidth = 6 + rnd() * 10; const y0 = h * (0.2 + rnd() * 0.6); c.beginPath(); c.moveTo(0, y0); c.bezierCurveTo(w * 0.3, y0 + (rnd() - 0.5) * 40, w * 0.7, y0 + (rnd() - 0.5) * 40, w, y0 + (rnd() - 0.5) * 30); c.stroke(); } }), transparent: true, depthWrite: false });
    const ty = new T.Mesh(new T.PlaneGeometry(26, 5), tyre); ty.rotation.x = -Math.PI / 2; ty.position.set(0, 0.0045, Z0 + BL + 3.2); G.add(ty);

    // ---- 5b. the ChargePoint logo on the black wall, centred above the screen (screen top 1.75 m, header line from 2.33 m) ----
    { const LW = 1.4, LH = LW * 512 / 2048, cv = document.createElement('canvas'); cv.width = 2048; cv.height = 512; const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
      const lm = new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });
      const lg = new T.Mesh(new T.PlaneGeometry(LW, LH), lm); lg.position.set(0, 2.04, WALL + 0.012); lg.renderOrder = 3; G.add(lg);
      const paint = () => { const P = H.logo && H.logo(); if (!P || !P.mark || !P.word) { setTimeout(paint, 200); return; } const c = cv.getContext('2d'); c.clearRect(0, 0, 2048, 512);
        let mh = 300, wh = 120, gap = 60; const mr = P.mark.width / P.mark.height, wr = P.word.width / P.word.height, k = Math.min(1, 1880 / (mh * mr + gap + wh * wr)); mh *= k; wh *= k; gap *= k;   // fit inside the panel
        const mw = mh * mr, ww = wh * wr, x0 = 1024 - (mw + gap + ww) / 2, cy = 256;
        // printed on the wall, not lit (owner): no glow, a touch below full white
        c.globalAlpha = 0.88; c.drawImage(P.mark, x0, cy - mh / 2, mw, mh); c.drawImage(P.word, x0 + mw + gap, cy - wh / 2, ww, wh); c.globalAlpha = 1; tex.needsUpdate = true; A.draw(); };
      paint(); }

    // ---- 6. cars: Add car fills the charging bays first (01, 02), then the bays beside them; Clear cars empties them ----
    const slots = [[-BW / 2, 'EV bay 01'], [BW / 2, 'EV bay 02'], [xs[0], 'bay'], [xs[2], 'bay'], [xs[1], 'bay'], [xs[3], 'bay']];
    const cars = [];
    // one car (the model's group holds two): the parent of a 'Sketchfab_Scene' node that is not one of the cars added here
    const mine = o => { for (let x = o; x; x = x.parent) if (cars.includes(x)) return true; return false; };
    const source = () => { let r = null; A.scene.traverse(o => { if (!r && o.name === 'Sketchfab_Scene' && !mine(o)) r = o; }); return r && r.parent; };
    // measured from the body and the wheels only (a door part of the model has a misleading box)
    const boxOf = (c, re) => { const b = new T.Box3(); c.updateMatrixWorld(true); c.traverse(o => { if (o.isMesh && re.test(o.name)) b.expandByObject(o); }); return b; };
    const cloneSafe = src => { const keep = []; src.traverse(o => { keep.push(o.userData); o.userData = {}; }); let c; try { c = src.clone(true); } finally { let i = 0; src.traverse(o => { o.userData = keep[i++]; }); } return c; };
    const tint = [0xf2f2f2, 0x1c1c1e, 0x8e9196, 0x2b3f5c, 0x6e1d1d, 0xcfc8b8];
    function addCar() { const k = cars.length; if (k >= slots.length) { A.say('All six bays have a car. Clear cars to start again.'); return; }
      const src = source(); if (!src) { A.say('The car model is still loading. Try again in a moment.'); return; }
      const c = cloneSafe(src); c.visible = true; c.traverse(o => { o.visible = true; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // colour: cars after the first two take a different paint, so the row does not look copied
      if (k >= 1) c.traverse(o => { if (o.isMesh && o.material && o.material.color && /body_primary/.test(o.name)) { o.material = o.material.clone(); o.material.color.setHex(tint[k % tint.length]); } });
      c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); E.add(c); c.updateMatrixWorld(true);
      const body = boxOf(c, /body_primary/), sz = body.getSize(new T.Vector3());
      c.rotation.y = sz.x > sz.z ? Math.PI / 2 : 0; c.updateMatrixWorld(true);   // length along the bay
      // measured in the basement's own coordinates (the group sits off the scene centre), then the rear is backed up 0.3 m from the head of the bay
      const o0 = E.getWorldPosition(new T.Vector3()), b2 = boxOf(c, /body_primary/).translate(o0.clone().negate()), wh = boxOf(c, /wheels/).translate(o0.clone().negate()), c2 = b2.getCenter(new T.Vector3());
      const [x] = slots[k]; c.position.set(x - c2.x, -(wh.isEmpty() ? b2.min.y : wh.min.y), Z0 + 0.3 - b2.min.z);
      cars.push(c); A.draw(); A.say(`Car parked in ${slots[k][1] === 'bay' ? 'the next bay' : slots[k][1]}. ${cars.length} of ${slots.length}.`); }
    function clearCars() { cars.splice(0).forEach(c => E.remove(c)); A.draw(); A.say('Cars cleared.'); }

    // ---- 7. night: the general light goes down and the basement is lit by its own fittings: a soft pool under each LED fitting,
    //      warm lamps over the bays, and the screen, the charger lights and the brand lines carry the wall ----
    const NL = FIT.filter(([x, z]) => Math.abs(x) < 8.5 && z < 10).map(([x, z]) => { const L = new T.PointLight(0xf4f8ff, 0, 7.5, 2); L.position.set(x, CEIL - 0.25, z); G.add(L); return L; });
    const NIGHT = { on: false, keep: null };
    let hemi = null; A.scene.traverse(o => { if (!hemi && o.isHemisphereLight) hemi = o; });
    const applyNight = () => { if (!NIGHT.on || !H.isOn()) return; const sun = A.sun;
      if (sun && sun.intensity !== 0.04) sun.intensity = 0.04; if (hemi && hemi.intensity !== 0.06) hemi.intensity = 0.06;
      AWM.lights.forEach(L => { L.intensity = L.userData.on * 3; }); NL.forEach(L => { L.intensity = 2.4; });
      if (A.scene.environment) { NIGHT.env = A.scene.environment; A.scene.environment = null; }   // no ambient reflection light at night
      A.renderer.toneMappingExposure = 1.0; if (A.scene.background && A.scene.background.isColor) A.scene.background.setHex(0x060708); if (A.scene.fog) A.scene.fog.color.setHex(0x060708); tubeM.color.setScalar(2.4); };
    function setNight(on) { NIGHT.on = on; const sun = A.sun;
      if (on) { NIGHT.keep = { sun: sun ? sun.intensity : null, hemi: hemi ? hemi.intensity : null, exp: A.renderer.toneMappingExposure, bg: A.scene.background && A.scene.background.isColor ? A.scene.background.getHex() : null, fog: A.scene.fog ? A.scene.fog.color.getHex() : null }; applyNight(); }
      else { const k = NIGHT.keep || {}; if (NIGHT.env && !A.scene.environment) A.scene.environment = NIGHT.env; if (sun && k.sun !== null) sun.intensity = k.sun; if (hemi && k.hemi !== null) hemi.intensity = k.hemi; if (k.exp) A.renderer.toneMappingExposure = k.exp;
        if (k.bg !== null && A.scene.background && A.scene.background.isColor) A.scene.background.setHex(k.bg); if (k.fog !== null && A.scene.fog) A.scene.fog.color.setHex(k.fog);
        AWM.lights.forEach(L => { L.intensity = L.userData.on; }); NL.forEach(L => { L.intensity = 0; }); tubeM.color.setScalar(1.6); }
      bNight.textContent = on ? '☀️ Day' : '🌙 Night'; A.draw(); A.say(on ? 'Night: the basement is lit only by its fittings, the screen and the charger lights.' : 'Day lighting.'); }
    // other parts of the app reset the lights when the view changes; night is kept while it is on
    setInterval(() => { if (NIGHT.on && H.isOn()) { applyNight(); A.draw(); } else if (NIGHT.on && !H.isOn()) { NL.forEach(L => { L.intensity = 0; }); if (NIGHT.env && !A.scene.environment) A.scene.environment = NIGHT.env; } }, 700);

    // ---- 8. proposal for this project: the same house proposal as the site planner, filled from the project, with renders from this scene ----
    //      Only what the project shows is filled in (2 bays, 2 wall chargers at 22 kW Type 2, basement, Abu Dhabi so TAQA); everything else stays TBD.
    const tbd = x => (x && String(x).trim()) ? String(x).trim() : 'TBD', numOr = x => x ? parseFloat(x) : 'TBD';
    const PJ = window.__twinProject = { active: false,
      intake: v => ({ version: '0.1', date: new Date().toISOString().slice(0, 10), prepared_by: tbd(v.prepared_by), client_name: v.client_name.trim(), client_contact: tbd(v.client_contact),
        location: (v.location || '').trim() || 'Al Wahda Mall, Abu Dhabi', site_type: v.site_type, available_load_kw: numOr(v.available_load_kw),
        indoor_outdoor: v.indoor_outdoor, public_private: v.public_private, solar_shade: 'no', grid_connection: v.grid_connection, civil_work: v.civil_work,
        utility_approval: v.utility_approval, site_visualisation: 'yes', commercial_model: v.commercial_model,
        chargers: [{ type: 'AC', power_kw: 22, sockets: 1, units: 2, mounting: 'Wall mounted, one at the head of each bay, on the branded feature wall' }],
        bays_total: 'TBD', bays_ev: 2, tariff_aed_per_kwh: numOr(v.tariff_aed_per_kwh), term_years: numOr(v.term_years), host_revenue_share_pct: numOr(v.host_revenue_share_pct),
        capex_aed: 'TBD', implementation_weeks: numOr(v.implementation_weeks), validity_days: 30,
        visuals: ['site-cover-4k.jpg', 'site-layout-4k.jpg', 'site-drivers-view-4k.jpg'],
        site: { lat: 'TBD', lon: 'TBD', canopies: [], battery_kwh: 0, solar_panels: 0, parking_area: 'Basement car park, Al Wahda Mall' },
        project: { name: 'Al Wahda Mall', equipment: '2 × AC 22 kW wall chargers, Type 2, one per bay',
          solution: 'Two wall mounted AC chargers, 22 kW Type 2 each, one at the head of each bay. They sit on a branded feature wall with a shared live status screen between them, the ChargePoint logo above it, and repainted bays with bay numbers. No canopy or solar is needed in the basement.',
          summary: 'In the basement car park of Al Wahda Mall, two bays become a branded ChargePoint charging point, shown here in a model drawn from a site photo.',
          investment: 'ChargePoint funds the wall chargers, installation, the shared status screen, branding and O&M' },
        notes: 'Generated by the ChargePoint Digital Twin from the Al Wahda Mall project. Every TBD is a value Hany has not confirmed.' }),
      // three 4K views of this scene: as framed now (cover), from above (layout), and from the driving lane (arrival)
      shoot: async () => { const cam = A.camera, ctl = A.controls, keep = { p: cam.position.clone(), t: ctl.target.clone(), fov: cam.fov }, out = {};
        const g = H.groups().awm, c = g ? g.position.clone() : new T.Vector3(), go = (pos, look, fov) => { cam.position.copy(pos); ctl.target.copy(look); cam.fov = fov; cam.up.set(0, 1, 0); cam.lookAt(look); cam.updateProjectionMatrix(); };
        const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        out.cover = S.render4k();
        go(c.clone().add(new T.Vector3(0, 11, 4.2)), c.clone().add(new T.Vector3(0, 0, 2.2)), 40); await frame(); out.layout = S.render4k();
        go(c.clone().add(new T.Vector3(1.6, 1.55, 10.5)), c.clone().add(new T.Vector3(0, 1.3, -0.5)), 50); await frame(); out.eye = S.render4k();
        cam.position.copy(keep.p); ctl.target.copy(keep.t); cam.fov = keep.fov; cam.updateProjectionMatrix(); ctl.update(); A.draw(); return out; } };
    function openProposal() { if (!window.__twinProposalOpen || !S.render4k) { A.say('The proposal maker is still loading. Try again in a moment.'); return; }
      PJ.active = true; window.__twinProposalOpen({ location: 'Al Wahda Mall, Abu Dhabi', site_type: 'retail', indoor_outdoor: 'indoor', utility_approval: 'TAQA', grid_connection: 'TBD', civil_work: 'TBD' }); }

    // ---- the two buttons, shown on the Al Wahda Mall project only ----
    const st = document.createElement('style'); st.textContent = `.tw-awm-cars{position:fixed;left:20px;bottom:118px;z-index:20;display:flex;gap:8px}.tw-awm-cars[hidden]{display:none}
.tw-awm-cars button{appearance:none;border:0;border-radius:999px;padding:9px 14px;font:600 13px var(--display,Helvetica);cursor:pointer;background:rgba(255,255,255,.92);color:#1d1d1f;box-shadow:0 4px 16px rgba(0,0,0,.18)}
.tw-awm-cars button:first-child{background:linear-gradient(135deg,#3BA9E0,#8DC63F);color:#fff}.tw-awm-cars .tw-awm-night{background:#1d1d1f;color:#fff}`; document.head.appendChild(st);
    const bar = document.createElement('div'); bar.className = 'tw-awm-cars'; bar.hidden = true;
    bar.innerHTML = '<button type="button" title="Park a car in the next free bay: the charging bays first">🚗 Add car</button><button type="button" title="Remove the cars you added">Clear cars</button><button type="button" class="tw-awm-night" title="See the basement at night, lit only by its own fittings">🌙 Night</button><button type="button" class="tw-awm-prop" title="Make the ChargePoint proposal for this project, with 4K renders from this scene">📄 Create proposal</button>';
    document.body.appendChild(bar); const [bAdd, bClr, bNight] = bar.querySelectorAll('button'); bAdd.addEventListener('click', addCar); bClr.addEventListener('click', clearCars); bNight.addEventListener('click', () => setNight(!NIGHT.on)); bar.querySelector('.tw-awm-prop').addEventListener('click', openProposal);
    setInterval(() => { const on = H.isOn() && !S.on; if (bar.hidden === on) bar.hidden = !on; }, 500);
    A.draw(); };
  if (window.__twin && window.__twin.api) start(); else document.addEventListener('twin-ready', start, { once: true });
})();
