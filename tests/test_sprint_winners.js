'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {finishSprintRanking,sprintClassOptions,sprintClassGroupKey}=require('../docs/assets/nerdlab.js');

const rows=[
  {id:1,status:'FINISHED',finish_seconds:36000,sex:'F',age_class:'W50',overall_place:101,name_as_published:'Kvinna A'},
  {id:2,status:'FINISHED',finish_seconds:36100,sex:'F',age_class:'W50',overall_place:90,name_as_published:'Kvinna B'},
  {id:3,status:'FINISHED',finish_seconds:36200,sex:'M',age_class:'M50',overall_place:20,name_as_published:'Man A'},
  {id:4,status:'FINISHED',finish_seconds:36300,sex:'M',age_class:'M50',overall_place:30,name_as_published:'Man B'},
  {id:5,status:'FINISHED',finish_seconds:36400,sex:'M',age_class:'M55',overall_place:40,name_as_published:'Estimerad'},
  {id:6,status:'DNF',finish_seconds:null,sex:'F',age_class:'W50',overall_place:null,name_as_published:'DNF'},
  {id:7,status:'FINISHED',finish_seconds:36600,sex:'F',age_class:'W55',overall_place:120,name_as_published:'Orimlig'}
];
const splits=new Map([
  [1,[{checkpoint_key:'mora_warning',checkpoint_name:'Mora Förvarning',elapsed_seconds:35800,distance_km:91.3,is_estimated:false}]],
  [2,[{checkpoint_key:'mora_warning',checkpoint_name:'Mora Förvarning',elapsed_seconds:35900,distance_km:91.3,is_estimated:false}]],
  [3,[{checkpoint_key:'mora_warning',checkpoint_name:'Mora Förvarning',elapsed_seconds:36000,distance_km:91.3,is_estimated:false}]],
  [4,[{checkpoint_key:'mora_warning',checkpoint_name:'Mora Förvarning',elapsed_seconds:36100,distance_km:91.3,is_estimated:false}]],
  [5,[{checkpoint_key:'mora_warning',checkpoint_name:'Mora Förvarning',elapsed_seconds:36200,distance_km:91.3,is_estimated:true}]],
  [7,[{checkpoint_key:'mora_warning',checkpoint_name:'Mora Förvarning',elapsed_seconds:36550,distance_km:91.3,is_estimated:false}]]
]);

const model=finishSprintRanking(rows,{getSplits:id=>splits.get(id)||[],isFinished:r=>r.status==='FINISHED',raceDistanceKm:92});
assert.strictEqual(model.rows.length,4,'DNF, estimerad passage och orimlig spurtfart ska uteslutas');
assert.deepStrictEqual(model.women.map(x=>x.rank),[1,1],'lika spurttid ska ge delad placering');
assert.deepStrictEqual(new Set(model.women.map(x=>x.r.id)),new Set([1,2]),'båda kvinnorna ska finnas kvar vid delad placering');
assert.deepStrictEqual(model.men.map(x=>x.rank),[1,1],'män ska rangordnas separat');
assert.deepStrictEqual(new Set(model.men.map(x=>x.r.id)),new Set([3,4]),'båda männen ska finnas kvar vid delad placering');

const classModel=finishSprintRanking(rows,{getSplits:id=>splits.get(id)||[],isFinished:r=>r.status==='FINISHED',classKey:sprintClassGroupKey('M50'),raceDistanceKm:92});
assert.deepStrictEqual(new Set(classModel.women.map(x=>x.r.id)),new Set([1,2]),'klassfiltret ska para kvinnlig och manlig motsvarighet');
assert.deepStrictEqual(new Set(classModel.men.map(x=>x.r.id)),new Set([3,4]),'klassfiltret ska para kvinnlig och manlig motsvarighet');
const options=sprintClassOptions(rows);
const age50=options.find(x=>x.value===sprintClassGroupKey('W50'));
assert.ok(age50&&age50.label.includes('W50')&&age50.label.includes('M50'),'klassväljaren ska behålla båda könens klassetiketter');

const tieRows=[];
const tieSplits=new Map();
for(let i=1;i<=7;i++){
  tieRows.push({id:100+i,status:'FINISHED',finish_seconds:10000+i*100,sex:'F',age_class:'W40',overall_place:i,name_as_published:'Tie '+i});
  const sprint=i<5?100+i*10:150;
  tieSplits.set(100+i,[{checkpoint_key:'mora_warning',elapsed_seconds:10000+i*100-sprint,is_estimated:false}]);
}
const tied=finishSprintRanking(tieRows,{getSplits:id=>tieSplits.get(id)||[],isFinished:()=>true}).women;
assert.deepStrictEqual(tied.map(x=>x.rank),[1,2,3,4,5,5,5],'delad femteplats ska få samma rank och kunna visas i sin helhet');
assert.strictEqual(tied.filter(x=>x.rank<=5).length,7,'alla på delad femteplats ska följa med i topplistan');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
const nerd=fs.readFileSync(path.join(root,'docs/assets/nerdlab.js'),'utf8');
for(const text of ['SPURTVINNAREN','Årets snabbaste löpare på målspurten','Loppets spurtdrottning','Loppets spurtkung','Mora Förvarning','id="sprintClass"'])assert.ok(html.includes(text),'Spurtvinnaren saknar '+text);
for(const klass of ['medal-1','medal-2','medal-3'])assert.ok(css.includes('.sprint-row.'+klass),'medaljfärg saknas för '+klass);
assert.ok(nerd.includes("renderSprintWinners()")&&nerd.includes("item.rank<=5"),'Top 5 per kön ska renderas');
assert.ok(nerd.includes("n$('.sprint-row').forEach"),'alla renderade sprintrader ska få klickbindning');
assert.ok(nerd.includes("Kartans referenspunkt används aldrig som ersättning"),'metodhjälpen ska förbjuda konstruerad Mora Förvarning');

console.log('OK: Spurtvinnaren använder verifierad Mora Förvarning, klassfilter, delade placeringar och medaljfärger');
