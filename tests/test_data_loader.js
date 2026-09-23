'use strict';
const assert=require('assert');

global.ULTRAVASAN_DATA_CATALOG={
  mode:'modular',
  totals:{races:3,results:4,splits:5},
  result_edition:{'1':101,'2':102,'3':201,'4':201},
  families:{
    uv90:{core:{},split_data:{}},
    uv45:{core:{},split_data:{}}
  },
  editions:{
    '101':{race_key:'uv90-a',race_family:'uv90'},
    '102':{race_key:'uv90-b',race_family:'uv90'},
    '201':{race_key:'uv45-a',race_family:'uv45'}
  }
};
const loader=require('../docs/assets/data-loader.js');

const catalog=global.ULTRAVASAN_DATA_CATALOG;
assert.strictEqual(loader.editionForResultId(1,catalog),'101');
assert.strictEqual(loader.editionForResultId('3',catalog),'201');
assert.strictEqual(loader.editionForResultId(99,catalog),null);
assert.strictEqual(loader.familyForResultId(1,catalog),'uv90');
assert.strictEqual(loader.familyForResultId('3',catalog),'uv45');
assert.strictEqual(loader.familyForResultId(99,catalog),null);
assert.strictEqual(
  loader.familyForResultId(3,{result_edition:{'3':201},editions:{'201':{race_family:'uv45'}}}),
  'uv45',
  'familjen ska kunna härledas från edition-indexet'
);
assert.strictEqual(loader.normalizeFamily('uv45'),'uv45');
assert.strictEqual(loader.normalizeFamily('anything'),'uv90');

const a={
  meta:{identity_contract:'u2-person-key-v1',data_scope:{kind:'race-edition',race_key:'uv90-a'}},
  races:[{id:1}],
  checkpoints:[{race_id:1,checkpoint_key:'a'}],
  results:[{id:1,race_id:1}],
  splits:[{result_id:1,checkpoint_key:'a'}],
  stats:{'1':{count:1}},
  sources:[{code:'x'}]
};
const b={
  meta:{identity_contract:'u2-person-key-v1',data_scope:{kind:'race-edition',race_key:'uv90-b'}},
  races:[{id:2}],
  checkpoints:[{race_id:2,checkpoint_key:'b'}],
  results:[{id:2,race_id:2}],
  splits:[{result_id:2,checkpoint_key:'b'}],
  stats:{'2':{count:1}},
  sources:[{code:'x'},{code:'y'}]
};
const merged=loader.mergeDatasets([a,b]);
assert.deepStrictEqual(merged.races.map(x=>x.id),[1,2]);
assert.deepStrictEqual(merged.results.map(x=>x.id),[1,2]);
assert.strictEqual(merged.sources.length,2);
assert.strictEqual(merged.splits.length,2);
assert.strictEqual(merged.meta.data_scope.kind,'merged-editions');

const familyCore={
  meta:{identity_contract:'u2-person-key-v1',data_scope:{kind:'race-family-core',race_family:'uv90'}},
  races:[{id:1},{id:2}],
  checkpoints:[{race_id:1,checkpoint_key:'a'},{race_id:2,checkpoint_key:'b'}],
  results:[{id:1,race_id:1},{id:2,race_id:2}],
  splits:[],
  stats:{'1':{count:1},'2':{count:1}},
  sources:[{code:'x'}]
};
const familySplits={
  meta:{identity_contract:'u2-person-key-v1',data_scope:{kind:'race-family-splits',race_family:'uv90'}},
  races:[],checkpoints:[],results:[],
  splits:[{result_id:1,checkpoint_key:'a'},{result_id:2,checkpoint_key:'b'}],
  stats:{},sources:[]
};

async function main(){
  global.ULTRAVASAN_DATA_FAMILY_CORES={uv90:familyCore};
  global.ULTRAVASAN_DATA_FAMILY_SPLITS={uv90:familySplits};
  loader.clearCaches();

  const core=await loader.loadFamilyCore('uv90');
  assert.strictEqual(core,familyCore,'första paint ska kunna använda endast family core');
  assert.strictEqual(core.splits.length,0);

  const full=await loader.loadFamily('uv90');
  assert.deepStrictEqual(full.races.map(x=>x.id),[1,2]);
  assert.deepStrictEqual(full.results.map(x=>x.id),[1,2]);
  assert.strictEqual(full.splits.length,2);
  assert.deepStrictEqual(full.meta.data_scope,{kind:'race-family',race_family:'uv90',data_parts:['core','splits']});

  global.ULTRAVASAN_DATA_EDITIONS={'101':a,'102':b};
  loader.clearCaches();
  const one=await loader.loadForResultIds([1]);
  assert.strictEqual(one,a,'ett result-ID ska ladda exakt sin edition');

  const two=await loader.loadForResultIds([1,2]);
  assert.deepStrictEqual(two.races.map(x=>x.id),[1,2]);
  assert.strictEqual(two.meta.data_scope.kind,'merged-editions');

  global.location={protocol:'file:'};
  loader.clearCaches();
  const offline=await loader.loadForResultIds([1]);
  assert.strictEqual(offline.splits.length,2,'file:// ska falla tillbaka till komplett family core+splits');
  assert.strictEqual(offline.meta.data_scope.kind,'race-family');
  delete global.location;

  console.log('OK: U3 DataLoader supports progressive core, full family, edition routing and offline fallback');
}
main().catch(error=>{console.error(error);process.exitCode=1});
