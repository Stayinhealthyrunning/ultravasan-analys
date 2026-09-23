'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UltravasanMapEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const clamp=(value,min,max)=>Math.max(Number(min),Math.min(Number(max),Number(value)||0));

  function validLatLng(value){
    return Array.isArray(value)&&value.length>=2&&finite(value[0])&&finite(value[1]);
  }

  function pointAtDistance(points,distance){
    if(!Array.isArray(points)||!points.length)return null;
    const max=Number(points.at(-1)?.[2]||0);
    const d=clamp(distance,0,max);
    let lo=0,hi=points.length-1;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(Number(points[mid][2])<d)lo=mid+1;
      else hi=mid;
    }
    const b=points[lo],a=points[Math.max(0,lo-1)];
    const span=Number(b[2])-Number(a[2]);
    const t=span>0?(d-Number(a[2]))/span:0;
    return [
      Number(a[0])+(Number(b[0])-Number(a[0]))*t,
      Number(a[1])+(Number(b[1])-Number(a[1]))*t,
      d,
    ];
  }

  function routePosition(route,distance){
    const point=pointAtDistance(route?.points,distance);
    return point?[point[0],point[1]]:null;
  }

  function routeSlice(route,from,to){
    if(!Array.isArray(route?.points)||!route.points.length)return[];
    const max=Number(route.official_distance_km??route.points.at(-1)?.[2]??0);
    const a=clamp(from,0,max),b=clamp(to,0,max);
    const start=Math.min(a,b),end=Math.max(a,b);
    const out=[];
    const first=routePosition(route,start);
    if(first)out.push(first);
    for(const point of route.points){
      const distance=Number(point?.[2]);
      if(distance>start&&distance<end)out.push([Number(point[0]),Number(point[1])]);
    }
    const last=routePosition(route,end);
    if(last)out.push(last);
    return a<=b?out:out.reverse();
  }

  function terrainAtDistance(profile,distance){
    if(!Array.isArray(profile)||!profile.length)return null;
    const max=Number(profile.at(-1)?.[0]||0);
    const d=clamp(distance,0,max);
    let lo=0,hi=profile.length-1;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(Number(profile[mid][0])<d)lo=mid+1;
      else hi=mid;
    }
    const b=profile[lo],a=profile[Math.max(0,lo-1)];
    const span=Number(b[0])-Number(a[0]);
    const t=span>0?(d-Number(a[0]))/span:0;
    const interpolate=index=>{
      const av=finite(a[index])?Number(a[index]):null;
      const bv=finite(b[index])?Number(b[index]):null;
      if(av!==null&&bv!==null)return av+(bv-av)*t;
      return av??bv;
    };
    return {
      distance:d,
      elevation:interpolate(1),
      grade:interpolate(2),
      cumulativeAscent:interpolate(3),
      cumulativeDescent:interpolate(4),
    };
  }

  function elevationAtDistance(profile,distance){
    return terrainAtDistance(profile,distance)?.elevation??null;
  }

  return Object.freeze({
    clamp,
    validLatLng,
    pointAtDistance,
    routePosition,
    routeSlice,
    terrainAtDistance,
    elevationAtDistance,
  });
});
