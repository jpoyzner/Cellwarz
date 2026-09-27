---
description: "Use when adding a new sprite subclass or modifying an existing one under server/sprite/."
applyTo: "server/sprite/**"
---

# Sprite Subclassing Pattern

- Extend the abstract `Sprite` class (or an intermediate abstract subclass like `Mana`), never modify `Sprite`
  itself to special-case a new sprite type.
- **Static `init(cellData: CellData)`** registers animation frames/images once per cell, via `addAction` /
  `addClippedAction` / `addImage` from [frames.ts](../../server/sprite/frames.ts), into a shared `static readonly`
  `Map<string, Frame[]>` (e.g. `Avatar.actionFrames`). This map is shared across all instances of the class, not
  per-instance — it only stays correct because every `CellData` registers images in the same deterministic order
  (see `Sprite` circular-import note in [AGENTS.md](../../AGENTS.md)). Don't register images/actions outside of
  `init()`.
- **Instance constructor** takes `(x, y, cellInit, cell)` (some sprites add leading params, e.g. `Avatar`'s
  `name`) and calls `super(x, y, cellInit, cell)` first.
- Constructors that place a sprite on the grid can throw `ClusteredInitException` (from
  [errors.ts](../../server/errors.ts)) when the spawn position is already occupied. Callers that create sprites
  in a loop or at a possibly-occupied position (see [wall.ts](../../server/sprite/wall.ts),
  [launcher.ts](../../server/sprite/launcher.ts)) must catch it and re-throw anything else:
  ```ts
  try {
    new CellBlock(x, y, false, cell);
  } catch (e) {
    if (!(e instanceof ClusteredInitException)) throw e;
  }
  ```
- Implement the sizing/layer abstract methods (`getWidth`, `getHeight`, `getLayer`, etc.) rather than reading
  fields directly — `Physics` and `CellData` rely on these being overridden per sprite type.
- Read back to the owning `Cell`/`World`/`Engine` only through `cell.getWorld()` / `cell.getEngine()` /
  `cell.getCellData()`, and only via `import type` for the `Cell` type itself — sprites, cells, and the engine
  reference each other in both directions, and this only compiles because the back-reference is type-only
  (erased at build time).
