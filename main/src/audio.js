import { impactSamples, goalSamples, finishSamples } from "./soundDesign.js";

const SOUND_KEY = "air-hockey:sound-enabled";

/** @param {boolean} fallback */
export function readSoundPreference(fallback) {
  try {
    const saved = globalThis.localStorage.getItem(SOUND_KEY);
    return saved === "true" ? true : saved === "false" ? false : fallback;
  } catch { return fallback; }
}

/** @param {boolean} enabled */
export function saveSoundPreference(enabled) {
  try { globalThis.localStorage.setItem(SOUND_KEY, String(enabled)); } catch { /* Private mode: use session state. */ }
}

/** Audio stays dormant until a button/touch gesture calls unlock.
 * @param {boolean} initiallyEnabled @param {number} volume
 * @param {() => AudioContext} contextFactory */
export function createGameAudio(initiallyEnabled = true, volume = 0.22, contextFactory = () => new AudioContext()) {
  let enabled = initiallyEnabled;
  /** @type {AudioContext | null} */
  let context = null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {Set<AudioBufferSourceNode>} */
  const voices = new Set();
  /** @type {{wall: AudioBuffer[], paddle: AudioBuffer[], goals: AudioBuffer[], finishes: AudioBuffer[]} | null} */
  let buffers = null;
  let disposed = false;
  let variation = 0;
  const lastHit = { wall: -Infinity, paddle: -Infinity, ai: -Infinity };
  const level = Math.max(0, Math.min(1, volume));

  function silence() {
    for (const voice of voices) {
      try { voice.stop(); } catch { /* Already ended. */ }
    }
    voices.clear();
    lastHit.wall = lastHit.paddle = lastHit.ai = -Infinity;
  }

  async function unlock() {
    if (!enabled || disposed) return;
    try {
      if (!context || context.state === "closed") {
        context = contextFactory();
        master = context.createGain();
        master.gain.value = level;
        master.connect(context.destination);
        const toBuffer = (samples) => {
          const buffer = context.createBuffer(1, samples.length, context.sampleRate);
          buffer.copyToChannel(samples, 0);
          return buffer;
        };
        buffers = {
          wall: [1, 37, 91].map(seed => toBuffer(impactSamples("wall", context.sampleRate, seed))),
          paddle: [3, 43, 101].map(seed => toBuffer(impactSamples("paddle", context.sampleRate, seed))),
          goals: [true, false].map(player => toBuffer(goalSamples(context.sampleRate, player))),
          finishes: [true, false].map(won => toBuffer(finishSamples(context.sampleRate, won))),
        };
      }
      if (context.state !== "running") await context.resume();
    } catch {
      // Missing/blocked audio must never interrupt the game.
      silence();
    }
  }

  /** @param {AudioBuffer} buffer @param {number} gain @param {number} rate */
  function play(buffer, gain, rate = 1) {
    if (!enabled || !context || context.state !== "running" || !master) return;
    try {
      if (voices.size >= 8) {
        const oldest = voices.values().next().value;
        if (oldest) { oldest.stop(); voices.delete(oldest); }
      }
      const start = context.currentTime;
      const source = context.createBufferSource();
      const envelope = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      envelope.gain.value = gain;
      source.connect(envelope);
      envelope.connect(master);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
        envelope.disconnect();
      };
      source.start(start);
      source.stop(start + buffer.duration / rate + 0.01);
    } catch { /* Sound is optional. */ }
  }

  return {
    unlock,
    silence,
    /** @param {boolean} next */
    setEnabled(next) {
      enabled = next;
      if (master) master.gain.value = next ? level : 0;
      if (!next) silence();
    },
    /** @param {"wall" | "paddle"} kind @param {number} impactSpeed @param {"player" | "ai"} side */
    hit(kind, impactSpeed, side = "player") {
      if (!enabled || !context || context.state !== "running" || !buffers || !Number.isFinite(impactSpeed) || impactSpeed <= 0) return;
      // Multiple collision substeps must not sound like a machine gun.
      const now = context.currentTime;
      const channel = kind === "paddle" && side === "ai" ? "ai" : kind;
      if (now - lastHit[channel] < 0.04) return;
      lastHit[channel] = now;
      const strength = Math.min(1, impactSpeed / 12);
      const index = variation++ % 3;
      const pitch = kind === "paddle" ? (side === "ai" ? 0.85 : 1.12) : 1;
      play(buffers[kind][index], 0.35 + strength * 0.65, [0.985, 1, 1.015][index] * pitch);
    },
    /** @param {boolean} playerScored */
    goal(playerScored) {
      if (!enabled || !context || context.state !== "running" || !buffers) return;
      silence();
      play(buffers.goals[playerScored ? 0 : 1], 0.85);
    },
    /** @param {boolean} won */
    finish(won) {
      if (!enabled || !context || context.state !== "running" || !buffers) return;
      silence();
      play(buffers.goals[won ? 0 : 1], 0.7);
      play(buffers.finishes[won ? 0 : 1], 0.8);
    },
    dispose() {
      disposed = true;
      silence();
      const oldContext = context;
      context = null;
      master = null;
      buffers = null;
      if (oldContext && oldContext.state !== "closed") void oldContext.close().catch(() => {});
    },
  };
}
