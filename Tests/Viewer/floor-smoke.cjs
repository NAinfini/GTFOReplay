// Run with Electron after prepare-floor-smoke.cjs and the local model server.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'artifacts/tests/floors');
app.setPath('userData',path.join(output,'electron-data'));
const errors=[];
const finish=(passed,result)=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed,result,errors},null,2));app.exit(passed?0:1)};
const timeout=setTimeout(()=>finish(false,'Floor renderer check timed out.'),45000);
app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:1400,height:1100,webPreferences:{backgroundThrottling:false}});
    win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
    await win.loadURL('http://127.0.0.1:4320/artifacts/tests/floors/index.html');
    const result=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const start=performance.now();function check(){if(window.testResult)return resolve(window.testResult);if(performance.now()-start>20000)return reject(Error('Source swatches did not load'));requestAnimationFrame(check)}check()
    })`);
    // Thirteen independent source surfaces each retain one existing outline.
    assert.equal(result.passed,true);assert.equal(result.themes,13);assert.equal(result.drawCalls,26);assert.equal(result.triangles,26);
    const png=await win.webContents.executeJavaScript('document.querySelector("canvas").toDataURL("image/png")');
    fs.writeFileSync(path.join(output,'floors.png'),Buffer.from(png.split(',')[1],'base64'));
    const cleanup=await win.webContents.executeJavaScript('window.disposeFloorCheck()');assert.equal(cleanup.remaining,0);assert.deepEqual(errors,[]);
    clearTimeout(timeout);finish(true,{...result,cleanup});
}).catch(error=>{clearTimeout(timeout);finish(false,String(error.stack||error))});
