// Package prepared Low models for playback. No extraction or decimation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {prepareArchitecture}=require('./runtime-architecture-package.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readGLB(bytes){
    if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
    const length=bytes.readUInt32LE(12);
    return {doc:JSON.parse(bytes.subarray(20,20+length)),binary:bytes.subarray(28+length)};
}
function writeGLB(doc,binary){
    const json=Buffer.from(JSON.stringify(doc)),padding=Buffer.alloc((-json.length)&3,32);
    const header=Buffer.alloc(20),chunk=Buffer.alloc(8),tail=Buffer.alloc((-binary.length)&3);
    header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+padding.length+binary.length+tail.length,8);
    header.writeUInt32LE(json.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
    chunk.writeUInt32LE(binary.length+tail.length);chunk.writeUInt32LE(0x004e4942,4);
    return Buffer.concat([header,json,padding,chunk,binary,tail]);
}
function inside(root,relative){
    const file=path.resolve(root,relative);
    if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Resource path leaves model project: '+relative);
    return file;
}
function packageGLB(bytes,sourceFile,destination,output,normalize,sourceRoot=path.dirname(sourceFile),images){
    const {doc,binary}=readGLB(bytes);
    if(normalize){
        const matches=doc.nodes.filter(node=>node.extras?.sourcePath===normalize);
        if(matches.length!==1)throw Error('Missing unique recording root: '+normalize);
        delete matches[0].matrix;
        Object.assign(matches[0],{translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});
    }
    // Move byte-identical image payloads to shared files without re-encoding pixels.
    const imageViews=new Set(),retainedViews=new Set();
    for(const accessor of doc.accessors??[]){
        if(accessor.bufferView!==undefined)retainedViews.add(accessor.bufferView);
        for(const field of ['indices','values'])if(accessor.sparse?.[field])retainedViews.add(accessor.sparse[field].bufferView);
    }
    for(const image of doc.images??[]){
        let data;
        if(image.bufferView!==undefined){const view=doc.bufferViews[image.bufferView];data=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);imageViews.add(image.bufferView);}
        else if(image.uri?.startsWith('data:'))data=Buffer.from(image.uri.split(',')[1],'base64');
        else if(image.uri){
            const file=inside(sourceRoot,path.relative(sourceRoot,path.resolve(path.dirname(sourceFile),image.uri)));
            data=images?images.get(file):fs.readFileSync(file);
            if(!data)throw Error('Model texture lacks a validated rebuilt snapshot: '+image.uri);
        }
        else throw Error('Model image has no payload');
        const ext=data.subarray(0,12).equals(Buffer.from([0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a]))?'ktx2':data.toString('ascii',0,4)==='RIFF'?'webp':data[0]===137?'png':data[0]===255?'jpg':null;
        if(!ext)throw Error('Unsupported model texture encoding');
        const texture=destination.split('/')[0]+'/textures/'+hash(data)+'.'+ext;
        output.set(texture,data);delete image.bufferView;
        image.uri=path.posix.relative(path.posix.dirname(destination),texture);
    }
    if ((doc.extensionsUsed??[]).includes('EXT_meshopt_compression')) {
        // Meshopt buffer views address virtual decoded buffers. Keep their encoded
        // payloads and offsets intact; only resource URIs and recording roots change.
        const result=writeGLB(doc,binary);output.set(destination,result);
        return {file:destination.split('/').slice(1).join('/'),revision:hash(result),triangles:(doc.meshes??[]).reduce((n,m)=>n+m.primitives.reduce((sum,p)=>sum+doc.accessors[p.indices??p.attributes.POSITION].count/3,0),0)};
    }
    const mapping=new Map(),chunks=[],views=[];let offset=0;
    for(const [index,view] of (doc.bufferViews??[]).entries()){
        if(imageViews.has(index)&&!retainedViews.has(index))continue;
        const data=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),pad=Buffer.alloc((-data.length)&3);
        mapping.set(index,views.length);views.push({...view,byteOffset:offset});chunks.push(data,pad);offset+=data.length+pad.length;
    }
    function remap(value){
        if(!value||typeof value!=='object')return;
        for(const [key,item] of Object.entries(value))if(key==='bufferView'){
            if(!mapping.has(item))throw Error('A non-image field references a removed buffer view');value[key]=mapping.get(item);
        }else remap(item);
    }
    remap(doc);doc.bufferViews=views;doc.buffers=[{byteLength:offset}];
    const result=writeGLB(doc,Buffer.concat(chunks));output.set(destination,result);
    return {file:destination.split('/').slice(1).join('/'),revision:hash(result),triangles:(doc.meshes??[]).reduce((n,m)=>n+m.primitives.reduce((sum,p)=>sum+doc.accessors[p.indices??p.attributes.POSITION].count/3,0),0)};
}
function prepareProps(source,packageFiles,read,rebuilt){
    const output=new Map();
    const gear=packageFiles.some(file=>file.path==='gear/manifest.json')?JSON.parse(read('gear/manifest.json')):{models:[]};
    const hasProps=JSON.parse(read('items/manifest.json')).length||JSON.parse(read('environment/manifest.json')).models.length;
    const published=model=>{
        const row=rebuilt.row(model.assetId,model.level);
        if(model.sourceFile!==row.file||model.sourceSha256!==row.sha256||model.originalRevision!==row.originalSha256||model.pipelineRevision!==rebuilt.receipt.pipelineRevision)
            throw Error('Runtime object is not from the published native rebuild: '+model.assetId);
        return rebuilt.load(model.assetId,row.originalFile);
    };
    for(const folder of ['items','environment']){
        const manifest=JSON.parse(read(folder+'/manifest.json')),models=Array.isArray(manifest)?manifest:manifest.models;
        for(const model of models){
            const level='low';
            const input=published(model);
            const lod=packageGLB(input.bytes,input.file,`${folder}/${level}/${model.id}.glb`,output,folder==='environment'?model.sourceRoot:undefined,source,input.images);
            lod.triangles=input.row.triangles;
            lod.sourceRevision=input.row.originalSha256;
            lod.sourceFile=input.row.file;lod.sourceSha256=input.row.sha256;lod.level=level;
            if(folder==='items'){
                lod.heldFile=null;
                if(model.heldAssetId){
                    const held=published({assetId:model.heldAssetId,level:model.heldLevel,sourceFile:model.heldSourceFile,sourceSha256:model.heldSourceSha256,originalRevision:model.heldOriginalRevision,pipelineRevision:model.pipelineRevision});
                    const heldAsset=packageGLB(held.bytes,held.file,`${folder}/${level}/${model.id}-held.glb`,output,undefined,source,held.images);
                    Object.assign(lod,{heldFile:heldAsset.file,heldRevision:heldAsset.revision,heldTriangles:held.row.triangles,heldLevel:level,heldSourceFile:held.row.file,heldSourceSha256:held.row.sha256});
                }
            }
            for(const key of ['file','heldFile','level','heldLevel','revision','triangles','sourceFile','heldSourceFile','runtimePath'])delete model[key];
            delete model.lods;Object.assign(model,lod);
        }
        if(!Array.isArray(manifest))manifest.version=1;
        output.set(folder+'/manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));
    }
    for(const model of gear.models){
        // Empty attachment nodes contain no render geometry.
        const prepared=model.kind==='rebuilt'?published(model):undefined;
        if(!prepared&&model.kind!=='empty-slot')throw Error('Unexpected Runtime gear kind: '+model.path);
        const file=prepared?.file??inside(source,'Runtime/gear/'+model.path);
        const bytes=prepared?.bytes??fs.readFileSync(file);
        if(!prepared&&((readGLB(bytes).doc.meshes??[]).some(mesh=>mesh.primitives.length)||hash(bytes)!==model.sourceSha256||hash(fs.readFileSync(inside(source,model.sourceFile)))!==model.sourceSha256))throw Error('Invalid empty component: '+model.path);
        const packed=packageGLB(bytes,file,`gear/${model.path}`,output,undefined,source,prepared?.images);
        delete model.lods;Object.assign(model,packed);
    }
    output.set('gear/manifest.json',Buffer.from(JSON.stringify(gear,null,2)));
    if(hasProps)prepareArchitecture(source,output,packageGLB,rebuilt);
    // All used prop geometry and textures are owned above. Original shader maps
    // and generic floor swatches from the preview site are not Viewer resources.
    const replaced=file=>/^(items|gear|environment)\//.test(file.path);
    return {output,files:packageFiles.filter(file=>!replaced(file))};
}
module.exports={readGLB,writeGLB,packageGLB,prepareProps};
