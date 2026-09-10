const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {brotliCompressSync}=require('node:zlib');
const {ReplayContainerReader,crc32}=require('../../Viewer/electron/build/replay/container.cjs');
const {readRecordingDiagnostics}=require('../../Viewer/electron/build/replay/diagnostics.cjs');
const fixture=path.resolve(__dirname,'../../artifacts/fixtures/container.gtfo');
function block(raw,offset,time,flags){
 const encoded=brotliCompressSync(raw),header=Buffer.alloc(32);
 header.writeUInt32LE(0x334b4843);header.writeUInt32LE(encoded.length,4);header.writeUInt32LE(raw.length,8);header.writeBigUInt64LE(BigInt(offset),12);header.writeUInt32LE(time,20);header.writeUInt32LE(crc32(raw),24);header.writeUInt32LE(flags,28);return Buffer.concat([header,encoded]);
}
test('C# embedded reports survive copying one file, failed captures and failures before the header',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtfo-embedded-'));
 try{
  for(const suffix of ['', '.failed','.early']){
   const file=path.join(dir,'copied.gtfo');await fs.copyFile(fixture+suffix,file);
   const reader=await ReplayContainerReader.open(file);
   try{
    const report=await readRecordingDiagnostics(file,'session-a');
    assert.equal(report.SchemaVersion,1);assert.equal(report.SessionId,'session-a');
    assert.equal(reader.info.complete,suffix==='');assert.equal(reader.info.warning,undefined);
    assert.equal(report.Failure,suffix===''?null:suffix==='.early'?'header failed':'capture failed');
    const raw=await fs.readFile(fixture+'.raw');
    assert.equal(reader.info.rawBytes,suffix==='.early'?0:raw.length);
    if(suffix!=='.early')assert.deepEqual(await reader.read(0,raw.length),raw);
    await assert.rejects(readRecordingDiagnostics(file,'wrong-session'),/different session/);
   }finally{await reader.close();}
  }
  assert.deepEqual(await fs.readdir(dir),['copied.gtfo']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('embedded diagnostics validate checksum, JSON, bounded allocation and truncated metadata without losing playback',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtfo-metadata-')),file=path.join(dir,'session.gtfo');
 const bytes=await fs.readFile(fixture);
 let position=8;while(bytes.readUInt32LE(position+28)!==4)position+=32+bytes.readUInt32LE(position+4);
 const prefix=bytes.subarray(0,position),offset=Number(bytes.readBigUInt64LE(position+12)),time=bytes.readUInt32LE(position+20);
 const write=async report=>fs.writeFile(file,Buffer.concat([prefix,block(Buffer.from(report),offset,time,4)]));
 try{
  await fs.writeFile(file,prefix);assert.equal(await readRecordingDiagnostics(file),undefined);
  await fs.writeFile(file+'.diagnostics.json','{"SessionId":"ignored-sidecar"}');assert.equal(await readRecordingDiagnostics(file),undefined);
  await write('{broken');await assert.rejects(readRecordingDiagnostics(file),SyntaxError);
  await write('[]');await assert.rejects(readRecordingDiagnostics(file),/Invalid recording diagnostics/);
  await write('{"SessionId":"test"}');let corrupt=await fs.readFile(file);corrupt[position+24]^=1;await fs.writeFile(file,corrupt);await assert.rejects(readRecordingDiagnostics(file),/checksum/);
  const reader=await ReplayContainerReader.open(file);try{assert.equal((await reader.read(0,offset)).length,offset);}finally{await reader.close();}
  await write('{}');corrupt=await fs.readFile(file);corrupt.writeUInt32LE(1024*1024+1,position+8);await fs.writeFile(file,corrupt);await assert.rejects(readRecordingDiagnostics(file),/Invalid recording diagnostics block/);
  await fs.writeFile(file,bytes.subarray(0,position+34));assert.equal(await readRecordingDiagnostics(file),undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
