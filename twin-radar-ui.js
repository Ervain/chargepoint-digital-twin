// Site Radar weights: a small editor on the ranking board. Each criterion gets an importance from 1 to 5; the weights follow
// (AHP with a_ij = s_i / s_j), the sites already scanned are re-ranked at once, and the choice is remembered in this browser.
(() => {
  const NAMES = { demand: 'Demand', gap: 'Charging gap', size: 'Car park size', road: 'Main road', anchors: 'Anchors', grid: 'Grid' };
  const css = `.tw-bd-wbtn{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:999px;font:600 12px var(--display,Helvetica);padding:6px 11px;cursor:pointer;flex:0 0 auto}
.tw-bd-wbtn[aria-expanded=true]{background:#3BA9E0}.tw-bd-w{background:rgba(255,255,255,.06);border-radius:12px;padding:10px 12px;margin:8px 0;font:500 12px var(--display,Helvetica);color:#d2d2d7}
.tw-bd-w p{margin:0 0 8px;color:#a1a1a6;line-height:1.4}.tw-w-row{display:grid;grid-template-columns:1fr auto 38px;align-items:center;gap:8px;margin:5px 0}
.tw-w-row.is-off{opacity:.45}.tw-w-dots{display:flex;gap:4px}.tw-w-dots button{width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:600 11px var(--display,Helvetica);cursor:pointer;padding:0}
.tw-w-dots button.on{background:linear-gradient(135deg,#3BA9E0,#8DC63F);border-color:transparent}.tw-w-row em{font-style:normal;text-align:right;color:#fff;font-weight:700}
.tw-w-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px}.tw-w-foot button{background:none;border:0;color:#3BA9E0;font:600 12px var(--display,Helvetica);cursor:pointer;padding:0}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  let open = false;
  function panel(bd) { const G = window.TwinGeo, cur = G.getImportance() || G.DEFAULT_IMP, top = (window.__twin && null), card = bd.querySelector('.tw-bd-card');
    const md = (bd._ranked0 && bd._ranked0.method) || null;
    const box = document.createElement('div'); box.className = 'tw-bd-w';
    const RW = G.radarWeights(), used = md ? md.cols : G.RADAR_C, wsum = used.reduce((s, c) => s + RW.W[c], 0);
    box.innerHTML = `<p>${RW.custom ? 'Your weights' : 'Expert starting view (AHP)'}: set how much each factor matters, from 1 (a little) to 5 (most). The sites are re-ranked at once.</p>`;
    G.RADAR_C.forEach(c => { const row = document.createElement('div'); row.className = 'tw-w-row' + (used.includes(c) ? '' : ' is-off');
      row.innerHTML = `<span>${NAMES[c]}${used.includes(c) ? '' : ' (no data here)'}</span><span class="tw-w-dots"></span><em>${used.includes(c) ? Math.round(100 * RW.W[c] / wsum) + '%' : '–'}</em>`;
      const dots = row.querySelector('.tw-w-dots'); for (let v = 1; v <= 5; v++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.className = v <= cur[c] ? 'on' : '';
        b.setAttribute('aria-label', `${NAMES[c]} importance ${v} of 5`); b.addEventListener('click', ev => { ev.stopPropagation(); const nv = Object.assign({}, cur, { [c]: v }); G.setImportance(nv); window.__twin.reRank(); }); dots.appendChild(b); }
      box.appendChild(row); });
    const foot = document.createElement('div'); foot.className = 'tw-w-foot'; foot.innerHTML = `<span>${RW.custom ? 'Saved in this browser' : 'Consistency ratio ' + RW.CR.toFixed(3)}</span>`;
    if (RW.custom) { const r = document.createElement('button'); r.type = 'button'; r.textContent = 'Back to expert view'; r.addEventListener('click', ev => { ev.stopPropagation(); G.setImportance(null); window.__twin.reRank(); }); foot.appendChild(r); }
    box.appendChild(foot); return box; }
  function decorate(bd) { const h = bd.querySelector('.tw-bd-h'); if (!h || h.querySelector('.tw-bd-wbtn') || !window.TwinGeo || !window.__twin || !window.__twin.reRank) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tw-bd-wbtn'; b.textContent = 'Weights'; b.setAttribute('aria-expanded', open);
    b.addEventListener('click', ev => { ev.stopPropagation(); open = !open; decorate2(bd); });
    h.insertBefore(b, h.querySelector('.tw-close')); decorate2(bd); }
  function decorate2(bd) { const old = bd.querySelector('.tw-bd-w'); if (old) old.remove(); const b = bd.querySelector('.tw-bd-wbtn'); if (b) b.setAttribute('aria-expanded', open);
    if (!open) return; const first = bd.querySelector('.tw-bd-card'); bd._ranked0 = null;
    try { const R = window.__twin && window.__twin.api && window.__twin.api.PK && window.__twin.api.PK.list; if (R && R[0]) bd._ranked0 = R[0]; } catch (e) {}
    bd.insertBefore(panel(bd), first); }
  const hook = () => { const bd = document.querySelector('.tw-board'); if (!bd) return false; new MutationObserver(() => decorate(bd)).observe(bd, { childList: true }); decorate(bd); return true; };
  if (!hook()) { const t = setInterval(() => { if (hook()) clearInterval(t); }, 800); }
})();
