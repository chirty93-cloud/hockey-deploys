import test from "node:test";
import assert from "node:assert/strict";
import { createGameAudio, readSoundPreference, saveSoundPreference } from "../src/audio.js";

function fixture(enabled = true) {
  const parameter = () => ({
    value: 0, events: [],
    setValueAtTime(value, time) { this.events.push([value, time]); },
    linearRampToValueAtTime(value, time) { this.events.push([value, time]); },
    exponentialRampToValueAtTime(value, time) { this.events.push([value, time]); },
  });
  const context = {
    state: "suspended", currentTime: 1, sampleRate: 24000, destination: {}, sources: [], gains: [], resumed: 0, closed: 0,
    resume() { this.resumed++; this.state = "running"; return Promise.resolve(); },
    close() { this.closed++; this.state = "closed"; return Promise.resolve(); },
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return { duration: length / rate, length, data, copyToChannel(samples) { data.set(samples); } };
    },
    createGain() {
      const node = { gain: parameter(), connect() {}, disconnect() {} };
      this.gains.push(node); return node;
    },
    createBufferSource() {
      const node = {
        buffer: null, playbackRate: { value: 1 }, starts: [], stops: [], onended: null,
        connect() {}, disconnect() {},
        start(time) { this.starts.push(time); },
        stop(time) {
          this.stops.push(time);
          if (time === undefined && this.onended) this.onended();
        },
      };
      this.sources.push(node); return node;
    },
  };
  let created = 0;
  const sound = createGameAudio(enabled, 0.22, () => { created++; return context; });
  return { context, sound, created: () => created };
}

test("audio is created only after an enabled user gesture", async () => {
  const f = fixture();
  f.sound.hit("wall", 5); f.sound.goal(true);
  assert.equal(f.created(), 0);
  await f.sound.unlock(); await f.sound.unlock();
  assert.equal(f.created(), 1);
  assert.equal(f.context.resumed, 1);
});
test("disabled audio allocates no context and emits no sounds", async () => {
  const f = fixture(false);
  await f.sound.unlock();
  f.sound.hit("paddle", 12); f.sound.goal(true);
  assert.equal(f.created(), 0);
  f.sound.setEnabled(true); await f.sound.unlock(); f.sound.hit("paddle", 12);
  assert.equal(f.context.sources.length, 1);
});
test("mute immediately stops active and future goal notes", async () => {
  const f = fixture(); await f.sound.unlock(); f.sound.goal(true);
  assert.equal(f.context.sources.length, 1);
  f.sound.setEnabled(false);
  assert.equal(f.context.gains[0].gain.value, 0);
  assert.ok(f.context.sources.every(node => node.stops.includes(undefined)));
  f.context.currentTime += 1;
  f.sound.hit("wall", 5); f.sound.goal(false);
  assert.equal(f.context.sources.length, 1);
  f.sound.setEnabled(true); await f.sound.unlock(); f.sound.hit("wall", 5);
  assert.equal(f.context.sources.length, 2);
  assert.equal(f.context.gains[0].gain.value, 0.22);
});
test("collision substeps are throttled; separate wall and paddle effects remain audible", async () => {
  const f = fixture(); await f.sound.unlock();
  f.sound.hit("wall", 0); f.sound.hit("wall", NaN);
  assert.equal(f.context.sources.length, 0);
  for(let i=0;i<50;i++) f.sound.hit("wall", 8);
  f.sound.hit("paddle", 8);
  assert.equal(f.context.sources.length, 2);
  f.context.currentTime += .05; f.sound.hit("wall", 8);
  assert.equal(f.context.sources.length, 3);
});
test("scoring plays a cached tray/buzzer sample and disposes audio", async () => {
  const f = fixture(); await f.sound.unlock();
  f.sound.goal(true);
  const winning = f.context.sources[0].buffer;
  assert.ok(winning.duration > .4 && winning.duration < .5);
  f.sound.goal(false);
  const losing = f.context.sources[1].buffer;
  assert.ok(winning !== losing);
  assert.ok(winning.data.some(value => Math.abs(value) > .1));
  f.sound.dispose();
  assert.equal(f.context.closed, 1);
  f.sound.hit("wall", 10);
  assert.equal(f.context.sources.length, 2);
});
test("impacts reuse a bounded sample bank with subtle variations", async () => {
  const f = fixture(); await f.sound.unlock();
  for(let i=0;i<9;i++) {
    f.sound.hit("wall", 12);
    f.context.currentTime += .1;
  }
  assert.equal(new Set(f.context.sources.map(source => source.buffer)).size, 3);
  assert.ok(f.context.sources.every(source => source.playbackRate.value >= .98 && source.playbackRate.value <= 1.02));
});
test("unavailable or blocked audio never breaks gameplay calls", async () => {
  const missing = createGameAudio(true, .22, () => { throw Error("unavailable"); });
  await missing.unlock(); missing.hit("wall", 5); missing.goal(true); missing.dispose();
  const f = fixture();
  f.context.resume = () => Promise.reject(Error("blocked"));
  await f.sound.unlock(); f.sound.hit("wall", 5);
  assert.equal(f.context.sources.length, 0);
});
test("player and AI impacts have distinct pitches and finish plays a bounded cached phrase", async () => {
  const f = fixture(); await f.sound.unlock();
  f.sound.hit("paddle", 10, "player"); f.sound.hit("paddle", 10, "ai");
  assert.ok(f.context.sources[0].playbackRate.value > f.context.sources[1].playbackRate.value);
  f.sound.finish(true);
  assert.equal(f.context.sources.length, 4);
  assert.ok(f.context.sources.at(-1).buffer.duration > .9);
  for (let i = 0; i < 30; i++) { f.context.currentTime += .1; f.sound.hit("wall", 10); }
  assert.ok(f.context.sources.filter(source => !source.stops.includes(undefined)).length <= 8);
  f.sound.dispose(); await f.sound.unlock();
  assert.equal(f.created(), 1, "disposed audio cannot recreate its context");
});
test("sound preference survives reload and handles blocked browser storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    } });
    assert.equal(readSoundPreference(true), true);
    saveSoundPreference(false); assert.equal(readSoundPreference(true), false);
    saveSoundPreference(true); assert.equal(readSoundPreference(false), true);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("blocked"); } });
    saveSoundPreference(false);
    assert.equal(readSoundPreference(true), true);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
