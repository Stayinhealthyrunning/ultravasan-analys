'use strict';
const assert=require('assert');
const charts=require('../docs/assets/charts.js');

assert.strictEqual(charts.median([]),null);
assert.strictEqual(charts.median([3,1,2]),2);
assert.strictEqual(charts.median([1,2,3,4]),2.5);
assert.strictEqual(charts.median(['1','3',null,'x',2]),2);

assert.strictEqual(charts.quantile([],0.5),null);
assert.strictEqual(charts.quantile([1,2,3,4],0),1);
assert.strictEqual(charts.quantile([1,2,3,4],1),4);
assert.strictEqual(charts.quantile([1,2,3,4],0.5),2.5);

const grouped=charts.fixedFinishTimeBins([3599,3600,4499,4500],900);
assert.strictEqual(grouped.start,2700);
assert.deepStrictEqual(grouped.bins.map(bin=>bin.count),[1,2,1]);
assert.strictEqual(charts.finishBinTime(3661),'1:01');

const geometry=charts.barGeometry(10,1000,44,14);
assert.ok(geometry.cellWidth>0);
assert.ok(geometry.barWidth>=2&&geometry.barWidth<=28);
assert.ok(geometry.barOffset>=0);

assert.throws(()=>charts.fixedFinishTimeBins([1],0),/positiv/);
console.log('OK: U4 Charts centraliserar deterministisk statistik och histogramgeometri');
