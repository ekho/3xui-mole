import {Link,useLocation} from 'react-router-dom';
import {link,type Lang} from './i18n';

const destinations=[
 {path:'/cabinet',ru:'Мой доступ',en:'My access',icon:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z'},
 {path:'/catalogue',ru:'Каталог',en:'Catalogue',icon:'m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4'},
 {path:'/cabinet/history',ru:'Платежи',en:'Payments',icon:'M4 8a9 9 0 1 1-1 8M4 3v5h5m3-1v6l4 2'},
 {path:'/cabinet/support',ru:'Помощь',en:'Help',icon:'M4 4h16v13H9l-5 4V4Zm4 5h8m-8 4h5'},
];

export function CustomerNavigation({lang,mini=false}:{lang:Lang;mini?:boolean}){
 const path=useLocation().pathname.replace(/^\/mini-app(?=\/|$)/,'')||'/cabinet';
 const current=path==='/catalogue'||['/cabinet/renew','/cabinet/change-plan'].includes(path)?'/catalogue':path.startsWith('/orders/')||path==='/cabinet/history'?'/cabinet/history':path==='/cabinet/support'?path:'/cabinet';
 return <nav className={'customer-nav'+(mini?' mini-nav':'')} aria-label={lang==='ru'?'Основная навигация':'Primary navigation'}>
  {destinations.map(item=><Link key={item.path} to={link(item.path,lang)} aria-current={current===item.path?'page':undefined}>
   {mini?<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={item.icon}/></svg>:null}
   <span>{item[lang]}</span>
  </Link>)}
 </nav>;
}
