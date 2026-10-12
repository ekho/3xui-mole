import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Link,Route,Routes,useLocation,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Auth} from './Auth';
import {MiniApp,miniText} from './MiniApp';
import {isMiniApp,openMiniBrowser} from './telegramSDK';
import {Security} from './Security';
import {AccountIdentity} from './AccountIdentity';
import {IdentityRecovery} from './IdentityRecovery';
import {Cabinet} from './Cabinet';
import {Catalogue} from './Catalogue';
import {PurchaseOrder} from './PurchaseOrder';
import {PaymentHistory} from './PaymentHistory';
import {Referrals} from './Referrals';
import {Support} from './Support';
import {MaintenanceProvider} from './Maintenance';
import {config,loadConfig} from './config';
import {text,link,type Lang} from './i18n';
import './style.css';
const OperatorAdmin=lazy(()=>import('./Admin'));
const mini=isMiniApp();const path=location.pathname;
if(path==='/admin')history.replaceState(null,'','/admin/clients'+location.search);
if(!['/verify-email','/reset-password','/confirm-email-change','/recover-account'].includes(path))delete window.__emailToken;
else window.addEventListener('hashchange',()=>location.reload());
function OrderRoute({lang}:{lang:Lang}){
 const {id}=useParams();
 return id&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)?<PurchaseOrder key={id} id={id} lang={lang}/>:mini?<Cabinet lang={lang}/>:<Auth mode="login" lang={lang}/>;
}
function CustomerRoutes({lang}:{lang:Lang}){
 const route=useLocation();
 const pathname=mini?route.pathname.replace(/^\/mini-app(?=\/|$)/,'')||'/cabinet':route.pathname;
 const previousPath=useRef(route.pathname);
 useEffect(()=>{
  if(previousPath.current===route.pathname)return;previousPath.current=route.pathname;
  window.scrollTo(0,0);
  const heading=document.querySelector<HTMLElement>('main h1');
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
 },[route.pathname]);
 const fallback=mini?<Cabinet lang={lang}/>:<Auth mode="login" lang={lang}/>;
 if(pathname!=='/'&&pathname.endsWith('/'))return fallback;
 return <Routes location={{...route,pathname}}>
  <Route caseSensitive path="/" element={<Cabinet lang={lang}/>}/>
  <Route caseSensitive path="/cabinet" element={<Cabinet lang={lang}/>}/>
  <Route caseSensitive path="/catalogue" element={<Catalogue lang={lang}/>}/>
  <Route caseSensitive path="/cabinet/renew" element={<Catalogue key="renew" lang={lang} action="renew"/>}/>
  <Route caseSensitive path="/cabinet/change-plan" element={<Catalogue key="change-plan" lang={lang} action="change_plan"/>}/>
  <Route path="/orders/:id" element={<OrderRoute lang={lang}/>}/>
  <Route caseSensitive path="/cabinet/history" element={<PaymentHistory lang={lang}/>}/>
  <Route caseSensitive path="/cabinet/referrals" element={<Referrals lang={lang}/>}/>
  <Route caseSensitive path="/cabinet/support" element={<Support lang={lang}/>}/>
  <Route caseSensitive path="/cabinet/identity" element={<AccountIdentity lang={lang}/>}/>
  {!mini?<>
   <Route caseSensitive path="/cabinet/security" element={<Security lang={lang}/>}/>
   <Route caseSensitive path="/recover-account" element={<IdentityRecovery lang={lang}/>}/>
   <Route caseSensitive path="/login" element={<Auth key="login" mode="login" lang={lang}/>}/>
   <Route caseSensitive path="/register" element={<Auth key="register" mode="register" lang={lang}/>}/>
   <Route caseSensitive path="/verify-email" element={<Auth key="verify-email" mode="verify-email" lang={lang}/>}/>
   <Route caseSensitive path="/forgot-password" element={<Auth key="forgot-password" mode="forgot-password" lang={lang}/>}/>
   <Route caseSensitive path="/reset-password" element={<Auth key="reset-password" mode="reset-password" lang={lang}/>}/>
   <Route caseSensitive path="/confirm-email-change" element={<Auth key="confirm-email-change" mode="confirm-email-change" lang={lang}/>}/>
  </>:null}
  <Route caseSensitive path="*" element={fallback}/>
 </Routes>;
}
function App(){
 const route=useLocation();const path=mini?route.pathname.replace(/^\/mini-app(?=\/|$)/,'')||'/cabinet':route.pathname;
 const admin=!mini&&path.startsWith('/admin');
 const[adminLang,setAdminLang]=useState<Lang>(()=>new URLSearchParams(location.search).get('lang')==='en'?'en':'ru');
 const[searchParams]=useSearchParams();const navigate=useNavigate();const lang:Lang=admin?adminLang:searchParams.get('lang')==='en'?'en':'ru';const t=text(lang),m=miniText(lang);
 function setLang(next:Lang){if(admin){setAdminLang(next);return;}const out=new URLSearchParams(searchParams);if(next==='en')out.set('lang','en');else out.delete('lang');navigate({pathname:route.pathname,search:out.toString(),hash:location.hash},{replace:true});}
 const browserLogin=location.origin+'/login'+(lang==='en'?'?lang=en':'');
 useEffect(()=>{document.documentElement.lang=lang;const title=admin?t.operatorCabinet:path.startsWith('/orders/')?t.order:path==='/catalogue'?t.plans:path==='/cabinet/renew'?t.renewalTitle:path==='/cabinet/change-plan'?t.changePlanTitle:path==='/cabinet/support'?t.supportMessages:path==='/cabinet/history'?t.paymentHistory:path==='/cabinet/referrals'?t.referralsTitle:path==='/cabinet/identity'?t.identityTitle:path==='/recover-account'?t.recoveryTitle:t.cabinet;document.title=config.productName?title+' · '+config.productName:title;},[admin,lang,path,t]);
 const orderId=/^\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path)?.[1];
 const regular=<CustomerRoutes lang={lang}/>;
 return <div className={mini?'mini-app':undefined}><header><Link to={link(admin?'/admin':'/cabinet',lang)} className="brand" reloadDocument={admin}><img src="/brand/3xui-mole-logo.png" width="64" height="64" alt=""/><span>{config.productName?config.productName+' · ':''}{admin?t.operatorCabinet:t.cabinet}</span></Link>{mini?<a href={browserLogin}>{m.browser}</a>:null}<div aria-label="Language"><button type="button" aria-pressed={lang==='ru'} onClick={()=>setLang('ru')}>RU</button><button type="button" aria-pressed={lang==='en'} onClick={()=>setLang('en')}>EN</button></div></header>{admin?<div className="admin-root"><Routes><Route caseSensitive path="/admin/*" element={<Suspense fallback={<p role="status">{t.loading}</p>}><OperatorAdmin lang={lang}/></Suspense>}/></Routes></div>:mini?<MiniApp lang={lang}><main><MaintenanceProvider lang={lang} path={route.pathname}>{regular}{['/','/cabinet','/catalogue','/cabinet/renew','/cabinet/change-plan'].includes(path)||orderId?<section className="card" aria-label={m.otherPayments}><p className="help" id="mini-browser-payment-help">{m.paymentHelp}</p><div className="account-links"><button type="button" className="primary" aria-describedby="mini-browser-payment-help" onClick={()=>openMiniBrowser(browserLogin)}>{m.otherPayments}</button><Link to={link('/cabinet/identity',lang)}>{m.setupEmail}</Link></div></section>:null}</MaintenanceProvider></main></MiniApp>:<main><MaintenanceProvider lang={lang} path={route.pathname}>{regular}</MaintenanceProvider></main>}<footer><a href={config.termsURL}>{t.termsLink}</a><a href={config.privacyURL}>{t.privacyLink}</a></footer></div>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<main><p role="status">Загрузка… / Loading…</p></main>);
void loadConfig().then(()=>root.render(<BrowserRouter><App/></BrowserRouter>)).catch(()=>root.render(<main><p role="alert">Сервис не настроен. / Service is not configured.</p></main>));
