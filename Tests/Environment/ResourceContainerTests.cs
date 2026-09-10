using System.Reflection;
using API;
using LevelGeneration;
using ReplayRecorder;
using UnityEngine;
using Vanilla.StaticItems;

internal static class ResourceContainerTests {
    public static void Run() {
        var core = new LG_WeakResourceContainer();
        var storage = new LG_ResourceContainer_Storage { m_core = core };
        storage.transform.position = new Vector3(4, 5, 6);
        storage.transform.rotation = new Quaternion(0, 1, 0, 0);
        storage.transform.lossyScale = new Vector3(-2, 3, 4);
        core.gameObject.name = "ModdedLocker(Clone)";
        var container = new rContainer(storage, true, 2) { registered = false };
        core.m_serialNumber = 731;
        core.m_weakLock = new LG_WeakLock { Status = eWeakLockStatus.LockedHackable };
        core.m_weakLock.transform.position = new Vector3(9, 8, 7);
        core.m_weakLock.transform.lossyScale = new Vector3(2, 2, 2);

        storage.Destroyed = true;
        try { _ = storage.transform; throw new Exception("Expected destroyed Storage to reject transform access."); }
        catch (NullReferenceException) { }

        var discardedCore = new LG_WeakResourceContainer();
        var discarded = new rContainer(new LG_ResourceContainer_Storage { m_core = discardedCore }, false, 0);
        discardedCore.Destroyed = true;
        var discardedSyncCore = new LG_WeakResourceContainer();
        var discardedSync = new rContainer(new LG_ResourceContainer_Storage { m_core = discardedSyncCore }, false, 0);
        discardedSyncCore.m_sync.Destroyed = true;
        rContainers.containers.Clear();
        foreach (var item in new[] { container, discarded, discardedSync }) rContainers.containers.Add(item.id, item);
        Replay.Spawned.Clear();
        typeof(rContainers).GetMethod("Trigger", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, null);

        var fields = Replay.Header!.Values;
        Equal((ushort)1, fields[0]);
        Equal(container.id, fields[1]);
        Equal((byte)2, fields[2]);
        Equal(new Vector3(4, 5, 6), fields[3]);
        Equal(new Quaternion(0, 1, 0, 0), fields[4]);
        Equal((ushort)731, fields[5]);
        Equal(true, fields[6]);
        Equal(false, fields[8]);
        Equal(new Vector3(-2, 3, 4), fields[10]);
        Equal(true, fields[11]);
        Equal(new Vector3(9, 8, 7), fields[12]);
        Equal(new Vector3(2, 2, 2), fields[14]);
        Equal("ModdedLocker(Clone)", fields[15]);
        Equal(16, fields.Count);
        Equal(1, Replay.Spawned.Count);
        Equal(container.id, Replay.Spawned[0]);
        Equal(0, rContainers.containers.Count);

        core.m_sync.m_stateReplicator.State.status = eResourceContainerStatus.Open;
        core.m_weakLock.Destroyed = true;
        var state = new ByteBuffer();
        container.Write(state);
        Equal(false, state.Values[0]);
        Equal((byte)0, state.Values[1]);
        var withoutLock = new ByteBuffer();
        new rContainers(new[] { container }).Write(withoutLock);
        Equal(false, withoutLock.Values[11]);
        Equal("ModdedLocker(Clone)", withoutLock.Values[12]);

        core.Destroyed = true;
        rContainers.containers.Add(container.id, container);
        Replay.Spawned.Clear();
        typeof(rContainers).GetMethod("Trigger", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, null);
        Equal((ushort)0, Replay.Header!.Values[0]);
        Equal(1, Replay.Header.Values.Count);
        Equal(0, Replay.Spawned.Count);
        Console.WriteLine("PASS: destroyed storage, discarded cores/syncs, signed placement, late identity, lock removal and aligned header/spawn membership.");
    }

    private static void Equal(object expected, object actual) {
        if (!Equals(expected, actual)) throw new Exception($"Expected {expected}; got {actual}.");
    }
}
