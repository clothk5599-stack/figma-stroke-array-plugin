# Draggable Start Handle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore access to array creation and let users reposition an array along its vector path by dragging a persistent on-canvas handle with wraparound.

**Architecture:** Keep the dependency-free Figma plugin structure. Add pure geometry helpers and tests in `code.js`/`code.test.js`, then store array relationships and settings in private plugin data so a persistent ellipse handle can drive deterministic copy regeneration. Replace numeric offsets in `ui.html` with handle controls and a fixed footer that keeps Create Array visible.

**Tech Stack:** Figma Plugin API, plain JavaScript, HTML/CSS, Node.js built-in test runner.

## Global Constraints

- Implement the runnable plugin in `/Users/hung/Documents/HHAPP/figma-stroke-array`.
- Mirror verified runtime files into `/Users/hung/Documents/HHAPP/figma-stroke-array-plugin` for Git versioning.
- The handle remains visible after the plugin closes.
- Shifted copies wrap from the path end to its beginning on open and closed vector paths.
- Existing arrays without handle-link metadata must be recreated.
- Do not add runtime dependencies or modify the manifest ID.

---

### Task 1: Wrapped Start-Distance Geometry

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.test.js`
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.js`

**Interfaces:**
- Produces: `normalizeDistance(distance, length) -> number`
- Produces: `shiftDistances(distances, startDistance, length) -> number[]`
- Produces: `nearestPointOnPath(points, target) -> { x, y, distance, squaredDistance }`

- [ ] **Step 1: Write failing tests for wrapping and projection**

```js
test("shiftDistances wraps at the end of the path", () => {
  assert.deepEqual(shiftDistances([0, 25, 50, 75], 75, 100), [75, 0, 25, 50]);
});

test("nearestPointOnPath returns the closest point and cumulative distance", () => {
  assert.deepEqual(
    nearestPointOnPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 30, y: 20 }),
    { x: 30, y: 0, distance: 30, squaredDistance: 400 },
  );
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test code.test.js`

Expected: FAIL because `shiftDistances` and `nearestPointOnPath` are not exported.

- [ ] **Step 3: Implement pure geometry helpers**

```js
function normalizeDistance(distance, length) {
  return ((distance % length) + length) % length;
}

function shiftDistances(distances, startDistance, length) {
  return distances.map((distance) => normalizeDistance(distance + startDistance, length));
}

function nearestPointOnPath(points, target) {
  let best = null;
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared)) : 0;
    const x = start.x + dx * ratio;
    const y = start.y + dy * ratio;
    const squaredDistance = (target.x - x) ** 2 + (target.y - y) ** 2;
    const segmentLength = Math.sqrt(lengthSquared);
    const candidate = { x, y, distance: traversed + segmentLength * ratio, squaredDistance };
    if (!best || candidate.squaredDistance < best.squaredDistance) best = candidate;
    traversed += segmentLength;
  }
  if (!best) throw new Error("The path has no measurable segments.");
  return best;
}
```

- [ ] **Step 4: Export helpers and run all tests**

Run: `node --test code.test.js`

Expected: all existing and new tests pass.

### Task 2: Persistent Handle and Deterministic Array Regeneration

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.js`
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.test.js`

**Interfaces:**
- Consumes: `shiftDistances`, `nearestPointOnPath`, `pointAtDistance`
- Produces plugin-data keys for result, source, path, handle, settings, start distance, and handle-to-group link.
- Produces: `regenerateArray(group, handleOverride?) -> number`

- [ ] **Step 1: Add a deterministic regeneration test**

```js
test("shifted distances are deterministic across repeated updates", () => {
  const first = shiftDistances([0, 50, 100], 25, 100);
  const second = shiftDistances([0, 50, 100], 25, 100);
  assert.deepEqual(first, second);
});
```

- [ ] **Step 2: Replace offset metadata with relationship metadata**

```js
const PLUGIN_DATA = {
  result: "stroke-array-result",
  sourceId: "stroke-array-source-id",
  pathId: "stroke-array-path-id",
  handleId: "stroke-array-handle-id",
  settings: "stroke-array-settings",
  startDistance: "stroke-array-start-distance",
  handle: "stroke-array-start-handle",
  groupId: "stroke-array-group-id",
};
```

- [ ] **Step 3: Create and link the persistent ellipse handle**

Create an 12-by-12 ellipse with a high-contrast fill/stroke, name it `Stroke Array Start Handle: <source name>`, store its group ID, and position its center at the first point on the path.

- [ ] **Step 4: Implement regeneration from stored settings**

`regenerateArray` must resolve source/path/handle IDs, validate them, delete only existing generated copy children, clone the source at shifted distances, replace the group contents, persist normalized start distance, and snap the handle center onto the path.

- [ ] **Step 5: Listen for handle movement without recursion**

Use `figma.on("documentchange", ...)`, filter changed node IDs to linked handles, and guard plugin-authored position changes with an `updating` boolean. Reopening or selecting a handle/group must synchronize the handle once.

- [ ] **Step 6: Run all controller tests and syntax checks**

Run: `node --test code.test.js`

Run: `node --check code.js`

Expected: all tests pass and syntax is valid.

### Task 3: Accessible Panel and Handle Controls

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/ui.html`

**Interfaces:**
- Consumes messages: `handle-state`, `complete`, `notice`, `state`
- Produces messages: `select-handle`, `capture-source`, `capture-path`, `create-array`

- [ ] **Step 1: Make the panel layout keep Create Array visible**

Use `body { height: 100vh; overflow: hidden; }`, make `main` a two-row grid, put settings in a scrollable `.content` region, and place notices plus Create Array in a fixed `.footer` region.

- [ ] **Step 2: Replace numeric Position controls**

```html
<section aria-labelledby="handle-heading">
  <h2 id="handle-heading">Start handle</h2>
  <p>Drag the persistent handle on the canvas to move the array start along its path.</p>
  <button id="select-handle" class="secondary" type="button" disabled>Select handle</button>
</section>
```

- [ ] **Step 3: Wire handle-state and select-handle messages**

Enable the button only when a linked array is selected and post `select-handle` on click. Remove all `apply-offset`, `reset-offset`, and numeric offset code.

- [ ] **Step 4: Validate panel JavaScript syntax**

Run the existing inline-script parser using Node.js.

Expected: `UI script syntax OK`.

### Task 4: Documentation, Mirroring, and Full Verification

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/README.md`
- Mirror: `code.js`, `code.test.js`, `ui.html`, `README.md` into `/Users/hung/Documents/HHAPP/figma-stroke-array-plugin`

**Interfaces:**
- Consumes the completed runtime behavior from Tasks 1–3.
- Produces the versioned Git diff ready for review and publishing.

- [ ] **Step 1: Update usage documentation**

Document handle creation, dragging while the plugin is open, persistence after close, synchronization on reopen, wraparound, and recreation of legacy arrays.

- [ ] **Step 2: Run full verification in the requested folder**

Run: `node --test code.test.js`

Run: `node --check code.js`

Run: panel inline-script syntax validation.

Expected: all tests and syntax checks pass.

- [ ] **Step 3: Mirror verified runtime files with patches**

Update the Git checkout versions to exactly match the requested plugin folder and confirm with `diff -q` for each runtime file.

- [ ] **Step 4: Inspect and commit the final diff**

Run: `git diff --check`

Run: `git status -sb`

Commit message: `feat: add draggable array start handle`.

- [ ] **Step 5: Push the feature branch and open a draft pull request**

Push `agent/draggable-start-handle`, target `main`, and include the design, behavior, compatibility note, and verification results in the PR description.
