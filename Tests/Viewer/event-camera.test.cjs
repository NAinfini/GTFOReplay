const { test } = require('node:test');
const assert = require('node:assert/strict');
const camera = () => import('../../Viewer/assets/src/profiles/vanilla/library/eventCamera.ts');
const event = (id, time, kind = 'Vanilla.Player.Animation.Downed', target = id) => ({ id, time, kind, participants: [{type:'player',role:'player',id:target}] });
const resolve = e => ({key:`player:${e.participants[0].id}`,type:'player',id:e.participants[0].id});

test('lead-in clamps to clip start and focus prefers a revive recipient without confusing ID namespaces', async () => {
    const {eventLeadIn, resolveEventFocus} = await camera();
    assert.equal(eventLeadIn(10000,0),7000); assert.equal(eventLeadIn(11000,10000),10000);
    const player = {id:20,slot:1,nickname:'Alice',position:{x:1,y:2,z:3},dimension:0};
    const players = new Map([[10,{...player,id:10,slot:0}],[20,player]]), enemies = new Map([[20,{position:{x:99,y:0,z:0},dimension:0}]]);
    const revive = {id:1,time:5000,kind:'Vanilla.StatTracker.Revive',participants:[{type:'player',role:'source',id:10},{type:'player',role:'target',id:20}]};
    assert.equal(resolveEventFocus(revive,players,enemies).key,'player:20');
    assert.equal(resolveEventFocus(event(20,0),players,enemies).slot,1);
    assert.equal(resolveEventFocus({...revive,participants:[{type:'enemy',role:'enemy',id:20}]},players,enemies).position.x,99);
    assert.equal(resolveEventFocus({...revive,participants:[],data:{target:20}},players,enemies),undefined);
    assert.equal(resolveEventFocus({...revive,participants:[],data:{position:{x:1,y:2,z:3},dimension:0}},players,enemies).type,'point');
});

test('director anticipates recorded incidents, holds six seconds and lets urgent incidents interrupt after three', async () => {
    const {EventDirector} = await camera();
    const director = new EventDirector();
    const events = [event(1,3000,'Vanilla.Enemy.Alert'),event(2,6000),event(3,12000)];
    assert.equal(director.update(events,0,0,1,true,resolve).id,1,'establish the shot three seconds before the alert');
    assert.equal(director.update(events,1000,1,1,true,resolve),undefined);
    assert.equal(director.update(events,2000,1,1,true,resolve),undefined);
    assert.equal(director.update(events,3000,1,1,true,resolve).id,2,'urgent incident is anticipated after minimum hold');
    assert.equal(director.update(events,4000,1,1,true,resolve),undefined);
    assert.equal(director.update(events,5000,1,1,true,resolve),undefined);
    for (let time=6000;time<=8000;time+=1000) assert.equal(director.update(events,time,1,1,true,resolve),undefined);
    assert.equal(director.update(events,9000,1,1,true,resolve).id,3);
    assert.equal(director.update([...events,event(6,11000,'Vanilla.Player.Animation.Downed',3)],10000,1,1,true,resolve),undefined);
});

test('fast playback does not accelerate camera cuts; seek, rewind, pause and noisy events cannot replay a backlog', async () => {
    const {EventDirector} = await camera();
    const director = new EventDirector(), events = [event(1,800),event(2,1600),event(3,2400)];
    assert.equal(director.update(events,0,0,8,true,resolve).id,1);
    assert.equal(director.update(events,800,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,1600,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,2400,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,100000,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,800,.1,1,true,resolve).id,1,'rewind rebuilds upcoming coverage at the new time');
    assert.equal(director.update(events,1600,1,1,false,resolve),undefined);
    director.reset();
    const noise=[event(1,100,'Vanilla.Player.Animation.Swing'),event(2,200,'Vanilla.Enemy.Animation.Heartbeat')];
    director.update(noise,0,0,1,true,resolve);
    assert.equal(director.update(noise,200,.2,1,true,resolve),undefined);
});


test('the real event adapter ignores out-of-order snapshots and manual overrides', async () => {
    const fs=require('node:fs'),path=require('node:path'),ts=require('../../Viewer/assets/node_modules/typescript');
    const focus=await camera();
    const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../Viewer/assets/src/profiles/vanilla/ui/display.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    let adapter;
    const signal=value=>{const listeners=[];const fn=function(next){if(arguments.length){value=next;listeners.forEach(cb=>cb(next));}return value;};fn.on=cb=>listeners.push(cb);return fn;};
    const panel=()=>({view(){}});
    const dom={mount:{style:{},replaceChildren(){}},controls:{getBoundingClientRect:()=>({height:96})},scoreboard:panel(),debug:panel(),objective:panel(),tactical:panel()};
    const html=first=>Array.isArray(first)?dom:{box(){}};
    html.bind=()=>({transform(){}});
    const dispose=new AbortController(),module={exports:{}};
    new Function('require','module','exports','window','ResizeObserver',code)(id=>{
        if(id.endsWith('/html.js'))return{html};
        if(id.endsWith('/signal.js'))return{signal};
        if(id.endsWith('/eventCamera.js'))return focus;
        if(id==='./main.js')return{dispose};
        return new Proxy({},{get:()=>panel});
    },module,module.exports,{ReplayInterface:{mountControls:(_,value)=>{adapter=value;return()=>{};}}},class{observe(){} disconnect(){}});
    const reads=[],frames=[];
    const controls={revision:0,cancelEventFocus(){this.revision++;},focusEvent(target,time){this.revision++;frames.push({id:target.id,time});},followPlayer(){this.revision++;}};
    const replay={identity:'recording',startTime:5000,getSnapshot:()=>new Promise(resolve=>reads.push(resolve)),api:state=>state};
    const view=Object.assign([],{renderer:{get:()=>controls},replay:()=>replay,time:signal(5000),pause:signal(false),live:signal(false),resize(){}});
    const display=module.exports.Display();display.view(view);
    const state={get:name=>name==='Vanilla.Player'?new Map([1,2].map(id=>[id,{id,slot:id-1,nickname:'Player '+id,position:{x:id,y:0,z:0},dimension:0}])):new Map()};
    const earlier=adapter.focusEvent(event(1,10000));
    const later=adapter.focusEvent(event(2,20000));
    reads[1](state);await later;reads[0](state);await earlier;
    assert.deepEqual(frames,[{id:2,time:17000}]);assert.equal(view.time(),17000);
    const pending=adapter.focusEvent(event(1,12000));adapter.follow(undefined);reads[2](state);await pending;
    assert.equal(frames.length,1);
    const afterSeek=adapter.focusEvent(event(1,12000));adapter.seek(30000);reads[3](state);await afterSeek;
    assert.equal(frames.length,1);assert.equal(view.time(),30000);
});

test('dead and missing subjects retire immediately, pause freezes shots, and point shots expire in real seconds', async () => {
    const {EventDirector} = await camera();
    const director = new EventDirector();
    const player = resolve(event(1,0));
    let current, valid = true;
    const scene = () => ({current,valid:()=>valid,continuation:()=>player});
    const update = (time,dt=1,playing=true,speed=1,events=[]) => {
        const next=director.update(events,time,dt,speed,playing,resolve,scene());
        if(next!==undefined)current=next??undefined;
        return next;
    };
    assert.equal(update(0,0).key,player.key,'auto starts with squad coverage');
    current={key:'enemy:99',type:'enemy',id:99}; valid=false;
    assert.equal(update(1000).key,player.key,'death bypasses minimum shot length');
    current={key:'enemy:100',type:'enemy',id:100};
    assert.equal(update(2000,1,false),undefined,'paused inspection must not cut');
    assert.equal(current.id,100);
    assert.equal(update(3000).key,player.key,'resume retires the missing enemy');
    valid=true;current={key:'point:3',type:'point'};
    for(let i=1;i<=5;i++)assert.equal(update(3000+i*8000,1,true,8),undefined);
    assert.equal(update(51000,1,true,8).key,player.key,'temporary shot ends after six viewing seconds at 8x');
    current={key:'enemy:99',type:'enemy',id:99};valid=false;
    assert.equal(director.update([],52000,1,1,true,resolve,{current,valid:()=>false,continuation:()=>undefined}),null,'no squad clears stale tracking');
});

test('continuity stays with nearby combat and dead enemies cannot become event targets', async () => {
    const {continuityFocus,resolveEventFocus,EventDirector}=await camera();
    const player=(id,x,dimension=0)=>({id,slot:id,nickname:String(id),position:{x,y:0,z:0},dimension});
    const players=new Map([[1,player(1,0)],[2,player(2,10)],[3,player(3,0,1)]]);
    const enemies=new Map([[8,{position:{x:0,y:0,z:0},dimension:0,health:0,targetPlayerSlotIndex:1}], [9,{position:{x:10,y:0,z:0},dimension:0,health:10,targetPlayerSlotIndex:2}]]);
    assert.equal(continuityFocus(players,enemies,player(1,0)).id,2);
    assert.equal(continuityFocus(new Map(),enemies),undefined);
    const dead={...event(8,1000,'Vanilla.Enemy.Alert'),participants:[{type:'enemy',role:'target',id:8}]};
    assert.equal(resolveEventFocus(dead,players,enemies),undefined);
    const director=new EventDirector(),events=[event(1,1000,'Vanilla.StatTracker.Damage'),event(2,6000,'Vanilla.StatTracker.Damage')];
    assert.equal(director.update(events,0,0,1,true,resolve).id,1);
    for(let t=1000;t<6000;t+=1000)assert.equal(director.update(events,t,1,1,true,resolve),undefined);
    assert.equal(director.update(events,6000,1,1,true,resolve).id,2,'combat transfers after the minimum hold');
});

test('quiet coverage rotates the squad and repeated damage cannot pin one player forever', async () => {
    const {EventDirector,continuityFocus}=await camera();
    const players=new Map([1,2,3].map(id=>[id,{id,slot:id,nickname:String(id),position:{x:id,y:0,z:0},dimension:0}]));
    const director=new EventDirector();let current;
    const events=Array.from({length:41},(_,i)=>event(i,i*1000,'Vanilla.StatTracker.Damage',1));
    const shots=[];
    for(let t=0;t<=36000;t+=1000){
        const next=director.update(events,t,t?1:0,1,true,resolve,{current,valid:()=>true,continuation:recent=>continuityFocus(players,new Map(),players.get(1),recent)});
        if(next){current=next;shots.push([t,next.id]);}
    }
    assert.deepEqual(shots.slice(0,3),[[0,1],[12000,2],[18000,1]],'continuous combat still permits another player after twelve seconds');
    director.reset();current=undefined;const quiet=[];
    for(let t=0;t<=36000;t+=1000){
        const next=director.update([],t,t?1:0,1,true,resolve,{current,valid:()=>true,continuation:recent=>continuityFocus(players,new Map(),players.get(1),recent)});
        if(next){current=next;quiet.push(next.id);}
    }
    assert.deepEqual(quiet,[1,2,3,1]);
});

test('future subjects are retried when spawned, shots stay through the incident, and late live events are eligible', async () => {
    const {EventDirector}=await camera();const director=new EventDirector();
    const events=[event(1,3000)];let spawned=false;
    const resolver=e=>spawned?resolve(e):undefined;
    assert.equal(director.update(events,0,0,1,true,resolver),undefined);
    spawned=true;
    assert.equal(director.update(events,1000,1,1,true,resolver).id,1);
    for(let t=1100;t<=3000;t+=100)assert.equal(director.update(events,t,1,.1,true,resolver,{current:resolve(events[0]),valid:()=>true,continuation:()=>resolve(event(2,0))}),undefined,'slow playback must not abandon the anticipated event');
    director.reset(10000);
    assert.equal(director.update([],11000,1,1,true,resolve),undefined);
    assert.equal(director.update([event(2,11500)],12000,1,1,true,resolve).id,2,'live events work without future data');
    assert.equal(director.update([event(3,19000)],20000,.01,1,true,resolve),undefined,'seek cannot replay an incident before the destination');
});
