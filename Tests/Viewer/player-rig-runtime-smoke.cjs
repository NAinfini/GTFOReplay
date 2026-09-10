// Validate the current Low skins and actual Viewer animation modules in Electron.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'artifacts/tests/player-rig');
require('./prepare-player-rig-smoke.cjs');
app.setPath('userData',fs.mkdtempSync(path.join(output,'electron-data-')));
let server;
app.whenReady().then(async()=>{
    server=http.createServer((req,res)=>{
        const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
        const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.ktx2':'image/ktx2'};
        res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const win=new BrowserWindow({show:false,width:1200,height:1000,webPreferences:{backgroundThrottling:false}}),errors=[];
    win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
    await win.loadURL('http://127.0.0.1:'+server.address().port+'/artifacts/tests/player-rig/index.html');
    const result=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=Date.now(),timer=setInterval(()=>{if(window.testResult){clearInterval(timer);resolve(window.testResult)}else if(Date.now()-start>120000){clearInterval(timer);reject(Error('Player rig test timed out'))}},100)})`);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors},null,2));
    if(result.passed){const png=await win.webContents.executeJavaScript('window.playerReview.renderer.domElement.toDataURL("image/png")');fs.writeFileSync(path.join(output,'grip.png'),Buffer.from(png.split(',')[1],'base64'))}
    console.log(JSON.stringify({...result,errors}));server.close();app.exit(result.passed&&!errors.length?0:1);
}).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:String(error.stack||error)}));server?.close();app.exit(1)});
