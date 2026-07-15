# Stroke Array

Stroke Array duplicates one source shape along a selected Figma vector path.

## Install

1. In Figma, open `Plugins` > `Development` > `Import plugin from manifest...`.
2. Choose `figma-stroke-array/manifest.json`.
3. Run `Stroke Array` from `Plugins` > `Development`.

## Use

1. Select exactly one source shape, then click `Use selection as source`.
2. Select exactly one vector path made with Figma's Pen or Pencil tool, then click `Use selection as path`.
3. Choose Count or Spacing, whether to include endpoints, and the orientation behavior.
4. Click `Create array`.

The source and path must live in the same parent layer. The plugin leaves both unchanged, creates independent duplicates, and groups them as `Stroke Array: <source name>`.

## Notes

- Paths must be a single continuous `VECTOR` path. Branched or disconnected networks are rejected.
- `Follow path` adds the local path direction to the source's existing rotation. `Keep original` preserves it.
- In Spacing mode, enabling endpoints adds the path end even when it does not fall exactly on the requested spacing interval.

## Move The Array Start

Creating an array also creates a persistent yellow `Stroke Array Start Handle` on the path. Keep the plugin open and drag that handle on the canvas to move the array's starting position. Copies that pass the end of the vector path wrap back to its beginning.

Select the generated array group and click `Select handle` when you need help locating it. The handle remains visible after the plugin closes. If you move it while the plugin is closed, select the handle or array and reopen the plugin to synchronize the array.

Arrays created by older plugin versions do not contain the required source, path, and handle links and must be recreated.
