const test = require("node:test");
const assert = require("node:assert/strict");
const {
  distancesForOptions,
  nearestPointOnPath,
  pointAtDistance,
  sampleVectorNetwork,
  shiftDistances,
  topLeftForCenteredRotation,
} = require("./code.js");

test("count mode distributes endpoints evenly", () => {
  assert.deepEqual(
    distancesForOptions(100, { mode: "count", value: 3, includeEndpoints: true }),
    [0, 50, 100],
  );
});

test("spacing mode omits endpoints when requested", () => {
  assert.deepEqual(
    distancesForOptions(100, { mode: "spacing", value: 30, includeEndpoints: false }),
    [30, 60, 90],
  );
});

test("pointAtDistance returns a point and tangent", () => {
  assert.deepEqual(
    pointAtDistance([{ x: 0, y: 0 }, { x: 100, y: 0 }], 25),
    { x: 25, y: 0, angle: 0 },
  );
});

test("samples an ordered vector segment", () => {
  const points = sampleVectorNetwork({
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{ start: 0, end: 1 }],
  });

  assert.deepEqual(points, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
});

test("rejects a branched vector network", () => {
  assert.throws(
    () => sampleVectorNetwork({
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }, { x: 50, y: -100 }],
      segments: [{ start: 0, end: 1 }, { start: 0, end: 2 }, { start: 0, end: 3 }],
    }),
    /branches/,
  );
});

test("shiftDistances wraps at the end of the path", () => {
  assert.deepEqual(shiftDistances([0, 25, 50, 75], 75, 100), [75, 0, 25, 50]);
});

test("shiftDistances preserves the original open-path endpoint at zero offset", () => {
  assert.deepEqual(shiftDistances([0, 50, 100], 0, 100), [0, 50, 100]);
});

test("shifted distances are deterministic across repeated updates", () => {
  const first = shiftDistances([0, 50, 100], 25, 100);
  const second = shiftDistances([0, 50, 100], 25, 100);
  assert.deepEqual(first, second);
});

test("nearestPointOnPath returns the closest point and cumulative distance", () => {
  assert.deepEqual(
    nearestPointOnPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 30, y: 20 }),
    { x: 30, y: 0, distance: 30, squaredDistance: 400 },
  );
});

test("topLeftForCenteredRotation preserves the requested visual center", () => {
  assert.deepEqual(topLeftForCenteredRotation(100, 100, 20, 20, 0), { x: 90, y: 90 });
  assert.deepEqual(topLeftForCenteredRotation(100, 100, 20, 20, 90), { x: 110, y: 90 });
  assert.deepEqual(topLeftForCenteredRotation(100, 100, 20, 20, 180), { x: 110, y: 110 });
  assert.deepEqual(topLeftForCenteredRotation(100, 100, 40, 20, 90), { x: 110, y: 80 });
});
