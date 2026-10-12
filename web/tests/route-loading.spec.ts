import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';

function asset(module:string){
 const manifest=JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
 return '/'+manifest['src/'+module+'.tsx'].file;
}

test('login waits for its own page module without loading other screens',async({page})=>{
 const auth=asset('Auth'),requests:string[]=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**'+auth,async route=>{await held;await route.continue();});
 const requested=page.waitForRequest(request=>new URL(request.url()).pathname===auth);
 await page.goto('/login?lang=en');await requested;
 await expect(page.getByRole('status')).toContainText('Loading');await expect(page.getByLabel('Email',{exact:true})).toHaveCount(0);
 release();await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 for(const module of ['Cabinet','Catalogue','PurchaseOrder','PaymentHistory','Referrals','Support','Security','AccountIdentity','IdentityRecovery','MiniApp','Admin'])expect(requests).not.toContain(asset(module));
});

test('a failed page module can reload without losing the email verification proof',async({page})=>{
 let loads=0,body:unknown;const token='v'.repeat(43);
 await page.route('**'+asset('Auth'),route=>++loads===1?route.abort():route.continue());
 await page.route('**/api/v1/auth/verify-email',route=>{body=route.request().postDataJSON();return route.fulfill({json:{verified:true}});});
 await page.goto('/verify-email?lang=en#token='+token);
 await expect(page.getByRole('alert')).toContainText('Service temporarily unavailable');expect(new URL(page.url()).hash).toBe('');expect(body).toBeUndefined();
 await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('heading',{name:'Verify email',exact:true})).toBeVisible();
 await expect(page.getByLabel('Code from the email',{exact:true})).toHaveCount(0);expect(new URL(page.url()).hash).toBe('');expect(body).toBeUndefined();
 await page.getByLabel('Password',{exact:true}).fill('owned verification password');await page.getByRole('button',{name:'Verify email',exact:true}).click();
 await expect(page.getByText('Email verified. You can now sign in.',{exact:true})).toBeVisible();expect(body).toEqual({token,new_password:'owned verification password'});
});
