const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {inspect,install}=require('../../Tools/import-model-resources.cjs');
const {writeGLB}=require('../../Tools/runtime-model-package.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('resource import validates the published native rebuild before changing Viewer files',t=>{
    const base=fs.mkdtempSync(path.join(os.tmpdir(),'gtfo-model-import-'));
    t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
    const source=path.join(base,'source'),runtime=path.join(source,'Runtime'),destination=path.join(base,'viewer');
    const files=[],lods={},rows=[],pipelineRevision='a'.repeat(64);
    function write(relative,data){const file=path.join(source,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);return hash(data);}
    function add(relative,data){const sha256=write('Runtime/'+relative,data);files.push({path:relative,bytes:Buffer.byteLength(data),sha256});return sha256;}
    const glb=writeGLB({asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:[],nodes:[],meshes:[]},Buffer.alloc(0));
    const artifact=writeGLB({asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:[],nodes:[{mesh:0}],meshes:[{name:'g_artifact_shape_a',primitives:[]}],
        materials:[{name:'artifact_shape_texture_a'},{name:'artifact_shape_inside_texture_a'}]},Buffer.alloc(0));
    for(const [assetId,library,originalFile,bytes] of [
        ['sample','actor','artifacts/actor-lod-review/original/sample.glb',glb],
        ['item-122','object','artifacts/item-material-review/models/item-122-pickup-1.glb',artifact]
    ]){
        const sha256=write(originalFile,bytes);
        for(const level of ['low','mid','high']){
            const file=`artifacts/rebuilt-models/models/${assetId}-${level}.glb`;write(file,bytes);
            rows.push({id:assetId+'-'+level,assetId,level,library,originalFile,originalSha256:sha256,inputFile:originalFile,inputSha256:sha256,
                file,sha256,fileBytes:bytes.length,triangles:1,textures:[],pipelineRevision,algorithm:'blender-native-decimate',geometryMethod:library==='actor'?'native-actor':'original-glb'});
            if(assetId==='sample')lods[level]={file:level+'/sample.glb',revision:add('actors/'+level+'/sample.glb',bytes)};
        }
    }
    add('actors/manifest.json',JSON.stringify([{id:'sample',sourceRevision:hash(glb),lods}]));
    add('items/manifest.json','[]');add('environment/manifest.json','{"version":2,"models":[]}');
    const manifest=path.join(runtime,'resource-manifest.json');
    const completion={passed:true,variants:6,families:2,pipelineRevision,
        manifestSha256:write('artifacts/rebuilt-models/manifest.json',JSON.stringify(rows)),
        validationSha256:write('artifacts/rebuilt-models/packed-validation.json',JSON.stringify({passed:true,phase:'packed',variants:6,families:2}))};
    const rebuilt=Object.fromEntries(['manifestSha256','validationSha256','pipelineRevision'].map(key=>[key,completion[key]]));
    const save=()=>fs.writeFileSync(manifest,JSON.stringify({version:2,rebuilt,files}));save();
    const saveCompletion=value=>write('artifacts/rebuilt-models/completion.json',JSON.stringify(value));saveCompletion(completion);
    fs.mkdirSync(path.join(destination,'actors'),{recursive:true});fs.writeFileSync(path.join(destination,'actors/sentinel'),'keep');
    const unchanged=()=>assert.equal(fs.readFileSync(path.join(destination,'actors/sentinel'),'utf8'),'keep');
    fs.appendFileSync(path.join(runtime,'actors/high/sample.glb'),'corruption');
    assert.throws(()=>install(source,destination),/Resource changed/);unchanged();
    fs.writeFileSync(path.join(runtime,'actors/high/sample.glb'),glb);
    const expected=files[0].path;files[0].path='actors/../escape.glb';save();assert.throws(()=>inspect(source),/Invalid runtime resource path/);
    files[0].path='actors/original/sample.glb';save();assert.throws(()=>inspect(source),/Invalid runtime resource path/);
    files[0].path=expected;save();
    saveCompletion({...completion,passed:false});assert.throws(()=>install(source,destination),/complete validation/);unchanged();saveCompletion(completion);
    rebuilt.pipelineRevision='b'.repeat(64);save();assert.throws(()=>install(source,destination),/does not match/);unchanged();rebuilt.pipelineRevision=pipelineRevision;save();
    const model=rows.find(row=>row.id==='sample-low');
    fs.appendFileSync(path.join(source,model.file),'changed');assert.throws(()=>install(source,destination),/Changed rebuilt input/);unchanged();
    fs.writeFileSync(path.join(source,model.file),glb);
    fs.appendFileSync(path.join(source,model.originalFile),'changed');assert.throws(()=>install(source,destination),/Changed rebuilt input/);unchanged();
    fs.writeFileSync(path.join(source,model.originalFile),glb);
    install(source,destination);
    assert.equal(fs.existsSync(path.join(destination,'actors/high/sample.glb')),false);
    assert.equal(fs.existsSync(path.join(destination,'actors/mid/sample.glb')),false);
    assert.equal(fs.existsSync(path.join(destination,'actors/sentinel')),false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(destination,'actors/manifest.json')))[0].model.file,'low/sample.glb');
    const receipt=JSON.parse(fs.readFileSync(path.join(destination,'model-resources.json')));
    assert.equal(receipt.files.length,6);assert.deepEqual(receipt.rebuilt,rebuilt);assert.equal(receipt.optimizedSourceRevision,undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination,'items/manifest.json')))[0].itemIds,[152]);
});
