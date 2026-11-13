import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs';

fs.mkdirSync('test-results/themes',{recursive:true});
const env={...process.env,PERSON_TEST:`themes-${Date.now()}`};
delete env.ELECTRON_RUN_AS_NODE;
delete env.PERSON_DEV_URL;
let app;
const errors=[];
const checks=[];
async function audit(page,label){
  await page.waitForTimeout(180);
  const failures=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].map((channel,index)=>index===3?channel/255:channel);};
    const over=(top,bottom)=>top.slice(0,3).map((channel,index)=>channel*top[3]+bottom[index]*(1-top[3]));
    const luminance=color=>color.map(channel=>{const value=channel/255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    const failures=[];
    for(const element of document.querySelectorAll('body *')){
      if(![...element.childNodes].some(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()))continue;
      if(!element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||element.closest('button:disabled,.xterm,.theme-preview'))continue;
      let background=[255,255,255];
      const ancestors=[];for(let node=element;node;node=node.parentElement)ancestors.unshift(node);
      for(const node of ancestors)background=over(rgba(getComputedStyle(node).backgroundColor),background);
      const foreground=over(rgba(getComputedStyle(element).color),background);
      const a=luminance(foreground),b=luminance(background);
      const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      if(ratio<4.45)failures.push({text:element.textContent.trim().slice(0,50),class:element.className,ratio:ratio.toFixed(2)});
    }
    return failures;
  });
  expect(failures,`${label}: low contrast text`).toEqual([]);
  checks.push(label);
}
try{
  app=await electron.launch({args:['.'],cwd:process.cwd(),env,timeout:30000});
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('.connections-page')).toBeVisible();
  await page.locator('.appearance-toggle').click();
  const themes=await page.locator('.theme-cards>button').allTextContents();
  await page.getByRole('button',{name:'收起外观',exact:true}).click();
  await audit(page,'empty connections');
  await page.getByRole('button',{name:'新建连接',exact:true}).click();
  await page.getByLabel('连接名称',{exact:true}).fill('主题测试服务器');
  await page.getByLabel('服务器地址',{exact:true}).fill('theme-test.invalid');
  await page.getByLabel('用户名',{exact:true}).fill('tester');
  await page.getByLabel('分组',{exact:true}).fill('生产环境');
  await page.getByRole('button',{name:'收藏',exact:true}).click();
  await page.getByRole('button',{name:'保存连接',exact:true}).click();
  for(const name of themes){
    await page.locator('.appearance-toggle').click();
    await page.locator('.theme-cards>button').filter({hasText:name}).click();
    await page.getByRole('button',{name:'收起外观',exact:true}).click();
    const id=await page.locator('html').getAttribute('data-palette');
    await audit(page,`${id}: home`);
    for(const selector of ['.main-nav button:not(.active)','.button.primary','.local-card','.host-card','.window-controls button[title="最大化 / 还原"]']){
      const target=page.locator(selector).first();await target.hover();await page.waitForTimeout(150);
      await audit(page,`${id}: hover ${selector}`);
      await page.mouse.down();await page.waitForTimeout(150);await audit(page,`${id}: press ${selector}`);
      await page.mouse.move(5,5);await page.mouse.up();
    }
    await page.screenshot({path:`test-results/themes/${id}-home.png`});
    await page.locator('.tools-nav').getByText('设置',{exact:true}).click();
    await expect(page.getByRole('combobox',{name:'界面主题',exact:true})).toHaveValue(id);
    await audit(page,`${id}: settings`);
    await page.screenshot({path:`test-results/themes/${id}-settings.png`});
    await page.getByRole('button',{name:'AI 服务',exact:true}).click();
    await audit(page,`${id}: AI settings`);
    await page.getByRole('button',{name:'配置与数据',exact:true}).click();
    await audit(page,`${id}: data settings`);
    await page.getByRole('button',{name:'关闭',exact:true}).last().click();
    await page.getByRole('button',{name:'新建连接',exact:true}).click();
    await audit(page,`${id}: host editor`);
    await page.getByRole('button',{name:'关闭',exact:true}).last().click();
    await page.locator('.tools-nav').getByText('AI 助手',{exact:true}).click();
    await audit(page,`${id}: assistant`);
    await page.locator('.assistant-tabs').getByRole('button',{name:'命令手册',exact:true}).click();
    await audit(page,`${id}: manual`);
    await page.locator('.manual-list>button').first().click();
    await audit(page,`${id}: manual detail`);
    await page.screenshot({path:`test-results/themes/${id}-assistant.png`});
    await page.getByRole('button',{name:'← 返回命令列表',exact:true}).click();
    await page.getByRole('button',{name:'关闭助手',exact:true}).click();
    await page.keyboard.press('Control+Shift+P');
    await audit(page,`${id}: command palette`);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'传输任务',exact:true}).click();
    await audit(page,`${id}: transfers`);
    await page.getByRole('button',{name:'收起传输面板',exact:true}).click();
  }
  await page.locator('.tools-nav').getByText('设置',{exact:true}).click();
  await page.getByRole('combobox',{name:'界面主题',exact:true}).selectOption('coral-paper');
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette','coral-paper');
  expect(await page.evaluate(async()=>(await window.person.bootstrap()).settings.theme)).toBe('light');
  await page.getByRole('button',{name:'关闭',exact:true}).last().click();
  await page.locator('.appearance-toggle').click();
  await expect(page.locator('.theme-cards>button.selected')).toContainText('珊瑚白');
  await page.getByRole('button',{name:'收起外观',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette','coral-paper');
  checks.push('Theme selection is shared by settings and appearance, and survives reload');
  await page.locator('.local-card').filter({hasText:'Windows PowerShell'}).click();
  await page.getByRole('button',{name:'命令栏',exact:true}).click();
  await expect(page.locator('.terminal-pane:visible .composer-footer')).toContainText('提示符已集成',{timeout:25000});
  await expect.poll(()=>page.evaluate(async()=>{const {sessions}=await window.person.bootstrap();return (await window.person.buffer(sessions[0].id)).map(chunk=>chunk.data).join('').includes('Ω');})).toBeTruthy();
  const composer=page.locator('.terminal-pane:visible .command-composer textarea');
  await composer.fill('Get-Location');await composer.press('Enter');
  await expect.poll(()=>page.evaluate(async()=>{const {sessions}=await window.person.bootstrap();return sessions[0].ready&&sessions[0].history.includes('Get-Location');})).toBeTruthy();
  for(const name of themes){
    await page.locator('.appearance-toggle').click();
    await page.locator('.theme-cards>button').filter({hasText:name}).click();
    await page.getByRole('button',{name:'收起外观',exact:true}).click();
    const id=await page.locator('html').getAttribute('data-palette');
    const input=page.locator('.terminal-pane:visible .command-composer textarea');
    await input.fill('Get-Ch');
    await expect(page.getByRole('option').first()).toBeVisible({timeout:15000});
    await audit(page,`${id}: terminal completions`);
    await page.screenshot({path:`test-results/themes/${id}-terminal.png`});
    await input.fill('');
  }
  expect(errors).toEqual([]);
  fs.writeFileSync('test-results/themes/report.json',JSON.stringify({passed:true,checks,errors},null,2));
  console.log(`PASS ${checks.length} theme checks across ${themes.length} palettes; no renderer errors`);
}catch(error){
  if(app)await (await app.firstWindow()).screenshot({path:'test-results/themes/failure.png'}).catch(()=>{});
  fs.writeFileSync('test-results/themes/report.json',JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));
  console.error(error);process.exitCode=1;
}finally{if(app)await app.close();}
