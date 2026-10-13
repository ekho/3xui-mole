import type { Lang } from './i18n';

// Carry public offer choices across independent Mini App/browser sign-ins.
// Never forward arbitrary queries, launch proofs or an external destination.
export function paymentReturn(value: string | null, lang: Lang): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/cabinet' + (lang === 'en' ? '?lang=en' : '');
  let url: URL;
  try { url = new URL(value, location.origin); } catch { return '/cabinet' + (lang === 'en' ? '?lang=en' : ''); }
  if (url.origin !== location.origin || !/^\/(?:catalogue|cabinet\/(?:renew|change-plan)|orders\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/.test(url.pathname)) return '/cabinet' + (lang === 'en' ? '?lang=en' : '');
  const query = new URLSearchParams();
  if (!url.pathname.startsWith('/orders/')) {
    const plan = url.searchParams.get('plan'), period = url.searchParams.get('period'), currency = url.searchParams.get('currency');
    if (plan && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(plan)) query.set('plan', plan);
    if (period && /^[1-9]\d{0,5}$/.test(period) && Number(period) <= 106751) query.set('period', period);
    if (currency && ['RUB', 'USD', 'XTR'].includes(currency)) query.set('currency', currency);
  }
  if (lang === 'en') query.set('lang', 'en');
  return url.pathname + (query.size ? '?' + query.toString() : '');
}

export function browserPaymentLogin(returnTo: string, lang: Lang): string {
  const destination = paymentReturn(returnTo, lang);
  const query = new URLSearchParams();
  if (lang === 'en') query.set('lang', 'en');
  if (!destination.startsWith('/cabinet?') && destination !== '/cabinet') query.set('return_to', destination);
  return location.origin + '/login' + (query.size ? '?' + query.toString() : '');
}
