import {useEffect,useState} from 'react';
import type {Subscription} from './api/client';
import {text,type Lang} from './i18n';
import {quantityLabel} from './quantity';

const dayMs = 24 * 60 * 60 * 1000;
const messages = {
 ru:{current:'Текущий срок',next:'После продления',estimated:'После продления, ориентировочно',activation:'Если активировать сейчас. Новый срок отсчитывается от момента активации.',unavailable:'Не удалось определить срок подписки.',lessThanDay:'Меньше дня',ended:'Срок истёк'},
 en:{current:'Current expiry',next:'After renewal',estimated:'Estimated expiry after renewal',activation:'Estimate if activated now. The new period starts when access is activated.',unavailable:'Could not determine the subscription expiry.',lessThanDay:'Less than a day left',ended:'Expired'},
};

function useCurrentMinute() {
 const [now,setNow] = useState(Date.now);
 useEffect(()=>{
  const update = () => setNow(Date.now());
  const timer = window.setInterval(update,60_000);
  document.addEventListener('visibilitychange',update);
  return () => {window.clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[]);
 return now;
}

function LocalTime({value,lang}:{value:number;lang:Lang}) {
 const date = new Date(value);
 const locale = lang==='ru' ? 'ru-RU' : 'en-US';
 return <time className="subscription-time" dateTime={date.toISOString()}>
  <span>{date.toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'})}</span>{' '}
  <span>{date.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',timeZoneName:'short'})}</span>
 </time>;
}

export function SubscriptionExpiry({value,lang}:{value:string;lang:Lang}) {
 const now = useCurrentMinute();
 const expiry = Date.parse(value);
 if (!Number.isFinite(expiry)) return <>{text(lang).unknown}</>;
 const remaining = expiry-now;
 const days = Math.ceil(remaining/dayMs);
 let label = messages[lang].ended;
 if (remaining>0 && remaining<dayMs) label = messages[lang].lessThanDay;
 else if (days>0) label = lang==='ru' ? 'Ещё '+quantityLabel(days,'day',lang) : days===1 ? '1 day left' : days+' days left';
 return <><LocalTime value={expiry} lang={lang}/><small className="days-left">{label}</small></>;
}

type RenewalTermProps = {
 lang:Lang;
 period:number;
 subscription?:Subscription;
 loading:boolean;
 retry:()=>void;
};

export function RenewalTerm({lang,period,subscription,loading,retry}:RenewalTermProps) {
 const now = useCurrentMinute();
 const m = messages[lang];
 const expiry = Date.parse(subscription?.expires_at ?? '');
 if (loading) return <p role="status">{text(lang).loading}</p>;
 if (!Number.isFinite(expiry) || subscription?.data_stale || subscription?.panel_error) {
  return <div className="term-unavailable"><span>{m.unavailable}</span>{' '}<button type="button" onClick={retry}>{text(lang).retry}</button></div>;
 }
 const expired = expiry<=now;
 // The access worker adds whole 24-hour periods to the later of expiry and activation.
 const next = Math.max(expiry,now) + period*dayMs;
 return <div className="renewal-term" aria-live="polite" aria-atomic="true">
  <dl><div><dt>{m.current}</dt><dd><LocalTime value={expiry} lang={lang}/></dd></div>
   <div><dt>{expired?m.estimated:m.next}</dt><dd><LocalTime value={next} lang={lang}/></dd></div></dl>
  {expired && <p className="help">{m.activation}</p>}
 </div>;
}
