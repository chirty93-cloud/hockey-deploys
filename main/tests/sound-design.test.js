import test from "node:test";
import assert from "node:assert/strict";
import { impactSamples, goalSamples } from "../src/soundDesign.js";

test("synthesized impact samples are bounded, transient and vary by material", () => {
  for(const rate of [22050,44100,48000]) {
    for(const kind of ["wall","paddle"]) {
      const data=impactSamples(kind,rate,1);
      assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
      assert.equal(data[0],0); assert.equal(data.at(-1),0);
      const energy = (a,b) => data.slice(a,b).reduce((sum,v)=>sum+v*v,0);
      assert.ok(energy(0,data.length/3)>energy(data.length*2/3,data.length)*10);
    }
    assert.ok(impactSamples("wall",rate).length>impactSamples("paddle",rate).length);
  }
});
test("goal samples contain a short tray sound and buzzer with no clipping", () => {
  for(const win of [true,false]) {
    const data=goalSamples(48000,win);
    assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
    assert.ok(data.slice(4800,14400).some(v=>Math.abs(v)>.1));
    assert.equal(data.at(-1),0);
  }
});
