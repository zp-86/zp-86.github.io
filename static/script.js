// I comment real prod code I swear :D

(function () {
  function init() {
    const isHome = document.body.classList.contains('home');
    if (!isHome) return;

    const cursor = document.querySelector('.custom-cursor');
    const gridBackground = document.querySelector('.grid-background');
    const carsLayer = document.querySelector('.grid-cars');
    const sections = Array.from(document.querySelectorAll('.section'));
    const scrollIndicator = document.querySelector('.scroll-indicator');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    if (cursor && gridBackground && !prefersReducedMotion && !isTouch) {
      const onMouseMove = (e) => {
        const x = e.clientX;
        const y = e.clientY;
        cursor.style.transform = `translate3d(${x - 60}px, ${y - 60}px, 0)`;
        gridBackground.style.setProperty('--x', `${(x / window.innerWidth) * 100}%`);
        gridBackground.style.setProperty('--y', `${(y / window.innerHeight) * 100}%`);
      };
      document.addEventListener('mousemove', onMouseMove, { passive: true });
    } else if (gridBackground) {
      gridBackground.style.setProperty('--x', '50%');
      gridBackground.style.setProperty('--y', '50%');
    }

    if (carsLayer && !prefersReducedMotion) {
      const gridSize = 50;
      const dpr = Math.round(window.devicePixelRatio || 1);
      const half3 = dpr === 1 ? 1 : 1.5;
      const snapToDpr = (v) => Math.round(v * dpr) / dpr;
      let cars = [];
      let rafId = null;
      let running = true;
      let lastTs = 0;
      const maxCars = 40;

      const bounds = () => ({
        w: window.innerWidth,
        h: window.innerHeight,
        cols: Math.floor(window.innerWidth / gridSize),
        rows: Math.floor(window.innerHeight / gridSize),
      });
      let b = bounds();
      window.addEventListener('resize', () => { b = bounds(); }, { passive: true });

      function spawnCar() {
        if (!running || cars.length >= maxCars) return scheduleNextSpawn();
        const horizontal = Math.random() > 0.5;
        const el = document.createElement('div');
        el.className = 'grid-car';
        carsLayer.appendChild(el);

        const speed = 60 + Math.random() * 140;
        let pos, dir;
        if (horizontal) {
          const row = Math.round(Math.random() * b.rows);
          const top = row * gridSize - half3;
          pos = { x: -12, y: top, vx: speed, vy: 0 };
          dir = 'h';
          el.style.height = '3px';
          el.style.width = '6px';
        } else {
          const col = Math.round(Math.random() * b.cols);
          const left = col * gridSize - half3;
          pos = { x: left, y: -12, vx: 0, vy: speed };
          dir = 'v';
          el.style.height = '6px';
          el.style.width = '3px';
        }
        el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        cars.push({ el, pos, dir, speed, state: 'drive', angle: 0, spinTime: 0, spinDur: 0, dev: 0, recFrom: 0, recTo: 0, recTime: 0, recDur: 0.4 });
        scheduleNextSpawn();
      }

      function scheduleNextSpawn() {
        const delay = 400 + Math.random() * 1000;
        setTimeout(() => { if (running) spawnCar(); }, delay);
      }

      function nearestAligned(value, half) {
        return Math.round(value / gridSize) * gridSize - half;
      }

      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

      function update(ts) {
        if (!running) return;
        if (!lastTs) lastTs = ts;
        const dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;

        const w = b.w, h = b.h;
        for (let i = cars.length - 1; i >= 0; i--) {
          const c = cars[i];
          const crashProbPerSec = 0.005;

          const triggerSpin = (car) => {
            if (car.state !== 'drive') return;
            car.state = 'spin';
            car.spinTime = 0;
            car.spinDur = 0.5 + Math.random() * 0.5;
            const spins = 1.5 + Math.random();
            const dirSign = Math.random() > 0.5 ? 1 : -1;
            car.dev = (Math.random() > 0.5 ? 1 : -1) * (gridSize * 0.5);
            car.angleVel = dirSign * spins * Math.PI * 2 / car.spinDur;
          };

          if (c.state === 'drive') {
            c.pos.x += c.pos.vx * dt;
            c.pos.y += c.pos.vy * dt;
            if (Math.random() < crashProbPerSec * dt) triggerSpin(c);
          } else if (c.state === 'spin') {
            c.spinTime += dt;
            if (c.dir === 'h') {
              c.pos.x += c.speed * 0.5 * dt;
              c.pos.y += (c.dev / c.spinDur) * dt;
            } else {
              c.pos.y += c.speed * 0.5 * dt;
              c.pos.x += (c.dev / c.spinDur) * dt;
            }
            c.angle += c.angleVel * dt;
            if (c.spinTime >= c.spinDur) {
              c.state = 'recover';
              c.recTime = 0;
              c.recDur = 0.45;
              if (c.dir === 'h') { c.recFrom = c.pos.y; c.recTo = nearestAligned(c.pos.y, half3); }
              else { c.recFrom = c.pos.x; c.recTo = nearestAligned(c.pos.x, half3); }
            }
          } else if (c.state === 'recover') {
            c.recTime += dt;
            const t = Math.min(1, c.recTime / c.recDur);
            const e = easeOutCubic(t);
            if (c.dir === 'h') {
              c.pos.y = c.recFrom + (c.recTo - c.recFrom) * e;
              c.pos.x += c.speed * dt;
            } else {
              c.pos.x = c.recFrom + (c.recTo - c.recFrom) * e;
              c.pos.y += c.speed * dt;
            }
            c.angle *= (1 - e);
            if (t >= 1) { c.state = 'drive'; c.angle = 0; c.dev = 0; }
          }

          const tx = snapToDpr(c.pos.x);
          const ty = snapToDpr(c.pos.y);
          c.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${c.angle}rad)`;

          if (c.pos.x > w + 20 || c.pos.y > h + 20) {
            c.el.remove();
            cars.splice(i, 1);
          }
        }

        for (let i = 0; i < cars.length; i++) {
          for (let j = i + 1; j < cars.length; j++) {
            const a = cars[i];
            const bCar = cars[j];
            if (a.state !== 'drive' || bCar.state !== 'drive') continue;
            if (a.dir === bCar.dir) continue;
            const dx = Math.abs(a.pos.x - bCar.pos.x);
            const dy = Math.abs(a.pos.y - bCar.pos.y);
            if (dx < 4 && dy < 4) {
              if (Math.random() < 0.02) {
                triggerSpin(a);
                triggerSpin(bCar);
              }
            }
          }
        }
        rafId = requestAnimationFrame(update);
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          running = false;
          if (rafId) cancelAnimationFrame(rafId);
          rafId = null;
        } else {
          running = true;
          lastTs = 0;
          rafId = requestAnimationFrame(update);
        }
      });

      spawnCar();
      rafId = requestAnimationFrame(update);
    }

    if (sections.length) {
      sections[0].classList.add('visible');

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      }, { threshold: 0.35 });
      sections.forEach(s => observer.observe(s));

      const jumpTo = (idx) => {
        const target = sections[idx];
        if (target) target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      };

      if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => jumpTo(1));
        scrollIndicator.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpTo(1); }
        });
        window.addEventListener('scroll', () => {
          scrollIndicator.style.opacity = window.scrollY > 100 ? '0' : '1';
        }, { passive: true });
      }

      document.addEventListener('keydown', (e) => {
        if (!['ArrowDown','PageDown','ArrowUp','PageUp','Home','End'].includes(e.key)) return;
        e.preventDefault();
        const current = sections.reduce((acc, s, i) => {
          const r = s.getBoundingClientRect();
          const vis = Math.max(0, Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top));
          return vis > acc.visible ? { index: i, visible: vis } : acc;
        }, { index: 0, visible: -1 }).index;

        if (e.key === 'ArrowDown' || e.key === 'PageDown') jumpTo(Math.min(current + 1, sections.length - 1));
        else if (e.key === 'ArrowUp' || e.key === 'PageUp') jumpTo(Math.max(current - 1, 0));
        else if (e.key === 'Home') jumpTo(0);
        else if (e.key === 'End') jumpTo(sections.length - 1);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
