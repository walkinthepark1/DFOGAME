/* Octo Rescue — a Debris Free Oceans game.
 * Swim as the octopus, clean up ocean trash, and drag litterbugs to the deep.
 * Plain Canvas 2D + Web Audio, no dependencies. */
'use strict';
(() => {
  // ------------------------------------------------------------------ setup
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const lerp = (a, b, t) => a + (b - a) * t;

  const NAVY = '#21409a', TEAL = '#6bcbda', RAGE_RED = '#e0303a';

  const store = {
    get(k, d) { try { const v = localStorage.getItem('octo.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('octo.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const opts = { sound: store.get('sound', true), shake: store.get('shake', true) };
  let best = Number(store.get('best', 0)) || 0;

  const FACTS = [
    'Plastic doesn’t really go away in the ocean. It breaks into smaller and smaller pieces called microplastics that can last for hundreds of years.',
    'Lost and abandoned fishing nets, called “ghost nets,” keep drifting and trapping fish, turtles and seals for years.',
    'Sea turtles can mistake floating plastic bags for jellyfish, one of their favorite foods.',
    'Most ocean trash starts on land. Litter on streets and beaches gets carried to the sea by wind, rain and storm drains.',
    'Six-pack rings and balloon strings can tangle around seabirds and marine animals. Cut them up before you toss them.',
    'Cigarette butts are among the most common items picked up at beach cleanups.',
    'Swapping single-use bottles, bags and straws for reusable ones is one of the easiest ways to keep trash out of the sea.',
    'Every piece of trash picked up from a beach is one less piece that can wash into the ocean.',
  ];

  // ------------------------------------------------------------------ layout
  let W = 0, H = 0, DPR = 1, U = 1, safeTop = 0, safeBottom = 0, SURF = 0, FLOOR = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
    cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
    const s = getComputedStyle($('safe'));
    safeTop = parseFloat(s.paddingTop) || 0; safeBottom = parseFloat(s.paddingBottom) || 0;
    U = clamp(Math.min(W, H * 0.75) / 420, 0.7, 2.2);
    SURF = Math.round(Math.max(safeTop + 150 * U, H * 0.24));
    FLOOR = Math.round(H - safeBottom - 46 * U);
    buildScenery();
  }

  // ------------------------------------------------------------------ octopus sprite (from the DFO logo)
  const octoImg = new Image();
  octoImg.src = 'assets/octopus.png';
  const SPR = { pad: 6, ready: false, navy: null, red: null, white: null, w: 0, h: 0 };
  // Head position inside the logo silhouette (fractions of the unpadded image).
  const HEAD = { x: 0.665, y: 0.13 };
  function tintSprite(color, outline) {
    const iw = octoImg.naturalWidth, ih = octoImg.naturalHeight, p = SPR.pad;
    const c = document.createElement('canvas');
    c.width = iw + p * 2; c.height = ih + p * 2;
    const g = c.getContext('2d');
    // Solid color version of the mask.
    const solid = (col) => {
      const t = document.createElement('canvas'); t.width = iw; t.height = ih;
      const tg = t.getContext('2d');
      tg.drawImage(octoImg, 0, 0);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = col; tg.fillRect(0, 0, iw, ih);
      return t;
    };
    if (outline) {
      const o = solid(outline);
      for (let a = 0; a < 16; a++) g.drawImage(o, p + Math.cos(a / 16 * TAU) * 4, p + Math.sin(a / 16 * TAU) * 4);
    }
    g.drawImage(solid(color), p, p);
    return c;
  }
  octoImg.onload = () => {
    SPR.navy = tintSprite(NAVY, 'rgba(225,250,255,.95)');
    SPR.red = tintSprite(RAGE_RED, 'rgba(255,230,120,.95)');
    SPR.white = tintSprite('#ffffff', null);
    SPR.w = SPR.navy.width; SPR.h = SPR.navy.height; SPR.ready = true;
  };

  // ------------------------------------------------------------------ audio
  let actx = null, master = null;
  function audio() {
    if (!opts.sound) return null;
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
      } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(dur, vol = 0.3, freq = 1200, q = 1, type = 'bandpass', delay = 0) {
    const a = audio(); if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + delay;
    const s = a.createBufferSource(); s.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  const sfx = {
    pickup(combo) { tone(520 + combo * 90, 0.12, 'triangle', 0.22, 300); },
    splash() { noise(0.35, 0.25, 900, 0.8); },
    toss() { noise(0.25, 0.15, 2500, 2, 'highpass'); tone(300, 0.2, 'triangle', 0.08, 200); },
    hurt() { tone(160, 0.25, 'square', 0.18, -90); noise(0.15, 0.2, 400); },
    grab() { tone(110, 0.3, 'sawtooth', 0.15, 60); noise(0.3, 0.2, 300, 1, 'lowpass'); },
    chomp() {
      noise(0.12, 0.45, 500, 1, 'lowpass'); noise(0.12, 0.4, 500, 1, 'lowpass', 0.16);
      tone(90, 0.4, 'square', 0.2, -50, 0.05); tone(200, 0.5, 'sine', 0.2, -150, 0.3);
    },
    burp() { tone(95, 0.45, 'sawtooth', 0.14, -25); },
    rage() { tone(70, 0.9, 'sawtooth', 0.25, 50); tone(105, 0.9, 'sawtooth', 0.18, 70); noise(0.8, 0.2, 200, 1, 'lowpass'); },
    mad() { tone(140, 0.18, 'sawtooth', 0.1, -40); },
    level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, 0, i * 0.09)); },
    harpoon() { noise(0.2, 0.25, 3000, 3, 'highpass'); tone(700, 0.15, 'square', 0.08, -400); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.2, 0, i * 0.18)); },
  };

  // ------------------------------------------------------------------ scenery (rebuilt on resize)
  let kelp = [], rocks = [], coral = [], rays = [], clouds = [];
  function buildScenery() {
    kelp = []; rocks = []; coral = []; rays = []; clouds = [];
    const n = Math.max(4, Math.round(W / (90 * U)));
    for (let i = 0; i < n; i++) {
      kelp.push({ x: (i + rand(0.1, 0.9)) * W / n, h: rand(70, 150) * U, ph: rand(0, TAU), c: pick(['#2f8f5b', '#3a9e66', '#2b7f52']) });
    }
    for (let i = 0; i < n + 2; i++) rocks.push({ x: rand(0, W), r: rand(10, 26) * U, c: pick(['#8a7f6a', '#7a705c', '#9a8d74']) });
    for (let i = 0; i < Math.ceil(n * 0.7); i++) coral.push({ x: rand(0, W), s: rand(0.7, 1.3), c: pick(['#ff7f6b', '#ff9fb4', '#ffb14d', '#c77dff']) });
    for (let i = 0; i < 5; i++) rays.push({ x: rand(0, W), w: rand(30, 80) * U, ph: rand(0, TAU) });
    for (let i = 0; i < 4; i++) clouds.push({ x: rand(0, W), y: rand(0.25, 0.75), s: rand(0.7, 1.3), v: rand(4, 10) });
  }

  // ------------------------------------------------------------------ game state
  let state = 'menu';        // menu | play | paused | dying | over
  let G = null;              // per-run state
  let t = 0;                 // global animation clock
  let shake = 0;

  const TRASH = {
    // r: radius (U), sink: sink speed (U/s), w: pollution weight [floating, on the floor]
    bottle: { r: 9, sink: 18, w: [2, 5] },
    can:    { r: 7, sink: 30, w: [2, 5] },
    bag:    { r: 11, sink: 7, w: [3, 6] },
    rings:  { r: 9, sink: 11, w: [2, 5] },
    cup:    { r: 8, sink: 13, w: [2, 5] },
    tire:   { r: 13, sink: 42, w: [3, 7] },
    net:    { r: 17, sink: 14, w: [4, 8] },
  };
  const TRASH_COMMON = ['bottle', 'bottle', 'can', 'can', 'bag', 'bag', 'rings', 'cup'];

  const BOATS = {
    sail:    { w: 64, speed: [32, 48], litter: false, color: '#ffffff', grab: 1.0 },
    speed:   { w: 70, speed: [52, 80], litter: true,  color: '#ff5a5a', grab: 1.0 },
    harpoon: { w: 76, speed: [36, 54], litter: true,  color: '#8f9bb0', grab: 1.2 },
    trawler: { w: 112, speed: [24, 34], litter: true, color: '#e8a33d', grab: 1.9 },
  };
  const SKIN = ['#f1c7a3', '#d9a27c', '#a86f4c', '#7a4b31', '#ffdbb8'];
  const SHIRT = ['#ffd84d', '#ff8a3d', '#4dd6ff', '#7dff6a', '#ff6bcb', '#ffffff'];

  function newRun() {
    G = {
      score: 0, time: 0, level: 1, levelT: 0,
      trashCount: 0, eaten: 0, combo: 0, comboT: 0,
      pollution: 0,
      boatT: 1.5, driftT: 2.5,
      octo: {
        x: W * 0.5, y: (SURF + FLOOR) * 0.55, vx: 0, vy: 0, face: 1, tilt: 0,
        hp: 100, inv: 0, hurtT: 0, madT: 0, rage: 0, rageT: 0,
        grab: null, chompT: 0, bellyT: 0, mouthT: 0,
      },
      trash: [], boats: [], shots: [], parts: [], texts: [], victims: [], fish: [], bubbles: [],
      hints: [
        { at: 0.6, msg: 'Swim into trash to clean it up!' },
        { at: 6, msg: 'Watch the boats — who’s littering?' },
        { at: 13, msg: 'Swim up under a LITTERBUG to drag them down!' },
      ],
      hint: null, hintT: 0, banner: null, bannerT: 0, deadT: 0, reason: '',
    };
    if (best > 2000) G.hints = [];          // skip the tutorial for returning players
    target.x = G.octo.x; target.y = G.octo.y;
    for (let i = 0; i < 2; i++) spawnFishSchool(true);
  }

  // ------------------------------------------------------------------ input
  const target = { x: 0, y: 0 };
  const keys = new Set();
  let drag = null;
  cvs.addEventListener('pointerdown', (e) => {
    if (state !== 'play') return;
    audio();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { cvs.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  cvs.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || state !== 'play') return;
    const k = 1.5;   // relative drag: your thumb never covers the octopus
    target.x += (e.clientX - drag.x) * k; target.y += (e.clientY - drag.y) * k;
    drag.x = e.clientX; drag.y = e.clientY;
    clampTarget();
  });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  cvs.addEventListener('pointerup', endDrag);
  cvs.addEventListener('pointercancel', endDrag);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);
    if ((k === 'p' || k === 'escape') && (state === 'play' || state === 'paused')) togglePause();
    if (k === 'enter' && state === 'menu') startGame();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  function clampTarget() {
    target.x = clamp(target.x, 20 * U, W - 20 * U);
    target.y = clamp(target.y, SURF + 18 * U, FLOOR - 24 * U);
  }

  // ------------------------------------------------------------------ helpers
  const wave = (x) => Math.sin(x / (38 * U) + t * 1.6) * 3 * U + Math.sin(x / (17 * U) - t * 2.3) * 1.2 * U;
  function popText(x, y, msg, color = '#fff', size = 18, life = 1.1) {
    G.texts.push({ x, y, msg, color, size, life, max: life });
  }
  function burst(x, y, n, colors, spd = 80, life = 0.7, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.3, 1) * spd * U;
      G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * life, max: life, c: pick(colors), r: rand(0.6, 1.2) * size * U });
    }
  }
  function bubbles(x, y, n, spread = 10) {
    for (let i = 0; i < n; i++) G.bubbles.push({ x: x + rand(-spread, spread) * U, y: y + rand(-spread, spread) * U, r: rand(1.5, 4.5) * U, vy: -rand(30, 70) * U, ph: rand(0, TAU) });
  }
  function addShake(a) { if (opts.shake) shake = Math.max(shake, a); }
  function octoSize() { return (G.octo.rageT > 0 ? 112 : 90) * U; }
  function inRage() { return G.octo.rageT > 0; }

  function spawnTrash(kind, x, y, vx, vy, inAir) {
    const d = TRASH[kind];
    G.trash.push({
      kind, x, y, vx, vy, r: d.r * U, rot: rand(0, TAU), vr: rand(-2, 2),
      state: inAir ? 'air' : 'water', ph: rand(0, TAU),
      color: kind === 'bottle' ? pick(['#7fd6a5', '#a8e3f0', '#c9b36a']) : kind === 'can' ? pick(['#ff4d4d', '#4d8bff', '#c0c0c0', '#7dff6a']) : kind === 'cup' ? pick(['#ffffff', '#ffd84d']) : '#fff',
    });
  }

  function spawnBoat() {
    const L = G.level;
    let pool = ['sail', 'speed', 'speed'];
    if (L >= 2) pool.push('speed');
    if (L >= 3) pool.push('harpoon', 'harpoon');
    if (L >= 5) pool.push('trawler');
    if (L >= 7) pool.push('harpoon', 'trawler');
    const type = pick(pool), d = BOATS[type];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const w = d.w * U;
    const x = dir > 0 ? -w : W + w;
    // Don't stack boats on top of each other at the spawn edge.
    if (G.boats.some((b) => b.state === 'sail' && b.dir === dir && Math.abs(b.x - x) < w * 2.2)) return false;
    G.boats.push({
      type, dir, x, w, speed: rand(d.speed[0], d.speed[1]) * U * (1 + (L - 1) * 0.05),
      litter: d.litter, marked: false, state: 'sail',
      tossT: rand(1.2, 3) , windup: 0, attackT: rand(1.4, 2.4), aim: 0,
      grabT: 0, grabNeed: d.grab, hitT: 0, sinkT: 0, tilt: 0, shakeT: 0, ph: rand(0, TAU),
      skin: pick(SKIN), shirt: pick(SHIRT), hat: Math.random() < 0.5, yell: '', yellT: 0,
    });
    return true;
  }

  const SCHOOL_COLORS = ['#ffd84d', '#ff8a3d', '#6bcbda', '#ff6bcb', '#b9f2ff'];
  function spawnFishSchool(anywhere) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rand(SURF + 60 * U, FLOOR - 60 * U);
    const x0 = anywhere ? rand(0, W) : (dir > 0 ? -40 * U : W + 40 * U);
    const c = pick(SCHOOL_COLORS), n = 4 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      G.fish.push({ x: x0 - dir * rand(0, 50) * U, y: y + rand(-22, 22) * U, dir, v: rand(30, 45) * U, ph: rand(0, TAU), c, s: rand(0.8, 1.1) });
    }
  }

  // ------------------------------------------------------------------ flow
  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function startGame() {
    audio();
    newRun();
    state = 'play';
    show('menu', false); show('over', false); show('pause', false); show('pauseBtn', true);
    last = performance.now();
  }
  function togglePause() {
    if (state === 'play') { state = 'paused'; show('pause', true); drag = null; }
    else if (state === 'paused') { state = 'play'; show('pause', false); last = performance.now(); }
  }
  function toMenu() {
    state = 'menu'; G = null;
    show('pause', false); show('over', false); show('pauseBtn', false); show('menu', true);
    $('bestMenu').textContent = best;
  }
  function gameOver(reason) {
    if (state !== 'play') return;
    state = 'dying'; G.deadT = 0; G.reason = reason; drag = null;
    sfx.over();
  }
  function showGameOver() {
    state = 'over';
    show('pauseBtn', false);
    const nb = G.score > best;
    if (nb) { best = G.score; store.set('best', best); }
    $('overTitle').textContent = G.reason === 'polluted' ? 'OCEAN CHOKED' : 'OCTO DOWN!';
    $('overReason').textContent = G.reason === 'polluted'
      ? 'Too much trash piled up in the sea. Every piece you grab helps!'
      : 'The litterbugs got the better of you this time.';
    $('finalScore').textContent = G.score;
    $('statTrash').textContent = G.trashCount;
    $('statEaten').textContent = G.eaten;
    $('statLevel').textContent = G.level;
    show('newBest', nb);
    $('factText').textContent = pick(FACTS);
    show('over', true);
  }

  $('startBtn').addEventListener('click', startGame);
  $('retryBtn').addEventListener('click', startGame);
  $('menuBtn').addEventListener('click', toMenu);
  $('quitBtn').addEventListener('click', toMenu);
  $('resumeBtn').addEventListener('click', togglePause);
  $('pauseBtn').addEventListener('click', togglePause);
  const syncSound = (v) => { opts.sound = v; store.set('sound', v); $('optSound').checked = v; $('optSound2').checked = v; if (v) audio(); };
  $('optSound').checked = opts.sound; $('optSound2').checked = opts.sound; $('optShake').checked = opts.shake;
  $('optSound').addEventListener('change', (e) => syncSound(e.target.checked));
  $('optSound2').addEventListener('change', (e) => syncSound(e.target.checked));
  $('optShake').addEventListener('change', (e) => { opts.shake = e.target.checked; store.set('shake', opts.shake); });
  $('bestMenu').textContent = best;
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
  window.addEventListener('resize', () => { resize(); if (G) clampTarget(); });

  // ------------------------------------------------------------------ update
  function update(dt) {
    t += dt;
    if (!G) return;   // menu: the background animates off the shared clock
    if (state === 'dying') {
      G.deadT += dt;
      updateWorld(dt * 0.35, false);
      if (G.deadT > 1.4) showGameOver();
      return;
    }
    if (state !== 'play') return;
    G.time += dt;
    updateWorld(dt, true);
  }

  function updateWorld(dt, live) {
    const o = G.octo, L = G.level;

    // ---- level progression
    if (live) {
      G.levelT += dt;
      if (G.levelT > 32) {
        G.levelT = 0; G.level++; G.score += 100 * G.level;
        sfx.level();
        const msgs = {
          2: 'More boats on the water!', 3: 'HARPOON boats incoming!', 4: 'The litterbugs are getting bold…',
          5: 'TRAWLERS dump fishing nets!', 6: 'Rush hour on the water!',
        };
        G.banner = { a: 'LEVEL ' + G.level, b: msgs[G.level] || 'Keep the ocean clean!' }; G.bannerT = 2.6;
      }
      for (const h of G.hints) if (!h.done && G.time >= h.at) { h.done = true; G.hint = h.msg; G.hintT = 4.2; }
    }
    if (G.hintT > 0) G.hintT -= dt;
    if (G.bannerT > 0) G.bannerT -= dt;

    // ---- octopus movement
    const sp = (inRage() ? 1.5 : 1) * 400 * U;
    let kx = 0, ky = 0;
    if (keys.has('arrowleft') || keys.has('a')) kx -= 1;
    if (keys.has('arrowright') || keys.has('d')) kx += 1;
    if (keys.has('arrowup') || keys.has('w')) ky -= 1;
    if (keys.has('arrowdown') || keys.has('s')) ky += 1;
    if (live && (kx || ky)) { target.x += kx * sp * 0.75 * dt; target.y += ky * sp * 0.75 * dt; clampTarget(); }

    if (o.grab) {
      const b = o.grab;
      o.x = lerp(o.x, b.x, 1 - Math.exp(-12 * dt));
      o.y = lerp(o.y, SURF + octoSize() * 0.36, 1 - Math.exp(-12 * dt));
      target.x = o.x; target.y = o.y;
      o.vx = 0; o.vy = 0;
    } else if (live) {
      const dx = target.x - o.x, dy = target.y - o.y;
      const d = Math.hypot(dx, dy);
      // Ease toward the target, capped at the octopus's top speed.
      const step = Math.min(d * Math.min(1, 12 * dt), sp * dt);
      const nx = d > 0 ? o.x + (dx / d) * step : o.x, ny = d > 0 ? o.y + (dy / d) * step : o.y;
      o.vx = (nx - o.x) / dt; o.vy = (ny - o.y) / dt;
      o.x = nx; o.y = ny;
      if (Math.abs(o.vx) > 25 * U) o.face = o.vx > 0 ? 1 : -1;
    }
    o.tilt = lerp(o.tilt, clamp(o.vx / (500 * U), -0.35, 0.35), 1 - Math.exp(-6 * dt));
    if (Math.hypot(o.vx, o.vy) > 120 * U && Math.random() < dt * 12) bubbles(o.x - o.face * 10 * U, o.y + 20 * U, 1, 6);
    o.inv = Math.max(0, o.inv - dt); o.hurtT = Math.max(0, o.hurtT - dt);
    o.madT = Math.max(0, o.madT - dt); o.chompT = Math.max(0, o.chompT - dt);
    o.bellyT = Math.max(0, o.bellyT - dt); o.mouthT = Math.max(0, o.mouthT - dt);
    if (o.rageT > 0) {
      o.rageT -= dt; o.rage = Math.max(0, (o.rageT / 8) * 100);
      if (Math.random() < dt * 20) burst(o.x + rand(-20, 20) * U, o.y + rand(-25, 25) * U, 1, ['#ffcf4d', '#ff6b3d'], 30, 0.5, 2.5);
      if (o.rageT <= 0) { o.rage = 0; popText(o.x, o.y - 50 * U, 'calm…', '#a6ecf5', 16); }
    }
    G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;

    // ---- spawning
    if (live) {
      G.boatT -= dt;
      const maxBoats = Math.min(5, 2 + Math.floor(L / 2));
      if (G.boatT <= 0) {
        const active = G.boats.filter((b) => b.state === 'sail').length;
        if (active < maxBoats && spawnBoat()) G.boatT = Math.max(1.8, rand(4.5, 6.5) - L * 0.45);
        else G.boatT = 0.8;
      }
      G.driftT -= dt;
      if (G.driftT <= 0) {
        G.driftT = Math.max(1.6, rand(3.6, 5.5) - L * 0.3);
        const dir = Math.random() < 0.5 ? 1 : -1;
        spawnTrash(pick(TRASH_COMMON), dir > 0 ? -12 * U : W + 12 * U, rand(SURF + 20 * U, (SURF + FLOOR) * 0.5), dir * rand(18, 35) * U, 0, false);
      }
      if (Math.random() < dt * 0.12 * (1 - G.pollution / 140)) spawnFishSchool(false);
    }

    // ---- boats
    const oSize = octoSize();
    for (const b of G.boats) {
      b.yellT = Math.max(0, b.yellT - dt);
      b.hitT = Math.max(0, b.hitT - dt);
      if (b.state === 'sail') {
        b.x += b.dir * b.speed * dt;
        const onScreen = b.x > 24 * U && b.x < W - 24 * U;
        // Littering
        if (b.litter && onScreen && live) {
          if (b.windup > 0) {
            b.windup -= dt;
            if (b.windup <= 0) {
              const handX = b.x + b.dir * 6 * U, handY = SURF - 40 * U;
              if (b.type === 'trawler') {
                spawnTrash('net', handX, handY, -b.dir * rand(20, 50) * U, -rand(40, 80) * U, true);
                if (Math.random() < 0.5) spawnTrash(pick(TRASH_COMMON), handX, handY, rand(-60, 60) * U, -rand(70, 120) * U, true);
              } else {
                spawnTrash(Math.random() < 0.08 ? 'tire' : pick(TRASH_COMMON), handX, handY, rand(-70, 70) * U, -rand(70, 130) * U, true);
              }
              sfx.toss();
              const first = !b.marked;
              b.marked = true;
              b.yell = pick(['Oops!', 'Whatever!', 'Not my problem!', 'Bye trash!', 'Yeet!', 'Ocean’s big!']); b.yellT = 1.4;
              // The octopus sees it and gets MAD.
              o.madT = 2.2;
              if (!inRage()) addRage(first ? 14 : 9);
              sfx.mad();
              popText(o.x, o.y - oSize * 0.6, pick(['HEY!!', 'GRRR!', '💢', 'LITTERBUG!']), '#ff6b6b', 20, 1);
            }
          } else {
            b.tossT -= dt;
            if (b.tossT <= 0) { b.windup = 0.5; b.tossT = Math.max(1.6, rand(3.5, 5.5) - L * 0.25); }
          }
        }
        // Litterbugs fight back
        if (b.marked && live && onScreen) {
          const dx = o.x - b.x, dy = o.y - SURF;
          const near = Math.abs(dx) < 260 * U && dy < 330 * U;
          if (b.type === 'harpoon') {
            if (b.aim > 0) {
              b.aim -= dt;
              if (b.aim <= 0) fireHarpoon(b);
            } else if (near) {
              b.attackT -= dt;
              if (b.attackT <= 0) { b.aim = 0.75; b.attackT = Math.max(1.8, 3.2 - L * 0.12); }
            }
          } else if (near) {
            b.attackT -= dt;
            if (b.attackT <= 0) { throwBottle(b); b.attackT = Math.max(1.3, rand(2.2, 3.2) - L * 0.1); }
          }
        }
        // Grab check: octopus at the surface under a boat it's allowed to attack
        if (live && !o.grab && b.x > 0 && b.x < W) {
          const canGrab = b.marked || (inRage() && b.litter);
          if (canGrab && Math.abs(o.x - b.x) < b.w * 0.55 && o.y < SURF + oSize * 0.62) startGrab(b);
          else if (!canGrab && !b.litter && Math.abs(o.x - b.x) < b.w * 0.45 && o.y < SURF + oSize * 0.45 && b.yellT <= 0) {
            b.yell = pick(['Hi octopus! 👋', 'We recycle! ♻', 'Love you, octo!']); b.yellT = 1.6;
          }
        }
        if ((b.dir > 0 && b.x > W + b.w * 1.2) || (b.dir < 0 && b.x < -b.w * 1.2)) {
          b.gone = true;
          if (b.marked && live) popText(b.dir > 0 ? W - 60 * U : 60 * U, SURF - 50 * U, 'Litterbug escaped!', '#ffb0b0', 14, 1.4);
        }
      } else if (b.state === 'grabbed') {
        b.grabT += dt;
        b.shakeT += dt;
        b.tilt = Math.sin(b.shakeT * 18) * 0.12 + b.dir * 0.15 * (b.grabT / b.grabNeed);
        if (Math.random() < dt * 25) G.parts.push({ x: b.x + rand(-b.w / 2, b.w / 2), y: SURF, vx: rand(-40, 40) * U, vy: -rand(60, 140) * U, life: 0.6, max: 0.6, c: '#e8fbff', r: rand(2, 4) * U, g: 1 });
        // The boater whacks the octopus with an oar while it wrestles the boat.
        b.attackT -= dt;
        if (b.attackT <= 0 && !inRage()) {
          b.attackT = 0.7; b.hitT = 0.25;
          damage(5, 'oar');
          b.yell = pick(['Get off!', 'AAAH!', 'Help!', 'Bad octopus!', 'Mommy!']); b.yellT = 0.9;
        }
        const need = inRage() ? b.grabNeed * 0.35 : b.grabNeed;
        if (b.grabT >= need) devour(b);
      } else if (b.state === 'sinking') {
        b.sinkT += dt;
        b.tilt = lerp(b.tilt, b.dir * 0.9, 1 - Math.exp(-2 * dt));
        if (Math.random() < dt * 12) bubbles(b.x, SURF + b.sinkT * 30 * U, 1, 20);
        if (b.sinkT > 2.4) b.gone = true;
      }
    }
    G.boats = G.boats.filter((b) => !b.gone);

    // ---- victims being slurped into the octopus
    for (const v of G.victims) {
      v.t += dt;
      const mouth = mouthPos();
      const k = Math.min(1, v.t / 0.55);
      v.x = lerp(v.sx, mouth.x, k * k); v.y = lerp(v.sy, mouth.y, k * k);
      v.rot += dt * 10 * v.spin;
      if (k >= 1 && !v.done) {
        v.done = true;
        sfx.chomp();
        o.chompT = 0.5; o.bellyT = 1.6; o.mouthT = 0;
        popText(mouth.x, mouth.y - 30 * U, pick(['CHOMP!', 'GULP!', 'NOM NOM!', 'CRUNCH!']), '#ffd84d', 30, 1.2);
        burst(mouth.x, mouth.y, 14, ['#ff5a5a', '#ffd84d', '#ffffff'], 120, 0.6, 3);
        addShake(10);
        setTimeout(() => { if (G && state === 'play') { sfx.burp(); bubbles(mouth.x, mouth.y - 8 * U, 6, 6); } }, 900);
      }
    }
    G.victims = G.victims.filter((v) => !v.done);

    // ---- trash
    for (const d of G.trash) {
      const def = TRASH[d.kind];
      d.ph += dt;
      if (d.state === 'air') {
        d.vy += 320 * U * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt * 3;
        if (d.y >= SURF + wave(d.x)) {
          d.state = 'water'; d.vy *= 0.15; d.vx *= 0.35;
          sfx.splash(); burst(d.x, SURF, 6, ['#e8fbff', '#a6ecf5'], 70, 0.5, 2.5);
        }
      } else if (d.state === 'water') {
        d.vy = lerp(d.vy, def.sink * U, 1 - Math.exp(-1.5 * dt));
        d.vx = lerp(d.vx, 0, 1 - Math.exp(-0.3 * dt));
        d.x += d.vx * dt + Math.sin(d.ph * 1.7) * 10 * U * dt;
        d.y += d.vy * dt; d.rot += d.vr * dt * 0.4;
        if (d.y >= FLOOR - d.r * 0.6) { d.y = FLOOR - d.r * 0.6; d.state = 'floor'; d.vx = 0; burst(d.x, d.y, 5, ['#d9c79a', '#bfae80'], 40, 0.5, 2); }
        if (d.x < -40 * U || d.x > W + 40 * U) d.gone = true;     // drifted off with the current
      }
      // Collect
      if (live && d.state !== 'air') {
        const reach = octoSize() * 0.42 + d.r;
        if (Math.hypot(d.x - o.x, d.y - o.y) < reach) collect(d);
      }
    }
    G.trash = G.trash.filter((d) => !d.gone);

    // Pollution = everything still in the water (piles on the floor count more).
    let pol = 0;
    for (const d of G.trash) if (d.state !== 'air') pol += TRASH[d.kind].w[d.state === 'floor' ? 1 : 0];
    G.pollution = lerp(G.pollution, Math.min(100, pol), 1 - Math.exp(-4 * dt));
    if (live && pol >= 100) gameOver('polluted');

    // ---- projectiles
    for (const s of G.shots) {
      if (s.kind === 'bottle') {
        if (s.y < SURF) { s.vy += 320 * U * dt; }
        else {
          if (!s.wet) { s.wet = true; s.vx *= 0.55; s.vy *= 0.55; burst(s.x, SURF, 4, ['#e8fbff'], 50, 0.4, 2); }
          s.vx *= Math.exp(-0.8 * dt); s.vy = lerp(s.vy, 25 * U, 1 - Math.exp(-0.8 * dt));
        }
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += 8 * dt;
        if (s.wet && Math.hypot(s.vx, s.vy) < 45 * U) {
          // A missed bottle is just more trash in the sea.
          s.gone = true; spawnTrash('bottle', s.x, s.y, s.vx, s.vy, false);
        }
      } else {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (s.y > SURF && !s.wet) { s.wet = true; burst(s.x, SURF, 5, ['#e8fbff'], 60, 0.4, 2); s.vx *= 0.8; s.vy *= 0.8; }
        if (s.life <= 0 || s.y > FLOOR || s.x < -50 || s.x > W + 50) s.gone = true;
      }
      if (live && !s.gone && Math.hypot(s.x - o.x, s.y - o.y) < octoSize() * 0.38) {
        s.gone = true;
        damage(s.dmg, s.kind);
        burst(s.x, s.y, 8, ['#ffffff', '#a6ecf5', '#ff6b6b'], 90, 0.5, 2.5);
      }
    }
    G.shots = G.shots.filter((s) => !s.gone);

    // ---- particles, text, bubbles, fish
    for (const p of G.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) p.vy += 400 * U * dt; else { p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-2 * dt); }
    }
    G.parts = G.parts.filter((p) => p.life > 0);
    for (const x of G.texts) { x.life -= dt; x.y -= 34 * U * dt; }
    G.texts = G.texts.filter((x) => x.life > 0);
    for (const b of G.bubbles) { b.y += b.vy * dt; b.x += Math.sin(t * 3 + b.ph) * 12 * U * dt; }
    G.bubbles = G.bubbles.filter((b) => b.y > SURF + 2);
    for (const f of G.fish) {
      f.x += f.dir * f.v * dt; f.ph += dt * 8;
      // Fish dart away from the octopus.
      const dx = f.x - o.x, dy = f.y - o.y, d = Math.hypot(dx, dy);
      if (d < 70 * U) { f.y += (dy / (d || 1)) * 90 * U * dt; }
      f.y = clamp(f.y, SURF + 20 * U, FLOOR - 20 * U);
    }
    G.fish = G.fish.filter((f) => f.x > -80 * U && f.x < W + 80 * U);
    if (Math.random() < dt * 1.2) bubbles(rand(0, W), FLOOR - 5 * U, 1, 2);
    shake = Math.max(0, shake - dt * 30);
  }

  function addRage(n) {
    const o = G.octo;
    if (o.rageT > 0) return;
    o.rage = Math.min(100, o.rage + n);
    if (o.rage >= 100) {
      o.rageT = 8; o.madT = 0;
      sfx.rage(); addShake(14);
      G.banner = { a: 'RAAAGE!', b: 'Drag ANY polluter down — fast!' }; G.bannerT = 1.8;
      burst(o.x, o.y, 30, ['#ff3d3d', '#ffcf4d', '#ff8a3d'], 200, 0.8, 4);
    }
  }

  function collect(d) {
    d.gone = true;
    G.trashCount++;
    G.combo = G.comboT > 0 ? Math.min(G.combo + 1, 9) : 1;
    G.comboT = 2.2;
    const pts = 10 * G.combo * (inRage() ? 2 : 1);
    G.score += pts;
    addRage(2.5);
    sfx.pickup(G.combo);
    popText(d.x, d.y - 12 * U, G.combo > 1 ? `+${pts} x${G.combo}` : `+${pts}`, G.combo > 2 ? '#ffd84d' : '#ffffff', 14 + Math.min(G.combo, 6), 0.9);
    burst(d.x, d.y, 6, ['#ffffff', TEAL, '#ffd84d'], 70, 0.5, 2);
    G.octo.mouthT = 0.15;
  }

  function damage(n, src) {
    const o = G.octo;
    if (inRage() || state !== 'play') return;
    if (o.inv > 0 && src !== 'oar') return;
    o.hp = Math.max(0, o.hp - n);
    o.inv = src === 'oar' ? 0 : 0.7; o.hurtT = 0.3;
    sfx.hurt(); addShake(src === 'harpoon' ? 10 : 6);
    addRage(src === 'oar' ? 4 : 8);
    popText(o.x, o.y - octoSize() * 0.55, src === 'harpoon' ? 'OUCH!!' : src === 'oar' ? 'BONK!' : 'OW!', '#ff8a8a', 18, 0.8);
    if (o.hp <= 0) { if (o.grab) releaseGrab(); gameOver('hp'); }
  }

  function throwBottle(b) {
    const o = G.octo;
    const sx = b.x + b.dir * 4 * U, sy = SURF - 42 * U;
    const dx = o.x - sx;
    b.yell = pick(['Take that!', 'Scram, squid!', 'Back off!']); b.yellT = 1; b.hitT = 0.3;
    G.shots.push({ kind: 'bottle', x: sx, y: sy, vx: clamp(dx * 1.1, -220 * U, 220 * U), vy: -rand(60, 100) * U, rot: 0, dmg: 8, color: pick(['#7fd6a5', '#a8e3f0']) });
    sfx.toss();
  }
  function fireHarpoon(b) {
    const o = G.octo;
    const sx = b.x + b.dir * 18 * U, sy = SURF - 14 * U;
    const dx = o.x - sx, dy = o.y - sy, d = Math.hypot(dx, dy) || 1;
    const s = 300 * U;
    G.shots.push({ kind: 'harpoon', x: sx, y: sy, vx: dx / d * s, vy: dy / d * s, life: 2.5, dmg: 16 });
    b.yell = 'FIRE!'; b.yellT = 0.8;
    sfx.harpoon();
  }

  function startGrab(b) {
    const o = G.octo;
    b.state = 'grabbed'; b.grabT = 0; b.shakeT = 0; b.attackT = 0.45; b.aim = 0;
    b.yell = pick(['WHAT?!', 'AAAAH!', 'Not the octopus!', 'NOOO!']); b.yellT = 1.2;
    o.grab = b;
    sfx.grab(); addShake(8);
    popText(b.x, SURF - 70 * U, 'GOTCHA!', '#ff6b6b', 24, 1);
  }
  function releaseGrab() {
    const b = G.octo.grab;
    if (b) { b.state = 'sail'; b.tilt = 0; }
    G.octo.grab = null;
  }
  function mouthPos() {
    const o = G.octo, h = octoSize();
    const w = h * (SPR.ready ? (SPR.w - SPR.pad * 2) / (SPR.h - SPR.pad * 2) : 0.75);
    return { x: o.x + o.face * (HEAD.x - 0.5) * w, y: o.y + (HEAD.y + 0.13 - 0.5) * h };
  }
  function devour(b) {
    const o = G.octo;
    b.state = 'sinking'; b.sinkT = 0; b.marked = false;
    o.grab = null; o.mouthT = 0.6;
    G.eaten++;
    const pts = (b.type === 'trawler' ? 500 : 250) * (inRage() ? 2 : 1);
    G.score += pts;
    o.hp = Math.min(100, o.hp + 14);
    popText(b.x, SURF - 40 * U, `+${pts}  LITTERBUG DEVOURED`, '#ffd84d', 16, 1.6);
    G.victims.push({ sx: b.x, sy: SURF - 34 * U, x: b.x, y: SURF - 34 * U, t: 0, rot: 0, spin: b.dir, skin: b.skin, shirt: b.shirt, hat: b.hat });
    burst(b.x, SURF, 18, ['#8b5a2b', '#a0522d', '#ffffff', b.type === 'trawler' ? '#e8a33d' : BOATS[b.type].color], 160, 0.9, 3.5);
    // The wreck spills whatever trash the litterbug had on board.
    const spill = b.type === 'trawler' ? 3 : 1;
    for (let i = 0; i < spill; i++) spawnTrash(b.type === 'trawler' && i === 0 ? 'net' : pick(TRASH_COMMON), b.x + rand(-20, 20) * U, SURF + 8 * U, rand(-40, 40) * U, rand(5, 20) * U, false);
    addShake(12);
  }

  // ------------------------------------------------------------------ draw
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineJoin = 'round';
    const sx = shake > 0 ? rand(-shake, shake) * 0.5 : 0, sy = shake > 0 ? rand(-shake, shake) * 0.5 : 0;
    ctx.save();
    ctx.translate(sx, sy);
    const pol = G ? G.pollution / 100 : 0;
    drawSky();
    drawWater(pol);
    if (G) {
      drawFish();
      for (const d of G.trash) if (d.state === 'floor') drawTrash(d);
      for (const b of G.bubbles) drawBubble(b);
      for (const d of G.trash) if (d.state === 'water') drawTrash(d);
      drawShots(true);
      drawOcto();
      for (const b of G.boats) drawBoat(b);
      drawGrabTentacles();
      for (const v of G.victims) drawPerson(v.x, v.y, v.skin, v.shirt, v.hat, 'flail', v.rot, Math.max(0.35, 1 - v.t * 1.1));
      for (const d of G.trash) if (d.state === 'air') drawTrash(d);
      drawShots(false);
      drawSurfaceFront();
      for (const p of G.parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawTexts();
      if (inRage()) drawRageVignette();
    } else {
      drawMenuOcto();
      drawSurfaceFront();
    }
    ctx.restore();
    if (G && (state === 'play' || state === 'paused' || state === 'dying')) drawHUD();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, SURF);
    g.addColorStop(0, '#5fb8ec'); g.addColorStop(1, '#c9f0ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, SURF + 10 * U);
    // Sun
    const sunX = W * 0.82, sunY = Math.max(safeTop + 30 * U, SURF * 0.38);
    ctx.fillStyle = 'rgba(255,240,170,.5)'; ctx.beginPath(); ctx.arc(sunX, sunY, 34 * U, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(sunX, sunY, 22 * U, 0, TAU); ctx.fill();
    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (const c of clouds) {
      const x = ((c.x + t * c.v * U) % (W + 160 * U)) - 80 * U, y = safeTop + c.y * (SURF - safeTop) * 0.7;
      const s = c.s * U;
      ctx.beginPath();
      ctx.arc(x, y, 14 * s, 0, TAU); ctx.arc(x + 16 * s, y - 6 * s, 17 * s, 0, TAU);
      ctx.arc(x + 34 * s, y, 13 * s, 0, TAU); ctx.fill();
    }
  }

  function mixColor(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(pa >> 16, pb >> 16, k)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k)), bl = Math.round(lerp(pa & 255, pb & 255, k));
    return `rgb(${r},${g},${bl})`;
  }

  function drawWater(pol) {
    // Water fades from bright teal to deep blue; pollution turns it murky.
    const g = ctx.createLinearGradient(0, SURF, 0, FLOOR);
    g.addColorStop(0, mixColor('#5cc6dc', '#8a9a6a', pol * 0.8));
    g.addColorStop(0.5, mixColor('#2a8cc2', '#5d6d4c', pol * 0.8));
    g.addColorStop(1, mixColor('#1a5f9e', '#3d4a35', pol * 0.8));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, SURF + wave(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // Light rays
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rays) {
      const a = 0.05 + Math.sin(t * 0.6 + r.ph) * 0.03;
      ctx.fillStyle = `rgba(200,245,255,${Math.max(0, a * (1 - pol))})`;
      const x = r.x + Math.sin(t * 0.3 + r.ph) * 30 * U;
      ctx.beginPath(); ctx.moveTo(x, SURF); ctx.lineTo(x + r.w, SURF);
      ctx.lineTo(x + r.w * 2.2 + 80 * U, FLOOR); ctx.lineTo(x + 80 * U, FLOOR); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // Kelp
    ctx.lineCap = 'round';
    for (const k of kelp) {
      ctx.strokeStyle = k.c; ctx.lineWidth = 6 * U;
      ctx.beginPath(); ctx.moveTo(k.x, FLOOR + 10 * U);
      const segs = 6;
      for (let i = 1; i <= segs; i++) {
        const yy = FLOOR + 10 * U - (k.h * i) / segs;
        ctx.lineTo(k.x + Math.sin(t * 1.3 + k.ph + i * 0.7) * i * 2.4 * U, yy);
      }
      ctx.stroke();
    }
    // Sea floor
    const fg = ctx.createLinearGradient(0, FLOOR - 10 * U, 0, H);
    fg.addColorStop(0, '#e6d6a6'); fg.addColorStop(1, '#bfa76f');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, FLOOR + Math.sin(x / (60 * U)) * 4 * U);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    for (const r of rocks) {
      ctx.fillStyle = r.c; ctx.beginPath(); ctx.ellipse(r.x, FLOOR + 6 * U, r.r, r.r * 0.6, 0, Math.PI, 0); ctx.fill();
    }
    for (const c of coral) drawCoral(c);
    // Murk overlay
    if (pol > 0.05) { ctx.fillStyle = `rgba(70,80,40,${pol * 0.25})`; ctx.fillRect(0, SURF, W, H - SURF); }
  }

  function drawCoral(c) {
    ctx.strokeStyle = c.c; ctx.lineWidth = 5 * U * c.s; ctx.lineCap = 'round';
    const x = c.x, y = FLOOR + 4 * U, s = c.s * U;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, y - 26 * s);
    ctx.moveTo(x, y - 12 * s); ctx.lineTo(x - 12 * s, y - 24 * s); ctx.lineTo(x - 13 * s, y - 34 * s);
    ctx.moveTo(x, y - 16 * s); ctx.lineTo(x + 11 * s, y - 28 * s);
    ctx.moveTo(x, y - 26 * s); ctx.lineTo(x + 4 * s, y - 38 * s);
    ctx.stroke();
  }

  function drawSurfaceFront() {
    // A thin bright line along the surface, drawn above hulls to sell "in the water".
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.5 * U;
    ctx.beginPath();
    for (let x = 0; x <= W + 8; x += 8) { const y = SURF + wave(x); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }

  function drawBubble(b) {
    ctx.strokeStyle = 'rgba(230,250,255,.7)'; ctx.lineWidth = 1.2 * U;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
  }

  function drawFish() {
    for (const f of G.fish) {
      const s = 7 * U * f.s;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir, 1);
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 1.4, s * 0.7, 0, 0, TAU); ctx.fill();
      const tw = Math.sin(f.ph) * s * 0.3;
      ctx.beginPath(); ctx.moveTo(-s * 1.2, 0); ctx.lineTo(-s * 2.2, -s * 0.7 + tw); ctx.lineTo(-s * 2.2, s * 0.7 + tw); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b1f55'; ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.15, s * 0.18, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ---- trash art
  function drawTrash(d) {
    const s = U, r = d.r;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.state === 'floor' ? d.rot * 0.2 + 1.2 : d.rot);
    // Soft highlight so trash reads against any water color.
    ctx.fillStyle = 'rgba(255,255,160,.18)';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.5 * s; ctx.strokeStyle = 'rgba(0,0,0,.35)';
    switch (d.kind) {
      case 'bottle':
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.roundRect(-4 * s, -6 * s, 8 * s, 14 * s, 3 * s); ctx.fill(); ctx.stroke();
        ctx.fillRect(-2 * s, -10 * s, 4 * s, 5 * s);
        ctx.fillStyle = '#2f6fdd'; ctx.fillRect(-2.5 * s, -12 * s, 5 * s, 2.5 * s);
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-2.5 * s, -4 * s, 1.5 * s, 9 * s);
        break;
      case 'can':
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.roundRect(-4 * s, -6 * s, 8 * s, 12 * s, 1.5 * s); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e6e6e6'; ctx.fillRect(-4 * s, -6 * s, 8 * s, 2 * s); ctx.fillRect(-4 * s, 4 * s, 8 * s, 2 * s);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-1 * s, -2 * s, 4 * s, 3 * s);
        break;
      case 'bag': {
        const wob = Math.sin(d.ph * 3) * 1.5 * s;
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.strokeStyle = 'rgba(200,210,220,.9)';
        ctx.beginPath();
        ctx.moveTo(-8 * s, -4 * s); ctx.quadraticCurveTo(-10 * s, 8 * s + wob, 0, 10 * s);
        ctx.quadraticCurveTo(10 * s, 8 * s - wob, 8 * s, -4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(-5 * s, -6 * s, 3 * s, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(5 * s, -6 * s, 3 * s, Math.PI, 0); ctx.stroke();
        break;
      }
      case 'rings':
        ctx.strokeStyle = 'rgba(245,245,245,.95)'; ctx.lineWidth = 2 * s;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.ellipse((i - 1) * 6 * s, (j - 0.5) * 6 * s, 3.2 * s, 2.6 * s, 0, 0, TAU); ctx.stroke(); }
        break;
      case 'cup':
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.moveTo(-5 * s, -6 * s); ctx.lineTo(5 * s, -6 * s); ctx.lineTo(3.5 * s, 7 * s); ctx.lineTo(-3.5 * s, 7 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-4.5 * s, -2 * s, 9 * s, 3 * s);
        ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(1 * s, -6 * s); ctx.lineTo(3 * s, -12 * s); ctx.stroke();
        break;
      case 'tire':
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 6 * s;
        ctx.beginPath(); ctx.arc(0, 0, 9 * s, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.arc(0, 0, 9 * s, 0, TAU); ctx.stroke();
        break;
      case 'net': {
        ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 1.4 * s;
        const n = 4, sz = 30 * s;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const k = (i / n - 0.5) * sz;
          ctx.moveTo(-sz / 2, k + Math.sin(d.ph * 2 + i) * 2 * s); ctx.lineTo(sz / 2, k - Math.sin(d.ph * 2 + i) * 2 * s);
          ctx.moveTo(k, -sz / 2); ctx.lineTo(k + Math.sin(d.ph * 2 + i) * 3 * s, sz / 2);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffd84d';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((i - 1) * 12 * s, -sz / 2, 2.5 * s, 0, TAU); ctx.fill(); }
        break;
      }
    }
    ctx.restore();
  }

  function drawShots(underwater) {
    for (const s of G.shots) {
      if ((s.y > SURF) !== underwater) continue;
      ctx.save(); ctx.translate(s.x, s.y);
      if (s.kind === 'bottle') {
        ctx.rotate(s.rot);
        ctx.fillStyle = s.color; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5 * U;
        ctx.beginPath(); ctx.roundRect(-4 * U, -6 * U, 8 * U, 13 * U, 3 * U); ctx.fill(); ctx.stroke();
        ctx.fillRect(-2 * U, -10 * U, 4 * U, 5 * U);
      } else {
        ctx.rotate(Math.atan2(s.vy, s.vx));
        ctx.strokeStyle = '#5b4a3a'; ctx.lineWidth = 2.5 * U;
        ctx.beginPath(); ctx.moveTo(-26 * U, 0); ctx.lineTo(8 * U, 0); ctx.stroke();
        ctx.fillStyle = '#d8dde6';
        ctx.beginPath(); ctx.moveTo(16 * U, 0); ctx.lineTo(6 * U, -5 * U); ctx.lineTo(8 * U, 0); ctx.lineTo(6 * U, 5 * U); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- boats & people
  function drawPerson(x, y, skin, shirt, hat, pose, rot = 0, scale = 1) {
    // (x, y) = feet
    const s = U * scale;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.lineCap = 'round';
    // body
    ctx.fillStyle = shirt; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.roundRect(-5 * s, -22 * s, 10 * s, 13 * s, 3 * s); ctx.fill(); ctx.stroke();
    // legs
    ctx.strokeStyle = '#2b3a67'; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(-2.5 * s, -10 * s); ctx.lineTo(-3 * s, 0); ctx.moveTo(2.5 * s, -10 * s); ctx.lineTo(3 * s, 0); ctx.stroke();
    // arms
    ctx.strokeStyle = skin; ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    if (pose === 'toss') { ctx.moveTo(4 * s, -19 * s); ctx.lineTo(9 * s, -30 * s); ctx.moveTo(-4 * s, -19 * s); ctx.lineTo(-8 * s, -13 * s); }
    else if (pose === 'flail') {
      const f = Math.sin(t * 30) * 5 * s;
      ctx.moveTo(4 * s, -19 * s); ctx.lineTo(11 * s, -28 * s + f); ctx.moveTo(-4 * s, -19 * s); ctx.lineTo(-11 * s, -28 * s - f);
    } else if (pose === 'wave') {
      const f = Math.sin(t * 8) * 3 * s;
      ctx.moveTo(4 * s, -19 * s); ctx.lineTo(9 * s + f, -29 * s); ctx.moveTo(-4 * s, -19 * s); ctx.lineTo(-7 * s, -11 * s);
    } else { ctx.moveTo(4 * s, -19 * s); ctx.lineTo(7 * s, -11 * s); ctx.moveTo(-4 * s, -19 * s); ctx.lineTo(-7 * s, -11 * s); }
    ctx.stroke();
    // head
    ctx.fillStyle = skin; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.arc(0, -27 * s, 5.5 * s, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1b1b';
    if (pose === 'flail') {
      ctx.beginPath(); ctx.arc(-2 * s, -28 * s, 1.1 * s, 0, TAU); ctx.arc(2 * s, -28 * s, 1.1 * s, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -24.5 * s, 1.6 * s, 2 * s, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillRect(-2.5 * s, -28.5 * s, 1.4 * s, 1.4 * s); ctx.fillRect(1.2 * s, -28.5 * s, 1.4 * s, 1.4 * s);
    }
    if (hat) { ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-6 * s, -33 * s, 12 * s, 3 * s); ctx.fillRect(-4.5 * s, -36 * s, 9 * s, 4 * s); }
    ctx.restore();
  }

  function drawBoat(b) {
    const y0 = SURF + wave(b.x) + (b.state === 'sinking' ? b.sinkT * b.sinkT * 22 * U : 0);
    const bob = b.state === 'grabbed' ? Math.sin(b.shakeT * 30) * 2 * U : 0;
    const w = b.w, s = U;
    ctx.save();
    ctx.translate(b.x + bob, y0);
    ctx.rotate(b.tilt + Math.sin(t * 2 + b.ph) * 0.03);
    ctx.scale(b.dir, 1);
    if (b.state === 'sinking') ctx.globalAlpha = Math.max(0, 1 - b.sinkT / 2.4);
    const person = (px) => {
      if (b.state === 'sinking') return;
      const pose = b.state === 'grabbed' ? 'flail' : b.windup > 0 || b.hitT > 0 ? 'toss' : !b.litter && b.yellT > 0 ? 'wave' : 'idle';
      ctx.save(); ctx.scale(b.dir, 1);
      drawPerson(px * b.dir, -9 * s, b.skin, b.shirt, b.hat, pose);
      ctx.restore();
      if (b.windup > 0 || (b.hitT > 0 && b.state === 'sail')) {
        // trash held overhead
        ctx.fillStyle = '#7fd6a5'; ctx.fillRect(px + 7 * s, -44 * s, 5 * s, 9 * s);
      }
    };
    if (b.type === 'sail') {
      ctx.fillStyle = '#c8a66a'; ctx.fillRect(-1.5 * s, -78 * s, 3 * s, 70 * s);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.2 * s;
      ctx.beginPath(); ctx.moveTo(2 * s, -76 * s); ctx.lineTo(30 * s, -14 * s); ctx.lineTo(2 * s, -14 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath(); ctx.moveTo(-2 * s, -66 * s); ctx.lineTo(-22 * s, -16 * s); ctx.lineTo(-2 * s, -16 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3fbf6a'; ctx.fillRect(1 * s, -84 * s, 12 * s, 8 * s);
      ctx.fillStyle = '#fff'; ctx.font = `${7 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♻', 7 * s, -80 * s);
      person(-16 * s);
      hull(w, '#ffffff', NAVY);
    } else if (b.type === 'speed') {
      person(-8 * s);
      ctx.fillStyle = '#a6ecf5'; ctx.beginPath(); ctx.moveTo(6 * s, -10 * s); ctx.lineTo(16 * s, -22 * s); ctx.lineTo(20 * s, -10 * s); ctx.closePath(); ctx.fill();
      hull(w, '#ff5a5a', '#ffffff');
      ctx.fillStyle = '#333'; ctx.fillRect(-w / 2 - 6 * s, -10 * s, 8 * s, 14 * s);
      if (b.state === 'sail') for (let i = 0; i < 2; i++) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-w / 2 - 10 * s - i * 8 * s - Math.random() * 4 * s, 2 * s, (3 - i) * s, 0, TAU); ctx.fill(); }
    } else if (b.type === 'harpoon') {
      person(-14 * s);
      // harpoon gun on the bow
      ctx.save(); ctx.translate(20 * s, -14 * s);
      ctx.rotate(b.aim > 0 ? 0.9 : 0.4);
      ctx.fillStyle = '#4a5468'; ctx.fillRect(-2 * s, -3 * s, 20 * s, 6 * s);
      ctx.fillStyle = '#d8dde6'; ctx.beginPath(); ctx.moveTo(18 * s, -4 * s); ctx.lineTo(25 * s, 0); ctx.lineTo(18 * s, 4 * s); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#4a5468'; ctx.fillRect(16 * s, -14 * s, 8 * s, 6 * s);
      hull(w, '#8f9bb0', '#2b3a67');
    } else {
      // trawler
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-10 * s, -38 * s, 30 * s, 26 * s);
      ctx.fillStyle = '#a6ecf5'; ctx.fillRect(-6 * s, -34 * s, 8 * s, 8 * s); ctx.fillRect(6 * s, -34 * s, 8 * s, 8 * s);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-8 * s, -44 * s, 6 * s, 8 * s);
      ctx.strokeStyle = '#5b4a3a'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.moveTo(-30 * s, -12 * s); ctx.lineTo(-44 * s, -62 * s); ctx.lineTo(-56 * s, -20 * s); ctx.stroke();
      ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 1 * s;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-44 * s, -62 * s); ctx.lineTo(-60 * s + i * 5 * s, -24 * s); ctx.stroke(); }
      person(-26 * s);
      hull(w, '#e8a33d', '#2b3a67');
    }
    ctx.restore();

    // Labels drawn unrotated
    if (b.state !== 'sinking') {
      const top = y0 - (b.type === 'sail' ? 96 : b.type === 'trawler' ? 76 : 60) * U;
      if (b.marked || (inRage() && b.litter && b.state === 'sail')) {
        const pulse = 1 + Math.sin(t * 8) * 0.08;
        ctx.save(); ctx.translate(b.x, top); ctx.scale(pulse, pulse);
        ctx.fillStyle = b.marked ? '#e0303a' : 'rgba(224,48,58,.75)';
        ctx.beginPath(); ctx.roundRect(-34 * U, -9 * U, 68 * U, 18 * U, 9 * U); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `900 ${10 * U}px "Trebuchet MS", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.marked ? '😡 LITTERBUG' : 'POLLUTER', 0, 0.5 * U);
        ctx.restore();
      }
      if (b.aim > 0) {
        // Harpoon telegraph: dotted aim line
        const o = G.octo;
        ctx.save(); ctx.setLineDash([6 * U, 6 * U]); ctx.strokeStyle = `rgba(255,60,60,${0.4 + Math.sin(t * 30) * 0.3})`; ctx.lineWidth = 2 * U;
        ctx.beginPath(); ctx.moveTo(b.x + b.dir * 18 * U, y0 - 14 * U); ctx.lineTo(o.x, o.y); ctx.stroke(); ctx.restore();
      }
      if (b.yellT > 0) bubbleText(b.x, top - 22 * U, b.yell);
    }
  }
  function hull(w, color, stripe) {
    const s = U;
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -12 * s); ctx.lineTo(w / 2 + 6 * s, -14 * s);
    ctx.quadraticCurveTo(w / 2 - 4 * s, 6 * s, w / 2 - 14 * s, 8 * s);
    ctx.lineTo(-w / 2 + 8 * s, 8 * s); ctx.quadraticCurveTo(-w / 2 - 2 * s, 4 * s, -w / 2, -12 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = stripe; ctx.fillRect(-w / 2 + 2 * s, -6 * s, w - 4 * s, 3 * s);
  }
  function bubbleText(x, y, msg) {
    ctx.save();
    ctx.font = `700 ${11 * U}px "Trebuchet MS", sans-serif`;
    const tw = ctx.measureText(msg).width + 14 * U;
    x = clamp(x, tw / 2 + 4, W - tw / 2 - 4);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#21409a'; ctx.lineWidth = 1.5 * U;
    ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 10 * U, tw, 20 * U, 8 * U); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#142c6e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, x, y + 0.5 * U);
    ctx.restore();
  }

  // ---- the octopus
  function octoSprite(x, y, h, face, tilt, tint, wiggle, squash) {
    if (!SPR.ready) {
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(x, y, h * 0.4, 0, TAU); ctx.fill(); return;
    }
    const img = SPR[tint];
    const iw = SPR.w, ih = SPR.h, pad = SPR.pad;
    const scale = h / (ih - pad * 2);
    const w = iw * scale, hh = ih * scale;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt * face); ctx.scale(face * (1 / squash), squash);
    // Slice into strips and sway each one: the tentacles ripple while the head stays put.
    const N = 22;
    for (let i = 0; i < N; i++) {
      const sy = (ih / N) * i, sh = ih / N + 1;
      const k = i / N;
      const amp = Math.max(0, k - 0.22) ** 1.3 * w * wiggle;
      const dx = Math.sin(t * 5.5 - k * 7) * amp;
      ctx.drawImage(img, 0, sy, iw, sh, -w / 2 + dx, -hh / 2 + k * hh, w, sh * scale + 0.5);
    }
    ctx.restore();
  }
  function eyesAndMouth(x, y, h, face, tilt, squash, o) {
    const w = h * ((SPR.w - SPR.pad * 2) / (SPR.h - SPR.pad * 2));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt * face); ctx.scale(face / squash, squash);
    const hx = (HEAD.x - 0.5) * w, hy = (HEAD.y - 0.5) * h;
    const mad = o && (o.madT > 0 || o.rageT > 0 || o.grab);
    const er = h * 0.045;
    for (const ex of [-0.07, 0.07]) {
      const cx = hx + ex * w * 1.05, cy = hy + h * 0.045;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx, cy, er, er * 1.15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = o && o.rageT > 0 ? '#ffe14d' : '#0b1f55';
      ctx.beginPath(); ctx.arc(cx + er * 0.35, cy + er * 0.15, er * 0.55, 0, TAU); ctx.fill();
      if (mad) {
        ctx.strokeStyle = o.rageT > 0 ? '#5a0008' : '#0b1f55'; ctx.lineWidth = h * 0.028; ctx.lineCap = 'round';
        ctx.beginPath();
        // angry brows: outer ends high, inner ends low
        ctx.moveTo(cx + er * 1.3 * Math.sign(ex), cy - er * 1.9); ctx.lineTo(cx - er * 0.9 * Math.sign(ex), cy - er * 0.8);
        ctx.stroke();
      }
    }
    const mx = hx, my = hy + h * 0.13;
    if (o && (o.chompT > 0 || o.mouthT > 0 || G.victims.length)) {
      const open = o.chompT > 0 ? Math.abs(Math.sin(o.chompT * 22)) : 1;
      ctx.fillStyle = '#3a0010';
      ctx.beginPath(); ctx.ellipse(mx, my, h * 0.075, h * 0.06 * (0.25 + open * 0.75), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(mx + i * h * 0.04 - h * 0.012, my - h * 0.05 * open); ctx.lineTo(mx + i * h * 0.04 + h * 0.012, my - h * 0.05 * open); ctx.lineTo(mx + i * h * 0.04, my - h * 0.02 * open); ctx.fill(); }
    } else if (mad) {
      ctx.strokeStyle = '#0b1f55'; ctx.lineWidth = h * 0.02;
      ctx.beginPath(); ctx.moveTo(mx - h * 0.04, my + h * 0.01); ctx.lineTo(mx - h * 0.015, my - h * 0.01); ctx.lineTo(mx + h * 0.015, my + h * 0.01); ctx.lineTo(mx + h * 0.04, my - h * 0.01); ctx.stroke();
    } else {
      ctx.strokeStyle = '#0b1f55'; ctx.lineWidth = h * 0.018; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(mx, my - h * 0.02, h * 0.035, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawOcto() {
    const o = G.octo, h = octoSize();
    const flash = o.hurtT > 0 && Math.floor(t * 30) % 2 === 0;
    const tint = flash ? 'white' : o.rageT > 0 || (o.madT > 0 && Math.floor(t * 8) % 2 === 0 && o.madT > 1.4) ? 'red' : 'navy';
    const speed = Math.hypot(o.vx, o.vy) / (400 * U);
    const squash = 1 + Math.sin(t * 6) * 0.04 + (o.bellyT > 0 ? 0.08 * Math.sin(o.bellyT * 4) : 0) - Math.min(0.1, speed * 0.08);
    const bob = Math.sin(t * 2.2) * 3 * U;
    const wiggle = o.grab ? 0.04 : 0.055 + Math.min(0.05, speed * 0.04);
    if (o.rageT > 0) {
      const g = ctx.createRadialGradient(o.x, o.y, h * 0.1, o.x, o.y, h * 0.8);
      g.addColorStop(0, 'rgba(255,80,60,.45)'); g.addColorStop(1, 'rgba(255,80,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, h * 0.8, 0, TAU); ctx.fill();
    }
    octoSprite(o.x, o.y + bob, h, o.face, o.tilt, tint, wiggle, squash);
    if (o.bellyT > 0) {
      // full belly bulge
      ctx.fillStyle = o.rageT > 0 ? RAGE_RED : NAVY;
      const k = Math.min(1, o.bellyT);
      ctx.beginPath(); ctx.ellipse(o.x + o.face * h * 0.1, o.y + bob - h * 0.08, h * 0.13 * k, h * 0.1 * k, 0, 0, TAU); ctx.fill();
    }
    eyesAndMouth(o.x, o.y + bob, h, o.face, o.tilt, squash, o);
    if (o.madT > 0 && o.rageT <= 0) {
      ctx.font = `${16 * U}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💢', o.x + o.face * h * 0.38, o.y + bob - h * 0.5 + Math.sin(t * 10) * 2 * U);
    }
  }

  function drawGrabTentacles() {
    const o = G.octo, b = o.grab;
    if (!b) return;
    const h = octoSize();
    const col = inRage() ? RAGE_RED : NAVY;
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    const by = SURF + wave(b.x);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const ex = b.x + side * (b.w * (0.18 + 0.14 * (i >> 1))) + Math.sin(t * 9 + i) * 3 * U;
      const ey = by - 12 * U - (i >> 1) * 6 * U;
      ctx.lineWidth = (7 - i) * U;
      ctx.beginPath();
      ctx.moveTo(o.x + side * h * 0.12, o.y - h * 0.15);
      ctx.quadraticCurveTo(o.x + side * h * 0.55, by + 10 * U, ex, ey);
      ctx.stroke();
      // curled tip over the gunwale, like the logo
      ctx.lineWidth = Math.max(2, (4 - i * 0.6)) * U;
      ctx.beginPath(); ctx.arc(ex - side * 4 * U, ey - 3 * U, 5 * U, side > 0 ? Math.PI * 0.2 : Math.PI * 0.8, side > 0 ? Math.PI * 1.6 : -Math.PI * 0.6, side < 0); ctx.stroke();
    }
    // Wrestle progress ring
    const need = inRage() ? b.grabNeed * 0.35 : b.grabNeed;
    const k = clamp(b.grabT / need, 0, 1);
    ctx.lineWidth = 5 * U; ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(b.x, by - 82 * U, 11 * U, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffd84d';
    ctx.beginPath(); ctx.arc(b.x, by - 82 * U, 11 * U, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
  }

  function drawMenuOcto() {
    const h = 130 * U;
    const x = W * 0.5 + Math.sin(t * 0.5) * W * 0.25, y = (SURF + FLOOR) * 0.5 + Math.sin(t * 0.9) * 30 * U;
    const face = Math.cos(t * 0.5) >= 0 ? 1 : -1;
    octoSprite(x, y, h, face, Math.cos(t * 0.5) * 0.2, 'navy', 0.06, 1 + Math.sin(t * 6) * 0.04);
    eyesAndMouth(x, y, h, face, Math.cos(t * 0.5) * 0.2, 1 + Math.sin(t * 6) * 0.04, null);
  }

  function drawTexts() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const x of G.texts) {
      const a = Math.min(1, x.life / (x.max * 0.4));
      ctx.globalAlpha = a;
      ctx.font = `900 ${x.size * U}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 4 * U; ctx.strokeStyle = 'rgba(11,31,85,.85)';
      ctx.strokeText(x.msg, x.x, x.y); ctx.fillStyle = x.color; ctx.fillText(x.msg, x.x, x.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawRageVignette() {
    const a = 0.25 + Math.sin(t * 10) * 0.08;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(220,20,30,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawHUD() {
    const o = G.octo;
    const top = safeTop + 10 * U, left = 12 * U;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.font = `900 ${22 * U}px "Trebuchet MS", sans-serif`;
    ctx.lineWidth = 4 * U; ctx.strokeStyle = 'rgba(11,31,85,.8)'; ctx.fillStyle = '#fff';
    ctx.strokeText(String(G.score), left, top); ctx.fillText(String(G.score), left, top);
    ctx.font = `700 ${12 * U}px "Trebuchet MS", sans-serif`;
    const lv = `LEVEL ${G.level}` + (G.combo > 1 ? `   COMBO x${G.combo}` : '');
    ctx.strokeText(lv, left, top + 26 * U); ctx.fillText(lv, left, top + 26 * U);

    // Bars
    const bw = Math.min(150 * U, W * 0.42), bh = 9 * U;
    const bx = W - bw - 66 * U, by = top + 2 * U;
    const bar = (y, label, k, color, flash) => {
      ctx.fillStyle = 'rgba(11,31,85,.55)';
      ctx.beginPath(); ctx.roundRect(bx - 2 * U, y - 2 * U, bw + 4 * U, bh + 4 * U, 6 * U); ctx.fill();
      ctx.fillStyle = flash ? (Math.floor(t * 8) % 2 ? '#fff' : color) : color;
      ctx.beginPath(); ctx.roundRect(bx, y, Math.max(0, bw * clamp(k, 0, 1)), bh, 4 * U); ctx.fill();
      ctx.font = `800 ${9.5 * U}px "Trebuchet MS", sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * U; ctx.strokeStyle = 'rgba(11,31,85,.8)'; ctx.fillStyle = '#fff';
      ctx.strokeText(label, bx - 6 * U, y + bh / 2); ctx.fillText(label, bx - 6 * U, y + bh / 2);
    };
    bar(by, 'OCTO', o.hp / 100, o.hp < 30 ? '#ff5a5a' : '#7dff6a', o.hp < 30);
    bar(by + 16 * U, o.rageT > 0 ? 'RAGE!' : 'RAGE', o.rage / 100, o.rageT > 0 ? '#ff3d3d' : '#b07dff', o.rageT > 0);
    const health = 1 - G.pollution / 100;
    bar(by + 32 * U, 'OCEAN', health, health < 0.3 ? '#ff8a3d' : TEAL, health < 0.25);

    // Banner / hint
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (G.bannerT > 0) {
      const a = Math.min(1, G.bannerT * 2, (2.8 - G.bannerT) * 4);
      ctx.globalAlpha = clamp(a, 0, 1);
      const y = SURF + (FLOOR - SURF) * 0.3;
      ctx.font = `900 ${36 * U}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 6 * U; ctx.strokeStyle = NAVY; ctx.fillStyle = G.banner.a === 'RAAAGE!' ? '#ff4d4d' : '#ffd84d';
      ctx.strokeText(G.banner.a, W / 2, y); ctx.fillText(G.banner.a, W / 2, y);
      ctx.font = `800 ${15 * U}px "Trebuchet MS", sans-serif`; ctx.lineWidth = 4 * U; ctx.fillStyle = '#fff';
      ctx.strokeText(G.banner.b, W / 2, y + 32 * U); ctx.fillText(G.banner.b, W / 2, y + 32 * U);
      ctx.globalAlpha = 1;
    }
    if (G.hintT > 0 && G.hint) {
      ctx.globalAlpha = clamp(Math.min(G.hintT, 4.2 - G.hintT) * 3, 0, 1);
      ctx.font = `800 ${14 * U}px "Trebuchet MS", sans-serif`;
      const tw = Math.min(W - 24 * U, ctx.measureText(G.hint).width + 28 * U);
      const y = FLOOR - 70 * U;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, y - 16 * U, tw, 32 * U, 16 * U); ctx.fill();
      ctx.fillStyle = '#142c6e'; ctx.fillText(G.hint, W / 2, y + 1 * U, W - 40 * U);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  resize();
  requestAnimationFrame(frame);

  // Test hook (used by automated smoke tests only).
  window.__octo = { get G() { return G; }, get state() { return state; }, startGame, target, spawnBoat: () => G && spawnBoat(), addRage: (n) => G && addRage(n) };
})();
