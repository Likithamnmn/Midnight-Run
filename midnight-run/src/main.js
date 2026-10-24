import { TS, W, H, LEVELS, MESSAGES, ENDING, genLevel, bfs, mulberry32 } from './levels.js';
import { initAudio, toggleMute, sfx } from './audio.js';

/* ============================================================
   MIDNIGHT RUN
   WASD / arrows = move, SHIFT = sprint, SPACE = EMP pulse,
   P = pause, R = restart level, M = mute
   ============================================================ */

const VW = W * TS, VH = H * TS;
const TAU = Math.PI * 2;
const cv = document.getElementById('game');
cv.width = VW;
cv.height = VH;
const ctx = cv.getContext('2d');
const dk = document.createElement('canvas'); // darkness layer
dk.width = VW;
dk.height = VH;
const dctx = dk.getContext('2d');

const HEAD = '"Orbitron", "Segoe UI", sans-serif';
const MONO = '"Share Tech Mono", "Courier New", monospace';
const PAL = { cyan: '#59f3ff', pink: '#ff5fd2', gold: '#ffd166', red: '#ff4d5e', green: '#5dffa3', violet: '#a98bff' };

/* ---------------- input ---------------- */
const keys = new Set();
const pressed = new Set();
const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
addEventListener('keydown', (e) => {
  if (BLOCK.includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  initAudio();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const down = (...c) => c.some((k) => keys.has(k));

/* ---------------- state ---------------- */
let state = 'title'; // title | intro | play | pause | clear | gameover | win
let levelIdx = 0;
let L = null;
let mapCv = null;
let time = 0;
let shake = 0;
let flash = 0;
let endT = 0;
let best = 0;
try { best = +localStorage.getItem('midnight-run-best') || 0; } catch { /* ignore */ }

const G = { score: 0, catches: 0, startScore: 0, startCatches: 0 };
const P = { x: 0, y: 0, r: 9, stamina: 1, tired: false, alert: 0, inv: 0, emp: 2, fx: 1, fy: 0, trail: [], sprinting: false, lit: false };
let particles = [];
const rain = Array.from({ length: 110 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, l: 8 + Math.random() * 10, s: 420 + Math.random() * 300 }));

/* ---------------- helpers ---------------- */
const tile = (v) => Math.floor(v / TS);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function txt(s, x, y, o = {}) {
  const { font = MONO, size = 16, weight = '', color = '#e8ecff', align = 'left', glow = 0, glowColor, alpha = 1 } = o;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`.trim();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = glowColor || color; ctx.shadowBlur = glow; }
  ctx.fillText(s, x, y);
  ctx.restore();
}
function wrap(s, maxW, font) {
  ctx.save();
  ctx.font = font;
  const lines = [];
  let line = '';
  for (const w of s.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}
function burst(x, y, color, n = 14, sp = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = sp * (0.3 + Math.random());
    const life = 0.5 + Math.random() * 0.5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 2 + Math.random() * 2 });
  }
}
function toast(text, color = PAL.cyan, t = 2.2) { L.toast = { text, color, t, max: t }; }

/* ---------------- level lifecycle ---------------- */
function startLevel(i, retry = false) {
  levelIdx = i;
  const base = LEVELS.slice(0, i).reduce((a, l) => a + l.cps, 0);
  L = genLevel(LEVELS[i], base);
  if (retry) { G.score = G.startScore; G.catches = G.startCatches; } else { G.startScore = G.score; G.startCatches = G.catches; }
  Object.assign(L, { time: L.cfg.time, catches: 0, cluesGot: 0, toast: null, msg: null, pulse: null, field: bfs(L.g, L.start.tx, L.start.ty), fieldT: 0, bonus: 0 });
  L.respawn = { x: L.start.x, y: L.start.y };
  Object.assign(P, { x: L.start.x, y: L.start.y, stamina: 1, tired: false, alert: 0, inv: 1.2, emp: 2, fx: 1, fy: 0, trail: [], sprinting: false, lit: false });
  particles = [];
  mapCv = buildMap(L);
}

function nextLevel() {
  if (levelIdx + 1 < LEVELS.length) { startLevel(levelIdx + 1); state = 'intro'; }
  else { state = 'win'; endT = 0; sfx('win'); saveBest(); }
}

function saveBest() {
  if (G.score > best) {
    best = G.score;
    try { localStorage.setItem('midnight-run-best', String(best)); } catch { /* ignore */ }
  }
}

function levelClear() {
  L.bonus = Math.floor(L.time) * 5;
  G.score += L.bonus;
  saveBest();
  sfx('win');
  state = 'clear';
}

/* ---------------- gameplay ---------------- */
function solidAt(px, py) {
  const tx = tile(px), ty = tile(py);
  return tx < 0 || ty < 0 || tx >= W || ty >= H || L.g[ty][tx] === 1;
}
const blocked = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);

function caught(reason) {
  if (P.inv > 0 || state !== 'play') return;
  L.catches++;
  G.catches++;
  G.score = Math.max(0, G.score - 50);
  L.time = Math.max(0, L.time - 8);
  P.x = L.respawn.x; P.y = L.respawn.y;
  P.alert = 0; P.inv = 2; P.stamina = 1; P.tired = false; P.trail = [];
  for (const h of L.hunters) { h.x = h.sx; h.y = h.sy; h.stun = 0; h.chasing = false; }
  if (L.boss) { const b = L.boss; b.x = b.sx; b.y = b.sy; b.age = 0; b.slam = null; b.slamCd = 4; b.stun = 2; }
  shake = 18; flash = 1;
  sfx('caught');
  toast(`${reason}  -8s`, PAL.red, 2.6);
}

function fireEmp() {
  if (P.emp <= 0 || L.pulse) return;
  P.emp--;
  L.pulse = { x: P.x, y: P.y, t: 0 };
  sfx('emp');
  shake = 6;
  const R = 175;
  for (const d of L.drones) if (Math.hypot(d.x - P.x, d.y - P.y) < R) { d.stun = 4.5; burst(d.x, d.y, '#9bd0ff', 10, 100); }
  for (const h of L.hunters) if (Math.hypot(h.x - P.x, h.y - P.y) < R) { h.stun = 3.5; burst(h.x, h.y, PAL.violet, 10, 100); }
  if (L.boss && Math.hypot(L.boss.x - P.x, L.boss.y - P.y) < R + 60) { L.boss.stun = 1.8; L.boss.slam = null; L.boss.slamCd = Math.max(L.boss.slamCd, 2); }
}

function movePlayer(dt) {
  const dx0 = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
  const dy0 = (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0);
  const moving = dx0 !== 0 || dy0 !== 0;
  let dx = dx0, dy = dy0;
  if (moving) { const m = Math.hypot(dx, dy); dx /= m; dy /= m; P.fx = dx; P.fy = dy; }

  const sprint = down('ShiftLeft', 'ShiftRight') && moving && !P.tired;
  P.sprinting = sprint;
  if (sprint) {
    P.stamina -= 0.42 * dt;
    if (P.stamina <= 0) { P.stamina = 0; P.tired = true; }
  } else {
    P.stamina = Math.min(1, P.stamina + (moving ? 0.2 : 0.4) * dt);
    if (P.tired && P.stamina > 0.3) P.tired = false;
  }

  const sp = sprint ? 235 : 150;
  const nx = P.x + dx * sp * dt;
  if (!blocked(nx, P.y, P.r)) P.x = nx;
  const ny = P.y + dy * sp * dt;
  if (!blocked(P.x, ny, P.r)) P.y = ny;

  if (moving) { P.trail.push({ x: P.x, y: P.y }); if (P.trail.length > 8) P.trail.shift(); }
  else if (P.trail.length) P.trail.shift();
}

function checkPickups() {
  for (const c of L.clues) {
    if (c.got || dist(c, P) > 18) continue;
    c.got = true; L.cluesGot++; G.score += 100;
    sfx('clue'); burst(c.x, c.y, PAL.cyan);
    if (L.cluesGot === L.clues.length) { toast('ALL CLUES FOUND  -  EXIT UNLOCKED', PAL.green, 3); sfx('unlock'); }
    else toast(`CLUE ${L.cluesGot}/${L.clues.length}`, PAL.cyan, 1.4);
    if (L.boss && !L.boss.awake) {
      L.boss.awake = true; shake = 22; sfx('boss');
      toast('THE WARDEN IS AWAKE', PAL.red, 3);
    }
  }
  for (const it of L.items) {
    if (it.got || dist(it, P) > 16) continue;
    it.got = true; G.score += 25;
    if (it.type === 'coffee') { L.time += 8; sfx('coffee'); burst(it.x, it.y, PAL.gold); toast('COFFEE  +8s', PAL.gold, 1.4); }
    else { P.emp = Math.min(4, P.emp + 1); sfx('cell'); burst(it.x, it.y, PAL.violet); toast('EMP CELL  +1', PAL.violet, 1.4); }
  }
  for (const c of L.cps) {
    if (c.active || dist(c, P) > 22) continue;
    c.active = true;
    L.respawn = { x: c.x, y: c.y };
    sfx('cp'); burst(c.x, c.y, PAL.pink, 20, 140);
    const text = MESSAGES[c.msg] || '...';
    L.msg = { text, t: 0, dur: Math.min(9, 3.5 + text.length / 18) };
    toast('CHECKPOINT', PAL.pink, 1.2);
  }
  // exit
  if (dist(L.exit, P) < 20) {
    if (L.cluesGot === L.clues.length) levelClear();
    else if (!L.toast || L.toast.t < 0.8) { toast(`LOCKED  -  ${L.clues.length - L.cluesGot} CLUE(S) MISSING`, PAL.red, 1.6); sfx('locked'); }
  }
}

function updateDrones(dt) {
  for (const d of L.drones) {
    if (d.stun > 0) {
      d.stun -= dt;
      if (Math.random() < 0.15) burst(d.x, d.y, '#9bd0ff', 2, 60);
      continue;
    }
    d.p += d.dir * d.speed * dt;
    if (d.p > d.max) { d.p = d.max; d.dir = -1; }
    if (d.p < d.min) { d.p = d.min; d.dir = 1; }
    d.x = d.ax ? d.p : d.cx;
    d.y = d.ay ? d.p : d.cy;
  }
}

function updateAlert(dt) {
  let lit = false;
  for (const d of L.drones) if (d.stun <= 0 && Math.hypot(P.x - d.x, P.y - d.y) < d.R + P.r * 0.5) lit = true;
  if (P.inv > 0) { P.inv -= dt; lit = false; }
  P.lit = lit;
  if (lit) P.alert = Math.min(1, P.alert + (P.sprinting ? 1.5 : 1.1) * dt);
  else P.alert = Math.max(0, P.alert - 0.6 * dt);
  if (P.alert >= 1) caught('SPOTTED BY A DRONE');
}

function updateHunters(dt) {
  L.fieldT -= dt;
  if (L.fieldT <= 0) { L.field = bfs(L.g, tile(P.x), tile(P.y)); L.fieldT = 0.2; }
  const speed = 80 + levelIdx * 7;
  const range = P.sprinting ? 12 : 8;
  for (const h of L.hunters) {
    if (h.stun > 0) { h.stun -= dt; continue; }
    const tx = tile(h.x), ty = tile(h.y);
    const hd = L.field[ty]?.[tx] ?? -1;
    h.chasing = hd >= 0 && hd <= (h.chasing ? range + 4 : range);
    if (!h.chasing) continue;
    let gx = P.x, gy = P.y;
    if (hd > 0) {
      let bv = hd, bx = tx, by = ty;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = L.field[ty + oy]?.[tx + ox];
        if (v !== undefined && v >= 0 && v < bv) { bv = v; bx = tx + ox; by = ty + oy; }
      }
      gx = (bx + 0.5) * TS; gy = (by + 0.5) * TS;
    }
    const dx = gx - h.x, dy = gy - h.y, m = Math.hypot(dx, dy) || 1;
    const step = Math.min(m, speed * dt);
    h.x += (dx / m) * step;
    h.y += (dy / m) * step;
    if (Math.hypot(P.x - h.x, P.y - h.y) < P.r + 10) caught('THE HOODED ONES GOT YOU');
  }
}

function updateBoss(dt) {
  const b = L.boss;
  if (!b || !b.awake) return;
  b.age += dt;
  if (b.stun > 0) b.stun -= dt;
  else {
    const sp = Math.min(70 + b.age * 3, 140);
    const dx = P.x - b.x, dy = P.y - b.y, m = Math.hypot(dx, dy) || 1;
    b.x += (dx / m) * sp * dt;
    b.y += (dy / m) * sp * dt;
    if (m < b.r + P.r) caught('THE WARDEN CAUGHT YOU');
  }
  if (b.slam) {
    b.slam.t += dt;
    if (b.slam.t >= 1) {
      if (Math.hypot(P.x - b.slam.x, P.y - b.slam.y) < b.slam.r) caught('CRUSHED BY THE WARDEN');
      shake = 14; sfx('slam');
      burst(b.slam.x, b.slam.y, PAL.red, 24, 180);
      b.slam = null;
      b.slamCd = Math.max(3.2, 6 - b.age * 0.05);
    }
  } else if (b.stun <= 0) {
    b.slamCd -= dt;
    if (b.slamCd <= 0) b.slam = { x: P.x, y: P.y, r: 95, t: 0 };
  }
}

function update(dt) {
  L.time -= dt;
  if (L.time <= 0) { L.time = 0; state = 'gameover'; sfx('caught'); return; }
  movePlayer(dt);
  checkPickups();
  if (state !== 'play') return;
  updateDrones(dt);
  updateAlert(dt);
  updateHunters(dt);
  updateBoss(dt);
  if (L.pulse) { L.pulse.t += dt; if (L.pulse.t > 0.45) L.pulse = null; }
  if (L.msg) { L.msg.t += dt; if (L.msg.t > L.msg.dur) L.msg = null; }
  if (L.toast) { L.toast.t -= dt; if (L.toast.t <= 0) L.toast = null; }
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
  particles = particles.filter((p) => p.life > 0);
  flash = Math.max(0, flash - dt * 2.2);
}

function handleInput() {
  const enter = pressed.has('Enter') || pressed.has('NumpadEnter');
  if (pressed.has('KeyM')) toggleMute();
  switch (state) {
    case 'title':
      if (enter) { G.score = 0; G.catches = 0; startLevel(0); state = 'intro'; }
      break;
    case 'intro':
      if (enter || pressed.has('Space')) { state = 'play'; P.inv = 1.2; }
      break;
    case 'play':
      if (pressed.has('KeyP') || pressed.has('Escape')) state = 'pause';
      else if (pressed.has('KeyR')) startLevel(levelIdx, true);
      else if (pressed.has('Space')) fireEmp();
      break;
    case 'pause':
      if (enter || pressed.has('KeyP') || pressed.has('Escape')) state = 'play';
      break;
    case 'clear':
      if (enter) nextLevel();
      break;
    case 'gameover':
      if (enter) { startLevel(levelIdx, true); state = 'play'; }
      break;
    case 'win':
      if (enter && endT > 6) state = 'title';
      break;
    default: break;
  }
}

/* ---------------- static art ---------------- */
const SKY = (() => {
  const r = mulberry32(5);
  const out = [];
  let x = -10;
  while (x < VW) {
    const w = 34 + r() * 40, h = 90 + r() * 190, wins = [];
    for (let wy = 14; wy < h - 10; wy += 16)
      for (let wx = 6; wx < w - 8; wx += 12)
        if (r() < 0.35) wins.push({ x: wx, y: wy, c: r() < 0.5 ? '#ffd27a' : r() < 0.5 ? PAL.cyan : PAL.pink, p: r() * 6 });
    out.push({ x, w, h, wins });
    x += w + r() * 6;
  }
  return out;
})();
const STARS = Array.from({ length: 90 }, () => ({ x: Math.random() * VW, y: Math.random() * VH * 0.6, s: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));

function drawStars(a = 1) {
  ctx.fillStyle = '#fff';
  for (const s of STARS) { ctx.globalAlpha = a * (0.4 + 0.4 * Math.sin(time * 1.5 + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
  ctx.globalAlpha = 1;
}
function drawSkyline(baseY, fill, lit) {
  for (const b of SKY) {
    ctx.fillStyle = fill;
    ctx.fillRect(b.x, baseY - b.h, b.w, b.h);
    if (!lit) continue;
    for (const w of b.wins) {
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 1.3 + w.p);
      ctx.fillStyle = w.c;
      ctx.fillRect(b.x + w.x, baseY - b.h + w.y, 5, 7);
    }
    ctx.globalAlpha = 1;
  }
}
function updateRain(dt) {
  for (const d of rain) {
    d.y += d.s * dt; d.x -= d.s * 0.12 * dt;
    if (d.y > VH) { d.y = -20; d.x = Math.random() * VW + 60; }
  }
}
function drawRain(a = 0.22) {
  ctx.strokeStyle = `rgba(170,200,255,${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of rain) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.12, d.y + d.l); }
  ctx.stroke();
}

function buildMap(lv) {
  const c = document.createElement('canvas');
  c.width = VW; c.height = VH;
  const m = c.getContext('2d');
  const rng = mulberry32(lv.cfg.seed * 31 + 7);
  const sol = (x, y) => x < 0 || y < 0 || x >= W || y >= H || lv.g[y][x] === 1;
  const rim = [PAL.cyan, PAL.pink, PAL.violet, PAL.gold];
  m.fillStyle = '#10152a';
  m.fillRect(0, 0, VW, VH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x * TS, py = y * TS;
      if (!lv.g[y][x]) {
        m.fillStyle = (x + y) % 2 ? '#151b30' : '#171e34';
        m.fillRect(px, py, TS, TS);
        if (rng() < 0.07) {
          m.fillStyle = `rgba(${rng() < 0.5 ? '89,243,255' : '255,95,210'},.08)`;
          m.beginPath(); m.ellipse(px + TS / 2, py + TS / 2, 12, 6, 0, 0, TAU); m.fill();
        }
        if (rng() < 0.05) { m.fillStyle = 'rgba(255,255,255,.05)'; m.fillRect(px + 4, py + TS / 2 - 1, 10, 2); }
      } else {
        const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        m.fillStyle = border ? '#070a14' : '#0c1020';
        m.fillRect(px, py, TS, TS);
        if (!border) {
          if (rng() < 0.25) { m.fillStyle = '#141b33'; m.fillRect(px + 5 + rng() * 8, py + 5 + rng() * 8, 8 + rng() * 6, 6 + rng() * 6); }
          if (rng() < 0.04) { m.fillStyle = PAL.red; m.beginPath(); m.arc(px + TS / 2, py + TS / 2, 1.8, 0, TAU); m.fill(); }
        }
      }
    }
  }
  // rooftop rims + neon accents on edges that face the street
  m.lineWidth = 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!lv.g[y][x]) continue;
      const px = x * TS, py = y * TS;
      const col = rim[((x >> 2) + (y >> 2)) % rim.length];
      const edges = [
        [0, -1, px, py + 1, px + TS, py + 1],
        [0, 1, px, py + TS - 1, px + TS, py + TS - 1],
        [-1, 0, px + 1, py, px + 1, py + TS],
        [1, 0, px + TS - 1, py, px + TS - 1, py + TS],
      ];
      for (const [ox, oy, x1, y1, x2, y2] of edges) {
        if (sol(x + ox, y + oy)) continue;
        const neon = rng() < 0.12;
        m.save();
        m.strokeStyle = col;
        m.globalAlpha = neon ? 0.95 : 0.3;
        if (neon) { m.shadowColor = col; m.shadowBlur = 14; }
        m.beginPath(); m.moveTo(x1, y1); m.lineTo(x2, y2); m.stroke();
        m.restore();
      }
    }
  }
  return c;
}

/* ---------------- entity drawing ---------------- */
function drawClue(c) {
  const bob = Math.sin(time * 3 + c.x) * 2;
  ctx.save();
  ctx.translate(c.x, c.y + bob);
  ctx.rotate(time * 1.2);
  ctx.shadowColor = PAL.cyan; ctx.shadowBlur = 14;
  ctx.fillStyle = PAL.cyan;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.restore();
  txt('?', c.x, c.y + bob + 1, { font: HEAD, size: 11, weight: '800', color: '#04121a', align: 'center' });
}
function drawItem(it) {
  const bob = Math.sin(time * 3 + it.x) * 2;
  ctx.save();
  ctx.translate(it.x, it.y + bob);
  if (it.type === 'coffee') {
    ctx.shadowColor = PAL.gold; ctx.shadowBlur = 10;
    ctx.fillStyle = '#c98b3a'; ctx.fillRect(-6, -4, 11, 10);
    ctx.strokeStyle = '#c98b3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(7, 1, 3.5, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.quadraticCurveTo(-1, -9, -3, -12); ctx.moveTo(2, -6); ctx.quadraticCurveTo(4, -9, 2, -12); ctx.stroke();
  } else {
    ctx.shadowColor = PAL.violet; ctx.shadowBlur = 12;
    ctx.fillStyle = PAL.violet;
    ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-5, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 9); ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawCheckpoint(c) {
  const on = c.active;
  const col = on ? '#7c4a78' : PAL.pink;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.shadowColor = col; ctx.shadowBlur = on ? 4 : 14;
  ctx.beginPath(); ctx.arc(c.x, c.y, 13 + (on ? 0 : Math.sin(time * 4) * 1.5), 0, TAU); ctx.stroke();
  ctx.fillStyle = '#2b1030';
  ctx.fillRect(c.x - 7, c.y - 5, 14, 10);
  ctx.strokeRect(c.x - 7, c.y - 5, 14, 10);
  ctx.beginPath(); ctx.moveTo(c.x - 7, c.y - 5); ctx.lineTo(c.x, c.y + 1); ctx.lineTo(c.x + 7, c.y - 5); ctx.stroke();
  ctx.restore();
}
function drawExit() {
  const e = L.exit, open = L.cluesGot === L.clues.length;
  ctx.save();
  ctx.lineWidth = 3;
  if (open) {
    ctx.strokeStyle = PAL.green; ctx.shadowColor = PAL.green; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(e.x, e.y, 12 + Math.sin(time * 5) * 2, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(93,255,163,.25)'; ctx.fill();
  } else {
    ctx.strokeStyle = PAL.red; ctx.shadowColor = PAL.red; ctx.shadowBlur = 8;
    ctx.strokeRect(e.x - 11, e.y - 11, 22, 22);
    ctx.beginPath(); ctx.moveTo(e.x - 11, e.y - 11); ctx.lineTo(e.x + 11, e.y + 11); ctx.moveTo(e.x + 11, e.y - 11); ctx.lineTo(e.x - 11, e.y + 11); ctx.stroke();
  }
  ctx.restore();
}
function drawPlayer() {
  P.trail.forEach((t, i) => {
    ctx.globalAlpha = (i / P.trail.length) * (P.sprinting ? 0.35 : 0.15);
    ctx.fillStyle = PAL.cyan;
    circle(t.x, t.y, P.r * (0.5 + (i / P.trail.length) * 0.5));
  });
  ctx.globalAlpha = 1;
  if (P.inv > 0 && Math.floor(time * 12) % 2) return;
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(P.x, P.y + 8, 9, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1d2547';
  circle(P.x, P.y, 10);
  ctx.strokeStyle = P.tired ? PAL.red : PAL.cyan; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(P.x, P.y, 10, 0, TAU); ctx.stroke();
  const a = Math.atan2(P.fy, P.fx);
  ctx.fillStyle = PAL.cyan;
  circle(P.x + Math.cos(a) * 5, P.y + Math.sin(a) * 5, 3.2);
  if (P.alert > 0) {
    ctx.strokeStyle = PAL.red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(P.x, P.y, 17, -Math.PI / 2, -Math.PI / 2 + P.alert * TAU); ctx.stroke();
  }
}
function drawHunterBody(h) {
  const sway = Math.sin(time * 5 + h.seed) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(h.x, h.y + 9, 10, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = h.stun > 0 ? '#2a2a3a' : '#07060d';
  ctx.beginPath();
  ctx.moveTo(h.x - 11 + sway, h.y + 10); ctx.lineTo(h.x, h.y - 13); ctx.lineTo(h.x + 11 + sway, h.y + 10); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(169,139,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
}
function drawHunterEyes(h) {
  if (h.stun > 0) return;
  const a = Math.atan2(P.y - h.y, P.x - h.x);
  const ex = h.x + Math.cos(a) * 3, ey = h.y - 4 + Math.sin(a) * 2;
  ctx.fillStyle = h.chasing ? PAL.red : '#a33';
  circle(ex - 3, ey, 1.8);
  circle(ex + 3, ey, 1.8);
}
function drawBossBody(b) {
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(b.x, b.y + 22, 30, 9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2a3055'; ctx.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.sin(time * 4 + i) * (b.awake && b.stun <= 0 ? 0.25 : 0);
    ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * 18, b.y + Math.sin(a) * 18); ctx.lineTo(b.x + Math.cos(a) * 36, b.y + Math.sin(a) * 36); ctx.stroke();
  }
  ctx.fillStyle = '#12162b';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; ctx.lineTo(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = b.stun > 0 ? '#556' : '#ff7a3d'; ctx.lineWidth = 3; ctx.stroke();
}
function drawBossCore(b) {
  const on = b.awake && b.stun <= 0;
  ctx.save();
  ctx.fillStyle = on ? '#ff7a3d' : '#553';
  if (on) { ctx.shadowColor = '#ff7a3d'; ctx.shadowBlur = 24; }
  circle(b.x, b.y, 8 + (on ? Math.sin(time * 6) * 1.5 : 0));
  ctx.restore();
}
function drawDroneBody(d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.fillStyle = '#232b4a';
  circle(0, 0, 7);
  ctx.strokeStyle = d.stun > 0 ? '#555' : '#8fa0ff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.stroke();
  ctx.rotate(time * (d.stun > 0 ? 0.5 : 18));
  ctx.strokeStyle = 'rgba(200,210,255,.55)';
  ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.moveTo(0, -11); ctx.lineTo(0, 11); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = d.stun > 0 ? '#444' : Math.floor(time * 4) % 2 ? PAL.red : '#611';
  circle(d.x, d.y, 2);
}

function hole(x, y, r, a) {
  const g = dctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.55, `rgba(0,0,0,${a * 0.75})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = g;
  dctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function drawDarkness() {
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, VW, VH);
  dctx.fillStyle = 'rgba(2,4,12,0.9)';
  dctx.fillRect(0, 0, VW, VH);
  dctx.globalCompositeOperation = 'destination-out';
  hole(P.x, P.y, 200, 1);
  for (const d of L.drones) if (d.stun <= 0) hole(d.x, d.y, d.R * 1.25, 0.9);
  for (const c of L.clues) if (!c.got) hole(c.x, c.y, 40, 0.55);
  for (const c of L.cps) hole(c.x, c.y, 40, 0.5);
  for (const it of L.items) if (!it.got) hole(it.x, it.y, 30, 0.45);
  hole(L.exit.x, L.exit.y, 50, 0.7);
  if (L.boss) hole(L.boss.x, L.boss.y, 120, 0.6);
  dctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(dk, 0, 0);
}
function glow(x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/* ---------------- world + HUD ---------------- */
function drawWorld() {
  ctx.save();
  if (shake > 0.3) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.9; } else shake = 0;
  ctx.drawImage(mapCv, 0, 0);

  for (const c of L.cps) drawCheckpoint(c);
  for (const c of L.clues) if (!c.got) drawClue(c);
  for (const it of L.items) if (!it.got) drawItem(it);
  drawExit();
  drawPlayer();
  for (const h of L.hunters) drawHunterBody(h);
  if (L.boss) drawBossBody(L.boss);

  drawDarkness();

  // additive light + beacons that cut through the dark
  ctx.globalCompositeOperation = 'lighter';
  for (const d of L.drones) {
    if (d.stun > 0) continue;
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.R);
    g.addColorStop(0, 'rgba(255,225,140,.34)');
    g.addColorStop(0.8, 'rgba(255,225,140,.2)');
    g.addColorStop(1, 'rgba(255,225,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(d.x - d.R, d.y - d.R, d.R * 2, d.R * 2);
  }
  for (const c of L.clues) if (!c.got) glow(c.x, c.y, 30, '89,243,255', 0.35);
  for (const c of L.cps) glow(c.x, c.y, 30, '255,95,210', c.active ? 0.12 : 0.3);
  for (const it of L.items) if (!it.got) glow(it.x, it.y, 22, it.type === 'coffee' ? '255,209,102' : '169,139,255', 0.3);
  if (L.cluesGot === L.clues.length) {
    glow(L.exit.x, L.exit.y, 46, '93,255,163', 0.45);
    const bg = ctx.createLinearGradient(0, L.exit.y, 0, L.exit.y - 220);
    bg.addColorStop(0, 'rgba(93,255,163,.35)'); bg.addColorStop(1, 'rgba(93,255,163,0)');
    ctx.fillStyle = bg; ctx.fillRect(L.exit.x - 9, L.exit.y - 220, 18, 220);
  }
  ctx.globalCompositeOperation = 'source-over';

  // drone rings + bodies, hunter eyes, boss core, telegraphs
  for (const d of L.drones) {
    if (d.stun <= 0) {
      const inside = Math.hypot(P.x - d.x, P.y - d.y) < d.R + P.r * 0.5;
      ctx.strokeStyle = inside ? 'rgba(255,77,94,.85)' : 'rgba(255,230,150,.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.R, 0, TAU); ctx.stroke();
    }
    drawDroneBody(d);
  }
  for (const h of L.hunters) drawHunterEyes(h);
  if (L.boss) {
    drawBossCore(L.boss);
    const s = L.boss.slam;
    if (s) {
      ctx.fillStyle = `rgba(255,77,94,${0.1 + 0.25 * s.t})`;
      circle(s.x, s.y, s.r);
      ctx.strokeStyle = PAL.red; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 - s.t), 0, TAU); ctx.stroke();
    }
  }
  if (L.pulse) {
    const k = L.pulse.t / 0.45;
    ctx.strokeStyle = `rgba(155,208,255,${1 - k})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(L.pulse.x, L.pulse.y, 175 * k, 0, TAU); ctx.stroke();
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  drawRain(0.2);
  ctx.restore();

  // screen-space overlays
  if (P.alert > 0.01) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, `rgba(255,0,40,${P.alert * 0.5})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,40,60,${flash * 0.45})`; ctx.fillRect(0, 0, VW, VH); }
  drawHUD();
  drawMsg();
  if (L.toast) {
    const a = Math.min(1, L.toast.t * 3, (L.toast.max - L.toast.t) * 6);
    txt(L.toast.text, VW / 2, 66, { font: HEAD, size: 16, weight: '700', color: L.toast.color, align: 'center', glow: 12, alpha: Math.max(0, a) });
  }
}

function bar(x, v, w, color, label) {
  txt(label, x, 16, { size: 11, color: '#8a93c4' });
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x + 34, 10, w, 12);
  ctx.fillStyle = color; ctx.fillRect(x + 34, 10, w * Math.max(0, Math.min(1, v)), 12);
}
function drawHUD() {
  ctx.fillStyle = 'rgba(4,6,14,.92)'; ctx.fillRect(0, 0, VW, TS);
  ctx.fillStyle = 'rgba(89,243,255,.35)'; ctx.fillRect(0, TS - 1, VW, 1);
  txt(`LV${levelIdx + 1} ${L.cfg.name.toUpperCase()}`, 12, 16, { font: HEAD, size: 12, weight: '700', color: PAL.cyan });
  txt(`CLUES ${L.cluesGot}/${L.clues.length}`, 250, 16, { size: 15 });
  const low = L.time < 15;
  txt(fmt(L.time), 380, 16, { font: HEAD, size: 16, weight: '700', color: low ? (Math.floor(time * 4) % 2 ? PAL.red : '#ff9aa4') : PAL.gold });
  bar(470, P.stamina, 60, P.tired ? PAL.red : PAL.green, 'RUN');
  bar(584, P.alert, 70, PAL.red, 'ALERT');
  txt('EMP', 712, 16, { size: 11, color: '#8a93c4' });
  for (let i = 0; i < P.emp; i++) { ctx.fillStyle = PAL.violet; circle(746 + i * 14, 16, 5); }
  txt(`SCORE ${String(G.score).padStart(5, '0')}`, VW - 12, 16, { size: 15, align: 'right', color: PAL.gold });
}
function drawMsg() {
  const m = L.msg;
  if (!m) return;
  const a = Math.max(0, Math.min(1, m.t * 4, (m.dur - m.t) * 3));
  const w = 580, h = 104, x = 20, y = VH - h - 20 + (1 - a) * 24;
  ctx.save();
  ctx.globalAlpha = a;
  rr(x, y, w, h, 14);
  ctx.fillStyle = 'rgba(22,10,42,.95)'; ctx.fill();
  ctx.strokeStyle = PAL.pink; ctx.lineWidth = 2; ctx.shadowColor = PAL.pink; ctx.shadowBlur = 12; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PAL.pink; circle(x + 30, y + 30, 16);
  txt('?', x + 30, y + 31, { font: HEAD, size: 16, weight: '800', color: '#1a0830', align: 'center' });
  txt('Unknown Number', x + 58, y + 22, { size: 13, color: PAL.pink });
  let n = Math.floor(m.t * 48), ly = y + 50;
  for (const line of wrap(m.text, w - 86, `15px ${MONO}`)) {
    if (n <= 0) break;
    txt(line.slice(0, n), x + 58, ly, { size: 15, color: '#f1e6ff' });
    n -= line.length + 1;
    ly += 19;
  }
  ctx.restore();
}

/* ---------------- screens ---------------- */
function panel(title, lines, foot, accent = PAL.cyan, h = 300) {
  ctx.fillStyle = 'rgba(2,4,12,.72)'; ctx.fillRect(0, 0, VW, VH);
  const w = 660, x = (VW - w) / 2, y = (VH - h) / 2;
  ctx.save();
  rr(x, y, w, h, 16);
  ctx.fillStyle = 'rgba(9,12,28,.96)'; ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.shadowColor = accent; ctx.shadowBlur = 16; ctx.stroke();
  ctx.restore();
  txt(title, VW / 2, y + 46, { font: HEAD, size: 26, weight: '800', color: accent, align: 'center', glow: 14 });
  let ly = y + 96;
  for (const ln of lines) {
    const o = typeof ln === 'string' ? { t: ln } : ln;
    const size = o.size || 17;
    for (const part of wrap(o.t, w - 72, `${size}px ${MONO}`)) {
      txt(part, VW / 2, ly, { size, color: o.color || '#d7dcff', align: 'center' });
      ly += size + 9;
    }
    ly += o.gap ?? 6;
  }
  if (foot) txt(foot, VW / 2, y + h - 30, { size: 16, color: PAL.gold, align: 'center', alpha: 0.65 + 0.35 * Math.sin(time * 5) });
}

function drawTitle() {
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, '#05060f'); sky.addColorStop(1, '#1a1040');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);
  drawStars();
  ctx.save();
  ctx.fillStyle = '#f4efe2'; ctx.shadowColor = '#cfe0ff'; ctx.shadowBlur = 50;
  circle(770, 150, 56);
  ctx.restore();
  ctx.fillStyle = 'rgba(30,30,60,.12)';
  circle(755, 135, 12); circle(790, 170, 8); circle(772, 120, 6);
  drawSkyline(VH - 20, '#0a0b1e', true);
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, VH - 20, VW, 20);
  drawRain(0.25);

  txt('MIDNIGHT RUN', VW / 2, 190, { font: HEAD, size: 66, weight: '800', color: '#fff', align: 'center', glow: 28, glowColor: PAL.pink });
  txt('MIDNIGHT RUN', VW / 2 + 2, 192, { font: HEAD, size: 66, weight: '800', color: PAL.cyan, align: 'center', alpha: 0.22 });
  txt("You're locked in the city after midnight.", VW / 2, 262, { size: 19, color: '#d7dcff', align: 'center' });
  txt('Grab the clues. Dodge the drones. Lose the hooded ones.', VW / 2, 290, { size: 17, color: '#aab3e8', align: 'center' });
  txt('Someone keeps leaving you messages.', VW / 2, 322, { size: 17, color: PAL.pink, align: 'center', glow: 8 });

  rr(190, 356, 580, 82, 12);
  ctx.fillStyle = 'rgba(8,10,26,.8)'; ctx.fill();
  ctx.strokeStyle = 'rgba(89,243,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
  txt('WASD / ARROWS  move        SHIFT  sprint', VW / 2, 380, { size: 16, align: 'center' });
  txt('SPACE  EMP pulse (stuns drones)        P  pause', VW / 2, 404, { size: 16, align: 'center' });
  txt('R  restart level        M  mute', VW / 2, 426, { size: 14, color: '#8a93c4', align: 'center' });

  txt('PRESS ENTER', VW / 2, 480, { font: HEAD, size: 22, weight: '700', color: PAL.gold, align: 'center', glow: 10, alpha: 0.6 + 0.4 * Math.sin(time * 4) });
  if (best) txt(`BEST SCORE ${best}`, VW / 2, 516, { size: 14, color: '#8a93c4', align: 'center' });
}

function figure(x, y, color, scarf) {
  ctx.fillStyle = color;
  rr(x - 9, y - 36, 18, 36, 5); ctx.fill();
  circle(x, y - 46, 8);
  if (scarf) { ctx.fillStyle = scarf; ctx.fillRect(x - 9, y - 36, 18, 5); }
}
function drawEnding() {
  const t = endT;
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, '#150c36'); sky.addColorStop(0.55, '#8a3a7a'); sky.addColorStop(1, '#ff9a6b');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);
  drawStars(Math.max(0, 1 - t / 10));
  const sunY = VH * 0.66 - Math.min(1, t / 12) * 80;
  ctx.save(); ctx.fillStyle = '#ffe2a8'; ctx.shadowColor = '#ffb36b'; ctx.shadowBlur = 60; circle(VW * 0.68, sunY, 54); ctx.restore();
  drawSkyline(VH * 0.74, '#0b0a1e', true);
  ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, VH * 0.74, VW, VH * 0.26);
  ctx.strokeStyle = '#2a2a50'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, VH * 0.74 + 8); ctx.lineTo(VW, VH * 0.74 + 8); ctx.stroke();
  const fy = VH * 0.74 + 50;
  figure(VW * 0.42, fy, '#1d2547', PAL.cyan);
  figure(VW * 0.52, fy, '#3a1a4a', PAL.pink);
  // coffee + steam
  ctx.fillStyle = '#e8ddc8'; ctx.fillRect(VW * 0.52 - 22, fy - 28, 7, 9);
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    const sx = VW * 0.52 - 20 + i * 3;
    ctx.beginPath(); ctx.moveTo(sx, fy - 30); ctx.quadraticCurveTo(sx + 4 * Math.sin(time * 2 + i), fy - 38, sx, fy - 46); ctx.stroke();
  }
  drawRain(0.08);

  const shown = Math.min(ENDING.length, 1 + Math.floor(t / 3.4));
  const done = shown === ENDING.length && t > ENDING.length * 3.4;
  const visible = ENDING.slice(Math.max(0, shown - 3), shown);
  const bx = 40, bw = VW - 80, bh = 150, by = VH - bh - 20;
  rr(bx, by, bw, bh, 14);
  ctx.fillStyle = 'rgba(6,6,20,.86)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1; ctx.stroke();
  let ly = by + 28;
  visible.forEach((l, i) => {
    const last = i === visible.length - 1;
    const color = l.who === 'Unknown' ? PAL.pink : l.who === 'You' ? PAL.cyan : '#d7dcff';
    const line = l.who ? `${l.who}: ${l.text}` : l.text;
    const part = last ? line.slice(0, Math.floor((t - (shown - 1) * 3.4) * 60) + 1) : line;
    for (const w of wrap(part, bw - 40, `16px ${MONO}`)) {
      txt(w, bx + 20, ly, { size: 16, color, alpha: last ? 1 : 0.6 });
      ly += 22;
    }
    ly += 4;
  });

  if (done) {
    txt('THE END', VW / 2, 70, { font: HEAD, size: 44, weight: '800', color: '#fff', align: 'center', glow: 24, glowColor: PAL.pink });
    txt(`SCORE ${G.score}   BEST ${best}`, VW / 2, 120, { font: HEAD, size: 20, weight: '700', color: PAL.gold, align: 'center', glow: 8 });
    txt(`Times caught: ${G.catches}`, VW / 2, 150, { size: 16, color: '#f1e6ff', align: 'center' });
    txt('ENTER to play again', VW / 2, 182, { size: 16, color: PAL.gold, align: 'center', alpha: 0.6 + 0.4 * Math.sin(time * 5) });
  }
}

function render() {
  ctx.clearRect(0, 0, VW, VH);
  switch (state) {
    case 'title': drawTitle(); break;
    case 'win': drawEnding(); break;
    default: {
      drawWorld();
      const cfg = L.cfg;
      if (state === 'intro') {
        panel(`LEVEL ${levelIdx + 1}: ${cfg.name.toUpperCase()}`, [
          { t: cfg.sub, color: '#aab3e8', gap: 14 },
          `Collect ${cfg.clues} clues to unlock the exit.`,
          `${cfg.drones} drones patrol${cfg.hunters ? `, ${cfg.hunters} hooded hunter${cfg.hunters > 1 ? 's' : ''} lurk` : ''}.`,
          cfg.boss ? { t: 'BOSS: the Warden wakes on your first clue and tears through walls.', color: PAL.red } : `Time limit ${fmt(cfg.time)}.`,
        ], 'PRESS ENTER', PAL.cyan, 330);
      } else if (state === 'pause') {
        panel('PAUSED', ['P or ENTER to resume', 'R restarts the level'], null, PAL.violet, 200);
      } else if (state === 'clear') {
        panel('LEVEL CLEAR', [
          `Time bonus +${L.bonus}`,
          `Times caught: ${L.catches}`,
          { t: `Score ${G.score}`, color: PAL.gold, gap: 14 },
          { t: cfg.outro ? `Unknown Number: "${cfg.outro}"` : '', color: PAL.pink },
        ], 'PRESS ENTER', PAL.green, 340);
      } else if (state === 'gameover') {
        panel('TIME UP', [
          { t: 'The city closes in. Sunrise never comes.', color: '#aab3e8', gap: 14 },
          `Clues found: ${L.cluesGot}/${L.clues.length}`,
          'Tip: grab coffee for +8s, and use EMP to freeze drones.',
        ], 'ENTER to retry', PAL.red, 300);
      }
    }
  }
}

/* ---------------- main loop ---------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  time += dt;
  updateRain(dt);
  handleInput();
  if (state === 'play') update(dt);
  else if (state === 'win') endT += dt;
  render();
  pressed.clear();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
