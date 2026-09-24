'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.ClassEvolution=api;
})(typeof window!=='undefined'?window:null,function(){
  const SVG_NS='http://www.w3.org/2000/svg';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const median=values=>{const sorted=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2};
  const easeInOutCubic=t=>{const x=clamp(Number(t)||0,0,1);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
  const formatTime=seconds=>{if(!Number.isFinite(Number(seconds)))return'–';const value=Math.round(Number(seconds)),h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=value%60;return`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};
  const formatDecimal=value=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
  const speedToPace=speed=>Number.isFinite(Number(speed))&&Number(speed)>0?60/Number(speed):null;
  const formatPaceValue=(paceMinutes,unit=true)=>{if(!Number.isFinite(Number(paceMinutes))||Number(paceMinutes)<=0)return'–';const seconds=Math.round(Number(paceMinutes)*60),minutes=Math.floor(seconds/60),rest=seconds%60;return`${minutes}:${String(rest).padStart(2,'0')}${unit?' min/km':''}`};
  const formatPaceFromSpeed=(speed,unit=true)=>formatPaceValue(speedToPace(speed),unit);
  const formatPaceDelta=seconds=>{if(!Number.isFinite(Number(seconds)))return'–';const value=Math.abs(Math.round(Number(seconds))),minutes=Math.floor(value/60),rest=value%60;return`${minutes}:${String(rest).padStart(2,'0')} min/km`};
  const normalizeGender=value=>{const gender=String(value||'').toUpperCase();return gender==='M'||gender==='H'||gender==='MALE'?'male':gender==='F'||gender==='W'||gender==='K'||gender==='D'||gender==='FEMALE'?'female':'unknown'};

  function aggregateClassHistory({races=[],results=[],getClass=result=>result.age_class,getGender=result=>result.sex,isStarter=()=>true,isFinished=result=>Number(result.finish_seconds)>0}={}){
    const sortedRaces=[...races].filter(race=>Number.isFinite(Number(race?.year))).sort((a,b)=>Number(a.year)-Number(b.year)),raceById=new Map(sortedRaces.map(race=>[race.id,race])),groups=new Map();
    for(const result of results||[]){
      const race=raceById.get(result?.race_id),className=String(getClass(result)||'').trim();
      if(!race||!className)continue;
      const key=`${Number(race.year)}|${className}`;
      if(!groups.has(key))groups.set(key,{raceId:race.id,year:Number(race.year),className,genderCounts:{male:0,female:0,unknown:0},participantCount:0,finisherCount:0,speeds:[],times:[]});
      const group=groups.get(key),gender=normalizeGender(getGender(result));group.genderCounts[gender]++;
      if(isStarter(result))group.participantCount++;
      const finishSeconds=Number(result?.finish_seconds),distanceKm=Number(race?.distance_km);
      if(isFinished(result)&&Number.isFinite(finishSeconds)&&finishSeconds>0&&Number.isFinite(distanceKm)&&distanceKm>0){group.finisherCount++;group.times.push(finishSeconds);group.speeds.push(distanceKm*3600/finishSeconds)}
    }
    const points=[];
    for(const group of groups.values()){
      const validResultCount=group.speeds.length;
      if(!group.participantCount&&!validResultCount)continue;
      if(!validResultCount)continue;
      const gender=Object.entries(group.genderCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||'unknown';
      points.push({raceId:group.raceId,year:group.year,className:group.className,gender,participantCount:group.participantCount,finisherCount:group.finisherCount,medianSpeedKmh:median(group.speeds),medianFinishTimeSeconds:median(group.times),validResultCount,previousYear:null,participantDelta:null,speedDelta:null,paceDeltaSeconds:null});
    }
    points.sort((a,b)=>a.year-b.year||a.className.localeCompare(b.className,'sv'));
    const pointsByClass={};
    for(const point of points)(pointsByClass[point.className]||(pointsByClass[point.className]=[])).push(point);
    for(const classPoints of Object.values(pointsByClass))for(let i=1;i<classPoints.length;i++){const previous=classPoints[i-1],current=classPoints[i];current.previousYear=previous.year;current.participantDelta=current.participantCount-previous.participantCount;current.speedDelta=current.medianSpeedKmh-previous.medianSpeedKmh;current.paceDeltaSeconds=Math.round((speedToPace(current.medianSpeedKmh)-speedToPace(previous.medianSpeedKmh))*60)}
    const years=[...new Set(sortedRaces.map(race=>Number(race.year)))],classes=Object.keys(pointsByClass).sort((a,b)=>a.localeCompare(b,'sv')),speeds=points.map(point=>point.medianSpeedKmh).filter(Number.isFinite);
    return{years,races:sortedRaces,points,pointsByClass,classes,maxParticipantCount:Math.max(1,...points.map(point=>point.participantCount)),minSpeed:speeds.length?Math.min(...speeds):null,maxSpeed:speeds.length?Math.max(...speeds):null,participantLabel:'startande'};
  }

  const bubbleRadius=(count,maxCount,{min=6,max=34}={})=>{const total=Number(maxCount),value=Number(count);if(!Number.isFinite(value)||value<=0||!Number.isFinite(total)||total<=0)return 0;return clamp(max*Math.sqrt(value/total),min,max)};
  const animationTiming=yearCount=>{const transitions=Math.max(1,Number(yearCount)-1),pauseMs=400,transitionMs=clamp(21000/transitions-pauseMs,1400,1800);return{transitionMs:Math.round(transitionMs),pauseMs,totalMs:Math.round(transitions*(transitionMs+pauseMs))}};
  const classColor=(className,gender)=>{const normalized=normalizeGender(gender),age=Number(String(className||'').match(/\d{1,3}/)?.[0]||35),ageFactor=clamp(age/80,0,1);if(normalized==='male')return`hsl(${Math.round(207+ageFactor*17)} 72% ${Math.round(61-ageFactor*22)}%)`;if(normalized==='female')return`hsl(${Math.round(329+ageFactor*14)} 70% ${Math.round(64-ageFactor*21)}%)`;return'hsl(155 8% 48%)'};
  function transitionBubble(from,to,progress,{fromYear,toYear,maxParticipantCount=1}={}){
    const t=easeInOutCubic(progress);
    if(from&&to)return{year:Number(from.year)+(Number(to.year)-Number(from.year))*t,medianSpeedKmh:from.medianSpeedKmh+(to.medianSpeedKmh-from.medianSpeedKmh)*t,participantCount:from.participantCount+(to.participantCount-from.participantCount)*t,opacity:1,sourcePoint:t<.5?from:to};
    if(from)return{year:Number(fromYear??from.year)+(Number(toYear??from.year)-Number(fromYear??from.year))*t,medianSpeedKmh:from.medianSpeedKmh,participantCount:from.participantCount,opacity:1-t,sourcePoint:from};
    if(to)return{year:Number(to.year),medianSpeedKmh:to.medianSpeedKmh,participantCount:to.participantCount,opacity:t,sourcePoint:to};
    return null;
  }

  function svgElement(tag,attributes={}){const node=document.createElementNS(SVG_NS,tag);for(const[key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node}
  function pointTooltip(point,raceName,participantLabel){
    if(!point)return'';
    const deltas=[];
    if(Number.isFinite(point.participantDelta))deltas.push(`${point.participantDelta>0?'+':point.participantDelta<0?'−':''}${Math.abs(point.participantDelta)} ${participantLabel}`);
    if(Number.isFinite(point.paceDeltaSeconds))deltas.push(`${point.paceDeltaSeconds>0?'+':point.paceDeltaSeconds<0?'−':''}${formatPaceDelta(point.paceDeltaSeconds)}`);
    return`${raceName} · ${point.year} · ${point.className} · ${point.participantCount} ${participantLabel} · ${point.finisherCount} fullföljande · median ${formatPaceFromSpeed(point.medianSpeedKmh)} · ${formatTime(point.medianFinishTimeSeconds)} · ${point.validResultCount} giltiga resultat${deltas.length?` · sedan ${point.previousYear}: ${deltas.join(' · ')}`:''}`;
  }

  class ClassEvolutionController{
    constructor(container,{playButton,pauseButton,restartButton,slider,yearLabel,statusLabel}={}){
      this.container=container;this.playButton=playButton;this.pauseButton=pauseButton;this.restartButton=restartButton;this.slider=slider;this.yearLabel=yearLabel;this.statusLabel=statusLabel;this.model=null;this.selected=[];this.index=0;this.transition=null;this.playing=false;this.frame=0;this.timer=0;this.bubbles=new Map();this.liveTrails=new Map();this.trailKey='';this.reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.handlers={play:()=>this.play(),pause:()=>this.pause(),restart:()=>this.restart(),slider:event=>this.setIndex(Number(event.target.value))};
      playButton?.addEventListener('click',this.handlers.play);pauseButton?.addEventListener('click',this.handlers.pause);restartButton?.addEventListener('click',this.handlers.restart);slider?.addEventListener('input',this.handlers.slider);
      this._setButtons();
    }
    update({model,selectedClasses=[],raceName='Ultravasan'}){
      this.pause(true);this.model=model;this.selected=[...selectedClasses];this.raceName=raceName;this.index=0;this.transition=null;this.trailKey='';
      if(!model?.years?.length||!model?.points?.length){this._renderEmpty('Historikdata saknas för det valda loppet.');return}
      this.timing=animationTiming(model.years.length);this._build();this._configureSlider();this._renderStatic(0);this._setButtons();
      if(model.years.length===1)this._setStatus(`Endast ${model.years[0]} har giltiga klassresultat.`);else this._setStatus('Tryck på Play för att följa klassernas utveckling genom åren.');
    }
    setSelected(selectedClasses=[]){this.selected=[...selectedClasses];if(!this.model||!this.svg)return;this.trailKey='';this._orderBubbles();if(this.transition)this._renderTransition(this.transition.from,this.transition.to,this.transition.progress);else this._renderStatic(this.index)}
    _renderEmpty(message){this.container.innerHTML=`<div class="empty">${message}</div>`;this.svg=null;this.bubbles.clear();this._configureSlider();this._setStatus(message);this._setButtons()}
    _build(){
      this.container.replaceChildren();this.tooltip=document.createElement('div');this.tooltip.className='interactive-chart-tooltip class-evolution-tooltip';this.tooltip.role='status';this.tooltip.hidden=true;
      const availableWidth=this.container.getBoundingClientRect?.().width||this.container.clientWidth||1000;this.viewWidth=availableWidth<520?390:availableWidth<900?900:1000;
      this.svg=svgElement('svg',{viewBox:`0 0 ${this.viewWidth} 560`,role:'img','aria-labelledby':'classEvolutionSvgTitle classEvolutionSvgDesc'});const title=svgElement('title',{id:'classEvolutionSvgTitle'}),desc=svgElement('desc',{id:'classEvolutionSvgDesc'});title.textContent='Ultravasans klassutveckling genom åren';desc.textContent='Bubblornas höjd visar medianfart i minuter per kilometer och bubbelarean visar antal startande. Snabbare klasser ligger högre.';this.svg.append(title,desc);
      this.axisLayer=svgElement('g',{class:'class-evolution-axes'});this.trailLayer=svgElement('g',{class:'class-evolution-trails'});this.bubbleLayer=svgElement('g',{class:'class-evolution-bubbles'});this.watermark=svgElement('text',{class:'class-evolution-watermark',x:this.viewWidth-this._padding().r,y:105,'text-anchor':'end','aria-hidden':'true'});this.svg.append(this.axisLayer,this.watermark,this.trailLayer,this.bubbleLayer);this.container.append(this.tooltip,this.svg);this._drawAxes();this._createBubbles();
    }
    _drawAxes(){
      const p=this._padding(),{min,max}=this._paceDomain();this.axisLayer.replaceChildren();
      for(let i=0;i<=5;i++){const value=min+(max-min)*i/5,y=this._yPace(value),line=svgElement('line',{x1:p.l,y1:y,x2:this.viewWidth-p.r,y2:y,class:'gridline'}),text=svgElement('text',{x:p.l-12,y:y+4,'text-anchor':'end'});text.textContent=formatPaceValue(value,false);this.axisLayer.append(line,text)}
      for(const year of this.model.years){const x=this._x(year),tick=svgElement('line',{x1:x,y1:560-p.b,x2:x,y2:560-p.b+6,class:'axis'}),text=svgElement('text',{x,y:535,'text-anchor':'middle',class:'class-evolution-year-tick'});text.textContent=String(year);this.axisLayer.append(tick,text)}
      const compact=this.viewWidth<=390,baseline=svgElement('line',{x1:p.l,y1:560-p.b,x2:this.viewWidth-p.r,y2:560-p.b,class:'axis'}),yTitle=svgElement('text',compact?{x:p.l,y:24,'text-anchor':'start',class:'class-evolution-axis-title'}:{x:20,y:270,'text-anchor':'middle',transform:'rotate(-90 20 270)',class:'class-evolution-axis-title'}),xTitle=svgElement('text',{x:(p.l+this.viewWidth-p.r)/2,y:555,'text-anchor':'middle',class:'class-evolution-axis-title'});yTitle.textContent='Medianfart, min/km';xTitle.textContent='Tävlingsår';this.axisLayer.append(baseline,yTitle,xTitle);
    }
    _createBubbles(){
      this.bubbles.clear();
      for(const className of this.model.classes){const group=svgElement('g',{class:'class-evolution-bubble'}),circle=svgElement('circle',{tabindex:'0',role:'img'}),label=svgElement('text',{'text-anchor':'middle',class:'class-evolution-bubble-label'});label.textContent=className;group.append(circle,label);this.bubbleLayer.append(group);this._bindTooltipTarget(circle);this.bubbles.set(className,{group,circle,label})}
      this._orderBubbles();
    }
    _orderBubbles(){if(!this.bubbleLayer)return;const selected=new Set(this.selected);for(const[className,node]of this.bubbles)if(!selected.has(className))this.bubbleLayer.append(node.group);for(const className of this.selected){const node=this.bubbles.get(className);if(node)this.bubbleLayer.append(node.group)}}
    _configureSlider(){if(!this.slider)return;const years=this.model?.years||[];this.slider.min='0';this.slider.max=String(Math.max(0,years.length-1));this.slider.step='1';this.slider.value=String(Math.min(this.index,Math.max(0,years.length-1)));this.slider.disabled=years.length<2;this.slider.setAttribute('aria-valuetext',years[this.index]?String(years[this.index]):'Ingen historik')}
    _padding(){return this.viewWidth<=390?{l:56,r:18,t:42,b:70}:{l:82,r:42,t:42,b:70}}
    _paceDomain(){const slow=speedToPace(this.model?.minSpeed),fast=speedToPace(this.model?.maxSpeed);if(!Number.isFinite(fast)||!Number.isFinite(slow))return{min:0,max:1};const margin=Math.max(.08,(slow-fast)*.09);return{min:Math.max(0,fast-margin),max:slow+margin}}
    _x(year){const p=this._padding(),years=this.model.years,min=years[0],max=years.at(-1),width=this.viewWidth||1000;return min===max?(p.l+width-p.r)/2:p.l+(Number(year)-min)*(width-p.l-p.r)/(max-min)}
    _yPace(pace){const p=this._padding(),domain=this._paceDomain();return p.t+(Number(pace)-domain.min)*(560-p.t-p.b)/(domain.max-domain.min||1)}
    _y(speed){return this._yPace(speedToPace(speed))}
    _point(className,index){const year=this.model.years[index];return(this.model.pointsByClass[className]||[]).find(point=>point.year===year)||null}
    _renderStatic(index){this.index=clamp(index,0,this.model.years.length-1);this.transition=null;this._renderTransition(this.index,this.index,0)}
    _renderTransition(fromIndex,toIndex,progress){
      const fromYear=this.model.years[fromIndex],toYear=this.model.years[toIndex],selected=new Set(this.selected),states=new Map();
      for(const className of this.model.classes){const state=transitionBubble(this._point(className,fromIndex),this._point(className,toIndex),progress,{fromYear,toYear,maxParticipantCount:this.model.maxParticipantCount});states.set(className,state);const node=this.bubbles.get(className),isSelected=selected.has(className);if(!node)continue;node.group.classList.toggle('selected',isSelected);if(!state||state.opacity<=.01){node.group.setAttribute('hidden','');continue}node.group.removeAttribute('hidden');const x=this._x(state.year),y=this._y(state.medianSpeedKmh),radius=bubbleRadius(state.participantCount,this.model.maxParticipantCount),color=classColor(className,state.sourcePoint?.gender);node.circle.setAttribute('cx',x);node.circle.setAttribute('cy',y);node.circle.setAttribute('r',radius);node.circle.setAttribute('fill',color);node.circle.setAttribute('opacity',state.opacity*(isSelected?.96:.38));node.circle.setAttribute('stroke',isSelected?'#fffdf7':'rgba(16,36,29,.35)');node.circle.setAttribute('stroke-width',isSelected?'4':'1.2');this._setTooltipData(node.circle,state.sourcePoint,x,y);if(isSelected)node.label.removeAttribute('hidden');else node.label.setAttribute('hidden','');node.label.setAttribute('x',x);node.label.setAttribute('y',y-radius-8-(this.selected.indexOf(className)%2)*11);node.label.setAttribute('fill',color);node.label.setAttribute('opacity',state.opacity)}
      this._renderTrails(fromIndex,toIndex,progress,states);this._orderBubbles();const displayIndex=fromIndex===toIndex?fromIndex:(progress<.5?fromIndex:toIndex),yearText=fromIndex===toIndex?String(fromYear):`${fromYear} → ${toYear}`;this.watermark.textContent=yearText;if(this.yearLabel)this.yearLabel.textContent=yearText;if(this.slider){this.slider.value=String(displayIndex);this.slider.setAttribute('aria-valuetext',String(this.model.years[displayIndex]))}this._updateSummary(displayIndex)
    }
    _renderTrails(fromIndex,toIndex,progress,states){
      const moving=fromIndex!==toIndex&&progress>0,historyMax=moving?fromIndex:fromIndex-1,key=`${this.selected.join('|')}|${historyMax}`;
      if(key!==this.trailKey){this.trailKey=key;this.trailLayer.replaceChildren();this.liveTrails.clear();for(const className of this.selected){const points=this.model.pointsByClass[className]||[],color=classColor(className,points[0]?.gender),historical=points.filter(point=>this.model.years.indexOf(point.year)<=historyMax);let pathData='',previousIndex=-2;historical.forEach((point,i)=>{const yearIndex=this.model.years.indexOf(point.year),x=this._x(point.year),y=this._y(point.medianSpeedKmh);pathData+=yearIndex===previousIndex+1?` L${x} ${y}`:` M${x} ${y}`;previousIndex=yearIndex;const shadow=svgElement('circle',{cx:x,cy:y,r:bubbleRadius(point.participantCount,this.model.maxParticipantCount),fill:color,opacity:Math.max(.08,.3-(historical.length-1-i)*.035),class:'class-evolution-shadow',tabindex:'0',role:'img'});this._setTooltipData(shadow,point,x,y);this._bindTooltipTarget(shadow);this.trailLayer.append(shadow)});if(pathData){const path=svgElement('path',{d:pathData,fill:'none',stroke:color,'stroke-width':'2.4',opacity:'.35',class:'class-evolution-trail'});this.trailLayer.prepend(path)}const live=svgElement('path',{fill:'none',stroke:color,'stroke-width':'3',opacity:'.45',class:'class-evolution-live-trail'});this.trailLayer.append(live);this.liveTrails.set(className,live)}}
      for(const className of this.selected){const live=this.liveTrails.get(className),from=this._point(className,fromIndex),to=this._point(className,toIndex),state=states.get(className);if(!live||!moving||!from||!to||!state){live?.setAttribute('d','');continue}live.setAttribute('d',`M${this._x(from.year)} ${this._y(from.medianSpeedKmh)} L${this._x(state.year)} ${this._y(state.medianSpeedKmh)}`)}
    }
    _showTooltip(circle){if(!this.tooltip||!circle.dataset.tip)return;this.tooltip.textContent=circle.dataset.tip;this.tooltip.hidden=false;this.tooltip.style.left=`${circle.dataset.x}%`;this.tooltip.style.top=`${circle.dataset.y}%`}
    _bindTooltipTarget(target){const show=()=>this._showTooltip(target),hide=()=>{this.tooltip.hidden=true};target.addEventListener('mouseenter',show);target.addEventListener('mouseleave',hide);target.addEventListener('focus',show);target.addEventListener('blur',hide);target.addEventListener('click',show)}
    _setTooltipData(target,point,x,y){const tip=pointTooltip(point,this.raceName,this.model.participantLabel);target.dataset.tip=tip;target.dataset.x=String(clamp(x/(this.viewWidth||1000)*100,12,88));target.dataset.y=String(clamp(y/5.6,14,88));target.setAttribute('aria-label',tip)}
    _updateSummary(index){const year=this.model.years[index],points=this.model.points.filter(point=>point.year===year),selected=points.filter(point=>this.selected.includes(point.className));if(!points.length)this._setStatus(`Inga giltiga klassresultat finns för ${year}.`);else if(this.selected.length&&!selected.length)this._setStatus(`${year}: valda klasser saknar giltiga resultat. ${points.length} andra klasser visas.`);else this._setStatus(`${year}: ${points.length} klasser · ${points.reduce((sum,point)=>sum+point.participantCount,0).toLocaleString('sv-SE')} startande${selected.length?` · ${selected.length} valda klasser markerade`:''}.`)}
    _setStatus(text){if(this.statusLabel)this.statusLabel.textContent=text}
    _setButtons(){const years=this.model?.years?.length||0;if(this.playButton){this.playButton.disabled=this.playing||years<2;this.playButton.setAttribute('aria-pressed',String(this.playing))}if(this.pauseButton)this.pauseButton.disabled=!this.playing;if(this.restartButton)this.restartButton.disabled=!years}
    play(){
      if(!this.model||this.model.years.length<2||this.playing)return;
      if(this.reducedMotion){const next=this.index>=this.model.years.length-1?0:this.index+1;this.setIndex(next);this._setStatus(`Reducerad rörelse: visar ${this.model.years[next]}. Använd Play eller årsslidern för att stega vidare.`);return}
      if(this.index>=this.model.years.length-1&&!this.transition)this._renderStatic(0);this.playing=true;this._setButtons();this._startOrResume();
    }
    _startOrResume(){if(!this.playing)return;if(!this.transition){if(this.index>=this.model.years.length-1){this.playing=false;this._setButtons();return}this.transition={from:this.index,to:this.index+1,progress:0}}const transition=this.transition,startProgress=transition.progress,startTime=performance.now(),duration=this.timing.transitionMs*(1-startProgress);const tick=now=>{if(!this.playing)return;const raw=duration?clamp(startProgress+(now-startTime)/this.timing.transitionMs,0,1):1;transition.progress=raw;this._renderTransition(transition.from,transition.to,raw);if(raw<1){this.frame=requestAnimationFrame(tick);return}this.index=transition.to;this.transition=null;this._renderStatic(this.index);if(this.index>=this.model.years.length-1){this.playing=false;this._setButtons();this._setStatus(`Genomspelningen är klar vid ${this.model.years[this.index]}.`)}else this.timer=setTimeout(()=>this._startOrResume(),this.timing.pauseMs)};this.frame=requestAnimationFrame(tick)}
    pause(preserve=false){this.playing=false;if(this.frame)cancelAnimationFrame(this.frame);if(this.timer)clearTimeout(this.timer);this.frame=0;this.timer=0;if(!preserve)this._setStatus(`Pausad vid ${this.yearLabel?.textContent||this.model?.years?.[this.index]||'valt år'}.`);this._setButtons()}
    restart(){this.pause(true);if(this.model?.years?.length){this._renderStatic(0);this._setStatus(`Återställd till ${this.model.years[0]}. Tryck på Play för att börja.`)}this._setButtons()}
    setIndex(index){this.pause(true);if(!this.model?.years?.length)return;this._renderStatic(clamp(Math.round(index),0,this.model.years.length-1));this._setStatus(`Visar ${this.model.years[this.index]}.`);this._setButtons()}
    destroy(){this.pause(true);this.playButton?.removeEventListener('click',this.handlers.play);this.pauseButton?.removeEventListener('click',this.handlers.pause);this.restartButton?.removeEventListener('click',this.handlers.restart);this.slider?.removeEventListener('input',this.handlers.slider);this.container?.replaceChildren();this.model=null;this.bubbles.clear()}
  }

  const createController=(container,options)=>new ClassEvolutionController(container,options);
  return{aggregateClassHistory,bubbleRadius,animationTiming,classColor,easeInOutCubic,transitionBubble,speedToPace,formatPaceValue,formatPaceFromSpeed,formatPaceDelta,pointTooltip,ClassEvolutionController,createController};
});
