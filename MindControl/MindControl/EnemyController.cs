using Agents;
using AIGraph;
using API;
using Enemies;
using HarmonyLib;
using LevelGeneration;
using Player;
using SNetwork;
using StateMachines;
using UnityEngine;
using UnityEngine.AI;

namespace MindControl {
    [HarmonyPatch]
    public class EnemyController : MonoBehaviour {
        [HarmonyPatch]
        internal static class Patches {
            public static bool DontRecurse = false;

            [HarmonyPatch(typeof(EnemySync), nameof(EnemySync.OnSpawn))]
            [HarmonyPostfix]
            private static void Postfix_OnSpawn(EnemySync __instance, pEnemySpawnData spawnData) {
                if (!SNet.IsMaster) return;

                // Dont allow control of snatcher / fliers
                //
                // snatchers can't spit out players after control
                // fliers just cant be controlled with current logic

                EnemyAgent agent = __instance.m_agent;

                // No controlling pouncers - they are broken
                if (agent.GetComponent<PouncerBehaviour>() != null) return;

                // Flyers are broken
                if (agent.EnemyBehaviorData.IsFlyer) return;

                EnemyController controller = agent.gameObject.AddComponent<EnemyController>();
                controller.AssignAgent(agent);
            }

            // Update controllers matching the update rate of behaviour states.
            //
            // This is because updating navmesh targets needs to be ran at a slower rate
            // otherwise enemies get stuck.
            // 
            // In game, the update rate is 5 times per second, controlled by EnemyBehaviour.m_updatebehaviour.
            [HarmonyPatch(typeof(EnemyBehaviour), nameof(EnemyBehaviour.UpdateState))]
            [HarmonyPrefix]
            private static void Prefix_UpdateState(EnemyBehaviour __instance) {
                if (DontRecurse) return;
                if (__instance.m_updatebehaviour >= Clock.Time || !controllers.TryGetValue(__instance.m_ai.m_enemyAgent.GlobalID, out var controller)) return;

                controller.UpdateBehaviour();
            }

            [HarmonyPatch(typeof(EB_InCombat_MoveToPoint), nameof(EB_InCombat_MoveToPoint.UpdateBehaviour))]
            [HarmonyPrefix]
            private static bool Prefix_UpdateBehaviour(EB_InCombat_MoveToPoint __instance) {
                if (!SNet.IsMaster) return true;
                EnemyAI ai = __instance.m_ai;
                if (!controllers.TryGetValue(ai.m_enemyAgent.GlobalID, out var controller) || !controller.IsControlled) return true;

                switch (controller.commandBuffer.Peek().type) {
                case Command.Type.Attack:
                    return true;
                default:
                    return false;
                }
            }

            private static bool patch = true;
            [HarmonyPatch(typeof(EnemyCourseNavigation), nameof(EnemyCourseNavigation.UpdateTracking))]
            [HarmonyPostfix]
            [HarmonyPriority(Priority.Last)]
            private static void UpdateTracking(EnemyCourseNavigation __instance) {
                if (!patch) return;
                if (!SNet.IsMaster) return;
                EnemyAI ai = __instance.m_owner.AI;
                if (!controllers.TryGetValue(ai.m_enemyAgent.GlobalID, out var controller) || !controller.IsControlled) return;

                Command command = controller.commandBuffer.Peek();
                if (command.type == Command.Type.Attack && command.target != null) {
                    patch = false;
                    ai.SetTarget(command.target);
                    patch = true;
                } else if (command.type == Command.Type.MoveAttack && controller.currentTarget != null) {
                    patch = false;
                    ai.SetTarget(controller.currentTarget);
                    patch = true;
                }
            }

            [HarmonyPatch(typeof(EB_InCombat), nameof(EB_InCombat.TryAttacks))]
            [HarmonyPrefix]
            private static bool Prefix_TryAttacks(EB_InCombat __instance, ref bool __result) {
                if (!SNet.IsMaster) return true;
                EnemyAI ai = __instance.m_ai;
                if (!controllers.TryGetValue(ai.m_enemyAgent.GlobalID, out var controller) || !controller.IsControlled) return true;

                switch (controller.commandBuffer.Peek().type) {
                case Command.Type.Attack:
                case Command.Type.MoveAttack:
                    return true;
                default:
                    // Disable attacks for other commands
                    __result = false;
                    return false;
                }
            }
            [HarmonyPatch(typeof(EB_InCombat), nameof(EB_InCombat.TryStrafe))]
            [HarmonyPrefix]
            private static bool Prefix_TryStrafe(EB_InCombat __instance, ref bool __result) {
                if (!SNet.IsMaster) return true;
                EnemyAI ai = __instance.m_ai;
                if (!controllers.TryGetValue(ai.m_enemyAgent.GlobalID, out var controller) || !controller.IsControlled) return true;

                if (controller.commandBuffer.Peek().type == Command.Type.Attack) {
                    if ((ai.Abilities.HasAbility(AgentAbility.Melee) && !ai.Abilities.IsAbilityReady(AgentAbility.Melee)) ||
                        (ai.Abilities.HasAbility(AgentAbility.Ranged) && !ai.Abilities.IsAbilityReady(AgentAbility.Ranged))) {
                        // Allow strafing if abilities are on cooldown
                        return true;
                    }
                    // No strafing if abilities are not on cooldown
                    __result = false;
                    return false;
                } else {
                    // Disable strafing completely for other commands
                    __result = false;
                    return false;
                }
            }
            [HarmonyPatch(typeof(EB_InCombat), nameof(EB_InCombat.TryScream))]
            [HarmonyPrefix]
            private static bool Prefix_TryScream(EB_InCombat __instance, ref bool __result) {
                if (!SNet.IsMaster) return true;
                EnemyAI ai = __instance.m_ai;
                if (!controllers.TryGetValue(ai.m_enemyAgent.GlobalID, out var controller) || !controller.IsControlled) return true;

                // Do not allow screams if under control
                __result = false;
                return false;
            }

            /*[HarmonyPatch(typeof(EB_InCombatFlyer), nameof(EB_InCombatFlyer.TryAttacks))]
            [HarmonyPrefix]
            private static bool Prefix_FlyerTryAttacks(EB_InCombat __instance, ref bool __result) {
                return InCombatPatch(__instance.m_ai, ref __result);
            }*/

            // Prevent switching EB State for bad pathing (Used over the native patch due to mod compatability)
            [HarmonyPatch(typeof(EB_InCombat), nameof(EB_InCombat.TryUpdateNavigation))]
            [HarmonyPrefix]
            private static bool Prefix_TryUpdateNavigation(EB_InCombat __instance, out bool __result, EnemyCourseNavigationMode currentExpectedMode) {
                __result = false;
                if (!controllers.TryGetValue(__instance.m_ai.m_enemyAgent.GlobalID, out var controller) || !controller.IsControlled) {
                    return true;
                }
                return false;
            }
        }

        // List of all controllers, mapped by globalid.
        public static Dictionary<int, EnemyController> controllers = new Dictionary<int, EnemyController>();

        private int globalId;

#pragma warning disable CS8618 
        private EnemyAgent agent;
        private EnemyAI ai;
        private EnemyLocomotion locomotion;
        private EnemyBehaviour behaviour;
        private EnemyBehaviourData behaviourData;
        private EB_InCombat EBInCombat;
#pragma warning restore CS8618

        public class Command {
            public enum Type {
                Move,
                Attack,
                MoveAttack
            }

            public Type type;

            public PlayerAgent? target = null;

            public Vector3 position;

            public Command(Vector3 pos) {
                type = Type.Move;
                position = pos;
            }

            public Command(PlayerAgent target) {
                type = Type.Attack;
                this.target = target;
            }
        }

        // TODO(randomuserhi): Support other commands - right now only a buffer of movement commands
        public Queue<Command> commandBuffer = new Queue<Command>();

        // Setup controller
        public void AssignAgent(EnemyAgent agent) {
            this.agent = agent;
            globalId = this.agent.GlobalID;
            locomotion = agent.Locomotion;
            ai = agent.AI;
            behaviour = ai.m_behaviour;
            EBInCombat = behaviour.m_states[(int)EB_States.InCombat].Cast<EB_InCombat>();
            behaviourData = ai.m_behaviourData;
            controllers.Add(globalId, this);
        }

        // Destruct controller
        private void OnDestroy() {
            controllers.Remove(globalId);
        }

        // Test methods
        public void AddPosition(Vector3 pos) {
            commandBuffer.Enqueue(new Command(pos));
        }

        public void AddAttackPosition(Vector3 pos) {
            Command test = new Command(pos);
            test.type = Command.Type.MoveAttack;
            commandBuffer.Enqueue(test);
        }

        public void AddTarget(PlayerAgent target) {
            if (target.m_alive) {
                commandBuffer.Enqueue(new Command(target));
            } else {
                commandBuffer.Enqueue(new Command(target.m_position));
            }
        }

        public void ClearCommands() {
            if (commandBuffer.Count > 0) {
                commandBuffer.Clear();

                // Important or enemy may freeze waiting for advance timer
                behaviourData.m_advanceTimer = 0.0f;

                // Important or enemy might not be in the right state
                Patches.DontRecurse = true;
                behaviour.ChangeState(EB_States.InCombat);
                behaviour.m_updatebehaviour = 0;
                behaviour.UpdateState();
                Patches.DontRecurse = false;
            }
        }

        public void Suicide() {
            PlayerAgent player = PlayerManager.GetLocalPlayerAgent();
            agent.Damage.BulletDamage(100000, null, player.transform.position, player.TargetLookDir, Vector3.up, true, 0, 100, 100, 0);
        }

        // NavMesh.SamplePosition(target, out hit, float.PositiveInfinity, 1)

        // Is enemy under manual controll?
        public bool IsControlled => agent.m_alive && commandBuffer.Count > 0;

        public void UpdateBehaviour() {
            if (!IsControlled) return;

            // Perform move command
            Command command = commandBuffer.Peek();

            switch (command.type) {
            case Command.Type.MoveAttack:
            case Command.Type.Move:
                MoveCommand(command);
                break;
            case Command.Type.Attack:
                AttackCommand(command);
                break;
            }
        }

        private void AttackCommand(Command command) {
            // Set agent to aggressive
            if (ai.Mode != AgentMode.Agressive) {
                ai.Mode = AgentMode.Agressive;
                ai.ModeChange();
            }

            // Awake enemy if asleep
            EB_Hibernating? state = behaviour.m_currentState.TryCast<EB_Hibernating>();
            if (state != null) {
                locomotion.ChangeState(ES_StateEnum.PathMove);

                Patches.DontRecurse = true;
                behaviour.ChangeState(EB_States.InCombat);
                Patches.DontRecurse = false;
            }

            // Always advance towards player
            behaviourData.m_advanceTimer = 0.0f;

            if (command.target == null) return;

            // Set target
            if (ai.m_target == null || ai.m_target.m_agent == null || ai.m_target.m_agent.GlobalID != command.target.GlobalID) {
                ai.SetTarget(command.target);
            }

            // Dequeue command if they are dead
            if (!command.target.Alive) {
                commandBuffer.Dequeue();
                APILogger.Debug("Target dead!");
            }
        }

        private PlayerAgent? currentTarget = null;
        private Vector3 destination;
        private AIG_CourseNode? destinationCourseNode = null;

        private AIG_CoursePortal? targetPortal = null;
        private Vector3 towardsPortalPosition;
        private Vector3 throughPortalPosition;

        private void MoveCommand(Command command) {
            ES_StateEnum locomotionState = (ES_StateEnum)locomotion.m_currentState.ENUM_ID;

            if (command.type == Command.Type.MoveAttack) {
                if (currentTarget != null) {
                    float meleeDistSqrd = agent.EnemyBehaviorData.MeleeAttackDistance.Max;
                    float rangedDistSqrd = agent.EnemyBehaviorData.RangedAttackDistance.Max;
                    float dist = (currentTarget.m_position - agent.m_position).sqrMagnitude;
                    if ((ai.Abilities.HasAbility(AgentAbility.Melee) && dist >= meleeDistSqrd) &&
                        (ai.Abilities.HasAbility(AgentAbility.Ranged) && dist >= rangedDistSqrd)) {
                        currentTarget = null;
                    }
                }

                if (currentTarget == null) {
                    float dist = float.MaxValue;
                    foreach (PlayerAgent p in PlayerManager.PlayerAgentsInLevel) {
                        if (p.m_alive) {
                            float d = (p.m_position - agent.m_position).sqrMagnitude;
                            if (d < dist) {
                                dist = d;
                                currentTarget = p;
                            }
                        }
                    }
                }

                if (currentTarget != null && currentTarget.m_alive) {
                    ai.SetTarget(currentTarget);

                    if (EBInCombat.TryAttacks()) {
                        return;
                    }

                    // Allow attacks
                    switch (locomotionState) {
                    case ES_StateEnum.ShooterAttack:
                    case ES_StateEnum.StrikerAttack:
                    case ES_StateEnum.StrikerMelee:
                        return;
                    }
                }
            }

            // Allow hitreact and ladders
            switch (locomotionState) {
            case ES_StateEnum.Hitreact:
            case ES_StateEnum.HitReactFlyer:
            case ES_StateEnum.FloaterHitReact:
            case ES_StateEnum.ClimbLadder:
            case ES_StateEnum.Jump:
                return;
            }

            // Set agent to aggressive
            if (ai.Mode != AgentMode.Agressive) {
                ai.Mode = AgentMode.Agressive;
                ai.ModeChange();
            }

            if (ai.m_target == null || !ai.m_target.m_hasLineOfSight) {
                ai.m_enemyAgent.TargetLookDir = (destination - ai.transform.position).normalized;
            } else {
                ai.m_enemyAgent.TargetLookDir = ai.m_target.m_dir;
            }

            // Set state to move to goal
            if (locomotionState != ES_StateEnum.PathMove) {
                locomotion.ChangeState(ES_StateEnum.PathMove);
            }

            if ((EB_States)behaviour.m_currentState.ENUM_ID != EB_States.InCombat_MoveToPoint) {
                Patches.DontRecurse = true;
                behaviour.ChangeState(EB_States.InCombat_MoveToPoint);
                behaviour.m_updatebehaviour = 0;
                behaviour.UpdateState();
                Patches.DontRecurse = false;
            }

            EBInCombat.UpdateAvoidance();

            // Set pathing goal
            if (ai.m_navMeshAgent.isOnNavMesh) {
                if (NavMesh.SamplePosition(command.position, out NavMeshHit hit, 1, 1)) {
                    destination = hit.position;
                } else {
                    destination = command.position;
                }

                destinationCourseNode = GetNode(destination);

                if (destinationCourseNode != null) {
                    AIG_CourseNode source = agent.CourseNode;
                    if (source.NodeID != destinationCourseNode.NodeID && source.m_dimension.DimensionIndex == destinationCourseNode.m_dimension.DimensionIndex) {
                        // If enemy and destination are not on the same coursenode, we need to navigate through portals
                        NavData nav = GetNavData(destinationCourseNode);

                        // Find portal that leads to the shortest node distance to destination
                        // Tie break using sqr dist from true position
                        int minNodeDist = int.MaxValue;
                        float minDist = float.MaxValue;
                        AIG_CoursePortal? minPortal = null;
                        foreach (AIG_CoursePortal portal in source.m_portals) {
                            AIG_CourseNode nextNode = portal.GetOppositeNode(source);
                            int nodeDist = nav.nodeDistanceMap[nextNode.NodeID];
                            float dist = (portal.m_position - destination).sqrMagnitude;
                            if (minPortal == null || nodeDist < minNodeDist || (nodeDist == minNodeDist && dist < minDist)) {
                                minPortal = portal;
                                minNodeDist = nodeDist;
                                minDist = dist;
                            }
                        }

                        if (minPortal != null) {
                            if (targetPortal == null || (targetPortal.Pointer != minPortal.Pointer)) {
                                targetPortal = minPortal;
                                towardsPortalPosition = minPortal.RandomPositionOn_TowardsNode(source);
                                throughPortalPosition = minPortal.RandomPositionOn_TowardsNode(minPortal.GetOppositeNode(source));
                            }
                            iLG_Door_Core? door = minPortal.Gate?.SpawnedDoor;
                            if (door != null) {
                                if (door.LastStatus != eDoorStatus.Destroyed && door.LastStatus != eDoorStatus.Open && door.LastStatus != eDoorStatus.Opening) {
                                    ai.m_navMeshAgent.destination = towardsPortalPosition;

                                    // Perform door break
                                    if (EB_InCombat_MoveToNextNode_DestroyDoor.s_globalRetryTimer < Clock.Time && (agent.m_position - towardsPortalPosition).sqrMagnitude < 6.25f) {
                                        EB_InCombat_MoveToNextNode_DestroyDoor.s_globalRetryTimer = Clock.Time + UnityEngine.Random.Range(0.5f, 1f);
                                        door.AttemptDamage(eDoorDamageType.EnemyLight, agent.m_position, agent);
                                    }

                                    goto skip;
                                } else if (minNodeDist > 0) {
                                    ai.m_navMeshAgent.destination = throughPortalPosition;
                                    goto skip;
                                }
                            }
                        }
                    } else {
                        targetPortal = null;
                    }
                }

                ai.m_navMeshAgent.destination = command.position;
            skip:;
            }

            // TODO(randomuserhi)
            // Dequeue move action if close enough
            /*if (state != null && (agent.transform.position - target.destination).sqrMagnitude < 4) {
                commandBuffer.Dequeue();
                APILogger.Debug("Destination reached!");
            }*/
        }

        private AIG_CourseNode? GetNode(Vector3 position) {
            if (AIG_GeomorphNodeVolume.TryGetNode(0, Dimension.GetDimensionFromPos(position).DimensionIndex, position, out var node2) && AIG_NodeCluster.TryGetNodeCluster(node2.ClusterID, out var nodeCluster)) {
                if (nodeCluster.CourseNode == null) {
                    return null;
                }
                return nodeCluster.CourseNode;
            }
            return null;
        }

        private class NavData {
            // Uses AIG_CourseNode.NodeID as keys
            public Dictionary<int, int> nodeDistanceMap = new Dictionary<int, int>();
        }

        // Uses AIG_CourseNode.NodeID as keys
        private static Dictionary<int, NavData> navDataMap = new Dictionary<int, NavData>();
        private NavData GetNavData(AIG_CourseNode destination) {
            if (!navDataMap.ContainsKey(destination.NodeID)) {
                NavData navData = new NavData();

                // BFS to compute node distance maps
                AIG_SearchID.IncrementSearchID();
                ushort searchID = AIG_SearchID.SearchID;
                Queue<(AIG_CourseNode, int)> queue = new Queue<(AIG_CourseNode, int)>();
                queue.Enqueue((destination, 0));
                destination.m_searchID = searchID;

                while (queue.Count > 0) {
                    var (current, dist) = queue.Dequeue();
                    foreach (AIG_CoursePortal portal in current.m_portals) {
                        AIG_CourseNode nextNode = portal.GetOppositeNode(current);
                        if (nextNode.m_searchID == searchID) continue;
                        nextNode.m_searchID = searchID;
                        queue.Enqueue((nextNode, dist + 1));
                    }

                    navData.nodeDistanceMap.Add(current.NodeID, dist);
                }

                navDataMap.Add(destination.NodeID, navData);
            }
            return navDataMap[destination.NodeID];
        }

        public static bool ChangeStatePrefix(StateMachine<EB_StateBase> __instance, EB_StateBase newState) {
            EnemyController? controller = __instance.GetComponent<EnemyController>();
            if (controller == null || !controller.IsControlled) return true;

            // Perform move command
            Command command = controller.commandBuffer.Peek();
            EB_States state = (EB_States)newState.ENUM_ID;

            switch (command.type) {
            case Command.Type.MoveAttack:
            case Command.Type.Move:
                if (state == EB_States.InCombat_MoveToNextNode || state == EB_States.InCombat_MoveToTarget) return false;
                break;
            case Command.Type.Attack:
                break;
            }

            return true;
        }


        [ReplayRecorder.API.Attributes.ReplayInit]
        private static void Init() {
            APILogger.Debug("Clear old nav data.");
            navDataMap.Clear();
        }
    }
}
