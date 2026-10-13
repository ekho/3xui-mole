export const isMiniApp=()=>location.pathname==='/mini-app'||location.pathname.startsWith('/mini-app/');
export const miniSessionEnded='mini-session-ended';
type Insets={top?:number;bottom?:number;left?:number;right?:number};
export type TelegramApp={initData:string;themeParams?:Record<string,string>;viewportStableHeight?:number;safeAreaInset?:Insets;contentSafeAreaInset?:Insets;ready?:()=>void;expand?:()=>void;onEvent?:(name:string,fn:()=>void)=>void;offEvent?:(name:string,fn:()=>void)=>void;BackButton?:{show?:()=>void;hide?:()=>void;onClick?:(fn:()=>void)=>void;offClick?:(fn:()=>void)=>void};openLink?:(url:string)=>void;openInvoice?:(url:string,callback:(status:'paid'|'cancelled'|'failed'|'pending')=>void)=>void};
declare global{interface Window{Telegram?:{WebApp?:TelegramApp}}}
let launchHash=isMiniApp()?location.hash:'';
export function clearMiniLaunch(forget=false){if(forget)launchHash='';try{sessionStorage.removeItem('__telegram__initParams');}catch{}if(location.hash)history.replaceState(null,'',location.pathname+location.search);}
export function endMiniSession(reason='expired'){launchHash='';clearMiniLaunch();window.dispatchEvent(new CustomEvent(miniSessionEnded,{detail:reason}));}
export function optionalSDK(action:()=>void){try{action();}catch{}}
export async function loadTelegram(signal:AbortSignal):Promise<TelegramApp>{
 try{sessionStorage.removeItem('__telegram__initParams');}catch{}
 if(window.Telegram?.WebApp){clearMiniLaunch();return window.Telegram.WebApp;}
 if(launchHash)history.replaceState(null,'',location.pathname+location.search+launchHash);
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://telegram.org/js/telegram-web-app.js';script.async=true;script.referrerPolicy='no-referrer';
  const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);script.onload=null;script.onerror=null;clearMiniLaunch();if(error){script.remove();reject(error);}else{const app=window.Telegram?.WebApp;if(app)resolve(app);else reject(new Error('SDK_UNAVAILABLE'));}};
  const abort=()=>finish(new DOMException('Aborted','AbortError'));const timer=setTimeout(()=>finish(new Error('SDK_UNAVAILABLE')),6000);
  script.onload=()=>finish();script.onerror=()=>finish(new Error('SDK_UNAVAILABLE'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}document.head.append(script);
 });
}
function luminance(hex:string){
 const full=hex.length===4?hex.slice(1).split('').map(value=>value+value).join(''):hex.slice(1);
 const channels=[0,2,4].map(at=>{const value=parseInt(full.slice(at,at+2),16)/255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});
 return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(first:string,second:string){const a=luminance(first),b=luminance(second);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
export function applyMiniTheme(app:TelegramApp){
 const root=document.querySelector<HTMLElement>('.mini-app');if(!root)return;
 for(const [field,name] of Object.entries({bg_color:'bg',text_color:'text',secondary_bg_color:'card',button_color:'button',button_text_color:'button-text',link_color:'link'})){
  const value=app.themeParams?.[field];if(typeof value==='string'&&/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value))root.style.setProperty('--mini-'+name,value);
 }
 const theme=getComputedStyle(root),background=theme.getPropertyValue('--mini-button').trim(),foreground=theme.getPropertyValue('--mini-button-text').trim();
 if(contrast(background,foreground)<4.5)root.style.setProperty('--mini-button-text',contrast(background,'#000000')>=contrast(background,'#ffffff')?'#000000':'#ffffff');
 const link=theme.getPropertyValue('--mini-link').trim();
 if(['--mini-bg','--mini-card'].some(field=>contrast(link,theme.getPropertyValue(field).trim())<4.5))root.style.setProperty('--mini-link',theme.getPropertyValue('--mini-text').trim());
 const height=app.viewportStableHeight;if(typeof height==='number'&&Number.isFinite(height)&&height>0&&height<=10000)root.style.setProperty('--mini-height',height+'px');
 for(const edge of ['top','bottom','left','right'] as const){const values=[app.safeAreaInset?.[edge],app.contentSafeAreaInset?.[edge]].filter((n):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=512);root.style.setProperty('--mini-safe-'+edge,Math.max(0,...values)+'px');}
}
export function openMiniBrowser(url:string){
 const app=window.Telegram?.WebApp;if(app?.openLink){try{app.openLink(url);return;}catch{}}
 window.open(url,'_blank','noopener,noreferrer');
}
