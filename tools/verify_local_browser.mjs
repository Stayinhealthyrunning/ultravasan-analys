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
await command("Network.setCacheDisabled",{cacheDisabled:true});
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
    loadingHidden: document.querySelector('#loading')?.classList.contains('hidden') || false,
    loadErrorStack: window.ULTRAVASAN_LOAD_ERROR_STACK || null
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

const u6Initial=await evaluate(`(() => ({
  api:Boolean(window.CourseIntelligence),
  version:(document.querySelector('#courseIntelligenceVersion')?.textContent||'').trim(),
  rows:document.querySelectorAll('#courseIntelligenceRows tr[data-course-segment]').length,
  routeSegments:document.querySelectorAll('#courseRouteView [data-course-segment]').length,
  elevationSegments:document.querySelectorAll('#courseElevationView [data-course-segment]').length,
  paceSegments:document.querySelectorAll('#coursePaceView [data-course-segment]').length,
  selectedRows:document.querySelectorAll('#courseIntelligenceRows tr.selected').length,
  planRows:document.querySelectorAll('#coursePlanRows tr').length,
  planStatus:(document.querySelector('#coursePlanStatus')?.innerText||'').trim(),
  method:(document.querySelector('#courseIntelligenceCard > .panel-head .info-popup')?.textContent||'').trim(),
  planMethod:(document.querySelector('#courseRacePlan > .info-tip .info-popup')?.textContent||'').trim(),
  spreadHeaders:[...document.querySelectorAll('.course-intelligence-table thead th')].map(node=>(node.textContent||'').trim()).filter(text=>text.startsWith('Q')),
  outerSpreadCells:[...document.querySelectorAll('#courseIntelligenceRows tr td:nth-child(6)')].map(node=>(node.textContent||'').trim()).filter(text=>text&&text!=='–'),
  outerQuantiles:(() => {
    const field=currentCourseModel()?.segments?.map(segment=>segment.field).find(field=>field?.outer_quantiles_available);
    return field?{n:field.timing_sample_n,min:field.outer_quantile_min_sample,q10:field.q10_pace_seconds_per_km,q25:field.q25_pace_seconds_per_km,q75:field.q75_pace_seconds_per_km,q90:field.q90_pace_seconds_per_km}:null;
  })(),
}))()`);
const finishProgression=await evaluate(`(() => ({
  shares:[...document.querySelectorAll('#percentileLadder [data-finish-share]')].map(node=>Number(node.dataset.finishShare)),
  labels:[...document.querySelectorAll('#percentileLadder [data-finish-share] > span')].map(node=>(node.textContent||'').trim()),
  primaryTimes:[...document.querySelectorAll('#percentileLadder .percentile-primary strong')].map(node=>(node.textContent||'').trim()),
  male:document.querySelectorAll('#percentileLadder .percentile-sex-values .male').length,
  female:document.querySelectorAll('#percentileLadder .percentile-sex-values .female').length,
  help:(document.querySelector('#percentileLadder')?.closest('article')?.querySelector('.info-popup')?.textContent||'').trim(),
}))()`);
await evaluate(`(() => {
  const input=document.querySelector('#percentileSexF');
  if(input){input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}))}
})()`);
await delay(90);
const finishProgressionFemaleHidden=await evaluate(`(() => ({
  shares:[...document.querySelectorAll('#percentileLadder [data-finish-share]')].map(node=>Number(node.dataset.finishShare)),
  primaryTimes:[...document.querySelectorAll('#percentileLadder .percentile-primary strong')].map(node=>(node.textContent||'').trim()),
  male:document.querySelectorAll('#percentileLadder .percentile-sex-values .male').length,
  female:document.querySelectorAll('#percentileLadder .percentile-sex-values .female').length,
}))()`);
await evaluate(`(() => {
  const input=document.querySelector('#percentileSexF');
  if(input){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}))}
})()`);
await delay(80);

await evaluate(`(() => {
  const rows=[...document.querySelectorAll('#courseIntelligenceRows tr[data-course-segment]')];
  (rows[1]||rows[0])?.click();
})()`);
await delay(120);
const u6Synced=await evaluate(`(() => {
  const model=currentCourseModel(),segment=model?.segments?.find(item=>item.key===nerd.courseSegmentKey);
  return {
    key:nerd.courseSegmentKey||null,
    rowSelected:document.querySelectorAll('#courseIntelligenceRows tr.selected').length,
    routeSelected:document.querySelectorAll('#courseRouteView .course-route-segment.selected').length,
    elevationSelected:document.querySelectorAll('#courseElevationView .course-elevation-hit.selected').length,
    paceSelected:document.querySelectorAll('#coursePaceView .course-pace-row.selected').length,
    legacyFrom:document.querySelector('#segmentFrom')?.value||null,
    legacyTo:document.querySelector('#segmentTo')?.value||null,
    expectedFrom:segment?String(segment.from_sequence):null,
    expectedTo:segment?String(segment.to_sequence):null,
  };
})()`);
await evaluate(`(() => {
  const input=document.querySelector('#courseTargetTime');
  if(!input)return;
  input.value='09:30:00';
  input.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await delay(100);
const u6Plan=await evaluate(`(() => ({
  target:document.querySelector('#courseTargetTime')?.value||null,
  rows:document.querySelectorAll('#coursePlanRows tr').length,
  historical:document.querySelectorAll('#coursePlanRows .course-plan-source.historical-course-version').length,
  fallback:document.querySelectorAll('#coursePlanRows .course-plan-source.distance-fallback').length,
  unavailable:document.querySelectorAll('#coursePlanRows .course-plan-source.unavailable').length,
  status:(document.querySelector('#coursePlanStatus')?.innerText||'').trim(),
  lastCumulative:document.querySelector('#coursePlanRows tr:last-child td:nth-child(3)')?.textContent?.trim()||null,
}))()`);

const u7Switch=await evaluate(`(() => {
  const race=state.data.races.find(item=>item.race_key==='ultravasan90-2025');
  if(!race)return null;
  state.raceId=race.id;
  const year=document.querySelector('#yearFilter');if(year)year.value=String(race.id);
  refreshFilters();applyFilters();
  return {id:race.id,key:race.race_key};
})()`);
await delay(250);
const u7History=await evaluate(`(() => {
  const data=window.ULTRAVASAN_ACTIVE_DATA,race=data.races.find(item=>item.race_key==='ultravasan90-2025');
  const fingerprint=window.HistoryIntelligence?.fingerprint(data,race,{currentResults:state.filtered,referenceResults:familyResults(),minReferenceYears:2,sexFilterActive:false});
  const verified=window.HistoryIntelligence?.verifiedHistories(data,'uv90')||[];
  let candidate=null,model=null;
  for(const group of verified){
    const result=[...group.rows].reverse().find(row=>window.HistoryIntelligence.isFinished(data,row))||group.rows.at(-1);
    const current=window.HistoryIntelligence.personHistory(data,result.id);
    if(!candidate||current.comparable_series.length>model.comparable_series.length){candidate=result;model=current}
    if(current.comparable_series.length>1)break;
  }
  if(candidate)renderRunnerHistory(candidate.id);
  nerd.hall='veterans';renderHall();
  return {
    api:Boolean(window.HistoryIntelligence),
    fingerprintPerformanceYears:fingerprint?.performance_reference_years||[],
    fingerprintScopes:(fingerprint?.metrics||[]).map(metric=>[metric.id,metric.available,metric.reference_scope,metric.reference_n]),
    fingerprintRows:document.querySelectorAll('#raceFingerprint .finger-row[data-history-scope]').length,
    fingerprintMethod:(document.querySelector('.fingerprint-card .info-popup')?.textContent||'').trim(),
    hallRows:document.querySelectorAll('#hallOfFame .hall-row[data-history-scope]').length,
    hallMethod:(document.querySelector('.hall-card .info-popup')?.textContent||'').trim(),
    classBreaks:document.querySelectorAll('#classEvolutionChart .class-evolution-course-break').length,
    classMethod:(document.querySelector('#classEvolutionChart')?.closest('article')?.querySelector('.info-popup')?.textContent||'').trim(),
    candidateId:candidate?.id||null,
    verifiedPerson:model?.verified_person===true,
    expectedSeries:model?.comparable_series?.length||0,
    expectedSeparate:model?model.rows.filter(item=>!new Set((model.focus_series?.rows||[]).map(row=>String(row.id))).has(String(item.result.id))).length:0,
    seriesRendered:document.querySelectorAll('#runnerHistory .history-series').length,
    separateRendered:document.querySelectorAll('#runnerHistory .history-year.separate-series').length,
    historyNote:(document.querySelector('#runnerHistory .history-identity-note')?.textContent||'').trim(),
    archiveMethod:(document.querySelector('.history-lab .info-popup')?.textContent||'').trim(),
  };
})()`);
await delay(100);

const clubHistorySearch=await evaluate(`(() => {
  const input=document.querySelector('#clubCompareSearch');
  if(!input)return {available:false};
  input.value='STOCKHOLM';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  return {available:true};
})()`);
await delay(120);
const clubHistorySelection=await evaluate(`(() => {
  const buttons=[...document.querySelectorAll('#clubCompareSuggestions .club-search-option')];
  const match=buttons.find(button=>(button.textContent||'').toUpperCase().includes('STOCKHOLM'))||buttons[0]||null;
  if(!match)return {found:false};
  const text=(match.textContent||'').trim();
  match.click();
  return {found:true,text};
})()`);
await delay(180);
const clubHistoryCourseVersion=await evaluate(`(() => {
  const races=state.data.races.filter(race=>window.RaceContracts.familyForRace(race)===state.raceFamily);
  const scopeForYear=year=>{const race=races.find(item=>Number(item.year)===Number(year));return race?window.HistoryIntelligence.comparisonKeyForRace(race):null};
  const currentRace=state.data.races.find(race=>String(race.id)===String(state.raceId));
  const currentScope=currentRace?window.HistoryIntelligence.comparisonKeyForRace(currentRace):null;
  const paths=[...document.querySelectorAll('#clubHistoryChart .club-history-line')].map(path=>({scope:path.dataset.historyScope||'',from:Number(path.dataset.historyFrom),to:Number(path.dataset.historyTo)}));
  const pathScopesValid=paths.length>=1&&paths.every(path=>path.scope&&scopeForYear(path.from)===path.scope&&scopeForYear(path.to)===path.scope);
  const improvedButton=document.querySelector('#clubRankingTabs button[data-metric="improved"]');
  improvedButton?.click();
  const rankingRows=[...document.querySelectorAll('#clubRankings button')].map(button=>{
    const text=(button.querySelector('em')?.textContent||'').trim();
    const match=text.match(/(\\d{4})–(\\d{4})/);
    const from=match?Number(match[1]):null,to=match?Number(match[2]):null;
    return {text,from,to,fromScope:from?scopeForYear(from):null,toScope:to?scopeForYear(to):null};
  });
  const improvementValid=rankingRows.length>0&&rankingRows.every(row=>row.from&&row.to&&row.fromScope===currentScope&&row.toScope===currentScope);
  const method=(document.querySelector('#clubHistoryChart')?.closest('article')?.querySelector('.info-popup')?.textContent||'').trim();
  return {available:true,currentScope,paths,pathScopesValid,rankingRows,improvementValid,method};
})()`);

const u8Ux=await evaluate(`(() => {
  const guide=document.querySelector('#analysisGuideDetails');if(guide)guide.open=true;
  const classNav=document.querySelector('.analysis-nav-button[data-target="klasser"]');classNav?.click();
  const activeNav=document.querySelector('.analysis-nav-button[aria-current="location"]');
  const tip=document.querySelector('.info-tip[aria-controls][aria-describedby]');
  const popupId=tip?.getAttribute('aria-controls')||'';
  return {
    skipHref:document.querySelector('.skip-link')?.getAttribute('href')||null,
    h1Count:document.querySelectorAll('h1').length,
    mainFocusable:document.querySelector('#mainContent')?.getAttribute('tabindex')||null,
    race90Pressed:document.querySelector('#raceSwitch90')?.getAttribute('aria-pressed')||null,
    race45Pressed:document.querySelector('#raceSwitch45')?.getAttribute('aria-pressed')||null,
    falseTabs:document.querySelectorAll('.race-switch [role="tab"],.race-switch[role="tablist"]').length,
    guideOpen:Boolean(guide?.open),
    guideContext:(document.querySelector('#analysisGuideContext')?.textContent||'').trim(),
    guideData:(document.querySelector('#analysisGuideDataStatus')?.textContent||'').trim(),
    guideFilters:(document.querySelector('#analysisGuideFilterStatus')?.textContent||'').trim(),
    activeNav:activeNav?.dataset.target||null,
    infoLinked:Boolean(tip&&popupId&&tip.getAttribute('aria-describedby')===popupId&&document.getElementById(popupId)),
    keyboardRows:document.querySelectorAll('#resultsBody tr[role="button"][tabindex="0"]').length,
  };
})()`);
await evaluate(`(() => {
  const row=document.querySelector('#resultsBody tr[role="button"]');
  row?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
})()`);
await delay(650);
const u8Keyboard=await evaluate(`(() => {
  const dialog=document.querySelector('#runnerDialog'),open=Boolean(dialog?.open),text=(document.querySelector('#runnerDetail')?.innerText||'').trim();
  if(dialog?.open)dialog.close();
  document.querySelector('.analysis-nav-button[data-target="overview"]')?.click();
  return {open,textLength:text.length};
})()`);

const originalViewport=await evaluate(`({width:window.innerWidth,height:window.innerHeight})`);
const viewportSpecs=[
  {width:390,height:844,maxOverflow:2,guideColumns:1},
  {width:900,height:900,maxOverflow:2,guideColumns:2},
  {width:1536,height:1024,maxOverflow:2,guideColumns:4},
];
const u9Viewports=[];
for(const spec of viewportSpecs){
  await command("Emulation.setDeviceMetricsOverride",{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:false});
  await delay(140);
  const measured=await evaluate(`(() => {
    const grid=document.querySelector('.analysis-guide-grid');
    const columns=grid?getComputedStyle(grid).gridTemplateColumns.split(/\\s+/).filter(Boolean).length:0;
    const scrolling=document.scrollingElement||document.documentElement;
    return {
      innerWidth:window.innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      documentClientWidth:document.documentElement.clientWidth,
      bodyWidth:document.body.scrollWidth,
      scrollingWidth:scrolling.scrollWidth,
      scrollingClientWidth:scrolling.clientWidth,
      overflow:Math.max(0,scrolling.scrollWidth-scrolling.clientWidth),
      guideColumns:columns,
      mainVisible:Boolean(document.querySelector('#mainContent')),
    };
  })()`);
  u9Viewports.push({...spec,...measured,verified:measured.overflow<=spec.maxOverflow&&measured.guideColumns===spec.guideColumns&&measured.mainVisible});
}
await command("Emulation.setDeviceMetricsOverride",{width:originalViewport.width,height:originalViewport.height,deviceScaleFactor:1,mobile:false});
await delay(100);

const browserHistoryBaseline=await evaluate(`(() => {
  const race=state.data.races.find(item=>String(item.id)===String(state.raceId));
  return {family:state.raceFamily,year:Number(race?.year||0),sex:document.querySelector('#sexFilter')?.value||'',urlRace:new URL(location.href).searchParams.get('race'),urlYear:Number(new URL(location.href).searchParams.get('year')||0)};
})()`);
await evaluate(`(() => {const el=document.querySelector('#sexFilter');el.value='M';el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
await delay(180);
const browserHistoryFilterForward=await evaluate(`(() => ({sex:document.querySelector('#sexFilter')?.value||'',urlSex:new URL(location.href).searchParams.get('sex')||''}))()`);
await evaluate('history.back()');
await delay(220);
const browserHistoryFilterBack=await evaluate(`(() => ({sex:document.querySelector('#sexFilter')?.value||'',urlSex:new URL(location.href).searchParams.get('sex')||''}))()`);
await evaluate('history.forward()');
await delay(220);
const browserHistoryFilterForwardAgain=await evaluate(`(() => ({sex:document.querySelector('#sexFilter')?.value||'',urlSex:new URL(location.href).searchParams.get('sex')||''}))()`);
await evaluate('history.back()');
await delay(220);

const historyUv45Switch=await evaluate(`(async()=>{
  const button=document.querySelector('#raceSwitch45');
  if(typeof button?.onclick!=='function')return false;
  await button.onclick();
  return state.raceFamily==='uv45';
})()`);
for(let attempt=0;attempt<300;attempt++){if(await evaluate("state.raceFamily==='uv45'"))break;await delay(100)}
const browserHistoryUv45=await evaluate(`(() => {const race=state.data.races.find(item=>String(item.id)===String(state.raceId));return {family:state.raceFamily,year:Number(race?.year||0),urlRace:new URL(location.href).searchParams.get('race'),urlYear:Number(new URL(location.href).searchParams.get('year')||0)}})()`);
await evaluate('history.back()');
for(let attempt=0;attempt<300;attempt++){if(await evaluate("(() => {const u=new URL(location.href),race=state.data.races.find(item=>String(item.id)===String(state.raceId));return state.raceFamily==='uv90'&&u.searchParams.get('race')==='uv90'&&String(race?.year||'')===String(u.searchParams.get('year')||'')})()"))break;await delay(100)}
const browserHistoryRaceBack=await evaluate(`(() => {const race=state.data.races.find(item=>String(item.id)===String(state.raceId));return {family:state.raceFamily,year:Number(race?.year||0),sex:document.querySelector('#sexFilter')?.value||'',urlRace:new URL(location.href).searchParams.get('race'),urlYear:Number(new URL(location.href).searchParams.get('year')||0)}})()`);
await evaluate('history.forward()');
for(let attempt=0;attempt<300;attempt++){if(await evaluate("(() => {const u=new URL(location.href),race=state.data.races.find(item=>String(item.id)===String(state.raceId));return state.raceFamily==='uv45'&&u.searchParams.get('race')==='uv45'&&String(race?.year||'')===String(u.searchParams.get('year')||'')})()"))break;await delay(100)}
const browserHistoryRaceForward=await evaluate(`(() => {const race=state.data.races.find(item=>String(item.id)===String(state.raceId));return {family:state.raceFamily,year:Number(race?.year||0),urlRace:new URL(location.href).searchParams.get('race'),urlYear:Number(new URL(location.href).searchParams.get('year')||0)}})()`);
await evaluate('history.back()');
for(let attempt=0;attempt<300;attempt++){if(await evaluate("(() => {const u=new URL(location.href),race=state.data.races.find(item=>String(item.id)===String(state.raceId));return state.raceFamily==='uv90'&&u.searchParams.get('race')==='uv90'&&String(race?.year||'')===String(u.searchParams.get('year')||'')})()"))break;await delay(100)}
await evaluate("ensureActiveFamilyFull('uv90',true)");
await waitForActiveFamily('uv90');
const browserHistoryState=await evaluate(`(() => {const race=state.data.races.find(item=>String(item.id)===String(state.raceId));return {family:state.raceFamily,year:Number(race?.year||0),sex:document.querySelector('#sexFilter')?.value||'',urlRace:new URL(location.href).searchParams.get('race'),urlYear:Number(new URL(location.href).searchParams.get('year')||0)}})()`);

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
const sourceStringSecurity=await evaluate(`(async () => {
  const row=state.filtered?.[0];
  const profile=row?window.RunnerAnalysis.profileForResult(state.data,row.id):null;
  const sourceCheckpoint=profile?.journey?.rows.find(item=>item.source!=='start');
  if(!row||!sourceCheckpoint)return {available:false,executed:null,handlerAttributes:null,statusClass:null,visibleText:null,injectedNodes:null,checkpointText:null};
  const original={status:row.status,name:row.name_as_published,club:row.club,city:row.city,ageClass:row.age_class};
  const payload='FINISHED" onmouseover="window.__ULTRAVASAN_AUDIT_XSS=1';
  const namePayload='<img src=x onerror="window.__ULTRAVASAN_AUDIT_XSS=2">';
  const clubPayload='<img src=x onerror="window.__ULTRAVASAN_AUDIT_XSS=3">';
  const cityPayload='<img src=x onerror="window.__ULTRAVASAN_AUDIT_XSS=4">';
  const classPayload='<img src=x onerror="window.__ULTRAVASAN_AUDIT_XSS=5">';
  const checkpointPayload='<img src=x onerror="window.__ULTRAVASAN_AUDIT_XSS=6">';
  window.__ULTRAVASAN_AUDIT_XSS=0;
  try{
    Object.assign(row,{status:payload,name_as_published:namePayload,club:clubPayload,city:cityPayload,age_class:classPayload});
    renderTable();
    const status=document.querySelector('#resultsBody .status');
    status?.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    const checkpointRow={...sourceCheckpoint,checkpoint_name:checkpointPayload};
    const checkpointProfile={...profile,journey:{...profile.journey,rows:[checkpointRow],recorded_rows:1}};
    const sandbox=document.createElement('div');
    sandbox.innerHTML=renderRunnerJourney(checkpointProfile)+'<table><tbody>'+renderRunnerJourneyTable(checkpointProfile)+'</tbody></table>';
    const visibleTexts=[
      document.querySelector('#resultsBody .runner-name')?.textContent||'',
      document.querySelector('#resultsBody .runner-meta')?.textContent||'',
      document.querySelector('#resultsBody tr td:nth-child(4)')?.textContent||'',
      document.querySelector('#resultsBody tr td:nth-child(5)')?.textContent||'',
      status?.textContent||''
    ];
    const checkpointTexts=[...sandbox.querySelectorAll('.runner-journey-stop-head strong,tbody td:first-child')].map(node=>node.textContent||'');
    const handlerAttributes=[...document.querySelectorAll('#resultsBody [onerror],#resultsBody [onmouseover]'),...sandbox.querySelectorAll('[onerror],[onmouseover]')].map(node=>node.getAttribute('onerror')||node.getAttribute('onmouseover'));
    const result={
      available:true,
      executed:window.__ULTRAVASAN_AUDIT_XSS,
      handlerAttributes,
      statusClass:status?.className||null,
      visibleTexts,
      checkpointTexts,
      injectedNodes:document.querySelectorAll('#resultsBody img').length+sandbox.querySelectorAll('img').length,
      allowlistedFinishedToken:statusClassToken('FINISHED')==='finished',
      unknownToken:statusClassToken(payload)==='unknown'&&statusClassToken('constructor')==='unknown'&&statusClassToken('__proto__')==='unknown',
      payloads:{payload,namePayload,clubPayload,cityPayload,classPayload,checkpointPayload}
    };
    sandbox.remove();
    return result;
  }finally{
    Object.assign(row,{status:original.status,name_as_published:original.name,club:original.club,city:original.city,age_class:original.ageClass});
    renderTable();
    delete window.__ULTRAVASAN_AUDIT_XSS;
  }
})()`);

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
    developmentRows:root?.querySelectorAll('[data-development-distance]').length||0,
    developmentHeaders:[...root?.querySelectorAll('.runner-development-table thead th')||[]].map(node=>(node.textContent||'').trim()),
    developmentText:root?.querySelector('.runner-development')?.innerText||'',
    scrubberMax:Number(root?.querySelector('[data-replay-scrubber]')?.max||0),
    playDisabled:Boolean(root?.querySelector('[data-replay-action="play"]')?.disabled),
  };
})()`);
const developmentBefore=await evaluate(`(() => ({
  distance:document.querySelector('#runnerDetail [data-replay-value="distance"]')?.textContent||'',
  playText:(document.querySelector('#runnerDetail [data-replay-action="play"]')?.innerText||'').trim(),
  audioPaused:document.querySelector('#runnerDetail [data-replay-audio]')?.paused!==false,
}))()`);
await evaluate("document.querySelector('#runnerDetail [data-development-distance]')?.click()");
await delay(120);
const developmentSeek=await evaluate(`(() => ({
  distance:document.querySelector('#runnerDetail [data-replay-value="distance"]')?.textContent||'',
  playText:(document.querySelector('#runnerDetail [data-replay-action="play"]')?.innerText||'').trim(),
  audioPaused:document.querySelector('#runnerDetail [data-replay-audio]')?.paused!==false,
  selectedDistance:Number(document.querySelector('#runnerDetail [data-development-distance]')?.dataset.developmentDistance||0),
}))()`);
await evaluate("document.querySelector('#runnerDetail [data-replay-action=\"play\"]')?.click()");
await delay(700);
const replayProgress = await evaluate(`(() => ({
  distance:document.querySelector('#runnerDetail [data-replay-value="distance"]')?.textContent||'',
  time:document.querySelector('#runnerDetail [data-replay-value="time"]')?.textContent||''
}))()`);

const favoriteBefore=await evaluate(`(() => ({
  pressed:document.querySelector('#runnerDetail [data-runner-favorite]')?.getAttribute('aria-pressed')||null,
  count:Number(document.querySelector('#runnerFavoritesCount')?.textContent||0),
}))()`);
await evaluate("document.querySelector('#runnerDetail [data-runner-favorite]')?.click()");
await delay(120);
const favoriteSaved=await evaluate(`(() => ({
  pressed:document.querySelector('#runnerDetail [data-runner-favorite]')?.getAttribute('aria-pressed')||null,
  count:Number(document.querySelector('#runnerFavoritesCount')?.textContent||0),
  listText:document.querySelector('#runnerFavoritesList')?.innerText||'',
  stored:JSON.parse(localStorage.getItem('ultravasan-runner-favorites-v1')||'[]'),
}))()`);
await evaluate("document.querySelector('#runnerDialog')?.open&&document.querySelector('#runnerDialog').close()");
await evaluate("document.querySelector('#runnerFavoritesList [data-favorite-open]')?.click()");
await delay(250);
const favoriteReopened=await evaluate(`(() => ({
  open:document.querySelector('#runnerDialog')?.open||false,
  text:(document.querySelector('#runnerDetail')?.innerText||'').slice(0,250),
  pressed:document.querySelector('#runnerDetail [data-runner-favorite]')?.getAttribute('aria-pressed')||null,
}))()`);
await evaluate("document.querySelector('#runnerDialog')?.open&&document.querySelector('#runnerDialog').close()");
await evaluate("document.querySelector('#runnerFavoritesList [data-favorite-remove]')?.click()");
await delay(80);
const favoriteRemoved=await evaluate(`(() => ({
  count:Number(document.querySelector('#runnerFavoritesCount')?.textContent||0),
  stored:JSON.parse(localStorage.getItem('ultravasan-runner-favorites-v1')||'[]'),
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
  for(let attempt=0;attempt<450;attempt++){
    const active=await evaluate(`(() => {
      const data=window.ULTRAVASAN_ACTIVE_DATA;
      if(!data?.races?.length)return {family:null,phase:null,splits:0};
      const families=[...new Set(data.races.map(r=>window.RaceContracts.familyForRace(r)))];
      return {
        family:families.length===1?families[0]:families.join(','),
        phase:state?.dataPhase||null,
        splits:data.splits?.length||0
      };
    })()`);
    if(active.family===family&&(!requireSplits||(active.phase==='full'&&active.splits>0)))return true;
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
const uv45SwitchAwaited=await evaluate(`(async()=>{
  const button=document.querySelector('#raceSwitch45');
  if(typeof button?.onclick!=='function')return false;
  await button.onclick();
  await ensureActiveFamilyFull('uv45',true);
  return state.raceFamily==='uv45'&&state.dataPhase==='full';
})()`);
const uv45Loaded=uv45SwitchAwaited&&await waitForActiveFamily('uv45');
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
// First return from the UV45 browser case to a fully hydrated UV90 family.
// Then verify a same-CourseVersion pair and an old/new course pair.
await evaluate("document.querySelector('#runnerDialog')?.open&&document.querySelector('#runnerDialog').close()");
const uv90SwitchAwaited=await evaluate(`(async()=>{
  const button=document.querySelector('#raceSwitch90');
  if(typeof button?.onclick!=='function')return false;
  await button.onclick();
  await ensureActiveFamilyFull('uv90',true);
  return state.raceFamily==='uv90'&&state.dataPhase==='full';
})()`);
const uv90Reloaded=uv90SwitchAwaited&&await waitForActiveFamily('uv90');
await evaluate(`(() => {
  const year=document.querySelector('#compareYear');
  if(year){year.value='all';year.dispatchEvent(new Event('change',{bubbles:true}))}
  compareState.selected=[];
  const data=window.ULTRAVASAN_ACTIVE_DATA,r24=data.races.find(item=>item.race_key==='ultravasan90-2024'),r25=data.races.find(item=>item.race_key==='ultravasan90-2025');
  const a=data.results.find(item=>item.race_id===r24?.id&&item.status==='FINISHED'),b=data.results.find(item=>item.race_id===r25?.id&&item.status==='FINISHED');
  addCompareRunner(a?.id||0);addCompareRunner(b?.id||0);
  document.querySelector('#compareH2HButton')?.click();
})()`);
await delay(250);
const h2hComparable=await evaluate(`(() => ({
  open:document.querySelector('#headToHeadDialog')?.open||false,
  finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,
  checkpointRows:document.querySelectorAll('#headToHeadDetail [data-h2h-checkpoint]').length,
  placement:Boolean(document.querySelector('#headToHeadDetail .h2h-placement svg')),
  courseMap:Boolean(document.querySelector('#headToHeadDetail .h2h-course-map svg')),
  elevation:Boolean(document.querySelector('#headToHeadDetail .h2h-course-elevation svg')),
  segmentCards:document.querySelectorAll('#headToHeadDetail .h2h-segment').length,
  warnings:document.querySelectorAll('#headToHeadDetail .h2h-warning').length,
  text:document.querySelector('#headToHeadDetail')?.innerText||'',
}))()`);

await evaluate(`(() => {
  const dialog=document.querySelector('#headToHeadDialog');if(dialog?.open)dialog.close();
  compareState.selected=[];
  const data=window.ULTRAVASAN_ACTIVE_DATA,race=data.races.find(item=>item.race_key==='ultravasan90-2025');
  const finishers=data.results.filter(item=>item.race_id===race?.id&&item.status==='FINISHED').slice(0,2);
  finishers.forEach(item=>addCompareRunner(item.id));
  document.querySelector('#compareH2HButton')?.click();
})()`);
await delay(250);
const h2hSameEdition=await evaluate(`(() => ({
  open:document.querySelector('#headToHeadDialog')?.open||false,
  finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,
  checkpointRows:document.querySelectorAll('#headToHeadDetail [data-h2h-checkpoint]').length,
  placement:Boolean(document.querySelector('#headToHeadDetail .h2h-placement svg')),
  courseMap:Boolean(document.querySelector('#headToHeadDetail .h2h-course-map svg')),
  elevation:Boolean(document.querySelector('#headToHeadDetail .h2h-course-elevation svg')),
  segmentCards:document.querySelectorAll('#headToHeadDetail .h2h-segment').length,
  warnings:document.querySelectorAll('#headToHeadDetail .h2h-warning').length,
  text:document.querySelector('#headToHeadDetail')?.innerText||'',
}))()`);

const changedCourseId=await evaluate(`(() => {
  const data=window.ULTRAVASAN_ACTIVE_DATA;
  const race=data.races.find(item=>item.race_key==='ultravasan90-2019');
  return data.results.find(item=>item.race_id===race?.id&&item.status==='FINISHED'&&Number(item.finish_seconds)>0)?.id||null;
})()`);
await evaluate(`(() => {
  const dialog=document.querySelector('#headToHeadDialog');if(dialog?.open)dialog.close();
  compareState.selected=[];
  const data=window.ULTRAVASAN_ACTIVE_DATA,race=data.races.find(item=>item.race_key==='ultravasan90-2025');
  const baseline=data.results.find(item=>item.race_id===race?.id&&item.status==='FINISHED');
  addCompareRunner(baseline?.id||0);
  addCompareRunner(${changedCourseId});
  document.querySelector('#compareH2HButton')?.click();
})()`);
await delay(250);
const h2hChangedCourse=await evaluate(`(() => ({
  open:document.querySelector('#headToHeadDialog')?.open||false,
  finishCards:document.querySelectorAll('#headToHeadDetail .h2h-finish-grid article').length,
  checkpointRows:document.querySelectorAll('#headToHeadDetail [data-h2h-checkpoint]').length,
  placement:Boolean(document.querySelector('#headToHeadDetail .h2h-placement svg')),
  courseMap:Boolean(document.querySelector('#headToHeadDetail .h2h-course-map svg')),
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
      state.note.includes('kartreferens')
    )
  });
}

const checks = {
  browserHistory:Boolean(
    browserHistoryBaseline.family==='uv90'&&browserHistoryBaseline.urlRace==='uv90'&&
    browserHistoryFilterForward.sex==='M'&&browserHistoryFilterForward.urlSex==='M'&&
    browserHistoryFilterBack.sex===''&&browserHistoryFilterBack.urlSex===''&&
    browserHistoryFilterForwardAgain.sex==='M'&&browserHistoryFilterForwardAgain.urlSex==='M'&&
    historyUv45Switch&&browserHistoryUv45.family==='uv45'&&browserHistoryUv45.urlRace==='uv45'&&
    browserHistoryRaceBack.family===browserHistoryBaseline.family&&browserHistoryRaceBack.year===browserHistoryBaseline.year&&browserHistoryRaceBack.urlRace==='uv90'&&
    browserHistoryRaceForward.family==='uv45'&&browserHistoryRaceForward.urlRace==='uv45'&&
    browserHistoryState.family===browserHistoryBaseline.family&&browserHistoryState.year===browserHistoryBaseline.year&&browserHistoryState.sex===''&&browserHistoryState.urlRace==='uv90'
  ),
  contracts:Object.values(contractChecks).every(Boolean),
  progressive:progressiveLoad.verified,
  uv45Progressive:uv45Progressive.verified,
  modules:moduleChecks.verified,
  courseIntelligence:Boolean(
    u6Initial.api&&u6Initial.version&&u6Initial.rows>0&&u6Initial.routeSegments>0&&
    u6Initial.spreadHeaders.join('|')==='Q25–Q75|Q10–Q90'&&u6Initial.outerSpreadCells.length>0&&
    u6Initial.elevationSegments>0&&u6Initial.paceSegments>0&&u6Initial.selectedRows===1&&u6Initial.planRows>0&&
    u6Initial.outerQuantiles&&u6Initial.outerQuantiles.n>=20&&u6Initial.outerQuantiles.min===20&&Number.isFinite(Number(u6Initial.outerQuantiles.q10))&&Number.isFinite(Number(u6Initial.outerQuantiles.q90))&&
    Number(u6Initial.outerQuantiles.q10)<=Number(u6Initial.outerQuantiles.q25)&&Number(u6Initial.outerQuantiles.q75)<=Number(u6Initial.outerQuantiles.q90)&&
    u6Initial.method.includes('n≥20')&&u6Initial.method.includes('separata empiriska dimensioner')&&u6Initial.method.includes('inte ihop till en totalscore eller ranking')&&
    u6Initial.method.includes('inte i sig bevis för exakt historisk geometri')&&
    u6Initial.planMethod.includes('exakt samma CourseVersion')&&
    u6Synced.key&&u6Synced.rowSelected===1&&u6Synced.routeSelected===1&&u6Synced.elevationSelected===1&&
    u6Synced.paceSelected===1&&u6Synced.legacyFrom===u6Synced.expectedFrom&&u6Synced.legacyTo===u6Synced.expectedTo&&
    u6Plan.target==='09:30:00'&&u6Plan.rows===u6Initial.rows&&u6Plan.historical>0&&u6Plan.unavailable===0&&
    !u6Plan.status.includes('kan inte beräknas')&&u6Plan.lastCumulative&&u6Plan.lastCumulative!=='–'
  ),
  historyIntelligence:Boolean(
    u7Switch?.key==='ultravasan90-2025'&&u7History.api&&
    u7History.fingerprintPerformanceYears.join(',')==='2024'&&u7History.fingerprintRows===5&&
    u7History.fingerprintScopes.filter(item=>['finish_difficulty','pace_level','dnf_load'].includes(item[0])).every(item=>item[1]===false&&item[2]==='whole-course-comparable-race-medians'&&item[3]===1)&&
    u7History.fingerprintMethod.includes('uttryckligt verifierade whole-course-grupp')&&u7History.hallRows>0&&u7History.hallMethod.includes('verifierad personidentitet')&&
    u7History.classBreaks>0&&u7History.classMethod.includes('CourseVersion beskriver')&&u7History.classMethod.includes('helbanans jämförbarhet saknas')&&
    u7History.candidateId&&u7History.verifiedPerson&&u7History.expectedSeries>=1&&u7History.seriesRendered===u7History.expectedSeries&&
    u7History.separateRendered===u7History.expectedSeparate&&u7History.historyNote.includes('Verifierad personidentitet')&&
    u7History.archiveMethod.includes('Namn, startnummer')&&u7History.archiveMethod.includes('checkpoint-/segmentkontrakt')
  ),
  clubHistoryCourseVersion:Boolean(
    clubHistoryCourseVersion.available&&clubHistoryCourseVersion.currentScope==='group:ultravasan90-2024-2025'&&
    clubHistoryCourseVersion.pathScopesValid&&clubHistoryCourseVersion.improvementValid&&
    clubHistoryCourseVersion.method.includes('verifierade helbanenyckel')
  ),
  finishProgression:Boolean(
    finishProgression.shares.join(',')==='10,25,50,75,90'&&
    finishProgression.labels.join('|')==='10 % i mål|25 % i mål|50 % i mål · median|75 % i mål|90 % i mål'&&
    finishProgression.primaryTimes.length===5&&finishProgression.primaryTimes.every(Boolean)&&
    finishProgression.male===5&&finishProgression.female===5&&
    finishProgressionFemaleHidden.shares.join(',')==='10,25,50,75,90'&&
    JSON.stringify(finishProgressionFemaleHidden.primaryTimes)===JSON.stringify(finishProgression.primaryTimes)&&
    finishProgressionFemaleHidden.male===5&&finishProgressionFemaleHidden.female===0&&
    finishProgression.help.includes('Q10, Q25, Q50, Q75 och Q90')&&finishProgression.help.includes('påverkar endast de sekundära könsvärdena')
  ),
  uxMethodology:Boolean(
    u8Ux.skipHref==='#mainContent'&&u8Ux.h1Count===1&&u8Ux.mainFocusable==='-1'&&
    u8Ux.race90Pressed==='true'&&u8Ux.race45Pressed==='false'&&u8Ux.falseTabs===0&&
    u8Ux.guideOpen&&u8Ux.guideContext.includes('Ultravasan 90')&&u8Ux.guideContext.includes('2025')&&
    u8Ux.guideData.includes('Full historik')&&u8Ux.guideFilters.includes('Visar')&&
    u8Ux.activeNav==='klasser'&&u8Ux.infoLinked&&u8Ux.keyboardRows>0&&
    u8Keyboard.open&&u8Keyboard.textLength>50
  ),
  responsiveFreeze:u9Viewports.length===3&&u9Viewports.every(item=>item.verified),
  maps:mapCases.length===3&&mapCases.every(item=>item.verified),
  title: initial.title.includes("Sälen") || initial.title.includes("Ultravasan"),
  race: initial.race?.race_key === "ultravasan90-2016" && initial.race?.year === 2016,
  result: initial.result?.bib === "1025" && initial.result?.finish_seconds === 26280 && initial.result?.overall_place === 22,
  splits: initial.splitCount === 8 && initial.checkpointKeys.join(",") === "smagan,mangsbodarna,risberg,evertsberg,oxberg,hokberg,eldris,mora",
  search: suggestion.hidden === false && suggestion.id === "11545" && suggestion.text.includes("Hermansson, Andreas") && suggestion.text.includes("2016"),
  dialog: dialog.open && dialog.replay && dialog.journey && dialog.journeyStops === 9 && dialog.segmentCards === 8 && dialog.checkpointMarkers === 9,
  runnerDevelopment: dialog.developmentRows===8&&dialog.developmentHeaders.join('|')==='Kontroll|Tid|Hela fältet|Mitt kön|Min klass|Totalplats|Klassplats|Segment mot egen helfart'&&dialog.developmentText.includes('Checkpoint för checkpoint')&&developmentSeek.selectedDistance>0&&developmentSeek.distance!==developmentBefore.distance&&developmentSeek.playText.includes('Spela loppet')&&developmentSeek.audioPaused,
  detail: dialog.text.includes("Hermansson, Andreas") && dialog.text.includes("7:18:00") && dialog.text.includes("Mora"),
  replay: !dialog.playDisabled && dialog.scrubberMax >= 90 && replayProgress.distance !== "0,0 km",
  sourceStringSecurity: sourceStringSecurity.available&&sourceStringSecurity.executed===0&&sourceStringSecurity.handlerAttributes.length===0&&sourceStringSecurity.injectedNodes===0&&sourceStringSecurity.statusClass==='status unknown'&&sourceStringSecurity.unknownToken&&sourceStringSecurity.allowlistedFinishedToken&&
    sourceStringSecurity.visibleTexts[0].includes(sourceStringSecurity.payloads.namePayload)&&
    sourceStringSecurity.visibleTexts[1].includes(sourceStringSecurity.payloads.cityPayload)&&
    sourceStringSecurity.visibleTexts[2]===sourceStringSecurity.payloads.classPayload&&
    sourceStringSecurity.visibleTexts[3]===sourceStringSecurity.payloads.clubPayload&&
    sourceStringSecurity.visibleTexts[4]===sourceStringSecurity.payloads.payload&&
    sourceStringSecurity.checkpointTexts.includes(sourceStringSecurity.payloads.checkpointPayload),
  favorites: favoriteBefore.pressed==='false' && favoriteBefore.count===0 && favoriteSaved.pressed==='true' && favoriteSaved.count===1 && favoriteSaved.listText.includes('Hermansson, Andreas') && favoriteSaved.stored.length===1 && favoriteReopened.open && favoriteReopened.text.includes('Hermansson, Andreas') && favoriteReopened.pressed==='true' && favoriteRemoved.count===0 && favoriteRemoved.stored.length===0,
  additionalCases: caseResults.length === 5 && caseResults.every(item=>item.verified),
  h2hComparable: uv90Reloaded && h2hComparable.open && h2hComparable.finishCards===2 && h2hComparable.checkpointRows>0 && h2hComparable.placement && h2hComparable.courseMap && h2hComparable.elevation && h2hComparable.segmentCards>0 && h2hComparable.text.includes('Sluttid och gap') && h2hComparable.text.includes('CHECKPOINTGAP') && h2hComparable.text.includes('PLACERINGSRESA') && h2hComparable.text.includes('BANA OCH HÖJD'),
  h2hSameEdition: uv90Reloaded && h2hSameEdition.open && h2hSameEdition.finishCards===2 && h2hSameEdition.checkpointRows>0 && h2hSameEdition.placement && h2hSameEdition.courseMap && h2hSameEdition.elevation && h2hSameEdition.segmentCards>0 && h2hSameEdition.text.includes('Sluttid och gap'),
  h2hChangedCourse: Boolean(changedCourseId) && h2hChangedCourse.open && h2hChangedCourse.finishCards===0 && h2hChangedCourse.checkpointRows===0 && !h2hChangedCourse.placement && !h2hChangedCourse.courseMap && h2hChangedCourse.warnings>=2 && h2hChangedCourse.text.includes('Sluttider jämförs inte direkt') && h2hChangedCourse.text.includes('Checkpointgap och placeringsresa visas inte'),
  console: browserErrors.length === 0,
  network: networkErrors.length === 0,
};
const output = {browserHistoryBaseline,browserHistoryFilterForward,browserHistoryFilterBack,browserHistoryFilterForwardAgain,browserHistoryUv45,browserHistoryRaceBack,browserHistoryRaceForward,browserHistoryState,sourceStringSecurity,clubHistoryCourseVersion,finishProgression,finishProgressionFemaleHidden,progressiveLoad,uv45SwitchAwaited,uv45Progressive,moduleChecks,u6Initial,u6Synced,u6Plan,u7Switch,u7History,u8Ux,u8Keyboard,u9Viewports,contractChecks,developmentBefore,developmentSeek,favoriteBefore,favoriteSaved,favoriteReopened,favoriteRemoved,uv90SwitchAwaited,uv90Reloaded,h2hComparable,h2hSameEdition,h2hChangedCourse,changedCourseId,mapCases,verified:Object.values(checks).every(Boolean),checks,initial,suggestion,dialog,replayProgress,caseResults,browserErrors,networkErrors};
console.log(JSON.stringify(output, null, 2));
socket.close();
if (!output.verified) process.exitCode = 1;
