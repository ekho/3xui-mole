import {test, expect, type Page} from '@playwright/test';
import type {components} from '../src/api/schema.gen';

type Model<K extends keyof components['schemas']> = components['schemas'][K];
const account: Model<'AccountResult'> = {
  account: {account_id:'b496e45c-4e80-47d6-a868-e3c1da4e4f35',email:'client@example.test',email_verified:true,locale:'en',telegram_linked:false},
  csrf_token:'s'.repeat(43),capabilities:{trial_available:true},
};
const subscription: Model<'Subscription'> = {status:'none',devices:0,traffic_limit_bytes:0,traffic_used_bytes:null,observed_at:null,data_stale:true,expires_at:null,access_profile:'unknown',vpn_banned:false,access_operation_id:null,access_operation_status:null};
const plan: Model<'CataloguePlanSnapshot'> = {plan_id:'70000000-0000-4000-8000-000000000001',revision:1,devices:2,traffic_gb:20,profile:'regular',hidden:false,periods:[30],prices:[{period_days:30,currency:'RUB',amount_minor:'12345'}]};
const order: Model<'PurchaseOrder'> = {order_id:'80000000-0000-4000-8000-000000000001',action:'purchase',quote:{plan_id:plan.plan_id,revision:1,devices:2,period_days:30,traffic_gb:20,profile:'regular',amount_minor:'12345',currency:'RUB'},payment_method:'yoomoney',payment_type:'AC',payment_status:'pending',fulfillment_status:'not_started',created_at:'2026-10-12T00:00:00Z',expires_at:'2099-10-12T00:30:00Z',expired:false,can_pay:false,can_cancel:true,review_required:false,access_operation_id:null,checkout:null};

async function mock(page: Page) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/me') ? account
      : path.endsWith('/auth/session') ? {csrf_token:account.csrf_token}
      : path.endsWith('/trial-requests/current') ? {request:null}
      : path.endsWith('/subscription') ? subscription
      : path.endsWith('/catalogue') ? {plans:[plan]}
      : path.endsWith('/payment-methods') ? {methods:[{id:'yoomoney',currency:'RUB'}]}
      : path.endsWith('/orders/current') ? {order:null}
      : path.endsWith('/orders') || path.endsWith('/orders/'+order.order_id) ? order
      : path.endsWith('/reminders') ? {version:'reminders-v1',email_enabled:false,email_available:true,reminders:[]}
      : path.endsWith('/notices') ? {version:'operator-notices-v1',email_enabled:false,email_available:true,notices:[],total:0,page:1,per_page:20}
      : path.endsWith('/support') ? {conversation:null,messages:[],has_more:false,oldest_sequence:null}
      : path.endsWith('/maintenance') ? {enabled:false,revision:0,changed_at:null}
      : {};
    return route.fulfill({status:path.endsWith('/orders') && route.request().method()==='POST'?201:200,json:body});
  });
}

async function markDocument(page: Page) {
  await page.evaluate(() => {Object.defineProperty(window, '__navigationMarker', {value:'original-document'});});
}
async function expectSameDocument(page: Page) {
  expect(await page.evaluate(() => Reflect.get(window, '__navigationMarker'))).toBe('original-document');
}

test('customer links and browser history preserve the document and language', async ({page}) => {
  await mock(page);
  await page.goto('/cabinet?lang=en');
  await expect(page.getByRole('button', {name:'Request trial'})).toBeVisible();
  await markDocument(page);
  await page.locator('a[href="/catalogue?lang=en"]').first().click();
  await expect(page.getByRole('heading', {name:'Plans',exact:true})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Plans',exact:true})).toBeFocused();
  await expectSameDocument(page);
  await page.goBack();
  await expect(page.getByRole('button', {name:'Request trial'})).toBeVisible();
  await expectSameDocument(page);
  await page.goForward();
  await expect(page.getByRole('heading', {name:'Plans',exact:true})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Plans',exact:true})).toBeFocused();
  await expectSameDocument(page);
});

test('a confirmed purchase changes route without a document reload', async ({page}) => {
  await mock(page);
  await page.goto('/catalogue?lang=en');
  await page.getByRole('button', {name:'Select plan'}).click();
  await page.getByRole('button', {name:'Buy plan',exact:true}).click();
  await markDocument(page);
  await page.getByRole('button', {name:'Confirm purchase'}).click();
  await expect(page).toHaveURL('/orders/'+order.order_id+'?lang=en');
  await expect(page.getByRole('heading', {name:'Order',exact:true})).toBeVisible();
  await expectSameDocument(page);
});

test('language selection survives reload and retains unrelated URL parameters', async ({page}) => {
  await mock(page);
  await page.goto('/cabinet?platform=android');
  await page.getByRole('button', {name:'EN',exact:true}).click();
  await expect(page).toHaveURL('/cabinet?platform=android&lang=en');
  await page.reload();
  await expect(page.getByRole('button', {name:'Request trial'})).toBeVisible();
  await page.getByRole('button', {name:'RU',exact:true}).click();
  await expect(page).toHaveURL('/cabinet?platform=android');
  await expect(page.getByRole('button', {name:'Запросить триал'})).toBeVisible();
});

for(const path of ['/unknown','/orders/not-a-uuid','/Catalogue','/catalogue/']){
 test('unknown customer route keeps the sign-in fallback '+path,async({page})=>{
  await mock(page);await page.goto(path+'?lang=en');
  await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 });
}


test('leaving a pending purchase does not navigate after a late response',async({page})=>{
 await mock(page);let started=false,release!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/orders',async route=>{started=true;await hold;await route.fulfill({status:201,json:order});});
 try{
  await page.goto('/catalogue?lang=en');await page.getByRole('button',{name:'Select plan'}).click();
  await page.getByRole('button',{name:'Buy plan',exact:true}).click();
  await page.getByRole('button',{name:'Confirm purchase'}).click();await expect.poll(()=>started).toBe(true);
  await page.getByRole('link',{name:'Back to account',exact:true}).click();
  await expect(page.getByRole('button',{name:'Request trial'})).toBeVisible();
  release();await page.waitForTimeout(250);await expect(page).toHaveURL('/cabinet?lang=en');
 }finally{release();}
});
