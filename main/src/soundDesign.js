// Original synthesized approximations of a physical air-hockey table, not extracted game samples.
/** @param {"wall"|"paddle"} kind @param {number} sampleRate @param {number} seed */
export function impactSamples(kind, sampleRate, seed = 1) {
  const wall = kind === "wall";
  const duration = wall ? 0.12 : 0.085;
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let randomState = seed >>> 0, low = 0;
  const color = 1 - Math.exp(-2 * Math.PI * 1600 / sampleRate);
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    const noise = randomState / 2147483648 - 1;
    low += color * (noise - low);
    const click = (noise - low) * Math.exp(-t / 0.0035) * 0.8;
    const body = Math.sin(2 * Math.PI * (wall ? 190 : 310) * t) * Math.exp(-t / 0.018) * 0.24;
    const ring = Math.sin(2 * Math.PI * (wall ? 840 : 1480) * t) * Math.exp(-t / (wall ? 0.022 : 0.012)) * 0.32
      + Math.sin(2 * Math.PI * (wall ? 1780 : 2630) * t) * Math.exp(-t / 0.008) * 0.2
      + Math.sin(2 * Math.PI * (wall ? 3020 : 4110) * t) * Math.exp(-t / 0.004) * 0.12;
    const attack = Math.min(1, t / 0.0007);
    const release = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.006));
    data[i] = Math.tanh(click + body + ring) * attack * release;
  }
  // Canonical zero at the endpoints avoids signed-zero surprises for consumers.
  data[0] = data[data.length - 1] = 0;
  return data;
}

/** Puck dropping into a goal tray, followed by a short table buzzer.
 * @param {number} sampleRate @param {boolean} playerScored */
export function goalSamples(sampleRate, playerScored) {
  const data = new Float32Array(Math.ceil(sampleRate * 0.44));
  const clack = impactSamples("wall", sampleRate, 71);
  for (const [delay, gain] of [[0, 0.8], [0.045, 0.4], [0.11, 0.22]]) {
    const start = Math.round(delay * sampleRate);
    for (let i = 0; i < clack.length && start + i < data.length; i++) data[start + i] += clack[i] * gain;
  }
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate - 0.08;
    if (t < 0 || t > 0.28) continue;
    const phase = 2 * Math.PI * (playerScored ? 220 : 185) * t;
    const envelope = Math.min(1, t / 0.015) * Math.min(1, (0.28 - t) / 0.06);
    data[i] += (Math.sin(phase) + 0.3 * Math.sin(phase * 3) + 0.12 * Math.sin(phase * 5)) * envelope * 0.2;
  }
  return data;
}

/** A short ascending victory chime or descending match-over phrase.
 * @param {number} sampleRate @param {boolean} won */
export function finishSamples(sampleRate, won) {
  const data = new Float32Array(Math.ceil(sampleRate * 0.95));
  const notes = won ? [440, 554.37, 659.25, 880] : [440, 349.23, 293.66, 220];
  for (let n = 0; n < notes.length; n++) {
    const start = Math.round(n * 0.14 * sampleRate);
    for (let i = 0; i < sampleRate * 0.4 && start + i < data.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, t / 0.008) * Math.exp(-t * 11) * Math.min(1, (0.4 - t) / 0.03);
      data[start + i] += (Math.sin(t * notes[n] * 2 * Math.PI) + 0.18 * Math.sin(t * notes[n] * 4 * Math.PI)) * envelope * 0.24;
    }
  }
  return data;
}
