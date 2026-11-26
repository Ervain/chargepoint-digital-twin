// Real-world props for the two scenes, from Poly Haven scans (CC0, free for any use, no credit needed), reduced in Blender for the web.
// Al Wahda Mall basement: a security camera, a fire extinguisher, a fire hose reel cabinet with its red risers (modelled from the site photo)
// and a run of service pipes. Villa: a security camera on the corner, an air conditioning unit on the side wing and a wall-mounted
// garden hose. (Poly Haven's security light was tried over the garage and left out: an old glass-globe lamp, wrong for a modern villa.) Models are stored as base64 text next to this file (the page host serves text, not .glb).
(() => {
  const ME = (document.currentScript && document.currentScript.src) || '', BASE = ME.replace(/twin-props\.js(\?.*)?$/, ''), VQ = (ME.match(/\?.*$/) || [''])[0];
  const start = () => { const S = window.__twin, H = window.__twinAWM, EN = window.__twinENV; if (!S || !S.api || !S.api.T.GLTFLoader) return; const A = S.api, T = A.T;
    const cache = {};
    const load = name => cache[name] || (cache[name] = fetch(BASE + 'ph_' + name + '.glb.txt' + VQ).then(r => r.text()).then(b64 => new Promise(res => {
      const bin = atob(b64.trim()), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      new T.GLTFLoader().parse(u.buffer, '', g => { const sc = g.scene;
        sc.traverse(o => { if (/^Cube(\.\d+)?$/.test(o.name)) o.visible = false;   // a stray export helper, never part of the model
          if (o.isMesh) { o.castShadow = o.receiveShadow = true; const m = o.material; if (m && m.map) m.map.anisotropy = 8; } });
        res(sc); }, () => res(null)); })).catch(() => null));
    // put a model flat against a wall: its front (+Z in the file) turned to face `face` (radians about Y, 0 = +Z), its back touching the
    // wall plane through (x, z), its bottom at y (or centred on cy), centred along the wall
    const mount = (src, parent, { x, y, z, face = 0, cy, s = 1, tilt = 0 }) => { if (!src || !parent) return null;
      const m = src.clone(true), holder = new T.Group(); holder.add(m); m.scale.setScalar(s); m.rotation.x = tilt;
      const b = new T.Box3().setFromObject(m), c = b.getCenter(new T.Vector3());
      m.position.set(-c.x, -(cy !== undefined ? c.y : b.min.y), -b.min.z);   // back face at z = 0, bottom (or centre) at y = 0, centred on x
      holder.rotation.y = face; holder.position.set(x, cy !== undefined ? cy : y, z); parent.add(holder); return holder; };

    // ---- Al Wahda Mall basement (coordinates in the basement's own frame: back wall at z = -0.75, ceiling 3.3 m, bays 2.6 m) ----
    const awm = () => { if (!H || !H.AWM || !H.AWM.env || H.AWM.env.userData.props) return; const E = H.AWM.env; E.userData.props = true;
      const WALL = -0.75, wz = WALL + 0.008, BW = 2.6, DX = 3 * BW + 0.95 + 0.25 + 0.4 + 0.9;   // DX: centre of the service door after bay 4
      load('security_camera_01').then(m => { mount(m, E, { x: -BW - 0.55, cy: 2.9, z: WALL + 0.35 + 0.31, face: 0.45, tilt: 0.25 }); A.draw(); });   // on the corner column's face, watching both bays
      load('korean_fire_extinguisher_01').then(m => { mount(m, E, { x: DX + 2.9, y: 0.02, z: wz + 0.02 }); A.draw(); });
      load('modular_industrial_pipes_01').then(m => { mount(m, E, { x: DX + 5.6, y: 1.3, z: wz }); A.draw(); });                      // service pipes dropping from the slab
      // fire hose reel cabinet, as in the site photo: red steel, two doors, labels in English and Arabic, red risers either side
      { const g = new T.Group(), red = new T.MeshStandardMaterial({ color: 0xc4161c, roughness: 0.45, metalness: 0.35 }), CW = 0.78, CH = 1.6, CD = 0.26, cx = DX + 4.05, by = 0.32;
        const box = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
        box(CW, CH, CD, red, cx, by + CH / 2, wz + CD / 2);
        const seam = new T.MeshStandardMaterial({ color: 0x5a0a0d, roughness: 0.6 }); box(CW - 0.04, 0.012, 0.004, seam, cx, by + CH * 0.52, wz + CD + 0.001);
        for (const sx of [-1, 1]) box(0.012, CH - 0.06, 0.004, seam, cx + sx * (CW / 2 - 0.02), by + CH / 2, wz + CD + 0.001);
        const lab = (t1, t2, w, h) => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const q = c.getContext('2d'); q.fillStyle = '#c4161c'; q.fillRect(0, 0, 512, 256);
          q.fillStyle = '#ffffff'; q.textAlign = 'center'; q.textBaseline = 'middle';
          const fit = (t, px, wt, y) => { q.font = `${wt} ${px}px "Helvetica Neue",Helvetica,Arial`; const k = Math.min(1, 460 / q.measureText(t).width); q.font = `${wt} ${Math.floor(px * k)}px "Helvetica Neue",Helvetica,Arial`; q.fillText(t, 256, y); };
          fit(t1, 70, 700, 80); fit(t2, 64, 600, 182);   // shrink to fit the label, never clipped
          const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 8; return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: tx, roughness: 0.5 })); };
        const l1 = lab('FIRE HOSE REEL', 'بكرة خرطوم الحريق', 0.62, 0.31); l1.position.set(cx, by + CH * 0.8, wz + CD + 0.003); g.add(l1);
        const l2 = lab('FIRE EXTINGUISHER', 'طفاية حريق', 0.62, 0.31); l2.position.set(cx, by + CH * 0.3, wz + CD + 0.003); g.add(l2);
        box(0.04, 0.03, 0.03, new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }), cx + CW / 2 - 0.08, by + CH * 0.52, wz + CD + 0.016);   // handle
        for (const px of [cx - CW / 2 - 0.16, cx + CW / 2 + 0.16]) { const p = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 3.3, 16), red); p.position.set(px, 1.65, wz + 0.1); p.castShadow = true; g.add(p); }
        E.add(g); }
      A.draw(); };

    // ---- villa (world metres: the garage front faces the canopy at z = 30, the east wing's side wall is at x = 26) ----
    const villa = () => { if (!EN || !EN.villaGroup || EN.villaGroup.userData.props) return; const V = EN.villaGroup; V.userData.props = true; V.updateMatrixWorld(true);
      const at = (x, y, z) => V.worldToLocal(new T.Vector3(x, y, z));
      const put = (name, x, y, z, o) => load(name).then(m => { const p = at(x, y, z); mount(m, V, Object.assign({ x: p.x, y: p.y, z: p.z }, o)); A.draw(); });
      put('security_camera_02', 13.55, 3.15, 29.96, { face: Math.PI - 0.5 });   // on the corner, looking down the driveway
      put('exterior_aircon_unit', 26.04, 0.0, 38.5, { face: Math.PI / 2 });     // on the east wing's side wall
      put('garden_hose_wall_mounted_01', 18.5, 0.55, 32.96, { face: Math.PI }); // on the wing's front wall by the garden, clear of the pergola post
    };
    awm(); villa(); setInterval(() => { awm(); villa(); }, 1500); };   // either scene may be built after this file loads
  if (window.__twin && window.__twin.api) start(); else document.addEventListener('twin-ready', start, { once: true });
})();
