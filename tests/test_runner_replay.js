'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const replay=require('../docs/assets/runner-replay.js');
const media=require('../docs/assets/race-media.js');
const registry=require('../data/routes/ultravasan90-routes.json');
const config=require('../config/races.json');

const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../docs/data/ultravasan-data.js'),'utf8'),context);
const data=context.window.ULTRAVASAN_DATA;

function realModel(raceKey,resultId){
  const race=data.races.find(item=>item.race_key===raceKey);
  const result=data.results.find(item=>item.id===resultId);
  const route=replay.routeForRace(registry,race);
  const raceCheckpoints=data.checkpoints.filter(item=>item.race_id===race.id);
  const splits=data.splits.filter(item=>item.result_id===result.id);
  return replay.createModel({race,result,route,raceCheckpoints,splits});
}

// Verkliga importerade resultat: äldre/ny UV90, UV45 2025 och en DNF.
const uv90Old=realModel('ultravasan90-2015',11994);
const uv90New=realModel('ultravasan90-2025',1376);
const uv45Current=realModel('ultravasan45-2025',13579);
const uv90Dnf=realModel('ultravasan90-2015',11971);

assert.strictEqual(uv90Old.route.id,'ultravasan90-pre2023','Äldre UV90 måste välja äldre ruttversion');
assert.strictEqual(uv90New.route.id,'ultravasan90-post2023','Ny UV90 måste välja ny ruttversion');
assert.strictEqual(uv45Current.route.id,'ultravasan45-current','UV45 måste välja UV45-rutten');
assert.strictEqual(replay.routeForRace(registry,{race_key:'ultravasan90-2022',year:2022}).source_year,2022);
assert.strictEqual(replay.routeForRace(registry,{race_key:'ultravasan90-2023',year:2023}).source_year,2024);
assert.strictEqual(replay.routeForRace(registry,{race_key:'ultravasan90-2025',year:2025}).source_year,2024);
assert.strictEqual(replay.routeForRace(registry,{race_key:'ultravasan45-2014',year:2014}).source_year,2026);
assert.strictEqual(replay.routeForRace(registry,{race_key:'ultravasan45-2024',year:2024}).source_year,2026);
assert.strictEqual(replay.routeForRace(registry,{race_key:'ultravasan45-2025',year:2025}).source_year,2026);
assert.strictEqual(uv90Old.segments.length,8,'Äldre UV90 ska byggas från årets faktiska kontrollmodell');
assert.strictEqual(uv90New.segments.length,9,'UV90 2025 ska inkludera Högsta punkten');
assert.strictEqual(uv45Current.segments.length,6,'UV45 2025 ska använda kontrolluppsättning B');
assert.strictEqual(new Set(uv45Current.segments.map(segment=>segment.index)).size,6,'Färgklassificeringen får inte skriva över segmentidentiteten');
assert.strictEqual(uv45Current.checkpoints.map(cp=>cp.key).join(','),'start,lillsjon,oxberg,hokberg,eldris,mora_warning,mora');

// Historisk UV45 kontrolluppsättning A byggs dynamiskt, utan UV90-namn.
const historicalRace=config.races.find(item=>item.race_key==='ultravasan45-2015');
assert.ok(historicalRace,'Konfiguration för UV45 2015 saknas');
let elapsed=0;
const historicalSplits=historicalRace.checkpoints.filter(cp=>cp.sequence_no>0).map((cp,index)=>{
  const previous=historicalRace.checkpoints.find(item=>item.sequence_no===cp.sequence_no-1),segmentSeconds=Math.round((cp.distance_km-previous.distance_km)*390);elapsed+=segmentSeconds;
  return {checkpoint_key:cp.checkpoint_key,sequence_no:cp.sequence_no,elapsed_seconds:elapsed,segment_seconds:segmentSeconds,pace_seconds_per_km:390,place_overall:40-index};
});
const uv45Historical=replay.createModel({race:historicalRace,result:{id:999001,status:'FINISHED',finish_seconds:elapsed,overall_place:37},route:replay.routeForRace(registry,historicalRace),raceCheckpoints:historicalRace.checkpoints,splits:historicalSplits});
assert.strictEqual(uv45Historical.checkpoints.map(cp=>cp.key).join(','),'start,oxberg,hokberg,eldris,mora');
assert.strictEqual(uv45Historical.segments.length,4,'Historisk UV45 ska använda kontrolluppsättning A');
assert.ok(!uv45Historical.segments.some(segment=>/smågan|evertsberg/i.test(segment.from.name+segment.to.name)),'UV45 får inte ärva UV90-kontroller');
for(const year of [2014,2024]){
  const historical=config.races.find(item=>item.race_key===`ultravasan45-${year}`);
  assert.ok(historical,`Konfiguration för UV45 ${year} saknas`);
  assert.strictEqual(historical.checkpoints.map(cp=>cp.checkpoint_key).join(','),'start,oxberg,hokberg,eldris,mora',`UV45 ${year} ska använda kontrolluppsättning A`);
  assert.strictEqual(replay.routeForRace(registry,historical).source_year,2026,`UV45 ${year} ska använda verifierad UV45-GPX`);
}

// Färgskalan är relativ till löparens egna segment och saknad passage är neutral.
const paces=uv90Old.segments.map(segment=>segment.pace);
const fastest=Math.min(...paces),slowest=Math.max(...paces);
assert.strictEqual(replay.paceColor(fastest,paces).color,replay.PACE_COLORS[0]);
assert.strictEqual(replay.paceColor(slowest,paces).color,replay.PACE_COLORS[4]);
assert.strictEqual(replay.paceColor(null,paces).color,replay.NEUTRAL_COLOR);
const renderedOld=replay.render(uv90Old);
const firstColor=uv90Old.segments[0].color;
assert.ok((renderedOld.match(new RegExp(firstColor,'g'))||[]).length>=2,'Samma segmentfärg ska användas på karta och höjdprofil');
assert.ok(renderedOld.includes('▲ snabbare · ● jämn · ▼ tuffare'),'Färg får inte vara enda informationsbärare');

// Karta, höjdprofil och informationsmodell använder samma distans.
assert.ok(uv90Old.elevationProfile.length>100,'Verifierad äldre GPX ska ge höjdprofil');
const state15=replay.stateAt(uv90Old,15);
assert.ok(state15.coordinate&&state15.coordinate.length===3,'Kartposition ska interpoleras längs rutten');
assert.ok(Number.isFinite(state15.elevation),'Höjd ska interpoleras från samma distans');
assert.ok(Number.isFinite(state15.grade),'Lutning ska interpoleras från samma GPX-profil');
assert.ok(Number.isFinite(state15.cumulativeAscent)&&Number.isFinite(state15.ascentRemaining),'Kumulativ och återstående stigning ska finnas');
assert.ok(replay.stateAt(uv90Old,25).ascentRemaining<state15.ascentRemaining,'Återstående stigning ska minska längs banan');
assert.ok(state15.time>uv90Old.anchors[1].time&&state15.time<uv90Old.anchors[2].time,'Tid ska interpoleras mellan officiella passager');
assert.strictEqual(state15.rankIsExact,false,'Placering mellan kontroller får inte markeras som exakt');
assert.strictEqual(state15.lastKnownRank,1,'Senast registrerade placering ska behållas mellan kontroller');
assert.ok(Number.isFinite(replay.stateAt(uv90New,20).elevation),'Post-2023 UV90 ska använda höjd från 2024-GPX');
assert.ok(Number.isFinite(replay.stateAt(uv45Current,20).elevation),'UV45 ska använda höjd från 2026-GPX');
const noElevation={...uv90New,route:{...uv90New.route,elevation_note:'Verifierad höjd saknas'},elevationProfile:[]};
assert.ok(replay.render(noElevation).includes('Höjdprofil saknas'),'Saknad verifierad höjddata ska degradera tydligt');
assert.ok(renderedOld.includes('data-replay-value="grade"')&&renderedOld.includes('data-replay-value="ascent-remaining"'),'Informationskortet ska visa lutning och återstående stigning');

// Replay klampar korrekt vid mål respektive DNF:s sista säkra passage.
assert.strictEqual(uv90New.finished,true);
assert.strictEqual(replay.stateAt(uv90New,999).distance,uv90New.totalDistance);
assert.strictEqual(uv90Dnf.finished,false);
assert.strictEqual(uv90Dnf.maxDistance,46.15,'DNF ska sluta vid Evertsberg, sista registrerade passage');
assert.strictEqual(replay.stateAt(uv90Dnf,999).distance,46.15);
assert.strictEqual(replay.distanceAtTime(uv90Dnf,999999),46.15);

// Gemensam ljudkonfiguration används av både kartduell och replay.
assert.strictEqual(media.musicForRace(uv90New.race),'assets/Eldspar-till-Mora.mp3?v=20260713-multirace1');
assert.strictEqual(media.musicForRace(uv45Current.race),'assets/Ultravasan-45.mp3?v=20260713-multirace1');
assert.strictEqual(media.musicForRace(null),null,'Saknad loppidentitet får inte gissa musik');

// Tillgänglig reservvy/reduced motion och responsiv CSS ska finnas.
assert.strictEqual(replay.motionAllowed(true),false);
assert.strictEqual(replay.motionAllowed(false),true);
const css=fs.readFileSync(require.resolve('../docs/assets/runner-replay.css'),'utf8');
assert.ok(css.includes('@media(max-width:640px)'),'Mobil layout saknas');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion-stöd saknas');
assert.ok(renderedOld.includes('data-replay-scrubber')&&renderedOld.includes('aria-live="polite"'),'Tangentbordsreglage och live-status saknas');

console.log('OK: interaktiv RunnerReplayModel för UV90, UV45, DNF, höjd, färg, musik och tillgänglighet');
