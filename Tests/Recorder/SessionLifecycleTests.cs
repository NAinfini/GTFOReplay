using ReplayRecorder;
using ReplayRecorder.API;
using ReplayRecorder.Snapshot;

internal static class SessionLifecycleTests {
    private sealed class Enemy : ReplayDynamic { }
    private sealed class Unknown : ReplayDynamic { }

    public static void Run() {
        var enemy = new Enemy();
        void Check(bool condition) {
            if (!condition) throw new Exception("Recording session lifecycle regression.");
        }
        void CheckInactive() {
            Check(!Replay.Trigger(new ReplayEvent()));
            Check(!Replay.Has(enemy) && !Replay.Has<Enemy>(1));
            Check(!Replay.TryGet<Enemy>(1, out var found) && found == null);
            Check(!Replay.TryDespawn<Enemy>(1));
        }

        SnapshotManager.instance = null;
        CheckInactive();
        var first = SnapshotManager.instance = new SnapshotInstance(enemy);
        Check(Replay.Active && !Replay.Ready); // Headers are still being captured.
        Check(Replay.Trigger(new ReplayEvent()) && first.Events == 1);
        Check(Replay.Has(enemy) && Replay.TryGet<Enemy>(1, out var found) && found == enemy);
        try { Replay.Has<Unknown>(1); throw new Exception("Unknown active type was hidden."); }
        catch (KeyNotFoundException) { }
        first.Active = false; // Closing or failed, before the manager clears the reference.
        CheckInactive();
        Check(first.Events == 1 && first.Tracked == enemy);
        SnapshotManager.instance = null; // Unity's late destruction/combat callbacks.
        CheckInactive();
        try { Replay.Get<Enemy>(1); throw new Exception("Strict access lost its error."); }
        catch (InvalidOperationException) { }
        var next = SnapshotManager.instance = new SnapshotInstance(new Enemy());
        Check(Replay.TryGet<Enemy>(1, out found) && found != enemy);
        Check(Replay.TryDespawn<Enemy>(1) && !Replay.TryDespawn<Enemy>(1));
        Check(first.Tracked == enemy && next.Tracked == null);
        SnapshotManager.instance = null;
        Console.WriteLine("PASS: production session API rejects late callbacks, preserves active errors, and isolates the next expedition");
    }
}

// Runtime doubles isolate the public production API from the IL2CPP game host.
namespace Il2CppInterop.Runtime.Attributes {
    [AttributeUsage(AttributeTargets.Method)]
    internal sealed class HideFromIl2CppAttribute : Attribute { }
}
namespace ReplayRecorder.API {
    public class ReplayEvent { }
    public class ReplayHeader { }
    public class ReplayDynamic { }
}
namespace ReplayRecorder.Snapshot {
    internal static class SnapshotManager {
        internal static SnapshotInstance? instance;
        internal static bool Active => instance?.Active == true;
        internal static bool Ready => instance?.Ready == true;
        internal static SnapshotInstance GetInstance() => instance ?? throw new InvalidOperationException("No recording session.");
    }
    internal sealed class SnapshotInstance {
        private readonly Type registered;
        internal ReplayDynamic? Tracked;
        internal bool Active = true;
        internal bool Ready => false;
        internal float tickRate => 10;
        internal int Events;
        internal SnapshotInstance(ReplayDynamic tracked) { Tracked = tracked; registered = tracked.GetType(); }
        internal bool Trigger(ReplayEvent e) { Events++; return true; }
        internal void Trigger(ReplayHeader header) { }
        internal bool Has(ReplayDynamic dynamic) => Has(dynamic.GetType(), 1) && Tracked == dynamic;
        internal bool Has(Type type, int id) {
            if (type != registered) throw new KeyNotFoundException("Unregistered dynamic type.");
            return id == 1 && Tracked != null;
        }
        internal ReplayDynamic Get(Type type, int id) => Has(type, id) ? Tracked! : throw new KeyNotFoundException();
        internal void Despawn(ReplayDynamic dynamic, bool errorOnNotFound = true) { Tracked = null; }
        internal void Spawn(ReplayDynamic dynamic, bool errorOnDuplicate) { Tracked = dynamic; }
        internal void Clear(Type type) { Tracked = null; }
        internal void Configure<T>(int tickRate, int max) where T : ReplayDynamic { }
    }
}
