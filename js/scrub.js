/* Scroll scrub for the desk stations; runs before three.js loads */
(function(){
  var root = document.documentElement;
  try { var tc = document.createElement('canvas'); if (!(tc.getContext('webgl2') || tc.getContext('webgl'))) root.classList.add('no-gl'); } catch (e) { root.classList.add('no-gl'); }
  var mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  var mqSheet = matchMedia('(max-width: 759px)');
  var desk = document.getElementById('projects');
  if (!desk) return;
  var stage = desk.querySelector('.stage');
  var hero = desk.querySelector('.hero');
  var tags = Array.prototype.slice.call(desk.querySelectorAll('.tag'));
  var rail = desk.querySelector('.rail-mark');
  var anchors = ['closingline','tulip','circuit-board','forza'].map(function(id){ return document.getElementById(id); });
  var U = 4.2;
  var WB = window.WB = { g: 0, shown: 0, target: 0, layout: 'side', reduce: mqReduce.matches };
  var top = 0, dist = 1, last = 0, running = false;

  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
  function smooth(e){ return e * e * (3 - 2 * e); }
  function plateau(u){
    u = clamp(u, 0, 4);
    if (u >= 4) return 4;
    var i = Math.min(3, Math.floor(u)), f = u - i;
    return i + smooth(clamp((f - 0.35) / 0.5, 0, 1));
  }
  function measure(){
    var r = desk.getBoundingClientRect();
    top = r.top + window.scrollY;
    dist = Math.max(1, desk.offsetHeight - stage.offsetHeight);
    WB.layout = mqSheet.matches ? 'sheet' : 'side';
    WB.reduce = mqReduce.matches;
    anchors.forEach(function(a, i){ if (a) a.style.top = ((i + 1.1) / U * dist) + 'px'; });
    read();
  }
  function read(){ WB.target = clamp((window.scrollY - top) / dist, 0, 1) * U; }
  function stationY(i){ return top + (i + 0.1) / U * dist; }
  WB.stationY = stationY;

  function paint(){
    var g = WB.g, sheet = WB.layout === 'sheet', red = WB.reduce;
    var h = clamp(1 - g * 2.6, 0, 1);
    hero.style.opacity = h.toFixed(3);
    hero.style.setProperty('--hy', (-g * 60).toFixed(1) + 'px');
    hero.style.pointerEvents = h > 0.5 ? 'auto' : 'none';
    hero.style.visibility = h < 0.01 ? 'hidden' : 'visible';
    stage.style.setProperty('--hero', h.toFixed(3));
    for (var i = 0; i < tags.length; i++){
      var d = g - (i + 1), a = smooth(clamp(1 - Math.abs(d) * 2.4, 0, 1));
      var t = tags[i];
      t.style.opacity = a.toFixed(3);
      t.style.setProperty('--ty', (d * (sheet ? -70 : -56)).toFixed(1) + 'px');
      t.style.setProperty('--rot', red ? '0deg' : (-d * (sheet ? 3 : 8)).toFixed(2) + 'deg');
      t.style.pointerEvents = a > 0.6 ? 'auto' : 'none';
      t.style.visibility = a < 0.01 ? 'hidden' : 'visible';
      t.style.zIndex = a > 0.5 ? 6 : 5;
    }
    if (rail) rail.style.setProperty('--rail', (g / 4).toFixed(4));
  }
  function tick(now){
    var dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000)); last = now;
    if (WB.reduce) WB.shown = WB.target;
    else WB.shown += (WB.target - WB.shown) * (1 - Math.pow(1 - 0.075, dt * 60));
    if (Math.abs(WB.target - WB.shown) < 0.0005) WB.shown = WB.target;
    WB.g = plateau(WB.shown);
    paint();
    if (WB.shown !== WB.target) requestAnimationFrame(tick); else running = false;
  }
  function kick(){ read(); if (!running){ running = true; last = performance.now(); requestAnimationFrame(tick); } }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function(){ measure(); kick(); });
  mqReduce.addEventListener && mqReduce.addEventListener('change', function(){ measure(); kick(); });
  // keyboard: focusing a tag link brings its object into view
  tags.forEach(function(t, i){
    t.addEventListener('focusin', function(){
      var y = stationY(i + 1);
      if (Math.abs(window.scrollY - y) > 4) window.scrollTo({ top: y, behavior: WB.reduce ? 'auto' : 'smooth' });
    });
  });
  // the index card's quick jumps land exactly on each station
  Array.prototype.forEach.call(hero.querySelectorAll('[data-st]'), function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      window.scrollTo({ top: stationY(+a.getAttribute('data-st')), behavior: WB.reduce ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });
  measure();
  WB.shown = WB.target; WB.g = plateau(WB.shown); paint();
  window.addEventListener('load', function(){ measure(); kick(); });
})();
