const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const imports = fs.readFileSync(path.join(root,'Viewer/assets/src/main/main.html'),'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const source = fs.readFileSync(path.join(__dirname,'gear-smoke.html'),'utf8');
const destination = path.join(root,'artifacts/tests/gear');
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'index.html'),source.replace('<!-- IMPORTS -->',imports));
console.log('Open /artifacts/tests/gear/index.html on the local test server.');
