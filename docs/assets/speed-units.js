'use strict';
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SpeedUnits=api;
})(typeof window!=='undefined'?window:globalThis,root=>{
  const STORAGE_KEY='ultravasan-speed-unit';
  const DEFAULT_UNIT='pace';
  const valid=unit=>unit==='pace'||unit==='speed';
  const storage=()=>{try{return root?.localStorage||null}catch{return null}};
  function get(){try{const saved=storage()?.getItem(STORAGE_KEY);return valid(saved)?saved:DEFAULT_UNIT}catch{return DEFAULT_UNIT}}
  function set(unit){
    const next=valid(unit)?unit:DEFAULT_UNIT;
    try{storage()?.setItem(STORAGE_KEY,next)}catch{}
    if(root?.dispatchEvent&&typeof root.CustomEvent==='function')root.dispatchEvent(new root.CustomEvent('ultravasan:speed-unit-change',{detail:{unit:next}}));
    return next;
  }
  const paceFromSpeed=speed=>Number.isFinite(Number(speed))&&Number(speed)>0?3600/Number(speed):null;
  const speedFromPace=pace=>Number.isFinite(Number(pace))&&Number(pace)>0?3600/Number(pace):null;
  function formatPaceSeconds(value,{suffix=true}={}){
    if(!Number.isFinite(Number(value))||Number(value)<=0)return '–';
    const rounded=Math.round(Number(value)),minutes=Math.floor(rounded/60),seconds=rounded%60;
    return `${minutes}:${String(seconds).padStart(2,'0')}${suffix?' /km':''}`;
  }
  function formatSpeedKmh(value,{suffix=true}={}){
    if(!Number.isFinite(Number(value))||Number(value)<=0)return '–';
    const number=Number(value).toFixed(1).replace('.',',');
    return `${number}${suffix?' km/h':''}`;
  }
  function formatPace(value,unit=get(),options={}){return unit==='speed'?formatSpeedKmh(speedFromPace(value),options):formatPaceSeconds(value,options)}
  function formatSpeed(value,unit=get(),options={}){return unit==='speed'?formatSpeedKmh(value,options):formatPaceSeconds(paceFromSpeed(value),options)}
  const unitLabel=unit=>(unit||get())==='speed'?'km/h':'min/km';
  return {STORAGE_KEY,DEFAULT_UNIT,get,set,paceFromSpeed,speedFromPace,formatPaceSeconds,formatSpeedKmh,formatPace,formatSpeed,unitLabel};
});
