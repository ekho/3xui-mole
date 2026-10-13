import {useEffect,useRef,useState,type FormEvent} from 'react';
import * as api from './api/client';
import {config} from './config';
import {text,link,errorText,type Lang} from './i18n';
import {paymentReturn} from './paymentReturn';
declare global{interface Window{__emailToken?:string}}
type AuthField='email'|'challenge'|'code'|'password'|'repeat'|'terms'|'privacy';
export function Auth({mode,lang}:{mode:'register'|'verify-email'|'login'|'forgot-password'|'reset-password'|'confirm-email-change';lang:Lang}){
 const t=text(lang);const confirm=mode==='confirm-email-change',proof=mode==='verify-email'||mode==='reset-password'||confirm,reset=mode==='reset-password',requestOnly=mode==='register'||mode==='forgot-password';const[repeat,setRepeat]=useState('');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[challenge,setChallenge]=useState('');const[code,setCode]=useState('');const[terms,setTerms]=useState(false);const[privacy,setPrivacy]=useState(false);const[token,setToken]=useState(()=>{const value=window.__emailToken;return value;});
 useEffect(()=>{delete window.__emailToken;},[]);
 const[completed,setCompleted]=useState(false);const[uncertain,setUncertain]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[success,setSuccess]=useState(false);const[cooldown,setCooldown]=useState(0);const[attempted,setAttempted]=useState(false);const pw=useRef<HTMLInputElement>(null);
 const[source]=useState(()=>{if(mode!=='register')return;const codes=new URLSearchParams(location.search).getAll('invite');return codes.length===1&&/^[A-Za-z0-9_-]{1,64}$/.test(codes[0])?codes[0]:undefined;});
 useEffect(()=>{if(mode!=='register'||!source)return;const controller=new AbortController();void api.recordCampaignVisit(source,controller.signal).catch(()=>{});return()=>controller.abort();},[mode,source]);
 useEffect(()=>{if(cooldown>0){const timer=setTimeout(()=>setCooldown(0),cooldown*1000);return()=>clearTimeout(timer);}},[cooldown]);
 const fields:Partial<Record<AuthField,string>>={};
 if(!proof&&!email.trim())fields.email=t.required;
 if(proof&&!token){if(!challenge.trim())fields.challenge=t.required;if(!code.trim())fields.code=t.required;}
 if(!requestOnly&&!confirm){if(!password)fields.password=t.required;else if(proof&&(Array.from(password).length<15||Array.from(password).length>128))fields.password=t.passwordInvalid;}
 if(reset){if(!repeat)fields.repeat=t.required;else if(password!==repeat)fields.repeat=t.passwordMismatch;}
 if(mode==='register'){if(!terms)fields.terms=t.required;if(!privacy)fields.privacy=t.required;}
 function fieldProps(field:AuthField,help?:string){const message=attempted?fields[field]:undefined;return {'aria-invalid':!!message,'aria-describedby':[help,message?field+'-error':undefined].filter(Boolean).join(' ')||undefined};}
 function fieldError(field:AuthField){return attempted&&fields[field]?<p id={field+'-error'} role="alert" className="error field-error">{fields[field]}</p>:null;}
 async function submit(event:FormEvent){event.preventDefault();if(busy||cooldown>0||uncertain)return;setError('');
  setAttempted(true);const first=Object.keys(fields)[0];if(first){event.currentTarget.querySelector<HTMLInputElement>('#'+first)?.focus();return;}setAttempted(false);
  setBusy(true);try{if(mode==='register'){const out=await api.registerAccount({email,locale:lang,accepted_terms_version:config.termsVersion,accepted_privacy_version:config.privacyVersion,...(source?{source_code:source}:{})});setChallenge(out.challenge_id);setCooldown(out.resend_after);setSuccess(true);}
   else if(mode==='forgot-password'){const out=await api.requestPasswordReset({email,locale:lang});setChallenge(out.challenge_id);setCooldown(out.resend_after);setSuccess(true);}
   else if(confirm){const out=await api.confirmEmailChange(token?{token}:{challenge_id:challenge,code});setCompleted(out.completed);setToken(undefined);setSuccess(true);}
   else if(reset){await api.completePasswordReset(token?{token,new_password:password}:{challenge_id:challenge,code,new_password:password});setToken(undefined);setPassword('');setRepeat('');setSuccess(true);}
   else if(mode==='verify-email'){await api.verifyEmail(token?{token,new_password:password}:{challenge_id:challenge,code,new_password:password});setToken(undefined);setPassword('');setSuccess(true);}
   else{await api.loginAccount({email,password});setPassword('');location.assign(paymentReturn(new URLSearchParams(location.search).get('return_to'),lang));}
  }catch(e){if(confirm&&e instanceof api.ApiError&&e.status===503){setUncertain(true);setError(t.emailConfirmUncertain);}else setError(errorText(e,lang));if(e instanceof api.ApiError&&e.status===429)setCooldown(e.retryAfter||60);pw.current?.focus();}finally{setBusy(false);}
 }
 async function resend(){if(busy||cooldown>0||!email.trim())return;setBusy(true);setError('');try{const out=await api.resendVerification({email});setCooldown(out.resend_after);if(mode==='register')setSuccess(true);}catch(e){setError(errorText(e,lang));if(e instanceof api.ApiError&&e.status===429)setCooldown(e.retryAfter||60);}finally{setBusy(false);}}
 return <section className="card auth"><p className="eyebrow">{t.cabinet}</p><h1>{confirm?t.emailConfirmPage:mode==='register'?t.register:mode==='verify-email'?t.verifyPage:reset?t.resetPassword:mode==='forgot-password'?t.forgotPassword:t.login}</h1>
  {success?<div role="status"><p className="notice">{confirm?(completed?t.emailChanged:t.emailFirstConfirmed):mode==='verify-email'?t.verified:reset?t.passwordReset:mode==='forgot-password'?t.resetAccepted:t.mailSent}</p>{requestOnly?<><p>{t.checkMail}</p><p>{t.challenge}: <code>{challenge}</code></p><a href={link(mode==='register'?'/verify-email':'/reset-password',lang)}>{t.verifyLink}</a></>:<a href={link('/login',lang)}>{t.login}</a>}</div>:null}
  {proof&&success?null:<form onSubmit={submit} noValidate aria-busy={busy} aria-describedby={error?'form-error':undefined}>
   {!proof?<><label htmlFor="email">{t.email}<input id="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required {...fieldProps('email')}/></label>{fieldError('email')}</>:null}
   {proof&&!token?<><p>{t.checkMail}</p><label htmlFor="challenge">{t.challenge}<input id="challenge" value={challenge} onChange={e=>setChallenge(e.target.value)} required {...fieldProps('challenge')}/></label>{fieldError('challenge')}<label htmlFor="code">{t.code}<input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} required {...fieldProps('code')}/></label>{fieldError('code')}</>:null}
   {!requestOnly&&!confirm?<><label htmlFor="password">{t.password}<input ref={pw} id="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required {...fieldProps('password',mode==='login'?undefined:'password-help')}/></label>{fieldError('password')}{reset?<><label htmlFor="repeat">{t.repeatPassword}<input id="repeat" type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)} required {...fieldProps('repeat')}/></label>{fieldError('repeat')}</>:null}{mode!=='login'?<p id="password-help" className="help">{t.passwordHelp}</p>:null}</>:mode==='register'?<><label className="check" htmlFor="terms"><input id="terms" type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} required {...fieldProps('terms')}/>{t.terms} <a href={config.termsURL}>{t.termsLink}</a></label>{fieldError('terms')}<label className="check" htmlFor="privacy"><input id="privacy" type="checkbox" checked={privacy} onChange={e=>setPrivacy(e.target.checked)} required {...fieldProps('privacy')}/>{t.privacy} <a href={config.privacyURL}>{t.privacyLink}</a></label>{fieldError('privacy')}</>:null}
   {error?<p id="form-error" role="alert" className="error">{error}</p>:null}
   <button className="primary" disabled={busy||cooldown>0||uncertain}>{busy?t.sending:confirm?t.confirmMailbox:requestOnly?t.continue:mode==='verify-email'?t.verify:reset?t.savePassword:t.login}</button>
   {cooldown>0?<p role="status" className="help">{t.waiting}: {cooldown} {t.seconds}</p>:null}
  </form>}
  {mode==='register'&&success?<button disabled={busy||cooldown>0} onClick={resend}>{t.resend}</button>:null}
  <nav className="auth-links"><a href={link(mode==='login'?'/register':'/login',lang)}>{mode==='login'?t.register:t.login}</a>{mode==='login'?<a href={link('/forgot-password',lang)}>{t.forgotPassword}</a>:reset?<a href={link('/forgot-password',lang)}>{t.newInstructions}</a>:null}<a href={config.supportURL}>{t.support}</a></nav>
 </section>;
}
