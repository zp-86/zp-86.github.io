(() => {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const ease = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = ease(x - xi), v = ease(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const MINOR = 'rgba(233,235,238,.055)', MAJOR = 'rgba(232,180,106,.24)';

  function contour(cv){
    const area = cv.parentElement, ctx = cv.getContext('2d');
    const p = { x: .78, y: .32, sx: .78, sy: .32, in: false };
    area.addEventListener('pointermove', e => { const r = area.getBoundingClientRect(); p.x = (e.clientX - r.left) / r.width; p.y = (e.clientY - r.top) / r.height; p.in = true; });
    area.addEventListener('pointerleave', () => { p.in = false; });
    let raf = 0, running = false, visible = true, frame = 0; const t0 = performance.now();

    function draw(t){
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = r.width, h = r.height;
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const cell = 12, cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1, F = new Float32Array(cols * rows);
      p.sx += ((p.in ? p.x : .78) - p.sx) * .03; p.sy += ((p.in ? p.y : .32) - p.sy) * .03;
      const mx = p.sx * w, my = p.sy * h, s = .0036, tt = t * .018;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++){
        const x = i * cell, y = j * cell, dx = x - mx, dy = y - my;
        F[j * cols + i] = noise(x * s + tt, y * s - tt * .6) * .72 + noise(x * s * 2.1 - tt * .4, y * s * 2.1 + 7) * .28
          + .11 * Math.exp(-(dx * dx + dy * dy) / 45000);
      }
      for (let k = 1; k < 18; k++){
        const lv = k * .062; ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++){
          const a = F[j * cols + i], b = F[j * cols + i + 1], c = F[(j + 1) * cols + i + 1], e = F[(j + 1) * cols + i];
          const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (e > lv ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * cell, y = j * cell, f = (p1, p2) => (lv - p1) / (p2 - p1);
          const T = [x + cell * f(a, b), y], R = [x + cell, y + cell * f(b, c)], B = [x + cell * f(e, c), y + cell], L = [x, y + cell * f(a, e)];
          const seg = (P, Q) => { ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); };
          switch (idx){
            case 1: case 14: seg(L, B); break; case 2: case 13: seg(B, R); break; case 3: case 12: seg(L, R); break;
            case 4: case 11: seg(T, R); break; case 6: case 9: seg(T, B); break; case 7: case 8: seg(L, T); break;
            case 5: seg(L, T); seg(B, R); break; case 10: seg(T, R); seg(L, B); break;
          }
        }
        const major = k % 5 === 0;
        ctx.strokeStyle = major ? MAJOR : MINOR; ctx.lineWidth = major ? 1.2 : .9; ctx.stroke();
      }
    }
    const tick = now => { if (!running) return; if (frame++ % 3 === 0) draw((now - t0) / 1000); raf = requestAnimationFrame(tick); };
    const start = () => { if (REDUCE){ draw(6); return; } if (running || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(tick); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(area);
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
    if (REDUCE) addEventListener('resize', () => draw(6));
    start();
  }
  document.querySelectorAll('canvas.contour').forEach(contour);

  const gh = document.getElementById('gh');
  if (gh){
    fetch(gh.dataset.src).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(data => {
      const start = new Date(data.start + 'T12:00:00'), lead = start.getDay();
      const nz = data.c.filter(Boolean).sort((a, b) => a - b), q = f => nz[Math.floor((nz.length - 1) * f)] || 1;
      const t1 = q(.25), t2 = q(.5), t3 = q(.75);
      const lvl = c => !c ? '' : c <= t1 ? 'l1' : c <= t2 ? 'l2' : c <= t3 ? 'l3' : 'l4';
      const day = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      let cells = '<i class="x"></i>'.repeat(lead), months = '', lastM = start.getMonth();
      data.c.forEach((c, i) => {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const slot = i + lead, week = Math.floor(slot / 7);
        if (slot % 7 === 0 && d.getMonth() !== lastM){ lastM = d.getMonth(); if (week > 1 && week < Math.ceil((data.c.length + lead) / 7) - 2) months += `<span style="left:${week * 14}px">${d.toLocaleDateString('en-US', { month: 'short' })}</span>`; }
        cells += `<i class="${lvl(c)}" title="${c} contribution${c === 1 ? '' : 's'} on ${day(d)}"></i>`;
      });
      gh.querySelector('.months').innerHTML = months;
      gh.querySelector('.cells').innerHTML = cells;
      const total = document.getElementById('gh-total');
      if (total) total.textContent = `${data.total.toLocaleString('en-US')} contributions in the last year`;
      const pin = () => { gh.scrollLeft = gh.scrollWidth; };
      pin(); addEventListener('resize', pin);
    }).catch(() => { const sec = gh.closest('section'); if (sec) sec.hidden = true; });
  }
})();
