'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const evolution=require(path.join(root,'docs/assets/class-evolution.js'));

const races=[
  {id:1,year:2014,distance_km:90,name:'Ultravasan 90',course_version:'old',comparison_key:'old-course'},
  {id:2,year:2015,distance_km:90,name:'Ultravasan 90',course_version:'old',comparison_key:'old-course'},
  {id:3,year:2017,distance_km:92,name:'Ultravasan 90',course_version:'post-2023-v1',comparison_key:'new-course'},
  {id:4,year:2018,distance_km:92,name:'Ultravasan 90',course_version:'post-2023-v2',comparison_key:'new-course'}
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
  {id:9,race_id:3,age_class:'M50',sex:'M',status:'FINISHED',finish_seconds:10*3600},
  {id:10,race_id:4,age_class:'M35',sex:'M',status:'FINISHED',finish_seconds:8.5*3600},
  {id:11,race_id:4,age_class:'M50',sex:'M',status:'FINISHED',finish_seconds:9.5*3600},
  {id:12,race_id:3,age_class:'M35',sex:'M',status:'FINISHED',finish_seconds:9*3600}
];
const isStarter=result=>result.status!=='DNS';
const isFinished=result=>result.status==='FINISHED'&&Number(result.finish_seconds)>0;
const model=evolution.aggregateClassHistory({races,results,isStarter,isFinished,comparisonKeyForRace:race=>race.comparison_key,courseVersionForRace:race=>race.course_version});

assert.deepStrictEqual(model.years,[2014,2015,2017,2018],'verkliga loppår ska styra x-axeln');
assert.deepStrictEqual(model.calendarGaps,[{fromYear:2015,toYear:2017,years:[2016],label:'2016–2016: inga importerade lopp'}]);
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
const m50_2014=model.points.find(point=>point.className==='M50'&&point.year===2014);
const m50_2017=model.points.find(point=>point.className==='M50'&&point.year===2017);
assert.strictEqual(m50_2017.comparisonBreak,true,'overgång utan verifierad whole-course-grupp ska bryta farttrenden');
assert.strictEqual(m50_2017.paceDeltaSeconds,null,'fartdelta får inte räknas över banjämförbarhetsgräns');
assert.strictEqual(m50_2017.participantDelta,0,'deltagarutveckling får fortfarande beskrivas över banbytet');
assert.deepStrictEqual(model.comparisonBreaks.map(x=>[x.fromYear,x.toYear,x.label]),[[2015,2017,'Ny jämförbarhetsserie']],'modellen ska exponera en explicit jämförbarhetsgräns utan generisk BANVERSION-etikett');
const m35_2018=model.points.find(point=>point.className==='M35'&&point.year===2018);
assert.strictEqual(m35_2018.comparisonBreak,false,'samma explicit whole-course-grupp ska hålla serien över ändrad CourseVersion');
assert.ok(!evolution.pointTooltip(m35_2018,'Ultravasan 90','startande').includes('banversion'));

const sameVersionRaces=[
  {id:11,year:2023,distance_km:92,course_version:'same-v1',comparison_key:null},
  {id:12,year:2024,distance_km:92,course_version:'same-v1',comparison_key:'uv90-2024-2025'},
  {id:13,year:2025,distance_km:92,course_version:'same-v1',comparison_key:'uv90-2024-2025'},
];
const sameVersionResults=[
  {id:21,race_id:11,age_class:'M40',sex:'M',status:'FINISHED',finish_seconds:36000},
  {id:22,race_id:12,age_class:'M40',sex:'M',status:'FINISHED',finish_seconds:35000},
  {id:23,race_id:13,age_class:'M40',sex:'M',status:'FINISHED',finish_seconds:34000},
];
const sameVersionModel=evolution.aggregateClassHistory({races:sameVersionRaces,results:sameVersionResults,isStarter,isFinished,comparisonKeyForRace:race=>race.comparison_key,courseVersionForRace:race=>race.course_version});
assert.deepStrictEqual(sameVersionModel.comparisonBreaks.map(x=>[x.fromYear,x.toYear,x.label]),[[2023,2024,'Helbanans jämförbarhet ej verifierad']],'whole-course-gräns ska markeras även när CourseVersion är oförändrad');
assert.strictEqual(sameVersionModel.points.find(point=>point.year===2024).comparisonBreak,true);
assert.strictEqual(sameVersionModel.points.find(point=>point.year===2025).comparisonBreak,false);

const small=evolution.bubbleRadius(25,100),large=evolution.bubbleRadius(100,100);
assert.ok(Math.abs((small*small)/(large*large)-.25)<1e-9,'bubbelarean ska vara proportionell mot deltagarantalet');
assert.ok(large<=34&&small>=6,'bubbelradien ska hållas inom läsbart intervall');
const interpolated=evolution.transitionBubble(m35_2014,m35_2015,.5,{fromYear:2014,toYear:2015,maxParticipantCount:model.maxParticipantCount});
assert.strictEqual(interpolated.year,2014.5);
assert.strictEqual(interpolated.medianSpeedKmh,(9.5+10.625)/2);
assert.strictEqual(interpolated.participantCount,2.5,'position och storlek ska interpoleras samtidigt');
const broken=evolution.transitionBubble(m50_2014,m50_2017,.25,{fromYear:2014,toYear:2017,maxParticipantCount:model.maxParticipantCount});
assert.strictEqual(broken.comparisonBreak,false,'jämförbarhetsgränser får inte stoppa den visuella interpoleringen');
assert.ok(broken.year>2014&&broken.year<2017,'bubblans x-position ska interpoleras även över gruppgränser');
assert.ok(broken.medianSpeedKmh>m50_2014.medianSpeedKmh&&broken.medianSpeedKmh<model.points.find(point=>point.className==='M50'&&point.year===2017).medianSpeedKmh,'bubblans y-position ska interpoleras även över gruppgränser');
assert.strictEqual(evolution.transitionBubble(m35_2014,null,.5,{fromYear:2014,toYear:2015}).opacity,.5,'försvinnande klass ska tonas ut');
assert.strictEqual(evolution.transitionBubble(null,m35_2015,.5,{fromYear:2014,toYear:2015}).opacity,.5,'tillkommande klass ska tonas in');

const allBubbleModel={years:[2014,2015],classes:['M35','M50','W35','M60'],maxParticipantCount:100,pointsByClass:{
  M35:[{year:2014,comparisonKey:'a',medianSpeedKmh:8,participantCount:10},{year:2015,comparisonKey:'b',medianSpeedKmh:10,participantCount:40}],
  M50:[{year:2014,comparisonKey:'a',medianSpeedKmh:7,participantCount:20}],
  W35:[{year:2015,comparisonKey:'b',medianSpeedKmh:9,participantCount:30}],
  M60:[{year:2014,comparisonKey:'old',medianSpeedKmh:6,participantCount:15},{year:2015,comparisonKey:'new',medianSpeedKmh:8,participantCount:35}]
}};
const allStates=evolution.transitionStates(allBubbleModel,0,1,.5);
assert.deepStrictEqual([...allStates.keys()],allBubbleModel.classes,'mellanlägen ska beräknas för hela den synliga klassmängden');
for(const className of ['M35','M60']){
  const state=allStates.get(className);
  assert.strictEqual(state.year,2014.5,`${className}: x-position ska interpoleras trots olika jämförbarhetsnyckel`);
  assert.strictEqual(state.medianSpeedKmh,allBubbleModel.pointsByClass[className][0].medianSpeedKmh+1,`${className}: y-position ska interpoleras trots olika jämförbarhetsnyckel`);
  assert.strictEqual(state.participantCount,25,`${className}: bubbelyta ska interpoleras för varje gemensam klass`);
  assert.strictEqual(state.opacity,1,`${className}: gemensam klass ska inte tona ut/in i stället för att röra sig`);
}
assert.strictEqual(allStates.get('M50').opacity,.5,'klass som bara finns i år A ska tona ut');
assert.strictEqual(allStates.get('W35').opacity,.5,'klass som bara finns i år B ska tona in');
const sliderController=Object.create(evolution.ClassEvolutionController.prototype);
sliderController.model=allBubbleModel;sliderController.pause=()=>{};sliderController._renderStatic=index=>{sliderController.staticIndex=index};sliderController._renderTransition=(from,to,progress)=>{sliderController.lastSliderTransition={from,to,progress}};sliderController._setStatus=()=>{};sliderController._setButtons=()=>{};
sliderController.setSliderPosition(.5);
assert.deepStrictEqual(sliderController.lastSliderTransition,{from:0,to:1,progress:.5},'manuell slider ska använda samma interpolerade keyframes som autoplay');

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
const breakTooltip=evolution.pointTooltip(m50_2017,'Ultravasan 90','startande');
assert.ok(breakTooltip.includes('ny jämförbarhetsserie')&&!breakTooltip.includes('min/km · sedan 2014: −'),'tooltip ska förklara gruppgränsen i stället för att visa påhittat fartdelta');

const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'docs/assets/class-evolution.js'),'utf8');
const audience=fs.readFileSync(path.join(root,'docs/assets/audience-analytics.js'),'utf8');
const css=fs.readFileSync(path.join(root,'docs/assets/styles.css'),'utf8');
assert.ok(html.indexOf('id="classHistoryChart"')<html.indexOf('id="classEvolutionChart"')&&html.indexOf('id="classEvolutionChart"')<html.indexOf('id="classHeatmap"'),'rapporten ska ligga mellan Klasshistorik och Fartkarta');
for(const id of ['classEvolutionPlay','classEvolutionPause','classEvolutionRestart','classEvolutionSlider','classEvolutionYear'])assert.ok(html.includes(`id="${id}"`),`kontroll saknas: ${id}`);
assert.ok(audience.includes('selectedClasses:advanced.classSelection')&&audience.includes('setSelected(advanced.classSelection)'),'Klasslabbets befintliga val ska styra markering och spår');
assert.ok(source.includes('requestAnimationFrame(tick)')&&source.includes('cancelAnimationFrame(this.frame)'),'animationen ska använda och städa requestAnimationFrame');
assert.ok(source.includes("matchMedia('(prefers-reduced-motion: reduce)')")&&source.includes('Reducerad rörelse'),'reducerad rörelse ska respekteras');
assert.ok(source.includes('historyMax=fromIndex'),'historiska spår ska omfatta hela den visade årskedjan, inklusive aktuellt loppår');
assert.ok(source.includes('classTrailSegments(historical,this.model.years)')&&source.includes('Number(to.year)-Number(from.year)!==1'),'beskrivande spår ska bindas per kalenderår och brytas vid verklig kalenderlucka');
const trailYears=[2014,2015,2016,2017,2018,2019,2022,2023,2024,2025,2026],trailPoints=trailYears.map(year=>({year,medianSpeedKmh:10,participantCount:1}));
const trailSegments=evolution.classTrailSegments(trailPoints,trailYears);
assert.deepStrictEqual(trailSegments.map(segment=>segment.map(point=>point.year)),[[2014,2015,2016,2017,2018,2019],[2022,2023,2024,2025,2026]],'valda klassers historiska spår ska vara sammanhängande inom varje årsserie och endast brytas över 2020–2021');
assert.ok(!source.includes("class:'class-evolution-course-break'")&&!source.includes("class:'class-evolution-course-break-label'"),'tekniska jämförbarhetsgränser ska inte ritas som vertikala linjer eller överlappande etiketter i diagrammet');
assert.ok(source.includes('calendarGaps')&&source.includes('class-evolution-calendar-gap-label'),'luckor utan tävling ska märkas separat');
assert.ok(audience.includes('comparisonKeyForRace:historyComparisonKey')&&audience.includes('descriptiveHistoryRuns(valid,years)'),'Klassutveckling ska behålla jämförbarhetsregler för fartinterpolation medan Klasshistorik ritar en beskrivande årsserie');
assert.ok(source.includes("yTitle.textContent='Medianfart, min/km'")&&source.includes('formatPaceValue(value,false)'),'Y-axeln ska visa min/km');
assert.ok(source.includes("class:'class-evolution-shadow',tabindex:'0',role:'img'")&&source.includes('this._bindTooltipTarget(shadow)'),'historiska skuggpunkter ska vara fokuserbara och återanvända tooltipen');
assert.ok(css.includes('.class-evolution-chart{position:relative;width:100%;height:600px')&&css.includes('@media(max-width:620px)'),'diagrammet ska ha responsiva desktop- och mobilhöjder');
assert.ok(css.includes('.class-evolution-shadow{pointer-events:auto;cursor:help'),'historiska skuggpunkter ska ta emot pekarinteraktion');

console.log('OK: Gapminder-inspirerad klassutveckling, aggregation, animation, spår och tillgänglighet');
