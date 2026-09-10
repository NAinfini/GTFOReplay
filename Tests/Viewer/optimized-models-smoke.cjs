// Run with Electron and a packaged resources/app path. Uses the shipped decoders.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../..');
const appDir = path.resolve(process.argv[2] || path.join(root, 'Viewer/electron/build'));
const output = path.join(root, 'artifacts/tests/optimized-models');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'user-data-')));
let window, server, timeout;
const imports = fs.readFileSync(path.join(appDir, 'assets/main/main.html'), 'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const page = `<!doctype html><base href="/assets/main/"><style>body{margin:0;background:#20282b;color:white;font:16px system-ui}p{position:absolute;top:0;left:20px}</style>${imports}<p id="status"></p><script type="module">
import * as T from 'three';
import {modelLoader,configureModelLoader} from '../replay/model-loader.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1100,800);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
configureModelLoader(renderer);
const scene=new T.Scene();scene.background=new T.Color('#20282b');
scene.add(new T.HemisphereLight(0xe5edff,0x6e6354,2));
const light=new T.DirectionalLight(0xffffff,3);light.position.set(3,5,4);scene.add(light);
const camera=new T.PerspectiveCamera(35,1100/800,.001,10000);
const status=document.querySelector('#status'),assert=(value,message)=>{if(!value)throw Error(message)};
const receipt=await (await fetch('../model-resources.json')).json();
const files=receipt.files.filter(row=>row.path.endsWith('.glb'));
const result={passed:false,files:files.length,loaded:0,meshes:0,skins:0,clips:0,compressedTextures:0};
try {
 for(const row of files){
  status.textContent=row.path;
  const gltf=await modelLoader.loadAsync('../'+row.path),model=gltf.scene;
  scene.add(model);model.updateMatrixWorld(true);
  const meshes=[],geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  model.traverse(object=>{if(!object.isMesh)return;meshes.push(object);geometries.add(object.geometry);
   if(object.skeleton)skeletons.add(object.skeleton);
   for(const material of [].concat(object.material)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
  });
  const mixer=new T.AnimationMixer(model);
  for(const clip of gltf.animations){mixer.stopAllAction();mixer.clipAction(clip).play();mixer.setTime(clip.duration*.5);model.updateMatrixWorld(true);
   model.traverse(object=>assert(object.matrixWorld.elements.every(Number.isFinite),row.path+' invalid animated transform'));
  }
  mixer.stopAllAction();mixer.uncacheRoot(model);model.updateMatrixWorld(true);
  for(const mesh of meshes){const positions=mesh.geometry.getAttribute('position');assert(positions?.count,row.path+' has empty geometry');
   for(let i=0;i<positions.count;i++)assert(Number.isFinite(positions.getX(i))&&Number.isFinite(positions.getY(i))&&Number.isFinite(positions.getZ(i)),row.path+' invalid decoded vertex');
  }
  if(meshes.length){const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
   assert([...center,...size].every(Number.isFinite)&&size.length()>0,row.path+' invalid bounds');
   const extent=Math.max(size.x,size.y,size.z,.1);camera.near=Math.max(.001,extent/1000);camera.far=extent*100;camera.updateProjectionMatrix();
   camera.position.copy(center).add(new T.Vector3(extent*.4,extent*.2,extent*2.1));camera.lookAt(center);renderer.render(scene,camera);
   assert(renderer.info.render.calls>0,row.path+' has no draw calls');result.meshes++;
   const capture={
    'actors/low/bishop.glb':'bishop',
    'items/low/power-cell.glb':'power-cell',
    'environment/low/spitter.glb':'spitter',
    'environment/low/weak-door-8x4.glb':'weak-door-8x4',
    'environment/low/security-door-8x4.glb':'security-door-8x4'
   }[row.path];
   if(capture){
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    console.log('CAPTURE:'+capture);
    await new Promise(resolve=>setTimeout(resolve,150));
   }
  }
  result.skins+=skeletons.size;result.clips+=gltf.animations.length;result.compressedTextures+=[...textures].filter(t=>t.isCompressedTexture).length;
  scene.remove(model);for(const value of geometries)value.dispose();for(const value of materials)value.dispose();for(const value of textures)value.dispose();for(const value of skeletons)value.dispose();
  result.loaded++;if(result.loaded%50===0)console.log('PROGRESS:'+result.loaded+'/'+files.length);
 }
 assert(result.compressedTextures>0,'No compressed textures were decoded');
 result.passed=true;
}catch(error){result.error=String(error.stack||error);}
window.testResult=result;console.log('RESULT:'+JSON.stringify(result));
</script>`;
app.whenReady().then(() => {
    server=http.createServer((request,response)=>{
        if(request.url==='/test'){response.setHeader('Content-Type','text/html');response.end(page);return;}
        const file=path.resolve(appDir,'.'+decodeURIComponent(request.url.split('?')[0]));
        if(!file.startsWith(appDir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
        const types={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.ktx2':'image/ktx2'};
        response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
        fs.createReadStream(file).pipe(response);
    }).listen(0,'127.0.0.1',()=>{
        window=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}});
        const failures=[];
        window.webContents.on('console-message',async(_event,level,message)=>{
            if(level>=2&&!message.includes('Electron Security Warning'))failures.push(message);
            if(message.startsWith('PROGRESS:'))console.log(message);
            if(message.startsWith('CAPTURE:'))fs.writeFileSync(path.join(output,message.slice(8)+'.png'),(await window.capturePage()).toPNG());
            if(!message.startsWith('RESULT:'))return;
            const result=JSON.parse(message.slice(7));result.consoleErrors=failures;result.passed&&=failures.length===0;
            fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
            clearTimeout(timeout);server.close();app.exit(result.passed?0:1);
        });
        window.loadURL('http://127.0.0.1:'+server.address().port+'/test');
        timeout=setTimeout(()=>{console.error('Optimized model test timed out');server.close();app.exit(1);},240000);
    });
});
