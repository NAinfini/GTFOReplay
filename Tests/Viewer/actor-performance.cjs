// Run with Electron. Only writes this benchmark's ignored artifact directory.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'artifacts/tests/actor-performance');
const modelProject = path.resolve(process.env.GTFO_MODEL_SITE_ROOT || path.join(root, '../Infini-GTFO-Model-Site'));
const readModel = file => fs.readFileSync(path.join(modelProject, file), 'utf8');
const ts = require(path.join(root, 'Viewer/assets/node_modules/typescript'));
fs.mkdirSync(output, { recursive: true });
const revisions = {};
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    revisions[file] = crypto.createHash('sha256').update(text).digest('hex');
    return text;
}
function compile(file, source) {
    const target = path.join(output, file);fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: true,
    } }).outputText);
}
const base = 'Viewer/assets/src/profiles/vanilla/';
for (const name of ['actor-rig', 'soft-tentacles', 'actor-colors', 'pod'])
    compile('replay/' + name + '.js', read('Viewer/assets/src/replay/' + name + '.ts'));
compile('actor.js', read(base + 'renderer/models/actor.ts').replace('../../library/actorCatalog.js', './actor-catalog.js').replace('../objectwrapper.js', './objectwrapper.js'));
compile('objectwrapper.js', read(base + 'renderer/objectwrapper.ts'));
compile('actor-catalog.js', read(base + 'library/actorCatalog.ts'));
compile('basicModel.js', read(base + 'renderer/models/basicModel.ts'));
compile('replay/moduleloader.js', 'export const ModuleLoader={reportWarning(message){throw Error(message)}};');
compile('animations.js', read(base + 'library/animations/lib.ts'));
compile('player-fingers.js', read(base + 'renderer/animations/player-fingers.ts'));
const human = ts.createSourceFile('human.ts', read(base + 'renderer/animations/human.ts'), ts.ScriptTarget.Latest, true);
const declarations = human.statements.filter(ts.isVariableStatement).filter(s => s.declarationList.declarations.some(d =>
    ['HumanJoints', 'PlayerJoints', 'defaultHumanStructure', 'defaultHumanPose'].includes(d.name.getText(human))));
const stick = ts.createSourceFile('stick.ts', read(base + 'renderer/models/stickfigure.ts'), ts.ScriptTarget.Latest, true);
const construct = stick.statements.find(s => ts.isClassDeclaration(s) && s.name.text === 'StickFigure').members.find(m => m.name?.getText(stick) === 'construct');
compile('driver.js', "import {fingerParents,HumanFingerJoints} from './player-fingers.js';\n" +
    declarations.map(s => s.getText(human)).join('\n') + '\nexport function construct(skeleton,fingers) ' + construct.body.getText(stick));
const helpers = ts.createSourceFile('bithelper.ts', read('Viewer/assets/src/replay/bithelper.ts'), ts.ScriptTarget.Latest, true);
compile('math.js', helpers.statements.filter(ts.isExpressionStatement).filter(s => s.getText(helpers).startsWith('Math.')).map(s => s.getText(helpers)).join('\n'));
const presets = JSON.parse(readModel('Tools/Models/actor-animation-presets.json'));
const coverage = JSON.parse(readModel('artifacts/enemy-animation-review/coverage.json'));
for (const [id, entry] of Object.entries(presets)) {
    entry.sampleFiles = {};
    for (const name of Object.values(entry.presets)) {
        const file = ['bishop', 'woods', 'hackett', 'dauda'].includes(id)
            ? 'Viewer/assets/assets/player-animations/' + name + '.json'
            : coverage.actors.find(a => a.actorId === id)?.sampledActions.find(a => a.clip === name)?.sampleFile;
        if (!file) throw Error('Missing verified source sample: ' + id + '/' + name);
        if (!file.startsWith('Viewer/assets/assets/')) {
            const local = 'samples/' + name + '.json';
            fs.mkdirSync(path.join(output, 'samples'), {recursive:true});
            fs.writeFileSync(path.join(output, local), readModel(file));
            entry.sampleFiles[name] = '/artifacts/tests/actor-performance/' + local;
        } else entry.sampleFiles[name] = '/' + file;
    }
}
fs.writeFileSync(path.join(output, 'presets.json'), JSON.stringify(presets));
fs.writeFileSync(path.join(output, 'index.html'), fs.readFileSync(path.join(__dirname, 'actor-performance.html')));
app.setPath('userData', path.join(output, 'electron-data'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const report = { completed: false, codeRevisions: revisions, hardware: {
    cpu: os.cpus()[0]?.model, logicalProcessors: os.cpus().length,
    systemMemoryBytes: os.totalmem(), os: os.platform() + ' ' + os.release(),
    electron: process.versions.electron, chrome: process.versions.chrome,
}, errors: [] };
const save = () => fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
const timeout = setTimeout(() => { report.error = 'Benchmark timed out';save();app.exit(1); }, 240000);
app.whenReady().then(async () => {
    const gpu = await app.getGPUInfo('complete');
    report.hardware.gpuDevices = gpu.gpuDevice;
    report.hardware.gpuAuxiliary = Object.fromEntries(Object.entries(gpu.auxAttributes || {}).filter(([key]) =>
        /^(glRenderer|glVendor|glVersion|driverVersion|driverVendor|optimus|amdSwitchable|inProcessGpu|passthroughCmdDecoder|sandboxed)$/.test(key)));
    report.hardware.gpuFeatureStatus = app.getGPUFeatureStatus();
    const win = new BrowserWindow({ show: false, width: 1920, height: 1080, useContentSize: true,
        webPreferences: { backgroundThrottling: false, offscreen: true } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) report.errors.push(message); });
    await win.loadURL('http://127.0.0.1:4320/artifacts/tests/actor-performance/index.html');
    await win.webContents.executeJavaScript('new Promise((resolve,reject)=>{const check=()=>window.setupError?reject(Error(window.setupError)):window.benchmarkReady?resolve():setTimeout(check,30);check()})');
    report.scene = await win.webContents.executeJavaScript('window.benchmarkDescription');save();
    report.runs = [];
    for (const config of [
        { name: 'animated-low', mode: 'animated', frames: 360 },
        { name: 'update-only-low', mode: 'update-only', frames: 240 },
        { name: 'render-only-low', mode: 'render-only', frames: 240 },
    ]) {
        const run = await win.webContents.executeJavaScript(`window.measureActors(${JSON.stringify(config)})`);
        report.runs.push(run);save();
        const png = await win.webContents.executeJavaScript('document.querySelector("canvas").toDataURL("image/png")');
        fs.writeFileSync(path.join(output, config.name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    }
    report.completed = true;
    report.cleanup = await win.webContents.executeJavaScript('window.disposeBenchmark()');
    save();clearTimeout(timeout);app.exit(report.errors.length ? 1 : 0);
}).catch(error => { report.error = String(error.stack || error);save();clearTimeout(timeout);app.exit(1); });
