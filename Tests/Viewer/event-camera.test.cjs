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

test('automatic direction holds six real seconds, urgent events wait three, same subject does not recut', async () => {
    const {EventDirector} = await camera();
    const director = new EventDirector();
    const events = [event(1,1000,'Vanilla.Enemy.Alert'),event(2,2000),event(3,5000),event(4,8000),event(5,9000,'Vanilla.Player.Animation.Downed',3)];
    director.update(events,0,0,1,true,resolve);
    assert.equal(director.update(events,1000,1,1,true,resolve).id,1);
    assert.equal(director.update(events,2000,1,1,true,resolve),undefined);
    assert.equal(director.update(events,3000,1,1,true,resolve),undefined);
    assert.equal(director.update(events,4000,1,1,true,resolve).id,2);
    assert.equal(director.update(events,5000,1,1,true,resolve),undefined);
    for (let time=6000;time<=9000;time+=1000) assert.equal(director.update(events,time,1,1,true,resolve),undefined);
    assert.equal(director.update(events,10000,1,1,true,resolve).id,3);
    assert.equal(director.update([...events,event(6,11000,'Vanilla.Player.Animation.Downed',3)],11000,1,1,true,resolve),undefined);
});

test('fast playback does not accelerate camera cuts; seek, rewind, pause and noisy events cannot replay a backlog', async () => {
    const {EventDirector} = await camera();
    const director = new EventDirector(), events = [event(1,800),event(2,1600),event(3,2400)];
    director.update(events,0,0,8,true,resolve);
    assert.equal(director.update(events,800,.1,8,true,resolve).id,1);
    assert.equal(director.update(events,1600,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,2400,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,100000,.1,8,true,resolve),undefined);
    assert.equal(director.update(events,800,.1,1,true,resolve),undefined);
    assert.equal(director.update(events,1600,1,1,false,resolve),undefined);
    director.reset();
    const noise=[event(1,100,'Vanilla.StatTracker.Damage'),event(2,200,'Vanilla.Enemy.Animation.Heartbeat')];
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
    const dom={mount:{style:{},replaceChildren(){}},controls:{getBoundingClientRect:()=>({height:96})},scoreboard:panel(),debug:panel(),objective:panel()};
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
