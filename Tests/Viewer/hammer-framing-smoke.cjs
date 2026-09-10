// Run with Viewer/electron/node_modules/.bin/electron after build-assets.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/tests/hammer-framing');
fs.mkdirSync(output, { recursive: true });
// Reuse only the asset/rig fixture bootstrap; this test measures FPS framing,
// independently of the third-person grip acceptance suite.
const fixture=fs.readFileSync(path.join(__dirname,'player-rig-smoke.html'),'utf8');
const imports=fs.readFileSync(path.join(root,'Viewer/assets/src/main/main.html'),'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
fs.writeFileSync(path.join(output,'index.html'),fixture.slice(0,fixture.indexOf(' let samples=0')).replace('<!-- IMPORTS -->',imports)+'window.playerReview={model,player,pose,equip,gear,camera,renderer,controls};window.testResult={passed:true};}catch(error){fail(error)}</script>');

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
    await win.loadURL(base + '/artifacts/tests/hammer-framing/index.html');
    const rig = await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const timer=setInterval(()=>{if(window.testResult){clearInterval(timer);window.testResult.passed?resolve(window.testResult):reject(Error(window.testResult.error))}},100);
    })`);
    const result = await win.webContents.executeJavaScript(`(async()=>{
        const T=await import('three');
        const {ASL_VM:vm}=await import('../replay/vm.js');
        const {FirstPersonModel}=(await vm.load('../profiles/vanilla/renderer/player/first-person.js')).exports;
        const {model,player,pose,equip,gear,renderer,controls}=window.playerReview;
        renderer.setAnimationLoop(null);controls.enabled=false;
        const fp=new FirstPersonModel();await Promise.all(fp.actors.map(actor=>actor.ready));
        fp.scene.background=new T.Color(0x00ff00);
        const target=new T.WebGLRenderTarget(640,360),pixels=new Uint8Array(640*360*4);
        const neutral={state:'stand',isDowned:false,meleeCharging:false,isReloading:false,lastMeleeChargingTransition:-Infinity,lastSwingTime:-Infinity,lastShoveTime:-Infinity,lastReloadTransition:-Infinity,reloadDurationInSeconds:0,lastShot:-Infinity};
        await equip(gear.findIndex(([,data])=>data.name==='Hammer'));
        const clipData=await (await fetch('../player-animations/first-person.json')).json();
        const samples=[],images=[];
        function measure(){
            renderer.setRenderTarget(target);renderer.render(fp.scene,fp.camera);renderer.readRenderTargetPixels(target,0,0,640,360,pixels);renderer.setRenderTarget(null);
            let covered=0,center=0;
            for(let y=0;y<360;y++)for(let x=0;x<640;x++){
                const i=(y*640+x)*4,hit=!(pixels[i]<20&&pixels[i+1]>230&&pixels[i+2]<20);
                if(hit){covered++;if(x>=192&&x<448&&y>=108&&y<252)center++;}
            }
            return {total:covered/(640*360),center:center/(256*144)};
        }
        for(const action of ['Idle','Charge','Hit','Release','Push'])for(let frame=0;frame<=20;frame++){
            fp.release();model.firstPerson=true;pose('idle');
            const time=10000,anim={...neutral},elapsed=frame/20*(clipData.clips['hammer'+action].duration-.001)*1000;
            if(action==='Charge'){anim.meleeCharging=true;anim.lastMeleeChargingTransition=time-elapsed;}
            if(action==='Hit'||action==='Release'){anim.lastSwingTime=time-elapsed;anim.chargedSwing=action==='Release';}
            if(action==='Push')anim.lastShoveTime=time-elapsed;
            const item=model.firstPersonItem;fp.render(time,16/9,anim,item.model,item.name,item.melee);
            const position=fp.camera.position.clone(),after=measure();
            if(frame===10&&['Charge','Release'].includes(action)){
                renderer.render(fp.scene,fp.camera);images.push({action,png:renderer.domElement.toDataURL()});
            }
            fp.camera.position.set(0,0,0);const before=measure();fp.camera.position.copy(position);
            samples.push({action,frame,before,after});
        }
        const peak=key=>Math.max(...samples.map(s=>s[key].total));
        const center=key=>Math.max(...samples.map(s=>s[key].center));
        // The view model must never move the eye, and the sampled third-person attack
        // clips must not let the raised weapon cover the view.
        const steadyEye=samples.every(sample=>sample.before.total===sample.after.total&&sample.before.center===sample.after.center);
        const passed=steadyEye&&peak('after')<=.35&&center('after')<=.25;
        fp.release();await equip(gear.findIndex(([,data])=>data.name==='Assault Rifle'));model.firstPerson=true;pose('idle');
        const item=model.firstPersonItem;fp.render(10000,16/9,neutral,item.model,item.name,item.melee);
        if(fp.camera.position.lengthSq()!==0)throw Error('Hammer framing leaked to firearms');
        fp.dispose();target.dispose();
        return {passed,peakBefore:peak('before'),peakAfter:peak('after'),centerBefore:center('before'),centerAfter:center('after'),samples,images};
    })()`);
    for(const image of result.images)fs.writeFileSync(path.join(output,image.action+'.png'),Buffer.from(image.png.split(',')[1],'base64'));
    delete result.images;
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({passed:result.passed,peakBefore:result.peakBefore,peakAfter:result.peakAfter,centerBefore:result.centerBefore,centerAfter:result.centerAfter}));
    clearTimeout(watchdog);server.close();app.exit(result.passed?0:1);
}).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:String(error.stack||error)},null,2));console.error(error);server.close();app.exit(1);});
