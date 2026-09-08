using System.Reflection;
using Gear;
using ReplayRecorder;
using Vanilla.StatTracker;

// Invoke the production patches with a small game boundary stub. These tests do
// not claim to exercise the native game's ApplyPack implementation.
var prefix = typeof(rPackConsumed).GetMethod("Prefix", BindingFlags.Static | BindingFlags.NonPublic)!;
var postfix = typeof(rPackConsumed).GetMethod("Postfix", BindingFlags.Static | BindingFlags.NonPublic)!;
object? Begin(ResourcePackFirstPerson pack) {
    object?[] args = { pack, null };
    prefix.Invoke(null, args);
    return args[1];
}
void End(ResourcePackFirstPerson pack, object? state) => postfix.Invoke(null, new[] { pack, state });
void Check(bool valid, string reason) { if (!valid) throw new Exception(reason); }
var pack = new ResourcePackFirstPerson { Owner = new() { GlobalID = 7, IsLocallyOwned = true }, ammo = 40 };
Replay.Active = Replay.Tracked = true;
foreach (var kind in new[] { eResourceContainerSpawnType.AmmoWeapon, eResourceContainerSpawnType.AmmoTool, eResourceContainerSpawnType.Health, eResourceContainerSpawnType.Disinfection }) {
    pack.m_packType = kind; pack.ammo = 40;
    var state = Begin(pack);
    End(pack, state);
    Check(Replay.Events.Count == (int)kind, "unchanged contents counted as a use");
    pack.ammo = 20;
    End(pack, state);
    var bytes = new ReplayRecorder.API.ByteBuffer();
    Replay.Events[^1].Write(bytes);
    Check(BitConverter.ToInt32(bytes.bytes.ToArray()) == 7 && bytes.bytes[4] == (byte)kind, "owner/type wire payload incorrect");
}
Check(Replay.Events.Count == 4, "successful pack consumption missing");
pack.Owner!.IsLocallyOwned = false;
Check(Begin(pack) is null, "remote owner accepted");
pack.Owner.IsLocallyOwned = true;
Replay.Tracked = false;
Check(Begin(pack) is null, "untracked player accepted");
Replay.Tracked = true;
pack.m_packType = eResourceContainerSpawnType.Other;
Check(Begin(pack) is null, "unsupported resource accepted");
pack.m_packType = eResourceContainerSpawnType.Health;
foreach (var values in new[] { (0f, 0f), (20f, 40f), (20f, -1f), (float.NaN, 0f), (20f, float.NaN) }) {
    pack.ammo = values.Item1; var state = Begin(pack); pack.ammo = values.Item2; End(pack, state);
}
Check(Replay.Events.Count == 4, "invalid contents counted");
pack.ammo = 20; var finalUse = Begin(pack); pack.ammo = 0; End(pack, finalUse);
Check(Replay.Events.Count == 5, "last charge was lost");
pack.ammo = 20; var interrupted = Begin(pack); Replay.Active = false; pack.ammo = 0; End(pack, interrupted);
Check(Replay.Events.Count == 5 && Begin(pack) is null, "inactive recording accepted an event");
Console.WriteLine("PASS: production pack hooks validate ownership, consumption, final charge and exact event bytes");

var deathPrefix = typeof(rEnemyDeath).GetMethod("Prefix", BindingFlags.Static | BindingFlags.NonPublic)!;
var deathPostfix = typeof(rEnemyDeath).GetMethod("Postfix", BindingFlags.Static | BindingFlags.NonPublic)!;
var behaviour = new Enemies.EnemyBehaviour();
behaviour.m_ai.m_enemyAgent.GlobalID = 90;
object? BeginDeath() {
    object?[] args = { behaviour, Enemies.EB_States.Dead, null };
    deathPrefix.Invoke(null, args);
    return args[2];
}
void EndDeath(object? state) => deathPostfix.Invoke(null, new[] { behaviour, state });
Replay.Active = true;
Replay.Events.Clear();
Replay.Enemies[90] = new();
var rejected = BeginDeath(); EndDeath(rejected);
Check(Replay.Events.Count == 0, "rejected state change counted as death");
var dying = BeginDeath();
Replay.Enemies.Remove(90); // Native death handling may despawn before the postfix.
behaviour.m_currentStateName = Enemies.EB_States.Dead;
EndDeath(dying); EndDeath(dying); EndDeath(BeginDeath());
Check(Replay.Events.Count == 1, "death was missed or duplicated after despawn");
var deathBytes = new ReplayRecorder.API.ByteBuffer(); Replay.Events[0].Write(deathBytes);
Check(deathBytes.bytes.Count == 4 && BitConverter.ToInt32(deathBytes.bytes.ToArray()) == 90, "death wire payload incorrect");
behaviour.m_currentStateName = Enemies.EB_States.Alive;
Replay.Enemies[90] = new();
var respawned = BeginDeath(); behaviour.m_currentStateName = Enemies.EB_States.Dead; EndDeath(respawned);
Check(Replay.Events.Count == 2 && !Replay.Enemies.ContainsKey(90), "reused enemy ID lost its new death or stayed tracked");
behaviour.m_currentStateName = Enemies.EB_States.Alive;
Replay.Enemies[90] = new();
Vanilla.Enemy.EnemyReplayManager.Despawn(behaviour.m_ai.m_enemyAgent);
EndDeath(BeginDeath());
Check(Replay.Events.Count == 2, "ordinary despawn counted as death");
Console.WriteLine("PASS: production death hooks reject failed transitions, deduplicate, survive native despawn and support ID reuse");
