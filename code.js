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
  centerHandleId: "stroke-array-center-handle-id",
  settings: "stroke-array-settings",
  startDistance: "stroke-array-start-distance",
  handle: "stroke-array-start-handle",
  centerHandle: "stroke-array-center-handle",
  groupId: "stroke-array-group-id",
};

const ignoredHandleUpdates = new Map();

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

function topLeftForCenteredRotation(centerX, centerY, width, height, rotation) {
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerOffsetX = cosine * width / 2 + sine * height / 2;
  const centerOffsetY = -sine * width / 2 + cosine * height / 2;
  return {
    x: Number((centerX - centerOffsetX).toFixed(10)),
    y: Number((centerY - centerOffsetY).toFixed(10)),
  };
}

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

function isStrokeArrayGroup(node) {
  return node && node.type === "GROUP" && node.getPluginData(PLUGIN_DATA.result) === "true";
}

function isStartHandle(node) {
  return node && node.type === "ELLIPSE" && node.getPluginData(PLUGIN_DATA.handle) === "true";
}

function isCenterHandle(node) {
  return node && node.type === "ELLIPSE" && node.getPluginData(PLUGIN_DATA.centerHandle) === "true";
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
  if (!isStrokeArrayGroup(group)) throw new Error("Select a current Stroke Array group or linked handle.");
  const source = figma.getNodeById(group.getPluginData(PLUGIN_DATA.sourceId));
  const path = figma.getNodeById(group.getPluginData(PLUGIN_DATA.pathId));
  const startHandle = figma.getNodeById(group.getPluginData(PLUGIN_DATA.handleId));
  const centerHandle = figma.getNodeById(group.getPluginData(PLUGIN_DATA.centerHandleId));
  let settings;
  try {
    settings = JSON.parse(group.getPluginData(PLUGIN_DATA.settings));
  } catch {
    throw new Error("This array is missing its saved settings. Recreate it with the current plugin.");
  }
  if (!source) throw new Error("The source layer for this array was deleted.");
  if (!path || path.type !== "VECTOR") throw new Error("The vector path for this array was deleted.");
  if (!startHandle || !isStartHandle(startHandle)) throw new Error("The start handle for this array was deleted.");
  if (settings.orientation === "center" && (!centerHandle || !isCenterHandle(centerHandle))) {
    throw new Error("The center handle for this array was deleted.");
  }
  if (
    source.parent !== path.parent
    || startHandle.parent !== path.parent
    || (centerHandle && centerHandle.parent !== path.parent)
  ) {
    throw new Error("The source, path, and linked handles must remain in the same parent layer.");
  }
  return { source, path, startHandle, centerHandle: isCenterHandle(centerHandle) ? centerHandle : null, settings };
}

function createCopies(source, path, points, distances, orientation, centerPoint = null) {
  return distances.map((distance) => {
    const location = pointAtDistance(points, distance);
    const copy = source.clone();
    source.parent.appendChild(copy);
    const copyPoint = { x: path.x + location.x, y: path.y + location.y };
    let rotation = source.rotation;
    if (orientation === "follow") rotation = source.rotation + location.angle;
    if (orientation === "center") {
      if (!centerPoint) throw new Error("The Face Center orientation requires a center handle.");
      rotation = bottomEdgeRotationTowardPoint(copyPoint, centerPoint, source.rotation);
    }
    copy.rotation = rotation;
    const position = topLeftForCenteredRotation(
      copyPoint.x,
      copyPoint.y,
      copy.width,
      copy.height,
      rotation,
    );
    copy.x = position.x;
    copy.y = position.y;
    return copy;
  });
}

function saveGroupData(group, source, path, startHandle, centerHandle, settings, startDistance) {
  group.setPluginData(PLUGIN_DATA.result, "true");
  group.setPluginData(PLUGIN_DATA.sourceId, source.id);
  group.setPluginData(PLUGIN_DATA.pathId, path.id);
  group.setPluginData(PLUGIN_DATA.handleId, startHandle ? startHandle.id : "");
  group.setPluginData(PLUGIN_DATA.centerHandleId, centerHandle ? centerHandle.id : "");
  group.setPluginData(PLUGIN_DATA.settings, JSON.stringify(settings));
  group.setPluginData(PLUGIN_DATA.startDistance, String(startDistance));
}

function rememberHandleState(handle) {
  ignoredHandleUpdates.set(handle.id, {
    x: handle.x,
    y: handle.y,
    groupId: handle.getPluginData(PLUGIN_DATA.groupId),
  });
}

function placeStartHandle(handle, path, location) {
  const x = path.x + location.x - handle.width / 2;
  const y = path.y + location.y - handle.height / 2;
  handle.x = x;
  handle.y = y;
  rememberHandleState(handle);
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
  placeStartHandle(handle, path, pointAtDistance(points, 0));
  return handle;
}

function createCenterHandle(source, path, points) {
  const handle = figma.createEllipse();
  path.parent.appendChild(handle);
  handle.name = `Stroke Array Center Handle: ${source.name}`;
  handle.resize(14, 14);
  handle.fills = [{ type: "SOLID", color: { r: 0.35, g: 0.78, b: 1 } }];
  handle.strokes = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.08 } }];
  handle.strokeWeight = 2;
  handle.setPluginData(PLUGIN_DATA.centerHandle, "true");
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  handle.x = path.x + (minX + maxX) / 2 - handle.width / 2;
  handle.y = path.y + (minY + maxY) / 2 - handle.height / 2;
  return handle;
}

function handleCenter(handle) {
  return handle ? { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 } : null;
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

  const centerHandle = options.orientation === "center" ? createCenterHandle(source, path, points) : null;
  const copies = createCopies(source, path, points, distances, options.orientation, handleCenter(centerHandle));

  const group = figma.group(copies, source.parent);
  group.name = `Stroke Array: ${source.name}`;
  const startHandle = createStartHandle(source, path, points);
  saveGroupData(group, source, path, startHandle, centerHandle, options, 0);
  startHandle.setPluginData(PLUGIN_DATA.groupId, group.id);
  rememberHandleState(startHandle);
  if (centerHandle) {
    centerHandle.setPluginData(PLUGIN_DATA.groupId, group.id);
    rememberHandleState(centerHandle);
  }
  figma.currentPage.selection = [group];
  figma.viewport.scrollAndZoomIntoView([group, startHandle, ...(centerHandle ? [centerHandle] : [])]);
  sendHandleState();
  return copies.length;
}

function selectedArray() {
  const selected = figma.currentPage.selection;
  if (selected.length !== 1) return { group: null, startHandle: null, centerHandle: null };
  const node = selected[0];
  if (isStrokeArrayGroup(node)) {
    const startHandle = figma.getNodeById(node.getPluginData(PLUGIN_DATA.handleId));
    const centerHandle = figma.getNodeById(node.getPluginData(PLUGIN_DATA.centerHandleId));
    return {
      group: node,
      startHandle: isStartHandle(startHandle) ? startHandle : null,
      centerHandle: isCenterHandle(centerHandle) ? centerHandle : null,
    };
  }
  if (isStartHandle(node) || isCenterHandle(node)) {
    const group = figma.getNodeById(node.getPluginData(PLUGIN_DATA.groupId));
    if (!isStrokeArrayGroup(group)) return { group: null, startHandle: null, centerHandle: null };
    const startHandle = figma.getNodeById(group.getPluginData(PLUGIN_DATA.handleId));
    const centerHandle = figma.getNodeById(group.getPluginData(PLUGIN_DATA.centerHandleId));
    return {
      group,
      startHandle: isStartHandle(startHandle) ? startHandle : null,
      centerHandle: isCenterHandle(centerHandle) ? centerHandle : null,
    };
  }
  return { group: null, startHandle: null, centerHandle: null };
}

function sendHandleState() {
  const { group, startHandle, centerHandle } = selectedArray();
  if (!group || !startHandle) {
    figma.ui.postMessage({
      type: "handle-state",
      startEnabled: false,
      centerEnabled: false,
      message: "Create an array or select a current array group or linked handle.",
    });
    return;
  }
  figma.ui.postMessage({
    type: "handle-state",
    startEnabled: true,
    centerEnabled: Boolean(centerHandle),
  });
}

function selectHandle(kind) {
  const { startHandle, centerHandle } = selectedArray();
  const handle = kind === "center" ? centerHandle : startHandle;
  if (!handle) throw new Error(`This array does not have a ${kind} handle.`);
  figma.currentPage.selection = [handle];
  figma.viewport.scrollAndZoomIntoView([handle]);
}

function regenerateArray(group) {
  const { source, path, startHandle, centerHandle, settings } = resolveArrayData(group);
  const points = sampleVectorNetwork(path.vectorNetwork);
  const length = pathLength(points);
  const target = {
    x: startHandle.x + startHandle.width / 2 - path.x,
    y: startHandle.y + startHandle.height / 2 - path.y,
  };
  const nearest = nearestPointOnPath(points, target);
  const startDistance = normalizeDistance(nearest.distance, length);
  const baseDistances = distancesForOptions(length, settings);
  const shifted = shiftDistances(baseDistances, startDistance, length);
  const parent = source.parent;
  const wasGroupSelected = figma.currentPage.selection.length === 1 && figma.currentPage.selection[0].id === group.id;
  group.remove();
  const copies = createCopies(source, path, points, shifted, settings.orientation, handleCenter(centerHandle));
  const replacement = figma.group(copies, parent);
  replacement.name = `Stroke Array: ${source.name}`;
  saveGroupData(replacement, source, path, startHandle, centerHandle, settings, startDistance);
  startHandle.setPluginData(PLUGIN_DATA.groupId, replacement.id);
  placeStartHandle(startHandle, path, nearest);
  if (centerHandle) {
    centerHandle.setPluginData(PLUGIN_DATA.groupId, replacement.id);
    rememberHandleState(centerHandle);
  }
  if (wasGroupSelected) figma.currentPage.selection = [replacement];
  sendHandleState();
  return copies.length;
}

function synchronizeSelectedArray() {
  const { group, startHandle } = selectedArray();
  if (!group || !startHandle) {
    sendHandleState();
    return;
  }
  try {
    regenerateArray(group);
  } catch (error) {
    notify("error", error instanceof Error ? error.message : "Unable to synchronize the array.");
  }
}

function handleDocumentChange(event) {
  const handleIds = new Set(
    event.documentChanges
      .filter((change) => change.type === "PROPERTY_CHANGE")
      .map((change) => change.id),
  );
  for (const id of handleIds) {
    const node = figma.getNodeById(id);
    if (!isStartHandle(node) && !isCenterHandle(node)) continue;
    const ignored = ignoredHandleUpdates.get(id);
    if (
      ignored
      && Math.abs(node.x - ignored.x) < 0.0001
      && Math.abs(node.y - ignored.y) < 0.0001
      && node.getPluginData(PLUGIN_DATA.groupId) === ignored.groupId
    ) {
      ignoredHandleUpdates.delete(id);
      continue;
    }
    const group = figma.getNodeById(node.getPluginData(PLUGIN_DATA.groupId));
    if (!isStrokeArrayGroup(group)) {
      notify("error", "The array linked to this handle was deleted.");
      continue;
    }
    try {
      regenerateArray(group);
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
      } else if (message.type === "select-start-handle") {
        selectHandle("start");
      } else if (message.type === "select-center-handle") {
        selectHandle("center");
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to create the array.");
    }
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    bottomEdgeRotationTowardPoint,
    distancesForOptions,
    isStrokeArrayGroup,
    isStartHandle,
    isCenterHandle,
    nearestPointOnPath,
    normalizeDistance,
    normalizeRotation,
    orderedSegments,
    pathLength,
    pointAtDistance,
    sampleVectorNetwork,
    shiftDistances,
    topLeftForCenteredRotation,
  };
}
