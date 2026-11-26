# Hair T1 contract (prototype)

Head-local metres, Y up, +Z front. Studio body remains read-only; `studioHead(factory.build(profile).body)` converts canonical model units by the same 1.76 m/body-height convention as studio-model, relative to the head pivot. Ray intersections use actual head surface triangles; a miss is explicit, not an ellipsoid substitute. The angular root/cap/part coordinates are theta from crown and phi from +Z, clearance in metres. Full-width/depth profiles in metres; twist in degrees; root cap mask only marks the first ring and its centre. Clumps use Catmull-Rom, transported frames, tapered lens/ellipse profiles, longitudinal UV and seam-normal merging. `scalp-v1` joins shared angular anchors; slot uniqueness, body and common compatibility tag are required; this is a compatibility gate, not proof of visible seams. Material, LOD and physics IDs are reserved T1 debug references; groove count is metadata for T2. No runtime attachment, persistence, shader or spring solver yet.

- `specimen.js`: HAIR-11260710 T1 Flow Detail 7 front baseline with separate Middle and Back bob specimens. Original images remain user attachments. Extra slot accepted but no T1 specimen required.
- `node tests/hair-geometry.mjs --synthetic`: isolated geometric checks on three ellipsoids. `node tests/hair-geometry.mjs`: also actual two bodies × seven profiles, ray misses and vertex intrusion. Vertex-only radial depth does not prove triangle/ear/neck intersections; visual and further direct checks required.
- Serve repository root over HTTP, open `tools/dev/hair.html` for actual body/face morph, free orbit and debug color separation. No external CDN or game changes.


### Flow v1
Nine authored front locks (including the traced edge companion), varied path, width and end direction. The frontal root panel and ribbon generator remain unchanged. Full scalp guide optional/off. Side/rear are supplied by the separate bob parts below. Other comparison specimens removed from active sources; historical commits retain them. This selection does not establish final art approval.

### Local detail pass
Selected Flow locks support optional detail. Hem keys are lateral coordinate (-1..1) and normalized retained length; start is the beginning of the local deformation; grooves are longitudinal surface relief; bend is a terminal angular offset. No extra independent leaf is created. Unmodified locks use the original ribbon. The detail mesh is closed with welded edges; actual aesthetic approval remains separate.

### Flow Bob v1
Front remains unchanged. Middle and Back have independently authored locks and overlapping angular underlayers (`regionFoundations`). Middle reserves a shorter underlayer around the ears; back has longer nape locks, one with a lower-density carved hem. This is a preview-only style study, not a runtime asset or a completed T2. Per-slot visibility and colors in the viewer support visual inspection. Geometry checks use three synthetic heads; actual studio shapes and visual quality remain separate gates. The prototype triangle count exceeds the intended runtime LOD budget.
