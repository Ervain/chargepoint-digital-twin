
(() => {
  const stage = document.getElementById('stage'); if (!stage) return;
  const $ = s => document.querySelector(s);
  // title block on the scene
  const head = document.createElement('div'); head.className = 'tw-head';
  head.innerHTML = '<p class="tw-fam" id="tw-fam"></p><h2 class="tw-name" id="tw-name"></h2><div class="tw-charge" id="tw-charge" aria-hidden="true"></div><p class="tw-sub" id="tw-sub"></p><ul class="tw-stats" id="tw-stats" aria-label="Key figures"></ul>';
  const logo = $('#hdr-logo'); if (logo) { logo.classList.add('tw-logo'); logo.removeAttribute('height'); head.prepend(logo); }
  stage.appendChild(head);
  // model bar
  const nav = $('.top .nav'); if (nav) { nav.classList.add('tw-models'); stage.appendChild(nav); }
  // intro moves under the stage, before the specs
  const intro = $('.top .intro'), rail = $('.rail');
  if (intro && rail) { const about = document.createElement('section'); about.className = 'tw-about';
    const k = intro.querySelector('.kicker'), h = intro.querySelector('h1'), l = intro.querySelector('.lede');
    [k, h, l].forEach(n => n && about.appendChild(n)); rail.parentNode.insertBefore(about, rail); }
  const hints = intro && intro.querySelector('.hints');
  const help = document.createElement('div'); help.className = 'tw-help';
  help.textContent = hints ? [...hints.querySelectorAll('li')].map(li => li.textContent).join('  ·  ') : 'Drag to orbit  ·  Scroll to zoom';
  stage.appendChild(help);
  const hideHelp = () => help.classList.add('is-gone');
  stage.addEventListener('pointerdown', hideHelp, { once: true }); stage.addEventListener('wheel', hideHelp, { once: true, passive: true });
  // options panel with one tab per section
  const dockWrap = stage.querySelector('.hud--bot'), dock = dockWrap && dockWrap.querySelector('.dock');
  if (dockWrap && dock) {
    const panel = document.createElement('div'); panel.className = 'tw-panel'; panel.id = 'tw-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Options');
    panel.innerHTML = '<div class="tw-phead"><h3>Options</h3><button class="tw-close" type="button" aria-label="Close options">×</button></div><div class="tw-tabs" role="tablist" aria-label="Option groups"></div><div class="tw-pbody"></div>';
    panel.querySelector('.tw-pbody').appendChild(dock); dockWrap.replaceWith(panel);
    const tabs = panel.querySelector('.tw-tabs'), secs = [...dock.querySelectorAll('.dock-sec')];
    const names = { 'Build on the column': 'Build', 'Brand colour': 'Colour' };
    const btns = secs.map((sec, i) => { const t = (sec.querySelector('h4') || {}).textContent || 'More';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tw-tab'; b.setAttribute('role', 'tab'); b.textContent = names[t] || t;
      b.addEventListener('click', () => show(i)); tabs.appendChild(b); return b; });
    let cur = 0;
    function show(i) { cur = i; secs.forEach((s, j) => s.classList.toggle('is-active', j === i)); btns.forEach((b, j) => b.setAttribute('aria-selected', j === i)); }
    function sync() { secs.forEach((s, j) => { btns[j].hidden = s.hidden; }); if (secs[cur] && secs[cur].hidden) { const f = secs.findIndex(s => !s.hidden); show(f < 0 ? 0 : f); } }
    new MutationObserver(sync).observe(dock, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    show(0); sync();
    const ob = document.createElement('button'); ob.type = 'button'; ob.className = 'tw-optbtn'; ob.setAttribute('aria-controls', 'tw-panel');
    ob.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 4h7M13 4h1M2 12h1M7 12h7"/><circle cx="11" cy="4" r="2"/><circle cx="5" cy="12" r="2"/></svg><span>Options</span>';
    stage.appendChild(ob);
    const setOpen = v => { panel.dataset.open = v; ob.setAttribute('aria-expanded', v); };
    setOpen(matchMedia('(min-width:1101px)').matches);
    ob.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
    panel.querySelector('.tw-close').addEventListener('click', () => { setOpen(false); ob.focus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.dataset.open === 'true' && !stage.classList.contains('is-full')) setOpen(false); });
  }
  // signature: on every model change the charge line fills and the key figures count up
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n, dec) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function countUp(el, text) {
    const parts = text.split(/(\d[\d,]*(?:\.\d+)?)/);
    if (reduce || parts.length < 2) { el.textContent = text; return; }
    // only real quantities count up: not model codes such as CCS2, and only when the value starts with a number
    const nums = parts.map((p, i) => i % 2 && /^\d/.test(text) && !/[A-Za-z]$/.test(parts[i - 1]) && !/^[A-Za-z]/.test(parts[i + 1] || '') ? { v: parseFloat(p.replace(/,/g, '')), dec: (p.split('.')[1] || '').length, comma: p.includes(',') } : null);
    if (!nums.some(Boolean)) { el.textContent = text; return; }
    const t0 = performance.now(), D = 900;
    (function step(now) { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      el.textContent = parts.map((p, i) => { const n = nums[i]; if (!n) return p; const v = n.v * e; return n.comma ? fmt(v, n.dec) : v.toFixed(n.dec); }).join('');
      if (k < 1) requestAnimationFrame(step); })(t0);
  }
  const short = s => { const c = s.split(/, | \(| – | — /)[0]; s = c.length >= 4 ? c : s; return s.length > 36 ? s.slice(0, 34).replace(/\s+\S*$/, '') + '…' : s; };
  let lastKey = '';
  function update() {
    const name = ($('.tab[aria-selected=true]') || {}).textContent || ($('#r-title') || {}).textContent || '';
    const fam = ($('.fam[aria-selected=true]') || {}).textContent || '';
    const title = ($('#r-title') || {}).textContent || '';
    $('#tw-fam').textContent = fam; $('#tw-name').textContent = name.trim();
    $('#tw-sub').textContent = title && title !== name.trim() ? title : '';
    const key = name + '|' + title; if (key === lastKey) return; lastKey = key;
    const ch = $('#tw-charge'); ch.classList.remove('is-on'); void ch.offsetWidth; ch.classList.add('is-on');
    const ul = $('#tw-stats'); ul.innerHTML = '';
    [...document.querySelectorAll('#r-table tr')].slice(0, 3).forEach(tr => { const td = tr.querySelectorAll('td'); if (td.length < 2) return;
      const li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('b');
      s.textContent = td[0].textContent; li.append(s, b); ul.appendChild(li); countUp(b, short(td[1].textContent.trim())); });
  }
  const rt = $('#r-title'); if (rt) new MutationObserver(update).observe(rt, { childList: true, characterData: true, subtree: true });
  const tb = $('#r-table'); if (tb) new MutationObserver(() => { lastKey = ''; update(); }).observe(tb, { childList: true });
  document.querySelectorAll('.tab,.fam').forEach(b => b.addEventListener('click', () => setTimeout(update, 0)));
  update();
})();
