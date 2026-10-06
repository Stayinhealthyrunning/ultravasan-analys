'use strict';
const assert=require('assert');
const comparison=require('../docs/assets/comparison-2.js');

const model={
  available:true,
  results:[{id:1},{id:2}],
  pairwise_insights:{
    final_gap_seconds:125,
    leaders:{a:3,b:1,equal:0},
    lead_changes:2,
    nearest:{checkpoint_name:'Risberg',pair_gap_seconds:-8},
    largest_gap:{checkpoint_name:'Oxberg',pair_gap_seconds:320},
    most_time_won_a:{pair_delta_seconds:75},
    most_time_won_b:{pair_delta_seconds:-95},
  },
};
const participants=[
  {name:'Löpare A',year:2024},
  {name:'Löpare B',year:2025},
];
const view=comparison.createViewModel(model,participants);
assert.strictEqual(view.available,true);
assert.strictEqual(view.final,'Löpare A före med 2:05');
assert.deepStrictEqual(view.leaders,{a:3,b:1,equal:0});
assert.strictEqual(view.leadChanges,2);
assert.strictEqual(view.nearest.checkpoint_name,'Risberg');
assert.strictEqual(comparison.signedDuration(125),'+2:05');
assert.strictEqual(comparison.signedDuration(-8),'−0:08');
assert.strictEqual(comparison.percent(3.25),'+3,3 %');

const invalid=comparison.createViewModel({available:false,reason:'need-exactly-two-runners'},[]);
assert.strictEqual(invalid.available,false);
assert.strictEqual(invalid.reason,'need-exactly-two-runners');

console.log('OK: Comparison 2.0 view model och formattering');
