'use strict';
(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./race-contracts.js'):root.RaceContracts;
  const api=factory(contracts);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.RaceMedia=api;root.RACE_MEDIA_CONFIG=api}
})(typeof window!=='undefined'?window:globalThis,function(contracts){
  const tracks=Object.freeze(Object.fromEntries(Object.entries(contracts.catalog.families).map(([key,family])=>[key,family.music])));

  function familyForRace(race){
    return typeof race==='string'&&contracts.family(race)?race:contracts.familyForRace(race);
  }

  function musicForRace(race){
    return tracks[familyForRace(race)]||null;
  }

  function mediaForRace(race){
    const family=familyForRace(race);
    return Object.freeze({family,music:family?tracks[family]||null:null});
  }

  function applyAudioSource(audio,race){
    if(!audio)return null;
    const source=musicForRace(race);
    if(source)audio.src=source;
    else if(typeof audio.removeAttribute==='function')audio.removeAttribute('src');
    else audio.src='';
    return source;
  }

  function installSocialFooter(){
    if(typeof document==='undefined')return;

    const footer=document.querySelector('.site-footer');
    if(!footer||footer.querySelector('.instagram-footer-link'))return;

    const youtubeLink=footer.querySelector('a');
    if(!youtubeLink)return;

    footer.classList.add('social-footer');

    const instagramLink=document.createElement('a');
    instagramLink.className='instagram-footer-link';
    instagramLink.href='https://www.instagram.com/stayinhealthyrunning/';
    instagramLink.target='_blank';
    instagramLink.rel='noopener noreferrer';
    instagramLink.setAttribute(
      'aria-label',
      'Öppna Stayinhealthyrunning på Instagram'
    );

    const qr=document.createElement('img');
    qr.className='instagram-footer-qr';
    qr.src='assets/instagram-qr.png?v=20260721-instagram1';
    qr.alt='QR-kod till Stayinhealthyrunning på Instagram';
    qr.width=445;
    qr.height=445;
    qr.loading='lazy';
    qr.decoding='async';

    const label=document.createElement('strong');
    label.textContent='Stayinhealthyrunning på Instagram';

    instagramLink.append(qr,label);
    footer.insertBefore(instagramLink,youtubeLink);

    const style=document.createElement('style');
    style.id='social-footer-style';
    style.textContent=`
      .site-footer.social-footer{
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        gap:12px;
      }

      .site-footer.social-footer>a{
        min-width:0;
        min-height:104px;
      }

      .site-footer .instagram-footer-link{
        justify-content:flex-start;
        gap:14px;
      }

      .instagram-footer-qr{
        display:block;
        flex:0 0 auto;
        width:74px;
        height:74px;
        padding:4px;
        object-fit:contain;
        border-radius:11px;
        background:#fff;
      }

      .site-footer.social-footer strong{
        line-height:1.3;
        overflow-wrap:anywhere;
      }

      @media(max-width:760px){
        .site-footer.social-footer{
          grid-template-columns:minmax(0,1fr) minmax(0,1fr);
          gap:8px;
          padding:0 8px;
        }

        .site-footer.social-footer>a{
          min-height:92px;
          padding:12px 9px;
          gap:9px;
          text-align:left;
        }

        .instagram-footer-qr{
          width:62px;
          height:62px;
          border-radius:9px;
        }

        .site-footer.social-footer strong{
          font-size:.82rem;
          line-height:1.25;
        }
      }

      @media(max-width:430px){
        .site-footer.social-footer>a{
          min-height:84px;
          padding:10px 7px;
          gap:7px;
        }

        .instagram-footer-qr{
          width:54px;
          height:54px;
        }

        .site-footer.social-footer strong{
          font-size:.72rem;
        }

        .site-footer.social-footer .youtube-icon{
          flex:0 0 31px;
          width:31px;
          height:22px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  if(typeof document!=='undefined'){
    if(document.readyState==='loading'){
      document.addEventListener(
        'DOMContentLoaded',
        installSocialFooter,
        {once:true}
      );
    }else{
      installSocialFooter();
    }
  }

  return {
    tracks,
    familyForRace,
    musicForRace,
    mediaForRace,
    applyAudioSource,
    installSocialFooter
  };
});
