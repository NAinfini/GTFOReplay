const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../../Viewer/assets/src/profiles/vanilla/library/tacticalHud.ts');
function api(entries,time=1000){return {get:key=>entries.get(key),time:()=>time};}
test('scans retain per-circle progress and extraction semantics; dimensions and dead enemies are excluded',async()=>{
 const {tacticalState}=await load();
 const data=new Map([
 ['Vanilla.Bioscan',new Map([[1,{id:1,dimension:0}],[2,{id:2,dimension:0}],[3,{id:3,dimension:1}]])],
 ['Vanilla.Bioscan.Status',new Map([[1,{progress:.42}],[2,{progress:2}]])],
 ['Vanilla.Bioscan.Info',new Map([[2,{exit:true,requirement:'All',players:2,required:4,missingItems:1,state:2}]])],
 ['Vanilla.Enemy',new Map([[1,{id:1,dimension:0,health:1}],[2,{id:2,dimension:0,health:0}],[3,{id:3,dimension:1,health:1}],[4,{id:4,dimension:0,health:1}]])],
 ['Vanilla.Enemy.Animation',new Map([[1,{state:'Hibernate'}],[4,{state:'Dead'}]])],
 ['Vanilla.Enemy.Alert',[{enemy:1},{enemy:1},{enemy:2},{enemy:3},{enemy:4}]]
 ]);
 const state=tacticalState(api(data),0);
 assert.equal(state.scans.length,2);assert.equal(state.scans[0].title,'EXTRACTION SCAN');assert.equal(state.scans[0].percent,100);
 assert.match(state.scans[0].detail,/2\/4 players.*1 required items missing.*Waiting/);
 assert.equal(state.scans[1].percent,42);assert.equal(state.scans[1].title,'BIOSCAN');assert.equal(state.scans[1].detail,'');
 assert.equal(state.alarmed,1);
 data.set('Vanilla.Enemy.Alert',[]);assert.equal(tacticalState(api(data),0).alarmed,0);
});
test('mission and alarm persist; expired terminal output and future messages do not leak across seeking',async()=>{
 const {tacticalState}=await load();
 const info=new Map([['o',{channel:'Objective',text:'Return to extraction',time:10}],['a',{channel:'Alarm',title:'CLASS V',text:'Active',time:20}],['s',{channel:'Alarm',text:'',time:30}],['t',{channel:'Terminal',text:'UPLINK VERIFIED',time:100}]]);
 const data=new Map([['Vanilla.Gameplay.Info',info]]);
 assert.equal(tacticalState(api(data,1000),0).terminal.text,'UPLINK VERIFIED');
 const expired=tacticalState(api(data,13000),0);assert.equal(expired.terminal,undefined);assert.equal(expired.objective.text,'Return to extraction');assert.equal(expired.alarms.length,1);
 assert.equal(tacticalState(api(data,0),0).terminal,undefined);
});

test('game information exposes useful searchable details without timer traffic in the default timeline',async()=>{
 const {visibleEvents,eventDetail,eventKindKey}=await import('../../Viewer/interface/src/events.ts');
 const timer={id:1,time:10,kind:'Vanilla.Gameplay.Info',data:{channel:'Timer',title:'EXTRACTION',text:'00:30'}};
 const mission={id:2,time:20,kind:'Vanilla.Gameplay.Info',data:{channel:'Objective',title:'Mission',text:'Return to extraction'}};
 const scan={id:3,time:30,kind:'Vanilla.Bioscan.Info',data:{exit:true,state:3,players:3,required:4}};
 assert.deepEqual(visibleEvents([timer,mission,scan],false),[mission,scan]);
 assert.equal(visibleEvents([timer,mission,scan],true).length,3);
 assert.match(eventDetail(mission),/Return to extraction/);assert.match(eventDetail(scan),/Extraction.*Scanning.*3\/4/);
 assert.equal(eventKindKey(mission.kind),'GameplayInfo');assert.equal(eventKindKey(scan.kind),'ScanInfo');
});
