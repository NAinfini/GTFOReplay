// Run with Viewer/electron/node_modules/.bin/electron after build-assets.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/tests/ground-catalog');
fs.mkdirSync(output, { recursive: true });
const selectedIds=process.argv[2]?JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')):null;
const imports=fs.readFileSync(path.join(root,'Viewer/assets/src/main/main.html'),'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
fs.writeFileSync(path.join(output,'index.html'),'<base href="/Viewer/assets/build/main/">'+imports);
app.setPath('userData', fs.mkdtempSync(path.join(output, 'user-data-')));
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
        response.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        response.end(error ? 'Not found' : data);
    });
});
const watchdog = setTimeout(() => { console.error('First-person acceptance timed out'); app.exit(1); }, 240000);
app.whenReady().then(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false, offscreen: true } });
    const errors = [];
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
    await win.loadURL(base+'/artifacts/tests/ground-catalog/index.html');
    const result=await win.webContents.executeJavaScript(`(async()=>{
        const T=await import('three');
        const {modelLoader,configureModelLoader}=await import('../replay/model-loader.js');
        const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(256,256);configureModelLoader(renderer);
        const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.01,10000);scene.add(new T.HemisphereLight(0xffffff,0x666666,2)); const fill=new T.DirectionalLight(0xffffff,.65);scene.add(fill,fill.target);
        const catalog=await (await fetch('../environment/architecture/manifest.json')).json();
        const samples=[];
        const selectedIds=${JSON.stringify(selectedIds)};
        const selected=selectedIds?catalog.models.filter(row=>selectedIds.includes(row.id)):catalog.models;
        if(selectedIds&&selected.length!==selectedIds.length)throw Error('Requested model missing from catalog');
        const images=[];
        for(const row of selected){
            const gltf=await modelLoader.loadAsync('../environment/architecture/'+row.file+'?v='+row.revision);
            scene.add(gltf.scene);
            const box=new T.Box3().setFromObject(gltf.scene),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()).length();
            if(!Number.isFinite(size)||size===0)throw Error('Invalid bounds '+row.id);
            camera.position.copy(center).add(new T.Vector3(.5,.7,1).normalize().multiplyScalar(size*1.5));camera.lookAt(center);fill.position.copy(camera.position);fill.target.position.copy(center);camera.near=Math.max(.0001,size/10000);camera.far=size*10;camera.updateProjectionMatrix();
            let textured=0,parts=0;gltf.scene.traverse(mesh=>{if(mesh.isMesh){parts++;for(const material of [].concat(mesh.material))if(material.map)textured++;}});
            if(row.kind==='floor' && textured===0)throw Error('Supporting floor has no native texture: '+row.id);
            renderer.render(scene,camera);if(!renderer.info.render.calls)throw Error('No GPU draw for '+row.id);
            samples.push({id:row.id,mesh:row.capture.mesh,kind:row.kind,parts,textured,drawCalls:renderer.info.render.calls});
            if(selectedIds || ['architecture-d11f142a7c1f3322','architecture-b3d25573114e51f3'].includes(row.id))images.push({id:row.id,data:renderer.domElement.toDataURL('image/png')});
            scene.remove(gltf.scene);gltf.scene.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const material of [].concat(mesh.material)){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}}});
        }
        renderer.dispose();return {passed:true,models:samples.length,samples,images};
    })()`);
    if(errors.length)throw Error(errors.join('\n'));
    for(const image of result.images)fs.writeFileSync(path.join(output,image.id+'.png'),Buffer.from(image.data.split(',')[1],'base64'));
    delete result.images;
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,models:result.models}));
    clearTimeout(watchdog);server.close();app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:String(error.stack||error)},null,2));console.error(error);server.close();app.exit(1);});
