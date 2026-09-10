# Recorded environment appearance

See [runtime model resources](model-resources.md) for asset ownership and import instructions.

Environment mesh and texture resources are shared viewer files. They are never
embedded in each recording. The recorder writes native object transforms, native
state and lightweight floor theme identifiers. Geometry and appearance remain
separate: floor themes do not reconstruct original rooms, original UVs or the
Unity CMS shader.

## Persisted formats

All fields use the existing little-endian BitHelper conventions. Vector3 is three
float32 values (12 bytes); HalfQuaternion is a largest-component index byte and
three float16 values (7 bytes); strings
are a uint16 UTF-8 byte count followed by those bytes. Only current Recorder formats
are supported. Missing appearance resources do not require historical format readers.

Position vectors are converted from Unity coordinates by reflecting X in the
viewer. Scale vectors are raw float triples and must not reflect X.

| Header | Version | Additions after the existing fields of each row |
| --- | --- | --- |
| Vanilla.Map.Doors | 0.0.2 | Vector3 world lossyScale; string native door-core GameObject name (the instantiated gate prefab root) |
| Vanilla.Map.ResourceContainers | 0.0.5 | Vector3 world lossyScale; bool hasLockTransform; if true: Vector3 lock world position, HalfQuaternion lock world rotation, Vector3 lock world lossyScale; string native container-core GameObject name |
| Vanilla.Map.Terminals | 0.0.3 | Vector3 world lossyScale; string native terminal GameObject name |
| Vanilla.Map.Generators | 0.0.2 | Vector3 world lossyScale |
| Vanilla.Map.DisinfectStations | 0.0.2 | Vector3 world lossyScale |
| Vanilla.Map.BulkheadControllers | 0.0.2 | Vector3 world lossyScale, after the three existing optional connected-door fields |

ResourceContainers.State 0.0.2 writes `bool closed, byte lock` for both spawn and
update, where lock is 0 none, 1 melee, 2 hackable. Lock-only changes now produce a
delta. Lock transforms come from the actual `LG_WeakResourceContainer.m_weakLock`,
not a reconstructed attachment offset. Container names are matched against the
native prefab catalog; unknown boxes and lockers use basic shapes of their recorded
category and scale, retaining open/closed and lock state. Version 0.0.5 requires a
matching new Recorder and Viewer. The terminal name is raw source evidence,
not a stable public asset ID. Unknown/modded names must not be silently identified
as a specific vanilla model.

Spitters.State 0.0.2 writes `byte state, bool hasAppearance` for both spawn and
update. If available, this is followed by `float16 blend, float16 glowR,
float16 glowG, float16 glowB, float16 glowA, float16 scaleX, float16 scaleY,
float16 scaleZ` (18 bytes total including state and availability). Blend and glow
are read from the actual MaterialPropertyBlock using the native shader IDs;
scale is the current localScale, with no coordinate reflection. Half precision
is applied before dirty comparisons. A missing native property block is explicit
unavailable; a failed native call is logged once for that spitter and disables
further appearance reads while the existing state enum continues recording.

The native gate name is also necessary: `ComplexResourceSetDataBlock` selects
8x8 for Mining LargeBulkheadGates but 8x4 for Service LargeBulkheadGates. Gate size
alone does not uniquely identify the source prefab. The installed game's
`resources.assets:2353` resource table is the mapping evidence.

Geometry 0.0.3 retains `byte dimension, ushort vertexCount, uint indexCount`, then
the existing Vector3 vertices and ushort indices. It appends exactly
`indexCount / 3` theme bytes, one per triangle in the same order:

| Value | Theme |
| --- | --- |
| 0 | Unknown |
| 1 | Mining |
| 2 | Storage |
| 3 | Tech |
| 4 | Service |
| 5 | Gardens lab |
| 6 | Gardens forest |
| 7 | Desert |
| 8 | Refinery |
| 9 | Dig site |
| 10 | Jungle |
| 11 | Tech laboratory |
| 12 | Mixed gardens |

Geometry 0.0.2 has the same byte layout but permits only themes 0 through 10;
its Tech theme included laboratories. Version 0.0.3 separates native Lab=4
from DataCenter=3 and labels mixed Gardens=11 rooms explicitly. Native garden
geomorphs contain laboratory panels, concrete and forest ground in the same room;
their zone field cannot identify the material below each triangle. Historical
0.0.1 and 0.0.2 readers have been removed. Exact geomorph family tokens are verified
against the installed ComplexResourceSet and DimensionData references. This also
identifies ordinary mining/tech prefabs used by static dimensions. Unresolved
special-dimension arenas remain unknown. Native All=5 and
Plug_SubComplex_Transition=8 remain unknown unless the actual geomorph identifies
a family. A recorded theme is a room/dimension family,
not a per-triangle source material: a room may mix grating, concrete and soil.

Theme collection runs once while producing the header. It queries the triangle
centroid using native `AIG_CourseNode.TryGetCourseNode`, the owning zone's
`ExpeditionZoneData.SubComplex`, `Dimension.ResourceData.ComplexType`, and the
native geomorph name. Explicit jungle/desert dimension names identify those
dimension families. Missing node/unclassified source remains unknown; the native
Gardens zone uses the explicit mixed Gardens family. A native
lookup exception is logged once and remaining surfaces remain explicitly unknown;
it does not change navigation geometry. Navmesh replacement during capture is now
enclosed in `try/finally` so exceptions still restore all game dimension navmeshes.

## Viewer floor appearance

Recorded native floor instances use their own Low geometry, source UVs and game
textures. Full navigation geometry supports picking and line-of-sight queries. A separate
default floor covers missing native surfaces. Loaded native floor footprints cut
intersecting navigation triangles at their boundaries, including a height band
for voxelized terrain and stairs. Props do not remove supporting ground. Resource
failures retain the default floor and produce diagnostics. A biome identifier cannot select the actual grating, concrete or soil
under a triangle, so the Viewer does not project a representative texture over
the entire level. An existing recording with no native floor identities cannot
recover those identities from its navigation mesh.

The Recorder preserves source identities at prefab construction and before static/indirect
batching, and normalizes Unity's instance/clone suffixes. Matching always checks
the actual mesh and material identity, even when the native renderer reports
`isPartOfStaticBatch`: this flag can be true while the original mesh is intact.
Final placement comes from the object's `Transform.localToWorldMatrix`, never
the renderer matrix used to address combined vertices. An empty native floor
capture includes scan counts and a bounded sample of recognized meshes whose
material/vertex identities did not match, for diagnosis in the Viewer.

## Verification boundary

Modded appearance names are not a recording prerequisite. Native floor capture
requires an exact mesh name, vertex count and material-name match; an unknown
identity is omitted from the optional native surface list while navigation
geometry is still recorded. Unknown source themes serialize as Unknown (0).
Terminals and doors retain their recorded identity, transform and state even when
their prefab name has no Viewer model. The Viewer displays a basic shape instead
of guessing a vanilla asset. Missing models/catalogs/textures produce diagnostics,
not a failed replay; playback, seeking and dimension changes remain available.
This concerns appearance assets, not unsupported custom gameplay protocols or
corrupt recording data. A fresh modded game session remains the native acceptance
test; synthetic playback tests cover unknown terminals, doors and floor identities.

The Recorder build requires the target game's BepInEx interop assemblies.
`Tests/Environment` checks source classification; `Tests/NativeSurfaces` executes
the capture flow with misleading batch flags, replaced meshes, finalized object
transforms, visibility culling and unknown materials. These boundary substitutes
do not validate Harmony hook timing in a running game. A fresh recording is required;
previous recordings with zero native instances cannot recover missing identities.

All booster artifacts (item 152) deliberately use the Muted pickup's prepared Low
mesh and textures (256 triangles). It shares native mesh/materials with commodity
122, but uses the Muted prefab's own active transforms. No category field or extra
recording stream is needed. `Tools/runtime-artifact-package.cjs` imports this mesh
from Model Site without extracting or simplifying game geometry.

`Tests/Viewer/native-item-assets.test.cjs` checks Artifact delivery, and
`Tests/Viewer/floor-materials.test.cjs` checks the supported geometry byte layout. Native surface tests verify
model and texture presence, hashes and source UVs. A new game session is still required to
verify native setup timing, modded prefab names and frame-time impact in gameplay.

## R2D2 room merging and support heights (2026-09-09)

GTFO also runs `LG_MergeStaticMeshes.Build`, independently of Unity static and
indirect batching. The Recorder snapshots matching source instances and finalized
transforms before this room job; destroyed sources survive in the recording, and
surviving sources are deduplicated. Unmatched recognized identities now produce
diagnostics even when some other floors succeeded. The game log reports preserved
room-merge source counts for live verification.

Geometry 0.0.4 appends one float32 support Y per vertex after the theme bytes.
A downward static-world ray records collision height independently of navigation;
no hit retains the existing navigation-minus-0.1 default. The ray starts 0.25 m
above navigation and reaches 1.5 m below it, ignores triggers and rejects steep
normals. Viewer applies these heights only to the default floor. Navigation queries
and player motion remain unchanged. Geometry 0.0.3 remains readable because users'
existing recordings persist that format, but contains no measured support heights.

The R2D2 11:33 recording has 3,766 instances, 43 enabled identities and no missing
textures. Its default navigation floor can sit 0.684 m above recorded feet.
Those missing native identities/placements and collision samples cannot be recovered
from this file. Unit tests exercise removed merge sources, deduplication, support
separation and binary alignment. Real-game Harmony timing and collision sampling
still require a new expedition; no live capture acceptance is claimed.
