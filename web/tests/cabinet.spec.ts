import {test,expect,type Page} from '@playwright/test';
import type {components} from '../src/api/schema.gen';
import {readFileSync} from 'node:fs';

type Model<K extends keyof components['schemas']>=components['schemas'][K];
const account:Model<'AccountResult'>={account:{account_id:'11111111-1111-4111-8111-111111111111',email:'customer@example.test',email_verified:true,locale:'en',telegram_linked:false},csrf_token:'c'.repeat(43),capabilities:{trial_available:false}};
const subscription:Model<'Subscription'>={status:'active',expires_at:'2030-02-01T10:00:00Z',devices:2,traffic_limit_bytes:1024,traffic_used_bytes:512,traffic_remaining_bytes:512,traffic_upload_bytes:256,traffic_download_bytes:256,observed_at:'2030-01-01T10:00:00Z',data_stale:false,connection_available:true,access_profile:'regular',vpn_banned:false,access_operation_id:null,access_operation_status:null};
const order:Model<'PurchaseOrder'>={order_id:'80000000-0000-4000-8000-000000000001',action:'purchase',quote:{plan_id:'70000000-0000-4000-8000-000000000001',revision:1,devices:2,period_days:30,traffic_gb:20,profile:'regular',amount_minor:'10000',currency:'RUB'},payment_method:'yoomoney',payment_type:'AC',payment_status:'paid',fulfillment_status:'applied',created_at:'2030-01-01T10:00:00Z',expires_at:'2030-01-01T10:30:00Z',expired:true,can_pay:false,can_cancel:false,review_required:false,access_operation_id:null,checkout:null};

async function fixture(page:Page){
 await page.route('**/config.json',route=>route.fulfill({json:{...JSON.parse(readFileSync('scripts/local-public-config.json','utf8')),productName:'3xui-mole'}}));
 await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/v1/maintenance')return route.fulfill({json:{enabled:false,revision:0,changed_at:null}});
  if(path.endsWith('/me'))return route.fulfill({json:account});
  if(path.endsWith('/trial-requests/current'))return route.fulfill({json:{request:null}});
  if(path.endsWith('/subscription'))return route.fulfill({json:subscription});
  if(path.endsWith('/orders/current'))return route.fulfill({json:{order,can_purchase:false}});
  if(path==='/api/v1/notices')return route.fulfill({json:{version:'operator-notices-v1',email_enabled:false,email_available:true,page:1,per_page:20,total:1,notices:[{id:'22222222-2222-4222-8222-222222222222',revision:1,text:'Scheduled maintenance notice',html:'<b>Scheduled maintenance notice</b>',created_at:'2030-01-01T10:00:00Z'}]}});
  if(path==='/api/v1/reminders')return route.fulfill({json:{version:'reminders-v1',email_enabled:false,email_available:true,reminders:[{id:'33333333-3333-4333-8333-333333333333',kind:'expiry',threshold:1,observed_at:'2030-01-01T10:00:00Z',expires_at:subscription.expires_at,traffic_used_bytes:null,traffic_limit_bytes:null,paid_until:null,route:'renew'}]}});
  return route.fulfill({json:{}});
 });
}

for(const lang of ['ru','en'] as const){
 test('paid cabinet access does not claim to be a trial '+lang,async({page})=>{
  await fixture(page);await page.goto('/cabinet?lang='+lang);
  await expect(page.getByText(lang==='ru'?'Доступ активен':'Access active',{exact:true})).toBeVisible();
  await expect(page.getByText(lang==='ru'?'Триал активен':'Trial active',{exact:true})).toHaveCount(0);
 });

 test('mobile cabinet puts subscription actions and current limits in the first screen '+lang,async({page})=>{
  await page.setViewportSize({width:375,height:812});await fixture(page);await page.goto('/cabinet?lang='+lang);
  const navigation=page.getByRole('navigation',{name:lang==='ru'?'Действия с подпиской':'Subscription actions'});
  const connection=navigation.getByRole('link',{name:lang==='ru'?'Подключить устройство':'Connect a device',exact:true});
  const plans=navigation.getByRole('link',{name:lang==='ru'?'Тарифы':'Plans',exact:true});
  const renewal=navigation.getByRole('link',{name:lang==='ru'?'Продлить подписку':'Renew subscription',exact:true});
  await expect(navigation.getByRole('link',{name:lang==='ru'?'Текущий заказ':'Current order',exact:true})).toHaveAttribute('href','/orders/'+order.order_id+(lang==='en'?'?lang=en':''));
  for(const action of [connection,plans,renewal]){
   await expect(action).toBeInViewport({ratio:1});
   expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await expect(connection).toHaveAttribute('href','#connection-title');
  await expect(plans).toHaveAttribute('href','/catalogue'+(lang==='en'?'?lang=en':''));
  await expect(renewal).toHaveAttribute('href','/cabinet/renew'+(lang==='en'?'?lang=en':''));
  for(const label of lang==='ru'?['Действует до','Использовано','Осталось']:['Expires','Used','Remaining'])await expect(page.locator('dt').filter({hasText:new RegExp('^'+label+'$')}).locator('..')).toBeInViewport({ratio:1});
  await expect(page.getByRole('button',{name:lang==='ru'?'Показать ссылку':'Show subscription link',exact:true})).toBeInViewport({ratio:1});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await connection.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:lang==='ru'?'Подключить устройство':'Connect a device'})).toBeInViewport({ratio:1});
  const details=page.locator('details').filter({has:page.locator('summary').filter({hasText:lang==='ru'?'Подробности подписки':'Subscription details'})});
  await expect(details).not.toHaveAttribute('open','');
  await details.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(page.locator('dt').filter({hasText:new RegExp('^'+(lang==='ru'?'Устройства':'Devices')+'$')})).toBeVisible();
  const settings=page.locator('details').filter({has:page.locator('summary').filter({hasText:lang==='ru'?'Аккаунт и настройки':'Account and settings'})});
  await expect(settings).not.toHaveAttribute('open','');
  await settings.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(settings.locator('dd').filter({hasText:account.account.email!})).toBeVisible();
  await expect(page.getByText('Scheduled maintenance notice',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:lang==='ru'?'Предупреждения о подписке':'Subscription reminders'}).getByRole('listitem')).toBeVisible();
 });
}
