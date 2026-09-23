'use strict';
(function(root,factory){
  const catalog=typeof module==='object'&&module.exports?require('../data/race-catalog.json'):root.RACE_CATALOG;
  const api=factory(catalog);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RaceContracts=api;
})(typeof window!=='undefined'?window:globalThis,function create(catalog){
  if(catalog?.schema_version!==1)throw new Error('Loppkatalogen saknas eller har fel version.');
  // Snapshot and freeze: callers cannot silently change published assignments.
  const snapshot=JSON.parse(JSON.stringify(catalog));
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
  freeze(snapshot);
  const own=(values,key)=>typeof key==='string'&&Object.hasOwn(values,key)?values[key]:null;
  for(const [key,edition] of Object.entries(snapshot.editions)){
    const family=own(snapshot.families,edition.race_family),course=own(snapshot.courses,edition.course_version_id);
    if(edition.race_key!==key||!family||!course||edition.event_key!==snapshot.event.event_key||family.event_key!==edition.event_key||course.event_key!==edition.event_key||course.race_family!==edition.race_family)throw new Error(`Ogiltigt loppkontrakt: ${key}`);
  }
  const editionForRace=race=>own(snapshot.editions,typeof race==='string'?race:race?.race_key);
  const familyForRace=race=>editionForRace(race)?.race_family??null;
  const family=key=>own(snapshot.families,key);
  const courseForRace=race=>own(snapshot.courses,editionForRace(race)?.course_version_id);
  const routeForRace=(registry,race)=>own(registry?.routes||{},courseForRace(race)?.display_route_id);
  const medalProfileForRace=race=>editionForRace(race)?.medal_profile??null;
  const capabilitiesForRace=race=>editionForRace(race)?.capabilities??null;
  const supports=(race,capability)=>capabilitiesForRace(race)?.[capability]===true;
  function assertKnownRaces(races){for(const race of races||[])if(!editionForRace(race))throw new Error(`Loppet saknar kontrakt: ${race?.race_key||'okänt'}`)}
  return Object.freeze({catalog:snapshot,create,editionForRace,familyForRace,family,courseForRace,routeForRace,medalProfileForRace,capabilitiesForRace,supports,assertKnownRaces});
});
