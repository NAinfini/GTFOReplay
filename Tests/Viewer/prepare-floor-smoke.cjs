const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'../..'), ts=require('../../Viewer/assets/node_modules/typescript');
const output=path.join(root,'artifacts/tests/floors');fs.mkdirSync(output,{recursive:true});
const base=path.join(root,'Viewer/assets/src/profiles/vanilla');
for(const [input,name] of [['renderer/map/map.ts','map'],['library/floor-themes.ts','themes'],['library/factory.ts','factory']]) {
    let source=fs.readFileSync(path.join(base,input),'utf8');
    source=source.replaceAll('@esm/@root/replay/moduleloader.js','./loader.js').replaceAll('../../library/factory.js','./factory.js').replaceAll('../../library/floor-themes.js','./themes.js');
    source=source.replaceAll('../environment/floors/','/Viewer/assets/assets/environment/floors/');
    fs.writeFileSync(path.join(output,name+'.js'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
fs.writeFileSync(path.join(output,'loader.js'),`export const passes={init:[],loop:[],dispose:[]}; export const ModuleLoader={registerRender(name,register){register(name,{getInitPasses:()=>passes.init,setInitPasses:v=>passes.init=v,getRenderLoop:()=>passes.loop,setRenderLoop:v=>passes.loop=v})},registerDispose(fn){passes.dispose.push(fn)}};`);
fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Recorded floor material check</title><style>body{margin:0;background:#15191d;color:#e6e9ec;font:16px system-ui}p{position:absolute;top:0;left:20px;max-width:1000px}canvas{display:block}</style><p id="status">Loading actual recorded-floor renderer: unknown, mining, storage, tech, service, gardens lab, gardens forest, desert, refinery, dig-site, jungle, tech lab, mixed gardens.</p>
<script type="importmap">{"imports":{"@esm/three":"/Viewer/assets/node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from '@esm/three';import {passes} from './loader.js';import './map.js';
const scene=new THREE.Scene(),data=new Map([['NativeSurfaces',{navigationReady:true}]]),headers=new Map(),geometry=[];
for(let theme=0;theme<=12;theme++){const x=(theme%4)*5,z=Math.floor(theme/4)*5;geometry.push({vertices:new Float32Array([x,0,z,x+4,0,z,x+4,0,z+4,x,0,z+4]),indices:[0,2,1,0,3,2],themes:new Uint8Array([theme,theme])})}
headers.set('Vanilla.Map.Geometry',new Map([[0,geometry]]));
const api={scene,set:(k,v)=>data.set(k,v),get:k=>data.get(k),getOrDefault(k,create){if(!data.has(k))data.set(k,create());return data.get(k)}};
const header={getOrDefault(k,create){if(!headers.has(k))headers.set(k,create());return headers.get(k)}};
const gpu=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});gpu.setSize(innerWidth,innerHeight);gpu.setClearColor(0x20272d);document.body.appendChild(gpu.domElement);
const aspect=innerWidth/innerHeight,camera=new THREE.OrthographicCamera(-14*aspect,14*aspect,14,-14,.1,100);camera.position.set(25,28,32);camera.lookAt(9,0,9);
scene.add(new THREE.AmbientLight(0xffffff,.9));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(4,20,8);scene.add(sun);
try{for(const p of passes.init)p.pass(api,header);let frames=0;const started=performance.now();
function draw(){try{for(const p of passes.loop)p.pass(api);gpu.render(scene,camera);const meshes=[...data.get('Maps').values()].flat();if(meshes.some(m=>m.parent||m.visible))throw Error('Picking geometry entered the scene');if(![...data.get('NavigationFallback').values()].flat().every(m=>m.visible&&m.parent===scene))throw Error('Missing native models lost fallback floors');if(!window.testResult){window.testResult={passed:true,themes:13,drawCalls:gpu.info.render.calls,triangles:gpu.info.render.triangles};document.querySelector('#status').textContent='PASS: missing native models retain default floors for every recorded theme.'}if(++frames<240)requestAnimationFrame(draw)}catch(error){window.testResult={passed:false,error:String(error)};document.querySelector('#status').textContent=String(error);console.error(error)}}draw();
window.disposeFloorCheck=()=>{for(const dispose of passes.dispose)dispose(api);return {remaining:scene.children.filter(o=>o.isMesh).length}};
}catch(error){window.testResult={passed:false,error:String(error)};document.querySelector('#status').textContent=String(error);console.error(error)}
</script>`);
console.log('Prepared actual floor renderer check at /artifacts/tests/floors/index.html');
