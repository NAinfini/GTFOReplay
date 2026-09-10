// Exercise the actual Actor implementation with browser glTF/WebP loading.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'Viewer/assets/node_modules/typescript'));
const base = path.join(root, 'Viewer/assets/src/profiles/vanilla');
const output = path.join(root, 'artifacts/tests/models');
fs.mkdirSync(output, { recursive: true });
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
for (const name of ['actor-rig', 'soft-tentacles', 'actor-colors']) {
    const compiled = compile(fs.readFileSync(path.join(root, 'Viewer/assets/src/replay', name + '.ts'), 'utf8'));
    for (const directory of [path.join(root, 'Viewer/assets/build/replay'), path.join(output, 'replay')]) {
        fs.mkdirSync(directory, {recursive:true});
        fs.writeFileSync(path.join(directory, name + '.js'), compiled);
    }
}
fs.writeFileSync(path.join(output, 'actor.js'), compile(fs.readFileSync(path.join(base, 'renderer/models/actor.ts'), 'utf8').replace('../../library/actorCatalog.js', './actor-catalog.js').replace('../../library/actorDetail.js', './actor-detail.js').replace('../objectwrapper.js', './objectwrapper.js')));
fs.writeFileSync(path.join(output, 'objectwrapper.js'), compile(fs.readFileSync(path.join(base, 'renderer/objectwrapper.ts'), 'utf8')));
fs.writeFileSync(path.join(output, 'actor-catalog.js'), compile(fs.readFileSync(path.join(base, 'library/actorCatalog.ts'), 'utf8')));
fs.writeFileSync(path.join(output, 'actor-detail.js'), compile(fs.readFileSync(path.join(base, 'library/actorDetail.ts'), 'utf8')));
const enemyClips = fs.readdirSync(path.join(root, 'Viewer/assets/js3party/animations')).filter(name => /^(CA_|CF_)|_Hit_(Light|Heavy)_/.test(name) && name.endsWith('.json')).map(name => name.slice(0, -5));
fs.writeFileSync(path.join(output, 'enemy-clips.json'), JSON.stringify(enemyClips));
const human = ts.createSourceFile('human.ts', fs.readFileSync(path.join(base, 'renderer/animations/human.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const declarations = human.statements.filter(ts.isVariableStatement).filter(s => s.declarationList.declarations.some(d => ['HumanJoints','PlayerJoints','defaultHumanStructure','defaultHumanPose'].includes(d.name.getText(human))));
fs.writeFileSync(path.join(output, 'player-fingers.js'), compile(fs.readFileSync(path.join(base, 'renderer/animations/player-fingers.ts'), 'utf8')));
const stick = ts.createSourceFile('stick.ts', fs.readFileSync(path.join(base, 'renderer/models/stickfigure.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const construct = stick.statements.find(s=>ts.isClassDeclaration(s)&&s.name.text==='StickFigure').members.find(m=>m.name?.getText(stick)==='construct');
fs.writeFileSync(path.join(output, 'driver.js'), compile("import {fingerParents,HumanFingerJoints} from './player-fingers.js';\n"+declarations.map(s=>s.getText(human)).join('\n')+'\nexport function construct(skeleton, fingers) '+construct.body.getText(stick)));
console.log('Prepared browser runtime tests at Tests/Viewer/models-smoke.html');
const imports = fs.readFileSync(path.join(root, 'Viewer/assets/src/main/main.html'), 'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
fs.writeFileSync(path.join(output, 'profile.html'), `<!doctype html><meta charset="utf-8"><base href="/Viewer/assets/build/main/">
<title>Playback profile integration test</title><style>body{background:#171d20;color:#dce4e1;font:18px system-ui;white-space:pre-wrap;padding:24px}</style><p id="status">Loading actual playback modules…</p>${imports}<script type="module">
const status=document.querySelector('#status');
window.addEventListener('unhandledrejection',event=>{window.loadError=true;status.textContent=event.reason?.stack ?? String(event.reason)});
try {
 const {ASL_VM:vm}=await import('../replay/vm.js');
 const timeout=setTimeout(()=>{if(window.loadError)return;status.textContent='Module load timeout: '+JSON.stringify([...vm.requires].map(([m,p])=>[m.src,[...p]]));},15000);
 for (const path of ['datablocks/enemy/enemy-vanilla.js','renderer/player/model.js','renderer/enemy/render.js']) {
  await vm.load('../profiles/vanilla/'+path); status.textContent='Loaded '+path;
 }
 clearTimeout(timeout);status.textContent='PASS: Actual playback ASL profile, enemy catalog and player model loaded.';window.testResult={passed:true};
} catch(error){status.textContent=error.stack;window.testResult={passed:false,error:String(error)};console.error(error)}
</script>`);
