const { test } = require('node:test');
const assert = require('node:assert/strict');
const base = { query:'', dimension:0, type:'', includeUnknown:false, sort:'name' };
const entry = (id, type, serial, extra = {}) => ({id, type, serial, key:`${type}_${serial}`, known:true, dimension:0, onGround:true, ...extra});

test('finder combines type, dimension, search and availability without hiding duplicate labels', async () => {
    const { filterItems } = await import('../../Viewer/assets/src/profiles/vanilla/ui/pages/finder-filter.ts');
    const rows = [entry(1,'TERMINAL',10),entry(2,'TERMINAL',10),entry(3,'TERMINAL',12,{dimension:1}),entry(4,'GENERATOR',10),entry(5,'TERMINAL',10,{onGround:false}),entry(6,'Unknown',10,{known:false})];
    assert.deepEqual(filterItems(rows, {...base, type:'TERMINAL', query:'terminal 10'}).map(x=>x.id), [1,2]);
    assert.deepEqual(filterItems(rows, {...base, dimension:1}).map(x=>x.id), [3]);
    assert.equal(filterItems(rows, {...base, dimension:-1, includeUnknown:true}).length, 5);
    assert.equal(filterItems(rows, {...base, query:'no match'}).length, 0);
    assert.equal(rows.length,6);
});

test('finder sorts numbers naturally, puts unnumbered items last, and preserves source order', async () => {
    const { filterItems } = await import('../../Viewer/assets/src/profiles/vanilla/ui/pages/finder-filter.ts');
    const rows = [entry(1,'TERMINAL',10),entry(2,'TERMINAL',2),entry(3,'AMMO',65535),entry(4,'GENERATOR',4)];
    assert.deepEqual(filterItems(rows,base).map(x=>x.id),[3,4,2,1]);
    assert.deepEqual(filterItems(rows,{...base,sort:'number'}).map(x=>x.id),[2,4,1,3]);
    assert.deepEqual(filterItems(rows,{...base,sort:'number-desc'}).map(x=>x.id),[1,4,2,3]);
    assert.deepEqual(rows.map(x=>x.id),[1,2,3,4]);
});
