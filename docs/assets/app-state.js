'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UltravasanAppState=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const MAIN_DEFAULTS=Object.freeze({
    data:null,
    dataPhase:'none',
    filtered:null,
    page:1,
    pageSize:10,
    sortKey:'overall_place',
    sortDir:1,
    raceId:null,
    raceFamily:'uv90',
  });

  const MAP_DEFAULTS=Object.freeze({
    data:null,
    registry:null,
    models:null,
    time:0,
    maxTime:1,
    speed:'120s',
    playing:false,
    lastFrame:0,
    lastUi:0,
    lastCamera:0,
    lastBattle:0,
    prevTime:0,
    map:null,
    tileLayer:null,
    routeOnly:false,
    leafletReady:false,
    focused:null,
    project:null,
    usedRoutes:null,
    allCoords:null,
    audio:null,
    musicEnabled:true,
    duelElevation:null,
  });

  function materialize(defaults,overrides={}){
    const state={...defaults,...overrides};
    for(const key of ['filtered','models','usedRoutes','allCoords']){
      if(state[key]===null)state[key]=[];
      else if(Array.isArray(state[key]))state[key]=[...state[key]];
    }
    return state;
  }

  function createMain(overrides={}){
    return materialize(MAIN_DEFAULTS,overrides);
  }

  function createMap(overrides={}){
    return materialize(MAP_DEFAULTS,overrides);
  }

  function snapshot(state,keys=null){
    const selected=keys||Object.keys(state||{});
    const out={};
    for(const key of selected){
      const value=state?.[key];
      out[key]=Array.isArray(value)?[...value]:value;
    }
    return Object.freeze(out);
  }

  return Object.freeze({
    MAIN_DEFAULTS,
    MAP_DEFAULTS,
    createMain,
    createMap,
    snapshot,
  });
});
