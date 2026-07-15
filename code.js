const state = {
  sourceId: null,
  sourceName: null,
  pathId: null,
  pathName: null,
};

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

const ignoredHandlePositions = new Map();

function distancesForOptions(length, options) {
  const { mode, value, includeEndpoints } = options;

  if (!Number.isFinite(length) || length <= 0) {
    throw new Error("The path has no measurable length.");
  }

  if (mode === "count") {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error("Count must be a positive whole number.");
    }
    if (value === 1) {
      return [includeEndpoints ? 0 : length / 2];
    }

    const start = includeEndpoints ? 0 : length / value;
    const end = includeEndpoints ? length : length - length / value;
    return Array.from(
      { length: value },
      (_, index) => start + ((end - start) * index) / (value - 1),
    );
  }

  if (mode !== "spacing" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Spacing must be greater than zero.");
  }

  const distances = [];
  for (let distance = includeEndpoints ? 0 : value; distance <= length + 0.0001; distance += value) {
    distances.push(Math.min(distance, length));
  }
  if (includeEndpoints && distances.at(-1) !== length) {
    distances.push(length);
  }
  return distances;
}

function pathLength(points) {
  return points.slice(1).reduce(
    (length, point, index) => length + Math.hypot(point.x - points[index].x, point.y - points[index].y),
    0,
  );
}

function pointAtDistance(points, distance) {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);

    if (segmentLength === 0) {
      continue;
    }
    if (remaining <= segmentLength || index === points.length - 1) {
      const ratio = Math.min(1, remaining / segmentLength);
      return {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio,
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
      };
    }
    remaining -= segmentLength;
  }
  throw new Error("The path has no measurable segments.");
}

function normalizeDistance(distance, length) {
  if (!Number.isFinite(length) || length <= 0) throw new Error("The path has no measurable length.");
  return ((distance % length) + length) % length;
}

function shiftDistances(distances, startDistance, length) {
  const normalizedStart = normalizeDistance(startDistance, length);
  return distances.map((distance) => (
    normalizedStart === 0 && Math.abs(distance - length) < 0.0001
      ? length
      : normalizeDistance(distance + normalizedStart, length)
  ));
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
    const ratio = lengthSquared
      ? Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared))
      : 0;
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

function isStrokeArrayGroup(node) {
  return node && node.type === "GROUP" && node.getPluginData(PLUGIN_DATA.result) === "true";
}

function isStartHandle(node) {
  return node && node.type === "ELLIPSE" && node.getPluginData(PLUGIN_DATA.handle) === "true";
}

function orderedSegments(vectorNetwork) {
  const { segments, vertices } = vectorNetwork;
  if (!segments.length || !vertices.length) {
    throw new Error("Choose a vector path with visible geometry.");
  }

  const incident = new Map();
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    for (const vertexIndex of [segment.start, segment.end]) {
      const list = incident.get(vertexIndex) || [];
      list.push(index);
      incident.set(vertexIndex, list);
    }
  }

  if ([...incident.values()].some((list) => list.length > 2)) {
    throw new Error("The selected vector path branches. Use one continuous path.");
  }

  const endpoint = [...incident.entries()].find(([, list]) => list.length === 1);
  let currentVertex = endpoint ? endpoint[0] : segments[0].start;
  const used = new Set();
  const ordered = [];

  while (used.size < segments.length) {
    const candidates = (incident.get(currentVertex) || []).filter((index) => !used.has(index));
    if (!candidates.length) {
      throw new Error("The selected vector path is disconnected. Use one continuous path.");
    }
    const index = candidates[0];
    const segment = segments[index];
    const forward = segment.start === currentVertex;
    ordered.push({ segment, forward });
    used.add(index);
    currentVertex = forward ? segment.end : segment.start;
  }

  return ordered;
}

function cubicPoint(start, controlOne, controlTwo, end, t) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlOne.x + 3 * inverse * t ** 2 * controlTwo.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlOne.y + 3 * inverse * t ** 2 * controlTwo.y + t ** 3 * end.y,
  };
}

function sampleVectorNetwork(vectorNetwork, stepsPerCurve = 16) {
  const points = [];

  for (const { segment, forward } of orderedSegments(vectorNetwork)) {
    const start = vectorNetwork.vertices[forward ? segment.start : segment.end];
    const end = vectorNetwork.vertices[forward ? segment.end : segment.start];
    const startTangent = forward ? segment.tangentStart : segment.tangentEnd;
    const endTangent = forward ? segment.tangentEnd : segment.tangentStart;
    const controlOne = {
      x: start.x + (startTangent ? startTangent.x : 0),
      y: start.y + (startTangent ? startTangent.y : 0),
    };
    const controlTwo = {
      x: end.x + (endTangent ? endTangent.x : 0),
      y: end.y + (endTangent ? endTangent.y : 0),
    };
    const curve = Boolean(startTangent || endTangent);
    const samples = curve ? stepsPerCurve : 1;

    for (let index = points.length ? 1 : 0; index <= samples; index += 1) {
      points.push(cubicPoint(start, controlOne, controlTwo, end, index / samples));
    }
  }

  return points;
}

function notify(level, text) {
  figma.ui.postMessage({ type: "notice", level, text });
}

function captureSelection(kind) {
  const selected = figma.currentPage.selection;
  if (selected.length !== 1) {
    throw new Error("Select exactly one layer first.");
  }

  const node = selected[0];
  if (kind === "path" && node.type !== "VECTOR") {
    throw new Error("Choose a vector path made with Figma's Pen or Pencil tool.");
  }

  state[`${kind}Id`] = node.id;
  state[`${kind}Name`] = node.name;
  figma.ui.postMessage({ type: "state", state });
  notify("success", `${kind === "source" ? "Source" : "Path"} set to ${node.name}.`);
}

function resolveArrayData(group) {
  if (!isStrokeArrayGroup(group)) throw new Error("Select a current Stroke Array group or start handle.");
  const source = figma.getNodeById(group.getPluginData(PLUGIN_DATA.sourceId));
  const path = figma.getNodeById(group.getPluginData(PLUGIN_DATA.pathId));
  const handle = figma.getNodeById(group.getPluginData(PLUGIN_DATA.handleId));
  let settings;
  try {
    settings = JSON.parse(group.getPluginData(PLUGIN_DATA.settings));
  } catch {
    throw new Error("This array is missing its saved settings. Recreate it with the current plugin.");
  }
  if (!source) throw new Error("The source layer for this array was deleted.");
  if (!path || path.type !== "VECTOR") throw new Error("The vector path for this array was deleted.");
  if (!handle || !isStartHandle(handle)) throw new Error("The start handle for this array was deleted.");
  if (source.parent !== path.parent || handle.parent !== path.parent) {
    throw new Error("The source, path, and start handle must remain in the same parent layer.");
  }
  return { source, path, handle, settings };
}

function createCopies(source, path, points, distances, orientation) {
  return distances.map((distance) => {
    const location = pointAtDistance(points, distance);
    const copy = source.clone();
    source.parent.appendChild(copy);
    copy.x = path.x + location.x - copy.width / 2;
    copy.y = path.y + location.y - copy.height / 2;
    if (orientation === "follow") copy.rotation = source.rotation + location.angle;
    return copy;
  });
}

function saveGroupData(group, source, path, handle, settings, startDistance) {
  group.setPluginData(PLUGIN_DATA.result, "true");
  group.setPluginData(PLUGIN_DATA.sourceId, source.id);
  group.setPluginData(PLUGIN_DATA.pathId, path.id);
  group.setPluginData(PLUGIN_DATA.handleId, handle ? handle.id : "");
  group.setPluginData(PLUGIN_DATA.settings, JSON.stringify(settings));
  group.setPluginData(PLUGIN_DATA.startDistance, String(startDistance));
}

function placeHandle(handle, path, location) {
  const x = path.x + location.x - handle.width / 2;
  const y = path.y + location.y - handle.height / 2;
  ignoredHandlePositions.set(handle.id, { x, y });
  handle.x = x;
  handle.y = y;
}

function createStartHandle(source, path, points) {
  const handle = figma.createEllipse();
  path.parent.appendChild(handle);
  handle.name = `Stroke Array Start Handle: ${source.name}`;
  handle.resize(12, 12);
  handle.fills = [{ type: "SOLID", color: { r: 1, g: 0.84, b: 0.1 } }];
  handle.strokes = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.08 } }];
  handle.strokeWeight = 2;
  handle.setPluginData(PLUGIN_DATA.handle, "true");
  placeHandle(handle, path, pointAtDistance(points, 0));
  return handle;
}

function createArray(options) {
  const source = state.sourceId ? figma.getNodeById(state.sourceId) : null;
  const path = state.pathId ? figma.getNodeById(state.pathId) : null;

  if (!source || !path) {
    throw new Error("Capture a source and path before creating the array.");
  }
  if (source.parent !== path.parent) {
    throw new Error("Source and path must be in the same parent layer.");
  }
  if (path.type !== "VECTOR" || !path.vectorNetwork.segments.length) {
    throw new Error("Choose a vector path with visible geometry.");
  }
  if (typeof source.clone !== "function" || !("width" in source) || !("height" in source)) {
    throw new Error("The selected source cannot be duplicated as a shape.");
  }

  const points = sampleVectorNetwork(path.vectorNetwork);
  const distances = distancesForOptions(pathLength(points), options);
  if (!distances.length) {
    throw new Error("These settings do not place any copies on this path.");
  }

  const copies = createCopies(source, path, points, distances, options.orientation);

  const group = figma.group(copies, source.parent);
  group.name = `Stroke Array: ${source.name}`;
  const handle = createStartHandle(source, path, points);
  saveGroupData(group, source, path, handle, options, 0);
  handle.setPluginData(PLUGIN_DATA.groupId, group.id);
  figma.currentPage.selection = [group];
  figma.viewport.scrollAndZoomIntoView([group, handle]);
  sendHandleState();
  return copies.length;
}

function selectedArray() {
  const selected = figma.currentPage.selection;
  if (selected.length !== 1) return { group: null, handle: null };
  const node = selected[0];
  if (isStrokeArrayGroup(node)) {
    const handle = figma.getNodeById(node.getPluginData(PLUGIN_DATA.handleId));
    return { group: node, handle: isStartHandle(handle) ? handle : null };
  }
  if (isStartHandle(node)) {
    const group = figma.getNodeById(node.getPluginData(PLUGIN_DATA.groupId));
    return { group: isStrokeArrayGroup(group) ? group : null, handle: node };
  }
  return { group: null, handle: null };
}

function sendHandleState() {
  const { group, handle } = selectedArray();
  if (!group || !handle) {
    figma.ui.postMessage({
      type: "handle-state",
      enabled: false,
      message: "Create an array or select a current array group or start handle.",
    });
    return;
  }
  figma.ui.postMessage({ type: "handle-state", enabled: true, handleName: handle.name });
}

function selectHandle() {
  const { handle } = selectedArray();
  if (!handle) throw new Error("Select a current Stroke Array group or start handle.");
  figma.currentPage.selection = [handle];
  figma.viewport.scrollAndZoomIntoView([handle]);
}

function regenerateArray(group, handleOverride = null) {
  const { source, path, handle, settings } = resolveArrayData(group);
  const activeHandle = handleOverride || handle;
  const points = sampleVectorNetwork(path.vectorNetwork);
  const length = pathLength(points);
  const target = {
    x: activeHandle.x + activeHandle.width / 2 - path.x,
    y: activeHandle.y + activeHandle.height / 2 - path.y,
  };
  const nearest = nearestPointOnPath(points, target);
  const startDistance = normalizeDistance(nearest.distance, length);
  const baseDistances = distancesForOptions(length, settings);
  const shifted = shiftDistances(baseDistances, startDistance, length);
  const parent = source.parent;
  const wasGroupSelected = figma.currentPage.selection.length === 1 && figma.currentPage.selection[0].id === group.id;
  group.remove();
  const copies = createCopies(source, path, points, shifted, settings.orientation);
  const replacement = figma.group(copies, parent);
  replacement.name = `Stroke Array: ${source.name}`;
  saveGroupData(replacement, source, path, activeHandle, settings, startDistance);
  activeHandle.setPluginData(PLUGIN_DATA.groupId, replacement.id);
  placeHandle(activeHandle, path, nearest);
  if (wasGroupSelected) figma.currentPage.selection = [replacement];
  sendHandleState();
  return copies.length;
}

function synchronizeSelectedArray() {
  const { group, handle } = selectedArray();
  if (!group || !handle) {
    sendHandleState();
    return;
  }
  regenerateArray(group, handle);
}

function handleDocumentChange(event) {
  const handleIds = new Set(
    event.documentChanges
      .filter((change) => change.type === "PROPERTY_CHANGE")
      .map((change) => change.id),
  );
  for (const id of handleIds) {
    const node = figma.getNodeById(id);
    if (!isStartHandle(node)) continue;
    const ignored = ignoredHandlePositions.get(id);
    if (ignored && Math.abs(node.x - ignored.x) < 0.0001 && Math.abs(node.y - ignored.y) < 0.0001) {
      ignoredHandlePositions.delete(id);
      continue;
    }
    const group = figma.getNodeById(node.getPluginData(PLUGIN_DATA.groupId));
    if (!isStrokeArrayGroup(group)) {
      notify("error", "The array linked to this start handle was deleted.");
      continue;
    }
    try {
      regenerateArray(group, node);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to update the array.");
    }
  }
}

if (typeof figma !== "undefined") {
  figma.showUI(__html__, { width: 360, height: 460, title: "Stroke Array" });
  figma.ui.postMessage({ type: "state", state });
  sendHandleState();
  figma.on("selectionchange", sendHandleState);
  figma.on("documentchange", handleDocumentChange);
  synchronizeSelectedArray();
  figma.ui.onmessage = (message) => {
    try {
      if (message.type === "capture-source") {
        captureSelection("source");
      } else if (message.type === "capture-path") {
        captureSelection("path");
      } else if (message.type === "create-array") {
        const count = createArray(message.options);
        figma.ui.postMessage({ type: "complete", count });
        notify("success", `Created ${count} copies.`);
      } else if (message.type === "get-handle-state") {
        sendHandleState();
      } else if (message.type === "select-handle") {
        selectHandle();
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to create the array.");
    }
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    distancesForOptions,
    isStrokeArrayGroup,
    isStartHandle,
    nearestPointOnPath,
    normalizeDistance,
    orderedSegments,
    pathLength,
    pointAtDistance,
    sampleVectorNetwork,
    shiftDistances,
  };
}
