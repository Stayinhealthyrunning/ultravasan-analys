'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RACE_MEDIA_CONFIG=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const tracks=Object.freeze({
    uv90:'assets/Eldspar-till-Mora.mp3?v=20260713-multirace1',
    uv45:'assets/Ultravasan-45.mp3?v=20260713-multirace1'
  });
  function familyForRace(race){
    const key=String(race?.race_key||race||'').toLowerCase();
    if(key.startsWith('ultravasan45-')||key==='uv45')return'uv45';
    if(key.startsWith('ultravasan90-')||key==='uv90')return'uv90';
    return null;
  }
  function musicForRace(race){return tracks[familyForRace(race)]||null}
  return {tracks,familyForRace,musicForRace};
});
