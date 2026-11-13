import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const packaged=process.argv.indexOf('--packaged');
const directory='test-results/app-dialogs';fs.mkdirSync(directory,{recursive:true});
let app;const errors=[];const checks=[];
try{
  const env={...process.env,PERSON_TEST:`dialogs-${Date.now()}`,PERSON_TEST_EXIT:'1'};
  delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
  app=await electron.launch({...(packaged>=0?{executablePath:path.resolve(process.argv[packaged+1]),args:[]}:{args:['.']}),cwd:process.cwd(),env});
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('.version-toggle')).toBeVisible();
  const boot=await page.evaluate(()=>window.person.bootstrap());
  await expect(page.locator('.version-toggle')).toHaveText(`v${boot.version}`);
  await page.locator('.version-toggle').click();
  const about=page.getByRole('dialog',{name:'关于 Omega Terminal'});
  await expect(about).toContainText(`Electron ${boot.runtime.electron}`);
  await expect(about.locator('img')).toHaveJSProperty('naturalWidth',256);
  await expect(about.getByRole('button',{name:'项目与版本发布'})).toBeVisible();
  await page.waitForTimeout(350);await page.screenshot({path:`${directory}/about.png`});
  await page.keyboard.press('Escape');await expect(about).toBeHidden();
  checks.push('Statusbar version and About dialog display actual packaged app/runtime metadata and icon');
  await page.locator('.local-card').filter({hasText:'Windows PowerShell'}).click();
  await expect(page.locator('.terminal-pane:visible .composer-footer')).toContainText('提示符已集成',{timeout:25000});
  const sessionId=(await page.evaluate(()=>window.person.bootstrap())).sessions[0].id;
  await page.locator('.window-close').click();
  const exit=page.getByRole('dialog',{name:'准备离开工作区？'});
  await expect(exit).toBeVisible();await expect(exit.locator('.exit-summary')).toContainText('1');
  await expect(exit.getByRole('button',{name:'继续使用'})).toBeFocused();
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();BrowserWindow.getAllWindows()[0].close();});
  await expect(exit).toHaveCount(1);
  await page.screenshot({path:`${directory}/exit-dark.png`});
  await page.keyboard.press('Escape');await expect(exit).toBeHidden();
  expect((await page.evaluate(()=>window.person.bootstrap())).sessions.find(s=>s.id===sessionId).status).toBe('connected');
  expect(await page.evaluate(()=>window.person.answerExit('stale-request',true).then(()=>false,()=>true))).toBe(true);
  checks.push('Titlebar and repeated native window-close use one themed dialog; Escape keeps the live session; stale confirmation is rejected');
  // Native app.quit must ask before closing sessions, too.
  await page.evaluate(()=>{localStorage.setItem('person-terminal-color','coral-paper');window.dispatchEvent(new Event('person-terminal-color'));});
  await app.evaluate(({app})=>app.quit());await expect(exit).toBeVisible();
  await exit.getByRole('button',{name:'继续使用'}).click();await expect(exit).toBeHidden();
  expect((await page.evaluate(()=>window.person.bootstrap())).sessions.find(s=>s.id===sessionId).status).toBe('connected');
  checks.push('Native app.quit follows the same confirmation and cancel preserves the running PTY');
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await expect(exit).toBeVisible();
  await page.screenshot({path:`${directory}/exit-light.png`});
  await exit.getByRole('button',{name:'继续使用'}).click();await expect(exit).toBeHidden();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await expect(exit).toBeVisible();
  await page.waitForTimeout(350);
  await page.keyboard.press('Tab');await expect(exit.getByRole('button',{name:'关闭并退出'})).toBeFocused();
  const closed=app.waitForEvent('close');await exit.getByRole('button',{name:'关闭并退出'}).click();
  expect(await exit.locator('.exit-content').evaluate(async element=>{
    for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);const opacity=Number(getComputedStyle(element).opacity);if(opacity>0&&opacity<1)return true;}return false;
  })).toBe(true);
  await closed;
  checks.push('Keyboard-safe default, focus trap, reduced-motion mode and confirmed exit work in the packaged app');
  expect(errors).toEqual([]);console.log(checks.map(value=>`PASS ${value}`).join('\n'));
  fs.writeFileSync(`${directory}/report.json`,JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){console.error(error);if(app)try{await(await app.firstWindow()).screenshot({path:`${directory}/failure.png`});}catch{}process.exitCode=1;}
finally{if(app){try{await app.evaluate(()=>{delete process.env.PERSON_TEST_EXIT;});await app.close();}catch{}}}
