// Run with Viewer/electron/node_modules/.bin/electron after build-assets.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/tests/first-person');
require('./prepare-player-rig-smoke.cjs');
fs.mkdirSync(output, { recursive: true });
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
const watchdog = setTimeout(() => { console.error('First-person acceptance timed out'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false, offscreen: true } });
    const errors = [];
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
    await win.loadURL(base + '/artifacts/tests/player-rig/index.html');
    const rig = await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const timer=setInterval(()=>{if(window.testResult){clearInterval(timer);window.testResult.passed?resolve(window.testResult):reject(Error(window.testResult.error))}},100);
    })`);
    const poses = await win.webContents.executeJavaScript(`(async()=>{
        const T=await import('three');
        const {model,player,pose,equip,gear,camera,renderer,controls,scene}=window.playerReview;
        renderer.setAnimationLoop(null);controls.enabled=false;
        camera.fov=75;camera.near=.1;camera.updateProjectionMatrix();
        const samples=[];
        for(const slot of [0,1,2,3])for(const weapon of ['Assault Rifle','Hacking Tool']) {
            player.slot=slot;await equip(gear.findIndex(([,data])=>data.name===weapon));
            camera.position.set(0,1.65,0);camera.lookAt(0,1.65,1);
            model.firstPerson=true;pose('idle');
            const meshes=model.actor.active.meshes;
            const visible=meshes.filter(part=>part.mesh.visible);
            if(!visible.length || visible.some(part=>!part.arms))throw Error('Body visibility failed for '+slot);
            if(!visible.some(part=>/gloves/i.test(part.mesh.name)))throw Error('Hands are missing for '+slot);
            if(model.tmp.visible || model.backpack.visible)throw Error('Nameplate or backpack remained visible');
            const held=model.equippedItem.model.root;
            for(let node=held;node;node=node.parent)if(!node.visible)throw Error(weapon+' was hidden');
            let projected=0;const point=new T.Vector3();
            for(const {mesh} of visible) {
                mesh.skeleton?.update();
                for(let i=0;i<mesh.geometry.index.count;i+=3) {
                    mesh.getVertexPosition(mesh.geometry.index.getX(i),point);mesh.localToWorld(point);point.project(camera);
                    if(Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1)projected++;
                }
            }
            renderer.render(scene,camera);
            samples.push({slot,weapon,visible:visible.map(part=>part.mesh.name),projected,png:renderer.domElement.toDataURL('image/png')});
            model.firstPerson=false;pose('idle');
            if(meshes.some(part=>part.mesh.visible!==part.visible))throw Error('Third-person body was not restored');
        }
        return samples;
    })()`);
    for (const sample of poses) {
        fs.writeFileSync(path.join(output, `${sample.slot}-${sample.weapon.replaceAll(' ', '-')}.png`), Buffer.from(sample.png.split(',')[1], 'base64'));
        delete sample.png;
    }
    if (poses.some(sample => !sample.projected)) throw Error('Hands are outside the view: ' + JSON.stringify(poses));
    await win.loadURL(base + '/Tests/Viewer/ui-smoke.html');
    const ui = await win.webContents.executeJavaScript(`(async()=>{
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));await wait(400);
        const toggle=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='First person');
        if(!toggle()?.disabled)throw Error('First person must require a player');
        document.querySelector('.follow-field [role=combobox]').click();await wait(80);
        [...document.querySelectorAll('[role=option]')].find(o=>o.textContent==='Bishop').click();await wait(180);
        toggle().click();await wait(180);
        if(!testState.firstPerson || toggle().getAttribute('aria-pressed')!=='true')throw Error('First-person toggle failed');
        toggle().click();await wait(180);
        if(testState.firstPerson || toggle().getAttribute('aria-pressed')!=='false')throw Error('Third-person toggle failed');
        return {toggle:true,disabledWithoutPlayer:true};
    })()`);
    for (const width of [1280, 800]) {
        win.setSize(width, 900); await new Promise(resolve => setTimeout(resolve, 150));
        await win.webContents.executeJavaScript(`if(document.querySelector('.transport').scrollWidth>document.querySelector('.transport').clientWidth)throw Error('Transport overflow')`);
        fs.writeFileSync(path.join(output, `controls-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    if (errors.length) throw Error(errors.join('\n'));
    const result = { passed: true, rig, poses, ui };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); clearTimeout(watchdog); server.close(); app.exit(0);
}).catch(error => {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: false, error: String(error.stack || error) }, null, 2));
    console.error(error); server.close(); app.exit(1);
});
