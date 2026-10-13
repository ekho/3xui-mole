import { test, expect } from '@playwright/test';

test('admin uses fresh document nonces for its actual Emotion styles', async ({ page, request }) => {
  const first = await request.get('/admin/clients?lang=en');
  const firstHTML = await first.text();
  const nonce = firstHTML.match(/property="csp-nonce" nonce="([^"]+)"/)?.[1];
  expect(nonce).toMatch(/^[A-Za-z0-9+/=_-]{24,}$/);
  const second = await request.get('/admin/clients?lang=en');
  expect((await second.text()).match(/property="csp-nonce" nonce="([^"]+)"/)?.[1]).not.toBe(nonce);
  expect(firstHTML).not.toMatch(/unsafe-inline|unsafe-eval|\{\{/);

  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/operator/session')) return route.fulfill({ json: {
      account: { account_id: '10000000-0000-4000-8000-000000000001', email: 'operator@example.test', email_verified: true, locale: 'en', telegram_linked: false },
      csrf_token: 's'.repeat(43),
    } });
    if (path.endsWith('/operator/clients/search')) return route.fulfill({ json: { clients: [], total: 0, page: 1, per_page: 50 } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin/clients?lang=en');
  await expect(page.getByLabel('Search clients')).toBeVisible();
  const styled = await page.evaluate(() => {
    const nonce = document.querySelector<HTMLElement>('meta[property="csp-nonce"]')?.nonce;
    const styles = [...document.querySelectorAll<HTMLStyleElement>('style[data-emotion]')];
    const bar = document.querySelector('.MuiAppBar-root');
    return { nonce, styleNonces: styles.map(style => style.nonce), rules: styles.reduce((count, style) => count + (style.sheet?.cssRules.length ?? 0), 0), barPosition: bar && getComputedStyle(bar).position, icons: [...document.querySelectorAll('.MuiAppBar-root .MuiSvgIcon-root')].map(icon => icon.getBoundingClientRect().width) };
  });
  expect(styled.nonce).toBeTruthy();
  expect(styled.styleNonces.length).toBeGreaterThan(0);
  expect(styled.styleNonces.every(value => value === styled.nonce)).toBe(true);
  expect(styled.rules).toBeGreaterThan(0);
  expect(styled.barPosition).toBe('sticky');
  expect(styled.icons.every(width => width > 0 && width <= 40)).toBe(true);
  expect(errors).toEqual([]);
});

for(const currency of ['XTR','USD'])test('browser restores the saved period across sparse payment currencies '+currency,async({page})=>{
  const planId='50000000-0000-4000-8000-000000000001';
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/maintenance'))return route.fulfill({json:{enabled:false,revision:0,changed_at:null}});
    if(path.endsWith('/catalogue'))return route.fulfill({json:{plans:[{plan_id:planId,revision:3,devices:2,traffic_gb:20,profile:'regular',hidden:false,periods:[30,90],prices:[{period_days:30,currency:'RUB',amount_minor:'19900'},{period_days:90,currency:'USD',amount_minor:'3490'},{period_days:90,currency:'XTR',amount_minor:'180'}]}]}});
    if(path.endsWith('/payment-methods'))return route.fulfill({json:{methods:[{id:'yoomoney',currency:'RUB'},{id:'cryptomus',currency:'USD'}]}});
    if(path.endsWith('/orders/current'))return route.fulfill({json:{order:null,can_purchase:true}});
    return route.fulfill({json:{}});
  });
  await page.goto('/catalogue?plan='+planId+'&period=90&currency='+currency+'&lang=en');
  const selected=page.getByRole('region',{name:'Selected offer'});
  await expect(selected.getByRole('combobox',{name:'Period',exact:true})).toHaveValue('90');
  await expect(selected.getByRole('combobox',{name:'Currency',exact:true})).toHaveValue('USD');
  await expect(selected.getByRole('radio',{name:'Cryptomus',exact:true})).toBeChecked();
  await expect(selected.getByText('Price: 34.90 USD',{exact:true})).toBeVisible();
});

for(const mode of ['light','dark'] as const)test('admin custom cards retain readable text in '+mode+' theme',async({page})=>{
  await page.emulateMedia({colorScheme:mode});
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/operator/session'))return route.fulfill({json:{account:{account_id:'10000000-0000-4000-8000-000000000001',email:'operator@example.test',email_verified:true,locale:'en',telegram_linked:false},csrf_token:'s'.repeat(43)}});
    if(path.endsWith('/operator/clients/search'))return route.fulfill({json:{clients:[{account_id:'20000000-0000-4000-8000-000000000001',kind:'web',display_name:'',email:'customer@example.test',telegram_id:null,locale:'en',created_at:null,restricted:false,vpn_banned:false,had_subscription:true}],total:1,page:1,per_page:50}});
    return route.fulfill({json:{}});
  });
  await page.goto('/admin/clients?lang=en');await expect(page.getByRole('heading',{name:'customer@example.test',exact:true})).toBeVisible();
  const ratios=await page.locator('.admin-client dl div').evaluateAll(tiles=>{
    const luminance=(value:string)=>{const channels=value.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(Number).map(channel=>{const s=channel/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
    return tiles.map(tile=>{const a=luminance(getComputedStyle(tile.querySelector('dd')!).color),b=luminance(getComputedStyle(tile).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  });
  expect(ratios.length).toBeGreaterThan(0);expect(ratios.every(ratio=>ratio>=4.5)).toBe(true);
});

for(const destination of ['/catalogue?plan=50000000-0000-4000-8000-000000000001&period=30&currency=XTR&token=private-query','//attacker.example.test/pay','/admin/clients','https://attacker.example.test/pay','/Catalogue','/\\[invalid'])test('browser sign-in returns only to an allowed public payment context '+destination,async({page})=>{
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/maintenance'))return route.fulfill({json:{enabled:false,revision:0,changed_at:null}});
    if(path.endsWith('/auth/login'))return route.fulfill({json:{csrf_token:'s'.repeat(43)}});
    return route.fulfill({json:{}});
  });
  await page.goto('/login?lang=en&return_to='+encodeURIComponent(destination));
  await page.getByLabel('Email',{exact:true}).fill('browser@example.test');
  await page.getByLabel('Password',{exact:true}).fill('existing-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(destination.startsWith('/catalogue?')?/\/catalogue\?plan=50000000-0000-4000-8000-000000000001&period=30&currency=XTR&lang=en$/:/\/cabinet\?lang=en$/);
});

for(const period of [60,7300])test('browser catalogue restores a Mini App plan and period using its available payment currency '+period,async({page})=>{
  const planId='50000000-0000-4000-8000-000000000001';
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/maintenance'))return route.fulfill({json:{enabled:false,revision:0,changed_at:null}});
    if(path.endsWith('/catalogue'))return route.fulfill({json:{plans:[{plan_id:planId,revision:3,devices:2,traffic_gb:20,profile:'regular',hidden:false,periods:[30,period],prices:[{period_days:30,currency:'RUB',amount_minor:'19900'},{period_days:period,currency:'RUB',amount_minor:'34900'},{period_days:30,currency:'XTR',amount_minor:'100'},{period_days:period,currency:'XTR',amount_minor:'180'}]}]}});
    if(path.endsWith('/payment-methods'))return route.fulfill({json:{methods:[{id:'yoomoney',currency:'RUB'}]}});
    if(path.endsWith('/orders/current'))return route.fulfill({json:{order:null,can_purchase:true}});
    return route.fulfill({json:{}});
  });
  await page.goto('/catalogue?plan='+planId+'&period='+period+'&currency=XTR&lang=en');
  await expect(page.getByRole('button',{name:'Select plan',exact:true})).toHaveAttribute('aria-pressed','true');
  const selected=page.getByRole('region',{name:'Selected offer'});
  await expect(selected.getByRole('combobox',{name:'Period',exact:true})).toHaveValue(String(period));
  await expect(selected.getByRole('combobox',{name:'Currency',exact:true})).toHaveValue('RUB');
  await expect(selected.getByText('Price: 349.00 RUB',{exact:true})).toBeVisible();
  await expect(selected.getByRole('heading',{name:'Selected offer',exact:true})).toBeFocused();
  expect(new URL(page.url()).searchParams.get('period')).toBe(String(period));expect(new URL(page.url()).searchParams.get('currency')).toBe('RUB');
});

test('operator support message bodies and metadata remain readable in dark theme',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  const id='20000000-0000-4000-8000-000000000001';
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/operator/session'))return route.fulfill({json:{account:{account_id:'10000000-0000-4000-8000-000000000001',email:'operator@example.test',email_verified:true,locale:'en',telegram_linked:false},csrf_token:'s'.repeat(43)}});
    if(path.endsWith('/operator/clients/'+id))return route.fulfill({json:{client:{account_id:id,kind:'web',display_name:'',email:'customer@example.test',telegram_id:null,locale:'en',created_at:null,restricted:false,vpn_banned:false,had_subscription:true},subscription:{status:'active',expires_at:null,devices:1,traffic_limit_bytes:1024,traffic_used_bytes:0,observed_at:'2026-10-02T10:00:00Z',data_stale:false,connection_available:true,access_profile:'regular',vpn_banned:false,access_operation_id:null,access_operation_status:null},server:null,support:null,trial_requests:[],trial_has_more:false,audit_events:[],audit_has_more:false,legacy_approval:null,legacy_events:[],legacy_has_more:false}});
    if(path.endsWith('/support')&&route.request().method()==='GET')return route.fulfill({json:{conversation:{id:'60000000-0000-4000-8000-000000000001',status:'open',support_banned:false,created_at:'2026-10-02T10:00:00Z',updated_at:'2026-10-02T10:00:00Z',customer_received_sequence:0,operator_received_sequence:0},messages:[{id:'70000000-0000-4000-8000-000000000001',sequence:1,sender:'customer',text:'Readable customer message',created_at:'2026-10-02T10:00:00Z',attachment:null,delivery:'stored'},{id:'70000000-0000-4000-8000-000000000002',sequence:2,sender:'operator',text:'Readable operator message',created_at:'2026-10-02T10:00:00Z',attachment:null,delivery:'stored'}],has_more:false,oldest_sequence:1}});
    if(path.endsWith('/support/read'))return route.fulfill({status:204});
    if(path.endsWith('/payment-history'))return route.fulfill({json:{kind:'orders',orders:[],receipts:[],legacy_transactions:[],refunds:[],has_more:false}});
    return route.fulfill({json:{}});
  });
  await page.goto('/admin/clients/'+id+'/show?lang=en');await expect(page.getByText('Readable customer message',{exact:true})).toBeVisible();
  const ratios=await page.locator('.support-message').evaluateAll(messages=>{
    const luminance=(value:string)=>{const channels=value.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(Number).map(channel=>{const s=channel/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
    return messages.flatMap(message=>[message.querySelector('p')!,message.querySelector('.message-meta')!].map(element=>{const a=luminance(getComputedStyle(element).color),b=luminance(getComputedStyle(message).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));
  });
  expect(ratios).toHaveLength(4);expect(ratios.every(ratio=>ratio>=4.5)).toBe(true);
});
