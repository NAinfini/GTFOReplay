// Native boundary substitutes: execute the production capture flow with source
// meshes, misleading batching flags, culling, and independently moving transforms.
using System.Reflection;
namespace UnityEngine {
    public class Object {
        private static int nextId;
        private readonly int id = ++nextId;
        public string name = "";
        public int GetInstanceID() => id;
        public T? TryCast<T>() where T : class => this as T;
    }
    public sealed class Matrix4x4 {
        private readonly float[] values = new float[16];
        public Matrix4x4() { values[0] = values[5] = values[10] = values[15] = 1; }
        public float this[int i] { get => values[i]; set => values[i] = value; }
    }
    public sealed class Transform {
        public GameObject gameObject;
        public Transform? parent;
        public Matrix4x4 localToWorldMatrix = new();
        public Transform(GameObject owner) { gameObject = owner; }
    }
    public class GameObject : Object {
        public readonly Transform transform;
        public bool activeSelf = true;
        public List<Object> Components = new(), Descendants = new();
        public GameObject() { transform = new(this); }
        public T? GetComponent<T>() where T : class => Components.OfType<T>().FirstOrDefault();
        public T[] GetComponentsInChildren<T>(bool includeInactive) => Components.Concat(Descendants).OfType<T>().ToArray();
    }
    public class Component : Object {
        public GameObject gameObject = new();
        public Transform transform => gameObject.transform;
        public T? GetComponent<T>() where T : class => gameObject.GetComponent<T>();
        public T[] GetComponentsInChildren<T>(bool includeInactive) => gameObject.GetComponentsInChildren<T>(includeInactive);
    }
    public sealed class Mesh : Object { public int vertexCount; }
    public sealed class Material : Object { }
    public sealed class MeshFilter : Component { public Mesh? sharedMesh; }
    public sealed class MeshRenderer : Component {
        public bool enabled = true, isPartOfStaticBatch;
        public Material[] sharedMaterials = Array.Empty<Material>();
        public Matrix4x4 localToWorldMatrix = new();
    }
    public static class InternalStaticBatchingUtility { public static void CombineGameObjects() { } }
}
namespace LevelGeneration {
    public sealed class LG_Area : UnityEngine.Component { }
    public sealed class LG_MergeStaticMeshes { public LG_Area m_area = new(); public bool Build() => true; }
    public sealed class LG_DimensionRoot : UnityEngine.Component { public int LinkedDimensionIndex; public void Setup() { } }
    public sealed class LG_PrefabSpawner { public UnityEngine.GameObject OnBuild() => new(); }
}
public sealed class IndirectBatcher : UnityEngine.Component { public void CreateBatches() { } }
namespace CullingSystem {
    public class C_CullBucket { public UnityEngine.Object[] Renderers = Array.Empty<UnityEngine.Object>(); public void Hide() { } public void HideSafe() { } }
    public class C_CullingCluster : C_CullBucket { }
}
namespace Il2CppInterop.Runtime.InteropTypes.Arrays { public class Il2CppReferenceArray<T> : List<T> { } }
namespace HarmonyLib {
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class HarmonyPatch : Attribute { public HarmonyPatch() { } public HarmonyPatch(Type type, string method) { } }
    public class HarmonyPrefix : Attribute { }
    public class HarmonyPostfix : Attribute { }
    public static class AccessTools { public static MethodInfo Method(Type type, string method) => type.GetMethod(method)!; }
}
namespace API {
    public sealed class ByteBuffer { public List<object> Values = new(); }
    public static class BitHelper { public static void WriteBytes<T>(T value, ByteBuffer buffer) where T : notnull => buffer.Values.Add(value); }
    public static class APILogger { public static void Error(string message) => Console.WriteLine(message); public static void Debug(string message) { } public static void Warn(string message) { } }
}
namespace ReplayRecorder.API { public abstract class ReplayHeader { public abstract void Write(global::API.ByteBuffer buffer); } }
namespace ReplayRecorder.API.Attributes {
    public class ReplayData : Attribute { public ReplayData(string name, string version) { } }
    public class ReplayOnElevatorStop : Attribute { }
    public class ReplayOnExpeditionEnd : Attribute { }
    public class ReplayInit : Attribute { }
}
namespace ReplayRecorder {
    public static class Replay {
        public static global::API.ByteBuffer Header = new();
        public static void Trigger(API.ReplayHeader header) { Header = new(); header.Write(Header); }
    }
}
