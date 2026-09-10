// Import the model project's prepared runtime package; never its website or Originals.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const {prepareProps,packageGLB,readGLB,writeGLB}=require('./runtime-model-package.cjs');
const {prepareTerminal}=require('./runtime-terminal-package.cjs');
const {prepareArtifacts}=require('./runtime-artifact-package.cjs');
const {rebuiltModels}=require('./rebuilt-model-package.cjs');
const {prepareHands}=require('./runtime-hand-package.cjs');
const {prepareFirstPerson}=require('./runtime-first-person-package.cjs');
const roots=new Set(['actors','environment','gear','items','player-animations','details']);
function playerAnimationFiles(){
    // The renderer's clip list owns the runtime dependency set. Menu/FPS camera
    // exports from the source library are not playback dependencies.
    const source=fs.readFileSync(path.join(__dirname,'../Viewer/assets/src/profiles/vanilla/datablocks/player/animation.ts'),'utf8');
    const array=source.match(/\bconst playerAnimationClipNames\s*=\s*(\[[\s\S]*?\])\s+as const;/)?.[1];
    if(!array)throw Error('Cannot read the player animation dependency list.');
    const clips=JSON.parse(array.replace(/,\s*\]$/,']'));
    if(!Array.isArray(clips)||!clips.length||new Set(clips).size!==clips.length||clips.some(name=>typeof name!=='string'||!/^[A-Za-z0-9_]+$/.test(name)))throw Error('Invalid player animation dependency list.');
    return new Set(['player-animations/rig.json',...clips.map(name=>'player-animations/'+name+'.json')]);
}
function inspect(source){
    const base=path.resolve(source,'Runtime');
    const manifest=JSON.parse(fs.readFileSync(path.join(base,'resource-manifest.json'),'utf8'));
    if(manifest.version!==2||!manifest.rebuilt||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Invalid runtime resource manifest');
    const seen=new Set();
    for(const file of manifest.files){
        if(typeof file.path!=='string'||/[\\:\0]/.test(file.path)||file.path.split('/').some(p=>!p||p==='.'||p==='..')||!roots.has(file.path.split('/')[0])||/original/i.test(file.path)||seen.has(file.path))throw Error('Invalid runtime resource path: '+file.path);
        seen.add(file.path);
        if(!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<=0)throw Error('Invalid runtime resource hash/size: '+file.path);
        const data=fs.readFileSync(path.join(base,file.path));
        if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Resource changed: '+file.path);
    }
    const actors=JSON.parse(fs.readFileSync(path.join(base,'actors/manifest.json'),'utf8'));
    for(const actor of actors){
        if(!actor.lods.low)throw Error('Actor must have a prepared Low model: '+actor.id);
        for(const [level,lod] of [['low',actor.lods.low]]){
            if(lod.file!==`${level}/${actor.id}.glb`||!seen.has('actors/'+lod.file))throw Error('Missing actor level: '+actor.id+'/'+level);
            if(manifest.files.find(file=>file.path==='actors/'+lod.file).sha256!==lod.revision)throw Error('Actor manifest revision mismatch: '+actor.id+'/'+level);
        }
    }
    for(const folder of ['items','environment']){
        const data=JSON.parse(fs.readFileSync(path.join(base,folder,'manifest.json'),'utf8'));
        for(const model of Array.isArray(data)?data:data.models){
            if(!['low','mid','high'].includes(model.level))throw Error('Invalid runtime model level: '+folder+'/'+model.id);
            for(const file of [model.file,model.heldFile].filter(Boolean))if(!seen.has(folder+'/'+file))throw Error('Missing runtime model: '+folder+'/'+file);
        }
    }
    const rebuilt=rebuiltModels(source,manifest.rebuilt),overrides=new Map();
    // Keep replay identities and bounds, replacing the authoring mesh with the
    // validated native Low rebuild and its shared GPU textures.
    for(const actor of actors){
        const input=rebuilt.load(actor.id,`artifacts/actor-lod-review/original/${actor.id}.glb`);
        if(input.row.sha256!==actor.lods.low.revision||input.row.originalSha256!==actor.sourceRevision)throw Error('Actor is not from the published native rebuild: '+actor.id);
        const packed=packageGLB(input.bytes,input.file,`actors/low/${actor.id}.glb`,overrides,undefined,source,input.images);
        actor.model={...actor.lods.low,...packed,triangles:input.row.triangles};delete actor.lods;
    }
    const actorBytes=Buffer.from(JSON.stringify(actors,null,2));
    overrides.set('actors/manifest.json',actorBytes);
    const playerFiles=actors.some(actor=>actor.group==='characters')?playerAnimationFiles():new Set();
    for(const file of playerFiles)if(!seen.has(file))throw Error('Missing player animation dependency: '+file);
    if(playerFiles.size) {
        overrides.set('player-animations/hands.json',prepareHands(source));
        prepareFirstPerson(source,rebuilt,overrides);
    }
    const props=prepareProps(source,manifest.files,relative=>fs.readFileSync(path.join(base,relative)),rebuilt);
    for(const [file,data] of props.output)overrides.set(file,data);
    if (JSON.parse(overrides.get('environment/manifest.json')).models.length)
        prepareTerminal(source,rebuilt,overrides,JSON.parse(overrides.get('environment/manifest.json')),packageGLB,readGLB,writeGLB);
    prepareArtifacts(source,rebuilt,overrides,JSON.parse(overrides.get('items/manifest.json')));
    const selected={...manifest,files:props.files.filter(file=>!file.path.startsWith('actors/')&&!file.path.startsWith('details/')&&(!file.path.startsWith('player-animations/')||playerFiles.has(file.path))&&!overrides.has(file.path)).concat([...overrides].map(([file,data])=>({path:file,bytes:data.length,sha256:hash(data)}))).map(file=>
        file.path==='actors/manifest.json'?{...file,bytes:actorBytes.length,sha256:hash(actorBytes)}:file)};
    return {base,manifest:selected,overrides};
}
function install(source,destination){
    const {base,manifest,overrides}=inspect(source);
    destination=path.resolve(destination);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    const staging=fs.mkdtempSync(path.join(path.dirname(destination),'model-import-'));
    try{
        for(const file of manifest.files){
            const data=overrides.get(file.path)??fs.readFileSync(path.join(base,file.path));
            if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Resource changed while staging: '+file.path);
            const output=path.join(staging,file.path);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data);
        }
        // Every input passed before any live resource changes. Files are replaced atomically.
        for(const folder of roots){
            const directory=path.join(destination,folder);
            if(fs.existsSync(directory)){
                function verify(directory){
                    if(!fs.realpathSync(directory).startsWith(destination+path.sep))throw Error('Runtime directory leaves destination: '+directory);
                    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
                        if(entry.isSymbolicLink())throw Error('Runtime resources cannot contain links: '+entry.name);
                        if(entry.isDirectory())verify(path.join(directory,entry.name));
                    }
                }
                verify(directory);
            }
        }
        for(const file of manifest.files){
            const output=path.join(destination,file.path);fs.mkdirSync(path.dirname(output),{recursive:true});fs.renameSync(path.join(staging,file.path),output);
        }
        const files=new Set(manifest.files.map(file=>file.path));
        function clean(directory){
            for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
                const file=path.join(directory,entry.name);
                if(entry.isDirectory())clean(file);
                else if(!files.has(path.relative(destination,file).split(path.sep).join('/')))fs.unlinkSync(file);
            }
        }
        for(const folder of roots){const directory=path.join(destination,folder);if(fs.existsSync(directory))clean(directory);}
        fs.writeFileSync(path.join(staging,'receipt.json'),JSON.stringify(manifest,null,2));
        fs.renameSync(path.join(staging,'receipt.json'),path.join(destination,'model-resources.json'));
    }finally{fs.rmSync(staging,{recursive:true,force:true});}
    return manifest;
}
if(require.main===module){
    const args=process.argv.slice(2),check=args.includes('--check');
    const filtered=args.filter(a=>a!=='--check');
    if(filtered.length!==2||filtered[0]!=='--source')throw Error('Usage: node Tools/import-model-resources.cjs --source <model-site-repository> [--check]');
    const source=path.resolve(filtered[1]);
    const manifest=check?inspect(source).manifest:install(source,path.resolve(__dirname,'../Viewer/assets/assets'));
    console.log(JSON.stringify({checked:manifest.files.length,installed:!check,bytes:manifest.files.reduce((sum,file)=>sum+file.bytes,0)}));
}
module.exports={inspect,install,playerAnimationFiles};
