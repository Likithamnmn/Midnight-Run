// Level configs, the mystery texter's messages, and the procedural city generator.
// Tweak LEVELS to rebalance difficulty. Same seed = same city every time.

export const TS = 32; // tile size (px)
export const W = 30; // tiles wide
export const H = 20; // tiles tall

export const LEVELS = [
  {
    name: 'Neon Alley', seed: 11, buildings: 9, clues: 3, cps: 2, drones: 2, hunters: 0,
    coffee: 2, cells: 0, time: 80, droneSpeed: 55, light: 66,
    sub: 'Warm-up. Nobody is watching. Probably.',
    outro: 'Smooth. Next block is a market. Bring snacks.',
  },
  {
    name: 'Lantern Market', seed: 23, buildings: 11, clues: 4, cps: 2, drones: 4, hunters: 1,
    coffee: 2, cells: 1, time: 95, droneSpeed: 62, light: 70,
    sub: 'Paper lanterns, closed stalls, one very awake drone fleet.',
    outro: 'Nice pace. I am watching. Platonically. Mostly.',
  },
  {
    name: 'Rainline Station', seed: 37, buildings: 12, clues: 4, cps: 3, drones: 5, hunters: 2,
    coffee: 2, cells: 1, time: 105, droneSpeed: 68, light: 72,
    sub: 'The last train left an hour ago. Something else arrived.',
    outro: 'The station clocks stopped when you ran past. Coincidence? No.',
  },
  {
    name: 'Glass District', seed: 41, buildings: 13, clues: 5, cps: 3, drones: 6, hunters: 3,
    coffee: 3, cells: 1, time: 115, droneSpeed: 74, light: 74,
    sub: 'Everything reflects. Everyone watches.',
    outro: 'The mirrors loved you. I am jealous of mirrors.',
  },
  {
    name: 'Signal Tower', seed: 58, buildings: 13, clues: 5, cps: 3, drones: 7, hunters: 4,
    coffee: 3, cells: 2, time: 125, droneSpeed: 80, light: 76,
    sub: 'Highest point in the city. Every drone reports here.',
    outro: 'Sun is almost up. Something big just woke up, though...',
  },
  {
    name: 'The Warden', seed: 73, buildings: 7, clues: 3, cps: 2, drones: 2, hunters: 0,
    coffee: 2, cells: 2, time: 110, droneSpeed: 70, light: 70, boss: true,
    sub: 'Boss escape. Your first clue wakes him up. He does not stop.',
    outro: '',
  },
];

// One message per checkpoint, in order across the whole game (15 total).
export const MESSAGES = [
  // Neon Alley
  'Hey, runner. Yes, you. Left shoulder. Do not turn around, you will ruin the form. 🌙',
  'Two checkpoints in and you still have not texted back. Rude. Still into it though.',
  // Lantern Market
  'Lantern Market at midnight. Best noodles in the city. I would call it a date but you keep leaving.',
  'FYI you look good being chased. Please do not take that as encouragement. Okay, take it a little.',
  // Rainline Station
  'I would wait for you at the station but my umbrella is only built for one. Come closer?',
  'The hooded guys? Not my type. Terrible conversationalists. You, though... talkative feet.',
  'I wrote you a poem. It rhymes "drone" with "alone". Work in progress. Do not laugh.',
  // Glass District
  'Everything here is reflective, so technically I am looking at you from every angle. Too much? Yeah. Too much.',
  'You are halfway through the night. Statistically this is where people run faster or text back.',
  'I have been holding your coffee for an hour. It is cold now. Hurry so I can complain to your face.',
  // Signal Tower
  'Highest point in the city. Great view, great signal, terrible nerves. Say something nice.',
  'Confession: those drone blinks have been me. Timing them for you since 12:01. You owe me a name.',
  'One more checkpoint and then the big one. Do not get crushed. I have not told you my favorite colour yet.',
  // The Warden
  'THAT is the Warden. I did not invite him. I would like to formally uninvite him. RUN.',
  'Past the gate there is a rooftop and a sunrise. I saved you the better seat. Do not be late. 🌙',
];

// Ending dialogue. who: '' = narration.
export const ENDING = [
  { who: '', text: 'The last gate swings open onto a rooftop. Dawn is leaking over the skyline.' },
  { who: '', text: 'A figure leans on the railing, holding two paper cups. Steam curls into the cold air.' },
  { who: 'Unknown', text: '"You are late. I have reheated these twice."' },
  { who: 'You', text: '"You are the one who has been texting me all night."' },
  { who: 'Unknown', text: '"Fifteen notes and you never replied. Wounded. Thrilled. Mostly thrilled."' },
  { who: 'Unknown', text: '"Call me Midnight. Until you text back, that is the only name you get."' },
  { who: '', text: 'Your phone buzzes. Unknown Number is now saved as: Midnight 🌙' },
];

// ---------- helpers ----------

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const solid = (g, x, y) => x < 0 || y < 0 || x >= W || y >= H || g[y][x] === 1;

// Breadth-first distance field from (sx, sy). -1 = unreachable / wall.
export function bfs(g, sx, sy) {
  const d = Array.from({ length: H }, () => Array(W).fill(-1));
  if (solid(g, sx, sy)) return d;
  const q = [[sx, sy]];
  d[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solid(g, nx, ny) || d[ny][nx] >= 0) continue;
      d[ny][nx] = d[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

const center = (t) => ({ tx: t.x, ty: t.y, x: (t.x + 0.5) * TS, y: (t.y + 0.5) * TS });

// ---------- generator ----------

export function genLevel(cfg, msgBase = 0) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = mulberry32(cfg.seed * 7919 + attempt * 104729);
    const r = (n) => Math.floor(rng() * n);

    // 1) walls on the border, empty streets inside
    const g = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 1 : 0)));

    // 2) drop buildings, always leaving a 1-tile street gap around each
    let placed = 0, tries = 0;
    while (placed < cfg.buildings && tries < 800) {
      tries++;
      const bw = 2 + r(4), bh = 2 + r(3);
      const bx = 2 + r(W - bw - 3), by = 2 + r(H - bh - 3);
      let ok = true;
      for (let y = by - 1; y <= by + bh && ok; y++)
        for (let x = bx - 1; x <= bx + bw; x++) if (g[y][x]) { ok = false; break; }
      if (!ok) continue;
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) g[y][x] = 1;
      placed++;
    }
    if (placed < cfg.buildings * 0.8) continue;

    // 3) start on the left edge, seal any unreachable pockets
    const sy = 1 + r(H - 2);
    const d = bfs(g, 1, sy);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) if (!g[y][x] && d[y][x] < 0) g[y][x] = 1;

    // 4) exit = farthest tile on the right edge
    let ey = 1, dmax = -1;
    for (let y = 1; y < H - 1; y++) if (d[y][W - 2] > dmax) { dmax = d[y][W - 2]; ey = y; }

    const floor = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) if (!g[y][x]) floor.push({ x, y, d: d[y][x] });

    const used = [{ x: 1, y: sy }, { x: W - 2, y: ey }];
    const far = (t, m) => used.every((u) => Math.abs(u.x - t.x) + Math.abs(u.y - t.y) >= m);
    const pickOne = (filter) => {
      const c = floor.filter(filter);
      if (!c.length) return null;
      const t = c[r(c.length)];
      used.push(t);
      return t;
    };

    let fail = false;

    // 5) checkpoints spread along the route
    const cps = [];
    for (let i = 0; i < cfg.cps && !fail; i++) {
      const target = (dmax * (i + 1)) / (cfg.cps + 1);
      const t = pickOne((f) => Math.abs(f.d - target) <= 1.5 && far(f, 4));
      if (!t) { fail = true; break; }
      cps.push({ ...center(t), active: false, msg: msgBase + i });
    }
    if (fail) continue;

    // 6) clues, coffee (+time), cells (+EMP)
    const clues = [];
    for (let i = 0; i < cfg.clues && !fail; i++) {
      const t = pickOne((f) => f.d >= dmax * 0.15 && far(f, 5));
      if (!t) { fail = true; break; }
      clues.push({ ...center(t), got: false });
    }
    if (fail) continue;

    const items = [];
    for (let i = 0; i < cfg.coffee + cfg.cells; i++) {
      const t = pickOne((f) => far(f, 3));
      if (!t) { fail = true; break; }
      items.push({ ...center(t), type: i < cfg.coffee ? 'coffee' : 'cell', got: false });
    }
    if (fail) continue;

    // 7) patrol drones on straight street runs
    const drones = [];
    for (let n = 0; drones.length < cfg.drones && n < 600; n++) {
      const t = floor[r(floor.length)];
      if (Math.abs(t.x - 1) + Math.abs(t.y - sy) < 9) continue;
      const horiz = rng() < 0.5;
      const dx = horiz ? 1 : 0, dy = horiz ? 0 : 1;
      let lo = 0, hi = 0;
      while (!solid(g, t.x + dx * (hi + 1), t.y + dy * (hi + 1)) && hi < 6) hi++;
      while (!solid(g, t.x - dx * (lo + 1), t.y - dy * (lo + 1)) && lo < 6) lo++;
      if (lo + hi < 4) continue;
      const cx = (t.x + 0.5) * TS, cy = (t.y + 0.5) * TS;
      const min = (horiz ? cx : cy) - lo * TS;
      const max = (horiz ? cx : cy) + hi * TS;
      const p = min + rng() * (max - min);
      drones.push({
        ax: horiz ? 1 : 0, ay: horiz ? 0 : 1, cx, cy, min, max, p,
        x: horiz ? p : cx, y: horiz ? cy : p,
        dir: rng() < 0.5 ? -1 : 1,
        speed: cfg.droneSpeed * (0.8 + rng() * 0.4),
        R: cfg.light * (0.9 + rng() * 0.25),
        stun: 0,
      });
    }

    // 8) hooded hunters
    const hunters = [];
    for (let i = 0; i < cfg.hunters; i++) {
      const t = pickOne((f) => f.d >= dmax * 0.3 && far(f, 6));
      if (!t) break;
      const c = center(t);
      hunters.push({ x: c.x, y: c.y, sx: c.x, sy: c.y, stun: 0, chasing: false, seed: rng() * 6 });
    }

    // 9) boss (ignores walls, wakes on first clue)
    const boss = cfg.boss
      ? { x: (W - 5) * TS, y: (H / 2) * TS, sx: (W - 5) * TS, sy: (H / 2) * TS, r: 26,
          awake: false, age: 0, slamCd: 4, slam: null, stun: 0 }
      : null;

    return {
      cfg, g, dmax,
      start: { tx: 1, ty: sy, x: 1.5 * TS, y: (sy + 0.5) * TS },
      exit: center({ x: W - 2, y: ey }),
      clues, cps, items, drones, hunters, boss,
    };
  }
  throw new Error('Could not generate level: ' + cfg.name);
}
