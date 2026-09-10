// Translate native MLS texture channels to opaque glTF PBR for prepared Low meshes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function convert(source,material,supplements) {
    const sharp=require(path.join(source,'Tools/Models/Optimization/node_modules/sharp'));
    const provenance=[];
    async function pixels(slot) {
        const identity=material.textures[slot]?.source;
        if(!identity)return;
        const stem=`${identity.file.replace(/\.assets$/,'')}-${identity.pathId}`;
        const relative=supplements.find(file=>file.endsWith(`/textures/${stem}.json`));
        if(!relative)throw Error(`Missing native MLS texture: ${material.source.name}/${slot}`);
        const metadata=JSON.parse(fs.readFileSync(path.join(source,relative)));
        const png=metadata.files.find(file=>file.file.endsWith('.png'));
        const file=path.resolve(source,png.file);
        if(!file.startsWith(path.resolve(source)+path.sep))throw Error('MLS texture leaves model project');
        const bytes=fs.readFileSync(file);
        if(hash(bytes)!==png.sha256)throw Error('Changed native MLS texture: '+png.file);
        provenance.push({slot,file:png.file,sha256:png.sha256});
        return sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    }
    const albedo=await pixels('_MainTex'),mask=await pixels('_MaskTex');
    async function encode(input,channels) {
        const rgb=Buffer.alloc(input.info.width*input.info.height*3);
        for(let i=0,j=0;i<input.data.length;i+=4,j+=3)channels(input.data,i,rgb,j);
        // Drop MLS alpha BEFORE resizing: filtering RGBA would premultiply its
        // layer mask into RGB and erase soil colors where the mask is zero.
        return sharp(rgb,{raw:{width:input.info.width,height:input.info.height,channels:3}})
            .resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toBuffer();
    }
    const result={provenance};
    if(albedo)result.albedo=(await encode(albedo,(src,i,dst,j)=>{dst[j]=src[i];dst[j+1]=src[i+1];dst[j+2]=src[i+2];})).toString('base64');
    // Native MSO: R metal, G smoothness, B occlusion. glTF ORM: R occlusion,
    // G roughness (1 - smoothness), B metal. These are linear data channels.
    if(mask)result.orm=(await encode(mask,(src,i,dst,j)=>{dst[j]=src[i+2];dst[j+1]=255-src[i+1];dst[j+2]=src[i];})).toString('base64');
    return result;
}
if(require.main===module) {
    const {source,material,supplements}=JSON.parse(fs.readFileSync(0,'utf8'));
    convert(source,material,supplements).then(result=>process.stdout.write(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={convert};
