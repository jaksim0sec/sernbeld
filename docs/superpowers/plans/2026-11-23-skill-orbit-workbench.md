# Skill Orbit Workbench Implementation Plan

> For agentic workers: implementation uses Superpowers execution, test-first on the relative mana/orbit model.

**Goal:** Replace the decorative radial menu with an interactive skill-building orbit while retaining game camera/HUD integration.

**Architecture:** The shared ring and circular action positions are the editor; the center is information-only. Store ordered physical actions in a backward-compatible v2 skill entry. A pure model handles fixed slots, long-press shifts, and relative mana shares. Save, preview and existing v1 records keep working.

**Stack:** Vanilla JavaScript ES modules, HTML, CSS/SVG, existing skill engine/library/runner.

**Spec:** Confirmed requirements from the 2026-11-23 skill UI design conversation.

## Constraints
- No opaque fullscreen cover; world remains visible.
- No unrelated decorative geometry or mismatched color palette.
- Main action orbit ring stays continuous; luminosity expresses mana shares. The outer border does NOT express mana.
- Center displays the complete technique, never an action insertion button.
- Empty available slots are circular translucent +, filled slots show action runes.
- Actions execute clockwise; long-press-and-drop inserts by shifting intervening actions.
- Mana amount belongs to the skill, not individual actions; share allocation totals 100%.
- Retain v1 saved thrust skills. V2 initially supports only thrust until other actions are implemented.
- Detailed center/ring drag adjustment remains deferred. No arbitrary universal max-action progression rule.
- Skip WebGL visual validation per project preference.

## Task 1: Relative shares and physical sequence
- [ ] Add red tests for slot capacity, fixed positions, move/shift, even shares, proportional redistribution, continuous gradient.
- [ ] Implement pure orbit model.
- [ ] Add red tests for v2 compile and v1 persistence.
- [ ] Add v2 composite support without changing v1 behavior.
- [ ] Confirm Node suite passes.

## Task 2: Shared orbital editor
- [ ] Replace old center action button and diamond timeline markup with skill identity center, orbital action slots, continuous common ring.
- [ ] Replace unrelated button piles with one matching mini ring and six semantic dial choices.
- [ ] Implement long-press reorder, select, add/remove, intro/restoration, save, preview.
- [ ] Maintain pointer isolation: UI circles intercept, outside world camera keeps pointer control.

## Task 3: Regression and offline availability
- [ ] Include new module in service-worker precache, increment cache version.
- [ ] Run Node tests and syntax checks.
- [ ] Compare implementation against critique checklist.
- [ ] Do not claim WebGL rendering/visual validation.
