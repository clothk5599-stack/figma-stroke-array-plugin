# Face-Center Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Face Center orientation mode with a persistent draggable center handle that makes every copy's bottom edge point toward the handle.

**Architecture:** Extend the existing pure geometry layer with Figma-aware facing math, then add an optional second linked helper node to the existing deterministic regeneration lifecycle. Update the compact panel with a third orientation radio and separate start/center handle selection controls.

**Tech Stack:** Plain JavaScript, Figma Plugin API, HTML/CSS, Node.js built-in test runner.

## Global Constraints

- Implement runtime changes in `/Users/hung/Documents/HHAPP/figma-stroke-array`.
- Preserve start-handle dragging, wraparound, rotation-aware centering, and existing orientation modes.
- Create a center handle only for Face Center arrays.
- Both handles persist after the plugin closes and resynchronize on reopen.
- Mirror verified files into the Git checkout and update pull request #1.

---

### Task 1: Bottom-Edge Facing Geometry

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.test.js`
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.js`

**Interfaces:**
- Produces: `normalizeRotation(rotation) -> number`
- Produces: `bottomEdgeRotationTowardPoint(copyPoint, centerPoint, fallbackRotation) -> number`

- [ ] **Step 1: Add failing cardinal-direction and fallback tests**

```js
assert.equal(bottomEdgeRotationTowardPoint({x: 0, y: 0}, {x: 0, y: 10}, 12), 0);
assert.equal(bottomEdgeRotationTowardPoint({x: 0, y: 0}, {x: 10, y: 0}, 12), 90);
assert.equal(bottomEdgeRotationTowardPoint({x: 0, y: 0}, {x: 0, y: -10}, 12), 180);
assert.equal(bottomEdgeRotationTowardPoint({x: 0, y: 0}, {x: -10, y: 0}, 12), -90);
assert.equal(bottomEdgeRotationTowardPoint({x: 2, y: 2}, {x: 2, y: 2}, 12), 12);
```

- [ ] **Step 2: Run `node --test code.test.js` and confirm failure**

Expected: helper is not exported.

- [ ] **Step 3: Implement Figma-aware facing math**

```js
function normalizeRotation(rotation) {
  const normalized = ((rotation + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

function bottomEdgeRotationTowardPoint(copyPoint, centerPoint, fallbackRotation) {
  const dx = centerPoint.x - copyPoint.x;
  const dy = centerPoint.y - copyPoint.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return fallbackRotation;
  const direction = Math.atan2(dy, dx) * 180 / Math.PI;
  return normalizeRotation(90 - direction);
}
```

- [ ] **Step 4: Export helpers and rerun all tests**

Expected: all tests pass.

### Task 2: Persistent Center Handle Lifecycle

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/code.js`

**Interfaces:**
- Adds plugin data: `centerHandleId`, `centerHandle`, existing `groupId` link.
- Extends `createCopies(..., orientation, centerPoint)`.
- Extends `saveGroupData(..., startHandle, centerHandle, settings, startDistance)`.

- [ ] **Step 1: Add center-handle marker and detection**

Add `stroke-array-center-handle-id` and `stroke-array-center-handle` keys plus `isCenterHandle(node)`.

- [ ] **Step 2: Create the optional center handle**

For Face Center only, create a distinct 14-by-14 ellipse at the sampled path bounds center, name it `Stroke Array Center Handle: <source name>`, and link it to the generated group.

- [ ] **Step 3: Apply face-center rotation in `createCopies`**

For `orientation === "center"`, call `bottomEdgeRotationTowardPoint` using the copy path point and center-handle center before calling `topLeftForCenteredRotation`.

- [ ] **Step 4: Extend resolution, selection, and regeneration**

Resolve the optional center handle for Face Center arrays, recognize selection of either handle, preserve the stored start distance, update both handles' group IDs after group replacement, and use the current center-handle center during every regeneration.

- [ ] **Step 5: Handle document changes without recursive updates**

Track expected helper position and group ID for both handles. Ignore matching plugin-authored changes; regenerate when either helper's current state differs from the expected state.

- [ ] **Step 6: Run controller tests and syntax check**

Run `node --test code.test.js` and `node --check code.js`. Expected: pass.

### Task 3: Face Center Panel Controls

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/ui.html`

**Interfaces:**
- Produces orientation value `center`.
- Produces messages `select-start-handle` and `select-center-handle`.
- Consumes `handle-state` with `startEnabled` and `centerEnabled`.

- [ ] **Step 1: Add the Face Center radio option**

```html
<label><input type="radio" name="orientation" value="center"> Face center</label>
```

- [ ] **Step 2: Replace the single select button**

Add separate `Select start handle` and `Select center handle` buttons. Keep the center button disabled unless the selected array uses Face Center.

- [ ] **Step 3: Update message wiring**

Post the corresponding select messages and render each enabled state independently.

- [ ] **Step 4: Validate the 360-by-460 panel**

Run inline-script syntax validation and confirm the fixed Create Array footer remains inside the viewport while content scrolls.

### Task 4: Documentation, Verification, and Publishing

**Files:**
- Modify: `/Users/hung/Documents/HHAPP/figma-stroke-array/README.md`
- Mirror: runtime files and docs into the Git-connected checkout.

**Interfaces:**
- Produces the verified feature-branch update for pull request #1.

- [ ] **Step 1: Document Face Center and both handles**

Explain creation, bottom-edge orientation, initial center position, drag behavior, persistence, and reopen synchronization.

- [ ] **Step 2: Run full checks**

Run all unit tests, controller syntax, UI script syntax, manifest references, and `git diff --check`.

- [ ] **Step 3: Commit and push**

Commit as `feat: add face-center orientation` and push `agent/draggable-start-handle` to update draft pull request #1.
