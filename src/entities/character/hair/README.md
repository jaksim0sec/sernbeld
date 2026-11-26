# Hair T1 contract (prototype)

Head-local metres, Y up, +Z front. Studio body remains read-only; `studioHead(factory.build(profile).body)` converts canonical model units by the same 1.76 m/body-height convention as studio-model, relative to the head pivot. Ray intersections use actual head surface triangles; a miss is explicit, not an ellipsoid substitute. The angular root/cap/part coordinates are theta from crown and phi from +Z, clearance in metres. Full-width/depth profiles in metres; twist in degrees; root cap mask only marks the first ring and its centre. Clumps use Catmull-Rom, transported frames, tapered lens/ellipse profiles, longitudinal UV and seam-normal merging. `scalp-v1` joins shared angular anchors; slot uniqueness, body and common compatibility tag are required; this is a compatibility gate, not proof of visible seams. Material, LOD and physics IDs are reserved T1 debug references; groove count is metadata for T2. No runtime attachment, persistence, shader or spring solver yet.

- `specimen.js`: HAIR-11260710 T1 Flow v1 front-only specimen, selected as the current baseline. Original images remain user attachments. Extra slot accepted but no T1 specimen required.
- `node tests/hair-geometry.mjs --synthetic`: isolated geometric checks on three ellipsoids. `node tests/hair-geometry.mjs`: also actual two bodies × seven profiles, ray misses and vertex intrusion. Vertex-only radial depth does not prove triangle/ear/neck intersections; visual and further direct checks required.
- Serve repository root over HTTP, open `tools/dev/hair.html` for actual body/face morph, free orbit and debug color separation. No external CDN or game changes.


### Flow v1
Eight authored locks (six main and two subordinate), varied path, width and end direction. The frontal root panel and ribbon generator remain unchanged. Full scalp guide optional/off. Unfinished side/rear deliberately exposed. Other comparison specimens removed from active sources; historical commits retain them. This selection does not establish final art approval.
