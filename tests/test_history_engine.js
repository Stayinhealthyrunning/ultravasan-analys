'use strict';
const assert=require('assert');
const H=require('../docs/assets/history-engine.js');

const races=[
  {id:1,year:2022,course_version:'uv90-old'},
  {id:2,year:2024,course_version:'uv90-new'},
  {id:3,year:2025,course_version:'uv90-new'},
];
const courses={
  'uv90-old':{whole_course_comparison_group:null,segments:[{from:'a',to:'b'}]},
  'uv90-new':{whole_course_comparison_group:null,segments:[{from:'a',to:'b'}]},
};

const legacyNameLinks=[
  {id:11,race_id:1,athlete_id:99,source_code:'vasaloppet_mika',source_result_id:'E1:X',name_as_published:'Same Runner'},
  {id:12,race_id:2,athlete_id:99,source_code:'vasaloppet_mika',source_result_id:'E2:Y',name_as_published:'Same Runner'},
];
assert.strictEqual(H.groupHistories(legacyNameLinks,races).length,2,'athlete_id får inte längre bära flerårshistorik');

const stableVasaNerd=[
  {id:21,race_id:1,source_code:'vasanerd',source_result_id:'IDPE-7'},
  {id:22,race_id:2,source_code:'vasanerd',source_result_id:'IDPE-7'},
];
assert.strictEqual(H.groupHistories(stableVasaNerd,races).length,1,'VasaNerd idpe är verifierad person-evidence');

const explicit=[
  {id:31,race_id:2,person_key:'uvp_test'},
  {id:32,race_id:3,person_key:'uvp_test'},
];
assert.strictEqual(H.groupHistories(explicit,races).length,1,'person_key ska länka utgåvor');

assert.strictEqual(H.wholeCourseComparable({id:33,race_id:2},{id:34,race_id:2},races,courses),true,'samma RaceEdition är alltid direkt jämförbar med sig själv');
assert.strictEqual(H.wholeCourseComparable(explicit[0],explicit[1],races,courses),false,'CourseVersion är inte helbanans jämförbarhetsbevis');
assert.strictEqual(H.wholeCourseComparable(stableVasaNerd[0],stableVasaNerd[1],races,courses),false,'olika CourseVersion får inte jämföras implicit');

const groupedCourses={
  ...courses,
  'uv90-old':{...courses['uv90-old'],whole_course_comparison_group:'uv90-compatible'},
  'uv90-new':{...courses['uv90-new'],whole_course_comparison_group:'uv90-compatible'},
};
assert.strictEqual(H.wholeCourseComparable(stableVasaNerd[0],stableVasaNerd[1],races,groupedCourses),true,'explicit jämförelsegrupp får öppna jämförelse');
const editionGroupRaces=races.map(race=>({...race,whole_course_comparison_group:race.year>=2024?'uv90-post2023':null}));
assert.strictEqual(H.wholeCourseComparable({id:40,race_id:2},{id:41,race_id:3},editionGroupRaces,courses),true,'samma explicit RaceEdition-grupp får jämföra olika kursversioner');
assert.strictEqual(H.wholeCourseComparable({id:42,race_id:1},{id:40,race_id:2},editionGroupRaces,courses),false,'CourseVersion-byte utan helbanebevis ska inte jämföras');

assert.strictEqual(H.segmentComparable('uv90-old','uv90-new','a','b',courses),false,'segment jämförs inte över CourseVersion utan kontrakt');
const segmentCourses={
  'uv90-old':{segments:[{from:'a',to:'b',comparison_group:'ab-compatible'}]},
  'uv90-new':{segments:[{from:'a',to:'b',comparison_group:'ab-compatible'}]},
};
assert.strictEqual(H.segmentComparable('uv90-old','uv90-new','a','b',segmentCourses),true);

console.log('OK: U2 HistoryEngine kräver verifierad identitet och explicit bankompatibilitet');
