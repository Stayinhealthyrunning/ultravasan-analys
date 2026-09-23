#!/usr/bin/env node
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const targets = await (await fetch(`${endpoint}/json`)).json();
const target = targets.find(item => item.type === "page" && item.url.startsWith("http://127.0.0.1:8765/"));
if (!target) throw new Error("Local Ultravasan browser target was not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, {once: true});
  socket.addEventListener("error", reject, {once: true});
});
let nextId = 1;
const pending = new Map();
const browserErrors = [];
const networkErrors = [];
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const {resolve, reject} = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails?.text || "Runtime exception");
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);
  if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
    networkErrors.push({status: message.params.response.status, url: message.params.response.url});
  }
});
function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({id, method, params}));
  return new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await command("Runtime.enable");
await command("Log.enable");
await command("Page.enable");
await command("Network.enable");
await command("Page.navigate", {url:"http://127.0.0.1:8765/?race=uv90"});
await delay(1200);
let ready = false;
for (let attempt = 0; attempt < 300; attempt++) {
  if (await evaluate("Boolean(window.ULTRAVASAN_ACTIVE_DATA && document.querySelector('#loading')?.classList.contains('hidden'))")) {
    ready = true;
    break;
  }
  await delay(100);
}
if (!ready) {
  const diagnostics = await evaluate(`(() => ({
    loaderMode: window.UltravasanDataLoader?.mode?.() || null,
    hasCatalog: Boolean(window.ULTRAVASAN_DATA_CATALOG),
    hasLegacyData: Boolean(window.ULTRAVASAN_DATA),
    hasActiveData: Boolean(window.ULTRAVASAN_ACTIVE_DATA),
    loadingText: document.querySelector('#loading')?.innerText || '',
    loadingHidden: document.querySelector('#loading')?.classList.contains('hidden') || false
  }))()`);
  throw new Error("Local application did not finish loading: " + JSON.stringify(diagnostics));
}

let fullReady=false;
for(let attempt=0;attempt<300;attempt++){
  if(await evaluate("Boolean(window.ULTRAVASAN_SPLITS_READY)")){fullReady=true;break}
  await delay(100);
}
if(!fullReady){
  const diagnostics=await evaluate(`(() => ({
    phaseEvents:window.ULTRAVASAN_DATA_PHASE_EVENTS||[],
    activeScope:window.ULTRAVASAN_ACTIVE_DATA?.meta?.data_scope||null,
    activeSplits:window.ULTRAVASAN_ACTIVE_DATA?.splits?.length||0,
    activeReady:Boolean(window.ULTRAVASAN_ACTIVE_READY),
    historyReady:Boolean(window.ULTRAVASAN_HISTORY_READY),
    splitsReady:Boolean(window.ULTRAVASAN_SPLITS_READY),
  }))()`);
  throw new Error("Progressive active/core/split data did not finish loading: "+JSON.stringify(diagnostics));
}
const progressiveLoad=await evaluate(`(() => {
  const events=window.ULTRAVASAN_DATA_PHASE_EVENTS||[];
  const familySpec=window.ULTRAVASAN_DATA_CATALOG?.families?.uv90||{};
  const required=Boolean(familySpec.shell&&familySpec.core&&familySpec.split_data);
  const active=events.find(event=>event.family==='uv90'&&event.phase==='active')||null;
  const core=events.find(event=>event.family==='uv90'&&event.phase==='core'&&(!active||event.at>=active.at))||null;
  const full=events.find(event=>event.family==='uv90'&&event.phase==='full'&&(!core||event.at>=core.at))||null;
  const defaultRaceId=Number(familySpec.default_race_id||0)||null;
  return {
    required,defaultRaceId,active,core,full,
    verified:!required||Boolean(
      active&&core&&full&&
      active.scope==='race-family-active-core'&&
      active.raceId===defaultRaceId&&
      active.splits===0&&active.results>0&&
      core.scope==='race-family-core'&&core.splits===0&&core.results>=active.results&&
      full.splits>0&&full.results===core.results&&
      active.at<=core.at&&core.at<=full.at
    )
  };
})()`);

await delay(250);
const moduleChecks=await evaluate(`(() => ({
  nerdCoverage:(document.querySelector('#intelligenceCoverage')?.textContent||'').trim(),
  nerdStories:document.querySelectorAll('#raceStories .story-card').length,
  segmentOptions:document.querySelectorAll('#segmentFrom option').length,
  genderKpis:document.querySelectorAll('#genderKpis article').length,
}))()`);
moduleChecks.verified=Boolean(moduleChecks.nerdCoverage&&moduleChecks.nerdStories>=3&&moduleChecks.segmentOptions>0&&moduleChecks.genderKpis>=2);

const contractChecks = await evaluate(`(() => {
  const contracts=window.RaceContracts,data=window.ULTRAVASAN_ACTIVE_DATA;
  const loadedKeys=new Set(data.races.map(race=>race.race_key));
  const activeFamilies=[...new Set(data.races.map(race=>contracts.familyForRace(race)))];
  const activeFamily=activeFamilies.length===1?activeFamilies[0]:null;
  const expectedKeys=new Set(
    Object.entries(contracts.catalog.editions)
      .filter(([,edition])=>edition.race_family===activeFamily)
      .map(([key])=>key)
  );
  return {
    editions:activeFamily!==null&&loadedKeys.size===expectedKeys.size&&[...loadedKeys].every(key=>expectedKeys.has(key)),
    routes:data.races.every(race=>window.RunnerReplay.routeForRace(window.ULTRAVASAN_ROUTES,race)?.id===contracts.courseForRace(race)?.display_route_id),
    families:data.races.every(race=>raceFamilyOf(race)===contracts.familyForRace(race)),
    unknown:window.RunnerReplay.routeForRace(window.ULTRAVASAN_ROUTES,{race_key:'ultravasan90-2099',year:2025})===null,
    immutable:Object.isFrozen(contracts.catalog.editions),
  };
})()`);

const initial = await evaluate(`(() => {
  const data=window.ULTRAVASAN_ACTIVE_DATA;
  const race=data.races.find(item=>item.id===9);
  const result=data.results.find(item=>item.id===11545);
  const splits=data.splits.filter(item=>item.result_id===11545);
  return {title:document.title,race,result,splitCount:splits.length,checkpointKeys:splits.map(item=>item.checkpoint_key)};
})()`);
await evaluate(`(() => {
  const year=document.querySelector('#mainSearchYear');
  year.value='9';year.dispatchEvent(new Event('change',{bubbles:true}));
  const input=document.querySelector('#nameFilter');
  input.value='Hermansson, Andreas';input.dispatchEvent(new Event('input',{bubbles:true}));
})()`);
await delay(150);
const suggestion = await evaluate(`(() => {
  const box=document.querySelector('#mainRunnerSuggestions');
  const button=box?.querySelector('.main-runner-suggestion');
  return {hidden:box?.hidden,text:button?.innerText||'',id:button?.dataset.id||null};
})()`);
await evaluate("document.querySelector('#mainRunnerSuggestions .main-runner-suggestion')?.click()");
await delay(800);
const dialog = await evaluate(`(() => {
  const root=document.querySelector('#runnerDetail');
  return {
    open:document.querySelector('#runnerDialog')?.open,
    text:root?.innerText||'',
    replay:Boolean(root?.querySelector('[data-runner-replay]')),
    journey:Boolean(root?.querySelector('.runner-journey')),
    journeyStops:root?.querySelectorAll('.runner-journey-stop').length||0,
    journeyMissing:root?.querySelectorAll('.runner-journey-stop.missing').length||0,
    segmentCards:root?.querySelectorAll('[data-segment-card]').length||0,
    checkpointMarkers:root?.querySelectorAll('.runner-replay-checkpoint').length||0,
    scrubberMax:Number(root?.querySelector('[data-replay-scrubber]')?.max||0),
    playDisabled:Boolean(root?.querySelector('[data-replay-action="play"]')?.disabled),
  };
})()`);
await evaluate("document.querySelector('#runnerDetail [data-replay-action=\"play\"]')?.click()");
await delay(700);
const replayProgress = await evaluate(`(() => ({
  distance:document.querySelector('#runnerDetail [data-replay-value="distance"]')?.textContent||'',
  time:document.querySelector('#runnerDetail [data-replay-value="time"]')?.textContent||''
}))()`);

async function representativeCases(raceKeys) {
  return evaluate(`((raceKeys) => {
    const data=window.ULTRAVASAN_ACTIVE_DATA,counts=new Map();
    data.splits.forEach(split=>counts.set(split.result_id,(counts.get(split.result_id)||0)+1));
    const race=key=>data.races.find(item=>item.race_key===key);
    const pick=(raceKey,predicateName)=>{
      const selectedRace=race(raceKey);
      const predicates={
        dnf:item=>item.status==='DNF'&&(counts.get(item.id)||0)>0,
        partial:item=>item.status==='FINISHED'&&(counts.get(item.id)||0)>0&&(counts.get(item.id)||0)<8,
        finisher:item=>item.status==='FINISHED'&&(counts.get(item.id)||0)>0,
      };
      const result=data.results.find(item=>item.race_id===selectedRace?.id&&predicates[predicateName](item));
      return result?{label:raceKey,id:result.id,raceId:result.race_id,name:result.name_as_published,status:result.status,splitCount:counts.get(result.id)||0}:null;
    };
    return raceKeys.map(([key,predicate])=>pick(key,predicate));
  })(${JSON.stringify(raceKeys)})`);
}

async function waitForActiveFamily(family,requireSplits=true){
  for(let attempt=0;attempt<250;attempt++){
    const active=await evaluate(`(() => {
      const data=window.ULTRAVASAN_ACTIVE_DATA;
      if(!data?.races?.length)return {family:null,splitsReady:false};
      const families=[...new Set(data.races.map(r=>window.RaceContracts.familyForRace(r)))];
      return {family:families.length===1?families[0]:families.join(','),splitsReady:Boolean(window.ULTRAVASAN_SPLITS_READY)};
    })()`);
    if(active.family===family&&(!requireSplits||active.splitsReady))return true;
    await delay(100);
  }
  return false;
}

async function openRunnerCase(item) {
  if (!item) return {verified:false, reason:'No representative result found'};
  const setup = await evaluate(`(() => {
    const data=window.ULTRAVASAN_ACTIVE_DATA,result=data.results.find(row=>row.id===${item.id});
    if(!result)return {available:false};
    const race=data.races.find(row=>row.id===result.race_id);
    const dialog=document.querySelector('#runnerDialog');if(dialog?.open)dialog.close();
    return {available:true,family:window.RaceContracts.familyForRace(race),raceKey:race.race_key,year:race.year};
  })()`);
  if(!setup.available)return {item,setup,verified:false,reason:'Result is not in active family dataset'};
  const search = await evaluate(`(() => {
    const year=document.querySelector('#mainSearchYear'),option=[...year.options].find(item=>item.value==='${item.raceId}');
    if(!option)return {yearAvailable:false};
    year.value='${item.raceId}';year.dispatchEvent(new Event('change',{bubbles:true}));
    const input=document.querySelector('#nameFilter');input.value=${JSON.stringify(item.name)};input.dispatchEvent(new Event('input',{bubbles:true}));
    return {yearAvailable:true,yearText:option.textContent};
  })()`);
  await delay(180);
  const suggestionResult = await evaluate(`(() => {
    const button=document.querySelector('#mainRunnerSuggestions [data-id="${item.id}"]');
    if(!button)return {found:false};button.click();return {found:true,text:button.innerText};
  })()`);
  await delay(500);
  const view = await evaluate(`(() => {
    const root=document.querySelector('#runnerDetail');
    return {open:document.querySelector('#runnerDialog')?.open||false,replay:Boolean(root?.querySelector('[data-runner-replay]')),
      map:Boolean(root?.querySelector('.runner-replay-map svg')),segments:root?.querySelectorAll('[data-segment-card]').length||0,
      journey:Boolean(root?.querySelector('.runner-journey')),journeyStops:root?.querySelectorAll('.runner-journey-stop').length||0,
      journeyMissing:root?.querySelectorAll('.runner-journey-stop.missing').length||0,
      comparisons:root?.querySelectorAll('[data-comparison-toggle]').length||0,text:(root?.innerText||'').slice(0,500)};
  })()`);
  return {item,setup,search,suggestion:suggestionResult,view,verified:Boolean(search.yearAvailable&&suggestionResult.found&&view.open&&view.replay&&view.journey&&view.journeyStops>1&&view.map&&view.segments>0&&view.comparisons>=2)};
}

const uv90Cases=await representativeCases([
  ['ultravasan90-2016','dnf'],
  ['ultravasan90-2016','partial'],
  ['ultravasan90-2015','finisher'],
  ['ultravasan90-2017','finisher'],
]);
const caseResults=[];
for(const item of uv90Cases)caseResults.push(await openRunnerCase(item));

await evaluate("document.querySelector('#runnerDialog')?.open&&document.querySelector('#runnerDialog').close()");
await evaluate("document.querySelector('#raceSwitch45')?.click()");
const uv45Loaded=await waitForActiveFamily('uv45');
const uv45Progressive=await evaluate(`(() => {
  const events=(window.ULTRAVASAN_DATA_PHASE_EVENTS||[]).filter(event=>event.family==='uv45');
  const familySpec=window.ULTRAVASAN_DATA_CATALOG?.families?.uv45||{};
  const active=events.find(event=>event.phase==='active')||null;
  const core=events.find(event=>event.phase==='core'&&(!active||event.at>=active.at))||null;
  const full=events.find(event=>event.phase==='full'&&(!core||event.at>=core.at))||null;
  return {
    active,core,full,
    verified:Boolean(
      active&&core&&full&&
      active.scope==='race-family-active-core'&&
      active.raceId===Number(familySpec.default_race_id||0)&&
      active.splits===0&&active.results>0&&
      core.scope==='race-family-core'&&core.splits===0&&core.results>=active.results&&
      full.splits>0&&full.results===core.results&&
      active.at<=core.at&&core.at<=full.at
    )
  };
})()`);
const uv45Cases=uv45Loaded?await representativeCases([['ultravasan45-2016','finisher']]):[null];
caseResults.push(await openRunnerCase(uv45Cases[0]));
const additionalCases=[...uv90Cases,...uv45Cases];

// U5 Head-to-head reuses the existing compare selection.
// First verify a same-CourseVersion pair, then verify that an old/new course pair
// does not manufacture a whole-course ranking.
await evaluate("document.querySelector('#runnerDialog')?.open&&document.querySelector('#runnerDialog').close()");
await evaluate(`(() => {
  compareState.selected=[];
  addCompareRunner(${uv90Cases[2]?.id||0});
  addCompareRunner(${uv90Cases[3]?.id||0});
  document.querySelector('#compareH2HButton')?.click();
})()`);
await delay(250);
const h2hComparable=await evaluate(`(() => ({
  open:document.querySelector('#headToHeadDialog')?.open||false,
  finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,
  segmentCards:document.querySelectorAll('#headToHeadDetail .h2h-segment').length,
  warnings:document.querySelectorAll('#headToHeadDetail .h2h-warning').length,
  text:(document.querySelector('#headToHeadDetail')?.innerText||'').slice(0,800),
}))()`);

const changedCourseId=await evaluate(`(() => {
  const data=window.ULTRAVASAN_ACTIVE_DATA;
  const race=data.races.find(item=>item.race_key==='ultravasan90-2024');
  return data.results.find(item=>item.race_id===race?.id&&item.status==='FINISHED'&&Number(item.finish_seconds)>0)?.id||null;
})()`);
await evaluate(`(() => {
  const dialog=document.querySelector('#headToHeadDialog');if(dialog?.open)dialog.close();
  compareState.selected=[];
  addCompareRunner(${uv90Cases[2]?.id||0});
  addCompareRunner(${changedCourseId});
  document.querySelector('#compareH2HButton')?.click();
})()`);
await delay(250);
const h2hChangedCourse=await evaluate(`(() => ({
  open:document.querySelector('#headToHeadDialog')?.open||false,
  finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,
  warnings:document.querySelectorAll('#headToHeadDetail .h2h-warning').length,
  text:(document.querySelector('#headToHeadDetail')?.innerText||'').slice(0,800),
}))()`);
await evaluate("document.querySelector('#headToHeadDialog')?.open&&document.querySelector('#headToHeadDialog').close()");

// Open the standalone map through shared URLs, without a session-data shortcut.
// These navigations verify that result_id -> edition routing loads only the
// requested RaceEdition payloads. The third case verifies a two-year UV90 duel.
const mapRequests=[
  {items:[uv90Cases[2]],expectedScope:'race-edition'},
  {items:[uv45Cases[0]],expectedScope:'race-edition'},
  {items:[uv90Cases[2],uv90Cases[3]],expectedScope:'merged-editions'},
];
const mapCases=[];
for(const request of mapRequests){
  const items=request.items.filter(Boolean);
  if(items.length!==request.items.length){mapCases.push({items,loaded:false,state:null,verified:false});continue}
  const ids=items.map(item=>item.id).join(',');
  await command('Page.navigate',{url:'http://127.0.0.1:8765/karta.html?runners='+ids});
  let loaded=false;
  for(let attempt=0;attempt<200;attempt++){
    if(await evaluate("Boolean(document.querySelector('#mapLoading')?.classList.contains('hidden'))")){loaded=true;break}
    await delay(100);
  }
  const state=loaded?await evaluate(`(() => ({
    raceKeys:app.models.map(model=>model.race?.race_key),
    families:[...new Set(app.models.map(model=>window.RaceContracts.familyForRace(model.race)))],
    routes:app.models.map(model=>model.route?.id),
    expectedRoutes:app.models.map(model=>window.RaceContracts.courseForRace(model.race)?.display_route_id),
    audio:document.querySelector('#raceSoundtrack')?.getAttribute('src'),
    expectedAudio:window.RaceMedia.musicForRace(app.models[0]?.race),
    mediaAlias:window.RaceMedia===window.RACE_MEDIA_CONFIG,
    leafletVersion:window.L?.version||null,
    leafletVendorRoot:window.UltravasanMapEngine?.LEAFLET_VENDOR_ROOT||null,
    note:document.querySelector('#courseNote')?.textContent,
    loaderMode:window.UltravasanDataLoader?.mode?.(),
    dataScope:app.data?.meta?.data_scope?.kind||null,
    loadedRaceCount:app.data?.races?.length||0,
  }))()`):null;
  const expectedKeys=items.map(item=>item.label);
  mapCases.push({
    items,loaded,state,
    verified:Boolean(
      loaded&&
      state.loaderMode==='modular'&&
      state.dataScope===request.expectedScope&&
      state.loadedRaceCount===new Set(expectedKeys).size&&
      state.raceKeys.join(',')===expectedKeys.join(',')&&
      state.routes.every((route,index)=>route===state.expectedRoutes[index])&&
      state.families.length===1&&
      state.audio===state.expectedAudio&&
      state.mediaAlias===true&&
      state.leafletVersion==='1.9.4'&&
      state.leafletVendorRoot==='vendor/leaflet-1.9.4'&&
      state.note.includes('kartspår')
    )
  });
}

const checks = {
  contracts:Object.values(contractChecks).every(Boolean),
  progressive:progressiveLoad.verified,
  uv45Progressive:uv45Progressive.verified,
  modules:moduleChecks.verified,
  maps:mapCases.length===3&&mapCases.every(item=>item.verified),
  title: initial.title.includes("Sälen") || initial.title.includes("Ultravasan"),
  race: initial.race?.race_key === "ultravasan90-2016" && initial.race?.year === 2016,
  result: initial.result?.bib === "1025" && initial.result?.finish_seconds === 26280 && initial.result?.overall_place === 22,
  splits: initial.splitCount === 8 && initial.checkpointKeys.join(",") === "smagan,mangsbodarna,risberg,evertsberg,oxberg,hokberg,eldris,mora",
  search: suggestion.hidden === false && suggestion.id === "11545" && suggestion.text.includes("Hermansson, Andreas") && suggestion.text.includes("2016"),
  dialog: dialog.open && dialog.replay && dialog.journey && dialog.journeyStops === 9 && dialog.segmentCards === 8 && dialog.checkpointMarkers === 9,
  detail: dialog.text.includes("Hermansson, Andreas") && dialog.text.includes("7:18:00") && dialog.text.includes("Mora"),
  replay: !dialog.playDisabled && dialog.scrubberMax >= 90 && replayProgress.distance !== "0,0 km",
  additionalCases: caseResults.length === 5 && caseResults.every(item=>item.verified),
  h2hComparable: h2hComparable.open && h2hComparable.finishCards===2 && h2hComparable.segmentCards>0 && h2hComparable.text.includes('Sluttid och gap'),
  h2hChangedCourse: Boolean(changedCourseId) && h2hChangedCourse.open && h2hChangedCourse.finishCards===0 && h2hChangedCourse.warnings>0 && h2hChangedCourse.text.includes('Sluttider jämförs inte direkt'),
  console: browserErrors.length === 0,
  network: networkErrors.length === 0,
};
const output = {progressiveLoad,uv45Progressive,moduleChecks,contractChecks,h2hComparable,h2hChangedCourse,changedCourseId,mapCases,verified:Object.values(checks).every(Boolean),checks,initial,suggestion,dialog,replayProgress,caseResults,browserErrors,networkErrors};
console.log(JSON.stringify(output, null, 2));
socket.close();
if (!output.verified) process.exitCode = 1;
