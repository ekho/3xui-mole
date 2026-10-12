import {Component,lazy,Suspense,useEffect,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Route,Routes,useLocation,useNavigate} from 'react-router-dom';
import {isMiniApp,openMiniBrowser} from './telegramSDK';
import {miniText} from './miniText';
import {MaintenanceProvider} from './Maintenance';
import {config,loadConfig} from './config';
import {text,link,type Lang} from './i18n';
import './style.css';
const OperatorAdmin=lazy(()=>import('./Admin'));
const Auth=lazy(()=>import('./Auth').then(module=>({default:module.Auth})));
const MiniApp=lazy(()=>import('./MiniApp').then(module=>({default:module.MiniApp})));
const Security=lazy(()=>import('./Security').then(module=>({default:module.Security})));
const AccountIdentity=lazy(()=>import('./AccountIdentity').then(module=>({default:module.AccountIdentity})));
const IdentityRecovery=lazy(()=>import('./IdentityRecovery').then(module=>({default:module.IdentityRecovery})));
const Cabinet=lazy(()=>import('./Cabinet').then(module=>({default:module.Cabinet})));
const Catalogue=lazy(()=>import('./Catalogue').then(module=>({default:module.Catalogue})));
const PurchaseOrder=lazy(()=>import('./PurchaseOrder').then(module=>({default:module.PurchaseOrder})));
const PaymentHistory=lazy(()=>import('./PaymentHistory').then(module=>({default:module.PaymentHistory})));
const Referrals=lazy(()=>import('./Referrals').then(module=>({default:module.Referrals})));
const Support=lazy(()=>import('./Support').then(module=>({default:module.Support})));
class PageErrorBoundary extends Component<{lang:Lang;children:ReactNode;recovery?:{label:string;action:()=>void};withinMain?:boolean},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  const t=text(this.props.lang);
  const content=<section className="card"><p role="alert">{t.generic}</p><button onClick={this.props.recovery?.action??(()=>{
   const token=window.__emailToken;
   if(token&&['/verify-email','/reset-password','/confirm-email-change','/recover-account'].includes(location.pathname))location.replace(location.pathname+location.search+'#token='+encodeURIComponent(token));
   else location.reload();
  })}>{this.props.recovery?.label??t.retry}</button></section>;
  return this.props.withinMain?content:<main>{content}</main>;
 }
}

const mini=isMiniApp();const path=location.pathname;
if(path==='/admin')history.replaceState(null,'','/admin/clients'+location.search);
if(!['/verify-email','/reset-password','/confirm-email-change','/recover-account'].includes(path))delete window.__emailToken;
else window.addEventListener('hashchange',()=>location.reload());
function App(){
 const route=useLocation(),navigate=useNavigate();const path=mini?route.pathname.replace(/^\/mini-app(?=\/|$)/,'')||'/cabinet':location.pathname;
 const[lang,setLang]=useState<Lang>(new URLSearchParams(location.search).get('lang')==='en'?'en':'ru');const t=text(lang),m=miniText(lang);const admin=!mini&&path.startsWith('/admin');
 const browserLogin=location.origin+'/login'+(lang==='en'?'?lang=en':'');
 useEffect(()=>{document.documentElement.lang=lang;const title=admin?t.operatorCabinet:path.startsWith('/orders/')?t.order:path==='/catalogue'?t.plans:path==='/cabinet/renew'?t.renewalTitle:path==='/cabinet/change-plan'?t.changePlanTitle:path==='/cabinet/support'?t.supportMessages:path==='/cabinet/history'?t.paymentHistory:path==='/cabinet/referrals'?t.referralsTitle:path==='/cabinet/identity'?t.identityTitle:path==='/recover-account'?t.recoveryTitle:t.cabinet;document.title=config.productName?title+' · '+config.productName:title;},[admin,lang,path,t]);
 const orderId=/^\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path)?.[1];
 const page=orderId?<PurchaseOrder id={orderId} lang={lang}/>:path==='/catalogue'?<Catalogue lang={lang}/>:path==='/cabinet/renew'?<Catalogue lang={lang} action="renew"/>:path==='/cabinet/change-plan'?<Catalogue lang={lang} action="change_plan"/>:path==='/cabinet/history'?<PaymentHistory lang={lang}/>:path==='/cabinet/referrals'?<Referrals lang={lang}/>:path==='/cabinet/support'?<Support lang={lang}/>:path==='/recover-account'&&!mini?<IdentityRecovery lang={lang}/>:path==='/cabinet/identity'?<AccountIdentity lang={lang}/>:path==='/cabinet/security'&&!mini?<Security lang={lang}/>:path==='/cabinet'||path==='/'||mini?<Cabinet lang={lang}/>:<Auth mode={path==='/register'?'register':path==='/verify-email'?'verify-email':path==='/forgot-password'?'forgot-password':path==='/reset-password'?'reset-password':path==='/confirm-email-change'?'confirm-email-change':'login'} lang={lang}/>;
 const regular=<PageErrorBoundary key={path} lang={lang} withinMain recovery={mini?{label:path==='/'||path==='/cabinet'?t.plans:t.backAccount,action:()=>navigate(link(path==='/'||path==='/cabinet'?'/catalogue':'/cabinet',lang))}:undefined}><Suspense fallback={<p role="status">{t.loading}</p>}>{page}</Suspense></PageErrorBoundary>;
 return <PageErrorBoundary lang={lang}><Suspense fallback={<main><p role="status">{t.loading}</p></main>}><div className={mini?'mini-app':undefined}><header><a href={link(admin?'/admin':'/cabinet',lang)} className="brand"><img src="/brand/3xui-mole-logo.png" width="64" height="64" alt=""/><span>{config.productName?config.productName+' · ':''}{admin?t.operatorCabinet:t.cabinet}</span></a>{mini?<a href={browserLogin}>{m.browser}</a>:null}<div aria-label="Language"><button type="button" aria-pressed={lang==='ru'} onClick={()=>setLang('ru')}>RU</button><button type="button" aria-pressed={lang==='en'} onClick={()=>setLang('en')}>EN</button></div></header>{admin?<div className="admin-root"><Routes><Route path="/admin/*" element={<Suspense fallback={<p role="status">{t.loading}</p>}><OperatorAdmin lang={lang}/></Suspense>}/></Routes></div>:mini?<MiniApp lang={lang}><main><MaintenanceProvider lang={lang} path={route.pathname}>{regular}{['/','/cabinet','/catalogue','/cabinet/renew','/cabinet/change-plan'].includes(path)||orderId?<section className="card" aria-label={m.otherPayments}><p className="help" id="mini-browser-payment-help">{m.paymentHelp}</p><div className="account-links"><button type="button" className="primary" aria-describedby="mini-browser-payment-help" onClick={()=>openMiniBrowser(browserLogin)}>{m.otherPayments}</button><a href={link('/cabinet/identity',lang)}>{m.setupEmail}</a></div></section>:null}</MaintenanceProvider></main></MiniApp>:<main><MaintenanceProvider lang={lang} path={route.pathname}>{regular}</MaintenanceProvider></main>}<footer><a href={config.termsURL}>{t.termsLink}</a><a href={config.privacyURL}>{t.privacyLink}</a></footer></div></Suspense></PageErrorBoundary>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<main><p role="status">Загрузка… / Loading…</p></main>);
void loadConfig().then(()=>root.render(<BrowserRouter><App/></BrowserRouter>)).catch(()=>root.render(<main><p role="alert">Сервис не настроен. / Service is not configured.</p></main>));
