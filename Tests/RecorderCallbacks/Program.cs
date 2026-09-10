using System.Reflection;
using ReplayRecorder;
using ReplayRecorder.Snapshot;
using Vanilla.Mines;
static object? Call(Type type,string name,params object?[] args)=>type.GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic)!.Invoke(null,args);
static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
var events=new List<string>();Replay.OnExpeditionStart=()=>events.Add("init");Replay.OnElevatorStop=()=>events.Add("scene");
foreach(var late in new[]{false,true,true,false}) {
 var starts=SnapshotManager.Starts;events.Clear();
 if(!late)Call(typeof(GameEventManager),"StartElevatorRide");
 Call(typeof(GameEventManager),"BeforeLevelBuild");
 events.Add("native scene/spawn callbacks");
 if(!late)Call(typeof(GameEventManager),"StopElevatorRide");
 Call(typeof(GameEventManager),"EnterLevel");Call(typeof(GameEventManager),"EnterLevel");
 Check(SnapshotManager.Starts==starts+1 && events.SequenceEqual(new[]{"init","native scene/spawn callbacks","scene"}),"Late join reset state or omitted/duplicated headers");
 Call(typeof(GameEventManager),late?"LeaveHub":"EndGameSession");
 Call(typeof(GameEventManager),"EnterLevel");Check(!Replay.Active,"Teardown restarted recording");
}
Call(typeof(GameEventManager),"BeforeLevelBuild");
var patches=typeof(rMine).GetNestedType("Patches",BindingFlags.NonPublic)!;
MineDeployerInstance MakeMine(int id){var m=new MineDeployerInstance{Replicator=new(){Key=id},m_detection=new UnityEngine.Component()};Replay.Spawn(new rMine(new Player.PlayerAgent(),m,Identifier.unknown));return m;}
var outer=MakeMine(11);var inner=MakeMine(12);
var a=Call(patches,"BeginDetonation",outer,true);var outerEvent=MineManager.currentDetonateEvent;
var b=Call(patches,"BeginDetonation",inner,true);Check(MineManager.currentDetonateEvent!=outerEvent,"Nested mine lost event");
Call(patches,"EndDetonation",b);Check(MineManager.currentDetonateEvent==outerEvent&&!Replay.Tracked.ContainsKey(12),"Nested mine cleanup");
var unknown=Call(patches,"BeginDetonation",new MineDeployerInstance(),true);Check(MineManager.currentDetonateEvent==null,"Untracked mine inherited attribution");Call(patches,"EndDetonation",unknown);
Check(MineManager.currentDetonateEvent==outerEvent && Replay.Events.Count==2,"Untracked ID zero generated event");
Call(patches,"EndDetonation",a);Check(MineManager.currentDetonateEvent==null&&!Replay.Tracked.ContainsKey(11),"Outer mine leaked state");
var glue=MakeMine(13);var g=Call(patches,"BeginDetonation",glue,false);Call(patches,"EndDetonation",g);Check(Replay.Events.Count==2&&!Replay.Tracked.ContainsKey(13),"Glue emitted explosive damage");
var foam=new GlueGunProjectile();foam.transform.position.x=2;
Call(typeof(Vanilla.Cfoam.rCfoam).GetNestedType("Patches",BindingFlags.NonPublic)!,"SpawnGlueGunProjectile",new ProjectileManager(),foam);
Check(Replay.Get<Vanilla.Cfoam.rCfoam>(17).transform.dimensionIndex==2,"Level foam requires a local player or loses dimension");
Console.WriteLine("PASS: production normal/late-join/rejoin callbacks, single scene publication, mine ID zero/nested/glue cleanup, and pre-player foam dimension");
