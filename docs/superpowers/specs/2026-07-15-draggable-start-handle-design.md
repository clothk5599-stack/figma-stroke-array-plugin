# Draggable Start Handle Design

## Goal

Restore access to array creation and replace numeric X/Y group offsets with a persistent, on-canvas handle that controls where an array begins on its captured vector path.

## Current Problem

The Position section increased the UI content beyond the plugin's fixed 460-pixel height. The Orientation and Create Array controls now fall below the visible viewport, making array creation appear broken. The existing X/Y controls also move the completed group away from its path instead of adjusting its start location along the path.

## User Experience

The plugin panel will keep Create Array accessible at all times by using a scrollable content region and a fixed bottom action area.

Creating an array will also create a small circular helper layer named `Stroke Array Start Handle: <source name>`. The handle will begin at the array's first sampled point and remain visible on the canvas after the plugin closes.

While the plugin is open, dragging the handle will:

1. Find the closest sampled point on the linked vector path.
2. Convert that point into a distance along the path.
3. Regenerate the copy positions from that distance while preserving count or spacing, endpoint, and orientation settings.
4. Wrap positions past the end of the path back to its beginning.
5. Snap the handle itself onto the path.

The panel will replace the numeric Position section with a Start Handle section that explains the interaction and offers a `Select handle` button. Selecting either the generated array group or its handle will reconnect the panel to that array.

## Plugin Data

The generated group will store:

- a stable marker identifying it as a Stroke Array result;
- source node ID and path node ID;
- handle node ID;
- serialized array settings;
- current start distance along the path.

The handle will store the generated group ID and a marker identifying it as a Stroke Array start handle. The source and path remain unchanged.

## Geometry

Path geometry will continue to use the ordered sampled polyline derived from the Figma vector network. A new nearest-point function will project the handle center onto every sampled line segment and return both the closest point and its cumulative path distance.

Copy distances will be calculated as before, then shifted by the stored start distance. Every shifted distance will use modulo path length so movement wraps continuously. The start handle will be placed at the point corresponding to the normalized start distance.

This wrap behavior applies to both open and closed vector paths, matching the approved interaction. On an open path, copies that pass the path end reappear at its beginning.

## Update Lifecycle

The plugin will listen for document changes while open. When the linked handle moves, it will update the associated array once, with a guard preventing changes made by the plugin from recursively triggering another update.

Figma does not run a closed plugin in the background. Therefore, the persistent handle remains visible after closing, but dragging it while the plugin is closed will not update the array immediately. Reopening the plugin will detect the selected handle or group, project the handle to the path, and synchronize the array.

If the linked source, path, group, or handle was deleted, the plugin will show a specific error and avoid partial regeneration. Existing arrays created before this feature will not have the required links and must be recreated.

## Visual Treatment

The handle will be a small, high-contrast circular node with a visible stroke and fill, placed above the generated copies. Its name and plugin-data marker will distinguish it from artwork. The plugin will never hide or delete it automatically.

## Testing

Automated tests will cover:

- nearest-point projection and cumulative distance;
- shifting copy distances by a start distance;
- wraparound at the end of the path;
- deterministic repeated updates;
- existing count, spacing, endpoint, tangent, and branched-path behavior.

Static checks will validate controller syntax, panel script syntax, and manifest references. Manual Figma verification will cover creating an array, dragging the handle, wrapping, selecting the handle from the panel, reopening the plugin, and deleting a linked node.
