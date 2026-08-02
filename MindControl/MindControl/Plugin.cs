using Agents;
using AIGraph;
using API;
using BepInEx;
using BepInEx.Unity.IL2CPP;
using Enemies;
using HarmonyLib;
using Il2CppInterop.Runtime.Injection;
using LevelGeneration;
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

        // TODO(randomuserhi): We can't use this patch due to compatibility with EnemyAnimationFix
        // NativePatches.ChangeStatePatches.ApplyNativePatch();

        APILogger.Log("Debug is " + (ConfigManager.Debug ? "Enabled" : "Disabled"));

        VNet.Register("MindControl", OnMindControlCommand);
        VNet.Register("MindControl.SpawnEnemy", OnMindControlSpawnCommand);
    }

    private static AIG_CourseNode? GetNode(Vector3 position) {
        if (AIG_GeomorphNodeVolume.TryGetNode(0, Dimension.GetDimensionFromPos(position).DimensionIndex, position, out var node2) && AIG_NodeCluster.TryGetNodeCluster(node2.ClusterID, out var nodeCluster)) {
            if (nodeCluster.CourseNode == null) {
                return null;
            }
            return nodeCluster.CourseNode;
        }
        return null;
    }

    private static void OnMindControlSpawnCommand(ulong from, ArraySegment<byte> buffer) {
        if (!SNet.IsMaster) return;

        int index = 0;
        Vector3 pos = BitHelper.ReadHalfVector3(buffer, ref index);
        Quaternion rot = Quaternion.identity;
        uint id = BitHelper.ReadUInt(buffer, ref index);

        MainThread.Run(() => {
            var node = GetNode(pos);
            if (node == null) node = PlayerManager.GetLocalPlayerAgent().CourseNode;

            var enemy = EnemyAllocator.Current.SpawnEnemy(id, node, AgentMode.Hibernate, pos, rot);
        });
    }

    enum CommandType {
        MindControlPosition,       // send location to move enemy
        MindControlClear,          // clear commands on enemy
        MindControlAttack,         // enemy attack a given target 
        MindControlAttackPosition, // send location to move enemy, enemy attacks players in range
        MindControlKill,           // kill enemies
    }

    private static void OnMindControlCommand(ulong from, ArraySegment<byte> buffer) {
        if (!SNet.IsMaster) return;

        int index = 0;
        CommandType type = (CommandType)BitHelper.ReadUShort(buffer, ref index);
        APILogger.Debug($"Received command of type '{type}'.");
        switch (type) {
        case CommandType.MindControlClear: {
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        if (controller.commandBuffer.Count > 0) {
                            controller.ClearCommands();
                        }
                    }
                }
            });
            break;
        }
        case CommandType.MindControlPosition: {
            Vector3 pos = BitHelper.ReadHalfVector3(buffer, ref index);
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        if (controller.commandBuffer.Count > 0) {
                            switch (controller.commandBuffer.Peek().type) {
                            case EnemyController.Command.Type.MoveAttack:
                            case EnemyController.Command.Type.Move:
                                // Don't reset state and just clear buffer to prevent stutter
                                controller.commandBuffer.Clear();
                                break;
                            default:
                                controller.ClearCommands();
                                break;
                            }
                        }
                        controller.AddPosition(pos);
                    }
                }
            });
            break;
        }
        case CommandType.MindControlAttackPosition: {
            Vector3 pos = BitHelper.ReadHalfVector3(buffer, ref index);
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        if (controller.commandBuffer.Count > 0) {
                            switch (controller.commandBuffer.Peek().type) {
                            case EnemyController.Command.Type.MoveAttack:
                            case EnemyController.Command.Type.Move:
                                // Don't reset state and just clear buffer to prevent stutter
                                controller.commandBuffer.Clear();
                                break;
                            default:
                                controller.ClearCommands();
                                break;
                            }
                        }
                        controller.AddAttackPosition(pos);
                    }
                }
            });
            break;
        }
        case CommandType.MindControlAttack: {
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
                                if (controller.commandBuffer.Count > 0) {
                                    switch (controller.commandBuffer.Peek().type) {
                                    case EnemyController.Command.Type.Attack:
                                        // Don't reset state and just clear buffer to prevent stutter
                                        controller.commandBuffer.Clear();
                                        break;
                                    default:
                                        controller.ClearCommands();
                                        break;
                                    }
                                }
                                controller.AddTarget(player);
                            }
                        }
                    }
                }
            });
            break;
        }
        case CommandType.MindControlKill: {
            int numEnemies = BitHelper.ReadInt(buffer, ref index);
            APILogger.Debug($"Num Enemies '{numEnemies}'.");
            MainThread.Run(() => {
                for (int i = 0; i < numEnemies; ++i) {
                    ushort selectedEnemy = BitHelper.ReadUShort(buffer, ref index);
                    if (EnemyController.controllers.TryGetValue(selectedEnemy, out var controller)) {
                        controller.Suicide();
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