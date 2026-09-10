// Native boundary substitutes for executing the production container capture code.
using System.Reflection;

namespace UnityEngine {
    public record struct Vector3(float x, float y, float z);
    public record struct Quaternion(float x, float y, float z, float w);
    public class Object {
        private static int nextId;
        private readonly int id = ++nextId;
        public bool Destroyed;
        public int GetInstanceID() => id;
        public T Cast<T>() => (T)(object)this;
        public static bool operator ==(Object? left, Object? right) =>
            (ReferenceEquals(left, null) || left.Destroyed) ? ReferenceEquals(right, null) || right.Destroyed : ReferenceEquals(left, right);
        public static bool operator !=(Object? left, Object? right) => !(left == right);
        public override bool Equals(object? other) => ReferenceEquals(this, other);
        public override int GetHashCode() => id;
    }
    public class Transform { public Vector3 position, lossyScale; public Quaternion rotation; }
    public class GameObject : Object {
        public string name = "BoxWeakLock";
        public T? GetComponentInChildren<T>() where T : class => null;
    }
    public class Component : Object {
        private readonly Transform placement = new();
        private readonly GameObject owner = new();
        public Transform transform => Destroyed ? throw new NullReferenceException("Destroyed native component") : placement;
        public GameObject gameObject => Destroyed ? throw new NullReferenceException("Destroyed native component") : owner;
    }
    public static class Random { public struct State { } public static State state; public static float value; public static void InitState(int seed) { } }
}
namespace LevelGeneration {
    public enum eWeakLockType { None, Melee, Hackable }
    public enum eWeakLockStatus { Unlocked, LockedMelee, LockedHackable }
    public enum eResourceContainerStatus { Closed, Open }
    public enum LG_LayerType { Main }
    public enum ExpeditionFunction { ResourceContainerWeak }
    public class iLG_ResourceContainer_Core : UnityEngine.Component { }
    public class LG_WeakLock : UnityEngine.Component { public eWeakLockStatus Status; }
    public class LG_WeakResourceContainer : iLG_ResourceContainer_Core {
        public int m_serialNumber;
        public LG_WeakLock? m_weakLock;
        public LG_ResourceContainer_Sync m_sync = new();
        public LG_ResourceContainer_Storage m_storage = null!;
    }
    public class LG_ResourceContainer_Storage : UnityEngine.Component {
        public iLG_ResourceContainer_Core m_core = null!;
        public void Setup() { }
    }
    public class ContainerState { public eResourceContainerStatus status; }
    public class Replicator { public ContainerState State = new(); }
    public class LG_ResourceContainer_Sync : UnityEngine.Component { public Replicator m_stateReplicator = new(); }
    public class LG_ResourceContainerBuilder {
        public ExpeditionFunction m_function;
        public float m_lockRandom;
        public int m_randomSeed;
        public AIGraph.AIG_CourseNode m_node = new();
        public void SetupFunctionGO() { }
    }
    public class BuilderWeightedRandom { public void Setup(float[] weights) { } public int GetRandomIndex(float value) => 0; }
}
namespace AIGraph {
    public class Dimension { public int DimensionIndex; }
    public class ZoneData { public uint ConsumableDistributionInZone; }
    public class Settings { public ZoneData m_zoneData = new(); }
    public class Zone { public Settings m_settings = new(); }
    public class AIG_CourseNode {
        public Dimension m_dimension = new(); public Zone m_zone = new();
        public void RegisterContainer() { } public void UnregisterContainer() { }
    }
}
namespace GameData {
    public class GameDataInit { public void Initialize() { } }
    public class BlockCollection { public List<object> Blocks = new(); }
    public static class ArtifactDataBlock { public static BlockCollection Wrapper = new(); }
    public class SpawnData { public float Weight; public uint ItemID; }
    public class ConsumableDistributionDataBlock { public List<SpawnData> SpawnData = new(); }
    public class GameDataBlockBase<T> where T : new() { public static T GetBlock(uint id) => new(); }
}
namespace HarmonyLib {
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class HarmonyPatch : Attribute { public HarmonyPatch() { } public HarmonyPatch(Type type, string name) { } }
    public class HarmonyPostfix : Attribute { }
    public class HarmonyMethod { public HarmonyMethod(MethodInfo? method) { } }
    public class Harmony { public void Patch(MethodInfo method, HarmonyMethod postfix) { } }
}
namespace API {
    public class ByteBuffer { public List<object> Values = new(); }
    public static class BitHelper {
        public static void WriteBytes<T>(T value, ByteBuffer buffer) where T : notnull => buffer.Values.Add(value);
        public static void WriteHalf(UnityEngine.Quaternion value, ByteBuffer buffer) => buffer.Values.Add(value);
    }
    public static class APILogger { public static void Error(string message) { } public static void Warn(string message) { } }
    public static class Utils { public const BindingFlags AnyBindingFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static; }
}
namespace ReplayRecorder.API {
    public record Identifier(uint Value) { public static Identifier unknown = new(0); public static Identifier Item(uint id) => new(id); }
    public abstract class ReplayHeader { public abstract void Write(global::API.ByteBuffer buffer); }
    public abstract class ReplayDynamic {
        public readonly int id;
        protected ReplayDynamic(int id) { this.id = id; }
        public abstract bool Active { get; }
        public abstract bool IsDirty { get; }
        public abstract void Write(global::API.ByteBuffer buffer);
        public abstract void Spawn(global::API.ByteBuffer buffer);
    }
}
namespace ReplayRecorder.API.Attributes {
    public class ReplayData : Attribute { public ReplayData(string name, string version) { } }
    public class ReplayOnElevatorStop : Attribute { }
    public class ReplayInit : Attribute { }
}
namespace ReplayRecorder {
    public static class Replay {
        public static global::API.ByteBuffer? Header;
        public static List<int> Spawned = new();
        public static void Trigger(API.ReplayHeader header) { Header = new(); header.Write(Header); }
        public static void Spawn(API.ReplayDynamic value) { value.Spawn(new()); Spawned.Add(value.id); }
    }
}
namespace Vanilla.Metadata { public static class rMetadata { public static bool NoArtifact_Compatibility; } }
namespace Vanilla.BepInEx { public static class Plugin { public static HarmonyLib.Harmony harmony = new(); } }
