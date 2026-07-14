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
const renderedUv45=replay.render(uv45Current);
const firstColor=uv90Old.segments[0].color;
assert.ok((renderedOld.match(new RegExp(firstColor,'g'))||[]).length>=2,'Samma segmentfärg ska användas på karta och höjdprofil');
assert.ok(renderedOld.includes('▲ snabbare · ● jämn · ▼ tuffare'),'Färg får inte vara enda informationsbärare');
assert.ok(renderedOld.includes('runner-replay-dashboard')&&renderedOld.includes('runner-replay-now')&&renderedOld.includes('runner-replay-map-panel')&&renderedOld.includes('runner-replay-insights'),'Desktoplayouten ska ha liveinfo, central karta och insikter som tre separata delar');
assert.ok(renderedOld.includes('Interaktiv GPS-karta'),'Den centrala visualiseringen ska beskrivas som en GPS-karta');
assert.ok(renderedOld.includes('<option value="60s" selected>Hela loppet på 1 minut</option>'),'En minut ska vara standardhastighet');
assert.ok(renderedOld.includes('data-map-action="zoom-in"')&&renderedOld.includes('data-map-action="zoom-out"')&&renderedOld.includes('data-map-action="fit"')&&renderedOld.includes('data-map-action="follow"'),'Kompletta och tangentbordsåtkomliga kartkontroller saknas');
assert.ok(renderedOld.includes('aria-label="Zooma in på GPS-kartan"')&&renderedOld.includes('aria-label="Visa hela banan"')&&renderedOld.includes('aria-pressed="true"'),'Zoom- och följkontroller måste ha tillgängliga namn och tillstånd');

// Zoom, panorering, helbana och följning ändrar bara kartvyn, aldrig distansmodellen.
const fittedView=replay.fitMapView(),zoomedView=replay.zoomMapView(fittedView,2,{x:300,y:200});
assert.ok(zoomedView.scale>fittedView.scale,'Zoom in ska ändra kartans skala');
assert.strictEqual(replay.zoomMapView(zoomedView,1,{x:300,y:200}).scale,1,'Zoom ut till miniminivå ska visa hel banbredd');
assert.deepStrictEqual(replay.fitMapView(),{scale:1,x:0,y:0,follow:true},'Visa hela banan ska återställa kartvyn och följningen');
const followedView=replay.followMapView({...zoomedView,follow:true},{x:460,y:215});
assert.ok(Math.abs(followedView.x+followedView.scale*460-460)<.001&&Math.abs(followedView.y+followedView.scale*215-215)<.001,'Följ löparen ska centrera markören vid inzoomning');
assert.strictEqual(replay.panMapView(followedView,20,10).follow,false,'Manuell panorering ska pausa automatisk följning');

// Mercatorprojektionen använder samma radianbaserade enhet för longitud och latitud.
const mapProjection=replay.mapProjection(uv90Old.route),mapXs=mapProjection.points.map(point=>point.x),mapYs=mapProjection.points.map(point=>point.y),mapWidth=Math.max(...mapXs)-Math.min(...mapXs),mapHeight=Math.max(...mapYs)-Math.min(...mapYs);
assert.ok(mapWidth>500,'GPS-rutten ska utnyttja kartans bredd');
assert.ok(mapHeight>50,'GPS-ruttens nord-syd-form får inte pressas ihop till en rak distanslinje');

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

// Alla kontroller kommer från aktuell loppmodell och exponeras i höjdprofilen.
for(const model of [uv90Old,uv90New,uv45Current,uv45Historical]){
  const rendered=replay.render(model),checkpointNodes=(rendered.match(/data-elevation-checkpoint=/g)||[]).length;
  assert.strictEqual(checkpointNodes,model.checkpoints.length,`${model.race.race_key}: samtliga kontroller ska finnas i höjdprofilen`);
  for(const checkpoint of model.checkpoints)assert.ok(rendered.includes(`data-elevation-checkpoint="${checkpoint.key}"`),`${model.race.race_key}: ${checkpoint.name} saknas i höjdprofilen`);
}

// Slutlig och passerad klassplacering använder endast uttryckliga verifierade fält.
assert.strictEqual(replay.formatClassPlace(12),'12');
assert.strictEqual(replay.formatClassPlace(null),'Saknas');
assert.strictEqual(replay.stateAt(uv90Old,15).lastKnownClassRank,null,'Klassplacering får inte härledas från totalplacering');
const classRace=data.races.find(item=>item.race_key==='ultravasan90-2015'),classResult=data.results.find(item=>item.id===11994),classRoute=replay.routeForRace(registry,classRace),classCheckpoints=data.checkpoints.filter(item=>item.race_id===classRace.id),classSplits=data.splits.filter(item=>item.result_id===classResult.id).map((split,index)=>({...split,place_class:12-index})),classModel=replay.createModel({race:classRace,result:classResult,route:classRoute,raceCheckpoints:classCheckpoints,splits:classSplits});
const afterFirstClassCheckpoint=replay.stateAt(classModel,classModel.anchors[1].distance+.5);
assert.strictEqual(afterFirstClassCheckpoint.lastKnownClassRank,12,'Senast verifierade klassplacering ska användas mellan kontroller');
assert.strictEqual(afterFirstClassCheckpoint.classRankIsExact,false,'Klassplacering får aldrig interpoleras mellan kontroller');
const dnfRace=data.races.find(item=>item.race_key==='ultravasan90-2015'),dnfResult=data.results.find(item=>item.id===11971),dnfSplits=data.splits.filter(item=>item.result_id===dnfResult.id).map((split,index)=>({...split,place_class:30-index})),dnfClassModel=replay.createModel({race:dnfRace,result:dnfResult,route:classRoute,raceCheckpoints:classCheckpoints,splits:dnfSplits});
assert.strictEqual(replay.stateAt(dnfClassModel,999).lastKnownClassRank,dnfClassModel.anchors.at(-1).classRank,'DNF ska behålla sista säkra klassplacering');
assert.ok(renderedOld.includes('data-replay-value="class-rank"'),'Livepanelen ska ha separat klassplacering');
const appSource=fs.readFileSync(require.resolve('../docs/assets/app.js'),'utf8'),replaySource=fs.readFileSync(require.resolve('../docs/assets/runner-replay.js'),'utf8');
assert.ok(appSource.includes('<span>Klassplacering</span>')&&appSource.includes('formatClassPlace(r.class_place)'),'Profilhuvudet ska visa verifierad slutlig klassplacering');
assert.ok(replaySource.includes("this.speedSelect.value='60s'"),'Återställning ska välja en minuts replay');

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
assert.ok(css.includes('@media(max-width:1180px)')&&css.includes('@media(max-width:700px)'),'Tablet- eller mobillayout saknas');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion-stöd saknas');
assert.ok(!css.includes('.runner-replay-info{position:absolute'),'Liveinformationen får inte ligga som en stor overlay ovanpå kartan');
assert.ok(renderedOld.includes(`--pace-fast:${replay.PACE_COLORS[0]}`)&&renderedOld.includes(`--pace-even:${replay.PACE_COLORS[2]}`)&&renderedOld.includes(`--pace-slow:${replay.PACE_COLORS[4]}`),'Legenden ska återanvända segmentens färgkonfiguration');
assert.ok(renderedOld.includes('Snabbare än eget snitt')&&renderedOld.includes('Nära eget snitt')&&renderedOld.includes('Långsammare än eget snitt'),'Gemensam textlegend saknas');
assert.ok(renderedUv45.includes('data-elevation-checkpoint="mora_warning"'),'UV45:s Mora Förvarning ska finnas i höjdprofilen');
assert.ok(renderedOld.includes('data-replay-scrubber')&&renderedOld.includes('aria-live="polite"'),'Tangentbordsreglage och live-status saknas');

console.log('OK: interaktiv RunnerReplayModel för UV90, UV45, DNF, höjd, färg, musik och tillgänglighet');
