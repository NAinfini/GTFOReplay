const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/tests/tactical-hud');fs.mkdirSync(out,{recursive:true});
const ts=require('../../Viewer/assets/node_modules/typescript');
const url=p=>pathToFileURL(path.join(root,p)).href;
const build=(input,name,replacements={})=>{let s=fs.readFileSync(path.join(root,input),'utf8');for(const [a,b] of Object.entries(replacements))s=s.replaceAll(a,b);fs.writeFileSync(path.join(out,name),ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)};
const imports={'@esm/@/rhu/html.js':url('Viewer/assets/js3party/rhu/html.js'),'@esm/@/rhu/signal.js':url('Viewer/assets/js3party/rhu/signal.js'),'@esm/@/rhu/style.js':url('Viewer/assets/js3party/rhu/style.js'),'@esm/@root/main/global/components/atoms/icons/index.js':'./icons.js','../../library/factory.js':'./factory.js','../helper.js':'./helper.js','../main.js':'./dispose.js','../../library/tacticalHud.js':'./tacticalState.js'};
build('Viewer/assets/src/profiles/vanilla/ui/hud/tactical.ts','tactical.js',imports);
build('Viewer/assets/src/profiles/vanilla/library/tacticalHud.ts','tacticalState.js');build('Viewer/assets/src/profiles/vanilla/ui/helper.ts','helper.js');build('Viewer/assets/src/profiles/vanilla/library/factory.ts','factory.js');
for(const name of ['chevronLeft','chevronRight'])build(`Viewer/assets/src/main/global/components/atoms/icons/${name}.ts`,name+'.js',{'@/rhu/html.js':imports['@esm/@/rhu/html.js']});
fs.writeFileSync(path.join(out,'icons.js'),`export * from './chevronLeft.js';export * from './chevronRight.js';`);
fs.writeFileSync(path.join(out,'dispose.js'),`export const dispose={signal:new AbortController().signal};`);
const folders=fs.readdirSync(path.join(root,'artifacts/tests/native-floor-replays'));const scene='artifacts/tests/native-floor-replays/'+folders.find(f=>f.startsWith('R2D2'))+'/scene.png';
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${url('Viewer/assets/src/main/fonts.css')}"><style>body{margin:0;height:100vh;background:#20272d url('${url(scene)}') center/cover no-repeat}</style><script type="module">
import {TacticalDisplay} from './tactical.js';import {signal} from '${imports['@esm/@/rhu/signal.js']}';
const dom=TacticalDisplay();document.body.append(...dom);const api=signal(undefined);dom.view({api,renderer:{get:()=>0}});
window.setState=(mode='full')=>{const data=new Map([
 ['Vanilla.Bioscan',new Map([[1,{id:1,dimension:0}]])],['Vanilla.Bioscan.Status',new Map([[1,{progress:.63}]])],
 ['Vanilla.Bioscan.Info',new Map([[1,{id:1,exit:true,state:3,players:3,required:4,requirement:'All',missingItems:0}]])],
 ['Vanilla.Gameplay.Info',new Map([
 ['mission',{channel:'Objective',title:'Mission',text:'\u8fd4\u56de\u64a4\u79bb\u70b9\uff0c\u643a\u5e26\u4efb\u52a1\u7269\u54c1 / Return to extraction with the objective item.',time:100}],
 ['timer',{channel:'Timer',title:'EVACUATION',text:'01:24',time:100}],
 ['alarm',{channel:'Alarm',title:'CLASS V ALARM',text:'Active',time:100}],
 ['wave',{channel:'Wave',title:'Enemy wave 3',text:'Observed wave start',time:100}],
 ['terminal',{channel:'Terminal',title:'TERMINAL_123',text:'UPLINK VERIFIED',time:100}]
 ])]
]);if(mode==='empty')data.clear();if(mode==='unknown'){data.delete('Vanilla.Bioscan.Status');data.delete('Vanilla.Bioscan.Info');}api({get:key=>data.get(key),time:()=>1000});};window.hud=dom;setState();window.ready=true;
</script>`);
app.setPath('userData',fs.mkdtempSync(path.join(out,'user-')));
setTimeout(()=>app.exit(1),45000);
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});try{await w.loadFile(path.join(out,'index.html'));for(let i=0;i<60&&!await w.webContents.executeJavaScript('!!window.ready');i++)await new Promise(r=>setTimeout(r,100));const results=[];
for(const width of [1440,720]){
 w.setSize(width,900);await w.webContents.executeJavaScript('setState()');await new Promise(r=>setTimeout(r,120));
 const check=await w.webContents.executeJavaScript(`(()=>{
  const h=window.hud,r=h.wrapper.getBoundingClientRect(),bar=h.wrapper.querySelector('progress'),style=getComputedStyle(h.wrapper);
  const objective=h.wrapper.querySelector('.objective'),objectiveRect=objective.getBoundingClientRect(),scans=h.wrapper.querySelector('.scans').getBoundingClientRect(),messages=h.wrapper.querySelector('.messages').getBoundingClientRect();
  return {width:innerWidth,left:r.left,right:r.right,height:r.height,text:h.wrapper.innerText,progress:bar?.value,overflow:h.wrapper.scrollWidth>h.wrapper.clientWidth,
   transparent:style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.borderTopWidth==='0px'&&style.boxShadow==='none',thin:getComputedStyle(bar).height==='3px',
   objectiveOpen:objective.open,objectiveScroll:objective.scrollHeight>objective.clientHeight,separated:objectiveRect.bottom<=scans.top&&scans.bottom<messages.top};
 })()`);
 if(check.overflow||check.left<0||check.right>check.width||check.progress!==63||!check.text.includes('MISSION OBJECTIVE')||!check.text.includes('EXTRACTION')||!check.text.includes('UPLINK VERIFIED')||!check.text.includes('CLASS V')||!check.transparent||!check.thin||!check.objectiveOpen||check.objectiveScroll||!check.separated)throw Error(JSON.stringify(check));
 results.push(check);
 // A normal hidden window supports DOM captures; reject missing image evidence.
 const image=await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});if(image.isEmpty())throw Error('Empty HUD capture');const png=image.toPNG();
 fs.writeFileSync(path.join(out,'hud-'+width+'.png'),png);
}
await w.webContents.executeJavaScript(`hud.wrapper.querySelector('.objective summary').click();if(hud.wrapper.querySelector('.objective').open)throw Error('Objective did not hide');setState('unknown');if(hud.wrapper.querySelector('.objective').open)throw Error('Objective visibility was not preserved');if(!hud.wrapper.innerText.includes('Progress not recorded')||getComputedStyle(hud.wrapper.querySelector('progress')).visibility!=='hidden')throw Error('Unknown progress looks active');setState('empty');if(!hud.wrapper.hidden)throw Error('Empty HUD remains visible');`);
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,results},null,2));app.exit(0);
}catch(error){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:false,error:String(error.stack)},null,2));app.exit(1);}});
