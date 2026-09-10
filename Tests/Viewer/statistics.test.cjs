const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../../Viewer/assets/node_modules/typescript');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(require.resolve('../../Viewer/assets/src/profiles/vanilla/library/interval-stats.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
new Function('module', 'exports', code)(mod, mod.exports);
const { intervalStats } = mod.exports;
const identified = value => new Map([['weapon', { value }]]);
function stats(n) {
    return { enemyDamage: { bulletDamage: identified(n * 10), meleeDamage: identified(n), custom: new Map([['custom', identified(n * 2)]]) },
        kills: identified(n), mineKills: identified(n), sentryKills: identified(n), assists: identified(n),
        accuracy: new Map([['weapon', { total: n * 5, hits: n * 3 }]]), revives: n, packsUsed: new Map([['ammo', n]]) };
}
test('interval totals subtract prior damage, preserve separate weapon sources, and include joining players', () => {
    const before = new Map([[1n, stats(2)]]), after = new Map([[1n, stats(5)], [2n, stats(1)]]);
    const result = intervalStats(before, after, new Map([[1n, '\u73a9\u5bb6\u4e00'], [2n, 'Joining player']]), () => ({host: true, accuracy: true}));
    assert.deepEqual(result, [
        { player: '\u73a9\u5bb6\u4e00', damage: 39, kills: 9, assists: 3, shots: 15, hits: 9, revives: 3, packs: 3, packsConsumed: null },
        { player: 'Joining player', damage: 13, kills: 3, assists: 1, shots: 5, hits: 3, revives: 1, packs: 1, packsConsumed: null }
    ]);
    assert.deepEqual(intervalStats(new Map(), new Map(), new Map(), () => ({host: false, accuracy: false})), []);
    assert.equal(before.get(1n).revives, 2);
});

test('missing host or teammate capture is unavailable rather than zero, and phantom stats do not create players', () => {
    const result = intervalStats(new Map(), new Map([[1n, stats(0)], [999n, stats(20)]]), new Map([[1n, 'Recorder'], [2n, 'Teammate']]), id => ({host: false, accuracy: id === 1n}));
    assert.equal(result.length, 2);
    assert.equal(result[0].damage, null);
    assert.equal(result[0].kills, null);
    assert.equal(result[0].packs, null);
    assert.equal(result[0].shots, 0);
    assert.equal(result[1].shots, null);
    assert.equal(result[1].hits, null);
    const recorded = intervalStats(new Map(), new Map([[1n, stats(2)]]), new Map([[1n, 'Recorder']]), () => ({host: false, accuracy: false}));
    assert.equal(recorded[0].kills, 6);
    assert.equal(recorded[0].damage, 26);
});

const dynamics = new Map(), ticks = [];
const parserModules = new Map(), factories = new Map([['Map', () => new Map()]]), events = new Map(), headers = new Map();
const Factory = name => factories.get(name);
Factory.register = (name, factory) => factories.set(name, factory);
function loadParser(name) {
    if (parserModules.has(name)) return parserModules.get(name).exports;
    const module = {exports:{}}; parserModules.set(name, module);
    const text = fs.readFileSync(require.resolve('../../Viewer/assets/src/profiles/vanilla/parser/' + name + '.ts'), 'utf8');
    new Function('require', 'module', 'exports', ts.transpileModule(text, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText)(id => {
        if (id.endsWith('/moduleloader.js')) return {ModuleLoader:{registerASLModule(){},registerDynamic:(name,version,parser)=>dynamics.set(name,parser),registerTick:fn=>ticks.push(fn),registerHeader:(name,version,parser)=>headers.set(name,parser),registerEvent:(name,version,parser)=>events.set(name,parser)}};
        if (id === '@esm/three') return require('../../Viewer/assets/node_modules/three');
        if (id.endsWith('/helpers.js')) return {DynamicTransform:{}};
        if (id.endsWith('/random.js')) return {xor:()=>()=>.5};
        if (id.endsWith('/factory.js')) return {Factory};
        if (id.endsWith('/stattracker.js')) return loadParser('stattracker/stattracker');
        if (id.endsWith('/enemy.js')) return loadParser('enemy/enemy');
        if (id.endsWith('/deathcross.js')) return {DeathCross:{spawn(){}}};
        if (id.endsWith('/animation.js')) return {AnimHandles:{}};
        if (id.endsWith('/packuse.js')) return loadParser('events/packuse');
        if (id.endsWith('/bithelper.js')) return {
            readInt: async bytes => { const offset = bytes.cursor ?? 0; bytes.cursor = offset + 4; return bytes.readInt32LE(offset); },
            readByte: async bytes => { const offset = bytes.cursor ?? 0; bytes.cursor = offset + 1; return bytes.readUInt8(offset); }
        };
        if (id.endsWith('/identifier.js')) return {};
        throw new Error(id);
    },module,module.exports);
    return module.exports;
}
const {StatTracker} = loadParser('stattracker/stattracker');
loadParser('events/damage');
loadParser('events/clientstats');
loadParser('player/mine');
function snapshot(header = {isMaster:false,recorder:1n}) {
    const data = new Map();
    return {header:new Map([['ReplayRecorder.Header',header]]),time:()=>100,get:key=>data.get(key),getOrDefault:(key,factory)=>{if(!data.has(key))data.set(key,factory());return data.get(key);},data};
}

test('stat reading never inserts empty players and availability follows recording ownership', () => {
    const api = snapshot();
    StatTracker.readPlayer(undefined, api); StatTracker.readPlayer(1n, api);
    assert.equal(api.data.size,0);
    assert.deepEqual(StatTracker.availability(api,1n),{host:false,accuracy:true,dodges:false});
    api.data.set('ReplayRecorder.Player',new Map([[10,{snet:2n,isMaster:true,hasReplayMod:true}]]));
    assert.equal(StatTracker.availability(api,2n).host,true);
    assert.equal(StatTracker.availability(api,2n).accuracy,true);
    assert.equal(StatTracker.availability(api,3n).accuracy,false);
});

test('client observations preserve unknown coverage and never double-count host resource effects or player kills', async () => {
    const api = snapshot();
    api.data.set('Vanilla.Player', new Map([[10,{snet:1n}],[20,{snet:2n}]]));
    assert.equal(StatTracker.clientPacksAvailable(api,1n),false);
    await headers.get('Vanilla.StatTracker.Client').parse(null,api.header);
    assert.equal(StatTracker.clientPacksAvailable(api,1n),true);
    assert.equal(StatTracker.clientPacksAvailable(api,2n),false);
    await assert.rejects(headers.get('Vanilla.StatTracker.Client').parse(null,api.header), /Duplicate/);
    const packet = Buffer.alloc(5); packet.writeInt32LE(10); packet[4] = 1;
    const pack = events.get('Vanilla.StatTracker.PackConsumed');
    pack.exec(await pack.parse(packet),api);
    events.get('Vanilla.StatTracker.Pack').exec({source:10,target:20,type:'Tool'},api);
    const death = events.get('Vanilla.StatTracker.EnemyDeath');
    const deathBytes = Buffer.alloc(4); deathBytes.writeInt32LE(30);
    death.exec(await death.parse(deathBytes),api);
    assert.equal(api.get('Vanilla.StatTracker').confirmedEnemyDeaths,1);
    assert.equal(StatTracker.readPlayer(1n,api).packsConsumed.get('Tool'),1);
    assert.equal(StatTracker.readPlayer(2n,api).packsUsed.get('Tool'),1);
    assert.equal(StatTracker.readPlayer(1n,api).kills.size,0);
    const names = new Map([[1n,'Recorder'],[2n,'Teammate']]);
    const availability = id => ({...StatTracker.availability(api,id),clientPacks:StatTracker.clientPacksAvailable(api,id)});
    const rows = intervalStats(new Map(), api.get('Vanilla.StatTracker').players, names, availability);
    assert.equal(rows[0].packsConsumed,1);
    assert.equal(rows[1].packsConsumed,null);
    assert.equal(rows[0].kills,null);
    assert.equal(intervalStats(api.get('Vanilla.StatTracker').players, api.get('Vanilla.StatTracker').players,names,availability)[0].packsConsumed,0);
    const invalid = Buffer.alloc(5); invalid[4]=255;
    await assert.rejects(pack.parse(invalid), /Invalid consumed pack type/);
});

test('recorded damage credits the killing player and assisting teammate in the shared tracker', () => {
    const api = snapshot({isMaster:true});
    api.data.set('Vanilla.Player',new Map([[10,{snet:1n}],[20,{snet:2n}]]));
    dynamics.get('Vanilla.Enemy').spawn.exec(30,{maxHealth:10,type:{hash:'striker'}},api);
    const damage = events.get('Vanilla.StatTracker.Damage');
    damage.exec({type:'Bullet',source:10,target:30,damage:7,staggerDamage:0,sentry:false},api);
    damage.exec({type:'Bullet',source:20,target:30,damage:3,staggerDamage:0,sentry:false},api);
    assert.equal(StatTracker.readPlayer(1n,api).enemyDamage.bulletDamage.get('striker').value,7);
    assert.equal(StatTracker.readPlayer(1n,api).assists.get('striker').value,1);
    assert.equal(StatTracker.readPlayer(2n,api).kills.get('striker').value,1);
    const rows=intervalStats(new Map(),api.get('Vanilla.StatTracker').players,new Map([[1n,'A'],[2n,'B']]),id=>StatTracker.availability(api,id));
    assert.equal(rows[0].assists,1); assert.equal(rows[1].kills,1);
});

test('mine ownership survives early damage, absent explosions, despawn and visual expiry',()=>{
    const api=snapshot({isMaster:true});
    let time=100;api.time=()=>time;
    api.data.set('Vanilla.Player',new Map([[10,{snet:1n}],[20,{snet:2n}]]));
    dynamics.get('Vanilla.Enemy').spawn.exec(30,{maxHealth:20,type:{hash:'striker'}},api);
    const mine=dynamics.get('Vanilla.Mine'),damage=events.get('Vanilla.StatTracker.Damage');
    mine.spawn.exec(99,{owner:10,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1}},api);
    const hit={type:'Explosive',source:99,target:30,damage:5,staggerDamage:1,sentry:false};
    damage.exec(hit,api); // Host damage precedes local detonation by 5 ms.
    time+=5;events.get('Vanilla.Mine.Detonate').exec({id:99,trigger:10,shot:false},api);
    mine.despawn.exec(99,undefined,api);
    time+=2000;for(const tick of ticks)tick(api);
    assert.equal(api.get('Vanilla.Mine.Detonate').size,0);
    damage.exec({...hit,damage:15},api);
    assert.equal(StatTracker.readPlayer(1n,api).enemyDamage.explosiveDamage.get('striker').value,20);
    assert.equal(StatTracker.readPlayer(1n,api).mineKills.get('striker').value,1);
    mine.spawn.exec(100,{owner:10},api);mine.despawn.exec(100,undefined,api); // No detonation event in the recording.
    damage.exec({...hit,source:100,target:20,damage:7},api);
    assert.equal(StatTracker.readPlayer(1n,api).playerDamage.explosiveDamage.get(2n),7);
    mine.spawn.exec(100,{owner:20},api); // Reused mine key receives the new recorded owner.
    damage.exec({...hit,source:100,target:10,damage:2},api);
    assert.equal(StatTracker.readPlayer(2n,api).playerDamage.explosiveDamage.get(1n),2);
    assert.throws(()=>damage.exec({...hit,source:999},api),/unrecorded mine '999'/);
});

test('recorded shooter assistance is retained independently of mine owner damage credit',()=>{
    const api=snapshot({isMaster:true});
    api.data.set('Vanilla.Player',new Map([[10,{snet:1n}],[20,{snet:2n}]]));
    dynamics.get('Vanilla.Enemy').spawn.exec(30,{maxHealth:5,type:{hash:'striker'}},api);
    dynamics.get('Vanilla.Mine').spawn.exec(99,{owner:10,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1}},api);
    events.get('Vanilla.Mine.Detonate').exec({id:99,trigger:20,shot:true},api);
    events.get('Vanilla.StatTracker.Damage').exec({type:'Explosive',source:99,target:30,damage:5,staggerDamage:0,sentry:false},api);
    assert.equal(StatTracker.readPlayer(1n,api).mineKills.get('striker').value,1);
    assert.equal(StatTracker.readPlayer(2n,api).assists.get('striker').value,1);
});

test('late damage retains recorded target type after despawn without resurrecting or inventing a kill',()=>{
    const api=snapshot({isMaster:true});
    api.data.set('Vanilla.Player',new Map([[10,{snet:1n}]]));
    dynamics.get('Vanilla.Enemy').spawn.exec(30,{maxHealth:18,type:{hash:'nightmare-shooter'}},api);
    dynamics.get('Vanilla.Mine').spawn.exec(99,{owner:10},api);
    dynamics.get('Vanilla.Enemy').despawn.exec(30,undefined,api);
    for(const type of ['Explosive','Bullet','Melee'])
        events.get('Vanilla.StatTracker.Damage').exec({type,source:type==='Explosive'?99:10,target:30,damage:18,staggerDamage:0,sentry:false},api);
    const stats=StatTracker.readPlayer(1n,api);
    assert.equal(stats.enemyDamage.explosiveDamage.get('nightmare-shooter').value,18);
    assert.equal(stats.enemyDamage.bulletDamage.get('nightmare-shooter').value,18);
    assert.equal(stats.enemyDamage.meleeDamage.get('nightmare-shooter').value,18);
    assert.equal(api.get('Vanilla.Enemy').has(30),false);
    assert.equal(stats.mineKills.size,0);
});

test('player health loss flashes red; only pack recipients get the matching green feedback',async()=>{
    loadParser('player/stats');loadParser('events/packuse');
    const api=snapshot();let time=100;api.time=()=>time;
    api.data.set('Vanilla.Player',new Map([[1,{snet:1n}],[2,{snet:2n}]]));
    const initial={health:1,infection:.2,primaryAmmo:.5,secondaryAmmo:.5,toolAmmo:.5,consumableAmmo:0,resourceAmmo:0,stamina:1};
    const stats=dynamics.get('Vanilla.Player.Stats');
    stats.spawn.exec(1,initial,api);stats.spawn.exec(2,initial,api);
    const target=api.get('Vanilla.Player.Stats').get(2);
    assert.equal(target.feedback,undefined);
    stats.main.exec(2,{...initial,health:.8},api);
    assert.deepEqual(target.feedback.health,{time:100,color:0xff4545});
    time=200;stats.main.exec(2,{...initial,health:.9},api);
    assert.equal(target.feedback.health.time,100,'ordinary recovery is not a resource hit');
    for(const [type,fields] of [['Ammo',['primaryAmmo','secondaryAmmo']],['Tool',['toolAmmo']],['Healing',['health']],['Disinfect',['infection']]]){
        time+=100;events.get('Vanilla.StatTracker.Pack').exec({type,source:1,target:2},api);
        for(const field of fields)assert.deepEqual(target.feedback[field],{time,color:0x45e887});
    }
    assert.equal(api.get('Vanilla.Player.Stats').get(1).feedback,undefined);
    const {feedbackColor}=await import('../../Viewer/assets/src/profiles/vanilla/library/statFeedback.ts');
    const flash={time:1000,color:0xff4545};
    assert.equal(feedbackColor(flash,1000),flash.color);
    assert.notEqual(feedbackColor(flash,1250),flash.color);
    assert.notEqual(feedbackColor(flash,1500),0xffffff);
    assert.equal(feedbackColor(flash,2000),0xffffff);
    assert.equal(feedbackColor(flash,999),0xffffff);
    assert.equal(feedbackColor(undefined,1000,0x03e8fc),0x03e8fc);
});

test('new information events restore HUD state and remove completed scan metadata',()=>{
 loadParser('events/gameplayinfo');const state=snapshot();
 const message={channel:'Objective',id:0,title:'Mission',text:'Return to extraction'};
 events.get('Vanilla.Gameplay.Info').exec(message,state);
 assert.deepEqual(state.get('Vanilla.Gameplay.Info').get('Objective:0'),{...message,time:100});
 events.get('Vanilla.Gameplay.Info').exec({...message,text:''},state);
 assert.equal(state.get('Vanilla.Gameplay.Info').size,1);assert.equal(state.get('Vanilla.Gameplay.Info').get('Objective:0').text,'');
 const scan={id:12,state:3,players:3,required:4,missingItems:0,exit:true,alarm:false,requirement:'All'};
 events.get('Vanilla.Bioscan.Info').exec(scan,state);assert.deepEqual(state.get('Vanilla.Bioscan.Info').get(12),scan);
 events.get('Vanilla.Bioscan.Info').exec({...scan,state:4},state);assert.equal(state.get('Vanilla.Bioscan.Info').size,0);
});
