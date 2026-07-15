# Face-Center Orientation Design

## Goal

Add an orientation mode that keeps copies positioned on the vector path while rotating each copy so its bottom edge points toward a user-defined center.

## User Experience

The Orientation section will contain three modes: `Follow path`, `Keep original`, and `Face center`.

When `Face center` is selected, creating an array will create a second persistent canvas helper named `Stroke Array Center Handle: <source name>`. The existing yellow start handle continues to control the array's starting distance. The center handle will use a distinct high-contrast color and will initially appear at the center of the sampled path bounds.

Dragging the center handle while the plugin is open will regenerate copy rotations without changing their path positions. Every copy's local bottom-edge direction will point from the copy center toward the center handle. Dragging the start handle will continue to shift copy positions and will preserve face-center orientation.

The Start Handle panel section will become a Handles section with `Select start handle` and, for face-center arrays, `Select center handle` buttons. Follow Path and Keep Original arrays will not create a center handle or show an enabled center-handle button.

Both helper layers remain visible after the plugin closes. Figma does not execute closed plugins, so movement made while closed will synchronize when the plugin is reopened with the array group or either linked handle selected.

## Data Model

The generated array group will add a `centerHandleId` plugin-data field. The center handle will store a center-handle marker and the current generated group ID. Array settings already persist the selected orientation mode.

The start handle, center handle, source, path, and generated group must remain in the same parent layer. Missing linked nodes produce a specific message and do not partially regenerate the array. Existing arrays must be recreated to use Face Center.

## Rotation Geometry

For a copy centered at `(copyX, copyY)` and center handle at `(centerX, centerY)`, calculate the screen-space direction angle with `atan2(centerY - copyY, centerX - copyX)`. Figma's positive rotation uses the matrix convention `[[cos, sin], [-sin, cos]]`, so aligning the copy's local bottom vector with that direction requires:

`rotation = 90 degrees - directionAngle`

The result will be normalized to Figma's `-180` to `180` degree range. If a copy is exactly centered on the orientation handle, its source rotation is retained because no unique facing direction exists.

The existing rotation-aware centering helper will position the copy after this final rotation is calculated, keeping its visual center on the sampled path.

## Update Lifecycle

The document-change listener will recognize both helper markers. A moved start handle projects onto the path and updates positions plus rotations. A moved center handle keeps the stored start distance, snaps nowhere, and updates rotations only. Plugin-authored helper metadata/position changes remain guarded to prevent recursive regeneration.

Regeneration may replace the generated group, so both handles' stored group IDs must be updated after every regeneration.

## Testing

Pure tests will cover bottom-edge orientation toward centers located above, right, below, and left of a copy, angle normalization, and the coincident-point fallback. Existing path, wrapping, projection, and rotation-aware centering tests must continue to pass.

Static verification will cover controller syntax, UI script syntax, manifest references, and a 360-by-460 panel layout check. Manual Figma verification will cover creating a face-center array, dragging each handle, reopening after moving a handle while closed, and confirming Follow Path and Keep Original do not create center handles.
