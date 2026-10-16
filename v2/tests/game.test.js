import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAspect, tableDimensions, fitTable, viewToTable, clampPlayer } from "../src/tableGeometry.js";
import { advancePuck, movePlayer, collidePaddle } from "../src/physics.js";
const settings = JSON.parse(readFileSync(new URL("../src/game-config.json", import.meta.url), "utf8"));
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, a + " != " + b);

test("auto ratio follows screen shape in either orientation; explicit selection wins", () => {
  for (const [w, h, expected] of [[1920,1080,"16:9"],[390,844,"16:9"],[1024,768,"4:3"],[768,1024,"4:3"],[800,800,"4:3"]]) {
    assert.equal(resolveAspect("auto", w, h), expected);
    assert.equal(resolveAspect("auto", h, w), expected);
    assert.equal(resolveAspect("16:9", w, h), "16:9");
    assert.equal(resolveAspect("4:3", w, h), "4:3");
  }
});
test("all presets fit available space without distorting either aspect", () => {
  for (const aspect of ["16:9", "4:3"]) for (const horizontal of [true, false]) {
    const table = tableDimensions(aspect, settings.table.shortEdge);
    const ratio = aspect === "16:9" ? 16/9 : 4/3;
    near(table.height / table.width, ratio);
    for (const {scale} of Object.values(settings.tablePresets)) {
      for (const [w,h] of [[360,650],[800,280],[1024,700],[0,0]]) {
        const fit = fitTable(w,h,horizontal,scale,table.width,table.height);
        assert.ok(fit.width <= w + 1e-8 && fit.height <= h + 1e-8);
        if (fit.width) near(fit.width / fit.height, horizontal ? ratio : 1/ratio);
      }
    }
  }
});
test("pointer mapping inverts both rotations and portrait ignores side", () => {
  for (const aspect of ["16:9","4:3"]) {
    const {width:w,height:h} = tableDimensions(aspect, settings.table.shortEdge);
    for (const point of [{x:0,y:0},{x:w,y:h},{x:w/3,y:h*.8}]) {
      const left = viewToTable(h-point.y,point.x,true,"left",w,h);
      const right = viewToTable(point.y,w-point.x,true,"right",w,h);
      near(left.x,point.x); near(left.y,point.y); near(right.x,point.x); near(right.y,point.y);
      assert.deepEqual(viewToTable(point.x,point.y,false,"right",w,h),point);
    }
  }
});
test("the whole bottom half remains reachable for both shapes", () => {
  const r = settings.table.paddleRadius;
  for (const aspect of ["16:9","4:3"]) {
    const {width:w,height:h} = tableDimensions(aspect, settings.table.shortEdge);
    assert.deepEqual(clampPlayer(-100,-100,w,h,r),{x:r,y:h/2+r});
    assert.deepEqual(clampPlayer(w+100,h+100,w,h,r),{x:w-r,y:h-r});
  }
});
test("drag matches the analytic velocity and distance at multiple frame rates", () => {
  for (const fps of [30,60,120,144,240]) {
    const puck={x:0,y:0,vx:4,vy:-2};
    for(let n=0;n<fps;n++) advancePuck(puck,.3,1/fps);
    near(puck.vx,4*Math.exp(-.3));
    near(puck.x,240*(1-Math.exp(-.3))/.3);
    near(puck.y,-puck.x/2);
  }
});
test("zero drag is uniform motion; a resting puck never starts itself", () => {
  const puck={x:0,y:0,vx:4,vy:0}; advancePuck(puck,0,.5); near(puck.x,120); near(puck.vx,4);
  const resting={x:10,y:20,vx:0,vy:0}; advancePuck(resting,1,10);
  assert.deepEqual(resting,{x:10,y:20,vx:0,vy:0});
});
test("response time is a 63% time constant with no overshoot", () => {
  const player={x:0,y:0,vx:0,vy:0};
  movePlayer(player,{x:100,y:0},100,10000,.1);
  near(player.x,100*(1-Math.exp(-1)));
  for(let n=0;n<100;n++) movePlayer(player,{x:100,y:0},100,10000,.1);
  assert.ok(player.x <= 100);
});
test("player speed is capped even at zero response time", () => {
  const player={x:0,y:0,vx:0,vy:0};
  movePlayer(player,{x:300,y:400},0,100,.1);
  near(Math.hypot(player.x,player.y),10);
  near(Math.hypot(player.vx,player.vy)*60,100);
});
test("capped following gives the same position across frame rates", () => {
  const positions = [];
  for (const fps of [30,60,120,144,240]) {
    const player={x:0,y:0,vx:0,vy:0};
    for(let n=0;n<fps;n++) movePlayer(player,{x:300,y:400},100,600,1/fps);
    positions.push(player.x);
  }
  for(const x of positions) near(x,positions[0]);
});
test("stationary paddle changes only normal velocity with specified restitution", () => {
  const puck={x:44,y:0,vx:-4,vy:3};
  collidePaddle(puck,{x:0,y:0},{x:0,y:0},45,.5);
  near(puck.x,45); near(puck.vx,2); near(puck.vy,3);
});
test("moving paddle uses relative velocity, without a separate power multiplier", () => {
  const puck={x:44,y:0,vx:0,vy:0};
  collidePaddle(puck,{x:0,y:0},{x:3,y:7},45,1);
  near(puck.vx,6); near(puck.vy,0);
});
test("separating contacts do not add energy; coincident centers stay finite", () => {
  const puck={x:44,y:0,vx:4,vy:1};
  collidePaddle(puck,{x:0,y:0},{x:0,y:0},45,1);
  near(puck.vx,4); near(puck.vy,1);
  const same={x:0,y:0,vx:0,vy:0}; collidePaddle(same,{x:0,y:0},{x:0,y:0},45,1);
  assert.ok(Object.values(same).every(Number.isFinite));
});
test("JSON defaults, scales and physical slider ranges are coherent", () => {
  for (const option of Object.values(settings.physics)) {
    assert.ok(option.default >= option.min && option.default <= option.max && option.step > 0);
    near((option.default - option.min) / option.step, Math.round((option.default - option.min) / option.step));
  }
  for (const key of ["wallRestitution","paddleRestitution"]) {
    assert.ok(settings.physics[key].min >= 0 && settings.physics[key].max <= 1);
  }
  for(const preset of Object.values(settings.tablePresets)) assert.ok(preset.scale > 0 && preset.scale <= 1);
  assert.ok(settings.table.shortEdge > 4 * settings.table.paddleRadius);
  assert.ok(settings.table.goalWidth < settings.table.shortEdge);
  assert.ok(settings.table.goalWidth > 2 * settings.table.puckRadius);
});

test("extreme strikes are capped without changing their outgoing direction", () => {
  const cap=settings.gameplay.puckMaxSpeed*settings.table.shortEdge/60;
  for (const velocity of [10,25.2,43.2,100]) {
    const raw={x:44,y:0,vx:-4,vy:3}, limited={...raw};
    collidePaddle(raw,{x:0,y:0},{x:velocity,y:0},45,.95);
    collidePaddle(limited,{x:0,y:0},{x:velocity,y:0},45,.95,cap);
    near(Math.hypot(limited.vx,limited.vy),cap);
    near(limited.vy/limited.vx,raw.vy/raw.vx);
  }
});
test("ordinary strikes and stationary rebounds remain unchanged below the cap", () => {
  const cap=settings.gameplay.puckMaxSpeed*settings.table.shortEdge/60;
  for(const velocity of [0,1,3]) {
    const raw={x:44,y:0,vx:-2,vy:1}, limited={...raw};
    collidePaddle(raw,{x:0,y:0},{x:velocity,y:0},45,.95);
    collidePaddle(limited,{x:0,y:0},{x:velocity,y:0},45,.95,cap);
    assert.deepEqual(limited,raw);
  }
});
test("repeated opposing strong shots cannot accumulate unlimited speed", () => {
  const cap=settings.gameplay.puckMaxSpeed*settings.table.shortEdge/60;
  const puck={x:44,y:0,vx:0,vy:0};
  for(let n=0;n<100;n++) {
    const sign=n%2 ? -1 : 1;
    puck.x=44*sign;
    collidePaddle(puck,{x:0,y:0},{x:43.2*sign,y:0},45,.95,cap);
    assert.ok(Math.hypot(puck.vx,puck.vy)<=cap+1e-8);
  }
  assert.ok(settings.gameplay.puckMaxSpeed>0);
  assert.ok(settings.gameplay.serveSpeed <= cap*60);
});

test("sound impact is reported only for a closing paddle collision", () => {
  const puck={x:44,y:0,vx:-4,vy:0};
  near(collidePaddle(puck,{x:0,y:0},{x:2,y:0},45,.95),6);
  const leaving={x:44,y:0,vx:4,vy:0};
  assert.equal(collidePaddle(leaving,{x:0,y:0},{x:0,y:0},45,.95),0);
  assert.equal(collidePaddle({x:80,y:0,vx:-4,vy:0},{x:0,y:0},{x:0,y:0},45,.95),undefined);
});
