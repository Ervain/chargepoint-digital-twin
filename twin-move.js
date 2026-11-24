// Move the chargers: nudge the whole layout forward, back, left or right, relative to the way it faces (0.5 m a press, 2 m with Shift),
// next to the Turn slider. The footprint, shadows and any cable routing follow; Reset puts it back where it was built.
(() => {
  const start = () => { const S = window.__twin; if (!S || !S.api) return; const A = S.api, T = A.T, bar = A.bar, rot = bar && bar.querySelector('.tw-rot'); if (!rot || bar.querySelector('.tw-move')) return;
    const css = `.tw-move{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tw-move>span{min-width:38px}.tw-move button{appearance:none;border:1px solid rgba(0,0,0,.14);background:#fff;color:#1d1d1f;border-radius:8px;
      font:600 12px var(--display,Helvetica);padding:5px 9px;cursor:pointer;line-height:1;min-width:30px}.tw-move button:hover{border-color:#3BA9E0}.tw-move output{font:500 11px var(--display,Helvetica);color:#6e6e73;margin-left:2px}`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const row = document.createElement('div'); row.className = 'tw-sb-row tw-move';
    row.innerHTML = '<span>Move</span><button type="button" data-d="f" title="Forward 0.5 m (Shift: 2 m)" aria-label="Move forward">↑</button><button type="button" data-d="b" title="Back 0.5 m (Shift: 2 m)" aria-label="Move back">↓</button>'
      + '<button type="button" data-d="l" title="Left 0.5 m (Shift: 2 m)" aria-label="Move left">←</button><button type="button" data-d="r" title="Right 0.5 m (Shift: 2 m)" aria-label="Move right">→</button><button type="button" data-d="0" title="Back to where it was built">Reset</button><output></output>';
    rot.closest('label').after(row);
    let base = null, prod = null, off = [0, 0];   // off: [right, forward] in metres
    const out = row.querySelector('output'), show = () => { const [x, f] = off; out.textContent = (!x && !f) ? '' : [f ? `${Math.abs(f)} m ${f > 0 ? 'forward' : 'back'}` : '', x ? `${Math.abs(x)} m ${x > 0 ? 'right' : 'left'}` : ''].filter(Boolean).join(', '); };
    row.addEventListener('click', e => { const bt = e.target.closest('button'); if (!bt) return; const P = S.product; if (!P) { A.say('Build the site first, then move the chargers.'); return; }
      if (P !== prod) { prod = P; base = P.position.clone(); off = [0, 0]; }
      const d = bt.dataset.d, k = e.shiftKey ? 2 : 0.5;
      if (d === '0') off = [0, 0]; else if (d === 'f') off[1] += k; else if (d === 'b') off[1] -= k; else if (d === 'r') off[0] += k; else if (d === 'l') off[0] -= k;
      off = off.map(v => Math.round(v * 10) / 10);
      const a = P.rotation.y, fw = new T.Vector3(Math.sin(a), 0, Math.cos(a)), rt = new T.Vector3(Math.cos(a), 0, -Math.sin(a));
      P.position.copy(base).addScaledVector(fw, off[1]).addScaledVector(rt, off[0]);
      rot.dispatchEvent(new Event('input'));   // redraws with the footprint and shadows, the same way Turn does
      if (S.cable && S.cable.route) S.cable.route(); show(); });
    // a rebuild starts from its own position again
    setInterval(() => { if (S.product && S.product !== prod && prod) { prod = null; off = [0, 0]; show(); } }, 1000);
  };
  if (window.__twin && window.__twin.api) start(); else document.addEventListener('twin-ready', start, { once: true });
})();
