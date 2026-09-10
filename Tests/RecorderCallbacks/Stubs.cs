// Only native host boundaries are doubled; callback logic is the production source.
namespace HarmonyLib {
 [AttributeUsage(AttributeTargets.Class|AttributeTargets.Method,AllowMultiple=true)] public class HarmonyPatch:Attribute { public HarmonyPatch(){} public HarmonyPatch(Type t,string n){} }
 public class HarmonyPrefix:Attribute{} public class HarmonyPostfix:Attribute{} public class HarmonyFinalizer:Attribute{} public class HarmonyWrapSafe:Attribute{}
}
namespace API { public static class APILogger { public static void Debug(string s){} public static void Error(string s)=>throw new Exception(s); } }
namespace UnityEngine {
 public class Component { public MineDeployerInstance? Mine; public T GetComponent<T>() where T:class=>Mine as T ?? throw new Exception("Missing mine"); public T Cast<T>() where T:class=>(this as T)!; public T? TryCast<T>() where T:class=>this as T; public Transform transform=new(); public int GetInstanceID()=>17; }
 public struct Vector3 {public float x,y,z;} public struct Quaternion {public static Quaternion LookRotation(Vector3 v)=>new();} public class Transform {public Vector3 position,forward,localScale;public Quaternion rotation;}
 public static class Mathf {public static int RoundToInt(float f)=>(int)f;}
}
namespace ReplayRecorder.API { public interface IReplayTransform {bool active{get;} byte dimensionIndex{get;} UnityEngine.Vector3 position{get;} UnityEngine.Quaternion rotation{get;}} public class ByteBuffer{} }
namespace ReplayRecorder.API.Attributes { public class ReplayData:Attribute {public ReplayData(string n,string v){}} }
namespace ReplayRecorder.Core {
 public class Id {public int id;public Id(int id){this.id=id;}public virtual void Write(ReplayRecorder.API.ByteBuffer b){} }
 public class DynamicTransform:Id {public ReplayRecorder.API.IReplayTransform transform;public DynamicTransform(int id,ReplayRecorder.API.IReplayTransform t):base(id){transform=t;}public virtual bool IsDirty=>false;public virtual void Spawn(ReplayRecorder.API.ByteBuffer b){}}
 public class DynamicPosition:DynamicTransform {public DynamicPosition(int id,ReplayRecorder.API.IReplayTransform t):base(id,t){}}
}
namespace ReplayRecorder {
 public static class Replay {public static Action? OnPluginLoad,OnExpeditionStart,OnElevatorStop;public static bool Active=>Snapshot.SnapshotManager.Active;public static Dictionary<int,object> Tracked=new();public static List<object> Events=new(); public static void Spawn(object o){var id=((Core.Id)o).id;if(!Tracked.TryAdd(id,o))throw new Exception("Duplicate");} public static bool TryGet<T>(int id,out T mine){mine=Tracked.GetValueOrDefault(id) is T t?t:default!;return Active&&mine!=null;} public static T Get<T>(int id)=>(T)Tracked[id];public static bool Has<T>(int id)=>Tracked.ContainsKey(id);public static void TryDespawn<T>(int id){if(Active)Tracked.Remove(id);} public static void Despawn(Core.Id o)=>Tracked.Remove(o.id);public static void Trigger(object e)=>Events.Add(e);}
 public class Identifier {public static Identifier unknown=new();public static Identifier From(object o)=>new();} public static class BitHelper {public static void WriteHalf(object o,API.ByteBuffer b){}public static void WriteBytes(object o,API.ByteBuffer b){}}
}
namespace ReplayRecorder.Snapshot {
 public class SnapshotInstance {public bool Active=true; public float tickTime;public long queuedBytes;public Pool pool=new();}public class Pool{public int InUse,Size;}
 public static class SnapshotManager {public static SnapshotInstance? instance;public static bool Active=>instance?.Active==true; public static int Starts;public static void OnElevatorStart(){instance=new();Starts++;}public static void OnExpeditionEnd(){instance=null;Replay.Tracked.Clear();}public static void Guard(string n,Action a)=>a();public static void Invoke(string n,Action? a)=>a?.Invoke();}
}
namespace ReplayRecorder.BepInEx {public static class ConfigManager {public static bool ShowRecordingStatus,PerformanceDebug;}}
namespace ReplayRecorder.IO {public enum RecordingPhase{Failed}public record RecordingState(RecordingPhase Phase,string Caption);public static class RecordingStatus{public static RecordingState? Current;}}
namespace Agents {public class Agent:UnityEngine.Component{}}
namespace Player {public class PlayerAgent:Agents.Agent {public SNetwork.SNet_Player Owner=new();public ushort GlobalID=42;} }
namespace SNetwork {public class SNet_Player {public Player.PlayerAgent? PlayerAgent;public string NickName="test";}public static class SNet{public static bool IsMaster=true;}public class SNet_SessionHub{public void LeaveHub(){}}}
namespace ReplayRecorder.SNetUtils {public static class SNetUtils{public static bool TryGetSender(object p,out SNetwork.SNet_Player? sender){sender=null;return false;}}}
namespace Vanilla.Noises {public record NoiseInfo(Player.PlayerAgent Player);public static class NoiseTracker {public static void TrackNextNoise(NoiseInfo i){}}}
namespace Vanilla.Map {public static class MapUtils{public static Dictionary<byte,float> lowestPoint=new();}}
namespace LevelGeneration {public class Dimension {public int DimensionIndex;public static Dimension GetDimensionFromPos(UnityEngine.Vector3 p)=>new(){DimensionIndex=(int)p.x};}}
public class SteamManager{public void PostSetup(){}} public class ElevatorRide{public void StartElevatorRide(){}}public class RundownManager{public void EndGameSession(){}}public class GS_Generating{public void StartBuilding(){}}public class GS_InLevel{public void Enter(){}}public class GS_ReadyToStopElevatorRide{public void Enter(){}}
public class PUI_LocalPlayerStatus{public Text m_pulseText=new();public void UpdateBPM(){}}public class Text{public string text="";}
public class MineDeployerInstance:UnityEngine.Component {public Rep Replicator=new();public Course CourseNode=new();public UnityEngine.Component? m_detection;public object m_itemActionPacket=new();public void OnSpawn(){}public void SyncedPickup(){}public void SyncedTrigger(){}}
public class Rep {public int Key;}public class Course {public LevelGeneration.Dimension m_dimension=new();}
public class MineDeployerInstance_Detect_Laser:UnityEngine.Component {public UnityEngine.Transform m_lineRendererAlign=new();public float DetectionRange;}
public class MineDeployerInstance_Detonate_Explosive:UnityEngine.Component{public void DoExplode(){}}public class MineDeployerInstance_Detonate_Glue:UnityEngine.Component{public void DoExplode(){}}
public class GenericDamageComponent{public void BulletDamage(){}}public class pItemSpawnData{public Owner owner=new();public ItemData itemData=new();}public class ItemData {public int itemID_gearCRC;}public class Owner {public bool TryGetPlayer(out SNetwork.SNet_Player p){p=new();return false;}}
public class GlueGunProjectile:UnityEngine.Component{public bool m_landed,m_landedOnEnemy;public void Update(){}}
public class ProjectileManager {public static ProjectileManager Current=new();public Dictionary<int,GlueGunProjectile> m_glueGunProjectiles=new();public class pDestroyGlue{public int syncID;}public void DoDestroyGlue(){}public void SpawnGlueGunProjectileIfNeeded(){}}
