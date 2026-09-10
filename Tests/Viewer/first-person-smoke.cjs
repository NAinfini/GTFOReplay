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
        // This suite owns FPS acceptance; use the shared scene setup without
        // running the independent third-person acceptance suite first.
        if (!error && file.endsWith(path.join('player-rig','index.html'))) {
            const html=data.toString(),start=html.indexOf(' let samples=0,'),end=html.indexOf(' renderer.setAnimationLoop(');
            data=Buffer.from(html.slice(0,start)+" window.playerReview={model,scene,camera,renderer,controls,player,pose,equip,gear};window.testResult={passed:true};\n"+html.slice(end));
        }
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
        const {ASL_VM:vm}=await import('../replay/vm.js');
        const {FirstPersonModel}=(await vm.load('../profiles/vanilla/renderer/player/first-person.js')).exports;
        const {model,player,pose,equip,gear,camera,renderer,controls}=window.playerReview;
        renderer.setAnimationLoop(null);controls.enabled=false;
        const fp=new FirstPersonModel();await Promise.all(fp.actors.map(actor=>actor.ready));
        const {meleeGrips}=await (await fetch('../player-animations/rig.json')).json();
        const triangles=fp.actors.reduce((sum,actor)=>sum+actor.active.meshes.reduce((n,{mesh})=>n+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,0),0);
        if(!Number.isFinite(triangles)||triangles<=0)throw Error('Missing first-person garment geometry');
        const samples=[];
        const neutral={state:'stand',isDowned:false,meleeCharging:false,isReloading:false,lastMeleeChargingTransition:-Infinity,lastSwingTime:-Infinity,lastShoveTime:-Infinity,lastReloadTransition:-Infinity,reloadDurationInSeconds:0,lastShot:-Infinity};
        for(const slot of [0,1,2,3])for(const weapon of ['Assault Rifle','Pistol','Hel Revolver','Shotgun','Sniper','Hel Rifle','Sawed Off','Hacking Tool','Knife','Hammer','Spear','Bat']) {
            fp.release();player.slot=slot;const index=gear.findIndex(([,data])=>data.name===weapon);if(index<0)throw Error('Unknown weapon '+weapon);await equip(index);
            for(const action of ['idle','charge','swing','shove','reload','reload-0.05','reload-0.2','reload-0.5','reload-0.75','reload-0.95','recoil']) {
                fp.release();model.firstPerson=true;pose('idle');
                const anim={...neutral};const time=10000;
                if(action==='recoil')anim.lastShot=time-90;
                if(action==='charge'){anim.meleeCharging=true;anim.lastMeleeChargingTransition=time-500;}
                if(action==='swing'){anim.lastSwingTime=time-250;anim.chargedSwing=true;}
                if(action==='shove')anim.lastShoveTime=time-250;
                if(action.startsWith('reload')){const progress=action==='reload'?.35:Number(action.slice(7));anim.isReloading=true;anim.lastReloadTransition=time-progress*2000;anim.reloadDurationInSeconds=2;}
                const item=model.firstPersonItem;
                item.model.root.updateMatrix();
                const equippedMatrix=item.model.root.matrix.clone(),equippedParent=item.model.root.parent;
                fp.render(time,1280/845,anim,item.model,item.name,item.melee);
                renderer.render(fp.scene,fp.camera);
                const nativeGrip=item.melee?meleeGrips[item.melee].right:item.model.rightHandGrip;
                const offset=item.model.view?.wristOffsets;
                const gripPosition=nativeGrip?new T.Vector3().copy(nativeGrip.pos):undefined;
                if(gripPosition&&offset)gripPosition.add(new T.Vector3().fromArray(offset.right.position).divideScalar(item.model.nativeScale).applyQuaternion(nativeGrip.rot));
                const gripError=gripPosition?item.model.root.localToWorld(gripPosition).distanceTo(fp.skeleton.joints.rightHand.getWorldPosition(new T.Vector3())):0;
                if(gripError>.0001)throw Error('Floating FPS weapon: '+weapon+'/'+action+' '+gripError);
                const nativeScale=!item.melee&&item.model.reloadAnimation?item.model.nativeScale:1;
                if(item.model.root.scale.distanceTo(new T.Vector3(nativeScale,nativeScale,nativeScale))>.0001)throw Error('FPS weapon did not preserve authored part size: '+weapon);
                const support=item.melee?(item.melee==='hammer'||item.melee==='spear'?item.model.root.localToWorld(new T.Vector3().copy(meleeGrips[item.melee].left.pos)):undefined):item.model.leftHand?.getWorldPosition(new T.Vector3());
                if(support&&offset)support.add(new T.Vector3().fromArray(offset.left.position).applyQuaternion(item.model.leftHand.getWorldQuaternion(new T.Quaternion())));
                const supportError=support?support.distanceTo(fp.skeleton.joints.leftHand.getWorldPosition(new T.Vector3())):0;
                if(supportError>.0001)throw Error('FPS support hand missed grip: '+weapon+'/'+action+' '+supportError);
                // Check the rendered glove, not just the invisible IK driver.
                for(const actor of fp.actors)for(const {bone,joint,rest} of actor.active.rig.bones.filter(b=>b.joint==='rightHand'||b.joint==='leftHand')) {
                    const actual=bone.matrixWorld.clone().multiply(rest.clone().invert()).multiply(actor.reference.get(joint).clone().invert());
                    const error=new T.Vector3().setFromMatrixPosition(actual).distanceTo(fp.skeleton.joints[joint].getWorldPosition(new T.Vector3()));
                    if(error>.0001)throw Error('FPS skin missed wrist: '+weapon+'/'+action+'/'+joint+' '+error);
                }
                const fingers=new Set(fp.actors[1].active.rig.bones.filter(b=>/Thumb|Index|Middle|Ring|Pinky/.test(b.bone.name)).map(b=>b.joint));
                if(fingers.size!==30)throw Error('Missing FPS finger bones');
                const point=new T.Vector3();let projected=0,vertices=0,armLeft=Infinity;
                for(const actor of fp.actors) {
                    if(!actor.loaded)throw Error('FPS actor failed to load');
                    for(const {mesh} of actor.active.meshes){
                        if(!mesh.material.map)throw Error('Untextured FPS arms');
                        mesh.skeleton?.update();
                        for(let i=0;i<mesh.geometry.attributes.position.count;i++){
                            mesh.getVertexPosition(i,point);mesh.localToWorld(point);point.project(fp.camera);vertices++;
                            if(![point.x,point.y,point.z].every(Number.isFinite))throw Error('Invalid skinned vertex');
                            if(Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1){projected++;armLeft=Math.min(armLeft,point.x);}
                        }
                    }
                }
                if(!projected && !item.melee)throw Error('FPS arms outside view: '+weapon+'/'+action+' '+JSON.stringify({bounds:fp.actors.map(a=>new T.Box3().setFromObject(a.active.scene,true)),hands:['rightHand','leftHand'].map(k=>fp.skeleton.joints[k].getWorldPosition(new T.Vector3())),roots:fp.actors.map(a=>a.active.scene.children.map(c=>({name:c.name,p:c.position.toArray()})))}));
                let gunBounds;
                if(!item.melee&&item.model.reloadAnimation){
                    const bounds=new T.Box3();
                    let visibleLeft=Infinity;
                    item.model.root.traverse(mesh=>{
                        if(!mesh.isMesh || !mesh.visible)return;
                        for(let i=0;i<mesh.geometry.attributes.position.count;i++){
                            mesh.getVertexPosition(i,point);mesh.localToWorld(point);
                            // A first-person stock can extend behind the eye.
                            // Perspective division there reverses its screen side.
                            point.applyMatrix4(fp.camera.matrixWorldInverse);
                            if(point.z>=-fp.camera.near)continue;
                            point.applyMatrix4(fp.camera.projectionMatrix);bounds.expandByPoint(point);
                            // A magazine below the viewport cannot obstruct its centre.
                            if(point.y>=-1&&point.y<=1)visibleLeft=Math.min(visibleLeft,point.x);
                        }
                    });
                    gunBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
                    if(action==='idle'&&bounds.max.y<-.45)throw Error('FPS firearm sits too low in the viewport: '+weapon+' '+bounds.max.y);
                    const direction=new T.Vector3(0,0,1).applyQuaternion(item.model.root.getWorldQuaternion(new T.Quaternion()));
                    // Native reloads intentionally tilt the weapon. Judge the
                    // ready pose separately from its authored action trajectory.
                    if(action==='idle'&&direction.z>-.95)throw Error('FPS ready barrel does not face forward: '+weapon);
                    if(action==='idle'&&armLeft<-.01)throw Error('FPS arm crosses vertical centre: '+weapon+'/'+action+' '+armLeft);
                    for(const aspect of action==='idle'?[4/3,16/9,21/9]:[]){
                        const left=visibleLeft*(1280/845)/aspect;
                        if(left<0 || bounds.max.y>.001 || bounds.min.z< -1 || bounds.max.z>1)
                            throw Error('FPS firearm obstructs central view or clips: '+weapon+'/'+action+'/'+aspect+' '+JSON.stringify(gunBounds));
                        if(left>=1 || bounds.max.y<=-1)throw Error('FPS firearm outside viewport: '+weapon);
                    }
                }
                const png=slot===0?renderer.domElement.toDataURL():undefined;
                let sidePng;
                if(slot===0&&action==='idle'&&!item.melee&&item.model.reloadAnimation){
                    fp.camera.position.set(.85,-.1,-.4);fp.camera.lookAt(.1,-.24,-.45);
                    renderer.render(fp.scene,fp.camera);sidePng=renderer.domElement.toDataURL();
                    fp.camera.position.set(0,0,0);fp.camera.quaternion.identity();
                }
                samples.push({slot,weapon:weapon+'-'+action,projected,vertices,gripError,supportError,gunBounds,png,sidePng});
                fp.release();item.model.root.updateMatrix();
                if(item.model.root.parent!==equippedParent||item.model.root.matrix.elements.some((value,i)=>Math.abs(value-equippedMatrix.elements[i])>.000001))throw Error('FPS placement leaked into the world model: '+weapon+'/'+action);
            }
            fp.release();if(fp.pass.enabled)throw Error('FPS overlay did not close');
            model.firstPerson=false;pose('idle');
            if(model.actor.active.meshes.some(part=>part.mesh.visible!==part.visible))throw Error('Third person was not restored');
        }
        // Attack recovery must converge to idle and be independent of seek order.
        fp.release();await equip(gear.findIndex(([,data])=>data.name==='Hammer'));
        const packageData=await (await fetch('../player-animations/first-person.json')).json();
        const duration=packageData.clips.hammerRelease.duration, item=model.firstPersonItem;
        const sampleAt=seconds=>{fp.release();pose('idle');fp.render(10000+seconds*1000,1280/845,{...neutral,lastSwingTime:10000,chargedSwing:true},item.model,item.name,item.melee);fp.scene.updateMatrixWorld(true);return fp.skeleton.joints.rightHand.getWorldPosition(new T.Vector3())};
        const late=sampleAt(duration-.001),idle=sampleAt(duration+.001);
        if(late.distanceTo(idle)>.01)throw Error('Melee recovery snaps instead of fading to idle');
        const middle=sampleAt(duration*.5);sampleAt(0);const repeated=sampleAt(duration*.5);
        if(middle.distanceTo(repeated)>.0001)throw Error('Melee pose depends on seek order');
        fp.dispose();
        return samples;
    })()`);
    for (const sample of poses) {
        if(sample.png) fs.writeFileSync(path.join(output, `${sample.slot}-${sample.weapon.replaceAll(' ', '-')}.png`), Buffer.from(sample.png.split(',')[1], 'base64'));
        if(sample.sidePng) fs.writeFileSync(path.join(output, `${sample.slot}-${sample.weapon.replaceAll(' ', '-')}-side.png`), Buffer.from(sample.sidePng.split(',')[1], 'base64'));
        delete sample.png; delete sample.sidePng;
    }
    if (poses.filter(sample => /Assault Rifle|Hacking Tool/.test(sample.weapon)).some(sample => !sample.projected)) throw Error('Hands are outside the view');
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
