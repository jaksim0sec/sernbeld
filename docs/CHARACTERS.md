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

## Studio/Live character integration (2026-11-22)

- `src/entities/character/appearance.js` normalizes 30 facial shape values and studio style IDs, registers named residents' gender metadata, and generates deterministic faces by NPC ID + name + title (not by occupational stereotypes). The profile is stable across sessions.
- `src/entities/character/studio-integration.js` attaches a full-body 47-joint character to the player, with a skinned right/left hand weapon attachment. The original first-person camera weapon, footstep sway, landing dip and attack recoil are **preserved**.
- In the Travel screen, **시점 전환** selects first-person or behind-the-player third-person. Third-person uses a world-occluded camera offset and **locks only the attack-specific camera kick**; walking/landing camera motion still follows the existing CameraRig.
- **내 캐릭터** accepts studio JSON settings and exported rigged GLB. The JSON saves shape/style preferences. The GLB provides the actual baked face geometry and skinning, and its binary is stored locally with IndexedDB for future visits.
- Imported GLB replaces the player's visual body, never the existing physics, interaction position or combat hit logic. The 3D weapon follows the animated `hand_right`/`hand_left` joint. Empty/invalid GLBs are rejected.
- Without an imported studio GLB, the player uses the old rigged mannequin as a temporary third-person fallback. NPCs have deterministic gender, all 30 profile values, and head proportions tied to those values, **but do not yet display fully sculpted per-NPC studio faces or hairstyles**. Adding a face profile is not the same as runtime 3D face deformation.
- Both male/female custom studio models have been exported separately for manual player import; model binaries are not yet packaged in this Git repository. Local user models are not uploaded to a server by the game.

## Existing standalone character assets

The legacy registered female-base adapter remains available but is not used as an automatic replacement for live NPC bodies. The new live avatar bridge is imported by the executable `game.js`; its source remains `src/gameplay/gameplay.part.js`. `src/entities/character/*.js` contains standalone ESM modules; when integrating into the actual game, use the existing bundling strategy or establish a proper source build. The user-supplied model should be visually verified (front, oblique, side and motion) before any NPC default replacement.

## Validation

`node tests/character-assets.mjs` uses the `three` package to check asset topology, rig palette counts, pose updates and the standard material factory.

`tests/character-fixture.html` and `tests/character-webgl.mjs` cover rendering in real Chromium WebGL when the development dependencies are installed. Desktop/mobile world regression remains in the existing workflow.

Do not change the original mesh, reinterpret the skin colors, or silently apply the new material to terrain/architecture.
