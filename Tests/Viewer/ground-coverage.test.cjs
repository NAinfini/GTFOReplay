const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ground=require('../../Tools/native-ground-coverage.cjs');
const coverage=require('../../Tools/data/native-ground-coverage.json');
const catalog=require('../../Viewer/assets/assets/environment/architecture/manifest.json');
const source=process.env.GTFO_MODEL_SITE_ROOT??path.resolve(__dirname,'../../../Infini-GTFO-Model-Site');
const selected=['floor','prop'].flatMap(kind=>require(`../../Tools/data/native-${kind}s.json`).map(row=>({...row,kind})));
test('all source ground candidates are reviewed and every selected identity reaches Recorder/Viewer',{skip:!fs.existsSync(source)},()=>{
    const originals=ground.readOriginals(source);
    assert.deepEqual(coverage.sourceManifests,ground.sourceManifests);
    ground.validateGroundCoverage(originals,selected,coverage);
    for(const entry of coverage.entries.filter(row=>!row.excluded)){
        const installed=catalog.models.find(row=>row.id===entry.id);assert.ok(installed,entry.id);
        assert.equal(installed.kind,entry.kind);
        assert.equal(installed.sourceRevision,originals.find(row=>row.assetId===entry.id).sourceRevision);
    }
});
test('generic names and misleading website categories cannot conceal prefab or material ground evidence',()=>{
    for(const name of ['g_main','g_main008','g_mesh','g_4x2M','g_concrete','g_wall']){
        for(const evidence of ['material','prefab']){
            const row={assetId:'new-floor',category:'unrelated-category',sourceRevision:'revision',source:{name,hierarchy:evidence==='prefab'?['BuildingPart_ForestGround_4x2']:[]},materials:evidence==='material'?[{name:'RefineryFloorPlate'}]:[]};
            assert.equal(ground.isGroundCandidate(row),true);
            assert.throws(()=>ground.validateGroundCoverage([row],[],{entries:[]}),/requires review/);
            const review={entries:[{id:row.assetId,kind:'floor',evidenceRevision:ground.evidenceRevision(row)}]};
            assert.throws(()=>ground.validateGroundCoverage([row],[],review),/missing from capture catalog/);
            const pin={asset_id:row.assetId,source_revision:row.sourceRevision,kind:'floor'};
            assert.equal(ground.validateGroundCoverage([row],[pin],review),1);
            row.materials.push({name:'changed'});
            assert.throws(()=>ground.validateGroundCoverage([row],[pin],review),/requires review/);
        }
    }
});
test('exclusions cannot silently become selected floors and stale source reviews fail',()=>{
    const row={assetId:'collision',category:'architecture-floors',sourceRevision:'rev',source:{name:'c_floor'},materials:[]};
    const review={entries:[{id:row.assetId,excluded:'collision renderer',evidenceRevision:ground.evidenceRevision(row)}]};
    assert.equal(ground.validateGroundCoverage([row],[],review),1);
    assert.throws(()=>ground.validateGroundCoverage([row],[{asset_id:row.assetId}],review),/Excluded/);
    assert.throws(()=>ground.validateGroundCoverage([],[],review),/Stale/);
});

test('known floor-named generation markers and collision shells cannot re-enter the visible catalog',()=>{
    for(const mesh of ['SM_refinery_deco_wall_floor_8x4','SM_refinery_deco_wall_floor_4x4','SM_dead_body_floor_85x195x35','SM_dead_body_floor_400x400x35','cBuildingPart_Octagon_2x2x4']){
        const entry=coverage.entries.find(row=>row.mesh===mesh);
        assert.ok(entry?.excluded,mesh);
        assert.ok(!selected.some(row=>row.asset_id===entry.id),mesh);
    }
});

test('excluded scenery is neither packaged nor captured, while all supporting floors remain selected',()=>{
    const exclusions=coverage.entries.filter(row=>row.excluded?.startsWith('viewer scenery:'));
    assert.ok(exclusions.length>=44);
    assert.deepEqual(new Set(catalog.excluded),new Set(exclusions.map(row=>row.id)));
    assert.deepEqual(new Set(catalog.models.map(row=>row.id)),new Set(selected.map(row=>row.asset_id)));
    for(const row of exclusions){
        assert.ok(!catalog.models.some(model=>model.id===row.id),row.mesh);
        assert.ok(!fs.existsSync(path.resolve(__dirname,'../../Viewer/assets/assets/environment/architecture/low',row.id+'.glb')),row.mesh);
    }
    for(const mesh of ['g_ground_rocks_01','g_cliff_walkway_small','g_BuildingPart_StorageGround_Rock_4x4_a','g_ServicePart_ServiceGroundGravel_Rock_2x2x2_a']){
        assert.ok(catalog.models.some(row=>row.kind==='floor'&&row.capture.mesh===mesh),mesh);
    }
});
