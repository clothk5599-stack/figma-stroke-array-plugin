# Rotation-Aware Copy Centering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Position every rotated copy so its visual center remains exactly on its sampled vector-path point.

**Architecture:** Add one pure transform helper to `code.js`, cover it with angle and aspect-ratio tests, and use it in `createCopies` after determining final rotation. No plugin data or handle lifecycle changes are required.

**Tech Stack:** Plain JavaScript, Figma Plugin API, Node.js built-in test runner.

## Global Constraints

- Implement in `/Users/hung/Documents/HHAPP/figma-stroke-array`.
- Preserve draggable-handle, wraparound, path sampling, and grouping behavior.
- Mirror verified files into the Git-connected checkout and update the existing feature branch.

---

### Task 1: Test Rotation-Aware Centering

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.test.js`
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.js`

**Interfaces:**
- Produces: `topLeftForCenteredRotation(centerX, centerY, width, height, rotation) -> { x, y }`

- [ ] **Step 1: Add failing unit tests**

```js
assert.deepEqual(topLeftForCenteredRotation(100, 100, 20, 20, 0), { x: 90, y: 90 });
assert.deepEqual(topLeftForCenteredRotation(100, 100, 20, 20, 90), { x: 110, y: 90 });
assert.deepEqual(topLeftForCenteredRotation(100, 100, 20, 20, 180), { x: 110, y: 110 });
assert.deepEqual(topLeftForCenteredRotation(100, 100, 40, 20, 90), { x: 110, y: 80 });
```

- [ ] **Step 2: Run `node --test code.test.js`**

Expected: FAIL because the helper is not exported.

- [ ] **Step 3: Implement and export the helper**

```js
function topLeftForCenteredRotation(centerX, centerY, width, height, rotation) {
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerOffsetX = cosine * width / 2 - sine * height / 2;
  const centerOffsetY = sine * width / 2 + cosine * height / 2;
  return { x: centerX - centerOffsetX, y: centerY - centerOffsetY };
}
```

- [ ] **Step 4: Run tests**

Expected: all tests pass.

### Task 2: Apply Centering to Generated Copies

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.js`

**Interfaces:**
- Consumes: `topLeftForCenteredRotation(...)`
- Preserves: `createCopies(source, path, points, distances, orientation) -> SceneNode[]`

- [ ] **Step 1: Determine final rotation before positioning**

```js
const rotation = orientation === "follow" ? source.rotation + location.angle : source.rotation;
copy.rotation = rotation;
const position = topLeftForCenteredRotation(path.x + location.x, path.y + location.y, copy.width, copy.height, rotation);
copy.x = position.x;
copy.y = position.y;
```

- [ ] **Step 2: Run full verification**

Run `node --test code.test.js`, `node --check code.js`, and the inline UI script syntax check. Expected: all checks pass.

- [ ] **Step 3: Mirror, commit, and push**

Mirror `code.js` and `code.test.js` into the Git checkout, commit as `fix: center rotated copies on path`, and push `agent/draggable-start-handle` so pull request #1 updates.
