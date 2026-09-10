const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const ts=require('../../Viewer/assets/node_modules/typescript');
const registrations=new Map(), dynamics=new Map();
const read=(s,type,size)=>{const v=s.data[type](s.offset);s.offset+=size;return v;};
const bit={
 readByte:s=>read(s,'readUInt8',1),readBool:s=>!!read(s,'readUInt8',1),readUShort:s=>read(s,'readUInt16LE',2),
 readInt:s=>read(s,'readInt32LE',4),readFloat:s=>read(s,'readFloatLE',4),
 readHalf:s=>{const u=read(s,'readUInt16LE',2),e=(u>>10)&31,f=u&1023;return (u&32768?-1:1)*(e===0?2**-14*f/1024:2**(e-15)*(1+f/1024));},
 readVector:s=>({x:-bit.readFloat(s),y:bit.readFloat(s),z:bit.readFloat(s)}),
 readHalfQuaternion:s=>{bit.readByte(s);for(let i=0;i<3;i++)bit.readHalf(s);return {x:0,y:0,z:0,w:1};},
 readString:s=>{const n=bit.readUShort(s),v=s.data.toString('utf8',s.offset,s.offset+n);s.offset+=n;return v;}
};
const values=()=>{const v=new Map();v.getOrDefault=(k,create)=>{if(!v.has(k))v.set(k,create());return v.get(k)};return v;};
const loader={registerASLModule(){},registerHeader(n,v,p){registrations.set(n+v,p)},registerDynamic(n,v,p){dynamics.set(n+v,p)},registerEvent(){}};
const cache=new Map();
function load(name){
 const file=path.resolve(__dirname,'../../Viewer/assets/src/profiles/vanilla/parser/map',name+'.ts');if(cache.has(file))return cache.get(file);
 const mod={exports:{},src:file};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports','module',code)(id=>{
  if(id.includes('bithelper'))return bit;if(id.includes('moduleloader'))return {ModuleLoader:loader};if(id.includes('factory'))return {Factory:()=>()=>new Map()};
  if(id.endsWith('/identifier.js'))return {IdentifierData:()=>({}),Identifier:{create:()=>({}),unknown:{},parse:async(_,s)=>{assert.equal(bit.readByte(s),0);return {}}}};
  if(id==='./transform.js')return load('transform');throw Error(id);
 },mod.exports,mod);cache.set(file,mod.exports);return mod.exports;
}
for(const name of ['door','terminal','generator','disinfectstation','bulkheadcontroller','resourcecontainer','spitters'])load(name);
function writer(){const chunks=[];return {
 byte(n){chunks.push(Buffer.from([n]));return this},short(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);chunks.push(b);return this},
 int(n){const b=Buffer.alloc(4);b.writeInt32LE(n);chunks.push(b);return this},float(n){const b=Buffer.alloc(4);b.writeFloatLE(n);chunks.push(b);return this},
 vector(x,y,z){return this.float(x).float(y).float(z)},quat(){return this.byte(3).short(0).short(0).short(0)},
 string(s){const b=Buffer.from(s);this.short(b.length);chunks.push(b);return this},stream(){return {data:Buffer.concat(chunks),offset:0}}
};}

test('current device headers preserve following-row alignment and scale; older versions are not registered',async()=>{
 const cases=[['Doors','door','0.0.1','0.0.2'],['Terminals','terminal','0.0.2','0.0.3'],['Generators','generator','0.0.1','0.0.2'],['DisinfectStations','disinfectstation','0.0.1','0.0.2'],['BulkheadControllers','bulkheadcontroller','0.0.1','0.0.2'],['ResourceContainers','resourcecontainer','0.0.4','0.0.5']];
 for(const [type,_,old,version] of cases){
  assert.equal(registrations.has('Vanilla.Map.'+type+old),false);
  const w=writer().short(2);
  for(const id of [31,32]){
   w.int(id).byte(2).vector(3,4,5).quat();
   w.short(100+id);
   if(type==='Doors')w.byte(0).byte(0).byte(1);
   if(type==='BulkheadControllers')w.byte(1).int(777).byte(0).byte(1).int(999);
   if(type==='ResourceContainers')w.byte(id===31?1:0).byte(0).byte(1).byte(2);
   {w.vector(2,3,4);if(type==='Doors')w.string('gate_8x4_weak_door(Clone)DOOR_131');if(type==='Terminals')w.string('Terminal_Mini');
    if(type==='ResourceContainers'){w.byte(id===31?1:0);if(id===31)w.vector(8,9,10).quat().vector(.5,1,2);w.string(id===31?'LockerWeakLock(Clone)':'Custom_Rundown_Box');}}
  }
  w.byte(123);const s=w.stream(),header=values(),snapshot=values();
  try { await registrations.get('Vanilla.Map.'+type+version).parse(s,header,snapshot); } catch(error) { throw new Error(type+version, {cause:error}); }
  const rows=header.get('Vanilla.Map.'+type);assert.equal(rows.size,2);
  for(const row of rows.values()){assert.deepEqual(row.position,{x:-3,y:4,z:5});assert.deepEqual(row.scale,{x:2,y:3,z:4});}
  if(type==='ResourceContainers'){assert.deepEqual(rows.get(31).lockTransform.scale,{x:.5,y:1,z:2});assert.equal(rows.get(32).lockTransform,undefined);assert.equal(rows.get(32).modelName,'Custom_Rundown_Box');}
  assert.equal(bit.readByte(s),123,type+version);assert.equal(s.offset,s.data.length,type+version);
 }
});

test('new lock-only updates and native spitter appearance deltas do not restart transition time',async()=>{
 assert.equal(dynamics.has('Vanilla.Map.ResourceContainers.State0.0.1'),false);
 assert.equal(dynamics.has('Vanilla.Enemy.Spitters.State0.0.1'),false);
 const lock=dynamics.get('Vanilla.Map.ResourceContainers.State0.0.2');
 const snap=values();snap.time=()=>100;snap.set('Vanilla.Map.ResourceContainers.State',new Map([[1,{id:1,closed:true,lastCloseTime:4,lockType:'Melee'}]]));
 const s=writer().byte(1).byte(2).byte(123).stream();const state=await lock.main.parse(s);lock.main.exec(1,state,snap);
 assert.equal(snap.get('Vanilla.Map.ResourceContainers.State').get(1).lockType,'Hackable');assert.equal(snap.get('Vanilla.Map.ResourceContainers.State').get(1).lastCloseTime,4);assert.equal(bit.readByte(s),123);
 const spitter=dynamics.get('Vanilla.Enemy.Spitters.State0.0.2');
 const appearance=writer().byte(1).byte(1);for(const half of [0x3800,0x3c00,0x4000,0x4200,0x3c00,0x4000,0x4200,0x4400])appearance.short(half);appearance.byte(123);
 const stream=appearance.stream(),parsed=await spitter.main.parse(stream);assert.equal(parsed.appearance.blend,.5);assert.deepEqual(parsed.appearance.scale,{x:2,y:3,z:4});assert.equal(bit.readByte(stream),123);
 snap.set('Vanilla.Enemy.Spitters.State',new Map([[1,{id:1,state:'Woke',lastStateTime:5}]]));spitter.main.exec(1,parsed,snap);assert.equal(snap.get('Vanilla.Enemy.Spitters.State').get(1).lastStateTime,5);
});
