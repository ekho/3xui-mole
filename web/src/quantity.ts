import type {Lang} from './i18n';

const russianPlural=new Intl.PluralRules('ru');
const russianForms={device:['устройство','устройства','устройств'],day:['день','дня','дней']} as const;

export function quantityLabel(count:number,kind:'device'|'day',lang:Lang){
 if(lang==='en')return `${count} ${kind==='device'?'devices':'days'}`;
 const form=russianPlural.select(count);
 return `${count} ${russianForms[kind][form==='one'?0:form==='few'?1:2]}`;
}
