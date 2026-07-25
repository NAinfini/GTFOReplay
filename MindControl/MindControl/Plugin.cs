using API;
using BepInEx;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;
using Il2CppInterop.Runtime.Injection;
using Player;
using ReplayRecorder;
using ReplayRecorder.Net;
using SNetwork;
using UnityEngine;

namespace MindControl.BepInEx;

[BepInPlugin(Module.GUID, Module.Name, Module.Version)]
[BepInDependency(ReplayRecorder.BepInEx.Module.GUID, BepInDependency.DependencyFlags.HardDependency)]
public class Plugin : BasePlugin {
    public override void Load() {
        APILogger.Log("Plugin is loaded!");
        harmony = new Harmony(Module.GUID);
        harmony.PatchAll();

        ClassInjector.RegisterTypeInIl2Cpp<EnemyController>();

        APILogger.Log("Debug is " + (ConfigManager.Debug ? "Enabled" : "Disabled"));

        VNet.Register("MindControl", OnMindControlCommand);
    }

    enum CommandType {
        MindControlPosition,      // send location to move enemy
        MindControlClear,         // clear commands on enemy
        MindControlAttack,        // enemy attack a given target 
        MindControlAttackPosition // send location to move enemy, enemy attacks players in range
    }

    private static void OnMindControlCommand(ulong from, ArraySegment<byte> buffer) {
        int index = 0;
        CommandType type = (CommandType)BitHelper.ReadUShort(buffer, ref index);
        APILogger.Debug($"Received command of type '{type}'.");
        switch (type) {
        case CommandType.MindControlClear: {
            if (!SNet.IsMaster) return;

            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        controller.ClearCommands();
                    }
                }
            });
            break;
        }
        case CommandType.MindControlPosition: {
            if (!SNet.IsMaster) return;

            Vector3 pos = BitHelper.ReadHalfVector3(buffer, ref index);
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        controller.ClearCommands();
                        controller.AddPosition(pos);
                    }
                }
            });
            break;
        }
        case CommandType.MindControlAttackPosition: {
            if (!SNet.IsMaster) return;

            Vector3 pos = BitHelper.ReadHalfVector3(buffer, ref index);
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        controller.ClearCommands();
                        controller.AddAttackPosition(pos);
                    }
                }
            });
            break;
        }
        case CommandType.MindControlAttack: {
            if (!SNet.IsMaster) return;

            byte slot = BitHelper.ReadByte(buffer, ref index);
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                if (slot < SNet.Slots.PlayerSlots.Length) {
                    // TODO(randomuserhi): Check support for 8-player mod
                    PlayerAgent? player = SNet.Slots.PlayerSlots[slot].player.m_playerAgent.TryCast<PlayerAgent>();
                    if (player != null) {
                        for (int i = 0; i < numEnemies; ++i) {
                            ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                            if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                                controller.ClearCommands();
                                controller.AddTarget(player);
                            }
                        }
                    }
                }
            });
            break;
        }
        default: {
            APILogger.Error($"No command defined for message of type '{type}'");
            break;
        }
        }
    }

    private static Harmony? harmony;
}