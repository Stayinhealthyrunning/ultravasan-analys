'use strict';
const assert=require('assert');
const loader=require('../docs/assets/data-loader.js');

const catalog={
  mode:'modular',
  totals:{races:3,results:4,splits:5},
  result_family:{'1':'uv90','2':'uv90','3':'uv45','4':'uv45'},
  families:{uv90:{},uv45:{}}
};
assert.strictEqual(loader.familyForResultId(1,catalog),'uv90');
assert.strictEqual(loader.familyForResultId('3',catalog),'uv45');
assert.strictEqual(loader.familyForResultId(99,catalog),null);
assert.strictEqual(loader.normalizeFamily('uv45'),'uv45');
assert.strictEqual(loader.normalizeFamily('anything'),'uv90');

const a={
  meta:{identity_contract:'u2-person-key-v1'},
  races:[{id:1},{id:2}],
  checkpoints:[{race_id:1,checkpoint_key:'a'}],
  results:[{id:10,race_id:1},{id:11,race_id:2}],
  splits:[{result_id:10,checkpoint_key:'a'}],
  stats:{'1':{count:1}},
  sources:[{code:'x'}]
};
const b={
  meta:{identity_contract:'u2-person-key-v1'},
  races:[{id:3}],
  checkpoints:[{race_id:3,checkpoint_key:'b'}],
  results:[{id:12,race_id:3}],
  splits:[{result_id:12,checkpoint_key:'b'}],
  stats:{'3':{count:1}},
  sources:[{code:'x'},{code:'y'}]
};
const merged=loader.mergeDatasets([a,b]);
assert.deepStrictEqual(merged.races.map(x=>x.id),[1,2,3]);
assert.deepStrictEqual(merged.results.map(x=>x.id),[10,11,12]);
assert.strictEqual(merged.sources.length,2);
assert.strictEqual(merged.splits.length,2);
assert.strictEqual(merged.meta.data_scope.kind,'merged-families');

console.log('OK: U3 DataLoader contracts preserve family routing and deterministic merge');
