const test = require("node:test");
const assert = require("node:assert/strict");
const { distancesForOptions, pointAtDistance, sampleVectorNetwork } = require("./code.js");

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
