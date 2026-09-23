'use strict';
const assert=require('assert');
const adapter=require('../docs/assets/data-adapter.js');

const dataset={
  meta:{data_scope:{kind:'test'}},
  races:[{id:'21',race_key:'ultravasan90-2025',year:'2025',distance_km:'92.0'}],
  checkpoints:[
    {race_id:'21',checkpoint_key:'start',name:'Start Sälen',sequence_no:'0',distance_km:'0'},
    {race_id:'21',checkpoint_key:'mora',name:'Mora mål',sequence_no:'1',distance_km:'92'},
  ],
  results:[{
    id:'101',race_id:'21',name_as_published:'Testlöpare',status:'FINISHED',
    finish_seconds:'36000',overall_place:'5',pace_seconds_per_km:'391.3'
  }],
  splits:[{
    result_id:'101',checkpoint_key:'mora',elapsed_seconds:'36000',
    segment_seconds:'36000',pace_seconds_per_km:'391.3',place_overall:'5'
  }],
  stats:{'21':{count:1}},
  sources:[{code:'test'}],
};

const statusApi={
  buildSplitEvidence:splits=>new Set(splits.map(split=>split.result_id))
};
const replayApi={
  deriveOverallPlacements:results=>new Map(results.map(result=>[result.id,result.overall_place])),
  deriveClassPlacements:results=>new Map(results.map(result=>[result.id,result.class_place??null])),
};

const hydrated=adapter.hydrate(dataset,{statusApi,replayApi});
assert.strictEqual(hydrated,dataset,'adaptern ska hydrera samma datasetobjekt');
assert.strictEqual(hydrated.races[0].id,21);
assert.strictEqual(hydrated.races[0].year,2025);
assert.strictEqual(hydrated.results[0].id,101);
assert.strictEqual(hydrated.results[0].finish_seconds,36000);
assert.strictEqual(hydrated.splits[0].result_id,101);
assert.strictEqual(hydrated.splits[0].elapsed_seconds,36000);
assert.strictEqual(hydrated.splits[0].checkpoint_name,'Mora mål');
assert.strictEqual(hydrated.splits[0].sequence_no,1);
assert.strictEqual(hydrated.splits[0].distance_km,92);
assert.strictEqual(hydrated.splits[0].is_estimated,0);
assert.ok(hydrated.splitsByResult instanceof Map);
assert.strictEqual(hydrated.splitsByResult.get(101)[0],hydrated.splits[0]);
assert.ok(hydrated.splitEvidence.has(101));
assert.strictEqual(hydrated.overallPlacementLookup.get(101),5);
assert.strictEqual(Object.prototype.propertyIsEnumerable.call(hydrated,'splitsByResult'),false);
assert.strictEqual(Object.prototype.propertyIsEnumerable.call(hydrated,'splitEvidence'),false);
assert.strictEqual(Object.prototype.propertyIsEnumerable.call(hydrated,'__ultravasanHydrated'),false);

const again=adapter.hydrate(hydrated,{statusApi,replayApi});
assert.strictEqual(again,hydrated);
assert.strictEqual(again.splitsByResult,hydrated.splitsByResult,'index ska inte byggas om');

const minimal=adapter.normalizeBase({
  races:[{id:21,race_key:'ultravasan90-2025',year:2025}],
  results:[],checkpoints:[],splits:[]
});
assert.deepStrictEqual(minimal.sources,[]);
assert.deepStrictEqual(minimal.stats,{});

console.log('OK: U4 DataAdapter normaliserar och berikar delad app-/kartdata deterministiskt');
