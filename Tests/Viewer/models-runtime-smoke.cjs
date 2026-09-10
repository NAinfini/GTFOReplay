const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../../artifacts/tests/models-runtime');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'user-data'));
app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:1300,height:850,webPreferences:{backgroundThrottling:false,offscreen:true}});
    const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});
    await win.loadURL('http://127.0.0.1:4320/Tests/Viewer/models-smoke.html?test='+Date.now());
    const result=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const start=Date.now();const timer=setInterval(()=>{
            if(window.testResult){clearInterval(timer);resolve(window.testResult);}
            else if(Date.now()-start>180000){clearInterval(timer);reject(Error('runtime model test timed out'));}
        },100);
    })`);
    await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(output,'characters.png'),(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors},null,2));
    app.exit(result.passed&&!errors.length?0:1);
}).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({error:String(error)}));app.exit(1);});
