import test from "node:test";
import assert from "node:assert/strict";
import { createGameEffects } from "../src/effects.js";
import { impactSamples, goalSamples } from "../src/soundDesign.js";
const options = { wallDuration: .24, goalDuration: .7, maxParticles: 80 };
function recorder() {
  const calls = [], ctx = {};
  for(const name of ["save","restore","beginPath","rect","clip","arc","stroke","moveTo","lineTo"]) {
    ctx[name] = (...args) => {
      assert.ok(args.every(value => typeof value !== "number" || Number.isFinite(value)));
      calls.push({name,args});
    };
  }
  return { ctx, calls };
}
test("wall sparks start at contact and travel into the table", () => {
  const effects=createGameEffects(options);
  effects.wall(8,200,1,0,10,"#00cfee"); effects.update(.05);
  const r=recorder(); effects.draw(r.ctx,432,768);
  const particles=r.calls.filter(call=>call.name==="moveTo");
  assert.ok(particles.length>0);
  assert.ok(particles.every(call=>call.args[0]>=8));
  assert.equal(r.calls[0].name,"save");
  assert.equal(r.calls.at(-1).name,"restore");
  assert.ok(r.calls.some(call=>call.name==="clip"));
});
test("effects expire and clear without leaving permanent draw work", () => {
  const effects=createGameEffects(options);
  effects.goal(216,10,1,"#00cfee"); effects.update(1);
  let r=recorder(); effects.draw(r.ctx,432,768); assert.equal(r.calls.length,0);
  effects.wall(8,200,1,0,10,"#fff"); effects.clear();
  r=recorder(); effects.draw(r.ctx,432,768); assert.equal(r.calls.length,0);
});
test("particle budget remains bounded during heavy collisions", () => {
  const effects=createGameEffects(options);
  for(let i=0;i<200;i++) effects.wall(8,200,1,0,12,"#fff");
  const r=recorder(); effects.draw(r.ctx,432,768);
  assert.ok(r.calls.filter(c=>c.name==="moveTo").length<=80);
  assert.ok(r.calls.filter(c=>c.name==="arc").length<=12);
});
test("reduced motion removes sparks and expanding rings", () => {
  const effects=createGameEffects(options,true);
  effects.goal(216,10,1,"#fff"); effects.update(.1);
  const r=recorder(); effects.draw(r.ctx,432,768);
  assert.equal(r.calls.filter(c=>c.name==="moveTo").length,0);
  assert.equal(r.calls.find(c=>c.name==="arc").args[2],12);
});
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
