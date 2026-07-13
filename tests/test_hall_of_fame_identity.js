'use strict';
const assert=require('assert');
const {athleteIdentityKey,groupAthleteHistories}=require('../docs/assets/nerdlab.js');

const races=[
  {id:1,year:2024},
  {id:2,year:2025},
];

const namesakes=[
  {id:11,race_id:1,athlete_id:101,name_as_published:'Johan Larsson',bib:'5324',age_class:'M50',city:'Skövde',finish_seconds:18000},
  {id:12,race_id:2,athlete_id:202,name_as_published:'Johan Larsson',bib:'5034',age_class:'M40',finish_seconds:19000},
];
const separate=groupAthleteHistories(namesakes,races);
assert.strictEqual(separate.length,2,'Namnar får inte slås ihop');
assert.deepStrictEqual(separate.map(g=>g.rows.filter(r=>r.finish_seconds).length),[1,1],'Varje Johan Larsson ska ha ett fullföljt lopp');
assert.ok(!separate.some(g=>g.rows.length===2),'Ingen namne får visas med två lopp');
assert.notStrictEqual(athleteIdentityKey(namesakes[0]),athleteIdentityKey(namesakes[1]),'Olika athlete_id måste ge olika identitet');

const sameAthlete=[
  {id:21,race_id:1,athlete_id:303,name_as_published:'Säker Löpare',bib:'4001',finish_seconds:20000},
  {id:22,race_id:2,athlete_id:303,name_as_published:'Säker Löpare',bib:'5001',finish_seconds:19500},
];
const linked=groupAthleteHistories(sameAthlete,races);
assert.strictEqual(linked.length,1,'Samma stabila athlete_id ska länka loppår');
assert.strictEqual(linked[0].rows.length,2,'Den säkert identifierade löparen ska ha två lopp');

const linkedByPersonId=groupAthleteHistories([
  {id:23,race_id:1,person_id:'person-77',name_as_published:'Säker Person',finish_seconds:20000},
  {id:24,race_id:2,person_id:'person-77',name_as_published:'Säker Person',finish_seconds:19500},
],races);
assert.strictEqual(linkedByPersonId.length,1,'Samma explicit person_id ska länka loppår');

const noStableIdentity=[
  {id:31,race_id:1,name_as_published:'Namnlös Identitet',finish_seconds:21000},
  {id:32,race_id:2,name_as_published:'Namnlös Identitet',finish_seconds:20500},
];
assert.strictEqual(groupAthleteHistories(noStableIdentity,races).length,2,'Samma namn utan stabil identitet ska förbli separata resultat');

console.log('OK: Hall of Fame använder stabil löparidentitet, aldrig enbart namn');
