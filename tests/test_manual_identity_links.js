'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const api=require('../docs/assets/manual-identity-links.js');

const root=path.resolve(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'config/manual_identity_links.json'),'utf8'));
const publicSource=fs.readFileSync(path.join(root,'docs/data/manual-identity-links.js'),'utf8');
const publicJson=JSON.parse(publicSource.replace(/^window\.ULTRAVASAN_MANUAL_IDENTITY_LINKS\s*=\s*/,'').replace(/;\s*$/,''));
assert.deepStrictEqual(publicJson,registry,'Publikt identity-link-register ska vara identiskt med källregistret');

const dataset={
  races:[
    {id:1,race_key:'ultravasan90-2019'},
    {id:2,race_key:'ultravasan90-2026'}
  ],
  results:[
    {id:10,race_id:1,source_result_id:'9999991678886F0001C6EF95',person_key:'uvp_f913aed6732c797a9c9ce924',athlete_match_status:'source-id'},
    {id:20,race_id:2,source_result_id:'UL90_HCH8NDMR2601:HCH8NDMRA685C8',athlete_match_status:'unverified'},
    {id:30,race_id:2,source_result_id:'other',athlete_match_status:'unverified'}
  ]
};
api.apply(dataset,registry);
assert.strictEqual(dataset.results[0].person_key,'uvp_f913aed6732c797a9c9ce924');
assert.strictEqual(dataset.results[0].athlete_match_status,'source-id');
assert.strictEqual(dataset.results[1].person_key,'uvp_f913aed6732c797a9c9ce924');
assert.strictEqual(dataset.results[1].athlete_match_status,'manual-verified');
assert.strictEqual(dataset.results[2].person_key,undefined);

const conflict=JSON.parse(JSON.stringify(dataset));
conflict.results[1].person_key='uvp_conflicting';
assert.throws(()=>api.apply(conflict,registry),/kolliderar med verifierad person/);

console.log('manual identity links ok');
