# Rotation-Aware Copy Centering Design

## Goal

Keep every generated copy's visual center exactly on its sampled vector-path point, regardless of the path tangent, source rotation, or source aspect ratio.

## Root Cause

The plugin currently assigns `copy.x` and `copy.y` as though the copy were unrotated, then applies path-following rotation. Figma rotates a node around its transform origin, so the node's visual center moves after rotation. The displacement changes with angle, which explains why copies align on some path segments and shift away on others.

## Design

Add a pure `topLeftForCenteredRotation(centerX, centerY, width, height, rotation)` geometry helper. It will rotate the node's local center vector `(width / 2, height / 2)` around the transform origin and subtract that rotated vector from the requested path center.

`createCopies` will determine the final rotation first. It will then call the helper and assign the returned X/Y coordinates. `Keep original` will use the source rotation; `Follow path` will use the source rotation plus the sampled tangent angle.

The fix changes only copy placement. Path sampling, start-handle projection, wrapping, grouping, stored settings, and the source/path layers remain unchanged.

## Testing

Unit tests will verify centered placement at 0, 90, and 180 degrees and with a non-square source. Existing geometry, wrapping, and path-network tests must continue to pass. Controller syntax and panel syntax checks will also be rerun before the fix is committed and pushed to the existing feature branch.
