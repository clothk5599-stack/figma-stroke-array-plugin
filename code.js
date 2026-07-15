const state = { sourceId: null, sourceName: null, pathId: null, pathName: null };

function distancesForOptions(length, { mode, value, includeEndpoints }) {
  if (!Number.isFinite(length) || length <= 0) throw new Error("The path has no measurable length.");
  if (mode === "count") {
    if (!Number.isInteger(value) || value < 1) throw new Error("Count must be a positive whole number.");
    if (value === 1) return [includeEndpoints ? 0 : length / 2];
    const start = includeEndpoints ? 0 : length / value;
    const end = includeEndpoints ? length : length - length / value;
    return Array.from({ length: value }, (_, index) => start + ((end - start) * index) / (value - 1));
  }
  if (mode !== "spacing" || !Number.isFinite(value) || value <= 0) throw new Error("Spacing must be greater than zero.");
  const distances = [];
  for (let distance = includeEndpoints ? 0 : value; distance <= length + 0.0001; distance += value) {
    distances.push(Math.min(distance, length));
  }
  if (includeEndpoints && distances[distances.length - 1] !== length) distances.push(length);
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
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    if (remaining <= length || index === points.length - 1) {
      const ratio = Math.min(1, remaining / length);
      return { x: start.x + dx * ratio, y: start.y + dy * ratio, angle: Math.atan2(dy, dx) * 180 / Math.PI };
    }
    remaining -= length;
  }
  throw new Error("The path has no measurable segments.");
}

function orderedSegments(vectorNetwork) {
  const { segments, vertices } = vectorNetwork;
  if (!segments.length || !vertices.length) throw new Error("Choose a vector path with visible geometry.");
  const incident = new Map();

  segments.forEach((segment, index) => {
    [segment.start, segment.end].forEach((vertexIndex) => {
      const list = incident.get(vertexIndex) || [];
      list.push(index);
      incident.set(vertexIndex, list);
    });
  });

  if ([...incident.values()].some((list) => list.length > 2)) {
    throw new Error("The selected vector path branches. Use one continuous path.");
  }

  const endpoint = [...incident.entries()].find(([, list]) => list.length === 1);
  let currentVertex = endpoint ? endpoint[0] : segments[0].start;
  const used = new Set();
  const ordered = [];

  while (used.size < segments.length) {
    const candidates = (incident.get(currentVertex) || []).filter((index) => !used.has(index));
    if (!candidates.length) throw new Error("The selected vector path is disconnected. Use one continuous path.");
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
    const controlOne = { x: start.x + (startTangent ? startTangent.x : 0), y: start.y + (startTangent ? startTangent.y : 0) };
    const controlTwo = { x: end.x + (endTangent ? endTangent.x : 0), y: end.y + (endTangent ? endTangent.y : 0) };
    const samples = startTangent || endTangent ? stepsPerCurve : 1;
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
  if (selected.length !== 1) throw new Error("Select exactly one layer first.");
  const node = selected[0];
  if (kind === "path" && node.type !== "VECTOR") {
    throw new Error("Choose a vector path made with Figma's Pen or Pencil tool.");
  }
  state[`${kind}Id`] = node.id;
  state[`${kind}Name`] = node.name;
  figma.ui.postMessage({ type: "state", state });
  notify("success", `${kind === "source" ? "Source" : "Path"} set to ${node.name}.`);
}

function createArray(options) {
  const source = state.sourceId ? figma.getNodeById(state.sourceId) : null;
  const path = state.pathId ? figma.getNodeById(state.pathId) : null;
  if (!source || !path) throw new Error("Capture a source and path before creating the array.");
  if (source.parent !== path.parent) throw new Error("Source and path must be in the same parent layer.");
  if (path.type !== "VECTOR" || !path.vectorNetwork.segments.length) throw new Error("Choose a vector path with visible geometry.");
  if (typeof source.clone !== "function" || !("width" in source) || !("height" in source)) {
    throw new Error("The selected source cannot be duplicated as a shape.");
  }

  const points = sampleVectorNetwork(path.vectorNetwork);
  const distances = distancesForOptions(pathLength(points), options);
  const copies = distances.map((distance) => {
    const location = pointAtDistance(points, distance);
    const copy = source.clone();
    source.parent.appendChild(copy);
    copy.x = path.x + location.x - copy.width / 2;
    copy.y = path.y + location.y - copy.height / 2;
    if (options.orientation === "follow") copy.rotation = source.rotation + location.angle;
    return copy;
  });

  const group = figma.group(copies, source.parent);
  group.name = `Stroke Array: ${source.name}`;
  figma.currentPage.selection = [group];
  figma.viewport.scrollAndZoomIntoView([group]);
  return copies.length;
}

if (typeof figma !== "undefined") {
  figma.showUI(__html__, { width: 360, height: 460, title: "Stroke Array" });
  figma.ui.postMessage({ type: "state", state });
  figma.ui.onmessage = (message) => {
    try {
      if (message.type === "capture-source") captureSelection("source");
      else if (message.type === "capture-path") captureSelection("path");
      else if (message.type === "create-array") {
        const count = createArray(message.options);
        figma.ui.postMessage({ type: "complete", count });
        notify("success", `Created ${count} copies.`);
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to create the array.");
    }
  };
}

if (typeof module !== "undefined") {
  module.exports = { distancesForOptions, orderedSegments, pathLength, pointAtDistance, sampleVectorNetwork };
}
