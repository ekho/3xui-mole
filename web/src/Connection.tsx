import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {text,otherImportText,type Lang} from './i18n';
import {isMiniApp} from './telegramSDK';

type Platform='ios'|'android'|'macos'|'windows'|'other';
const downloads:Record<Exclude<Platform,'ios'|'other'>,string>={
 android:'https://play.google.com/store/apps/details?id=com.happproxy',
 macos:'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/Happ.macOS.universal.dmg',
 windows:'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe'
};
const ios={ru:'https://apps.apple.com/ru/app/happ-lite/id6799917773',global:'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215'};
const catalog='https://www.happ.su/main';
const external={target:'_blank',rel:'noreferrer noopener'} as const;
const platforms = {ios:'iOS', android:'Android', macos:'macOS', windows:'Windows'} as const;
const messages = {
 ru:{choose:'Выберите устройство',switchDevice:'Подключаю другое устройство',install:'Установите приложение',installed:'Уже установлен',add:'Добавьте подписку',addHapp:'Добавить подписку в Happ',sources:'Другие источники установки'},
 en:{choose:'Choose a device',switchDevice:'Connect another device',install:'Install the app',installed:'Already installed',add:'Add your subscription',addHapp:'Add subscription to Happ',sources:'Other download sources'},
};

function initialPlatform(requested:string|null):Platform|'' {
 if (requested === 'other' || requested && Object.hasOwn(platforms,requested)) return requested as Platform;
 const ua = navigator.userAgent;
 if (/Android/i.test(ua)) return 'android';
 if (/iPad|iPhone|iPod/i.test(ua) || /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
 if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
 if (/Windows NT/i.test(ua)) return 'windows';
 return '';
}

export function Connection({lang,subscriptionURL,busy,onReveal,onHide}:{lang:Lang;subscriptionURL:string;busy:boolean;onReveal:()=>void;onHide:()=>void}){
 const key=subscriptionURL;
 const preferred = initialPlatform(new URLSearchParams(useLocation().search).get('platform'));
 const t=text(lang), m=messages[lang];
 const [platform,setPlatform]=useState<Platform|''>(preferred);
 const [region,setRegion]=useState<keyof typeof ios>('global');
 const [manual,setManual]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');const[showQR,setShowQR]=useState(false);const[qrReady,setQrReady]=useState(false);const[qrError,setQrError]=useState('');
 const input=useRef<HTMLInputElement>(null);const canvas=useRef<HTMLCanvasElement>(null);
 const openHapp=useRef<HTMLAnchorElement>(null);
 const focusAfterReveal=useRef<'happ'|'manual'|null>(null);
 useEffect(()=>{setPlatform(preferred);},[preferred]);
 useEffect(()=>{
  if (key && focusAfterReveal.current) {
   const target = focusAfterReveal.current==='happ' ? openHapp.current : input.current;
   target?.focus();
   focusAfterReveal.current=null;
  }
 },[key,manual]);
 useEffect(()=>{setCopyStatus('');setShowQR(false);setQrReady(false);setQrError('');if(canvas.current){canvas.current.width=0;canvas.current.height=0;}},[key]);
 useEffect(()=>{if(!showQR||!key)return;let current=true;const scratch=document.createElement('canvas'),target=canvas.current;setQrReady(false);setQrError('');
  void import('qrcode').then(async({default:QRCode})=>{if(!current)return;await QRCode.toCanvas(scratch,key,{errorCorrectionLevel:'M',margin:2,width:220});if(!current||!target)return;target.width=scratch.width;target.height=scratch.height;const context=target.getContext('2d');if(!context)throw new Error('canvas');context.drawImage(scratch,0,0);setQrReady(true);}).catch(()=>{if(current)setQrError(t.qrUnavailable);});
  return()=>{current=false;scratch.width=0;scratch.height=0;if(target){target.width=0;target.height=0;}};
 },[key,showQR,t.qrUnavailable]);
 async function copy(){try{await navigator.clipboard.writeText(key);setCopyStatus(t.copied);}catch{setCopyStatus(t.manualCopy);input.current?.focus();input.current?.select();}}
 const supportsHapp = Boolean(platform && platform !== 'other');
 const quickReveal = isMiniApp() && !busy && !key;
 const install = !platform ? undefined : platform==='ios' ? ios[region] : platform==='other' ? catalog : downloads[platform];
 function prepare(showManual:boolean) {
  setManual(showManual);
  focusAfterReveal.current=showManual?'manual':'happ';
  if (!key && !busy) onReveal();
 }
 function hide() {
  focusAfterReveal.current=null;
  setManual(false);
  onHide();
 }
 return <section className="connection" aria-labelledby="connection-title">
  <h2 id="connection-title">{t.connectDevice}</h2>
  {quickReveal && <button className="primary" onClick={()=>prepare(true)}>{t.showKey}</button>}
  <ol className="connection-steps" aria-label={t.connectionSteps}>
   <li>
    <h3>{m.install}</h3>
    <details className="device-picker" open={!preferred}>
     <summary>{platform ? <><strong>{platform==='other'?t.other:platforms[platform]}</strong><span>{m.switchDevice}</span></> : m.choose}</summary>
     <label htmlFor="platform">{t.platform}
      <select id="platform" value={platform} onChange={event=>setPlatform(event.target.value as Platform)}>
       {!platform && <option value="" disabled>{m.choose}</option>}
       {Object.entries(platforms).map(([value,label])=><option key={value} value={value}>{label}</option>)}
       <option value="other">{t.other}</option>
      </select>
     </label>
    </details>
    {platform==='ios' && <><label htmlFor="store-region">{t.storeRegion}
     <select id="store-region" value={region} onChange={event=>setRegion(event.target.value as keyof typeof ios)}>
      <option value="global">{t.globalStore}</option><option value="ru">{t.russiaStore}</option>
     </select>
    </label>{region==='ru' && <p className="help">{t.ruStoreWarning}</p>}</>}
    {install && <div className="connection-install">
     <a className="button-link primary" href={install} {...external}>{platform==='other'?t.openCatalog:t.installHapp}</a>
     <a href="#connection-import" onClick={()=>{if(supportsHapp && !key) prepare(false);}}>{m.installed}</a>
    </div>}
    {platform==='ios' && <details className="connection-sources"><summary>{m.sources}</summary>
     <div className="secondary-links"><a href={ios.global} {...external}>{t.globalAppStore}</a><a href={catalog} {...external}>{t.developerCatalog}</a></div>
    </details>}
   </li>
   <li>
    <h3 id="connection-import" tabIndex={-1}>{m.add}</h3>
    {platform==='other' && <p>{otherImportText(lang)}</p>}
    <div className="connection-actions" aria-busy={busy}>
     {supportsHapp && (key
      ? <a className="button-link" ref={openHapp} href={'happ://add/'+key}>{t.openHapp}</a>
      : !busy && <button onClick={()=>prepare(false)}>{m.addHapp}</button>)}
     {!quickReveal && !busy && !(key && manual) && <button className={supportsHapp?'manual-import':undefined} onClick={()=>prepare(true)}>{t.showKey}</button>}
     {busy && <span role="status">{t.loading}</span>}
     {(busy || key) && <button onClick={hide}>{t.hideConnection}</button>}
    </div>
    {key && manual && <div className="connection-secret">
     <label htmlFor="subscription-key">{t.key}<input ref={input} id="subscription-key" value={key} readOnly/></label>
     <div className="connection-actions"><button onClick={copy}>{t.copy}</button><button onClick={()=>setShowQR(true)}>{t.showQR}</button></div>
     <p role="status">{copyStatus}</p>
     {showQR && <div className="qr"><canvas ref={canvas} role="img" aria-label={t.qrLabel} hidden={!qrReady}/>
      {!qrReady && !qrError && <p role="status">{t.loading}</p>}{qrError && <p role="alert">{qrError}</p>}
     </div>}
     {supportsHapp && <p>{t.importHelp}</p>}
    </div>}
   </li>
   <li><h3>{t.connectStep}</h3></li>
  </ol>
 </section>;
}
