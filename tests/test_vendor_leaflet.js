'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const vendor=path.join(root,'docs/vendor/leaflet-1.9.4');
const js=fs.readFileSync(path.join(vendor,'leaflet.js'));
const css=fs.readFileSync(path.join(vendor,'leaflet.css'));
const sri=buffer=>'sha256-'+crypto.createHash('sha256').update(buffer).digest('base64');

assert.strictEqual(sri(js),'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=','vendrad Leaflet JS måste matcha officiell 1.9.4 SRI');
assert.strictEqual(sri(css),'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=','vendrad Leaflet CSS måste matcha officiell 1.9.4 SRI');

for(const file of ['layers.png','layers-2x.png','marker-icon.png','marker-icon-2x.png','marker-shadow.png']){
  const full=path.join(vendor,'images',file);
  assert.ok(fs.existsSync(full),`Leaflet image saknas: ${file}`);
  assert.ok(fs.statSync(full).size>100,`Leaflet image är orimligt liten: ${file}`);
}

const license=fs.readFileSync(path.join(vendor,'LICENSE'),'utf8');
const info=fs.readFileSync(path.join(vendor,'VENDOR_INFO.txt'),'utf8');
assert.ok(license.includes('BSD 2-Clause License'),'Leaflet BSD-2-Clause-licens ska följa med vendringen');
assert.ok(info.includes('Leaflet 1.9.4')&&info.includes('npm leaflet@1.9.4'),'vendor-metadata ska låsa källa och version');

const mapSource=fs.readFileSync(path.join(root,'docs/assets/map.js'),'utf8');
assert.ok(mapSource.includes("LEAFLET_VENDOR_ROOT='vendor/leaflet-1.9.4'"),'kartappen ska använda lokal Leaflet-root');
assert.ok(mapSource.includes('LEAFLET_VENDOR_ROOT}/leaflet.js')&&mapSource.includes('LEAFLET_VENDOR_ROOT}/leaflet.css'),'kartappen ska ladda både lokal JS och CSS');
assert.ok(!mapSource.includes('unpkg.com/leaflet')&&!mapSource.includes('cdnjs.cloudflare.com/ajax/libs/leaflet'),'runtime får inte hämta Leaflet från extern CDN');

console.log('OK: Leaflet 1.9.4 är vendrad lokalt med officiell SRI, images och BSD-licens');
