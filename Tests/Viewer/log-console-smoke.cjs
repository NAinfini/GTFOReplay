// Run with Electron and a recording path. Uses the built Viewer and real GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/log-console');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1500,height:1000,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Replay verification timed out'}),120000);
app.on('web-contents-created',(_,contents)=>{
    contents.setBackgroundThrottling(false);
    contents.on('console-message',(_,level,message)=>fs.appendFileSync(path.join(output,'console.log'),level+': '+message+'\n'));
    const capture=setInterval(async()=>{if(await contents.executeJavaScript('window.logScreenshotReady === true').catch(()=>false)){clearInterval(capture);fs.writeFileSync(path.join(output,'panel.png'),(await contents.capturePage()).toPNG());}},250);
    contents.once('did-finish-load',async()=>{try{
        const result=await contents.executeJavaScript(`(async()=>{try {
            const {app}=await import('./app.js');
            const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
            app.onLoadModule(await window.api.invoke('loadModule','vanilla'));
            const deadline=Date.now()+30000;while(!app.profile()&&Date.now()<deadline)await wait(100);
            await app.openFile(${JSON.stringify(recording)},false);
            const view=app.player.view;
            const indexing=Date.now()+60000;
            while(!view.replay()?.complete&&Date.now()<indexing){if(view.replay()?.error)throw view.replay().error;await wait(100)}
            if(!view.replay()?.complete)throw Error('Recording did not finish indexing');
            view.pause(true);view.time(120000);await wait(1000);
            const button = label => [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.textContent.trim() === label);
            button('Log console').click(); await wait(300);
            const diagnostics=view.api().header.get('Vanilla.Map.NativeSurfaceDiagnostics');
            const text=document.querySelector('.log-scroll').innerText;
            for(const diagnostic of diagnostics) if(!text.includes(diagnostic)) throw Error('Missing diagnostic: '+diagnostic);
            console.debug('log-console-debug-check'); console.info('log-console-info-check'); console.error('log-console-error-check');
            window.ReplayInterface.notify('log-console-warning-check','warning'); await wait(200);
            if(!document.querySelector('.log-entry[data-level="warn"]'))throw Error('No warnings');
            const input=document.querySelector('input[aria-label="Search logs"]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unmatched native floor identity:');input.dispatchEvent(new Event('input',{bubbles:true}));await wait(200);
            const filtered=document.querySelectorAll('.log-entry').length;
            if(filtered!==diagnostics.length)throw Error('Filter mismatch: '+filtered+' / '+diagnostics.length);
            button('Copy filtered logs').click();await wait(250);
            if(!document.querySelector('.log-tools [role=status]').textContent.includes('Copied'))throw Error('Copy failed: '+document.querySelector('.log-tools [role=status]').textContent);
            window.expectedCopiedDiagnostics=diagnostics;
            button('Log console').click();await wait(150);console.warn('while-panel-closed');await wait(150);button('Log console').click();await wait(200);
            if(!document.querySelector('.log-scroll').textContent.includes('while-panel-closed'))throw Error('Lost closed-panel log');
            window.logScreenshotReady=true;await wait(1000);
            button('Clear logs').click();await wait(200);
            if(document.querySelectorAll('.log-entry').length)throw Error('Clear failed');
            return {passed:true,diagnostics:diagnostics.length,filter:true,copy:true,closedPanelCollection:true,clear:true};
        } catch(error) { return {passed:false,error:String(error?.stack || error),text:document.querySelector(".log-console")?.innerText}; } })()`);
        if(result.passed){const diagnostics=await contents.executeJavaScript('window.expectedCopiedDiagnostics');const copied=require('electron').clipboard.readText();if(!diagnostics.every(d=>copied.includes(d))||copied.includes('log-console-debug-check'))throw Error('Clipboard contents mismatch');}
        fs.writeFileSync(path.join(output,'scene.png'),(await contents.capturePage()).toPNG());finish(result);
    }catch(error){const details=await contents.executeJavaScript('window.floorReport ?? {}').catch(()=>({}));finish({...details,passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
