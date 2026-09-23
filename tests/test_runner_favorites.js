'use strict';
const assert=require('assert');
const favorites=require('../docs/assets/runner-favorites.js');

function fakeStorage(seed={}){
  const data=new Map(Object.entries(seed));
  return{
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key),
    dump:()=>Object.fromEntries(data),
  };
}

const storage=fakeStorage();
const contracts={familyForRace:race=>race.race_key.includes('45')?'uv45':'uv90'};
const race90={race_key:'ultravasan90-2016',year:2016};
const race45={race_key:'ultravasan45-2016',year:2016};
const a=favorites.referenceFor({id:11545,name_as_published:'Hermansson, Andreas',bib:'1025'},race90,contracts);
const b=favorites.referenceFor({id:15737,name_as_published:'Ryapolov, Roman',bib:'4002'},race45,contracts);

assert.deepStrictEqual(
  {...a},
  {key:'uv90:11545',result_id:11545,family:'uv90',race_key:'ultravasan90-2016',year:2016,name:'Hermansson, Andreas',bib:'1025',added_at:null}
);
assert.strictEqual(favorites.read(storage).length,0);
let state=favorites.toggle(storage,a);
assert.strictEqual(state.active,true);
assert.strictEqual(state.persisted,true);
assert.strictEqual(favorites.has(storage,a),true);
assert.strictEqual(favorites.list(storage,'uv90').length,1);
assert.strictEqual(favorites.list(storage,'uv45').length,0);

state=favorites.toggle(storage,a);
assert.strictEqual(state.active,false);
assert.strictEqual(favorites.has(storage,a),false);

favorites.toggle(storage,a);
favorites.toggle(storage,b);
assert.deepStrictEqual(favorites.list(storage).map(item=>item.key),['uv45:15737','uv90:11545']);
assert.deepStrictEqual(favorites.list(storage,'uv90').map(item=>item.key),['uv90:11545']);

const removed=favorites.remove(storage,'uv90:11545');
assert.strictEqual(removed.removed,true);
assert.strictEqual(favorites.list(storage).length,1);

const corrupt=fakeStorage({[favorites.STORAGE_KEY]:'not-json'});
assert.deepStrictEqual(favorites.read(corrupt),[]);
assert.strictEqual(favorites.normalizeReference({result_id:1,family:'uv90',race_key:'x',year:2025,name:''}),null);

const limited=fakeStorage();
for(let i=1;i<=favorites.MAX_ITEMS+5;i++){
  favorites.toggle(limited,{result_id:i,family:'uv90',race_key:'ultravasan90-2025',year:2025,name:`Runner ${i}`});
}
assert.strictEqual(favorites.read(limited).length,favorites.MAX_ITEMS,'lokala favoriter ska ha ett tydligt max');

console.log('OK: U5 RunnerFavorites lagrar lokala resultatreferenser utan att anta personidentitet');
