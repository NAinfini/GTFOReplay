const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/tests/objective-hud');fs.mkdirSync(out,{recursive:true});
const ts=require('../../Viewer/assets/node_modules/typescript');
const url=p=>pathToFileURL(path.join(root,p)).href;
const build=(input,name,replacements={})=>{let s=fs.readFileSync(path.join(root,input),'utf8');for(const [a,b] of Object.entries(replacements))s=s.replaceAll(a,b);fs.writeFileSync(path.join(out,name),ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)};
const imports={'@esm/@/rhu/html.js':url('Viewer/assets/js3party/rhu/html.js'),'@esm/@/rhu/signal.js':url('Viewer/assets/js3party/rhu/signal.js'),'@esm/@/rhu/style.js':url('Viewer/assets/js3party/rhu/style.js'),'@esm/@root/main/global/components/atoms/icons/index.js':'./icons.js','../../library/factory.js':'./factory.js','../helper.js':'./helper.js','../main.js':'./dispose.js'};
build('Viewer/assets/src/profiles/vanilla/ui/hud/objectives.ts','objectives.js',imports);
build('Viewer/assets/src/profiles/vanilla/ui/helper.ts','helper.js');build('Viewer/assets/src/profiles/vanilla/library/factory.ts','factory.js');
for(const name of ['chevronLeft','chevronRight'])build(`Viewer/assets/src/main/global/components/atoms/icons/${name}.ts`,name+'.js',{'@/rhu/html.js':imports['@esm/@/rhu/html.js']});
fs.writeFileSync(path.join(out,'icons.js'),`export * from './chevronLeft.js';export * from './chevronRight.js';`);
fs.writeFileSync(path.join(out,'dispose.js'),`export const dispose={signal:new AbortController().signal};`);
const folders=fs.readdirSync(path.join(root,'artifacts/tests/native-floor-replays'));const scene='artifacts/tests/native-floor-replays/'+folders.find(f=>f.startsWith('R2D2'))+'/scene.png';
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${url('Viewer/assets/src/main/fonts.css')}"><style>body{margin:0;height:100vh;background:#20272d url('${url(scene)}') center/cover no-repeat}</style><script type="module">
import {ObjectiveDisplay} from './objectives.js';import {signal} from '${imports['@esm/@/rhu/signal.js']}';
const dom=ObjectiveDisplay();document.body.append(...dom);const api=signal(undefined);dom.view({api});
const reactor={serialNumber:111,status:'Startup_intro',wave:2,numWaves:8,waveDuration:90,waveProgress:.4,codeTerminalSerial:[65535,65535,65535],codes:['A','B','OVERRIDE']};
window.setState=(state,multiple=false)=>{reactor.status=state;dom.index(0);const survival={state:'Survival',survivalText:'\u8b66\u62a5\uff1a\u575a\u6301\u5b58\u6d3b\uff0c\u7b49\u5f85\u5b89\u5168\u7cfb\u7edf\u6062\u590d / SURVIVE UNTIL SECURITY IS RESTORED',timeLeft:145};api({getOrDefault:key=>key==='Vanilla.Objectives.Reactor'?new Map(state==='survival'?[]:[[1,reactor]]):new Map(multiple||state==='survival'?[[2,survival]]:[])});};
window.hud=dom;setState('Startup_intro');window.ready=true;
</script>`);
app.setPath('userData',fs.mkdtempSync(path.join(out,'user-')));
setTimeout(()=>app.exit(1),45000);
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true}});try{await w.loadFile(path.join(out,'index.html'));for(let i=0;i<60&&!await w.webContents.executeJavaScript('!!window.ready');i++)await new Promise(r=>setTimeout(r,100));const results=[];
for(const width of [1440,720])for(const state of ['Startup_intro','Startup_waitForVerify','survival']){w.setSize(width,900);await w.webContents.executeJavaScript(`setState('${state}')`);await new Promise(r=>setTimeout(r,120));const check=await w.webContents.executeJavaScript(`(()=>{const h=window.hud,r=h.wrapper.getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,height:r.height,text:h.wrapper.innerText,progress:h.progressWrapper.getAttribute('aria-valuenow'),overflow:h.wrapper.scrollWidth>h.wrapper.clientWidth,buttonsHidden:h.left.hidden&&h.right.hidden}})()`);if(check.overflow||check.left<0||check.right>check.width||!check.buttonsHidden)throw Error(JSON.stringify(check));results.push({state,...check});fs.writeFileSync(path.join(out,state+'-'+width+'.png'),(await w.webContents.capturePage()).toPNG());}
await w.webContents.executeJavaScript(`setState('Startup_intro',true);hud.right.click();`);const text=await w.webContents.executeJavaScript('hud.wrapper.innerText');if(!text.includes('SURVIVE'))throw Error('Objective switching failed');fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,results},null,2));app.exit(0);
}catch(error){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:false,error:String(error.stack)},null,2));app.exit(1);}});
