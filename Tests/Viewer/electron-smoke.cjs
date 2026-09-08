// Run with Electron, not Node. Uses the real preload, IPC, profile and renderer.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
for (const name of ['showOpenDialog','showSaveDialog','showMessageBox']) dialog[name] = () => { throw new Error('Native dialog used: '+name); };
// Offscreen rendering advances Chromium animation frames without opening a window.
const Module = require('node:module');
const nativeLoad = Module._load;
Module._load = function(name, ...args) {
    const value = nativeLoad.call(this, name, ...args);
    if (name !== 'electron') return value;
    return { ...value, BrowserWindow: new Proxy(value.BrowserWindow, { construct(Target, [options]) {
        return new Target({ ...options, width: 1440, height: 900, webPreferences: { ...options.webPreferences, offscreen: true } });
    } }) };
};
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const appDir = path.resolve(process.argv[2] || path.join(root, 'Viewer/electron/build'));
const fixture = path.join(root, 'artifacts/tests/electron/synthetic.gtfoclip');
const output = path.join(root, 'artifacts/tests/electron');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'user-data-')));
app.commandLine.appendSwitch('lang', 'zh-CN');
BrowserWindow.prototype.show = function () {};
ipcMain.handle('smokeOpeningProgress', event => event.sender.send('replayOpenProgress', { phase: 'readingDuration', loaded: 5242880, total: 10485760 }));
ipcMain.handle('smokeCapture', async (event, name, width = 1440) => {
    BrowserWindow.fromWebContents(event.sender).setSize(width, 900);
    await new Promise(resolve => setTimeout(resolve, 150));
    await event.sender.executeJavaScript(`(() => {
        const header = document.querySelector('.app-header');
        if (Math.abs(header.getBoundingClientRect().height - 48) > .5) throw new Error('Title bar height changed.');
        if (header.scrollWidth > header.clientWidth) throw new Error('Title bar overflows.');
        for (const button of document.querySelectorAll('.window-actions button, .panel-close, button.size-6, button.size-7, button.size-8, button.size-9')) {
            const box = button.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            if (Math.abs(box.width - box.height) > .5) throw new Error('Icon button is not square: ' + button.outerHTML);
            if (getComputedStyle(button).borderRadius !== '0px') throw new Error('Icon button has rounded corners.');
        }
        for (const button of document.querySelectorAll('.window-actions button')) {
            const box = button.getBoundingClientRect(), icon = button.querySelector('svg').getBoundingClientRect();
            if (Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2) > .5 || Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2) > .5) throw new Error('Window icon is not centered.');
            if (getComputedStyle(button).getPropertyValue('-webkit-app-region') !== 'no-drag') throw new Error('Window button is in the drag region.');
        }
    })()`);
    fs.writeFileSync(path.join(output, name + '.png'), (await event.sender.capturePage()).toPNG());
});
let finished = false;
const messages = [];
const finish = (passed, result) => {
    if (finished) return;
    finished = true;
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed, result, messages }, null, 2));
    console.log(JSON.stringify({ passed, result }));
    app.exit(passed ? 0 : 1);
};
setTimeout(() => finish(false, 'Desktop startup timed out.'), 240000);
app.on('web-contents-created', (_, contents) => {
    contents.setBackgroundThrottling(false);
    contents.on('console-message', (_, level, message) => { if (level >= 2) messages.push(message); });
    contents.once('did-finish-load', async () => {
        try {
            await fixtureReady;
            const result = await contents.executeJavaScript(`(async () => {
                if (!navigator.language.startsWith('zh')) throw new Error('Default-language test requires a Chinese browser locale.');
                if (document.documentElement.lang !== 'en') throw new Error('Fresh app did not default to English.');
                const {app} = await import('./app.js');
                const {ASL_VM} = await import('../replay/vm.js');
                const deadline = Date.now() + 45000;
                while (app.nav.error() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
                if (app.nav.error()) throw new Error(document.body.innerText);
                const profile = await ASL_VM.load('../profiles/vanilla/ui/main.js');
                await profile.execution;
                const ui = profile.exports.ui();
                const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                app.showHome(); await wait(150);
                if (!document.querySelector('.brand-mark svg') || !document.querySelector('.replay-landing .gtfo-button') || !document.querySelector('.replay-landing video source')?.src.includes('Trailer_for_website')) throw new Error('Original branding or video landing page missing.');
                const video = document.querySelector('.replay-landing video');
                const videoDeadline = Date.now() + 20000;
                while (video.readyState < 2 && !video.error && Date.now() < videoDeadline) await wait(100);
                if (video.readyState < 2) throw new Error('Original background video did not load: '+JSON.stringify(video.error));
                await window.api.invoke('smokeCapture', 'landing');
                app.showLibrary();
                if (!video.paused) throw new Error('Background video kept playing behind the library.');
                await wait(150);
                const primary = document.querySelector('.replay-interface button.bg-primary');
                if (!primary || getComputedStyle(primary).backgroundColor === 'rgba(0, 0, 0, 0)') throw new Error('Primary button lost its background.');
                const labels = [];
                const settings = document.querySelector('.library-actions button:last-child'); settings.focus(); settings.click(); await wait(80);
                for (const lang of ['zh-CN', 'en']) {
                    document.querySelector('[role="dialog"] [role="combobox"]').click(); await wait(60);
                    const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent === (lang === 'en' ? 'English' : '\u7b80\u4f53\u4e2d\u6587'));
                    if (!option) throw new Error('Language option missing.'); option.click(); await wait(80);
                    if (localStorage.getItem('gtfo-replay.language') !== lang) throw new Error('Language was not persisted.');
                    labels.push(document.querySelector('[role="dialog"] h2').textContent);
                    if(lang === 'zh-CN') await window.api.invoke('smokeCapture', 'language-dialog');
                }
                document.querySelector('[role="dialog"] button[aria-label="Close"]').click(); await wait(350);
                if (document.querySelector('[role="dialog"]')) throw new Error('Settings dialog did not close: '+document.querySelector('[role="dialog"]').outerHTML.slice(0,1800));
                const choose = window.api.invoke('chooseFile'); await wait(200);
                if (!document.querySelector('.file-dialog')) throw new Error('Custom file dialog missing.');
                await window.api.invoke('smokeCapture', 'file-dialog');
                document.querySelector('.dialog-footer button').click(); await choose; await wait(100);
                if (document.querySelector('.file-dialog')) throw new Error('File dialog did not cancel.');
                app.main.loading(true); app.load(app.main);
                await window.api.invoke('smokeOpeningProgress'); await wait(100);
                if (document.querySelector('progress')?.value !== 50 || !document.body.textContent.includes('5.0 / 10.0 MiB')) throw new Error('Opening progress did not show processed bytes.');
                await window.api.invoke('smokeCapture', 'opening-progress');
                app.main.loading(false);
                await app.openFile(${JSON.stringify(fixture)}, false);
                await wait(200);
                const navButton = name => [...document.querySelectorAll('.workspace-nav button')].find(button => button.textContent === name);
                if (!navButton('Events')) throw new Error('Workspace navigation missing.');
                navButton('Settings').click(); await wait(100);
                const closeBox = document.querySelector('.panel-close').getBoundingClientRect();
                const iconBox = document.querySelector('.panel-close svg').getBoundingClientRect();
                if (Math.abs(closeBox.x+closeBox.width/2-iconBox.x-iconBox.width/2) > .5 || Math.abs(closeBox.y+closeBox.height/2-iconBox.y-iconBox.height/2) > .5) throw new Error('Side panel close icon is not centered.');
                if (!document.querySelector('.legacy-panel [role="switch"]')) throw new Error('Base UI settings switches missing.');
                if (!document.querySelector('.settings-language [role="combobox"]')) throw new Error('Settings language missing.');
                await window.api.invoke('smokeCapture', 'settings-1440');
                await window.api.invoke('smokeCapture', 'settings-960', 960);
                navButton('Player statistics').click(); await wait(100);
                if (!document.querySelector('.legacy-panel').textContent.includes('Track player statistics')) throw new Error('Player statistics selector is unlabeled.');
                await window.api.invoke('smokeCapture', 'players-960', 960);
                navButton('Events').click(); await wait(100);
                if (document.querySelector('.legacy-panel').hidden !== true) throw new Error('Multiple side panels are open.');
                if (document.querySelector('.event-scroll').textContent.includes('Heartbeat')) throw new Error('Heartbeat noise visible by default.');
                const groupToggle = document.querySelector('.event-group-toggle');
                if (!groupToggle) throw new Error('Repeated event group missing.');
                groupToggle.click(); await wait(100);
                if (document.querySelectorAll('.event-row[data-child="true"]').length !== 2) throw new Error('Grouped events did not expand individually.');
                if (!document.querySelector('.event-scroll').textContent.includes('\u5c0f\u660e')) throw new Error('Historical participant name not shown.');
                groupToggle.click(); await wait(100);
                if (document.querySelector('.event-row[data-child="true"]')) throw new Error('Event group did not collapse.');
                document.querySelector('.detail-toggle [role="switch"]').click(); await wait(100);
                if (!document.querySelector('.event-scroll').textContent.includes('Heartbeat')) throw new Error('Detailed event mode lost data.');
                window.ReplayInterface.notify('Test operation failed.'); await wait(80);
                if (!document.querySelector('.toast')) throw new Error('Operation failure did not show a toast.');
                if (document.querySelector('.transport [role="alert"]')) throw new Error('Inline transport error still exists.');
                if (!document.querySelector('.follow-field [role="combobox"]')) throw new Error('Follow player control missing.');
                await window.api.invoke('smokeCapture', 'events-1440');
                if (document.querySelector('button[title],input[title],select')) throw new Error('Native tooltip or dropdown remains.');
                const view = app.player.view;
                const loadingReplay = view.replay();
                document.querySelector('.toast button')?.click();
                loadingReplay.endTime = 6000; loadingReplay.complete = false;
                view.pause(true); view.time(0); await wait(200);
                const loadingTimeline = document.querySelector('.timeline input');
                if (Number(loadingTimeline.max) !== 6000 || !document.querySelector('.load-status').textContent.includes('33%')) throw new Error('Partial loading did not show fixed duration and progress.');
                view.time(6000);
                if (view.time() !== 2000) throw new Error('Seek escaped the loaded range.');
                await window.api.invoke('smokeCapture', 'loading-1440');
                const languageHost = document.createElement('div'); document.body.append(languageHost);
                const unmountLanguage = window.ReplayInterface.mountLanguage(languageHost);
                const changeLoadingLanguage = async text => {
                    await wait(100); languageHost.querySelector('[role="combobox"]').click(); await wait(60);
                    [...document.querySelectorAll('[role="option"]')].find(el => el.textContent === text).click(); await wait(150);
                };
                await changeLoadingLanguage('简体中文');
                if (!document.querySelector('.load-status').textContent.includes('已加载')) throw new Error('Loading progress was not localized.');
                await window.api.invoke('smokeCapture', 'loading-960', 960);
                if (document.querySelector('.transport').getBoundingClientRect().bottom > innerHeight + 1) throw new Error('Loading transport exceeds viewport.');
                loadingReplay.complete = true; loadingReplay.endTime = 2000;
                await changeLoadingLanguage('English'); unmountLanguage(); languageHost.remove();
                if (!document.querySelector('.load-status').textContent.includes('Fully loaded')) throw new Error('Loading completion was not shown.');
                const camera = view.renderer.get('Camera').root;
                camera.position.set(7, 9, 7); camera.lookAt(0, 0, 0);
                for (const time of [1000, 250, 1750, 0]) {
                    view.time(time);
                    await new Promise(resolve => setTimeout(resolve, 80));
                    const snapshot = await view.replay().getSnapshot(time);
                    if (Math.abs(snapshot.time - time) > 50) throw new Error('Seek returned the wrong snapshot.');
                    view.renderer.render(0, view.replay().api(snapshot));
                    if (view.replay().error) throw view.replay().error;
                }
                const renderCalls = view.renderer.renderer.info.render.calls;
                await Promise.all([app.openFile(${JSON.stringify(fixture)}, false), app.openFile(${JSON.stringify(fixture)}, false)]);
                if (!app.player.view.replay()?.complete) throw new Error('Rapid replay switch lost the active clip.');
                if (renderCalls === 0) throw new Error("Scene did not render.");
                // Exercise actual exports with the custom save dialog, including overwrite protection.
                const reportPath = ${JSON.stringify(path.join(output, 'dialog-report.json'))};
                const saveReport = window.api.invoke('exportReplayDiagnostics', JSON.stringify({test:'custom dialog'}));
                await wait(150);
                const setInput = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); };
                setInput(document.querySelector('.file-address input'), ${JSON.stringify(output)});
                document.querySelector('.file-address').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); await wait(150);
                setInput(document.querySelector('.file-name input'), 'dialog-report.json'); await wait(50);
                document.querySelector('.dialog-footer button:last-child').click(); await wait(150);
                if (document.querySelector('.overwrite-warning')) document.querySelector('.overwrite-warning button').click();
                if (!await saveReport) throw new Error('Custom save dialog did not save report.');
                const again = window.api.invoke('exportReplayDiagnostics','{}'); await wait(100);
                setInput(document.querySelector('.file-address input'), ${JSON.stringify(output)});
                document.querySelector('.file-address').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); await wait(150);
                setInput(document.querySelector('.file-name input'), 'dialog-report.json'); await wait(50);
                document.querySelector('.dialog-footer button:last-child').click(); await wait(100);
                if (!document.querySelector('.overwrite-warning')) throw new Error('Overwrite confirmation missing.');
                document.querySelector('.dialog-footer button:first-child').click(); if (await again) throw new Error('Cancelled save succeeded.');
                await wait(100);
                let actual;
                if (${JSON.stringify(process.argv[3] || '')}) {
                    await app.openFile(${JSON.stringify(process.argv[3] || '')}, false);
                    const real = app.player.view;
                    const fullDuration = real.replay().length();
                    if (!(fullDuration > real.replay().loadedLength())) throw new Error('Full duration was not available before background parsing.');
                    const indexStarted = Date.now();
                    const loaded = indexStarted + 180000;
                    while (!real.replay()?.complete && Date.now() < loaded) {
                        if (real.replay().length() !== fullDuration) throw new Error('Recording duration changed while loading.');
                        await wait(100);
                    }
                    if (!real.replay()?.complete) throw new Error('Recorded session index state: '+JSON.stringify({length:real.length(),blocks:real.replay()?.blocks.length,events:real.replay()?.events.length,error:String(real.replay()?.error),logs:real.diagnosticLogs(),file:await window.api.invoke('replayFileInfo')}));
                    const indexMs = Date.now() - indexStarted;
                    real.pause(true); real.time(120000);
                    const playersReady = Date.now() + 5000;
                    while ((real.api()?.time() !== 120000 || !(real.api()?.get("Vanilla.Player")?.size)) && Date.now() < playersReady) await wait(100);
                    if (real.api()?.time() !== 120000) throw new Error('Rendered snapshot did not reach the requested seek.');
                    await wait(150);
                    const follow = document.querySelector('.follow-field [role="combobox"]'); follow.click(); await wait(60);
                    const options = [...document.querySelectorAll('[role="option"]')];
                    const recordedPlayers = [...real.api().get('Vanilla.Player').values()];
                    const chosenPlayer = recordedPlayers[0];
                    const playerOption = options.find(option => option.textContent === chosenPlayer?.nickname);
                    if (!playerOption) throw new Error('Recorded players missing: '+JSON.stringify({time:real.time(),players:recordedPlayers.length,body:document.body.innerText.slice(-1200)}));
                    playerOption.click(); await wait(100);
                    if (real.renderer.get('Controls').targetSlot() !== chosenPlayer.slot) throw new Error('Follow selection did not reach camera controls.');
                    document.activeElement?.blur(); document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',key:'ArrowLeft',bubbles:true})); await wait(100);
                    if (Math.abs(real.time()-115000)>100) throw new Error('Left arrow did not move back five seconds: '+real.time());
                    document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',key:'ArrowRight',bubbles:true})); await wait(100);
                    if (Math.abs(real.time()-120000)>100) throw new Error('Right arrow did not advance five seconds.');
                    const back = document.querySelector('button[aria-label="Back 5 seconds"]');
                    if (!back?.dataset.tooltip?.includes('←')) throw new Error('Skip shortcut tooltip missing.');
                    back.dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); await wait(650);
                    if (!document.querySelector('[role="tooltip"]')?.textContent.includes('←')) throw new Error('Custom tooltip not rendered.');
                    back.dispatchEvent(new PointerEvent('pointerout',{bubbles:true}));
                    if (navButton('Events').getAttribute('aria-pressed') !== 'true') navButton('Events').click();
                    await wait(150);
                    const detailToggle = document.querySelector('.detail-toggle [role="switch"]');
                    if (detailToggle?.getAttribute('aria-checked') === 'true') { detailToggle.click(); await wait(100); }
                    const eventList = document.querySelector('.event-scroll');
                    if (!eventList) throw new Error('Recorded session event panel missing.');
                    const shown = eventList.textContent;
                    if (/Heartbeat|Gunshots|undefined/.test(shown)) throw new Error('Real recording still shows event noise or invalid details.');
                    const namedEvents = real.replay().events.filter(event => event.participants?.some(person => person.name));
                    if (!namedEvents.length) throw new Error('Parser did not capture historical participant names.');
                    const actualGroup = document.querySelector('.event-group-toggle');
                    if (!actualGroup) throw new Error('Actual repeated events were not grouped.');
                    actualGroup.click(); await wait(100);
                    if (!document.querySelector('.event-row[data-child="true"]')) throw new Error('Actual event group failed to expand.');
                    if (real.replay().error || real.diagnosticLogs().some(log => log.type === 'error')) throw new Error('Real recording produced an application error.');
                    actual = {players:recordedPlayers.length,following:real.renderer.get('Controls').targetSlot(),duration:real.length(),blocks:real.replay().blocks.length,indexMs,events:real.replay().events.length,namedEvents:namedEvents.length,groups:true,keyboard:true,tooltip:true};
                    await window.api.invoke('smokeCapture','recording-events-1440');
                    navButton('Settings').click(); await wait(120); await window.api.invoke('smokeCapture','recording-settings-960',960);
                    if(document.querySelector('.transport').getBoundingClientRect().bottom > innerHeight+1) throw new Error('Transport clipped below window.');
                }
                app.showLibrary();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return {profile:app.nav.module(), actual, labels, renderCalls, clipSeek:true, rapidSwitch:true,  body:document.body.innerText.slice(0,1000)};
            })()`);
            fs.writeFileSync(path.join(output, 'library.png'), (await contents.capturePage()).toPNG());
            finish(true, result);
        } catch (error) { finish(false, error.stack || String(error)); }
    });
});
const {writeClip} = require(path.join(appDir, 'replay/clip.cjs'));
const header = new Map([
    ['ReplayRecorder.Header', {isMaster:true}],
    ['Vanilla.Map.Geometry', new Map([[0, [{vertices:new Float32Array([-8,0,-8, 8,0,-8, 8,0,8, -8,0,8]), indices:[0,2,1,0,3,2], themes:new Uint8Array(2)}]]])]
]);
const state = {time:0,tick:0,typedTime:new Map(),data:new Map()};
const timeline = Array.from({length:40}, (_,i) => ({time:(i+1)*50,tick:i+1,events:[],dynamics:new Map()}));
const fixtureReady = writeClip(fixture, {start:0,end:2000,sourceIdentity:'synthetic-desktop-test',blocks:[{id:0,start:0,end:2000}],typemap:new Map(),types:new Map(),header,events:[{id:0,time:100,kind:'Vanilla.Heartbeat',data:{}},{id:1,time:200,kind:'ReplayRecorder.Marker',data:{label:'Test marker'}},...[2,3].map(id=>({id,time:id*100,kind:'Vanilla.Enemy.Alert',data:{enemy:id,slot:0},participants:[{role:'player',type:'player',id:10,name:'\u5c0f\u660e'}]}))]}, async () => ({state,timeline}))
.catch(error => finish(false, error.stack));
require(path.join(appDir, 'app.cjs')); 

