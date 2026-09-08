const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../../Viewer/assets/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/async-script-loader.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
test('module and nested dependency failures reject instead of hanging the profile',{timeout:3000},async t=>{
 t.mock.method(globalThis,'fetch',async url=>new Response(String(url).endsWith('root.js')
  ? 'await require("./bad.js");' : String(url).endsWith('bad.js')
  ? 'throw new Error("missing actor asset");' : 'exports.answer=42;'));
 const vm=new mod.exports.VM({},'http://fixture/');
 await assert.rejects(vm.load('root.js'),/missing actor asset/);
 const good=await vm.load('good.js');assert.equal(good.exports.answer,42);
 await vm.dispose();
});
