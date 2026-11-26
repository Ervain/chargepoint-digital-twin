// Al Wahda Mall basement, richer: real surface detail and a fuller car park around the two charging bays, plus Add car / Clear cars.
// Everything here is added to the project's own basement group, so it shows only on the Al Wahda Mall project.
(() => {
  // scanned textures (Poly Haven, CC0) sit next to this file; its own address gives the folder and the version query
  const ME = (document.currentScript && document.currentScript.src) || '', BASE = ME.replace(/twin-awm\.js(\?.*)?$/, ''), VQ = (ME.match(/\?.*$/) || [''])[0];
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
    const ptex = (name, srgb, rx, ry) => { const t = new T.TextureLoader().load(BASE + name + VQ, () => A.draw()); if (srgb) t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
    const PH = (kind, rx, ry) => ({ map: ptex(`awm_${kind}_map.jpg`, true, rx, ry), normalMap: ptex(`awm_${kind}_nor.jpg`, false, rx, ry), roughnessMap: ptex(`awm_${kind}_rough.jpg`, false, rx, ry) });
    const plane = (w, h) => o => o.isMesh && o.geometry.type === 'PlaneGeometry' && Math.abs(o.geometry.parameters.width - w) < 0.01 && Math.abs(o.geometry.parameters.height - h) < 0.01;

    // ---- 1. floor: a scanned car park slab ("Garage Floor", Poly Haven, CC0), tiled every 2.7 m and tinted to a neutral grey, with its real relief and satin sheen ----
    const floor = find(o => plane(80, 80)(o) && o.position.y < 0.1);
    if (floor) { const m = floor.material, P = PH('floor', 30, 30);
      m.map = P.map; m.normalMap = P.normalMap; m.normalScale = new T.Vector2(0.8, 0.8); m.roughnessMap = P.roughnessMap; m.bumpMap = null;
      m.roughness = 1; m.metalness = 0.02; m.envMapIntensity = 0.9; m.color.setRGB(0.40, 0.43, 0.51); m.needsUpdate = true; }

    // ---- 2. walls: fine plaster relief and the grime a basement wall collects near the floor ----
    E.children.filter(o => o.isMesh && o.geometry.type === 'PlaneGeometry' && Math.abs(o.geometry.parameters.height - CEIL) < 0.01 && o.material.map && o.material.color.getHex() === 0xece5d4 && Math.abs(o.geometry.parameters.width - 60) > 0.01)
      .forEach(o => { const m = o.material, P = PH('wall', o.geometry.parameters.width / 2.5, CEIL / 2.5);   // scanned plaster ("Plastered Wall 04", Poly Haven, CC0), cream kept
        m.map = P.map; m.normalMap = P.normalMap; m.normalScale = new T.Vector2(0.6, 0.6); m.roughnessMap = P.roughnessMap; m.roughness = 1; m.bumpMap = null; m.needsUpdate = true; });
    const grime = new T.MeshBasicMaterial({ map: canvasTex(16, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(40,34,26,0)'); g.addColorStop(0.75, 'rgba(40,34,26,.22)'); g.addColorStop(1, 'rgba(30,26,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false });
    const G = new T.Group(); E.add(G);
    // the back wall either side of the artwork keeps its original cream plaster, untouched (owner's choice)
    const LX = -BW - 1.3, gl = new T.Mesh(new T.PlaneGeometry(15, 0.7), grime); gl.rotation.y = Math.PI / 2; gl.position.set(LX + 0.003, 0.35, WALL + 7.5); G.add(gl);

    // ---- 3. ceiling: board-marked concrete soffit, downstand beams every 5.2 m, and linear LED fittings ----
    const ceil = find(o => plane(80, 80)(o) && o.position.y > 3);
    // board-formed concrete soffit and beams ("Concrete Slab Wall", Poly Haven, CC0)
    const conc = new T.MeshStandardMaterial(Object.assign({ color: 0xc9c7c2, roughness: 1, normalScale: new T.Vector2(0.7, 0.7) }, PH('ceil', 1, 1)));
    if (ceil) { const P = PH('ceil', 27, 27); ceil.material = new T.MeshStandardMaterial(Object.assign({ color: 0xc9c7c2, roughness: 1, normalScale: new T.Vector2(0.7, 0.7) }, P)); }
    for (let k = 0; k < 4; k++) { const z = WALL + 0.25 + k * 5.2; const bm = conc.clone(); ['map', 'normalMap', 'roughnessMap'].forEach(k => { bm[k] = conc[k].clone(); bm[k].needsUpdate = true; bm[k].repeat.set(20, 0.2); }); const b = new T.Mesh(new T.BoxGeometry(60, 0.5, 0.4), bm); b.position.set(0, CEIL - 0.25, z); b.receiveShadow = true; G.add(b); }
    const tubeM = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); tubeM.color.setScalar(1.6); const FIT = [];
    const housing = new T.MeshStandardMaterial({ color: 0xd9d9d6, roughness: 0.5, metalness: 0.3 });
    for (const z of [2.0, 7.2, 12.4]) for (const x of [-7.8, -3.9, 0, 3.9, 7.8]) { if (z === 2.0 && Math.abs(x) < 3) continue;
      const hs = new T.Mesh(new T.BoxGeometry(1.5, 0.06, 0.12), housing); hs.position.set(x, CEIL - 0.06, z); G.add(hs);
      const tb = new T.Mesh(new T.BoxGeometry(1.42, 0.02, 0.06), tubeM); tb.position.set(x, CEIL - 0.1, z); G.add(tb); FIT.push([x, z]); }

    // ---- 4. structure: concrete columns either side of the charging bays, with the car park's blue banding and a corner guard ----
    const colM = new T.MeshStandardMaterial(Object.assign({ color: 0xe9e4d8, roughness: 1, normalScale: new T.Vector2(0.5, 0.5) }, PH('wall', 0.25, 1.3)));   // scanned plaster
    const bandM = new T.MeshStandardMaterial({ color: 0x2c4f9c, roughness: 0.7 }), guardM = new T.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 }), blackM = new T.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.7 });
    // the two beside the charging wall were taken out (owner's choice); the column left of the artwork now lives in the page itself
    for (const x of [-(3 * BW + 0.95), 3 * BW + 0.95]) { const z = WALL + 0.35;
      const c = new T.Mesh(new T.BoxGeometry(0.5, CEIL, 0.6), colM); c.position.set(x, CEIL / 2, z); c.castShadow = c.receiveShadow = true; G.add(c);
      for (const y of [1.72, 2.02]) { const b = new T.Mesh(new T.BoxGeometry(0.512, 0.14, 0.612), bandM); b.position.set(x, y, z); G.add(b); }
      for (let i = 0; i < 6; i++) { const s = new T.Mesh(new T.BoxGeometry(0.52, 0.12, 0.62), i % 2 ? blackM : guardM); s.position.set(x, 0.06 + i * 0.12, z); G.add(s); } }

    // ---- 4b. the double service door after the fourth bay, past the column (from the owner's site photo): off-white steel leaves in a steel frame,
    //      a closer on each leaf, a lever on the right leaf, light under the door, a steel ramp plate and a yellow threshold line in front,
    //      the car park's blue bands and a black rubber corner guard beside it. "Open door" swings both leaves wide, out into the car park ----
    const DOOR = { open: 0, target: 0, leaves: [] };
    { const DW = 1.8, DH = 2.2, DX = 3 * BW + 0.95 + 0.25 + 0.4 + DW / 2, ZW = WALL + 0.004;
      const leafM = new T.MeshStandardMaterial(Object.assign({ color: 0xe8e5dc, roughness: 0.75, metalness: 0.08, normalScale: new T.Vector2(0.25, 0.25) }, PH('wall', 0.4, 0.9)));
      const frameM = new T.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.6, metalness: 0.15 }), darkM = new T.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.5, metalness: 0.6 });
      const steelM = new T.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.35, metalness: 0.9 });
      const bx = (w, h, d, m, x, y, z, par) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (par || G).add(o); return o; };
      // the opening: a dim service corridor behind, lit from deep inside, seen when the leaves swing open
      const back = new T.Mesh(new T.PlaneGeometry(DW, DH), new T.MeshBasicMaterial({ map: canvasTex(256, 320, (c, w, h) => { const g = c.createRadialGradient(w / 2, h * 0.45, 4, w / 2, h * 0.5, w * 0.9);
          g.addColorStop(0, '#d8d4c8'); g.addColorStop(0.35, '#8a8780'); g.addColorStop(1, '#2a2927'); c.fillStyle = g; c.fillRect(0, 0, w, h);
          c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, h * 0.86, w, h * 0.14); }, null, true) }));
      back.position.set(DX, DH / 2, ZW - 0.001); G.add(back);
      // frame: two jambs and a head
      bx(0.07, DH + 0.07, 0.09, frameM, DX - DW / 2 - 0.035, (DH + 0.07) / 2, ZW + 0.03); bx(0.07, DH + 0.07, 0.09, frameM, DX + DW / 2 + 0.035, (DH + 0.07) / 2, ZW + 0.03);
      bx(DW + 0.14, 0.07, 0.09, frameM, DX, DH + 0.035, ZW + 0.03);
      // the two leaves, each hung on its outer jamb
      const sign = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#f4f2ea'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b7932f'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
        c.fillStyle = '#7a5a12'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 64px "Helvetica Neue",Helvetica,Arial,sans-serif'; c.fillText('مخرج طوارئ', w / 2, 82);
        c.font = '600 56px "Helvetica Neue",Helvetica,Arial,sans-serif'; c.fillText('EMERGENCY EXIT', w / 2, 178); }, null, true);
      [-1, 1].forEach(sd => { const piv = new T.Group(); piv.position.set(DX + sd * DW / 2, 0, ZW + 0.03); G.add(piv);
        const LW = DW / 2 - 0.006, lx = -sd * LW / 2;   // the leaf runs from its hinge in to the meeting stile
        bx(LW, DH - 0.012, 0.045, leafM, lx, DH / 2 + 0.006, 0, piv);
        bx(0.012, DH - 0.03, 0.05, darkM, -sd * (LW - 0.006), DH / 2 + 0.006, 0.001, piv);                     // the shadow line where the leaves meet
        bx(0.3, 0.055, 0.06, darkM, -sd * 0.26, DH - 0.06, 0.05, piv); bx(0.26, 0.018, 0.025, darkM, -sd * 0.38, DH - 0.03, 0.09, piv);   // overhead closer and its arm
        if (sd > 0) { bx(0.05, 0.05, 0.05, steelM, -LW + 0.09, 1.02, 0.045, piv); bx(0.13, 0.022, 0.022, steelM, -LW + 0.13, 1.02, 0.075, piv);   // lever handle
          bx(0.03, 0.05, 0.012, steelM, -LW + 0.09, 0.92, 0.028, piv); }
        else { const sg = new T.Mesh(new T.PlaneGeometry(0.26, 0.13), new T.MeshStandardMaterial({ map: sign, roughness: 0.4 })); sg.position.set(LW / 2, 1.58, 0.024); piv.add(sg); }
        DOOR.leaves.push({ piv, sd }); });
      // light spilling under the door, the threshold strip, a steel ramp plate and the yellow line on the floor
      const spill = new T.Mesh(new T.PlaneGeometry(DW, 0.5), new T.MeshBasicMaterial({ map: canvasTex(16, 128, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,244,214,.55)'); g.addColorStop(1, 'rgba(255,244,214,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, null, true), transparent: true, depthWrite: false }));
      spill.rotation.x = -Math.PI / 2; spill.position.set(DX, 0.006, ZW + 0.3); G.add(spill);
      bx(DW + 0.1, 0.012, 0.12, steelM, DX, 0.006, ZW + 0.07);
      const ramp = bx(DW - 0.1, 0.025, 1.0, new T.MeshStandardMaterial({ color: 0x55585b, roughness: 0.55, metalness: 0.7 }), DX - 0.05, 0.03, ZW + 0.68); ramp.rotation.x = 0.04;
      const yl = new T.Mesh(new T.PlaneGeometry(1.1, 0.14), new T.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.7 })); yl.rotation.x = -Math.PI / 2; yl.position.set(DX - DW / 2 - 0.65, 0.004, ZW + 0.5); G.add(yl);
      // blue bands and a black rubber corner guard beside the door, as in the photo
      for (const y of [1.72, 2.02]) { const b = new T.Mesh(new T.PlaneGeometry(1.2, 0.14), bandM); b.position.set(DX + DW / 2 + 0.75, y, ZW + 0.002); G.add(b); }
      bx(0.09, 1.25, 0.09, blackM, DX + DW / 2 + 1.45, 0.65, ZW + 0.05);
      for (let i = 0; i < 3; i++) bx(0.092, 0.06, 0.092, guardM, DX + DW / 2 + 1.45, 0.3 + i * 0.4, ZW + 0.05); }
    const swing = () => { const d = DOOR.target - DOOR.open; DOOR.open = Math.abs(d) < 0.01 ? DOOR.target : DOOR.open + d * 0.14;
      DOOR.leaves.forEach(({ piv, sd }) => { piv.rotation.y = sd * DOOR.open * (100 * Math.PI / 180); }); A.draw(); if (DOOR.open !== DOOR.target) requestAnimationFrame(swing); };
    const toggleDoor = () => { DOOR.target = DOOR.target ? 0 : 1; swing(); return DOOR.target; };

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
      const lg = new T.Mesh(new T.PlaneGeometry(LW, LH), lm); lg.position.set(0, 2.04, WALL + 0.012); lg.renderOrder = 3; G.add(lg); lg.scale.setScalar(0.7);   // smaller (owner, 25 Nov 2026); the page still finds it by its 1.4 m plane and lifts it to the light line
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

    // ---- 8. cinematic: the look of a car-advert still, live. A cool, dim car park; three warm downlights washing the charging wall;
    //      a polished floor that reflects the car and the lights; bloom on everything that glows; a teal-and-amber grade with a vignette;
    //      a car in bay 01 with its headlights on and the cable plugged in. Effects come from three.js r147 add-ons, loaded on first use ----
    const CINE = { on: false, ready: null, spots: [], fx: null, refl: null, car: null, cable: null, heads: [], wasNight: false, floorR: null };
    const CDN = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/';
    const addScript = src => new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const loadFx = () => CINE.ready || (CINE.ready = ['shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'postprocessing/EffectComposer.js', 'postprocessing/MaskPass.js', 'postprocessing/RenderPass.js',
      'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js', 'objects/Reflector.js'].reduce((p, f) => p.then(() => addScript(CDN + f)), Promise.resolve()));
    // final pass: ACES tone mapping (as the renderer does), then the grade (teal in the shadows, amber in the highlights, a touch of contrast),
    // vignette and fine grain, then sRGB. The scene is rendered to half-float targets so the bloom sees real highlight values
    const GRADE = { uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, time: { value: 0 }, aspect: { value: 1.6 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure, time, aspect; varying vec2 vUv;
        vec3 RRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
          const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602)); c *= exposure / 0.6; return clamp(O * RRT(I * c), 0.0, 1.0); }
        float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
        void main(){ vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(c * vec3(0.86, 1.0, 1.08), c, smoothstep(0.0, 0.45, l));               // teal shadows
          c *= mix(vec3(1.0), vec3(1.07, 1.0, 0.9), smoothstep(0.45, 1.0, l));         // amber highlights
          c = clamp((c - 0.5) * 1.08 + 0.5, 0.0, 1.0);                                  // gentle contrast
          vec2 d = (vUv - 0.5) * vec2(aspect, 1.0); c *= mix(1.0, 0.55, smoothstep(0.35, 1.05, length(d)));   // vignette
          c += (rnd(vUv * 731.0) - 0.5) * 0.018;                                         // fine grain
          c = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));   // linear to sRGB
          gl_FragColor = vec4(c, 1.0); }` };
    const R = A.renderer, rawRender = R.render.bind(R); let inFx = false;
    R.render = (sc, cam) => { if (!CINE.on || !CINE.fx || inFx || R.getRenderTarget() !== null || sc !== A.scene || cam !== A.camera) return rawRender(sc, cam);
      const s = R.getSize(new T.Vector2()), f = CINE.fx, pr = R.getPixelRatio();
      if (f.w !== s.x || f.h !== s.y || f.pr !== pr) { f.comp.setPixelRatio(pr); f.comp.setSize(s.x, s.y); f.bloom.setSize(s.x * pr, s.y * pr); f.w = s.x; f.h = s.y; f.pr = pr; f.grade.uniforms.aspect.value = s.x / s.y; }
      f.grade.uniforms.time.value = (performance.now() % 1000) / 1000; f.grade.uniforms.exposure.value = 0.84;
      inFx = true; try { f.comp.render(); } finally { inFx = false; } };
    const buildFx = () => { if (CINE.fx) return; const s = R.getSize(new T.Vector2()), pr = R.getPixelRatio();
      const rt = new T.WebGLRenderTarget(s.x * pr, s.y * pr, { type: T.HalfFloatType });
      const comp = new T.EffectComposer(R, rt); comp.setPixelRatio(pr); comp.setSize(s.x, s.y);
      comp.addPass(new T.RenderPass(A.scene, A.camera));
      const bloom = new T.UnrealBloomPass(new T.Vector2(s.x * pr, s.y * pr), 0.55, 0.55, 0.9); comp.addPass(bloom);
      const grade = new T.ShaderPass(GRADE); comp.addPass(grade);
      CINE.fx = { comp, bloom, grade, w: s.x, h: s.y, pr }; };
    // polished floor: a mirror rendered from below, added on top of the slab at a third of its strength, so markings still read
    const buildRefl = () => { if (CINE.refl) return; const r = new T.Reflector(new T.PlaneGeometry(34, 22), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, color: 0xffffff, multisample: 0 });
      r.material.fragmentShader = r.material.fragmentShader.replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', 'gl_FragColor = vec4( base.rgb * 0.32, 1.0 );');
      r.material.blending = T.AdditiveBlending; r.material.transparent = true; r.material.depthWrite = false; r.material.needsUpdate = true;
      r.rotation.x = -Math.PI / 2; r.position.set(4, 0.006, 8); r.renderOrder = 1; r.visible = false; E.add(r); CINE.refl = r; };
    // three warm wall-washers just in front of the charging wall, and their round fittings in the soffit
    const buildSpots = () => { if (CINE.spots.length) return; const fit = new T.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false }); fit.color.setScalar(3);
      [-1.75, 0, 1.75].forEach((x, i) => { const L = new T.SpotLight(0xffd3a1, 0, 7.5, 0.6, 0.85, 1.6); L.position.set(x, CEIL - 0.08, WALL + 0.45); L.target.position.set(x, 0.6, WALL + 0.05);
        if (i === 1) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.0005; } G.add(L); G.add(L.target);
        const disc = new T.Mesh(new T.CircleGeometry(0.07, 24), fit); disc.rotation.x = Math.PI / 2; disc.position.set(x, CEIL - 0.012, WALL + 0.45); disc.visible = false; G.add(disc); CINE.spots.push({ L, disc }); }); };
    // the car in bay 01, plugged in: a black cable from charger 01's holster down and across to the charge port at the car's rear left,
    // and its headlights on (two cool spotlights and a glow on the lamps)
    const plugCar = () => { if (!cars.length) addCar(); const c = cars[0]; if (!c || CINE.car === c) return; CINE.car = c;
      if (CINE.cable) { E.remove(CINE.cable); CINE.cable = null; } CINE.heads.forEach(h => h.parent && h.parent.remove(h)); CINE.heads = [];
      const o0 = E.getWorldPosition(new T.Vector3()), b = boxOf(c, /body_primary/).translate(o0.clone().negate());
      const port = new T.Vector3(b.max.x - 0.12, 0.82, b.min.z + 0.2), hol = new T.Vector3(-BW / 2 + 0.12, 1.02, WALL + 0.16);
      const curve = new T.CatmullRomCurve3([hol, new T.Vector3(hol.x + 0.05, 0.55, WALL + 0.28), new T.Vector3((hol.x + port.x) / 2, 0.12, (hol.z + port.z) / 2 + 0.15), new T.Vector3(port.x + 0.12, 0.45, port.z - 0.05), port]);
      const cab = new T.Mesh(new T.TubeGeometry(curve, 80, 0.014, 10, false), new T.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.45, metalness: 0.1 })); cab.castShadow = true; E.add(cab); CINE.cable = cab;
      const plug = new T.Mesh(new T.CylinderGeometry(0.03, 0.035, 0.12, 16), new T.MeshStandardMaterial({ color: 0x151617, roughness: 0.4 })); plug.position.copy(port).add(new T.Vector3(0.05, 0, 0)); plug.rotation.z = Math.PI / 2; cab.add(plug.clone()); E.add(plug); CINE.heads.push(plug);
      const front = b.max.z, hy = 0.66; [b.min.x + 0.32, b.max.x - 0.32].forEach(x => { const H = new T.SpotLight(0xdfefff, 0, 9, 0.5, 0.7, 1.4); H.position.set(x, hy, front - 0.08); H.target.position.set(x, 0, front + 5); E.add(H); E.add(H.target); CINE.heads.push(H, H.target);
        const g = new T.Mesh(new T.PlaneGeometry(0.22, 0.05), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); g.material.color.setScalar(4); g.position.set(x, hy + 0.02, front + 0.005); E.add(g); CINE.heads.push(g); }); };
    // reflections stay on (car paint and chrome need them), but the walls and floor take only a little of them, so the room stays dark
    const envKeep = new Map(), isCarPart = o => { for (let p = o; p && p !== E; p = p.parent) if (cars.includes(p)) return true; return false; };
    const setEnvLevels = on => { const roots = [E, H.groups().awm].filter(Boolean);
      roots.forEach(r => r.traverse(o => { if (!o.isMesh || !o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!('envMapIntensity' in m)) return;
        if (on) { if (!envKeep.has(m)) envKeep.set(m, m.envMapIntensity); m.envMapIntensity = isCarPart(o) ? 1.0 : 0.15; } else if (envKeep.has(m)) m.envMapIntensity = envKeep.get(m); }); }));
      if (!on) envKeep.clear(); };
    const applyCine = () => { if (!CINE.on || !H.isOn()) return; const sun = A.sun;
      if (sun) sun.intensity = 0.03; if (hemi) { hemi.intensity = 0.12; hemi.color.setHex(0x7fa6c4); hemi.groundColor && hemi.groundColor.setHex(0x1a1c1f); }
      if (!A.scene.environment && CINE.env) A.scene.environment = CINE.env;
      if (A.scene.background && A.scene.background.isColor) A.scene.background.setHex(0x07090b); if (A.scene.fog) A.scene.fog.color.setHex(0x07090b);
      CINE.spots.forEach(({ L, disc }) => { L.intensity = 11; disc.visible = true; }); CINE.heads.forEach(h => { if (h.isSpotLight) h.intensity = 4; });
      NL.forEach(L => { L.color.setHex(0xa9d4ff); L.intensity = 0.8; }); AWM.lights.forEach(L => { L.intensity = L.userData.on * 0.5; });
      const fw = find(plane(2 * BW + 0.5, CEIL)); if (fw && fw.material.color.r < 5) { fw.material.color.setScalar(7); fw.material.emissiveIntensity = 0.35; }   // the black wall reads as charcoal under the warm light tubeM.color.setScalar(2.6);
      if (CINE.refl) CINE.refl.visible = true; if (floor && floor.material.roughness !== 0.5) { floor.material.roughness = 0.5; floor.material.needsUpdate = true; } };
    async function setCine(on, bBtn) {
      if (on) { bBtn.disabled = true; bBtn.textContent = '🎬 Loading…';
        try { await loadFx(); } catch (e) { bBtn.disabled = false; bBtn.textContent = '🎬 Cinematic'; A.say('The cinematic effects could not load. Check the internet connection and try again.'); return; }
        CINE.wasNight = NIGHT.on; if (NIGHT.on) setNight(false);
        const sun = A.sun; CINE.keep = { sun: sun ? sun.intensity : null, hemi: hemi ? hemi.intensity : null, hc: hemi ? hemi.color.getHex() : null, hg: hemi && hemi.groundColor ? hemi.groundColor.getHex() : null,
          bg: A.scene.background && A.scene.background.isColor ? A.scene.background.getHex() : null, fog: A.scene.fog ? A.scene.fog.color.getHex() : null };
        CINE.env = A.scene.environment || CINE.env;
        buildFx(); buildRefl(); buildSpots(); plugCar(); CINE.on = true; setEnvLevels(true); applyCine();
        const v = (x, y, z) => new T.Vector3(x, y, z).add(E.getWorldPosition(new T.Vector3()));   // frame it like an advert still: low, three-quarter, car in front
        A.controls.target.copy(v(1.9, 1.1, -0.75)); A.camera.position.copy(v(-7.0, 1.25, 9.35)); A.camera.fov = 35; A.camera.updateProjectionMatrix(); A.controls.update();
        bBtn.disabled = false; bBtn.textContent = '🎬 Standard'; A.draw(); A.say('Cinematic: warm wall-washers, a polished floor, glow and a film grade. Drag to look around; Shot 8K saves it.'); return; }
      CINE.on = false; setEnvLevels(false); CINE.spots.forEach(({ L, disc }) => { L.intensity = 0; disc.visible = false; }); CINE.heads.forEach(h => { if (h.isSpotLight) h.intensity = 0; });
      NL.forEach(L => { L.color.setHex(0xf4f8ff); L.intensity = 0; }); AWM.lights.forEach(L => { L.intensity = L.userData.on; }); tubeM.color.setScalar(1.6); if (CINE.refl) CINE.refl.visible = false;
      const k = CINE.keep || {}, sun = A.sun; if (sun && k.sun !== null) sun.intensity = k.sun; if (hemi && k.hemi !== null) { hemi.intensity = k.hemi; hemi.color.setHex(k.hc); if (k.hg !== null && hemi.groundColor) hemi.groundColor.setHex(k.hg); }
      if (k.bg !== null && A.scene.background && A.scene.background.isColor) A.scene.background.setHex(k.bg); if (k.fog !== null && A.scene.fog) A.scene.fog.color.setHex(k.fog);
      if (floor) { floor.material.roughness = 1; floor.material.needsUpdate = true; } { const fw = find(plane(2 * BW + 0.5, CEIL)); if (fw) { fw.material.color.setScalar(1); fw.material.emissiveIntensity = 0.55; } } if (CINE.wasNight) setNight(true);
      bBtn.textContent = '🎬 Cinematic'; A.draw(); A.say('Standard view.'); }
    setInterval(() => { if (!CINE.on) return; if (!H.isOn()) { const b = document.querySelector('.tw-awm-cine'); if (b) setCine(false, b); return; } applyCine(); A.draw(); }, 700);

    // ---- cutaway: when the camera rises above the ceiling, the slab, beams, duct and light fittings hide so the view looks down
    //      into the bays instead of into the concrete; they come back as soon as the camera drops below the ceiling again ----
    { const CUT = { on: false, list: [], key: '' }, box = new T.Box3(), cam = new T.Vector3(), fyV = new T.Vector3();
      const isCar = o => { for (let p = o; p && p !== E; p = p.parent) if (p.children && p.children[0] && p.children[0].name === 'Sketchfab_Scene') return true; return false; };
      const collect = fy => { const out = []; E.updateMatrixWorld(true);
        const wz = E.getWorldPosition(new T.Vector3()).z + WALL;   // the back wall's line: the logo and slogan on it stay
        E.traverse(o => { if (!o.isMesh || isCar(o)) return; box.setFromObject(o); if (box.isEmpty()) return; const mn = box.min.y - fy;
          if (mn > 2.5 || (mn > 2.0 && box.min.z > wz + 1)) out.push(o); }); return out; };   // the slab, beams, duct and fittings, and the sign hanging over the aisle
      const check = () => { const on = H.isOn(); E.getWorldPosition(fyV); const fy = fyV.y;
        const key = E.children.length + ':' + G.children.length; if (on && key !== CUT.key) { if (CUT.on) CUT.list.forEach(o => { o.visible = true; }); CUT.on = false; CUT.list = collect(fy); CUT.key = key; }
        A.camera.getWorldPosition(cam); const want = on && cam.y - fy > 2.5;   // from the beams' underside up: a camera among the beams sees only concrete
        if (want !== CUT.on) { CUT.on = want; CUT.list.forEach(o => { o.visible = !want; }); A.draw(); } };
      A.controls.addEventListener('change', check); setInterval(check, 300); H.cutaway = () => CUT.on; }

    // ---- the two buttons, shown on the Al Wahda Mall project only ----
    const st = document.createElement('style'); st.textContent = `.tw-awm-cars{position:fixed;left:20px;bottom:118px;z-index:20;display:flex;gap:8px}.tw-awm-cars[hidden]{display:none}
.tw-awm-cars button{appearance:none;border:0;border-radius:999px;padding:9px 14px;font:600 13px var(--display,Helvetica);cursor:pointer;background:rgba(255,255,255,.92);color:#1d1d1f;box-shadow:0 4px 16px rgba(0,0,0,.18)}
.tw-awm-cars button:first-child{background:linear-gradient(135deg,#3BA9E0,#8DC63F);color:#fff}.tw-awm-cars .tw-awm-night{background:#1d1d1f;color:#fff}.tw-awm-cars .tw-awm-cine{background:linear-gradient(135deg,#2b2117,#4a3420);color:#ffd9a3}`; document.head.appendChild(st);
    const bar = document.createElement('div'); bar.className = 'tw-awm-cars'; bar.hidden = true;
    bar.innerHTML = '<button type="button" title="Park a car in the next free bay: the charging bays first">🚗 Add car</button><button type="button" title="Remove the cars you added">Clear cars</button><button type="button" class="tw-awm-night" title="See the basement at night, lit only by its own fittings">🌙 Night</button><button type="button" class="tw-awm-cine" title="Cinematic look: warm wall-washers, a polished floor, glow and a film grade, with a car plugged into bay 01">🎬 Cinematic</button><button type="button" class="tw-awm-door" title="Swing the two leaves of the service door wide open, or close them">🚪 Open door</button><button type="button" class="tw-awm-prop" title="Make the ChargePoint proposal for this project, with 4K renders from this scene">📄 Create proposal</button>';
    document.body.appendChild(bar); const [bAdd, bClr, bNight] = bar.querySelectorAll('button'); bAdd.addEventListener('click', addCar); bClr.addEventListener('click', clearCars); bNight.addEventListener('click', () => setNight(!NIGHT.on)); bar.querySelector('.tw-awm-prop').addEventListener('click', openProposal); { const bc = bar.querySelector('.tw-awm-cine'); bc.addEventListener('click', () => setCine(!CINE.on, bc)); } { const bd = bar.querySelector('.tw-awm-door'); bd.addEventListener('click', () => { bd.textContent = toggleDoor() ? '🚪 Close door' : '🚪 Open door'; }); }
    setInterval(() => { const on = H.isOn() && !S.on; if (bar.hidden === on) bar.hidden = !on; }, 500);
    A.draw(); };
  if (window.__twin && window.__twin.api) start(); else document.addEventListener('twin-ready', start, { once: true });
})();
