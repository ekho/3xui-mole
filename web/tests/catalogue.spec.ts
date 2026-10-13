import {test,expect,type Page,type Route} from '@playwright/test';
import type {components} from '../src/api/schema.gen';

type Model<K extends keyof components['schemas']>=components['schemas'][K];
const planId='70000000-0000-4000-8000-000000000001';
const operatorId='10000000-0000-4000-8000-000000000001';
const prices:Model<'CataloguePrice'>[]=[
 {period_days:30,currency:'RUB',amount_minor:'9007199254740993'},
 {period_days:30,currency:'USD',amount_minor:'12345'},
 {period_days:30,currency:'XTR',amount_minor:'0'},
 {period_days:90,currency:'RUB',amount_minor:'0'},
 {period_days:90,currency:'USD',amount_minor:'20000'},
 {period_days:90,currency:'XTR',amount_minor:'30'},
];
const plan:Model<'CataloguePlanSnapshot'>={plan_id:planId,revision:1,devices:2,traffic_gb:0,profile:'regular',hidden:false,periods:[30,90],prices};
const operatorPlan:Model<'OperatorCataloguePlan'>={...plan,legacy_plan_id:null,archived:false,actor_account_id:operatorId,source:'operator',changed_at:'2026-10-02T10:00:00Z',reason:'Initial terms'};
const session={account:{account_id:operatorId,email:'operator@example.test',email_verified:true,locale:'en',telegram_linked:false},csrf_token:'s'.repeat(43)};

async function routes(page:Page,extra?:(route:Route,path:string)=>Promise<boolean>){await page.route('**/api/v1/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(extra&&await extra(route,path))return;
 if(path.endsWith('/operator/session'))return route.fulfill({json:session});
 if(path.endsWith('/operator/catalogue'))return route.fulfill({json:{plans:[operatorPlan],total:1,page:1,per_page:50}});
 if(path.endsWith('/catalogue'))return route.fulfill({json:{plans:[plan]}});
 return route.fulfill({json:{}});
});}

test('UX: customer compares exact prices and periods before selecting a plan',async({page})=>{
 const zeroPlan={...plan,plan_id:'70000000-0000-4000-8000-000000000002',devices:5,periods:[90],prices:[{period_days:90,currency:'RUB',amount_minor:'0'}]};
 await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')){await route.fulfill({json:{plans:[plan,zeroPlan]}});return true;}return false;});
 await page.goto('/catalogue?lang=en');const cards=page.getByRole('article');
 await expect(cards.nth(0)).toContainText('90,071,992,547,409.93 RUB');await expect(cards.nth(0)).toContainText('30 days');
 await expect(cards.nth(1)).toContainText('0.00 RUB');await expect(cards.nth(1)).toContainText('90 days');
 await expect(page.getByRole('region',{name:'Selected offer'})).toHaveCount(0);
});

test('UX: selecting a plan moves keyboard focus to the selected offer',async({page})=>{
 await routes(page);await page.goto('/catalogue?lang=en');const select=page.getByRole('button',{name:'Select plan'});
 await select.focus();await page.keyboard.press('Enter');await expect(select).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('heading',{name:'Selected offer',exact:true})).toBeFocused();
 await select.focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Selected offer',exact:true})).toBeFocused();
});

test('UX: currency and period choices require both a price and an applicable payment method',async({page})=>{
 const sparse={...plan,periods:[30,60,90],prices:[{period_days:30,currency:'USD',amount_minor:'1200'},{period_days:60,currency:'RUB',amount_minor:'12345'},{period_days:90,currency:'XTR',amount_minor:'100'}]};
 await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')){await route.fulfill({json:{plans:[sparse]}});return true;}if(path.endsWith('/payment-methods')){await route.fulfill({json:{methods:[{id:'yoomoney',currency:'RUB'},{id:'telegram_stars',currency:'XTR'}]}});return true;}return false;});
 await page.goto('/catalogue?lang=en');await page.getByRole('button',{name:'Select plan'}).click();const chosen=page.getByRole('region',{name:'Selected offer'});
 await expect(chosen.getByLabel('Currency').locator('option')).toHaveText(['RUB']);await expect(chosen.getByLabel('Period').locator('option')).toHaveText(['60 days']);
 await expect(chosen.getByLabel('Period')).toHaveValue('60');await expect(chosen.getByText('Price: 123.45 RUB',{exact:true})).toBeVisible();await expect(chosen.getByRole('button',{name:'Buy plan'})).toBeEnabled();
});

for(const lang of ['en','ru'] as const)test('UX: a genuinely unpayable plan keeps its price and explains unavailable payment '+lang,async({page})=>{
 await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')){await route.fulfill({json:{plans:[{...plan,prices:prices.filter(price=>price.currency==='RUB')}]}});return true;}if(path.endsWith('/payment-methods')){await route.fulfill({json:{methods:[{id:'cryptomus',currency:'USD'}]}});return true;}return false;});
 await page.goto('/catalogue?lang='+lang);await page.getByRole('button',{name:lang==='en'?'Select plan':'Выбрать тариф'}).click();
 const chosen=page.getByRole('region',{name:lang==='en'?'Selected offer':'Выбранное предложение'});
 await expect(chosen.getByLabel(lang==='en'?'Currency':'Валюта')).toHaveValue('RUB');await expect(chosen.getByLabel(lang==='en'?'Period':'Период')).toHaveValue('30');
 await expect(chosen.getByText(lang==='en'?'No payment method is available for this plan.':'Для этого тарифа сейчас нет доступного способа оплаты.')).toBeVisible();
 await expect(chosen.getByRole('button',{name:lang==='en'?'Buy plan':'Купить тариф'})).toHaveCount(0);await expect(chosen.getByText(lang==='en'?'No data':'Нет данных',{exact:false})).toHaveCount(0);
});

test('UX: refreshing a snapshot repairs removed currency and period prices together',async({page})=>{
 let latest={...plan,prices:[{period_days:30,currency:'RUB',amount_minor:'100'},{period_days:90,currency:'USD',amount_minor:'500'}]};
 await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')){await route.fulfill({json:{plans:[latest]}});return true;}if(path.endsWith('/payment-methods')){await route.fulfill({json:{methods:[{id:'yoomoney',currency:'RUB'},{id:'cryptomus',currency:'USD'}]}});return true;}return false;});
 await page.goto('/catalogue?lang=en');await page.getByRole('button',{name:'Select plan'}).click();await page.getByLabel('Currency').selectOption('USD');await expect(page.getByLabel('Period')).toHaveValue('90');
 latest={...latest,revision:2,prices:[{period_days:30,currency:'RUB',amount_minor:'200'}]};await page.getByRole('button',{name:'RU',exact:true}).click();
 await expect(page.getByLabel('Валюта')).toHaveValue('RUB');await expect(page.getByLabel('Период')).toHaveValue('30');await expect(page.getByRole('radio',{name:'Банковская карта',exact:true})).toBeChecked();
 await expect(page.getByRole('region',{name:'Выбранное предложение'}).getByText('Цена: 2,00 RUB',{exact:true})).toBeVisible();
});

test('UX: retry retains the selected snapshot while methods resolve before offers',async({page})=>{
 let catalogueReads=0,methodReads=0,orderReads=0,releaseOffers!:()=>void,methodsReady!:()=>void;
 const offersGate=new Promise<void>(resolve=>releaseOffers=resolve),methodGate=new Promise<void>(resolve=>methodsReady=resolve);
 const oldOrder:Model<'PurchaseOrder'>={order_id:'80000000-0000-4000-8000-000000000001',action:'purchase',quote:{plan_id:planId,revision:1,devices:2,period_days:30,traffic_gb:0,profile:'regular',amount_minor:'100',currency:'RUB'},payment_method:'yoomoney',payment_type:'AC',payment_status:'canceled',fulfillment_status:'not_started',created_at:'2026-10-01T10:00:00Z',expires_at:'2026-10-01T10:30:00Z',expired:true,can_pay:false,can_cancel:false,review_required:false,access_operation_id:null,checkout:null};
 await routes(page,async(route,path)=>{
  if(path.endsWith('/catalogue')){catalogueReads++;if(catalogueReads>1)await offersGate;await route.fulfill({json:{plans:[plan]}});return true;}
  if(path.endsWith('/payment-methods')){methodReads++;if(methodReads===1)await route.fulfill({status:503,json:{error:{code:'SERVICE_UNAVAILABLE'}}});else{await route.fulfill({json:{methods:[{id:'yoomoney',currency:'RUB'}]}});methodsReady();}return true;}
  if(path.endsWith('/orders/current')){orderReads++;if(orderReads>1)await methodGate;await route.fulfill({json:{order:orderReads>1?oldOrder:null}});return true;}return false;
 });
 await page.goto('/catalogue?lang=en');await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Select plan'}).click();await page.getByLabel('Period').selectOption('90');await page.getByRole('button',{name:'Retry',exact:true}).click();
 try{await expect(page.getByRole('link',{name:'Current order',exact:true})).toBeVisible();}finally{releaseOffers();}
 const chosen=page.getByRole('region',{name:'Selected offer'});await expect(chosen).toBeVisible();await expect(chosen.getByLabel('Period')).toHaveValue('90');await expect(chosen.getByText('Price: 0.00 RUB',{exact:true})).toBeVisible();
});

test('UX: Russian device and day quantities use correct singular, plural and teen endings',async({page})=>{
 const quantities:[number,string,string][]=[[1,'1 устройство','1 день'],[2,'2 устройства','2 дня'],[5,'5 устройств','5 дней'],[11,'11 устройств','11 дней'],[12,'12 устройств','12 дней'],[14,'14 устройств','14 дней'],[21,'21 устройство','21 день'],[22,'22 устройства','22 дня'],[25,'25 устройств','25 дней'],[111,'111 устройств','111 дней'],[112,'112 устройств','112 дней'],[114,'114 устройств','114 дней']];
 const plans=quantities.map(([count])=>({...plan,plan_id:'70000000-0000-4000-8000-'+String(count).padStart(12,'0'),devices:count,periods:[count],prices:[{period_days:count,currency:'RUB',amount_minor:'100'}]}));
 await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')){await route.fulfill({json:{plans}});return true;}return false;});await page.goto('/catalogue');
 for(const [count,devices,days] of quantities){const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:devices,exact:true})});await expect(card).toBeVisible();await expect(card).toContainText(days);await card.getByRole('button',{name:'Выбрать тариф'}).click();const chosen=page.getByRole('region',{name:'Выбранное предложение'});await expect(chosen.getByText(devices,{exact:true})).toBeVisible();await expect(chosen.getByLabel('Период').locator('option')).toHaveText([days]);await expect(chosen.getByLabel('Период')).toHaveValue(String(count));}
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByRole('heading',{name:'1 devices',exact:true})).toBeVisible();await page.getByRole('article').filter({has:page.getByRole('heading',{name:'1 devices',exact:true})}).getByRole('button',{name:'Select plan'}).click();await expect(page.getByLabel('Period').locator('option')).toHaveText(['1 days']);
});

test('customer chooses a server snapshot with exact large and zero prices, without a payment action',async({page})=>{
 await routes(page);await page.goto('/catalogue?lang=en');await expect(page.getByRole('heading',{name:'Plans'})).toBeVisible();
 await page.getByRole('button',{name:'Select plan'}).click();const chosen=page.getByRole('region',{name:'Selected offer'});await expect(chosen.getByText('2 devices')).toBeVisible();await expect(chosen.getByText('Unlimited traffic')).toBeVisible();
 await page.getByLabel('Period').selectOption('30');await page.getByLabel('Currency').selectOption('RUB');await expect(chosen.getByText('90,071,992,547,409.93 RUB')).toBeVisible();
 await page.getByLabel('Currency').selectOption('XTR');await expect(chosen.getByText('0 XTR')).toBeVisible();await expect(page.getByRole('button',{name:/pay|checkout|buy/i})).toHaveCount(0);
 await expect(page.getByText('Revision',{exact:true})).toHaveCount(0);
});

test('customer refresh resets a removed period to a valid current price',async({page})=>{
 let latest=plan;await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')&&!path.includes('/operator/')){await route.fulfill({json:{plans:[latest]}});return true;}return false;});
 await page.goto('/catalogue?lang=en');await page.getByRole('button',{name:'Select plan'}).click();await page.getByLabel('Period').selectOption('90');await expect(page.getByRole('region',{name:'Selected offer'}).getByText('0.00 RUB')).toBeVisible();
 latest={...plan,revision:2,periods:[30],prices:prices.filter(price=>price.period_days===30)};await page.getByRole('button',{name:'RU',exact:true}).click();await expect(page.getByLabel('Период')).toHaveValue('30');await expect(page.getByRole('region',{name:'Выбранное предложение'}).getByText(/90.071.992.547.409,93 RUB/)).toBeVisible();await expect(page.getByText('Неизвестно')).toHaveCount(0);
});

test('customer catalogue shows empty, error, retry and a mobile Russian keyboard path',async({page})=>{
 let reads=0;await page.setViewportSize({width:375,height:812});await routes(page,async(route,path)=>{if(path.endsWith('/catalogue')&&!path.includes('/operator/')){reads++;if(reads===1)await route.fulfill({status:503,json:{error:{code:'SERVICE_UNAVAILABLE'}}});else if(reads===2)await route.fulfill({json:{plans:[]}});else await route.fulfill({json:{plans:[plan]}});return true;}return false;});
 await page.goto('/catalogue');await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Повторить'}).click();await expect(page.getByText('Тарифов пока нет.')).toBeVisible();
 await page.getByRole('button',{name:'Повторить'}).click();const select=page.getByRole('button',{name:'Выбрать тариф'});await select.focus();await expect(select).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByLabel('Период')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('operator creates with exact decimal strings and retries a lost response using one key',async({page})=>{
 const requests:{body:Model<'CataloguePlanCreateInput'>;key:string;csrf:string}[]=[];let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue/plans')){requests.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key'],csrf:route.request().headers()['x-csrf-token']});if(requests.length===1){await route.abort();return true;}await pending;await route.fulfill({status:201,json:operatorPlan});return true;}return false;});
 await page.setViewportSize({width:375,height:812});await page.goto('/admin/catalogue?lang=en');await expect(page.getByRole('heading',{name:'Plans'})).toBeVisible();
 await page.getByRole('button',{name:'New plan'}).click();await page.getByLabel('Devices').fill('2');await page.getByLabel('Traffic (GB)').fill('0');await page.getByLabel('Period days').fill('30');
 await page.getByLabel('RUB').fill('90071992547409.93');await page.getByLabel('USD').fill('123.45');await page.getByLabel('XTR').fill('0');await page.getByLabel('Reason').fill('Initial terms');
 await page.getByRole('button',{name:'Create plan'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('Reason')).toHaveValue('Initial terms');
 await page.getByRole('button',{name:'Create plan'}).click();await expect.poll(()=>requests.length).toBe(2);
 try{await expect(page.getByLabel('Reason')).toBeDisabled();await expect(page.getByRole('button',{name:'Create plan'})).toBeDisabled();}finally{release();}
 expect(requests[1].body).toEqual(requests[0].body);expect(requests[0].body).toEqual({terms:{devices:2,traffic_gb:0,profile:'regular',hidden:false,periods:[30],prices:[{period_days:30,currency:'RUB',amount_minor:'9007199254740993'},{period_days:30,currency:'USD',amount_minor:'12345'},{period_days:30,currency:'XTR',amount_minor:'0'}]},reason:'Initial terms'});
 expect(requests[0].key).toBe(requests[1].key);expect(requests[0].key).toMatch(/^[0-9a-f-]{36}$/i);expect(requests[0].csrf).toBe('s'.repeat(43));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('operator preserves draft on stale revision and confirms archive; last visible conflict stays visible',async({page})=>{
 let current=operatorPlan,revisionCalls=0,archiveCalls=0;const writes:{revision?:Model<'CataloguePlanRevisionInput'>;archive?:Model<'CataloguePlanArchiveInput'>}={};
 await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue')){await route.fulfill({json:{plans:[current],total:1,page:1,per_page:50}});return true;}if(path.endsWith('/revision')){revisionCalls++;writes.revision=route.request().postDataJSON();if(revisionCalls===1){current={...current,revision:2};await route.fulfill({status:409,json:{error:{code:'CATALOGUE_REVISION_CONFLICT'}}});}else{current={...current,revision:3,devices:3,reason:'Changed terms'};await route.fulfill({json:current});}return true;}if(path.endsWith('/archive')){archiveCalls++;writes.archive=route.request().postDataJSON();await route.fulfill({status:409,json:{error:{code:'CATALOGUE_LAST_VISIBLE'}}});return true;}return false;});
 await page.goto('/admin/catalogue?lang=en');await page.getByRole('button',{name:'Edit plan'}).click();await expect(page.getByLabel('RUB').first()).toHaveValue('90071992547409.93');await page.getByLabel('Devices').fill('3');await page.getByLabel('Reason').fill('Changed terms');
 await page.getByRole('button',{name:'Save revision'}).click();await expect(page.getByRole('alert')).toContainText('changed');await expect(page.getByLabel('Devices')).toHaveValue('3');await expect(page.getByLabel('Reason')).toHaveValue('Changed terms');
 expect(writes.revision?.expected_revision).toBe(1);expect(writes.revision?.terms.prices[0].amount_minor).toBe('9007199254740993');
 await page.getByRole('button',{name:'Reload catalogue'}).click();await expect(page.getByText('Revision 2',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Save revision'}).click();await expect(page.getByText('Plan saved.')).toBeVisible();expect(revisionCalls).toBe(2);expect(writes.revision?.expected_revision).toBe(2);
 await page.getByRole('button',{name:'Edit plan'}).click();await page.getByLabel('Reason').fill('Archive now');await page.getByRole('button',{name:'Archive plan'}).click();await expect(page.getByText('The plan will leave selection. Previous revisions remain available.')).toBeVisible();expect(archiveCalls).toBe(0);
 await page.getByRole('button',{name:'Confirm archive'}).click();await expect(page.getByRole('alert')).toContainText('last visible');expect(archiveCalls).toBe(1);expect(writes.archive).toEqual({expected_revision:3,reason:'Archive now'});
});

test('operator keeps opened revision through ordinary list reload and explicitly accepts current terms after conflict',async({page})=>{
 let current=operatorPlan,submitted=0,expected=0;await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue')){await route.fulfill({json:{plans:[current],total:1,page:1,per_page:50}});return true;}if(path.endsWith('/revision')){submitted++;expected=route.request().postDataJSON().expected_revision;await route.fulfill({status:409,json:{error:{code:'CATALOGUE_REVISION_CONFLICT'}}});return true;}return false;});
 await page.goto('/admin/catalogue');await page.getByRole('button',{name:'Изменить тариф'}).click();await page.getByLabel('Устройства').fill('3');await page.getByLabel('Причина').fill('Keep this reason');
 current={...current,revision:2,devices:4,prices:current.prices.map(price=>price.period_days===30&&price.currency==='RUB'?{...price,amount_minor:'321'}:price)};
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByRole('heading',{name:'Plans'})).toBeVisible();await expect(page.getByText('Revision 1',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save revision'}).click();await expect(page.getByRole('alert')).toContainText('changed');expect(submitted).toBe(1);expect(expected).toBe(1);
 await page.getByRole('button',{name:'Reload catalogue'}).click();await expect(page.getByText('Revision 2',{exact:true})).toBeVisible();await expect(page.getByLabel('Devices')).toHaveValue('4');await expect(page.getByLabel('RUB').first()).toHaveValue('3.21');await expect(page.getByLabel('Reason')).toHaveValue('Keep this reason');
});

test('operator rejects malformed prices and incomplete matrices before any write',async({page})=>{
 let writes=0;await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue/plans'))writes++;return false;});await page.goto('/admin/catalogue?lang=en');await page.getByRole('button',{name:'New plan'}).click();
 await page.getByLabel('Devices').fill('2');await page.getByLabel('Traffic (GB)').fill('0');await page.getByLabel('Period days').fill('30');await page.getByLabel('RUB').fill('1.00');await page.getByLabel('USD').fill('0');await page.getByLabel('Reason').fill('Check invalid price');
 await page.getByRole('button',{name:'Create plan'}).click();await expect(page.getByRole('alert')).toBeFocused();await expect(page.locator('form.catalogue-form')).toHaveAttribute('aria-describedby','catalogue-form-error');expect(writes).toBe(0);
 await page.getByLabel('XTR').fill('1.5');await page.getByRole('button',{name:'Create plan'}).click();await expect(page.getByRole('alert')).toBeVisible();expect(writes).toBe(0);
 await page.getByLabel('XTR').fill('1');await page.getByLabel('RUB').fill('92233720368547758.08');await page.getByRole('button',{name:'Create plan'}).click();await expect(page.getByRole('alert')).toBeVisible();expect(writes).toBe(0);
 await page.getByLabel('RUB').fill('1.00');await page.getByRole('button',{name:'Add period'}).click();await page.getByLabel('Period days').last().fill('30');await page.getByLabel('RUB').last().fill('1.00');await page.getByLabel('USD').last().fill('0');await page.getByLabel('XTR').last().fill('1');await page.getByRole('button',{name:'Create plan'}).click();await expect(page.getByRole('alert')).toBeVisible();expect(writes).toBe(0);
});

test('operator archives a plan after confirmation and refreshes the list',async({page})=>{
 let archived=false,calls=0;await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue')){await route.fulfill({json:{plans:[{...operatorPlan,archived}],total:1,page:1,per_page:50}});return true;}if(path.endsWith('/archive')){calls++;await route.fulfill({json:{...operatorPlan,archived:true,revision:2}});archived=true;return true;}return false;});
 await page.goto('/admin/catalogue?lang=en');await page.getByRole('button',{name:'Edit plan'}).click();await page.getByLabel('Reason').fill('Retired');await page.getByRole('button',{name:'Archive plan'}).click();expect(calls).toBe(0);await page.getByRole('button',{name:'Confirm archive'}).click();await expect(page.getByText('Plan archived.')).toBeVisible();await expect(page.getByText(/Archived plan/)).toBeVisible();expect(calls).toBe(1);
});

test('operator can create hidden unlimited without inventing prices',async({page})=>{
 let body:Model<'CataloguePlanCreateInput'>|undefined;await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue/plans')){body=route.request().postDataJSON();await route.fulfill({status:201,json:{...operatorPlan,profile:'unlimited',hidden:true,periods:[],prices:[]}});return true;}return false;});
 await page.goto('/admin/catalogue?lang=en');await page.getByRole('button',{name:'New plan'}).click();await page.getByLabel('Devices').fill('5');await page.getByLabel('Traffic (GB)').fill('0');await page.getByLabel('Access profile').selectOption('unlimited');await page.getByLabel('Reason').fill('Private unlimited');
 await page.getByRole('button',{name:'Create plan'}).click();await expect(page.getByText('Plan saved.')).toBeVisible();expect(body).toEqual({terms:{devices:5,traffic_gb:0,profile:'unlimited',hidden:true,periods:[],prices:[]},reason:'Private unlimited'});
});

test('operator catalogue shows read error, retry and empty state',async({page})=>{
 let reads=0;await routes(page,async(route,path)=>{if(path.endsWith('/operator/catalogue')){reads++;if(reads===1)await route.fulfill({status:503,json:{error:{code:'SERVICE_UNAVAILABLE'}}});else await route.fulfill({json:{plans:[],total:0,page:1,per_page:50}});return true;}return false;});
 await page.goto('/admin/catalogue?lang=en');await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Retry'}).click();await expect(page.getByText('No plans yet.')).toBeVisible();await expect(page.getByRole('button',{name:'New plan'})).toBeVisible();expect(reads).toBe(2);
});

test('revoked operator sees no catalogue editor or catalogue API request',async({page})=>{
 let reads=0;await routes(page,async(route,path)=>{if(path.endsWith('/operator/session')){await route.fulfill({status:403,json:{error:{code:'INVALID_CREDENTIALS'}}});return true;}if(path.endsWith('/operator/catalogue'))reads++;return false;});
 await page.goto('/admin/catalogue?lang=en');await expect(page.getByRole('heading',{name:'Operator access required'})).toBeVisible();await expect(page.getByRole('button',{name:'Create plan'})).toHaveCount(0);expect(reads).toBe(0);
});
