const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'Viewer/assets/src/profiles/vanilla');
const ts=require(path.join(root,'Viewer/assets/node_modules/typescript'));
const output=path.join(root,'artifacts/tests/native-items');
fs.mkdirSync(output,{recursive:true});
const sources={
    'nativeItem.js':'renderer/models/prebuilt/nativeItem.ts',
    'catalog.js':'library/nativeItemCatalog.ts',
    'items.js':'renderer/models/items.ts',
    'model.js':'library/models/lib.ts',
    'modelloader.js':'library/modelloader.ts',
    'modelMaterials.js':'library/modelMaterials.ts',
    'basicModel.js':'renderer/models/basicModel.ts',
    'constants.js':'library/constants.ts',
    'objectwrapper.js':'renderer/objectwrapper.ts'
};
for(const [file,source] of Object.entries(sources)){
    let text=fs.readFileSync(path.join(base,source),'utf8')
        .replaceAll('@esm/three','three')
        .replaceAll('@esm/@root/replay/model-loader.js','/Viewer/assets/build/replay/model-loader.js')
        .replaceAll('../../../library/modelloader.js','./modelloader.js')
        .replaceAll('../../../library/modelMaterials.js','./modelMaterials.js')
        .replaceAll('@esm/@root/replay/moduleloader.js','./moduleloader.js')
        .replaceAll('../../../library/nativeItemCatalog.js','./catalog.js')
        .replaceAll('../items.js','./items.js')
        .replaceAll('../basicModel.js','./basicModel.js')
        .replaceAll('../../library/constants.js','./constants.js')
        .replaceAll('../../library/models/lib.js','./model.js')
        .replaceAll('../../renderer/objectwrapper.js','./objectwrapper.js')
        .replaceAll('../items/','/Viewer/assets/assets/items/');
    fs.writeFileSync(path.join(output,file),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
fs.writeFileSync(path.join(output,'moduleloader.js'),'export const disposals=[];export const ModuleLoader={registerDispose:handler=>disposals.push(handler),reportWarning:message=>{throw Error(message)}};');
fs.copyFileSync(path.join(__dirname,'native-item-smoke.html'),path.join(output,'index.html'));
console.log('Prepared native item runtime checks at /artifacts/tests/native-items/index.html');
