'use strict';
const assert=require('assert');

globalThis.UltravasanDataIndex=require('../docs/assets/data-index.js');
globalThis.ULTRAVASAN_BOOTSTRAP={
  meta:{
    data_contract:'u3-modular-v1',
    modular_data:{
      editions:{
        '1':{
          race_id:1,race_key:'u3-2026',
          json:'data/editions/u3-2026.json',
          js:'data/editions/u3-2026.js',
          global:'ULTRAVASAN_EDITION_1',
          splits:2
        }
      }
    }
  },
  races:[{id:1,race_key:'u3-2026',year:2026}],
  checkpoints:[
    {race_id:1,checkpoint_key:'half',name:'Half',sequence_no:1,distance_km:45},
    {race_id:1,checkpoint_key:'mora',name:'Mora',sequence_no:2,distance_km:90},
  ],
  stats:{},sources:[]
};
globalThis.ULTRAVASAN_HISTORY_INDEX={
  schema_version:1,
  identity_contract:'u2-person-key-v1',
  results:[{id:10,race_id:1,name_as_published:'Runner',person_key:'uvp_x'}]
};
globalThis.ULTRAVASAN_EDITION_1={
  schema_version:1,race_id:1,race_key:'u3-2026',
  splits:[
    {result_id:10,checkpoint_key:'half',elapsed_seconds:100},
    {result_id:10,checkpoint_key:'mora',elapsed_seconds:200},
  ]
};

const loader=require('../docs/assets/data-loader.js');

(async()=>{
  const core=await loader.loadCore();
  assert.strictEqual(core.results.length,1);
  assert.strictEqual(core.splits.length,0);
  assert.deepStrictEqual(loader.status().loadedRaceIds,[]);

  await loader.ensureEdition(1);
  assert.strictEqual(core.splits.length,2);
  assert.deepStrictEqual(loader.status().loadedRaceIds,[1]);
  const rows=globalThis.UltravasanDataIndex.splitsForResult(core,10);
  assert.strictEqual(rows.length,2);
  assert.strictEqual(rows[0].checkpoint_name,'Half');
  assert.strictEqual(rows[0].sequence_no,1);
  assert.strictEqual(rows[1].distance_km,90);

  await loader.ensureEdition(1);
  assert.strictEqual(core.splits.length,2,'edition loading must be idempotent');

  console.log('OK: U3 modular loader loads core first and edition splits incrementally');
})().catch(error=>{console.error(error);process.exitCode=1});
