import test from "node:test";
import assert from "node:assert/strict";
import { GAME_CONFIG } from "../src/config/game.ts";
import { TABLE_SIZES } from "../src/config/preferences.ts";
import { resolveAspect, tableDimensions, fitTable, viewToTable, clampPlayer } from "../src/tableGeometry.js";
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
    const table = tableDimensions(aspect, GAME_CONFIG.table.width);
    const ratio = aspect === "16:9" ? 16/9 : 4/3;
    near(table.height / table.width, ratio);
    for (const {scale} of Object.values(TABLE_SIZES)) {
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
    const {width:w,height:h} = tableDimensions(aspect, GAME_CONFIG.table.width);
    for (const point of [{x:0,y:0},{x:w,y:h},{x:w/3,y:h*.8}]) {
      const left = viewToTable(h-point.y,point.x,true,"left",w,h);
      const right = viewToTable(point.y,w-point.x,true,"right",w,h);
      near(left.x,point.x); near(left.y,point.y); near(right.x,point.x); near(right.y,point.y);
      assert.deepEqual(viewToTable(point.x,point.y,false,"right",w,h),point);
    }
  }
});
test("the whole bottom half remains reachable for both shapes", () => {
  const r = GAME_CONFIG.paddle.radius;
  for (const aspect of ["16:9","4:3"]) {
    const {width:w,height:h} = tableDimensions(aspect, GAME_CONFIG.table.width);
    assert.deepEqual(clampPlayer(-100,-100,w,h,r),{x:r,y:h/2+r});
    assert.deepEqual(clampPlayer(w+100,h+100,w,h,r),{x:w-r,y:h-r});
  }
});
