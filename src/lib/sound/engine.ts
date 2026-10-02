"use client";

/**
 * Tiny WebAudio synth so the game has sound without shipping audio files.
 * Every call is a no-op unless the user has enabled sound.
 */
let ctx: AudioContext | null = null;
let enabled = false;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (v && !ctx && typeof window !== "undefined") ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (v && ctx?.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.08, when = 0) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.05, when = 0, filterHz = 1800) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + when;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterHz;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  chip: () => { tone(1400, 0.05, "triangle", 0.05); noise(0.03, 0.03, 0, 3200); },
  undo: () => tone(600, 0.06, "triangle", 0.04),
  close: () => { tone(420, 0.12, "sine", 0.06); tone(320, 0.16, "sine", 0.05, 0.08); },
  spin: () => noise(1.2, 0.025, 0, 900),
  tick: () => tone(2400, 0.02, "square", 0.012),
  drop: () => { noise(0.08, 0.06, 0, 2500); tone(900, 0.06, "triangle", 0.04); },
  win: () => { tone(660, 0.18, "sine", 0.07); tone(880, 0.2, "sine", 0.07, 0.12); tone(1320, 0.3, "sine", 0.06, 0.24); },
  lose: () => tone(220, 0.25, "sine", 0.04),
  claim: () => { tone(523, 0.15, "sine", 0.06); tone(784, 0.25, "sine", 0.06, 0.1); },
};
