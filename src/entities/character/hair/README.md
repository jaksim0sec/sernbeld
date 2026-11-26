# Hair T1 contract (prototype)

Head-local metres, Y up, +Z front. Studio body remains read-only; `studioHead(factory.build(profile).body)` converts canonical model units by the same 1.76 m/body-height convention as studio-model, relative to the head pivot. Ray intersections use actual head surface triangles; a miss is explicit, not an ellipsoid substitute. The angular root/cap/part coordinates are theta from crown and phi from +Z, clearance in metres. Full-width/depth profiles in metres; twist in degrees; root cap mask only marks the first ring and its centre. Clumps use Catmull-Rom, transported frames, tapered lens/ellipse profiles, longitudinal UV and seam-normal merging. `scalp-v1` joins shared angular anchors; slot uniqueness, body and common compatibility tag are required; this is a compatibility gate, not proof of visible seams. Material, LOD and physics IDs are reserved T1 debug references; groove count is metadata for T2. No runtime attachment, persistence, shader or spring solver yet.

- `specimen.js`: HAIR-11260710 T1 front/middle/back sample only, no art approval. Original images remain user attachments. Extra slot accepted but no T1 specimen required.
- `node tests/hair-geometry.mjs --synthetic`: isolated geometric checks on three ellipsoids. `node tests/hair-geometry.mjs`: also actual two bodies × seven profiles, ray misses and vertex intrusion. Vertex-only radial depth does not prove triangle/ear/neck intersections; visual and further direct checks required.
- Serve repository root over HTTP, open `tools/dev/hair.html` for actual body/face morph, free orbit and debug color separation. No external CDN or game changes.

### Front-only inspection (v3)
The front foundation is a continuous frontal root panel; six individually authored asymmetric locks overlap it. Full scalp guide is optional/off; unfinished side and rear remain exposed intentionally. No side/back expansion before user front approval. Synthetic and actual tests cover the foundation and front locks, not the optional guide.

### Curve v1 (separate comparison variant)
Cartesian guide points are authored in skull-relative x/y/z (scaled by horizontal radius, crown radius, forward radius). Root is attached via angular anchor. Width/depth are ratios of horizontal/forward radius, tilt is in degrees. Rounded convex exterior/flattened inner custom profile; noncolliding rings are not projected to scalp. Collision-only cross-section translation is measured as fitCorrectionMetres. The old v5 stays selectable; this is an unapproved study, not a replacement of an approved style.
