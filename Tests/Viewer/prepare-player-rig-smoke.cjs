const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const imports = fs.readFileSync(path.join(root, 'Viewer/assets/src/main/main.html'), 'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const output = path.join(root, 'artifacts/tests/player-rig');
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'index.html'), fs.readFileSync(path.join(__dirname, 'player-rig-smoke.html'), 'utf8').replace('<!-- IMPORTS -->', imports));
console.log('Open /artifacts/tests/player-rig/index.html on the local test server.');
