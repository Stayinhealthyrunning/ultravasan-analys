'use strict';

const COLORS=['#ff5f5f','#2f80ed','#a855f7','#00a878','#ff9f1c'];
const MAP_SESSION_KEY='ultravasan-map-data-v2';
const app={data:null,registry:null,models:[],time:0,maxTime:1,speed:300,playing:false,lastFrame:0,lastUi:0,lastCamera:0,lastBattle:0,prevTime:0,map:null,tileLayer:null,routeOnly:false,leafletReady:false,focused:null,project:null,usedRoutes:[],allCoords:[],audio:null,musicEnabled:true};
const $=s=>document.querySelector(s);
const fmtTime=s=>{if(s==null||!Number.isFinite(s))return '–';s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`};
const fmtPace=s=>!Number.isFinite(s)?'–':`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')} /km`;
const fmtGap=s=>!Number.isFinite(s)||s<1?'LEDARE':`+${fmtTime(s)}`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2};
const mapRaceFamily=r=>String(r?.race_key||'').startsWith('ultravasan45-')?'uv45':String(r?.race_key||'').startsWith('ultravasan90-')?'uv90':null;
function mixedRaceFamilyError(results,races){const families=[...new Set((results||[]).map(result=>mapRaceFamily((races||[]).find(r=>r.id===result.race_id))).filter(Boolean))];return families.length>1?'Löpare från Ultravasan 90 och Ultravasan 45 kan inte jämföras i samma kartduell. Välj löpare från ett och samma lopp.':null}
function activeReferenceRoute(models,usedRoutes,registry){return models?.[0]?.route||usedRoutes?.[0]||registry?.routes?.[registry?.default_route_id]||null}
if(typeof module!=='undefined'&&module.exports)module.exports={mapRaceFamily,mixedRaceFamilyError,activeReferenceRoute};
const hydrateData=d=>{d=d||{};d.races=Array.isArray(d.races)?d.races:[];d.results=Array.isArray(d.results)?d.results:[];d.checkpoints=Array.isArray(d.checkpoints)?d.checkpoints:[];d.splits=Array.isArray(d.splits)?d.splits:[];const rr=new Map(d.results.map(r=>[Number(r.id),Number(r.race_id)])),cp=new Map(d.checkpoints.map(c=>[`${Number(c.race_id)}|${c.checkpoint_key}`,c]));d.results.forEach(r=>{r.id=Number(r.id);r.race_id=Number(r.race_id);if(r.finish_seconds!=null)r.finish_seconds=Number(r.finish_seconds)});d.splits.forEach(s=>{s.result_id=Number(s.result_id);if(s.elapsed_seconds!=null)s.elapsed_seconds=Number(s.elapsed_seconds);const c=cp.get(`${rr.get(s.result_id)}|${s.checkpoint_key}`);if(c){s.checkpoint_name=c.name;s.sequence_no=Number(c.sequence_no);s.distance_km=Number(c.distance_km)}else{if(s.sequence_no!=null)s.sequence_no=Number(s.sequence_no);if(s.distance_km!=null)s.distance_km=Number(s.distance_km)}if(s.is_estimated==null)s.is_estimated=0});return d};
function setLoading(text){const p=$('#mapLoading p');if(p)p.textContent=text}
function readSessionData(){try{const raw=sessionStorage.getItem(MAP_SESSION_KEY);if(!raw)return null;const data=JSON.parse(raw);if(data&&Array.isArray(data.results)&&data.results.length)return data}catch(e){console.warn('Kunde inte läsa snabb kartdata',e)}return null}
function loadScript(src,timeout=90000){return new Promise((resolve,reject)=>{const el=document.createElement('script');let done=false;const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve()};el.src=src;el.async=true;el.onload=()=>finish();el.onerror=()=>finish(new Error(`Kunde inte läsa ${src}`));document.head.appendChild(el);const timer=setTimeout(()=>finish(new Error(`Tidsgränsen överskreds för ${src}`)),timeout)})}
async function ensureRaceData(){const quick=readSessionData();if(quick){setLoading('Läser de valda löparna…');return quick}if(window.ULTRAVASAN_DATA)return window.ULTRAVASAN_DATA;setLoading('Läser historikdatabasen för den delade kartlänken…');await loadScript('data/ultravasan-data.js');if(!window.ULTRAVASAN_DATA)throw new Error('Historikdatabasen laddades inte.');return window.ULTRAVASAN_DATA}
function ensureLeaflet(){if(window.L)return Promise.resolve();setLoading('Förbereder karta och banlager…');return new Promise(resolve=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);const script=document.createElement('script');let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=finish;script.onerror=finish;document.head.appendChild(script);const timer=setTimeout(finish,2200)})}


function raceForResult(result){return app.data.races.find(r=>r.id===result.race_id)}
function routeForRace(race){const specific=(app.registry.route_for_race||[]).find(x=>String(race?.race_key||'').startsWith(x.race_key_prefix||'')&&(!x.year_from||race.year>=x.year_from)&&(!x.year_to||race.year<=x.year_to));if(specific)return app.registry.routes[specific.route_id];const rule=(app.registry.route_for_year||[]).find(r=>race?.year>=r.from&&race?.year<=r.to);return app.registry.routes[rule?.route_id||app.registry.default_route_id]}

function boot(){
  if(!app.data||!app.registry)throw new Error('Datafilerna kunde inte läsas.');
  const params=new URLSearchParams(location.search),requestedIds=(params.get('runners')||'').split(',').map(Number).filter(Boolean);
  let selected=app.data.results.filter(r=>requestedIds.includes(r.id));
  const familyError=mixedRaceFamilyError(selected,app.data.races);if(familyError){showFatal(familyError);return}
  if(!selected.length){const requested=Number(params.get('year')),requestedFamily=['uv90','uv45'].includes(params.get('race'))?params.get('race'):'uv90',familyRaces=app.data.races.filter(r=>mapRaceFamily(r)===requestedFamily),race=familyRaces.find(r=>r.id===requested||r.year===requested)||familyRaces.slice().sort((a,b)=>b.year-a.year)[0];selected=app.data.results.filter(r=>r.race_id===race?.id&&r.finish_seconds).sort((a,b)=>a.finish_seconds-b.finish_seconds).slice(0,3)}
  selected=selected.slice(0,5);if(!selected.length){showFatal('Det finns inga löpare att visa.');return}
  app.models=selected.map((r,i)=>buildModel(r,COLORS[i],i));
  const is45=app.models.every(m=>String(m.race?.race_key||'').startsWith('ultravasan45-'));const audio=$('#raceSoundtrack');if(audio)audio.src=window.RACE_MEDIA_CONFIG?.musicForRace(is45?'uv45':'uv90')||'';document.body.classList.toggle('race-uv45',is45);
  app.usedRoutes=[...new Map(app.models.map(m=>[m.route.id,m.route])).values()];
  app.allCoords=app.usedRoutes.flatMap(r=>r.points.map(p=>[p[0],p[1]]));
  app.maxTime=Math.max(...app.models.map(m=>m.endTime),1);app.time=clamp(Number(params.get('t'))||0,0,app.maxTime);app.prevTime=app.time;
  const years=[...new Set(app.models.map(m=>m.race.year))].sort();
  const families=[...new Set(app.models.map(m=>String(m.race?.race_key||'').startsWith('ultravasan45-')?'45':'90'))];const label=families.length===1?`Ultravasan ${families[0]}`:'Ultravasan';$('#raceTitle').textContent=years.length===1?`${label} ${years[0]}`:`${label} · ${years.join(', ')}`;
  $('#courseNote').innerHTML=app.usedRoutes.map(r=>`<span class="course-pill"><i style="background:${r.style.color}"></i>${esc(r.style.label)} · ${r.official_distance_km.toFixed(1)} km${r.geometry_quality==='reference-reconstruction'?' · referenslager':''}</span>`).join('');
  $('#timeline').max=Math.ceil(app.maxTime);$('#timeline').value=Math.round(app.time);$('#finishLabel').textContent=fmtTime(app.maxTime);
  $('#stripLeader').textContent='Start';const distances=[...new Set(app.usedRoutes.map(r=>Number(r.official_distance_km).toFixed(0)))];$('#stripFinishDistance').textContent=`${distances.join('/')} km · Mora`;
  buildCheckpointJump();buildRaceStrip();initMap();bindControls();initAudio();update(true);$('#mapLoading').classList.add('hidden');
}
function showFatal(message){$('#mapLoading').innerHTML=`<p><strong>Kartjämförelsen kunde inte starta.</strong><br>${esc(message)}</p>`}

function buildModel(result,color,index){
  const race=raceForResult(result);if(!race)throw new Error(`Loppår saknas för ${result.name_as_published||result.id}.`);const route=routeForRace(race);if(!route||!Array.isArray(route.points)||route.points.length<2)throw new Error(`Banlager saknas för ${race.year}.`);const routeCp=new Map((route.checkpoints||[]).map(c=>[c.key,c]));
  const raw=app.data.splits.filter(s=>s.result_id===result.id&&Number.isFinite(s.elapsed_seconds)).sort((a,b)=>a.elapsed_seconds-b.elapsed_seconds);
  let anchors=[{time:0,distance:0,name:route.id==='ultravasan45-current'?'Start Oxberg':'Start Sälen',exact:true,kind:'start'}];
  for(const s of raw){
    if(s.elapsed_seconds<=0)continue;const cp=routeCp.get(s.checkpoint_key);const dist=cp?.distance_km??s.distance_km;
    if(!Number.isFinite(dist)||dist<=0)continue;anchors.push({time:Number(s.elapsed_seconds),distance:Math.min(route.official_distance_km,Number(dist)),name:s.checkpoint_name,exact:!s.is_estimated,kind:'split'})
  }
  if(Number.isFinite(result.finish_seconds)&&result.finish_seconds>0)anchors.push({time:Number(result.finish_seconds),distance:route.official_distance_km,name:'Mora mål',exact:true,kind:'finish'});
  anchors=anchors.sort((a,b)=>a.time-b.time).filter((a,i,arr)=>i===0||(a.time>arr[i-1].time&&a.distance>=arr[i-1].distance));
  const dedup=[];for(const a of anchors){const j=dedup.findIndex(x=>Math.abs(x.distance-a.distance)<.01);if(j>=0){if(a.kind==='finish'||a.kind==='split')dedup[j]=a}else dedup.push(a)}anchors=dedup.sort((a,b)=>a.time-b.time);
  if(anchors.length===1)anchors.push({time:1,distance:0,name:'Ingen registrerad passage',exact:false,kind:'stop'});
  const exactSplits=anchors.filter(a=>a.kind==='split'&&a.exact).length,status=String(result.status||'').toUpperCase(),finished=Number.isFinite(Number(result.finish_seconds))&&Number(result.finish_seconds)>0&&!status.includes('DNF')&&!status.includes('DNS')&&!status.includes('DID NOT FINISH');
  const quality=exactSplits>=3?'Hög precision':exactSplits>=1?`${exactSplits} mellantid${exactSplits>1?'er':''}`:'Sluttidsestimat';
  return {result,race,route,color,index,anchors,exactSplits,quality,finished,endTime:anchors.at(-1).time,marker:null,tail:null,strip:null,lastFinished:false};
}

function buildCheckpointJump(){
  const checkpoints=[];for(const route of app.usedRoutes)for(const cp of (route.checkpoints||[])){if(cp.key==='start')continue;if(!checkpoints.some(x=>x.key===cp.key))checkpoints.push(cp)}
  $('#checkpointJump').innerHTML='<option value="">Kontroll…</option>'+checkpoints.map(cp=>`<option value="${cp.key}">${esc(cp.name||cp.short||cp.key)}</option>`).join('')
}

function validLatLng(value){
  return Array.isArray(value)&&value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]));
}
function switchToFallback(reason){
  app.leafletReady=false;app.routeOnly=true;
  try{if(app.map){app.map.remove();app.map=null}}catch(e){console.warn('Kunde inte stänga kartlagret',e)}
  const mapEl=$('#map'),fallback=$('#fallbackMap'),btn=$('#mapModeBtn');
  if(mapEl)mapEl.style.display='none';
  if(fallback)fallback.classList.add('visible');
  if(btn){btn.disabled=true;btn.title='Den förenklade banvyn används'}
  setEvent(reason||'Förenklad banvy används.');
}
function initMap(){
  // Fallback-vyn byggs alltid först. Då fungerar kartduellen även om Leaflet,
  // kartplattor eller webbläsarens säkerhetsinställningar skulle strula.
  initFallback();
  if(!window.L){
    switchToFallback('Interaktiv kartbakgrund saknas. Förenklad banvy används.');
    return;
  }
  try{
    const validCoords=app.allCoords.filter(validLatLng).map(c=>[Number(c[0]),Number(c[1])]);
    if(validCoords.length<2)throw new Error('Banan saknar giltiga GPS-koordinater.');

    app.map=L.map('map',{zoomControl:true,preferCanvas:true,attributionControl:true});

    // VIKTIGT: kartan måste få en vy innan ett GridLayer/tileLayer läggs till.
    // Annars kan Leaflet 1.9 kasta "Cannot read properties of undefined (reading min)".
    const initialBounds=L.latLngBounds(validCoords);
    if(initialBounds&&typeof initialBounds.isValid==='function'&&initialBounds.isValid()){
      app.map.fitBounds(initialBounds,{padding:[50,50],animate:false});
    }else{
      app.map.setView(validCoords[0],8);
    }

    app.leafletReady=true;
    let tileErrors=0;
    app.tileLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:17,
      attribution:'&copy; OpenStreetMap-bidragsgivare'
    }).on('tileerror',()=>{
      tileErrors++;
      if(tileErrors===4)setEvent('Kartbakgrunden kunde inte läsas, men banlager och löpare fungerar.');
    }).addTo(app.map);

    const overlays={};
    for(const route of app.usedRoutes){
      const coords=(route.points||[]).filter(validLatLng).map(p=>[Number(p[0]),Number(p[1])]);
      if(coords.length<2)continue;
      const style=route.style||{};
      const color=style.color||'#176d53';
      const label=style.label||route.name||'Bana';
      const group=L.layerGroup().addTo(app.map);
      L.polyline(coords,{color:'#fff',weight:10,opacity:.78,lineCap:'round',dashArray:style.dashArray||null}).addTo(group);
      L.polyline(coords,{color,weight:5,opacity:.96,lineCap:'round',dashArray:style.dashArray||null}).addTo(group);
      for(const cp of (route.checkpoints||[])){
        if(!validLatLng(cp.coord))continue;
        const c=L.circleMarker([Number(cp.coord[0]),Number(cp.coord[1])],{
          radius:cp.key==='finish'?8:5,color,weight:2,
          fillColor:cp.key==='finish'?'#ff7a3d':'#f7f2dc',fillOpacity:1
        }).addTo(group);
        const km=Number.isFinite(Number(cp.distance_km))?Number(cp.distance_km).toFixed(1):'–';
        c.bindTooltip(`${label} · ${cp.name||cp.key} · ${km} km`,{direction:'top',className:'checkpoint-label',offset:[0,-5]});
      }
      overlays[`${label} (${Number(route.official_distance_km||0).toFixed(1)} km)`]=group;
    }
    if(app.usedRoutes.length>1&&Object.keys(overlays).length>1){
      L.control.layers(null,overlays,{collapsed:false,position:'bottomleft'}).addTo(app.map);
    }
    for(const m of app.models){
      const pos=routePosition(m.route,0);
      if(!validLatLng(pos))continue;
      const icon=L.divIcon({
        className:'',
        html:`<div class="runner-marker" style="background:${m.color};color:${m.color}"><span style="color:white">${markerText(m)}</span><b>${m.race.year}</b></div>`,
        iconSize:[38,38],iconAnchor:[19,19]
      });
      m.marker=L.marker(pos,{icon,zIndexOffset:500-m.index}).addTo(app.map)
        .bindTooltip(`${esc(m.result.name_as_published)} · ${m.race.year} · ${m.quality}`,{direction:'top',offset:[0,-18]});
      m.tail=L.polyline([],{color:m.color,weight:6,opacity:.72,lineCap:'round'}).addTo(app.map);
      m.marker.on('click',()=>focusRunner(m));
    }
    // Säkerställ rätt storlek efter att alla paneler och banlager byggts.
    setTimeout(()=>{
      try{
        app.map.invalidateSize(false);
        if(initialBounds.isValid())app.map.fitBounds(initialBounds,{padding:[50,50],animate:false});
      }catch(e){console.warn('Kunde inte anpassa kartvyn',e)}
    },50);
  }catch(error){
    console.error('Leaflet-kartan kunde inte starta',error);
    switchToFallback(`Kartbakgrunden kunde inte starta (${error?.message||error}). Förenklad banvy används.`);
  }
}

function markerText(m){return m.result.bib?String(m.result.bib).slice(-3):m.result.name_as_published.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}

function initFallback(){
  const svg=$('#fallbackMap'),W=1200,H=650,pad=70,lons=app.usedRoutes.flatMap(r=>r.points.map(p=>p[1])),lats=app.usedRoutes.flatMap(r=>r.points.map(p=>p[0])),minX=Math.min(...lons),maxX=Math.max(...lons),merc=l=>Math.log(Math.tan(Math.PI/4+l*Math.PI/360)),ys=lats.map(merc),minY=Math.min(...ys),maxY=Math.max(...ys),sx=(W-pad*2)/(maxX-minX||1),sy=(H-pad*2)/(maxY-minY||1),scale=Math.min(sx,sy),ox=(W-(maxX-minX)*scale)/2,oy=(H-(maxY-minY)*scale)/2;
  app.project=coord=>[ox+(coord[1]-minX)*scale,H-(oy+(merc(coord[0])-minY)*scale)];
  const ref=activeReferenceRoute(app.models,app.usedRoutes,app.registry);
  let html=`<defs><linearGradient id="banvyBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4eb"/><stop offset="1" stop-color="#cfddd1"/></linearGradient><linearGradient id="banvyForest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8dbc8"/><stop offset="1" stop-color="#aec8b2"/></linearGradient><linearGradient id="banvyLake" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9eef7"/><stop offset="1" stop-color="#a8d4e8"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#banvyBg)" rx="22"/>`;
  html+=`<path d="M0 ${H*0.73} C${W*0.17} ${H*0.58} ${W*0.34} ${H*0.83} ${W*0.52} ${H*0.7} S${W*0.86} ${H*0.54} ${W} ${H*0.67} V${H} H0Z" fill="url(#banvyForest)" opacity=".8"/>`;
  html+=`<ellipse cx="${W*0.18}" cy="${H*0.23}" rx="120" ry="55" fill="url(#banvyLake)" opacity=".5"/><ellipse cx="${W*0.82}" cy="${H*0.2}" rx="95" ry="42" fill="url(#banvyLake)" opacity=".4"/>`;
  for(let i=0;i<8;i++){
    const y=105+i*58,amp=14+(i%3)*6;
    html+=`<path d="M-40 ${y} Q ${W*0.18} ${y-amp} ${W*0.36} ${y} T ${W*0.72} ${y+amp*0.35} T ${W+40} ${y}" fill="none" stroke="rgba(25,72,58,.08)" stroke-width="2"/>`;
  }
  for(const route of app.usedRoutes){
    const path=route.points.map((p,i)=>{const q=app.project(p);return `${i?'L':'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`}).join(' ');
    html+=`<path class="fallback-route-shadow ${route.style.dashArray?'old-course':'new-course'}" d="${path}"/><path class="fallback-route ${route.style.dashArray?'old-course':'new-course'}" style="stroke:${route.style.color};stroke-dasharray:${route.style.dashArray||'none'}" d="${path}"/>`;
  }
  if(ref?.checkpoints){
    for(const cp of ref.checkpoints){
      const q=app.project(cp.coord); const anchor=(cp.distance_km/ref.official_distance_km)<0.55?'start':'end'; const dx=anchor==='start'?12:-12;
      html+=`<circle class="fallback-cp" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="7"/><text class="fallback-cp-label" x="${(q[0]+dx).toFixed(1)}" y="${(q[1]-10).toFixed(1)}" text-anchor="${anchor}">${esc((cp.short||cp.name).replace('Mora mål','Mora'))}</text>`;
    }
  }
  for(const m of app.models){const q=app.project(routePosition(m.route,0));html+=`<circle id="fallbackRunner${m.result.id}" class="fallback-runner" cx="${q[0]}" cy="${q[1]}" r="12" fill="${m.color}"/>`}
  svg.innerHTML=html;
}

function buildRaceStrip(){
  const track=$('#stripTrack');let html='<div class="strip-base"></div>';const ref=activeReferenceRoute(app.models,app.usedRoutes,app.registry);
  for(const cp of ref.checkpoints.slice(1,-1))html+=`<span class="strip-cp" style="left:${cp.distance_km/ref.official_distance_km*100}%" data-label="${esc(cp.short)}"></span>`;
  for(const m of app.models)html+=`<button class="strip-runner" id="stripRunner${m.result.id}" style="left:0%;background:${m.color}" title="${esc(m.result.name_as_published)} ${m.race.year}">${markerText(m)}</button>`;
  track.innerHTML=html;for(const m of app.models){m.strip=$(`#stripRunner${m.result.id}`);m.strip.onclick=()=>focusRunner(m)}
}
function routePosition(route,distance){const pts=route.points,d=clamp(distance,0,route.official_distance_km);let lo=0,hi=pts.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(pts[mid][2]<d)lo=mid+1;else hi=mid}const i=Math.max(1,lo),a=pts[i-1],b=pts[i],span=b[2]-a[2],f=span>0?(d-a[2])/span:0;return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]}
function routeSlice(route,from,to){const a=clamp(from,0,route.official_distance_km),b=clamp(to,0,route.official_distance_km),out=[routePosition(route,a)];for(const p of route.points)if(p[2]>a&&p[2]<b)out.push([p[0],p[1]]);out.push(routePosition(route,b));return out}
function statusAt(model,time){const a=model.anchors;if(time<=0)return {distance:0,progress:0,pace:null,segment:a[1]?.name||'Start',finished:false,stopped:false};if(time>=model.endTime){const last=a.at(-1),reachedFinish=model.finished||last.distance>=model.route.official_distance_km-.05;return {distance:reachedFinish?model.route.official_distance_km:last.distance,progress:reachedFinish?1:last.distance/model.route.official_distance_km,pace:null,segment:reachedFinish?'Mål':last.name,finished:reachedFinish,stopped:!reachedFinish}}let i=1;while(i<a.length&&a[i].time<time)i++;const p=a[i-1],n=a[i],dt=n.time-p.time,dd=n.distance-p.distance,f=dt>0?(time-p.time)/dt:0,distance=p.distance+dd*f;return {distance,progress:distance/model.route.official_distance_km,pace:dd>0?dt/dd:null,segment:`${p.name.replace('Start Sälen','Start')} → ${n.name.replace('Mora mål','Mora')}`,finished:false,stopped:false,next:n,prev:p}}
function timeAtDistance(model,distance){const a=model.anchors,d=clamp(distance,0,a.at(-1).distance);if(d<=0)return 0;let i=1;while(i<a.length&&a[i].distance<d)i++;if(i>=a.length)return model.endTime;const p=a[i-1],n=a[i],dd=n.distance-p.distance;return p.time+(dd>0?(d-p.distance)/dd:0)*(n.time-p.time)}
function timeAtProgress(model,progress){return timeAtDistance(model,progress*model.route.official_distance_km)}

function update(forceUi=false){
  const states=app.models.map(m=>({model:m,...statusAt(m,app.time)})).sort((a,b)=>b.progress-a.progress||(a.model.endTime-b.model.endTime)),leader=states[0];
  for(const s of states){const pos=routePosition(s.model.route,s.distance);if(app.leafletReady&&s.model.marker){s.model.marker.setLatLng(pos);s.model.tail.setLatLngs(routeSlice(s.model.route,Math.max(0,s.distance-2.4),s.distance));const el=s.model.marker.getElement()?.querySelector('.runner-marker');if(el)el.classList.toggle('finished',s.finished)}const c=$(`#fallbackRunner${s.model.result.id}`);if(c&&app.project){const q=app.project(pos);c.setAttribute('cx',q[0]);c.setAttribute('cy',q[1])}if(s.model.strip)s.model.strip.style.left=`${s.progress*100}%`}
  $('#timeline').value=Math.round(app.time);$('#elapsedLabel').textContent=fmtTime(app.time);$('#raceClock').textContent=fmtTime(app.time);const now=performance.now();if(forceUi||now-app.lastUi>120){renderBoard(states,leader);app.lastUi=now}if(app.leafletReady&&!app.routeOnly&&now-app.lastCamera>900){updateCamera(states,leader);app.lastCamera=now}
}
function renderBoard(states,leader){
  const leadModel=leader.model;$('#runnerBoard').innerHTML=states.map((s,i)=>{const gap=i===0?0:Math.max(0,app.time-timeAtProgress(leadModel,s.progress)),stateText=s.finished?'MÅL':s.stopped?'BRUTIT':`${s.distance.toFixed(1)} km`;return `<button class="runner-card ${app.focused===s.model?'focused':''}" data-runner="${s.model.result.id}"><span class="rank-badge" style="background:${s.model.color}">${i+1}</span><span class="runner-main"><strong>${esc(s.model.result.name_as_published)} <em>${s.model.race.year}</em></strong><small>${s.model.result.bib?'#'+esc(s.model.result.bib)+' · ':''}${esc(s.segment)} <span class="quality-badge">${esc(s.model.quality)}</span></small></span><span class="runner-numbers"><strong>${stateText}</strong><small>${i===0?(s.finished?fmtTime(s.model.endTime):fmtPace(s.pace)):fmtGap(gap)}</small></span></button>`}).join('');document.querySelectorAll('.runner-card').forEach(el=>el.onclick=()=>focusRunner(app.models.find(m=>m.result.id===Number(el.dataset.runner))));$('#leaderName').textContent=`${leader.model.result.name_as_published} (${leader.model.race.year})`;const spread=(states[0].progress-states.at(-1).progress)*100;$('#fieldSpread').textContent=`${spread.toFixed(1)} %-enheter`;$('#currentSection').textContent=leader.segment;$('#stripLeader').textContent=`${leader.model.result.name_as_published} · ${(leader.progress*100).toFixed(1)} %`}
function updateCamera(states,leader){const mode=$('#cameraMode').value;if(mode==='overview')return;if(mode==='leader'){app.map.panTo(routePosition(leader.model.route,leader.distance),{animate:true,duration:.6});return}const active=states.filter(s=>!s.finished&&!s.stopped).map(s=>routePosition(s.model.route,s.distance)),coords=active.length?active:states.map(s=>routePosition(s.model.route,s.distance));if(coords.length===1)app.map.panTo(coords[0],{animate:true,duration:.6});else app.map.fitBounds(L.latLngBounds(coords),{padding:[100,100],maxZoom:13,animate:true,duration:.6})}
function focusRunner(model){app.focused=model;const s=statusAt(model,app.time),pos=routePosition(model.route,s.distance);if(app.leafletReady&&!app.routeOnly)app.map.flyTo(pos,14,{duration:.7});setEvent(`${model.result.name_as_published} ${model.race.year}: ${s.distance.toFixed(1)} km · ${s.finished?'Mål':fmtPace(s.pace)} · ${model.quality}`);update(true)}

function bindControls(){
  $('#playBtn').onclick=togglePlay;$('#restartBtn').onclick=restartRace;$('#backBtn').onclick=()=>seek(app.time-600);$('#forwardBtn').onclick=()=>seek(app.time+600);$('#timeline').oninput=e=>seek(Number(e.target.value),true);$('#speedSelect').onchange=e=>app.speed=Number(e.target.value);
  const musicBtn=$('#musicBtn'),musicVolume=$('#musicVolume');if(musicBtn)musicBtn.onclick=toggleMusic;if(musicVolume)musicVolume.oninput=e=>setMusicVolume(Number(e.target.value));
  $('#checkpointJump').onchange=e=>{const key=e.target.value;if(!key)return;const times=app.models.map(m=>{const cp=m.route.checkpoints.find(c=>c.key===key);return cp?timeAtDistance(m,cp.distance_km):null}).filter(Number.isFinite);seek(median(times)||0);e.target.value=''};
  $('#cameraMode').onchange=()=>{if($('#cameraMode').value==='overview'&&app.leafletReady)app.map.fitBounds(L.latLngBounds(app.allCoords),{padding:[50,50]})};$('#collapseBoard').onclick=()=>{const p=$('#leaderboardPanel');p.classList.toggle('collapsed');$('#collapseBoard').textContent=p.classList.contains('collapsed')?'+':'−'};$('#mapModeBtn').onclick=toggleMapMode;$('#shareBtn').onclick=shareView;$('#fullscreenBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay()}else if(e.key==='ArrowLeft')seek(app.time-600);else if(e.key==='ArrowRight')seek(app.time+600);else if(/^[1-5]$/.test(e.key)&&app.models[Number(e.key)-1])focusRunner(app.models[Number(e.key)-1])})
}
function initAudio(){app.audio=$('#raceSoundtrack');if(!app.audio)return;let volume=.65;try{const saved=Number(localStorage.getItem('ultravasan-music-volume'));if(Number.isFinite(saved))volume=clamp(saved,0,1);app.musicEnabled=localStorage.getItem('ultravasan-music-enabled')!=='false'}catch{}app.audio.volume=volume;const slider=$('#musicVolume');if(slider)slider.value=String(volume);updateMusicButton();app.audio.addEventListener('error',()=>{app.musicEnabled=false;updateMusicButton();setEvent('Musikfilen kunde inte spelas, men kartduellen fungerar ändå.')})}
function updateMusicButton(){const btn=$('#musicBtn');if(!btn)return;btn.classList.toggle('active',app.musicEnabled);btn.innerHTML=app.musicEnabled?'♫ <span>Musik</span>':'♪ <span>Musik av</span>';btn.setAttribute('aria-pressed',String(app.musicEnabled))}
function setMusicVolume(value){if(app.audio)app.audio.volume=clamp(value,0,1);try{localStorage.setItem('ultravasan-music-volume',String(clamp(value,0,1)))}catch{}}
function toggleMusic(){app.musicEnabled=!app.musicEnabled;try{localStorage.setItem('ultravasan-music-enabled',String(app.musicEnabled))}catch{}updateMusicButton();if(!app.audio)return;if(app.musicEnabled&&app.playing){app.audio.play().catch(()=>setEvent('Tryck på start en gång till om webbläsaren blockerade musiken.'))}else app.audio.pause()}
function startMusic(){if(!app.audio||!app.musicEnabled)return;app.audio.play().catch(()=>setEvent('Kartduellen startade. Webbläsaren väntar med musiken tills du trycker på start igen.'))}
function pauseMusic(){if(app.audio)app.audio.pause()}
function restartRace(){seek(0);if(app.audio){app.audio.pause();app.audio.currentTime=0}if(app.playing)startMusic()}
function togglePlay(){app.playing=!app.playing;$('#playBtn').textContent=app.playing?'❚❚':'▶';if(app.playing){startMusic();app.lastFrame=performance.now();requestAnimationFrame(frame)}else pauseMusic()}
function frame(now){if(!app.playing)return;const dt=Math.min(.1,(now-app.lastFrame)/1000);app.lastFrame=now;const next=Math.min(app.maxTime,app.time+dt*app.speed);checkEvents(app.time,next);app.prevTime=app.time;app.time=next;update();if(app.time>=app.maxTime){app.playing=false;$('#playBtn').textContent='▶';setEvent('Alla valda löpare har nått sin sista registrerade position. Musiken fortsätter tills du stänger av den.')}else requestAnimationFrame(frame)}
function seek(value,scrubbing=false){app.time=clamp(value,0,app.maxTime);app.prevTime=app.time;update(true);if(!scrubbing)setEvent(`Uppspelningen flyttades till ${fmtTime(app.time)}.`)}
function checkEvents(from,to){if(to<=from)return;const events=[];for(const m of app.models)for(const a of m.anchors)if(a.time>from&&a.time<=to&&a.kind!=='start')events.push({m,a});events.sort((x,y)=>x.a.time-y.a.time);if(events.length){const e=events.at(-1);setEvent(`${e.m.result.name_as_published} (${e.m.race.year}) passerar ${e.a.name} efter ${fmtTime(e.a.time)}.`);if(e.a.kind==='finish'&&!e.m.lastFinished){e.m.lastFinished=true;finishBurst(e.m.color)}}if(to-app.lastBattle>120){const ss=app.models.map(m=>({m,...statusAt(m,to)})).sort((a,b)=>b.progress-a.progress);if(ss.length>1&&ss[0].progress<.995){const gap=(ss[0].progress-ss[1].progress)*100;if(gap<.15)setEvent(`Tät duell! ${ss[0].m.result.name_as_published} och ${ss[1].m.result.name_as_published} skiljs åt av ${gap.toFixed(2)} procentenheter.`)}app.lastBattle=to}}
function setEvent(text){$('#eventText').textContent=text}
function finishBurst(color){const root=$('#finishBurst'),palette=[color,'#dbe75a','#ff7a3d','#fff','#2f80ed'];for(let i=0;i<45;i++){const s=document.createElement('i');s.className='confetti';s.style.left=`${Math.random()*100}%`;s.style.background=palette[i%palette.length];s.style.setProperty('--drift',`${(Math.random()-.5)*260}px`);s.style.animationDelay=`${Math.random()*.25}s`;root.appendChild(s);setTimeout(()=>s.remove(),2600)}}
function toggleMapMode(){if(!app.leafletReady)return;app.routeOnly=!app.routeOnly;$('#map').style.display=app.routeOnly?'none':'block';$('#fallbackMap').classList.toggle('visible',app.routeOnly);$('#mapModeBtn').innerHTML=app.routeOnly?'⌖ <span>Karta</span>':'◫ <span>Banvy</span>';if(!app.routeOnly)setTimeout(()=>{app.map.invalidateSize();app.map.fitBounds(L.latLngBounds(app.allCoords),{padding:[50,50]})},50)}
async function shareView(){const url=new URL(location.href);url.searchParams.delete('year');url.searchParams.set('runners',app.models.map(m=>m.result.id).join(','));url.searchParams.set('t',Math.round(app.time));try{await navigator.clipboard.writeText(url.href);setEvent('Länken till kartvyn och tidpunkten har kopierats.')}catch{prompt('Kopiera länken:',url.href)}}

let booted=false;
async function startApplication(){if(booted)return;booted=true;try{if(!window.ULTRAVASAN_ROUTES)throw new Error('Banlagret ultravasan-routes.js saknas.');app.registry=window.ULTRAVASAN_ROUTES;const [data]=await Promise.all([ensureRaceData(),ensureLeaflet()]);app.data=hydrateData(data);setLoading('Bygger löparnas positioner…');boot()}catch(e){console.error(e);showFatal(e?.message||String(e))}}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  window.addEventListener('unhandledrejection',e=>{console.error(e.reason);showFatal(e.reason?.message||String(e.reason||'Okänt fel'))});
  startApplication();
}
