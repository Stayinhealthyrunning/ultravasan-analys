'use strict';
const assert=require('assert');
const {fieldFlowProgression}=require('../docs/assets/nerdlab.js');

const checkpoints=[
  {checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},
  {checkpoint_key:'high_point',name:'Högsta punkten',sequence_no:1,distance_km:null},
  {checkpoint_key:'smagan',name:'Smågan',sequence_no:2,distance_km:9},
  {checkpoint_key:'mangs',name:'Mångsbodarna',sequence_no:3,distance_km:24},
  {checkpoint_key:'eldris',name:'Eldris',sequence_no:4,distance_km:81},
  {checkpoint_key:'mora',name:'Mora',sequence_no:5,distance_km:90},
];
const rows=[
  {id:1,status:'DNS'},
  {id:2,status:'DNF'},
  {id:3,status:'DNF'},
  {id:4,status:'FINISHED',finish_seconds:36000},
  {id:5,status:'FINISHED',finish_seconds:36000},
  {id:6,status:'DNF'},
];
const splits=new Map([
  [1,[{checkpoint_key:'mora',elapsed_seconds:36000}]],
  [2,[{checkpoint_key:'smagan',elapsed_seconds:3000},{checkpoint_key:'mora',elapsed_seconds:35000}]],
  [3,[{checkpoint_key:'smagan',elapsed_seconds:3000},{checkpoint_key:'mangs',elapsed_seconds:8500}]],
  [4,[{checkpoint_key:'smagan',elapsed_seconds:3000},{checkpoint_key:'eldris',elapsed_seconds:28000},{checkpoint_key:'mora',elapsed_seconds:36000}]],
  [5,checkpoints.filter(checkpoint=>checkpoint.distance_km!=null&&checkpoint.sequence_no>0).map((checkpoint,index)=>({checkpoint_key:checkpoint.checkpoint_key,elapsed_seconds:(index+1)*7000}))],
  [6,[{checkpoint_key:'smagan',elapsed_seconds:3000},{checkpoint_key:'mangs',elapsed_seconds:8500,is_estimated:true},{checkpoint_key:'eldris',elapsed_seconds:28000},{checkpoint_key:'mora',elapsed_seconds:35000}]],
]);
const originalRows=JSON.stringify(rows),originalCheckpoints=JSON.stringify(checkpoints),originalSplits=JSON.stringify([...splits]);
const flow=fieldFlowProgression(rows,checkpoints,id=>splits.get(id),row=>row.status!=='DNS');

assert.strictEqual(flow.starters.length,5,'DNS är inte en faktisk startande, även om rå Mora-observation finns');
assert.strictEqual(flow.passedByResult.has(1),false,'DNS-observation får inte tas in i progressionen');
assert.strictEqual(flow.passedByResult.get(2),1,'sen Mora-råobservation får inte fylla saknade mellanpassager efter tidig DNF-passage');
assert.strictEqual(flow.passedByResult.get(3),2,'normal sammanhängande DNF-serie följer säkra passager');
assert.strictEqual(flow.passedByResult.get(4),1,'FINISHED med saknad mellanpassage får inte hoppa vidare till senare råpassager');
assert.strictEqual(flow.passedByResult.get(5),4,'komplett FINISHED-serie passerar hela kontrollkedjan');
assert.strictEqual(flow.passedByResult.get(6),1,'estimerad passage bryter progression och uppgraderas inte');
assert.deepStrictEqual(flow.stages.map(stage=>stage.count),[5,5,2,1,1], 'icke-kontroll med okänd distans får inte blockera första verkliga kontrollen');
assert.strictEqual(JSON.stringify(rows),originalRows,'resultatrådata ska förbli oförändrad');
assert.strictEqual(JSON.stringify(checkpoints),originalCheckpoints,'checkpointdefinitionerna ska förbli oförändrade');
assert.strictEqual(JSON.stringify([...splits]),originalSplits,'råa splitobservationer ska förbli oförändrade');

console.log('OK: Field flow räknar endast sammanhängande exakta passager och bevarar rådata');
