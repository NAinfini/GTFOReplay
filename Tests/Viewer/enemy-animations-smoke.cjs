const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../../artifacts/tests/enemy-animations');fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'user-data-')));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1500,height:1640,webPreferences:{backgroundThrottling:false}}),errors=[];
 win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
 await win.loadURL('http://127.0.0.1:4320/Tests/Viewer/enemy-animations-smoke.html');
 const result=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(window.testResult){clearInterval(timer);resolve(window.testResult)}else if(Date.now()-start>180000){clearInterval(timer);reject(Error('enemy animation test timed out'))}},100)})`);
 await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 fs.writeFileSync(path.join(output,'enemies.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors},null,2));app.exit(result.passed&&!errors.length?0:1);
}).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({error:String(error)}));app.exit(1)});
