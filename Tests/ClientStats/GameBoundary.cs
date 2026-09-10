namespace HarmonyLib {
    [AttributeUsage(AttributeTargets.Class)] public class HarmonyPatch : Attribute { public HarmonyPatch(Type type, string method, params Type[] arguments) { } }
    public class HarmonyPrefix : Attribute { }
    public class HarmonyPostfix : Attribute { }
}
public enum eResourceContainerSpawnType { AmmoWeapon, AmmoTool, Health, Disinfection, Other }
namespace Gear {
    public class PlayerAgent { public int GlobalID; public bool IsLocallyOwned; }
    public class ResourcePackFirstPerson {
        public PlayerAgent? Owner;
        public eResourceContainerSpawnType m_packType;
        public float ammo;
        public void ApplyPack() { }
        public (float ammo, int unused) GetCustomData() => (ammo, 0);
    }
}
namespace Vanilla.Player { public class rPlayer { } }
namespace Enemies {
    public enum EB_States { Alive, Dead }
    public class EnemyAgent { public int GlobalID; }
    public class EnemyAI { public EnemyAgent m_enemyAgent = new(); }
    public class EnemyBehaviour {
        public EB_States m_currentStateName;
        public EnemyAI m_ai = new();
        public void ChangeState(EB_States state) { }
    }
}
namespace Vanilla.Enemy {
    public class rEnemy { internal bool deathRecorded; }
    public static class EnemyReplayManager {
        public static void Despawn(Enemies.EnemyAgent enemy) => ReplayRecorder.Replay.Enemies.Remove(enemy.GlobalID);
    }
}
namespace ReplayRecorder.API {
    public class ByteBuffer { public List<byte> bytes = new(); }
    public class ReplayEvent { public virtual void Write(ByteBuffer buffer) { } }
    public class ReplayHeader : ReplayEvent { }
}
namespace ReplayRecorder.API.Attributes {
    public class ReplayData : Attribute { public ReplayData(string name, string version) { } }
    public class ReplayInit : Attribute { }
}
namespace ReplayRecorder.Core {
    public class Id : API.ReplayEvent {
        private readonly int id;
        public Id(int id) => this.id = id;
        public override void Write(API.ByteBuffer buffer) => buffer.bytes.AddRange(BitConverter.GetBytes(id));
    }
}
namespace ReplayRecorder {
    public static class Replay {
        public static bool Active, Tracked;
        public static List<API.ReplayEvent> Events = new();
        public static Dictionary<int, Vanilla.Enemy.rEnemy> Enemies = new();
        public static bool TryGet(int id, out Vanilla.Enemy.rEnemy? enemy) => Enemies.TryGetValue(id, out enemy);
        public static bool Has<T>(int id) => Tracked;
        public static void Trigger(API.ReplayEvent e) => Events.Add(e);
    }
    public static class BitHelper { public static void WriteBytes(byte value, API.ByteBuffer buffer) => buffer.bytes.Add(value); }
}
