using System.Reflection;
using System.Text.Json;
using UnityEngine;
using LevelGeneration;
using Vanilla.Map;
using ReplayRecorder;

var type = typeof(NativeSurfaces);
void Call(string name, params object[] args) => type.GetMethods(BindingFlags.Static | BindingFlags.NonPublic)
    .Single(method => method.Name == name && method.GetParameters().Select(p => p.ParameterType).Zip(args).All(pair => pair.First.IsInstanceOfType(pair.Second)))
    .Invoke(null, args);
using var document = JsonDocument.Parse(type.Assembly.GetManifestResourceStream("Vanilla.NativeSurfaces.json")!);
var identity = document.RootElement.GetProperty("models").EnumerateArray().First(row => row.GetProperty("kind").GetString() == "floor").GetProperty("capture");
var root = new LG_DimensionRoot { LinkedDimensionIndex = 2 };
MeshRenderer Floor(float x) {
    var renderer = new MeshRenderer { isPartOfStaticBatch = true,
        sharedMaterials = identity.GetProperty("materials").EnumerateArray().Select(name => name.ValueKind == JsonValueKind.Null ? null! : new Material { name = name.GetString()! + " (Instance)" }).ToArray() };
    renderer.gameObject.Components.Add(new MeshFilter { sharedMesh = new Mesh { name = identity.GetProperty("mesh").GetString()! + "(Clone)", vertexCount = identity.GetProperty("vertices").GetInt32() } });
    renderer.gameObject.Components.Add(renderer);
    renderer.transform.parent = root.transform;
    renderer.transform.localToWorldMatrix[12] = x;
    renderer.localToWorldMatrix[12] = 999; // Combined-renderer matrix must never place the source GLB.
    root.gameObject.Descendants.Add(renderer);
    return renderer;
}
Call("Init"); Call("OnDimensionSetup", root);
var final = Floor(10); // Source mesh is intact despite the static-batch flag.
var cached = Floor(20);
Call("OnPrefabBuilt", cached.gameObject);
cached.GetComponent<MeshFilter>()!.sharedMesh = new Mesh { name = "Combined Mesh", vertexCount = 123456 };
cached.enabled = false; // Game visibility culling after capture.
cached.transform.localToWorldMatrix[12] = 30; // Placement finalized after prefab construction.
var unknown = Floor(40); unknown.sharedMaterials[0].name = "custom-rundown-material";
var inactive = Floor(50); inactive.gameObject.activeSelf = false;
Call("Capture");
var values = Replay.Header.Values;
if ((ushort)values[0] != 1 || !(values[1] is string mismatch) || !mismatch.Contains("Unmatched native floor identity") || (ushort)values[2] != 1 || (uint)values[5] != 3)
    throw new Exception("Expected three exact native instances and diagnostics for the unmatched material despite other floors succeeding.");
for (var index = 0; index < 3; ++index) {
    var start = 6 + index * 19;
    if ((byte)values[start + 1] != 2 || (bool)values[start + 2] != (index < 2) || (float)values[start + 3 + 12] != new float[] {10, 30, 50}[index])
        throw new Exception("Lost dimension, logical visibility, or original Transform placement.");
}
Call("Init"); Call("OnDimensionSetup", root);
root.gameObject.Descendants.Clear(); root.gameObject.Descendants.Add(unknown);
Call("Capture");
if (!(Replay.Header.Values[1] is string message) || !message.Contains("No exact native floor identities")) throw new Exception("Unknown floor identity must remain diagnosable.");
Call("Init"); Call("OnDimensionSetup", root); root.gameObject.Descendants.Clear();
identity = document.RootElement.GetProperty("models").EnumerateArray().First(row => row.GetProperty("kind").GetString() == "prop").GetProperty("capture");
Floor(60);
Call("Capture");
if (!(Replay.Header.Values[1] is string propDiagnostic) || !propDiagnostic.Contains("No exact native floor identities"))
    throw new Exception("A recorded prop must not report that native floors were captured.");
Console.WriteLine("PASS: source identities, transforms, culling, unknown materials, and separate prop/floor diagnostics.");
Call("Init"); Call("OnDimensionSetup", root); root.gameObject.Descendants.Clear();
identity = document.RootElement.GetProperty("models").EnumerateArray().First(row => row.GetProperty("capture").GetProperty("materials").EnumerateArray().Any(value => value.ValueKind == JsonValueKind.Null)).GetProperty("capture");
Floor(70); Call("Capture");
var diagnosticCount = (ushort)Replay.Header.Values[0];
if ((ushort)Replay.Header.Values[1 + diagnosticCount] != 1) throw new Exception("Native empty material slots must preserve exact identity.");
Console.WriteLine("PASS: native empty material slots.");

Call("Init"); root.gameObject.Descendants.Clear();
identity = document.RootElement.GetProperty("models").EnumerateArray().First(row => row.GetProperty("kind").GetString() == "floor").GetProperty("capture");
var mergeJob = new LG_MergeStaticMeshes();
var removedFloor = Floor(80);
removedFloor.transform.parent = mergeJob.m_area.transform;
mergeJob.m_area.gameObject.Descendants.Add(removedFloor);
Call("BeforeRoomMerge", mergeJob);
// Room merging can run before dimension-root setup, then destroy the source.
Call("OnDimensionSetup", root);
root.gameObject.Descendants.Clear();
Call("Capture");
if ((ushort)Replay.Header.Values[0] != 0 || (uint)Replay.Header.Values[4] != 1 || (float)Replay.Header.Values[20] != 80)
    throw new Exception("Room merging discarded the native floor or its original placement.");
Call("Init"); Call("OnDimensionSetup", root); root.gameObject.Descendants.Add(removedFloor);
Call("BeforeRoomMerge", mergeJob); Call("BeforeRoomMerge", mergeJob); Call("Capture");
if ((uint)Replay.Header.Values[4] != 1) throw new Exception("Surviving or repeatedly merged renderers were duplicated.");
Console.WriteLine("PASS: removed room-merge sources and surviving source deduplication.");

Call("Init"); Call("OnDimensionSetup", root); root.gameObject.Descendants.Clear();
Floor(90); // A real floor is present; unrelated g_main props must not warn.
identity = document.RootElement.GetProperty("models").EnumerateArray().First(row => row.GetProperty("kind").GetString() == "prop" && row.GetProperty("capture").GetProperty("mesh").GetString() == "g_main").GetProperty("capture");
var cable = Floor(91);
cable.GetComponent<MeshFilter>()!.sharedMesh!.vertexCount = 1085;
cable.sharedMaterials = new[] { new Material { name = "prop_electronics_kit_cableConnector_small_unlisted_variant" } };
Call("Capture");
if ((ushort)Replay.Header.Values[0] != 0) throw new Exception("A generic prop mesh name was misreported as a missing floor.");
Console.WriteLine("PASS: unrelated g_main cable renderers do not produce floor mismatch warnings.");

foreach (var material in new[] { "BuildingPart_StorageGround_Conc_4x4_a", "BuildingPart_StorageGroundGravel_Rock_2x2x2_a" }) {
    Call("Init"); Call("OnDimensionSetup", root); root.gameObject.Descendants.Clear();
    var row = document.RootElement.GetProperty("models").EnumerateArray().Single(row => row.GetProperty("capture").GetProperty("mesh").GetString() == "g_main" && row.GetProperty("capture").GetProperty("materials").EnumerateArray().Any(value => value.GetString() == material));
    identity = row.GetProperty("capture"); Floor(92); Call("Capture");
    if ((ushort)Replay.Header.Values[0] != 0 || (string)Replay.Header.Values[2] != row.GetProperty("id").GetString() || (uint)Replay.Header.Values[4] != 1)
        throw new Exception("The confirmed R1B1 ground identity was not captured: " + material);
}
Console.WriteLine("PASS: both confirmed R1B1 g_main ground identities are captured as floors.");

// Exercise the production matcher with every shipped identity, including shared
// generic names, ordered null material slots and Unity-cloned material names.
Call("Init"); Call("OnDimensionSetup", root); root.gameObject.Descendants.Clear();
var allModels = document.RootElement.GetProperty("models").EnumerateArray().ToArray();
for (var i = 0; i < allModels.Length; i++) {
    identity = allModels[i].GetProperty("capture");
    Floor(100 + i);
}
Call("Capture");
values = Replay.Header.Values;
if ((ushort)values[0] != 0 || (ushort)values[1] != allModels.Length || (uint)values[2 + 2 * allModels.Length] != allModels.Length)
    throw new Exception("The production matcher failed to record every shipped scene identity.");
Console.WriteLine($"PASS: all {allModels.Length} catalog identities recorded through production matching and serialization.");
