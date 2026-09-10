const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../Viewer/assets/node_modules/typescript');
const root = path.resolve(__dirname, '../..');

test('geometry protocols preserve byte alignment including measured support heights', async () => {
    const registrations = new Map();
    const read = (s, method, size) => { const result=s.view[method](s.index,true); s.index+=size; return result; };
    const bit = {
        readFloat:s=>read(s,'getFloat32',4), readByte: s=>read(s,'getUint8',1), readUShort:s=>read(s,'getUint16',2), readUInt:s=>read(s,'getUint32',4),
        readVectorArrayAsFloat32: (s,n)=>Float32Array.from({length:n*3},()=>read(s,'getFloat32',4)),
        readUShortArray:(s,n)=>Array.from({length:n},()=>read(s,'getUint16',2))
    };
    const source=fs.readFileSync(path.join(root,'Viewer/assets/src/profiles/vanilla/parser/map/map.ts'),'utf8');
    const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const loader={registerASLModule(){},registerHeader(name,version,value){registrations.set(name+version,value)}};
    new Function('require','exports','module',compiled)(id=>id.includes('bithelper')?bit:id.includes('moduleloader')?{ModuleLoader:loader}:id.includes('floor-themes')?{navigationSurfaceOffset:.1}:{Factory:()=>()=>new Map()}, {}, {src:'map'});
    assert.ok(!registrations.has('Vanilla.Map.Geometry0.0.1'));
    assert.ok(!registrations.has('Vanilla.Map.Geometry0.0.2'));
    for (const version of ['0.0.3','0.0.4']) {
        const bytes=Buffer.alloc(1+2+4+36+6+1+1+(version==='0.0.4'?12:0));
        let offset=0; bytes.writeUInt8(2,offset++); bytes.writeUInt16LE(3,offset);offset+=2;bytes.writeUInt32LE(3,offset);offset+=4;
        for (const value of [0,0,0,4,0,0,0,0,4]) {bytes.writeFloatLE(value,offset);offset+=4;}
        for (const value of [0,1,2]) {bytes.writeUInt16LE(value,offset);offset+=2;}
        bytes.writeUInt8(11,offset++);
        if(version==='0.0.4')for(const value of [-.6,-.4,-.8]){bytes.writeFloatLE(value,offset);offset+=4;}
        bytes.writeUInt8(123,offset);
        const stream={view:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),index:0};
        const values=new Map(); const header={getOrDefault(key,create){if(!values.has(key))values.set(key,create());return values.get(key)}};
        await registrations.get('Vanilla.Map.Geometry'+version).parse(stream,header);
        const mesh=values.get('Vanilla.Map.Geometry').get(2)[0];
        assert.deepEqual([...mesh.themes],[11]);
        assert.deepEqual(mesh.indices,[0,1,2]); assert.equal(stream.index,offset);assert.equal(bit.readByte(stream),123);
        {
            bytes.writeUInt8(13, 1+2+4+36+6);
            stream.index = 0;
            await assert.rejects(registrations.get('Vanilla.Map.Geometry'+version).parse(stream,header), /Unsupported/);
        }
    }
});
