// Tiny WebAudio synth. No asset files needed.
let ac = null;
let muted = false;

export function initAudio() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

function tone(freq, dur, type = 'square', vol = 0.06, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, vol = 0.08, delay = 0) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(vol, t0);
  src.connect(g).connect(ac.destination);
  src.start(t0);
}

const arp = (notes, type = 'triangle', vol = 0.07, step = 0.09) =>
  notes.forEach((f, i) => tone(f, 0.18, type, vol, 0, i * step));

export function sfx(name) {
  switch (name) {
    case 'clue': tone(660, 0.08, 'square', 0.05); tone(990, 0.14, 'square', 0.05, 0, 0.08); break;
    case 'coffee': tone(440, 0.12, 'triangle', 0.08, 440); break;
    case 'cell': tone(300, 0.2, 'sawtooth', 0.05, 900); break;
    case 'cp': arp([523, 659, 784, 1047]); break;
    case 'unlock': arp([392, 523, 659, 784, 1047], 'square', 0.04, 0.07); break;
    case 'caught': tone(320, 0.5, 'sawtooth', 0.1, -260); noise(0.3, 0.08); break;
    case 'emp': tone(120, 0.45, 'sawtooth', 0.08, 900); noise(0.35, 0.06); break;
    case 'slam': tone(80, 0.45, 'sine', 0.22, -40); noise(0.4, 0.12); break;
    case 'boss': tone(55, 1.2, 'sawtooth', 0.12, 25); noise(0.6, 0.06); break;
    case 'win': arp([523, 659, 784, 1047, 1319], 'triangle', 0.08, 0.1); break;
    case 'locked': tone(180, 0.15, 'square', 0.05); break;
    default: break;
  }
}
