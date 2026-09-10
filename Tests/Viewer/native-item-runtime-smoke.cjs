const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../../artifacts/tests/native-items');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'user-data'));
app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:1120,height:1000,webPreferences:{backgroundThrottling:false,offscreen:true}});
    const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
    await win.loadURL('http://127.0.0.1:4320/artifacts/tests/native-items/index.html?test='+Date.now());
    const result=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(window.testResult){clearInterval(timer);resolve(window.testResult)}else if(Date.now()-start>60000){clearInterval(timer);reject(Error('Native item test timed out'))}},100)})`);
    fs.writeFileSync(path.join(output,'runtime.png'),(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...result,errors},null,2));
    app.exit(result.passed&&!errors.length?0:1);
}).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:String(error)}));app.exit(1)});
