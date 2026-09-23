'use strict';
const assert=require('assert');
const loader=require('../docs/assets/data-loader.js');

const rows=loader.uniqueResults([{id:1,race_id:1},{id:1,race_id:1},{id:2,race_id:2}]);
assert.deepStrictEqual(rows.map(x=>x.id),[1,2]);

const splits=loader.uniqueSplits([
  {result_id:1,checkpoint_key:'a',elapsed_seconds:1},
  {result_id:1,checkpoint_key:'a',elapsed_seconds:2},
  {result_id:1,checkpoint_key:'b',elapsed_seconds:3},
]);
assert.strictEqual(splits.length,2);
assert.strictEqual(splits[0].elapsed_seconds,2);

const target={results:[{id:1}]};
assert.strictEqual(loader.mergeRows(target,'results',[{id:1},{id:2}],row=>row.id),1);
assert.deepStrictEqual(target.results.map(x=>x.id),[1,2]);

console.log('OK: U3 DataLoader deduplicerar modulära resultat och splits deterministiskt');
