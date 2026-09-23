'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UltravasanPlayback=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const DURATIONS=Object.freeze([30,60,120,180]);
  const DEFAULT_DURATION=120;
  const DEFAULT_MODE=`${DEFAULT_DURATION}s`;

  function durationSeconds(mode){
    const value=Number(String(mode||DEFAULT_MODE).replace(/s$/,''));
    return DURATIONS.includes(value)?value:DEFAULT_DURATION;
  }

  function normalizeMode(mode){
    return `${durationSeconds(mode)}s`;
  }

  function rateFor(total,mode){
    const value=Number(total);
    if(!Number.isFinite(value)||value<=0)return 0;
    return value/durationSeconds(mode);
  }

  function distanceStep(totalDistance,mode,deltaSeconds){
    const delta=Number(deltaSeconds);
    if(!Number.isFinite(delta)||delta<=0)return 0;
    return rateFor(totalDistance,mode)*delta;
  }

  return Object.freeze({
    DURATIONS,
    DEFAULT_DURATION,
    DEFAULT_MODE,
    durationSeconds,
    normalizeMode,
    rateFor,
    distanceStep,
  });
});
