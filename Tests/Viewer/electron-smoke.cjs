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
const recording = process.argv[3] ? path.resolve(process.argv[3]) : '';
const fixture = path.join(root, 'artifacts/tests/electron/synthetic.gtfoclip');
const output = path.join(root, 'artifacts/tests/electron');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'user-data-')));
app.commandLine.appendSwitch('lang', 'zh-CN');
BrowserWindow.prototype.show = function () {};
ipcMain.handle('smokeClick', (event, x, y) => {
    event.sender.sendInputEvent({type:'mouseDown', x:Math.round(x), y:Math.round(y), button:'left', clickCount:1});
    event.sender.sendInputEvent({type:'mouseUp', x:Math.round(x), y:Math.round(y), button:'left', clickCount:1});
});
ipcMain.handle('smokeOpeningProgress', event => event.sender.send('replayOpenProgress', { phase: 'readingDuration', loaded: 5242880, total: 10485760 }));
ipcMain.handle('smokeSpace', event => {
    event.sender.sendInputEvent({type:'keyDown', keyCode:'Space'});
    event.sender.sendInputEvent({type:'keyUp', keyCode:'Space'});
});
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
                for (const lang of ['zh-CN', 'en']) {
                    document.querySelector('.header-language [role="combobox"]').click(); await wait(60);
                    const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent === (lang === 'en' ? 'English' : '\u7b80\u4f53\u4e2d\u6587'));
                    if (!option) throw new Error('Language option missing.'); option.click(); await wait(80);
                    if (localStorage.getItem('gtfo-replay.language') !== lang) throw new Error('Language was not persisted.');
                    labels.push(document.querySelector('.header-language [role="combobox"]').getAttribute('aria-label'));
                    if(lang === 'zh-CN') await window.api.invoke('smokeCapture', 'header-language');
                }
                if (document.querySelector('[role="dialog"]')) throw new Error('Language selection opened a settings dialog.');
                const openSettings = () => {
                    const buttons = [...document.querySelectorAll('.library-actions button, .workspace-nav button')].filter(button => button.textContent.trim() === 'Settings' && button.checkVisibility());
                    if (buttons.length !== 1 || document.querySelector('.header-settings button')) throw new Error('Expected one visible Settings entry outside the header.');
                    buttons[0].click();
                };
                openSettings(); await wait(100);
                if (!document.querySelector('.app-settings [aria-label="Replay profile"]')) throw new Error('Settings unavailable outside playback.');
                document.querySelector('.app-settings .dialog-header button').click(); await wait(100);
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
                const manifest = await fetch('../actors/manifest.json').then(response => response.json());
                await app.openFile(${JSON.stringify(fixture)}, false);
                await wait(200);
                const navButton = name => [...document.querySelectorAll('.workspace-nav button')].find(button => button.textContent === name);
                const navDeadline = Date.now() + 10000;
                while (!navButton('Events') && Date.now() < navDeadline) await wait(100);
                if (!navButton('Events')) throw new Error('Workspace navigation missing.');
                navButton('Player statistics').click(); await wait(100);
                const rail = document.querySelector('.workspace-nav');
                const toggleSidebar = () => rail.querySelector('.sidebar-toggle').click();
                const expandedWidth = rail.getBoundingClientRect().width;
                const expandedCanvasWidth = app.player.view.canvas.getBoundingClientRect().width;
                if (rail.dataset.collapsed !== 'false') throw new Error('Sidebar must start expanded.');
                toggleSidebar(); await wait(200);
                if (Math.abs(rail.getBoundingClientRect().width - 54) > 1 || localStorage.getItem('gtfo-replay.sidebar-collapsed') !== 'true') throw new Error('Sidebar did not collapse and persist: width='+rail.getBoundingClientRect().width+', saved='+localStorage.getItem('gtfo-replay.sidebar-collapsed')+', state='+rail.dataset.collapsed);
                if (getComputedStyle(navButton('Settings').querySelector('span')).display !== 'none' || navButton('Settings').dataset.tooltip !== 'Settings') throw new Error('Collapsed navigation lost its icon tooltip.');
                if (document.querySelector('.legacy-panel').hidden || navButton('Player statistics').getAttribute('aria-pressed') !== 'true') throw new Error('Collapsing closed the active panel.');
                const collapsedCanvas = app.player.view.canvas.getBoundingClientRect();
                if (collapsedCanvas.width <= expandedCanvasWidth || Math.abs(app.player.view.renderer.get('Camera').root.aspect - collapsedCanvas.width / collapsedCanvas.height) > .01) throw new Error('Replay camera did not resize with the sidebar.');
                await window.api.invoke('smokeCapture', 'sidebar-collapsed-1440');
                await window.api.invoke('smokeCapture', 'sidebar-collapsed-960', 960);
                navButton('Events').click(); await wait(100);
                if (!document.querySelector('.event-scroll')) throw new Error('Collapsed navigation could not switch panels.');
                navButton('Player statistics').click(); await wait(100);
                toggleSidebar(); await wait(200);
                if (rail.dataset.collapsed !== 'false' || localStorage.getItem('gtfo-replay.sidebar-collapsed') !== 'false' || getComputedStyle(navButton('Settings').querySelector('span')).display === 'none') throw new Error('Sidebar did not restore labels and preference.');
                await window.api.invoke('smokeCapture', 'sidebar-expanded-1440');
                if (rail.getBoundingClientRect().width !== expandedWidth) throw new Error('Expanded sidebar width was not restored.');
                const closeBox = document.querySelector('.panel-close').getBoundingClientRect();
                const iconBox = document.querySelector('.panel-close svg').getBoundingClientRect();
                if (Math.abs(closeBox.x+closeBox.width/2-iconBox.x-iconBox.width/2) > .5 || Math.abs(closeBox.y+closeBox.height/2-iconBox.y-iconBox.height/2) > .5) throw new Error('Side panel close icon is not centered.');
                navButton('Settings').click(); await wait(100);
                if (!document.querySelector('.app-settings .settings-display [role="switch"]')) throw new Error('Display settings missing from the shared settings dialog.');
                if (!document.querySelector('.app-settings [aria-label="Replay profile"]') || document.querySelector('.app-header [aria-label="Replay profile"]')) throw new Error('Replay profile must live inside Settings only.');
                if (document.querySelector('.settings-language') || !document.querySelector('.header-language [role="combobox"]')) throw new Error('Language must live only in the app header.');
                await window.api.invoke('smokeCapture', 'settings-1440');
                await window.api.invoke('smokeCapture', 'settings-960', 960);
                document.querySelector('.app-settings .dialog-header button').click(); await wait(100);
                if (navButton('Player statistics').getAttribute('aria-pressed') !== 'true') navButton('Player statistics').click(); await wait(100);
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
                await wait(400);
                const warning = {message:'Missing test item; using a basic shape.', verbose:'diagnostic detail', type:'warning'};
                view.addLog(warning); view.addLog(warning); await wait(100);
                const toast = [...document.querySelectorAll('.toast')].find(el => el.textContent.includes(warning.message));
                if (!toast) throw new Error('Replay warning did not reach the shared toast host.');
                const close = toast.querySelector('button'), rect = close.getBoundingClientRect();
                if (!close.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))) throw new Error('Toast close button is blocked by another layer.');
                await window.api.invoke('smokeClick',rect.x+rect.width/2,rect.y+rect.height/2); await wait(400);
                for(let i=0;i<30;i++)view.addLog(warning); await wait(100);
                if ([...document.querySelectorAll('.toast')].some(el=>el.textContent.includes(warning.message))) throw new Error('Dismissed replay warning reappeared.');
                if (view.diagnosticLogs().filter(log=>log.message===warning.message).length!==1) throw new Error('Dismissal lost or duplicated diagnostic history.');
                for(const target of [view.canvas, document.querySelector('.timeline input'), document.querySelector('.transport button'), ...document.querySelectorAll('.transport [role="combobox"]')]) {
                    view.pause(true); view.time(0); target.focus();
                    await window.api.invoke('smokeSpace'); await wait(60);
                    if(view.pause()) throw new Error('Space did not resume from '+target.tagName+'; overlays='+[...document.querySelectorAll('[role="dialog"],[role="listbox"]')].map(el=>el.outerHTML.slice(0,400)).join('|'));
                    await window.api.invoke('smokeSpace'); await wait(60);
                    if(!view.pause()) throw new Error('Space did not pause from '+target.tagName);
                }
                loadingReplay.endTime = 6000; loadingReplay.complete = false;
                view.pause(true); view.time(0); await wait(200);
                const loadingTimeline = document.querySelector('.timeline input');
                if (Number(loadingTimeline.max) !== 6000 || document.querySelector('.load-status').textContent !== 'Loaded to 00:02') throw new Error('Partial loading did not show fixed duration and loaded time.');
                view.time(6000);
                if (view.time() !== 2000) throw new Error('Seek escaped the loaded range.');
                await window.api.invoke('smokeCapture', 'loading-1440');
                const languageHost = document.querySelector('.header-language');
                const changeLoadingLanguage = async text => {
                    await wait(100); languageHost.querySelector('[role="combobox"]').click(); await wait(60);
                    [...document.querySelectorAll('[role="option"]')].find(el => el.textContent === text).click(); await wait(150);
                };
                await changeLoadingLanguage('\u7b80\u4f53\u4e2d\u6587');
                if (!document.querySelector('.load-status').textContent.includes('\u5df2\u52a0\u8f7d')) throw new Error('Loading progress was not localized.');
                await window.api.invoke('smokeCapture', 'loading-960', 960);
                if (document.querySelector('.transport').getBoundingClientRect().bottom > innerHeight + 1) throw new Error('Loading transport exceeds viewport.');
                loadingReplay.complete = true; loadingReplay.endTime = 2000;
                await changeLoadingLanguage('English');
                if (document.querySelector('.load-status')) throw new Error('Completed loading status should disappear.');
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
                const nativeDeadline = Date.now() + 30000;
                while (!view.renderer.get('Doors').get(1)?.native?.model && Date.now()<nativeDeadline) await wait(100);
                if (!view.renderer.get('Doors').get(1)?.native?.model) throw new Error('Current-format fixture did not load its Low door.');
                const tagEnemy=view.api().get('Vanilla.Enemy').get(301),tagWrapper=view.renderer.get('Enemies').get(301);
                tagEnemy.tagged=true;view.renderer.render(0,view.api());
                if(!tagWrapper.tag.visible || tagWrapper.tag.material.color.getHex()!==0xff3b30 || tagWrapper.tag.geometry.getAttribute('position').count!==6 || tagWrapper.tag.geometry.index.count!==18)throw Error('Biotracker tag is missing its red triangle');
                await window.api.invoke('smokeCapture','biotracker-tag');
                tagEnemy.tagged=false;view.renderer.render(0,view.api());
                if(tagWrapper.tag.visible)throw Error('Expired biotracker tag remained visible');
                await view.renderer.get('NativeSurfaces').ready;
                const customTerminal = view.renderer.get('Terminals').get(101);
                const customDoor = view.renderer.get('Doors').get(2);
                await Promise.all([customTerminal.ready, customDoor.native.ready]);
                if (!customTerminal.failed || !customDoor.native.failed) throw new Error('Modded prefab names did not use basic shapes.');
                if (customTerminal.root.position.x !== 5 || customDoor.root.position.x !== -5) throw new Error('Modded object transforms were lost.');
                const customContainers = [201,202].map(id => view.renderer.get('ResourceContainers').get(id));
                await Promise.all(customContainers.map(model => model.ready));
                if (customContainers.some(model => !model.failed)) throw new Error('Custom boxes/lockers were replaced with guessed vanilla models.');
                for (const root of [view.renderer.get('Enemies').get(301).model.root, view.renderer.get('Items').get(401).root]) {
                    let basic = 0; root.traverse(object => {if(object.userData.modelFallback) ++basic;});
                    if (basic !== 1) throw new Error('Unknown enemy/item did not render exactly one basic shape.');
                }
                for (const time of [1500, 250, 1000]) {
                    view.time(time); await wait(80);
                    const snapshot = await view.replay().getSnapshot(time);
                    view.renderer.render(0, view.replay().api(snapshot));
                    if (view.replay().error) throw view.replay().error;
                }
                const floorBatch = view.renderer.get('NativeSurfaces').root.children[0];
                if (!floorBatch || floorBatch.boundingBox.max.y > .2 || floorBatch.boundingBox.max.x-floorBatch.boundingBox.min.x < 4 || floorBatch.boundingBox.max.z-floorBatch.boundingBox.min.z < 4) throw new Error('Current-format native floor did not render horizontally at its recorded transform.');
                if (view.replay().error) throw view.replay().error;
                if (document.querySelector('[aria-label="Maximum Model Detail"]')) throw new Error('Obsolete model tier selector remains.');
                if (manifest.some(actor => !actor.model.file.startsWith('low/'))) throw new Error('Non-Low actor in runtime manifest.');
                const receipt = await fetch('../model-resources.json').then(response=>response.json());
                if (receipt.files.some(file=>file.path.split('/').some(part=>['mid','high','original'].includes(part)))) throw new Error('Non-Low resource was packaged.');
                await window.api.invoke('smokeCapture', 'native-scene-1440');
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
                if (${JSON.stringify(recording)}) {
                    await app.openFile(${JSON.stringify(recording)}, false);
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
                    navButton('Settings').click(); await wait(150);
                    if (document.querySelector('[aria-label="Maximum Model Detail"]')) throw new Error('Single-tier Viewer still exposes a detail selector.');
                    if (manifest.some(actor => !actor.model.file.startsWith('low/'))) throw new Error('An actor references a non-Low model.');
                    const assetReceipt = await fetch('../model-resources.json').then(response=>response.json());
                    if (assetReceipt.files.some(file=>file.path.split('/').some(part=>['mid','high','original'].includes(part)))) throw new Error('Non-Low resources were packaged.');
                    const modelDeadline = Date.now() + 30000;
                    while (![...real.renderer.get('Doors').values()].some(door=>door.native?.model) && Date.now()<modelDeadline) await wait(100);
                    if (![...real.renderer.get('Doors').values()].some(door=>door.native?.model)) throw new Error('Native Low door models did not load.');
                    document.querySelector('.app-settings .dialog-header button').click(); await wait(150);
                    if (real.replay().error || real.diagnosticLogs().some(log => log.type === 'error')) throw new Error('Real recording produced an application error: '+JSON.stringify({error:real.replay().error,logs:real.diagnosticLogs()}));
                    actual = {players:recordedPlayers.length,following:real.renderer.get('Controls').targetSlot(),duration:real.length(),blocks:real.replay().blocks.length,indexMs,events:real.replay().events.length,namedEvents:namedEvents.length,groups:true,keyboard:true,tooltip:true};
                    await window.api.invoke('smokeCapture','recording-events-1440');
                    navButton('Settings').click(); await wait(120); await window.api.invoke('smokeCapture','recording-settings-960',960);
                    if(document.querySelector('.transport').getBoundingClientRect().bottom > innerHeight+1) throw new Error('Transport clipped below window.');
                }
                document.querySelector('.app-settings .dialog-header button')?.click(); await wait(100);
                app.showLibrary();
                app.onLoadModule({success:false,module:'missing-test-profile',error:'Synthetic profile failure'});
                await wait(200);
                const profilesChecked = [];
                for (const name of ['template', 'mindcontrol', 'vanilla']) {
                    openSettings(); await wait(100);
                    const selector = document.querySelector('.app-settings [aria-label="Replay profile"]');
                    if (!selector) throw new Error('Settings inaccessible after a profile failure.');
                    selector.click(); await wait(100);
                    const option = [...document.querySelectorAll('[role="option"]')].find(node=>node.textContent===name);
                    if (!option) throw new Error('Profile option missing: '+name);
                    option.click(); await wait(200);
                    const loadedBy = Date.now()+45000;
                    while ((app.nav.error() || app.nav.module()!==name) && Date.now()<loadedBy) await wait(100);
                    if(app.nav.error() || app.nav.module()!==name) throw new Error('Profile failed to load: '+name+' '+document.body.innerText);
                    const items = await ASL_VM.load('../profiles/vanilla/datablocks/items/item.js'); await items.execution;
                    if(!items.exports.ItemDatablock.get({type:'Item',id:152})?.model) throw new Error('Artifact 152 missing from '+name);
                    await app.openFile(${JSON.stringify(fixture)}, false); await wait(150);
                    if(app.player.view.replay()?.error) throw new Error('Replay failed with '+name);
                    openSettings(); await wait(100);
                    if(document.querySelectorAll('.app-settings .settings-display').length!==1 || !document.querySelector('.app-settings [role="switch"]')) throw new Error('Settings body missing or duplicated after '+name);
                    document.querySelector('.app-settings .dialog-header button').click(); await wait(100);
                    profilesChecked.push(name);
                }
                app.showLibrary();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return {profile:app.nav.module(), profilesChecked, actual, labels, renderCalls, clipSeek:true, rapidSwitch:true, manifestEntries:Object.keys(manifest.models ?? manifest.actors ?? manifest).length, body:document.body.innerText.slice(0,1000)};
            })()`);
            fs.writeFileSync(path.join(output, 'library.png'), (await contents.capturePage()).toPNG());
            finish(true, result);
        } catch (error) { finish(false, error.stack || String(error)); }
    });
});
const {writeClip} = require(path.join(appDir, 'replay/clip.cjs'));
const floorAsset = JSON.parse(fs.readFileSync(path.join(root,'Viewer/assets/assets/environment/architecture/manifest.json'))).models.find(asset=>asset.capture.mesh==='g_BuildingPart_Lab_Floor_4x4_a');
if(!floorAsset) throw Error('Prepared lab floor fixture is missing.');
const header = new Map([
    ['ReplayRecorder.Header', {version:'0.0.1',isMaster:true,recorder:1n}],
    ['Vanilla.Map.NativeSurfaces', [{asset:floorAsset.id,revision:floorAsset.sourceRevision,dimension:0,enabled:true,matrix:[1,0,0,0,0,0,-1,0,0,1,0,0,-4,.1,0,1]}]],
    ['Vanilla.Map.Doors', new Map([[1,{id:1,serialNumber:41,dimension:0,type:'WeakDoor',size:'Small',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},modelName:'gate_4x4_weak_door(Clone)DOOR_41',isCheckpoint:false}]])],
    ['Vanilla.Map.Geometry', new Map([[0, [{vertices:new Float32Array([-8,0,-8, 8,0,-8, 8,0,8, -8,0,8]), indices:[0,2,1,0,3,2], themes:new Uint8Array(2)}]]])]
]);
const state = {time:0,tick:0,typedTime:new Map(),data:new Map()};
header.get('Vanilla.Map.NativeSurfaces').push({asset:'custom-rundown-floor',revision:'custom-material',dimension:0,enabled:true,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
header.get('Vanilla.Map.Doors').set(2,{...header.get('Vanilla.Map.Doors').get(1),id:2,serialNumber:42,position:{x:-5,y:0,z:0},modelName:'Custom_Rundown_Gate(Clone)'});
header.set('Vanilla.Map.Terminals',new Map([[101,{id:101,serialNumber:101,dimension:0,position:{x:5,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},modelName:'Custom_Rundown_Computer(Clone)'}]]));
header.set('Vanilla.Map.ResourceContainers',new Map([201,202].map(id => [id,{id,serialNumber:id,dimension:0,position:{x:id-200,y:0,z:3},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},modelName:'Custom_Container_'+id,isLocker:id===202,registered:true,assignedLock:'None',consumableType:{type:'Unknown',id:0,hash:'Unknown'}}])));
state.data.set('Vanilla.Enemy',new Map([[301,{id:301,dimension:0,position:{x:3,y:0,z:1},rotation:{x:0,y:0,z:0,w:1},scale:1.3,type:{type:'Enemy',id:99999,hash:'Enemy_99999'},health:100,head:true,players:new Set(),tagged:false,targetPlayerSlotIndex:255,consumedPlayerSlotIndex:255,stagger:Infinity,canStagger:false}]]));
state.data.set('Vanilla.Map.Items',new Map([[401,{id:401,dimension:0,position:{x:4,y:0,z:3},rotation:{x:0,y:0,z:0,w:1},onGround:true,linkedToMachine:false,serialNumber:65535,itemID:{type:'Item',id:99999,hash:'Item_99999'}}]]));
const timeline = Array.from({length:40}, (_,i) => ({time:(i+1)*50,tick:i+1,events:[],dynamics:new Map()}));
const fixtureReady = writeClip(fixture, {start:0,end:2000,sourceIdentity:'synthetic-desktop-test',blocks:[{id:0,start:0,end:2000}],typemap:new Map(),types:new Map(),header,events:[{id:0,time:100,kind:'Vanilla.Heartbeat',data:{}},{id:1,time:200,kind:'ReplayRecorder.Marker',data:{label:'Test marker'}},...[2,3].map(id=>({id,time:id*100,kind:'Vanilla.Enemy.Alert',data:{enemy:id,slot:0},participants:[{role:'player',type:'player',id:10,name:'\u5c0f\u660e'}]}))]}, async () => ({state,timeline}))
.catch(error => finish(false, error.stack));
// Exercise the viewer directly; the release updater has its own startup tests.
process.argv.push('--skip-launcher');
require(path.join(appDir, 'app.cjs'));
