import {_electron as electron} from 'playwright';
import {expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const directory='test-results/host-editor';fs.mkdirSync(directory,{recursive:true});
const checks=[],errors=[];let app,page;
const packaged=process.argv.indexOf('--packaged');
try{
  const env={...process.env,PERSON_TEST:`host-editor-${Date.now()}`};delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
  app=await electron.launch({...(packaged>=0?{executablePath:path.resolve(process.argv[packaged+1]),args:[]}:{args:['.']}),cwd:process.cwd(),env});
  page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('.connections-page')).toBeVisible();
  const original=await page.evaluate(async()=>{
    const first=await window.person.saveHost({name:'生产 API',host:'192.168.1.20',username:'deploy',port:22,auth:'password',group:'生产',color:'orange',favorite:true,shell:'powershell',uploadDirectory:'/srv/uploads'});
    for(const [index,name] of ['开发环境','内部跳板机','数据库','监控服务','容器主机'].entries())await window.person.saveHost({name,host:`192.168.1.${30+index}`,username:'root',port:22,auth:'password',color:index%2?'purple':'blue'});
    return first;
  });
  await page.reload();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  const trigger=page.getByRole('button',{name:'新建连接',exact:true}),drawer=page.locator('.host-editor');
  await trigger.click();await expect(drawer).toHaveCSS('width','350px');
  await expect(page.getByLabel('服务器地址',{exact:true})).toBeFocused();
  await expect(drawer.locator('input')).toHaveCount(3);await expect(drawer.locator('select')).toHaveCount(1);
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);await expect(page.locator('.host-card')).toHaveCount(6);
  await expect(page.getByLabel('端口',{exact:true})).toHaveValue('22');
  const geometry=await page.evaluate(()=>{
    const panel=document.querySelector('.host-editor').getBoundingClientRect(),main=document.querySelector('.main-content').getBoundingClientRect(),header=document.querySelector('.titlebar').getBoundingClientRect();
    return {right:panel.right,width:innerWidth,top:panel.top,headerBottom:header.bottom,mainRight:main.right,left:panel.left};
  });
  expect(geometry.right).toBe(geometry.width);expect(geometry.top).toBe(geometry.headerBottom);expect(geometry.mainRight).toBe(geometry.left);
  checks.push('New connection opens a right drawer beneath the titlebar, shrinks the grid, autofocuses the address and shows only basic fields');
  for(const name of ['保存连接','保存并连接']){
    await drawer.getByRole('button',{name,exact:true}).click();
    expect(await drawer.locator('form').evaluate(form=>form.checkValidity())).toBe(false);
    expect(await page.evaluate(async()=>(await window.person.bootstrap()).hosts.length)).toBe(6);
  }
  await page.getByLabel('服务器地址',{exact:true}).fill('10.0.0.8');await page.getByLabel('用户名',{exact:true}).fill('ubuntu');
  await page.getByLabel('端口',{exact:true}).fill('65536');
  await drawer.getByRole('button',{name:'保存并连接',exact:true}).click();
  expect(await page.getByLabel('端口',{exact:true}).evaluate(input=>input.validity.rangeOverflow)).toBe(true);
  expect(await page.evaluate(async()=>(await window.person.bootstrap()).hosts.length)).toBe(6);
  await page.getByLabel('端口',{exact:true}).fill('22');await page.getByLabel('认证方式',{exact:true}).selectOption('key');
  await expect(page.getByLabel('私钥文件',{exact:true})).toBeVisible();
  await drawer.getByRole('button',{name:'保存连接',exact:true}).click();expect(await drawer.locator('form').evaluate(form=>form.checkValidity())).toBe(false);
  await page.getByLabel('认证方式',{exact:true}).selectOption('password');
  await page.screenshot({path:`${directory}/drawer.png`});
  await drawer.getByRole('button',{name:'保存连接',exact:true}).click();await expect(drawer).toHaveCount(0);
  const created=await page.evaluate(async()=>(await window.person.bootstrap()).hosts.find(host=>host.host==='10.0.0.8'));
  expect(created).toMatchObject({name:'10.0.0.8',host:'10.0.0.8',username:'ubuntu',port:22,auth:'password'});
  checks.push('Both submit actions validate required fields and port range, key authentication requires a key, and saving defaults the display name to the address');
  const first=page.locator('.host-card').filter({hasText:'生产 API'});await first.hover();await first.getByRole('button',{name:'编辑连接',exact:true}).click();
  await page.getByLabel('用户名',{exact:true}).fill('release');await drawer.getByRole('button',{name:'保存连接',exact:true}).click();await expect(drawer).toHaveCount(0);
  const updated=await page.evaluate(async id=>(await window.person.bootstrap()).hosts.find(host=>host.id===id),original.id);
  expect(updated).toEqual({...original,username:'release'});
  checks.push('Editing basic connection fields preserves existing name, group, color, favorite, remote shell and upload directory');
  await trigger.click();await expect(drawer).toHaveCSS('width','350px');
  await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(trigger).toBeFocused();
  await trigger.click();await expect(drawer).toHaveCSS('width','350px');
  const intermediate=await page.evaluate(async()=>{
    const panel=document.querySelector('.host-editor');document.querySelector('[title="关闭连接面板"]').click();
    for(let frame=0;frame<30;frame++){await new Promise(requestAnimationFrame);const width=panel.getBoundingClientRect().width;if(width>0&&width<350)return width;}
    return panel.getBoundingClientRect().width;
  });
  expect(intermediate).toBeGreaterThan(0);expect(intermediate).toBeLessThan(350);await expect(drawer).toHaveCount(0);await expect(trigger).toBeFocused();
  checks.push('Escape and the close button dismiss the drawer, restore focus and animate the layout');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,680));
  await trigger.click();await expect(drawer).toHaveCSS('width','330px');await page.getByLabel('认证方式',{exact:true}).selectOption('key');
  await expect(page.getByLabel('私钥文件',{exact:true})).toBeInViewport();await expect(page.locator('.host-editor-actions')).toBeInViewport();
  await page.screenshot({path:`${directory}/small-window.png`});
  await page.getByRole('button',{name:'关闭连接面板',exact:true}).click();await expect(drawer).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();await expect(drawer).toHaveCSS('transition-duration','0s');
  await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);
  checks.push('Small windows retain visible save actions and key selection; reduced motion removes the transition');
  expect(errors).toEqual([]);console.log(checks.map(check=>'PASS '+check).join('\n'));
  fs.writeFileSync(`${directory}/report.json`,JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){console.error(error);if(page)await page.screenshot({path:`${directory}/failure.png`}).catch(()=>{});fs.writeFileSync(`${directory}/report.json`,JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));process.exitCode=1;}
finally{if(app)await app.close();}
