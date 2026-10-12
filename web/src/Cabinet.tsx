import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import * as api from './api/client';
import {config} from './config';
import {text,link,loginRedirect,errorText,type Lang} from './i18n';
import {Connection} from './Connection';
import {isMiniApp} from './telegramSDK';
import {StarsSubscription} from './StarsSubscription';
import {ClientReminders} from './ClientReminders';
import {ClientNotices} from './ClientNotices';
import {ClientPromocode} from './ClientPromocode';
import {miniText} from './MiniApp';
import {useMaintenance} from './Maintenance';

const keyStatuses=new Set<api.Subscription['status']>(['active','expired']);
const detailStatuses=new Set<api.Subscription['status']>(['provisioning','needs_review','active','expired','banned','disabled','exhausted']);
const allowsKey=(sub:api.Subscription)=>sub.connection_available??keyStatuses.has(sub.status);
function validKey(value:string){if(value.length>2048||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))return false;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&Boolean(url.hostname);}catch{return false;}}

export function Cabinet({lang}:{lang:Lang}){
 const maintenance=useMaintenance();
 const t=text(lang);const[canLogout,setCanLogout]=useState(false);const[account,setAccount]=useState<api.AccountResult>();const[request,setRequest]=useState<api.TrialRequest|null>(null);const[sub,setSub]=useState<api.Subscription>();const[error,setError]=useState('');const[trialBusy,setTrialBusy]=useState(false);const[loggingOut,setLoggingOut]=useState(false);const[keyBusy,setKeyBusy]=useState(false);const[comment,setComment]=useState('');const[attempt,setAttempt]=useState<{key:string;comment:string;mode:'request'|'activate'}>();const[key,setKey]=useState('');const[revision,setRevision]=useState(0);const controller=useRef<AbortController>(null);const owner=useRef<string|undefined>(undefined);const keyRequest=useRef<AbortController|undefined>(undefined);const keyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const busy=trialBusy||loggingOut;
 const clearKey=useCallback(()=>{keyRequest.current?.abort();keyRequest.current=undefined;if(keyTimer.current)clearTimeout(keyTimer.current);keyTimer.current=undefined;setKey('');setKeyBusy(false);},[]);
 useEffect(()=>{const c=new AbortController();controller.current=c;setTrialBusy(false);return()=>{c.abort();controller.current?.abort();};},[revision,lang]);
 const snapshot=useQuery({
  queryKey:['customer','cabinet',lang,revision],
  queryFn:async({signal})=>{const account=await api.getAccount(signal);const[trial,subscription]=await Promise.all([api.getCurrentTrialRequest(signal),api.getSubscription(signal)]);return {account,trial:trial.request,subscription};},
  refetchInterval:query=>{
   if(query.state.fetchStatus==='fetching')return false;
   const error=query.state.error;
   if(error)return !(error instanceof api.ApiError)||error.status===503||error.status===429?5000:false;
   const value=query.state.data;if(!value)return false;
   const s=value.subscription,r=value.trial;
   return ['pending','provisioning'].includes(s.access_operation_status??'')||(!['active','expired','banned','disabled','exhausted'].includes(s.status)&&r?.status!=='rejected'&&(r||['provisioning','needs_review'].includes(s.status)))?5000:false;
  },
 });
 useEffect(()=>{if(!snapshot.data)return;const{account,trial,subscription}=snapshot.data;if(owner.current&&owner.current!==account.account.account_id){clearKey();controller.current?.abort();controller.current=new AbortController();setAttempt(undefined);setComment('');setTrialBusy(false);}owner.current=account.account.account_id;setAccount(account);setCanLogout(true);setRequest(trial);setSub(subscription);setError('');if(!allowsKey(subscription))clearKey();},[snapshot.data,snapshot.dataUpdatedAt,clearKey]);
 useEffect(()=>{
  const e=snapshot.error;if(!e)return;clearKey();if(e instanceof api.ApiError&&e.status===401){loginRedirect(lang);return;}setError(errorText(e,lang));
  const c=new AbortController();
  if(e instanceof api.ApiError&&e.code==='ACCOUNT_RESTRICTED')void api.getSessionContext(c.signal).then(()=>{if(!c.signal.aborted)setCanLogout(true);}).catch(()=>{if(!c.signal.aborted)setCanLogout(false);});
  return()=>c.abort();
 },[snapshot.error,snapshot.errorUpdatedAt,clearKey,lang]);
 useEffect(()=>{const hide=()=>clearKey();const visibility=()=>{if(document.visibilityState==='hidden')clearKey();};window.addEventListener('pagehide',hide);document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',visibility);keyRequest.current?.abort();if(keyTimer.current)clearTimeout(keyTimer.current);};},[clearKey]);
 const currentOrder=useQuery({queryKey:['customer','current-order',account?.account.account_id,lang,revision],queryFn:({signal})=>api.getCurrentPurchaseOrder(signal),enabled:!!account});
 const order=currentOrder.data?.order??null;
 function handle(e:unknown){if(controller.current?.signal.aborted)return;clearKey();setError(errorText(e,lang));if(e instanceof api.ApiError&&e.status===401)loginRedirect(lang);}
 function retry(){clearKey();setRevision(r=>r+1);}
 async function create(event:FormEvent){event.preventDefault();if(busy||(maintenance.status?.enabled&&!attempt))return;if(Array.from(comment).length>1000){setError(t.commentHelp);return;}const current=attempt??{key:crypto.randomUUID(),comment,mode:account?.capabilities.trial_mode??('request' as const)};setAttempt(current);setTrialBusy(true);setError('');const signal=controller.current?.signal;try{const out=await (current.mode==='activate'?api.activateTelegramTrial(current.key,signal):api.createTrialRequest({comment:current.comment},current.key,signal));if(signal?.aborted)return;setRequest(out);setRevision(r=>r+1);}catch(e){if(signal?.aborted)return;if(e instanceof api.ApiError&&e.code==='MAINTENANCE')maintenance.refresh();handle(e);}finally{if(!signal?.aborted)setTrialBusy(false);}}
 async function reveal(){if(keyBusy)return;clearKey();const request=new AbortController();keyRequest.current=request;setKeyBusy(true);setError('');try{const out=await api.getSubscriptionKey(request.signal);if(request.signal.aborted||keyRequest.current!==request)return;if(!validKey(out.subscription_url))throw new api.ApiError(409,'SUBSCRIPTION_UNAVAILABLE','');setKey(out.subscription_url);keyTimer.current=setTimeout(clearKey,60000);}catch(e){if(!request.signal.aborted)handle(e);}finally{if(keyRequest.current===request){keyRequest.current=undefined;setKeyBusy(false);}}}
 async function logout(){clearKey();controller.current?.abort();setLoggingOut(true);try{await api.logoutAccount();loginRedirect(lang);}catch(e){setError(errorText(e,lang));setRevision(r=>r+1);}finally{setLoggingOut(false);}}
 const status=sub?.status==='none'&&request?.status==='rejected'?'rejected':sub?.status==='none'&&request?.status==='pending'?'pending':sub?.status??'none';
 const automatic=(attempt?.mode??account?.capabilities.trial_mode)==='activate';
 const descriptions={none:t.none,pending:t.pending,rejected:t.rejected,provisioning:t.provisioning,needs_review:t.needsReview,active:t.active,expired:t.expired,banned:t.banned,disabled:t.disabled,exhausted:t.exhausted};
 const date=(value:string|null)=>value?new Date(value).toLocaleString(lang==='ru'?'ru-RU':'en-US'):t.unknown;
 const bytes=(value:number|null|undefined)=>{if(value==null)return t.unknown;const units=['B','KiB','MiB','GiB','TiB'];const unit=value===0?0:Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);return new Intl.NumberFormat(lang,{maximumFractionDigits:2}).format(value/1024**unit)+' '+units[unit];};
 const unlimitedTraffic=sub?.unlimited_traffic??sub?.traffic_limit_bytes===0;
 const unlimitedDevices=sub?.unlimited_devices??sub?.devices===0;
 const panelMessage=sub?.panel_error?({unavailable:t.panelUnavailable,identity_mismatch:t.panelIdentity,unknown_membership:t.panelMembership,invalid_traffic:t.panelTraffic} as const)[sub.panel_error]:sub?.data_stale?t.stale:'';
 const profiles={regular:t.profileRegular,euru:'EURU',unlimited:t.unlimited,banned:t.profileBanned,unknown:t.unknown};
 return <section className="card"><div className="cabinet-head"><div><p className="eyebrow">{t.cabinet}</p><h1>{account?('display_name' in account.account?account.account.display_name:null)||account.account.email||t.cabinet:t.loading}</h1></div><button onClick={logout} disabled={!canLogout||busy}>{t.logout}</button></div>
  {error?<div className="error" role="alert"><p>{error}</p><button onClick={retry} disabled={busy}>{t.retry}</button></div>:null}
  {account?<dl className="profile-grid"><div><dt>{t.email}</dt><dd>{account.account.email??miniText(lang).noEmail}</dd></div><div><dt>{t.language}</dt><dd>{account.account.locale==='ru'?t.russian:t.english}</dd></div></dl>:null}
  {!sub?<p role="status">{t.loading}</p>:<><p className="notice" role="status">{descriptions[status]}</p>{sub.access_operation_status&&sub.access_operation_status!=='applied'?<p className={sub.access_operation_status==='needs_review'?'warning':'notice'} role="status">{t.accessOperations}: {{pending:t.operationPending,provisioning:t.operationProvisioning,needs_review:t.operationNeedsReview,skipped:t.operationSkipped}[sub.access_operation_status]}</p>:null}
   {request?.status==='pending'&&status!=='pending'?<p>{t.pending}</p>:null}
   {status==='none'&&!request?(account?.capabilities.trial_available?<form onSubmit={create} aria-busy={busy}><p>{automatic?t.activateTrialIntro:t.trialIntro}</p>{automatic?null:<><label htmlFor="comment">{t.comment}<textarea id="comment" rows={3} value={comment} disabled={!!attempt} onChange={e=>setComment(e.target.value)} aria-describedby="comment-help"/></label><p id="comment-help" className="help">{t.commentHelp}</p></>}<button className="primary" disabled={busy||(maintenance.status?.enabled&&!attempt)}>{busy?t.sending:automatic?t.activateTrial:t.requestTrial}</button></form>:<p>{t.trialUnavailable}</p>):null}
   <dl className="stats-grid"><div><dt>{t.accessProfile}</dt><dd>{profiles[sub.access_profile]}</dd></div><div><dt>{t.vpnAccess}</dt><dd>{sub.vpn_banned?t.vpnBanned:t.vpnAllowed}</dd></div>{detailStatuses.has(sub.status)?<><div><dt>{t.devices}</dt><dd>{unlimitedDevices?t.unlimited:sub.devices}</dd></div><div><dt>{t.upload}</dt><dd>{bytes(sub.traffic_upload_bytes)}</dd></div><div><dt>{t.download}</dt><dd>{bytes(sub.traffic_download_bytes)}</dd></div><div><dt>{t.used}</dt><dd>{bytes(sub.traffic_used_bytes)}</dd></div><div><dt>{t.remaining}</dt><dd>{unlimitedTraffic?t.unlimited:bytes(sub.traffic_remaining_bytes)}</dd></div><div><dt>{t.traffic}</dt><dd>{unlimitedTraffic?t.unlimited:bytes(sub.traffic_limit_bytes)}</dd></div><div><dt>{t.expires}</dt><dd>{sub.expires_at?date(sub.expires_at):['provisioning','needs_review'].includes(sub.status)?t.unknown:t.noExpiry}</dd></div></>:null}</dl>{sub.status==='none'&&sub.access_profile!=='unknown'?<p className="help">{t.futureProfileIntent}</p>:null}
   {sub.observed_at?<p className="help">{t.observed}: {date(sub.observed_at)}</p>:null}
   {panelMessage?<div className="warning" role="alert"><p>{panelMessage}</p><button onClick={retry} disabled={busy}>{t.retry}</button></div>:null}
   {keyStatuses.has(sub.status)&&allowsKey(sub)?<Connection lang={lang} subscriptionURL={key} busy={keyBusy} onReveal={reveal} onHide={clearKey}/>:null}
  </>}
  {account?<ClientPromocode key={'promocode-'+account.account.account_id} lang={lang} onActivationChange={()=>setRevision(r=>r+1)}/>:null}
  {account&&canLogout&&!busy&&!error?<ClientNotices key={account.account.account_id+'-'+lang} lang={lang} accountID={account.account.account_id} refreshKey={revision}/>:null}
  {account&&canLogout&&!busy&&!error?<ClientReminders lang={lang} accountID={account.account.account_id} refreshKey={revision}/>:null}
  {account&&(isMiniApp()||('telegram_linked' in account.account&&account.account.telegram_linked)||order?.payment_method==='telegram_stars')?<StarsSubscription key={'stars-'+account.account.account_id} lang={lang} refreshKey={revision}/>:null}
  {account?<p className="account-links"><Link to={link('/catalogue',lang)}>{t.plans}</Link>{sub&&['regular','euru'].includes(sub.access_profile)&&!sub.vpn_banned&&['active','expired','exhausted'].includes(sub.status)?<><Link to={link('/cabinet/renew',lang)}>{t.renewalTitle}</Link><Link to={link('/cabinet/change-plan',lang)}>{t.changePlanTitle}</Link></>:null}{order?<Link to={link('/orders/'+order.order_id,lang)}>{t.currentOrder}</Link>:null}<Link to={link('/cabinet/history',lang)}>{t.paymentHistory}</Link><Link to={link('/cabinet/referrals',lang)}>{t.referralsTitle}</Link><Link to={link('/cabinet/identity',lang)}>{t.identityTitle}</Link>{!isMiniApp()?<Link to={link('/cabinet/security',lang)}>{t.security}</Link>:null}<Link to={link('/cabinet/support',lang)}>{t.supportMessages}</Link></p>:null}<a className="support" href={config.supportURL}>{t.support}</a>
 </section>;
}
