import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getIdentity } from './api/client';
import { text, errorText, link, type Lang } from './i18n';
import { miniText } from './miniText';
import { browserPaymentLogin, paymentReturn } from './paymentReturn';
import { openMiniBrowser } from './telegramSDK';

export function MiniPaymentHandoff({ lang }: { lang: Lang }) {
  const route = useLocation(), t = text(lang), m = miniText(lang);
  const [ready, setReady] = useState<boolean>(), [error, setError] = useState<unknown>(), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReady(undefined); setError(undefined);
    void getIdentity(controller.signal).then(identity => { if (!controller.signal.aborted) setReady(identity.independent_login === true); }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [route.pathname, retry]);
  const destination = paymentReturn(route.pathname.replace(/^\/mini-app/, '') + route.search, lang);
  const setup = link('/cabinet/identity', lang) + (lang === 'en' ? '&' : '?') + new URLSearchParams({ return_to: destination });
  return <section className="card mini-payment-handoff" aria-label={m.otherPayments}>
    <p className="help" id="mini-browser-payment-help">{m.paymentHelp}</p>
    {error ? <div className="error" role="alert"><p>{errorText(error, lang)}</p><button onClick={() => setRetry(value => value + 1)}>{t.retry}</button></div> : ready === undefined ? <p role="status">{t.loading}</p> : <div className="account-links">
      {ready ? <><button type="button" className="primary" aria-describedby="mini-browser-payment-help" onClick={() => openMiniBrowser(browserPaymentLogin(destination, lang))}>{m.otherPayments}</button><Link to={setup}>{m.setupEmail}</Link></> : <Link className="button-link primary" to={setup} aria-describedby="mini-browser-payment-help">{m.setupEmail}</Link>}
    </div>}
  </section>;
}
