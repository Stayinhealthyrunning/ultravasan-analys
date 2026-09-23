'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UltravasanCharts=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  function numeric(values){
    return (values||[]).map(Number).filter(Number.isFinite);
  }

  function median(values){
    const sorted=numeric(values).sort((a,b)=>a-b);
    if(!sorted.length)return null;
    const middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }

  function quantile(values,q){
    const sorted=numeric(values).sort((a,b)=>a-b);
    if(!sorted.length)return null;
    const bounded=Math.max(0,Math.min(1,Number(q)));
    const position=(sorted.length-1)*(Number.isFinite(bounded)?bounded:0);
    const low=Math.floor(position),high=Math.ceil(position);
    return sorted[low]+(sorted[high]-sorted[low])*(position-low);
  }

  function fixedFinishTimeBins(times,step=900){
    const values=numeric(times).sort((a,b)=>a-b);
    const size=Number(step);
    if(!values.length)return{start:null,step:size,bins:[]};
    if(!Number.isFinite(size)||size<=0)throw new Error('Binbredden måste vara positiv.');
    const start=Math.floor(values[0]/size)*size;
    const count=Math.floor((values.at(-1)-start)/size)+1;
    const bins=Array.from({length:count},(_,index)=>({
      from:start+index*size,
      to:start+(index+1)*size,
      count:0
    }));
    for(const value of values)bins[Math.floor((value-start)/size)].count++;
    return{start,step:size,bins};
  }

  function finishBinTime(seconds){
    const value=Math.max(0,Math.floor(Number(seconds)||0));
    const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60);
    return `${hours}:${String(minutes).padStart(2,'0')}`;
  }

  function barGeometry(binCount,width=1000,left=44,right=14){
    const cellWidth=(Number(width)-Number(left)-Number(right))/Math.max(1,Number(binCount)||1);
    const barWidth=Math.max(2,Math.min(28,cellWidth*.78));
    return{cellWidth,barWidth,barOffset:(cellWidth-barWidth)/2};
  }

  return Object.freeze({
    median,
    quantile,
    fixedFinishTimeBins,
    finishBinTime,
    barGeometry,
  });
});
