'use strict';
const assert=require('assert');
const H=require('../docs/assets/history-intelligence.js');

const races=[
  {id:1,race_key:'ultravasan90-2019',year:2019,distance_km:90},
  {id:2,race_key:'ultravasan90-2023',year:2023,distance_km:92},
  {id:3,race_key:'ultravasan90-2024',year:2024,distance_km:92,whole_course_comparison_group:'ultravasan90-2024-2025'},
  {id:4,race_key:'ultravasan90-2025',year:2025,distance_km:92,whole_course_comparison_group:'ultravasan90-2024-2025'},
  {id:5,race_key:'ultravasan90-2026',year:2026,distance_km:92},
];
const results=[];
let id=1;
function addRace(raceId,yearTimes,{dnf=0,women=2,personKey=null}={}){
  yearTimes.forEach((seconds,index)=>results.push({
    id:id++,race_id:raceId,status:'FINISHED',finish_seconds:seconds,
    sex:index<women?'F':'M',person_key:personKey&&index===0?personKey:null,
    name_as_published:personKey&&index===0?'Test Runner':'Runner '+raceId+'-'+index,
    overall_place:index+1
  }));
  for(let index=0;index<dnf;index++)results.push({id:id++,race_id:raceId,status:'DNF',finish_seconds:null,sex:'M',name_as_published:'DNF '+raceId+'-'+index});
}
addRace(1,[30000,31000,32000,33000,34000],{dnf:1});
addRace(2,[36000,37000,38000,39000,40000],{dnf:1});
addRace(3,[33000,34000,35000,36000,37000],{dnf:2});
addRace(4,[31500,32500,33500,34500,35500],{dnf:1});
addRace(5,[31000,32000,33000,34000,35000],{dnf:1});
const dataset={races,results,splits:[],checkpoints:[]};

assert.strictEqual(H.comparisonKeyForRace(races[0]),null,'pre-2023 reference route saknar explicit verifierad helbaneserie');
assert.strictEqual(H.comparisonKeyForRace(races[1]),null,'2023 ska också faila stängt tills helbanans likvärdighet är verifierad');
assert.strictEqual(H.sameWholeCourse(races[1],races[2]),false);
assert.strictEqual(H.sameWholeCourse(races[0],races[1]),false);

const fp=H.fingerprint(dataset,races[3],{currentResults:results.filter(r=>r.race_id===4),referenceResults:results});
assert.deepStrictEqual([...fp.performance_reference_years],[2024],'2025 ska använda 2024 som enda verifierade helbanereferens');
const finishMetric=fp.metrics.find(metric=>metric.id==='finish_difficulty');
assert.strictEqual(finishMetric.reference_n,1);
assert.strictEqual(finishMetric.available,false,'ett referensår räcker inte för publicerat prestationsindex');
assert.ok(finishMetric.note.includes('Inga andra loppår med verifierad bansträckningsserie har tillräckligt underlag'));
assert.strictEqual(fp.metrics.find(metric=>metric.id==='female_share').reference_scope,'family-race-medians');
assert.deepStrictEqual([...fp.structural_reference_years],[2019,2023,2024],'deltagandemått får fortfarande använda tidigare loppår');
const fp2026=H.fingerprint(dataset,races[4],{currentResults:results.filter(r=>r.race_id===5),referenceResults:results});
assert.deepStrictEqual([...fp2026.performance_reference_years],[],'2026 ska inte ärva helbanereferenser från checkpointkontraktet');
assert.strictEqual(fp2026.metrics.find(metric=>metric.id==='finish_difficulty').available,false);
assert.ok(fp2026.performance_exclusions.some(item=>item.year===2019&&item.reason==='no verified whole-course group'));
assert.ok(fp2026.performance_exclusions.some(item=>item.year===2025&&item.reason==='no verified whole-course group'));

const sexFiltered=H.fingerprint(dataset,races[3],{
  currentResults:results.filter(r=>r.race_id===4&&r.sex==='F'),
  referenceResults:results.filter(r=>r.sex==='F'),
  sexFilterActive:true
});
assert.strictEqual(sexFiltered.metrics.find(metric=>metric.id==='female_share').available,false,'kvinnorepresentation ska inte låtsas vara meningsfull under aktivt könsfilter');

const personRows=[
  {id:9001,race_id:1,status:'FINISHED',finish_seconds:40000,sex:'M',person_key:'p1',name_as_published:'Historik Test'},
  {id:9002,race_id:2,status:'FINISHED',finish_seconds:39000,sex:'M',person_key:'p1',name_as_published:'Historik Test'},
  {id:9003,race_id:3,status:'FINISHED',finish_seconds:37000,sex:'M',person_key:'p1',name_as_published:'Historik Test'},
  {id:9004,race_id:4,status:'FINISHED',finish_seconds:36000,sex:'M',person_key:'p1',name_as_published:'Historik Test'},
];
const personDataset={...dataset,results:[...results,...personRows]};
const ph=H.personHistory(personDataset,9004);
assert.strictEqual(ph.verified_person,true);
assert.strictEqual(ph.comparable_series.length,1,'2024–2025 ska bilda exakt en verifierad sluttidsserie');
assert.deepStrictEqual([...ph.focus_series.years],[2024,2025]);
assert.strictEqual(ph.focus_series.count,2);
assert.strictEqual(ph.incomparable_to_focus_count,2,'2019 och 2023 ska visas separat från den verifierade 2024–2025-serien');

const unverified=[
  {id:9101,race_id:2,status:'FINISHED',finish_seconds:39000,sex:'M',name_as_published:'Samma Namn'},
  {id:9102,race_id:3,status:'FINISHED',finish_seconds:38000,sex:'M',name_as_published:'Samma Namn'},
];
const unverifiedDataset={...dataset,results:[...results,...unverified]};
const uh=H.personHistory(unverifiedDataset,9101);
assert.strictEqual(uh.verified_person,false);
assert.strictEqual(uh.rows.length,1,'namn får inte skapa flerårshistorik');
assert.strictEqual(uh.comparable_series.length,0);

const hallDataset={...dataset,results:[...results,...personRows]};
const improved=H.hallOfFame(hallDataset,'uv90','improved').rows.find(row=>row.identity_key==='person:p1');
assert.ok(improved,'förbättring inom verifierad 2024–2025-serie ska kunna rankas');
assert.strictEqual(improved.score,1000);
assert.strictEqual(improved.scope,'group:ultravasan90-2024-2025');

const chargeRace={id:20,race_key:'ultravasan90-2025',year:2025,distance_km:92};
const chargeResults=[
  {id:9201,race_id:20,status:'FINISHED',finish_seconds:35000,sex:'M',name_as_published:'Charger A'},
  {id:9202,race_id:20,status:'FINISHED',finish_seconds:36000,sex:'M',name_as_published:'Charger B'},
  {id:9203,race_id:20,status:'FINISHED',finish_seconds:37000,sex:'F',name_as_published:'Charger C'},
  {id:9204,race_id:20,status:'DNF',sex:'M',name_as_published:'DNF'},
];
const chargeSplits=[
  {result_id:9201,checkpoint_key:'evertsberg',elapsed_seconds:19000,place_overall:4,is_estimated:false},
  {result_id:9201,checkpoint_key:'mora',elapsed_seconds:35000,place_overall:1,is_estimated:false},
  {result_id:9202,checkpoint_key:'evertsberg',elapsed_seconds:19500,place_overall:3,is_estimated:false},
  {result_id:9202,checkpoint_key:'mora',elapsed_seconds:36000,place_overall:2,is_estimated:false},
  {result_id:9203,checkpoint_key:'evertsberg',elapsed_seconds:20000,place_overall:2,is_estimated:true},
  {result_id:9203,checkpoint_key:'mora',elapsed_seconds:37000,place_overall:3,is_estimated:false},
];
const chargeDataset={races:[chargeRace],results:chargeResults,splits:chargeSplits,checkpoints:[]};
const chargers=H.hallOfFame(chargeDataset,'uv90','chargers').rows;
assert.strictEqual(chargers.length,2,'estimerad placeringspassage får inte ingå i avslutningsrankingen');
assert.strictEqual(chargers[0].raw_gain,3);
assert.strictEqual(chargers[0].score,75,'placeringslyft ska normaliseras mot faktiska startande');

console.log('OK: U7 History Intelligence låser personidentitet, CourseVersion-serier, fingeravtryck och Hall of Fame');
