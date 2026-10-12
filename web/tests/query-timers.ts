import type {Page,Response} from '@playwright/test';

// Query observer notifications use a timer; flush it without advancing the polling clock.
export async function finishQueryRead(page:Page,response:Promise<Response>){
 await (await response).finished();await page.clock.runFor(0);await page.evaluate(()=>Promise.resolve());await page.clock.runFor(0);
}
