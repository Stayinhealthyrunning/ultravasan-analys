'use strict';
const assert=require('assert');

global.ULTRAVASAN_DATA_CATALOG={
  mode:'modular',
  totals:{races:3,results:4,splits:5},
  result_family:{'1':'uv90','2':'uv90','3':'uv45','4':'uv45'},
  result_edition:{'1':'uv90-a','2':'uv90-b','3':'uv45-a','4':'uv45-a'},
  families:{uv90:{},uv45:{}},
  editions:{
    'uv90-a':{race_family:'uv90'},
    'uv90-b':{race_family:'uv90'},
    'uv45-a':{race_family:'uv45'}
  }
};
const loader=require('../docs/assets/data-loader.js');

const catalog=global.ULTRAVASAN_DATA_CATALOG;
assert.strictEqual(loader.editionForResultId(1,catalog),'uv90-a');
assert.strictEqual(loader.editionForResultId('3',catalog),'uv45-a');
assert.strictEqual(loader.editionForResultId(99,catalog),null);
assert.strictEqual(loader.familyForResultId(1,catalog),'uv90');
assert.strictEqual(loader.familyForResultId('3',catalog),'uv45');
assert.strictEqual(loader.familyForResultId(99,catalog),null);
assert.strictEqual(
  loader.familyForResultId(3,{result_edition:{'3':'uv45-a'},editions:{'uv45-a':{race_family:'uv45'}}}),
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

async function main(){
  global.ULTRAVASAN_DATA_EDITIONS={'uv90-a':a,'uv90-b':b};
  loader.clearCaches();
  const one=await loader.loadForResultIds([1]);
  assert.strictEqual(one,a,'ett result-ID ska ladda exakt sin edition');

  const two=await loader.loadForResultIds([1,2]);
  assert.deepStrictEqual(two.races.map(x=>x.id),[1,2]);
  assert.strictEqual(two.meta.data_scope.kind,'merged-editions');

  console.log('OK: U3 DataLoader routes result links to exact edition chunks and merges deterministically');
}
main().catch(error=>{console.error(error);process.exitCode=1});
