// Run with Electron. Exercises the built React summary without loading 3D assets.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path'), {pathToFileURL} = require('node:url');
const output = path.resolve(__dirname, '../../artifacts/tests/statistics');
fs.mkdirSync(output, {recursive:true});
app.setPath('userData', path.join(output, 'user-data'));
const assets = pathToFileURL(path.resolve(__dirname, '../../Viewer/assets/build/interface') + path.sep).href;
const players = ['Ainz', 'Pimuna', 'NAinfini', 'bluefiremarkII', 'Bishop'];
const rows = players.map((player, index) => ({player, damage:null, kills:null, assists:null, shots:index === 2 ? 875 : null, hits:index === 2 ? 661 : null, revives:[4,1,2,2,0][index],packs:null,packsConsumed:index === 2 ? 3 : null}));
const html = `<!doctype html><html><meta charset="utf-8"><title>Statistics layout test fixture</title>
<link rel="stylesheet" href="${assets}interface.css"><style>html,body{height:100%;margin:0;background:#10141a;color:#edf0f4;font:14px 'Segoe UI',sans-serif}#controls{position:absolute;bottom:0;width:100%}</style>
<div class="replay-workspace"><div data-replay-nav></div><div data-react-panel></div><div class="replay-stage"><div id="controls"></div></div></div>
<script>localStorage.setItem('gtfo-replay.language',new URLSearchParams(location.search).get('lang')||'en');</script><script src="${assets}interface.js"></script><script>
const state={identity:'stats-fixture',startTime:0,time:6087000,duration:6087000,loadedUntil:6087000,loadFailed:false,live:false,paused:true,speed:1,indexing:false,events:[],players:${JSON.stringify(players.map((nickname,slot)=>({nickname,slot})))}};
window.testMode='data';ReplayInterface.mountControls(document.getElementById('controls'),{state:()=>({...state,identity:testMode}),statistics:async()=>{if(testMode==='empty')return {players:[],confirmedEnemyDeaths:null};if(testMode==='error')throw Error('Fixture error');return {players:${JSON.stringify(rows)},confirmedEnemyDeaths:23}},pause:()=>{},seek:()=>{},speed:()=>{},follow:()=>{},autoCamera:()=>{},step:async()=>{}});
</script></html>`;
fs.writeFileSync(path.join(output, 'fixture.html'), html);
app.whenReady().then(async () => {
    const win = new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true}});
    const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
    const results=[];
    try {
        for(const [width,lang] of [[1440,'en'],[960,'zh-CN']]) {
            win.setSize(width,900);
            await win.loadURL(pathToFileURL(path.join(output,'fixture.html')).href+'?lang='+lang);
            await wait(250);
            await win.webContents.executeJavaScript(`document.querySelectorAll('.workspace-nav button')[2].click()`);
            await wait(350);
            const result = await win.webContents.executeJavaScript(`(() => {
                const table=document.querySelector('.stats-panel table');if(!table)throw Error('No statistics table');
                const columns=[...table.querySelectorAll('thead th')].slice(1).map(el=>el.textContent);
                if(columns.join('|')!==${JSON.stringify(players.join('|'))})throw Error('Player columns mismatch: '+columns);
                if(table.querySelectorAll('tbody th[scope="row"]').length!==9)throw Error('Metric row headers missing');
                const scroll=document.querySelector('.stats-table-scroll');
                if(scroll.scrollWidth>scroll.clientWidth+1)throw Error('Statistics overflow at '+innerWidth);
                const rows=[...table.querySelectorAll('tbody tr')];
                if(rows[0].querySelector('td').textContent!=='—')throw Error('Missing damage shown as zero');
                if([...rows[6].querySelectorAll('td')].map(el=>el.textContent).join(',')!=='4,1,2,2,0')throw Error('Revives missing');
                if([...rows[8].querySelectorAll('td')].map(el=>el.textContent).join(',')!=='—,—,3,—,—')throw Error('Local resource scope is incorrect');
                if(document.querySelector('.stats-confirmed-deaths strong').textContent!=='23')throw Error('Confirmed deaths missing');
                return {width:innerWidth,columns,metrics:rows.length};
            })()`);
            results.push(result);
            fs.writeFileSync(path.join(output,`summary-${width}-${lang}.png`),(await win.webContents.capturePage()).toPNG());
            await win.webContents.executeJavaScript(`document.querySelectorAll('.stats-sort')[6].click()`);
            await wait(100);
            await win.webContents.executeJavaScript(`if([...document.querySelectorAll('.stats-panel thead th')].slice(1).map(el=>el.textContent).join('|')!=='Ainz|NAinfini|bluefiremarkII|Pimuna|Bishop')throw Error('Metric sorting failed')`);
        }
        fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,results},null,2));app.exit(0);
    } catch(error) {fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1);}
});
setTimeout(()=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,error:'Timeout'}));app.exit(1)},30000);
