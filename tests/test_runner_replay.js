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
const realClassPlacements=replay.deriveClassPlacements(data.results,data.splits);

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
const smagan=uv90Old.checkpoints.find(checkpoint=>checkpoint.key==='smagan'),passageDistances=[smagan.distance-.15,smagan.distance,smagan.distance+.15],passageStates=passageDistances.map(distance=>replay.stateAt(uv90Old,distance)),passageProjection=replay.mapProjection(uv90Old.route),passagePixels=passageStates.map(state=>passageProjection.project(state.coordinate)),passageSteps=[Math.hypot(passagePixels[1][0]-passagePixels[0][0],passagePixels[1][1]-passagePixels[0][1]),Math.hypot(passagePixels[2][0]-passagePixels[1][0],passagePixels[2][1]-passagePixels[1][1])];
assert.deepStrictEqual(passageStates.map(state=>state.distance),passageDistances,'Den globala distansen får inte avrundas eller låsas till kontrollen');
assert.ok(passageSteps.every(step=>step>0)&&Math.max(...passageSteps)/Math.min(...passageSteps)<3,'Kartpositionen ska röra sig kontinuerligt över kontrollpassagen');
assert.ok(passageStates[0].segment.index===passageStates[1].segment.index&&passageStates[2].segment.index===passageStates[1].segment.index+1,'Aktivt segment ska bytas först efter kontrollens globala distans');
assert.ok(Number.isFinite(replay.stateAt(uv90New,20).elevation),'Post-2023 UV90 ska använda höjd från 2024-GPX');
assert.ok(Number.isFinite(replay.stateAt(uv45Current,20).elevation),'UV45 ska använda höjd från 2026-GPX');
const noElevation={...uv90New,route:{...uv90New.route,elevation_note:'Verifierad höjd saknas'},elevationProfile:[]};
assert.ok(replay.render(noElevation).includes('Höjdprofil saknas'),'Saknad verifierad höjddata ska degradera tydligt');
assert.ok(renderedOld.includes('data-replay-value="grade"')&&renderedOld.includes('data-replay-value="ascent-remaining"'),'Informationskortet ska visa lutning och återstående stigning');
const wideElevation=replay.elevationProjection(uv90Old,1900);
assert.strictEqual(wideElevation.width,1900,'Höjdprofilens logiska bredd ska följa det tillgängliga kortets proportioner');
assert.strictEqual(wideElevation.x(0),wideElevation.pad.l,'Höjdkurvan ska börja vid den gemensamma vänsterkanten');
assert.strictEqual(wideElevation.x(uv90Old.totalDistance),wideElevation.width-wideElevation.pad.r,'Höjdkurvan ska sluta vid den gemensamma högerkanten');

// Alla kontroller kommer från aktuell loppmodell och exponeras i höjdprofilen.
for(const model of [uv90Old,uv90New,uv45Current,uv45Historical]){
  const rendered=replay.render(model),checkpointNodes=(rendered.match(/data-elevation-checkpoint=/g)||[]).length;
  assert.strictEqual(checkpointNodes,model.checkpoints.length,`${model.race.race_key}: samtliga kontroller ska finnas i höjdprofilen`);
  for(const checkpoint of model.checkpoints)assert.ok(rendered.includes(`data-elevation-checkpoint="${checkpoint.key}"`),`${model.race.race_key}: ${checkpoint.name} saknas i höjdprofilen`);
}

// Slutlig och passerad klassplacering använder verifierade passertider och separata identiteter.
assert.strictEqual(replay.formatClassPlace(12),'12');
assert.strictEqual(replay.formatClassPlace(null),'Saknas');
assert.ok(realClassPlacements.size>0,'Klassplaceringarna ska beräknas en gång vid datahydrering');
assert.strictEqual(replay.stateAt(uv90Old,0).hasRegisteredPassage,false,'Före första verifierade passage ska ingen klassplacering visas');
assert.ok(Number.isFinite(replay.stateAt(uv90Old,15).lastKnownClassRank),'Klassplacering ska räknas fram från verifierade passertider');
const classRace=data.races.find(item=>item.race_key==='ultravasan90-2015'),classResult=data.results.find(item=>item.id===11994),classRoute=replay.routeForRace(registry,classRace),classCheckpoints=data.checkpoints.filter(item=>item.race_id===classRace.id),classSplits=data.splits.filter(item=>item.result_id===classResult.id).map((split,index)=>({...split,place_class:12-index})),classModel=replay.createModel({race:classRace,result:classResult,route:classRoute,raceCheckpoints:classCheckpoints,splits:classSplits});
const afterFirstClassCheckpoint=replay.stateAt(classModel,classModel.anchors[1].distance+.5);
assert.strictEqual(afterFirstClassCheckpoint.lastKnownClassRank,12,'Senast verifierade klassplacering ska användas mellan kontroller');
assert.strictEqual(afterFirstClassCheckpoint.classRankIsExact,false,'Klassplacering får aldrig interpoleras mellan kontroller');
const dnfRace=data.races.find(item=>item.race_key==='ultravasan90-2015'),dnfResult=data.results.find(item=>item.id===11971),dnfSplits=data.splits.filter(item=>item.result_id===dnfResult.id).map((split,index)=>({...split,place_class:30-index})),dnfClassModel=replay.createModel({race:dnfRace,result:dnfResult,route:classRoute,raceCheckpoints:classCheckpoints,splits:dnfSplits});
assert.strictEqual(replay.stateAt(dnfClassModel,999).lastKnownClassRank,dnfClassModel.anchors.at(-1).classRank,'DNF ska behålla sista säkra klassplacering');
assert.ok(renderedOld.includes('data-replay-value="class-rank"'),'Livepanelen ska ha separat klassplacering');
const rankResults=[
  {id:1,race_id:10,age_class:'M40',class_place:91},{id:2,race_id:10,age_class:'M40',class_place:92},{id:3,race_id:10,age_class:'M40',class_place:93},{id:4,race_id:10,age_class:'K40',class_place:1},{id:5,race_id:11,age_class:'M40',class_place:1},{id:6,race_id:10,age_class:'M40',class_place:94},{id:7,race_id:10,age_class:'M40',class_place:95}
];
const rankSplits=[
  {result_id:1,checkpoint_key:'oxberg',elapsed_seconds:100},{result_id:2,checkpoint_key:'oxberg',elapsed_seconds:200},{result_id:3,checkpoint_key:'oxberg',elapsed_seconds:200},{result_id:4,checkpoint_key:'oxberg',elapsed_seconds:150},{result_id:5,checkpoint_key:'oxberg',elapsed_seconds:50},{result_id:6,checkpoint_key:'oxberg',elapsed_seconds:null},{result_id:7,checkpoint_key:'oxberg',elapsed_seconds:90,is_estimated:1},
  {result_id:1,checkpoint_key:'hokberg',elapsed_seconds:300},{result_id:2,checkpoint_key:'hokberg',elapsed_seconds:280},{result_id:3,checkpoint_key:'hokberg',elapsed_seconds:400}
];
const officialPlaces=rankResults.map(result=>result.class_place),rankLookup=replay.deriveClassPlacements(rankResults,rankSplits);
assert.deepStrictEqual(rankSplits.slice(0,3).map(split=>split.place_class),[1,2,2],'Lika kumulativa passertider ska ge tävlingsplacering 1, 2, 2');
assert.strictEqual(rankSplits[3].place_class,1,'Olika klasser får inte blandas');
assert.strictEqual(rankSplits[4].place_class,1,'Olika lopp eller år får inte blandas');
assert.strictEqual(rankSplits[5].place_class,undefined,'Saknad passertid får inte rankas');
assert.strictEqual(rankSplits[6].place_class,undefined,'Estimerad passertid får inte rankas');
assert.strictEqual(rankLookup,replay.deriveClassPlacements(rankResults,rankSplits),'Samma data ska återanvända den cachade lookupen');
assert.deepStrictEqual(rankResults.map(result=>result.class_place),officialPlaces,'Beräknade passageplaceringar får inte ändra officiell slutlig class_place');
const rankRace={race_key:'ultravasan45-test',distance_km:20},rankRoute={points:[[0,0,0],[0,1,20]],elevation_profile:[[0,100],[20,100]]},rankCheckpoints=[{checkpoint_key:'start',name:'Start',sequence_no:0,distance_km:0},{checkpoint_key:'oxberg',name:'Oxberg',sequence_no:1,distance_km:10},{checkpoint_key:'hokberg',name:'Hökberg',sequence_no:2,distance_km:20}],rankModel=replay.createModel({race:rankRace,result:rankResults[0],route:rankRoute,raceCheckpoints:rankCheckpoints,splits:rankSplits.filter(split=>split.result_id===1)});
assert.strictEqual(replay.stateAt(rankModel,5).lastKnownClassRank,null,'Klassplacering får inte visas före första kontrollen');
assert.strictEqual(replay.stateAt(rankModel,15).lastKnownClassRank,1,'Klassplacering får inte interpoleras eller bytas före nästa kontroll');
assert.strictEqual(replay.stateAt(rankModel,20).lastKnownClassRank,2,'Klassplaceringen ska bytas först vid nästa verifierade passage');
const appSource=fs.readFileSync(require.resolve('../docs/assets/app.js'),'utf8'),replaySource=fs.readFileSync(require.resolve('../docs/assets/runner-replay.js'),'utf8');
assert.ok(appSource.includes('<span>Klassplacering</span>')&&appSource.includes('formatClassPlace(r.class_place)'),'Profilhuvudet ska visa verifierad slutlig klassplacering');
assert.ok(appSource.includes('deriveClassPlacements(d.results,d.splits)'),'Passageplaceringarna ska byggas och cachas vid datahydrering');
assert.ok(replaySource.includes("this.speedSelect.value='60s'"),'Återställning ska välja en minuts replay');
assert.ok(replaySource.includes('this.progressDistanceKm')&&!replaySource.includes('this.distance='),'Replay ska använda en enda kontinuerlig global distansvariabel');
assert.ok(!replaySource.includes('chart.outerHTML=renderElevation'),'ResizeObserver får inte ersätta höjdprofilens SVG');
assert.ok(replaySource.includes('index!==this.activeSegmentIndex'),'Aktiva segmentklasser ska bara uppdateras när segmentet faktiskt byts');
assert.ok(replaySource.includes('this.applyMapView(false)'),'Kartföljningen ska uppdateras kontinuerligt i samma animationsframe');
assert.ok(replaySource.includes('node&&node.textContent!==value'),'Oförändrade livevärden får inte skapa onödiga DOM-mutationer');
const infoOrder=['Beräknad loppstid','Delsträcksfart','Totalplacering','Klassplacering','Höjd','Lutning','Återstår','Stigning kvar'].map(label=>renderedOld.indexOf(`<dt>${label}</dt>`));
assert.ok(infoOrder.every((position,index)=>index===0||position>infoOrder[index-1]),'Vänsterpanelens informationsfält ligger i fel ordning');

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
assert.strictEqual(replay.DEFAULT_VOLUME,.35,'Neutral standardvolym ska vara 35 procent');
assert.ok(renderedOld.includes('value="0.35"'),'Volymreglaget ska starta på 35 procent när ingen sparad nivå finns');
assert.ok(replaySource.includes('this.setVolume(DEFAULT_VOLUME)'),'Återställning ska återställa musikvolymen till 35 procent');
assert.ok(replaySource.includes('this.lastAudibleVolume||DEFAULT_VOLUME'),'Avmutning ska återgå till senast hörbara nivå eller 35 procent, aldrig 100 procent');
assert.ok(replaySource.includes('if(userGesture)this.playAudio()'),'Musiken får starta först efter användarens play-interaktion');
assert.ok(replaySource.includes("else this.showAudioNote('Musik saknas för loppet. Replay fungerar utan ljud.')"),'Saknad musik ska degradera utan JavaScript-fel');

// Tillgänglig reservvy/reduced motion och responsiv CSS ska finnas.
assert.strictEqual(replay.motionAllowed(true),false);
assert.strictEqual(replay.motionAllowed(false),true);
const css=fs.readFileSync(require.resolve('../docs/assets/runner-replay.css'),'utf8');
assert.ok(css.includes('@media(max-width:1180px)')&&css.includes('@media(max-width:700px)'),'Tablet- eller mobillayout saknas');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion-stöd saknas');
assert.ok(!css.includes('.runner-replay-info{position:absolute'),'Liveinformationen får inte ligga som en stor overlay ovanpå kartan');
assert.ok(css.includes('scrollbar-gutter:stable'),'Popupens scrollbarutrymme ska vara stabilt');
assert.ok(css.includes('grid-auto-rows:60px')&&css.includes('height:60px'),'Dynamiska placeringsfält ska ha stabil radhöjd vid kontrollpassage');
assert.ok(css.includes('border:1px solid transparent')&&css.includes('transition:border-color .18s,background-color .18s,box-shadow .18s'),'Aktivt delsträckekort får inte ändra mått eller animera layoutvärden');
assert.ok(renderedOld.includes(`--pace-fast:${replay.PACE_COLORS[0]}`)&&renderedOld.includes(`--pace-even:${replay.PACE_COLORS[2]}`)&&renderedOld.includes(`--pace-slow:${replay.PACE_COLORS[4]}`),'Legenden ska återanvända segmentens färgkonfiguration');
assert.ok(renderedOld.includes('Snabbare än eget snitt')&&renderedOld.includes('Nära eget snitt')&&renderedOld.includes('Långsammare än eget snitt'),'Gemensam textlegend saknas');
assert.ok(renderedUv45.includes('data-elevation-checkpoint="mora_warning"'),'UV45:s Mora Förvarning ska finnas i höjdprofilen');
assert.ok(renderedOld.includes('data-replay-scrubber')&&renderedOld.includes('aria-live="polite"'),'Tangentbordsreglage och live-status saknas');

console.log('OK: interaktiv RunnerReplayModel för UV90, UV45, DNF, höjd, färg, musik och tillgänglighet');
