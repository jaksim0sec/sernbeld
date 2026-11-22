# Character assets and canonical skin

Character resources are separate from world shaders and from the monolithic running `game.js`.

## Registered defaults

| Registry ID | Location | Status |
|---|---|---|
| `standard-toon-skin-v1` | `src/render/materials/standard-skin.js` | Canonical default skin for future humanoid model registrations |
| `female-base-v1` | `assets/models/characters/female-base-v1.mesh.json` | Available through the ESM loader |
| Female loader + pose rig | `src/entities/character/female-base.js` | Usable in a Three.js scene |
| Character registry | `src/entities/character/registry.js` | Resolves model and default skin IDs |

The female asset was extracted **without changing the geometry, topology, weights, bones or part palettes** from the uploaded file `세른펠드_여성원본_툰스킨_적용.html`. The exported JSON has the original five base64-packed typed arrays (`p`, `n`, `f`, `wi`, `ww`) and `bones`, `parts`, `hands` metadata.

- 34,812 vertices, 69,556 triangles, 17 original draw parts
- 47 articulated bones, including fingers, plus two hand grip metadata groups
- Original positions: signed 16-bit, scaled by `32 * 1428`
- Original normals: normalized signed 8-bit; local joint indices: unsigned 8-bit; bone weights: normalized unsigned 8-bit; face indices: unsigned 16-bit
- Each part has its own skinning palette of up to 16 bones; the loader preserves this for WebGL uniform limits

This is a **custom packed rig**, not a GLB, a Three.js `SkinnedMesh` skeleton, or a humanoid animation-standard retargeting format. The adapter creates one Three.js geometry plus solid and outline meshes per source part and updates their per-part matrices through `setPose`. It doesn't replace your original data or silently retopologize it.

## Standard skin (direct from supplied shader)

- View-space light: `(0.25, 0.62, 0.75)` normalized, independent of the scene sun angle
- Lit RGB: `(0.988, 0.847, 0.769)` (~`#FCD8C4`)
- Shadow RGB: `(0.914, 0.675, 0.596)` (~`#E9AC98`)
- Outline RGB: `(0.69, 0.44, 0.39)` (~`#B0705F`)
- Shade transition: `smoothstep(-0.215, -0.185, dot(viewNormal, light))`
- Rim: `0.04 * smoothstep(0.55, 0.75, 1.0 - abs(normal.z))` on lit side
- Inverted hull: front-face culling for the outline, with thickness `0.00085` in the original normalized local units
- Light-side facial appearance, no strong cast-shadows baked into the uploaded shader

This is a *character material*, not a global postprocessing filter. Facial mesh geometry, eyes, hair, and clothes should have independent assets/material assignment where appropriate.

## Example (future modular character system)

```js
import * as THREE from 'three';
import {loadRegisteredCharacter, DEFAULT_CHARACTER_SKIN}
  from './src/entities/character/registry.js';

const female = await loadRegisteredCharacter(THREE);
// Defaults: female-base-v1 + standard-toon-skin-v1
female.group.scale.setScalar(1.72); // Example world-size choice, not baked into asset
scene.add(female.group);
female.setPose({head:[20,0], upper_arm_left:[15,0]});
// When finished: scene.remove(female.group); female.dispose();
```

The loader accepts a `fetchImpl` for unit tests and a `pose` object. It uses the registered asset URL relative to the repository so a subpath deployment works.

## Active character runtime

The game imports the supplied neck-seam-fixed Character Studio through `studio-source.js`, `studio-geometry.js`, `studio-model.js` and `studio-integration.js`. `studio-v1.json.gz` holds both original body meshes and the editor data. The original 30 face controls, eyes, brows, mouth, ears and accessories remain available in the first-launch creator (`studio.html`). The older registered female asset above remains available as a standalone resource.

The selected profile is stored in `Save.data.character`; `characterCreated` records completion, including for existing v1 saves that have not created a character yet. The player uses the actual 47-bone skinned body at the physics actor position. NPC gender is assigned through explicit cast/name metadata (with a stable fallback), and the name, ID and title seed a repeatable face profile. Equipment is parented to each real hand bone and the fingers close around the grip.

The travel menu contains **시점 전환** and **내 캐릭터**. First-person uses the original attack timing, wall retraction and camera recoil to drive the real arms; the old floating props stay hidden. Third-person animates the whole body and uses a collision-constrained camera boom without attack recoil. Movement camera motion remains controlled by the existing motion setting. First-person targets are adjusted to anatomical reach and viewport aspect ratio.

The service worker caches the creator, its modules and the compressed source so saved characters and character editing remain available offline after a complete online installation.

## Validation

`node tests/character-assets.mjs` uses the `three` package to check asset topology, rig palette counts, pose updates and the standard material factory.

`tests/character-fixture.html` and `tests/character-webgl.mjs` cover rendering in real Chromium WebGL when the development dependencies are installed. Desktop/mobile world regression remains in the existing workflow.

`node tests/studio-model.mjs` checks both original bodies, face deformation, bone skinning, grip and arm solving. `node tests/character-runtime-browser.mjs` exercises actual creation and reload, all 25 NPCs, hand-held weapon motion, first-person visible arm geometry, third-person framing and recoil isolation in landscape and portrait. The general UI regression tests complete the same creation flow before checking existing controls.

Do not change the original mesh, reinterpret the skin colors, or silently apply the new material to terrain/architecture.
