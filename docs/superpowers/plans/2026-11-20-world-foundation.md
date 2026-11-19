# World foundation: incremental integration

## Goal
Keep the existing Three.js game working while removing the first barriers to scaling entities, events and inventory. Preserve all existing player saves and leave character customization to its other developer.

## Agreed design
- Hybrid world: shared rules with per-content exceptions.
- Mixed entity persistence: active registry now; persistent changes later.
- Ordinary consumables remain compact stacks. Individually meaningful items may have their own saved state.
- Only committed actions publish notifications. One listener failure must not abort another system.
- Start with the current world, not a new streaming system.

## Implementation tasks
1. Add test-first modules for entity lookup, session events and optional unique inventory.
2. Connect them to the existing game: register live inhabitants, publish gathering and inventory changes, preserve old count-based bag behavior.
3. Precache new modules for offline play and update browser-regression tests.
4. Run source reconstruction, syntax, unit, WebGL, mobile and PWA regression where available.

## Out of scope
No new character model, no ECS rewrite, no item UI rework, no new region-streaming engine, no changes to main. Further work can migrate region state and unique item UI once this vertical slice is validated.
