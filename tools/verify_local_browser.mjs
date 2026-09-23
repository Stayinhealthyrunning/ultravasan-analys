#!/usr/bin/env node
import {resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';
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
for (let attempt = 0; attempt < 100; attempt++) {
  if (await evaluate("Boolean(window.ULTRAVASAN_DATA && document.querySelector('#loading')?.classList.contains('hidden'))")) {
    ready = true;
    break;
  }
  await delay(100);
}
if (!ready) {
  const diagnostic=await evaluate(`(() => ({
    href:location.href,
    readyState:document.readyState,
    loadingText:document.querySelector('#loading')?.innerText||'',
    loadingClass:document.querySelector('#loading')?.className||'',
    hasData:Boolean(window.ULTRAVASAN_DATA),
    hasBootstrap:Boolean(window.ULTRAVASAN_U3_BOOTSTRAP),
    loaderStatus:window.UltravasanDataLoader?.status?.()||null,
    bodyText:(document.body?.innerText||'').slice(0,1200),
  }))()`).catch(error=>({evaluateError:String(error)}));
  throw new Error("Local application did not finish loading: "+JSON.stringify({diagnostic,browserErrors,networkErrors}));
}

const lazyInitial = await evaluate(`(() => window.UltravasanDataLoader?.status?.() || null)()`);
await evaluate("window.ensureUltravasanHistory?.({rerender:false})");
await delay(250);
const lazyAfterHistory = await evaluate(`(() => window.UltravasanDataLoader?.status?.() || null)()`);
await evaluate("window.ensureUltravasanRaceData?.(9)");
await delay(250);
const lazyAfterRace = await evaluate(`(() => window.UltravasanDataLoader?.status?.() || null)()`);

const contractChecks = await evaluate(`(() => {
  const contracts=window.RaceContracts,data=window.ULTRAVASAN_DATA;
  return {
    editions:data.races.length===Object.keys(contracts.catalog.editions).length,
    routes:data.races.every(race=>window.RunnerReplay.routeForRace(window.ULTRAVASAN_ROUTES,race)?.id===contracts.courseForRace(race)?.display_route_id),
    families:data.races.every(race=>raceFamilyOf(race)===contracts.familyForRace(race)),
    unknown:window.RunnerReplay.routeForRace(window.ULTRAVASAN_ROUTES,{race_key:'ultravasan90-2099',year:2025})===null,
    immutable:Object.isFrozen(contracts.catalog.editions),
  };
})()`);

const initial = await evaluate(`(() => {
  const data=window.ULTRAVASAN_DATA;
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

const additionalRaceIds = await evaluate(`(() => ['ultravasan90-2015','ultravasan90-2016','ultravasan90-2017','ultravasan45-2016'].map(key=>window.ULTRAVASAN_DATA.races.find(race=>race.race_key===key)?.id).filter(Boolean))()`);
for(const raceId of additionalRaceIds){
  await evaluate(`window.ensureUltravasanRaceData?.(${Number(raceId)})`);
}
await delay(350);

const additionalCases = await evaluate(`(() => {
  const data=window.ULTRAVASAN_DATA,counts=new Map();
  data.splits.forEach(split=>counts.set(split.result_id,(counts.get(split.result_id)||0)+1));
  const race=key=>data.races.find(item=>item.race_key===key);
  const pick=(raceKey,predicate)=>{
    const selectedRace=race(raceKey);
    const result=data.results.find(item=>item.race_id===selectedRace?.id&&predicate(item,counts.get(item.id)||0));
    return result?{label:raceKey,id:result.id,raceId:result.race_id,name:result.name_as_published,status:result.status,splitCount:counts.get(result.id)||0}:null;
  };
  return [
    pick('ultravasan90-2016',(item,count)=>item.status==='DNF'&&count>0),
    pick('ultravasan90-2016',(item,count)=>item.status==='FINISHED'&&count>0&&count<8),
    pick('ultravasan90-2015',(item,count)=>item.status==='FINISHED'&&count>0),
    pick('ultravasan90-2017',(item,count)=>item.status==='FINISHED'&&count>0),
    pick('ultravasan45-2016',(item,count)=>item.status==='FINISHED'&&count>0),
  ];
})()`);

async function openRunnerCase(item) {
  if (!item) return {verified:false, reason:'No representative result found'};
  const setup = await evaluate(`(() => {
    const data=window.ULTRAVASAN_DATA,result=data.results.find(row=>row.id===${item.id}),race=data.races.find(row=>row.id===result.race_id);
    const dialog=document.querySelector('#runnerDialog');if(dialog?.open)dialog.close();
    const family=window.RaceContracts.familyForRace(race)==='uv45'?'45':'90';document.querySelector('#raceSwitch'+family)?.click();
    return {family,raceKey:race.race_key,year:race.year};
  })()`);
  await delay(650);
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
      comparisons:root?.querySelectorAll('[data-comparison-toggle]').length||0,text:(root?.innerText||'').slice(0,500)};
  })()`);
  return {item,setup,search,suggestion:suggestionResult,view,verified:Boolean(search.yearAvailable&&suggestionResult.found&&view.open&&view.replay&&view.map&&view.segments>0&&view.comparisons>=2)};
}
const caseResults = [];
for (const item of additionalCases) caseResults.push(await openRunnerCase(item));

// Open the standalone map through shared URLs, without a session-data shortcut.
const mapCases=[];
for(const item of [additionalCases[2],additionalCases[4]]){
  await command('Page.navigate',{url:'http://127.0.0.1:8765/karta.html?runners='+item.id});
  let loaded=false;
  for(let attempt=0;attempt<150;attempt++){
    if(await evaluate("Boolean(document.querySelector('#mapLoading')?.classList.contains('hidden'))")){loaded=true;break}
    await delay(100);
  }
  const state=loaded?await evaluate(`(() => ({
    raceKey:app.models[0]?.race?.race_key,
    family:window.RaceContracts.familyForRace(app.models[0]?.race),
    route:app.models[0]?.route?.id,
    expected:window.RaceContracts.courseForRace(app.models[0]?.race)?.display_route_id,
    audio:document.querySelector('#raceSoundtrack')?.getAttribute('src'),
    expectedAudio:window.RACE_MEDIA_CONFIG.musicForRace(app.models[0]?.race),
    note:document.querySelector('#courseNote')?.textContent,
  }))()`):null;
  mapCases.push({item,loaded,state,verified:loaded&&state.raceKey===item.label&&state.route===state.expected&&state.audio===state.expectedAudio&&state.note.includes('kartspår')});
}

const modularChecks = {
  mode:lazyInitial?.mode==='modular',
  initialIsPartial:lazyInitial?.loadedResults>0&&lazyInitial.loadedResults<lazyInitial.totalResults&&lazyInitial.loadedSplits>0&&lazyInitial.loadedSplits<lazyInitial.totalSplits,
  historyAddsResults:lazyAfterHistory?.loadedResults===lazyAfterHistory?.totalResults&&lazyAfterHistory?.loadedSplits<lazyAfterHistory?.totalSplits,
  raceAddsSplits:lazyAfterRace?.loadedSplits>lazyAfterHistory?.loadedSplits&&lazyAfterRace?.loadedSplits<lazyAfterRace?.totalSplits,
};

const checks = {
  modular:Object.values(modularChecks).every(Boolean),
  contracts:Object.values(contractChecks).every(Boolean),
  maps:mapCases.length===2&&mapCases.every(item=>item.verified),
  title: initial.title.includes("Sälen") || initial.title.includes("Ultravasan"),
  race: initial.race?.race_key === "ultravasan90-2016" && initial.race?.year === 2016,
  result: initial.result?.bib === "1025" && initial.result?.finish_seconds === 26280 && initial.result?.overall_place === 22,
  splits: initial.splitCount === 8 && initial.checkpointKeys.join(",") === "smagan,mangsbodarna,risberg,evertsberg,oxberg,hokberg,eldris,mora",
  search: suggestion.hidden === false && suggestion.id === "11545" && suggestion.text.includes("Hermansson, Andreas") && suggestion.text.includes("2016"),
  dialog: dialog.open && dialog.replay && dialog.segmentCards === 8 && dialog.checkpointMarkers === 9,
  detail: dialog.text.includes("Hermansson, Andreas") && dialog.text.includes("7:18:00") && dialog.text.includes("Mora"),
  replay: !dialog.playDisabled && dialog.scrubberMax >= 90 && replayProgress.distance !== "0,0 km",
  additionalCases: caseResults.length === 5 && caseResults.every(item=>item.verified),
  console: browserErrors.length === 0,
  network: networkErrors.length === 0,
};
// Verify the exact same modular loader when the site is opened directly from disk.
const offlineUrl=pathToFileURL(resolvePath('docs/index.html')).href+'?race=uv90';
await command('Page.navigate',{url:offlineUrl});
let offlineReady=false;
for(let attempt=0;attempt<180;attempt++){
  if(await evaluate("Boolean(window.UltravasanDataLoader?.status?.().mode==='modular' && document.querySelector('#loading')?.classList.contains('hidden'))")){offlineReady=true;break}
  await delay(100);
}
const offline=offlineReady?await evaluate(`(() => {
  const status=window.UltravasanDataLoader.status();
  return {
    mode:status.mode,
    loadedResults:status.loadedResults,
    totalResults:status.totalResults,
    loadedSplits:status.loadedSplits,
    totalSplits:status.totalSplits,
    title:document.title,
    visibleRows:document.querySelectorAll('#resultsBody tr').length,
  };
})()`):null;
checks.offline=Boolean(offlineReady&&offline?.mode==='modular'&&offline.loadedResults>0&&offline.loadedResults<=offline.totalResults&&offline.loadedSplits>0&&offline.loadedSplits<offline.totalSplits&&offline.visibleRows>0);

const output = {modularChecks,lazyInitial,lazyAfterHistory,lazyAfterRace,offline,contractChecks,mapCases,verified:Object.values(checks).every(Boolean),checks,initial,suggestion,dialog,replayProgress,caseResults,browserErrors,networkErrors};
console.log(JSON.stringify(output, null, 2));
socket.close();
if (!output.verified) process.exitCode = 1;
