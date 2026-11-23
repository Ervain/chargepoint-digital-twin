/* ChargePoint Digital Twin · Plan to Reality
   A short film of the site, made live in the scene:
   1. Blueprint: the site from above in blue, the bays and the plan grid in white.
   2. Clay: the canopies rise out of the plan as a white model, one by one.
   3. Reality: each canopy takes its real materials, the camera swings down to a three-quarter view.
   "Save reveal video" records the same film at 1920 × 1080 for social media. */
(() => {
  const start = () => { const S = window.__twin; if (S && S.api && S.api.bar) init(S); };
  if (window.__twin) start(); else document.addEventListener('twin-ready', start, { once: true });

  function init(S) {
    const A = S.api, T = A.T, row = A.bar.querySelector('.tw-sb-main');
    const mk = (cls, txt, title) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.title = title; row.appendChild(b); return b; };
    const play = mk('tw-reveal', 'Plan → Reality', 'Watch this site go from plan, to white model, to the real station');
    const save = mk('tw-revrec', 'Save reveal video', 'Record the plan to reality film at 1920 × 1080 for social media');
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));
    const DUR = 9.5;

    async function reveal(rec) {
      const P = S.product; if (!P || S.revealing) return null; S.revealing = true;
      const cam = A.camera, ctl = A.controls, R3 = A.renderer, scene = A.scene;
      const box = A.boxOf(P), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()), R = Math.max(sz.x, sz.z, 18);
      const keep = { pos: cam.position.clone(), tgt: ctl.target.clone(), fov: cam.fov, en: ctl.enabled };
      ctl.enabled = false;
      // materials: everything white clay to start, the real ones kept to swap back
      const clay = new T.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.85, metalness: 0 });
      const units = P.children.slice().sort((a, b) => a.position.x - b.position.x || a.position.z - b.position.z);
      const meshes = []; units.forEach((u, i) => u.traverse(o => { if (o.isMesh) { meshes.push({ o, m: o.material, i }); o.material = clay; } }));
      const scales = units.map(u => u.scale.y);
      // the blueprint: a navy veil over the ground with a 2.5 m grid (one bay wide)
      const veil = new T.Mesh(new T.PlaneGeometry(R * 16, R * 16), new T.MeshBasicMaterial({ color: 0x0a2a5e, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      veil.rotation.x = -Math.PI / 2; veil.position.set(c.x, 0.03, c.z); veil.renderOrder = -8.5;
      const n = Math.round(R * 4 / 2.5) * 2, grid = new T.GridHelper(n * 2.5, n, 0x9cc4ff, 0x4f86d6);
      grid.position.set(c.x, 0.05, c.z); [].concat(grid.material).forEach(m => { m.transparent = true; m.opacity = 0; m.depthWrite = false; m.fog = false; }); grid.renderOrder = -8.4;
      scene.add(veil, grid);
      // camera path: straight down on the plan, then a long swing to a three-quarter view
      const off = keep.pos.clone().sub(keep.tgt), az0 = Math.atan2(off.x, off.z), dist = R * 1.35;
      const at = (az, el, d) => new T.Vector3(c.x + Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, c.z + Math.cos(az) * Math.cos(el) * d);
      // recording
      let recd = null, chunks = [], oldSize = null, oldPR = 1, oldAsp = cam.aspect;
      if (rec) { oldSize = new T.Vector2(); R3.getSize(oldSize); oldPR = R3.getPixelRatio(); R3.setPixelRatio(1); R3.setSize(1920, 1080, false); cam.aspect = 16 / 9; cam.updateProjectionMatrix();
        const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'], type = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
        if (type) { const st = R3.domElement.captureStream(30); recd = new MediaRecorder(st, { mimeType: type, videoBitsPerSecond: 16e6 }); recd.ondataavailable = e => e.data.size && chunks.push(e.data); recd.start(); } }
      const t0 = performance.now(); let swapped = new Set();
      await new Promise(res => { const step = () => {
        const t = (performance.now() - t0) / 1000;
        // 1. blueprint in (0 to 1.2 s), held, then out (4.6 to 6 s)
        const bp = seg(t, 0, 1.2) * (1 - seg(t, 4.6, 6));
        veil.material.opacity = 0.84 * bp; [].concat(grid.material).forEach(m => { m.opacity = 0.55 * bp; });
        // 2. the canopies rise in clay, one after another (1.4 to 4.4 s)
        units.forEach((u, i) => { const s0 = 1.4 + (units.length > 1 ? i * 1.6 / (units.length - 1) : 0), k = seg(t, s0, s0 + 1.3); u.scale.y = Math.max(0.001, scales[i] * k); u.visible = k > 0.001; });
        // 3. real materials, unit by unit (4.8 to 6.4 s)
        units.forEach((u, i) => { const ts = 4.8 + (units.length > 1 ? i * 1.4 / (units.length - 1) : 0); if (t >= ts && !swapped.has(i)) { swapped.add(i); meshes.forEach(x => { if (x.i === i) x.o.material = x.m; }); } });
        // camera: top down (to 1.4 s), swing down (1.4 to 6.5 s), slow orbit to the end
        const el = T.MathUtils.lerp(Math.PI / 2 - 0.02, 0.42, seg(t, 1.4, 6.5)), az = az0 - 0.9 + 0.9 * seg(t, 1.4, 6.5) + 0.35 * clamp((t - 6.5) / 3);
        cam.position.copy(at(az, el, T.MathUtils.lerp(R * 1.9, dist, seg(t, 1.4, 6.5)))); ctl.target.copy(c); cam.fov = 38; cam.updateProjectionMatrix(); cam.lookAt(c);
        A.draw();
        if (t < DUR) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step); });
      let blob = null;
      if (recd) { await new Promise(r => { recd.onstop = r; recd.stop(); }); blob = new Blob(chunks, { type: recd.mimeType }); }
      // clean up: real materials, full height, the camera stays on the last frame
      meshes.forEach(x => { x.o.material = x.m; }); units.forEach((u, i) => { u.scale.y = scales[i]; u.visible = true; });
      scene.remove(veil, grid); veil.geometry.dispose(); veil.material.dispose(); grid.geometry.dispose(); [].concat(grid.material).forEach(m => m.dispose()); clay.dispose();
      if (rec && oldSize) { R3.setPixelRatio(oldPR); R3.setSize(oldSize.x, oldSize.y, false); cam.aspect = oldAsp; cam.updateProjectionMatrix(); }
      ctl.enabled = keep.en; ctl.update(); A.draw(); S.revealing = false;
      return blob;
    }
    S.reveal = reveal;
    const busy = (b, on, txt) => { [play, save].forEach(x => { x.disabled = on; }); if (txt) b.textContent = txt; };
    play.addEventListener('click', async () => { busy(play, true); await reveal(false); busy(play, false); });
    save.addEventListener('click', async () => { if (!window.MediaRecorder) { A.say('This browser cannot record video. Try Chrome or Safari.'); return; }
      busy(save, true, 'Recording…'); const blob = await reveal(true);
      if (blob && blob.size) { const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm'; await S.saveFile(`chargepoint-${S.slug(S.name)}-plan-to-reality.${ext}`, blob); A.say(`Reveal saved as a ${ext.toUpperCase()} video, 1920 × 1080.`); }
      else A.say('The video could not be recorded in this browser.');
      busy(save, false, 'Save reveal video'); });
  }
})();
