'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const evolution=require(path.join(root,'docs/assets/class-evolution.js'));

const races=[
  {id:1,year:2014,distance_km:90,name:'Ultravasan 90'},
  {id:2,year:2015,distance_km:90,name:'Ultravasan 90'},
  {id:3,year:2017,distance_km:92,name:'Ultravasan 90'}
];
const results=[
  {id:1,race_id:1,age_class:'M35',sex:'M',status:'FINISHED',finish_seconds:9*3600},
  {id:2,race_id:1,age_class:'M35',sex:'M',status:'FINISHED',finish_seconds:10*3600},
  {id:3,race_id:1,age_class:'M35',sex:'M',status:'DNS',finish_seconds:null},
  {id:4,race_id:2,age_class:'M35',sex:'M',status:'FINISHED',finish_seconds:8*3600},
  {id:5,race_id:2,age_class:'M35',sex:'M',status:'FINISHED',finish_seconds:9*3600},
  {id:6,race_id:2,age_class:'M35',sex:'M',status:'DNF',finish_seconds:null},
  {id:7,race_id:2,age_class:'W35',sex:'F',status:'FINISHED',finish_seconds:10*3600},
  {id:8,race_id:1,age_class:'M50',sex:'M',status:'FINISHED',finish_seconds:11*3600},
  {id:9,race_id:3,age_class:'M50',sex:'M',status:'FINISHED',finish_seconds:10*3600}
];
const isStarter=result=>result.status!=='DNS';
const isFinished=result=>result.status==='FINISHED'&&Number(result.finish_seconds)>0;
const model=evolution.aggregateClassHistory({races,results,isStarter,isFinished});

assert.deepStrictEqual(model.years,[2014,2015,2017],'verkliga loppår ska styra x-axeln');
assert.strictEqual(model.participantLabel,'startande');
const m35_2014=model.points.find(point=>point.className==='M35'&&point.year===2014);
const m35_2015=model.points.find(point=>point.className==='M35'&&point.year===2015);
assert.strictEqual(m35_2014.participantCount,2,'DNS får inte räknas som startande');
assert.strictEqual(m35_2014.validResultCount,2);
assert.strictEqual(m35_2014.medianSpeedKmh,9.5,'medianhastighet ska beräknas från fullföljarnas individuella hastigheter');
assert.strictEqual(m35_2015.participantCount,3,'DNF är en faktisk startande');
assert.strictEqual(m35_2015.finisherCount,2);
assert.strictEqual(m35_2015.medianSpeedKmh,10.625);
assert.strictEqual(m35_2015.participantDelta,1);
assert.strictEqual(m35_2015.speedDelta,1.125);
assert.strictEqual(m35_2015.paceDeltaSeconds,-40,'tempoförändringen ska beräknas i sekunder per kilometer');
assert.ok(!model.points.some(point=>point.className==='W35'&&point.year===2014),'saknad klass får inte fyllas med påhittad data');
assert.ok(!model.points.some(point=>point.className==='M50'&&point.year===2015),'klassluckor ska förbli tomma');

const small=evolution.bubbleRadius(25,100),large=evolution.bubbleRadius(100,100);
assert.ok(Math.abs((small*small)/(large*large)-.25)<1e-9,'bubbelarean ska vara proportionell mot deltagarantalet');
assert.ok(large<=34&&small>=6,'bubbelradien ska hållas inom läsbart intervall');
const interpolated=evolution.transitionBubble(m35_2014,m35_2015,.5,{fromYear:2014,toYear:2015,maxParticipantCount:model.maxParticipantCount});
assert.strictEqual(interpolated.year,2014.5);
assert.strictEqual(interpolated.medianSpeedKmh,(9.5+10.625)/2);
assert.strictEqual(interpolated.participantCount,2.5,'position och storlek ska interpoleras samtidigt');
assert.strictEqual(evolution.transitionBubble(m35_2014,null,.5,{fromYear:2014,toYear:2015}).opacity,.5,'försvinnande klass ska tonas ut');
assert.strictEqual(evolution.transitionBubble(null,m35_2015,.5,{fromYear:2014,toYear:2015}).opacity,.5,'tillkommande klass ska tonas in');

const timing=evolution.animationTiming(10);
assert.ok(timing.transitionMs>=1400&&timing.transitionMs<=1800);
assert.ok(timing.pauseMs>=300&&timing.pauseMs<=600);
assert.ok(timing.totalMs>=15000&&timing.totalMs<=25000,'full animation ska normalt ta 15–25 sekunder');
assert.strictEqual(evolution.classColor('M35','M'),evolution.classColor('M35','M'),'klassfärg ska vara deterministisk');
assert.notStrictEqual(evolution.classColor('M35','M'),evolution.classColor('W35','F'),'herr- och damklasser ska ha olika färgskalor');
assert.strictEqual(evolution.speedToPace(12),5,'12 km/h ska motsvara 5:00 min/km');
assert.strictEqual(evolution.formatPaceFromSpeed(9.5),'6:19 min/km');
assert.strictEqual(evolution.formatPaceDelta(0),'0:00 min/km');
const controller=Object.create(evolution.ClassEvolutionController.prototype);controller.model=model;controller.viewWidth=1000;
assert.ok(controller._y(12)<controller._y(8),'snabbare tempo ska ligga högre när min/km-skalan är inverterad');
assert.deepStrictEqual(controller._paceDomain(),controller._paceDomain(),'Y-domänen ska vara stabil och baseras på hela historikmodellen');
const tooltip=evolution.pointTooltip(m35_2015,'Ultravasan 90','startande');
assert.ok(tooltip.includes('5:39 min/km')&&tooltip.includes('8:30:00')&&tooltip.includes('+1 startande')&&tooltip.includes('−0:40 min/km'),'tooltip ska använda svenskt tempo, tid och förändringar');
assert.ok(!tooltip.includes('median 10,63 km/h'),'min/km ska vara tooltipens primära medianmått');

const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'docs/assets/class-evolution.js'),'utf8');
const audience=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
assert.ok(html.indexOf('id="classHistoryChart"')<html.indexOf('id="classEvolutionChart"')&&html.indexOf('id="classEvolutionChart"')<html.indexOf('id="classHeatmap"'),'rapporten ska ligga mellan Klasshistorik och Fartkarta');
for(const id of ['classEvolutionPlay','classEvolutionPause','classEvolutionRestart','classEvolutionSlider','classEvolutionYear'])assert.ok(html.includes(`id="${id}"`),`kontroll saknas: ${id}`);
assert.ok(audience.includes('selectedClasses:advanced.classSelection')&&audience.includes('setSelected(advanced.classSelection)'),'Klasslabbets befintliga val ska styra markering och spår');
assert.ok(source.includes('requestAnimationFrame(tick)')&&source.includes('cancelAnimationFrame(this.frame)'),'animationen ska använda och städa requestAnimationFrame');
assert.ok(source.includes("matchMedia('(prefers-reduced-motion: reduce)')")&&source.includes('Reducerad rörelse'),'reducerad rörelse ska respekteras');
assert.ok(source.includes('historyMax=moving?fromIndex:fromIndex-1'),'framtida spår får inte visas');
assert.ok(source.includes("yTitle.textContent='Medianfart, min/km'")&&source.includes('formatPaceValue(value,false)'),'Y-axeln ska visa min/km');
assert.ok(source.includes("class:'class-evolution-shadow',tabindex:'0',role:'img'")&&source.includes('this._bindTooltipTarget(shadow)'),'historiska skuggpunkter ska vara fokuserbara och återanvända tooltipen');
assert.ok(css.includes('.class-evolution-chart{position:relative;width:100%;height:600px')&&css.includes('@media(max-width:620px)'),'diagrammet ska ha responsiva desktop- och mobilhöjder');
assert.ok(css.includes('.class-evolution-shadow{pointer-events:auto;cursor:help'),'historiska skuggpunkter ska ta emot pekarinteraktion');

console.log('OK: Gapminder-inspirerad klassutveckling, aggregation, animation, spår och tillgänglighet');
