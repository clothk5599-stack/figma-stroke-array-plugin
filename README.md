# Stroke Array

Stroke Array duplicates one source shape along a selected Figma vector path.

## Install

1. In Figma, open `Plugins` > `Development` > `Import plugin from manifest...`.
2. Choose `manifest.json` from this repository.
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
