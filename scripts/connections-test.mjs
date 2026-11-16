import {_electron as electron} from 'playwright';
import {expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {terminalThemes} from '../src/terminalThemes.ts';
import {terminalAppearance} from '../src/appearance.ts';
const directory='test-results/connections';fs.mkdirSync(directory,{recursive:true});
const checks=[],errors=[];let app;
try{
  const env={...process.env,PERSON_TEST:`connections-${Date.now()}`};delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
  const packaged=process.argv.indexOf('--packaged');
  app=await electron.launch({...(packaged>=0?{executablePath:path.resolve(process.argv[packaged+1]),args:[]}:{args:['.']}),cwd:process.cwd(),env});
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByRole('heading',{name:'所有连接',exact:true})).toBeVisible();
  await page.evaluate(async()=>{
    const entries=[['生产 API','root','生产','orange'],['生产数据库','deploy','生产','blue'],['开发环境','developer','开发','purple'],['测试环境','tester','测试','blue'],['内部跳板机','deploy','生产','orange'],['监控服务','monitor','运维','purple'],['容器主机','admin','开发','blue']];
    for(const [index,[name,username,group,color]] of entries.entries())await window.person.saveHost({name,username,group,color,host:`127.0.0.${index+1}`,port:2200+index,auth:'password',shell:'bash',favorite:index<2});
  });
  await page.reload();await expect(page.locator('.host-card')).toHaveCount(7);
  await expect(page.locator('.sidebar,.sidebar-toggle')).toHaveCount(0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  await expect.poll(()=>page.locator('.host-grid').evaluate(grid=>getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(3);
  await page.screenshot({path:`${directory}/home.png`});
  checks.push('Startup opens the full-width configuration grid with no sidebar, compact host cards and a local-terminal toolbar button');
  const search=page.getByRole('textbox',{name:'搜索连接',exact:true});
  for(const [query,count] of [['deploy',2],['开发',2],['127.0.0.7',1],['不存在',0]]){await search.fill(query);await expect(page.locator('.host-card')).toHaveCount(count);}
  await page.getByRole('button',{name:'清除搜索',exact:true}).first().click();
  await page.getByRole('combobox',{name:'连接分组'}).selectOption('favorites');await expect(page.locator('.host-card')).toHaveCount(2);
  await page.getByRole('combobox',{name:'连接分组'}).selectOption('group:开发');await expect(page.locator('.host-card')).toHaveCount(2);
  await page.getByRole('combobox',{name:'连接分组'}).selectOption('all');
  await page.getByRole('button',{name:'列表视图',exact:true}).click();
  await expect.poll(()=>page.locator('.host-grid').evaluate(grid=>getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.getByRole('button',{name:'卡片视图',exact:true}).click();
  checks.push('Search filters names, addresses, usernames and groups; favorites, group filters and list/grid switches remain functional');
  const first=page.locator('.host-card').first();await first.hover();await first.getByRole('button',{name:'编辑连接',exact:true}).click();
  await page.getByLabel('用户名',{exact:true}).fill('release');await page.getByRole('button',{name:'保存连接',exact:true}).click();
  await expect(page.locator('.host-card').filter({hasText:'生产 API'})).toContainText('release');
  const edited=await page.evaluate(async()=>(await window.person.bootstrap()).hosts.find(host=>host.name==='生产 API'));
  expect(edited).toMatchObject({name:'生产 API',username:'release',group:'生产',color:'orange',favorite:true,shell:'bash'});
  await page.locator('.host-card').filter({hasText:'容器主机'}).hover();await page.locator('.host-card').filter({hasText:'容器主机'}).getByRole('button',{name:'删除连接',exact:true}).click();
  await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('.host-card')).toHaveCount(6);
  await page.reload();await expect(page.locator('.host-card')).toHaveCount(6);await expect(page.locator('.host-card').filter({hasText:'生产 API'})).toContainText('release');
  checks.push('Compact cards retain edit/delete actions and persist configuration changes across reload');
  await page.locator('.local-card').click();
  await expect.poll(()=>page.evaluate(async()=>(await window.person.bootstrap()).sessions[0]?.ready),{timeout:25000}).toBeTruthy();
  await page.evaluate(async()=>{const {sessions}=await window.person.bootstrap();await window.person.execute(sessions[0].id,"Write-Output (([char]27) + '[1;34mfolder' + ([char]27) + '[0m  plain.txt')");});
  const folder=page.locator('.terminal-pane:visible .xterm-rows span').filter({hasText:/^folder$/}).last();
  await expect(folder).toHaveCSS('font-weight','700');
  const cursor=page.locator('.terminal-pane:visible .xterm-cursor');
  for(const id of Object.keys(terminalThemes)){
    await page.evaluate(id=>{localStorage.setItem('person-terminal-color',id);window.dispatchEvent(new Event('person-terminal-color'));},id);
    await page.locator('.terminal-pane:visible .xterm-helper-textarea').focus();
    await expect(cursor).toHaveClass(/xterm-cursor-block/);
    const theme=terminalAppearance(terminalThemes[id].colors);
    const rgb=hex=>`rgb(${hex.match(/\w\w/g).map(value=>parseInt(value,16)).join(', ')})`;
    await expect(cursor).toHaveCSS('background-color',rgb(theme.cursor));await expect(cursor).toHaveCSS('color',rgb(theme.cursorAccent));
    await expect(folder).toHaveCSS('color',rgb(theme.brightBlue));
    const metrics={cursor:await cursor.evaluate(element=>element.getBoundingClientRect().width),cell:await page.locator('.terminal-pane:visible .xterm-char-measure-element').first().evaluate(element=>element.getBoundingClientRect().width/(element.textContent.length||1))};
    expect(Math.abs(metrics.cursor-metrics.cell)).toBeLessThan(1);
  }
  await page.evaluate(()=>{localStorage.setItem('person-terminal-color','paper');window.dispatchEvent(new Event('person-terminal-color'));});
  await page.locator('.terminal-pane:visible .xterm-helper-textarea').focus();
  await page.screenshot({path:`${directory}/terminal-light.png`,clip:{x:0,y:0,width:1000,height:360}});
  await page.evaluate(()=>{localStorage.setItem('person-terminal-color','midnight');window.dispatchEvent(new Event('person-terminal-color'));});
  await page.screenshot({path:`${directory}/terminal-dark.png`,clip:{x:0,y:0,width:1000,height:360}});
  checks.push('Every theme renders a pink block cursor, readable cursor text, and bold blue directory ANSI output');
  expect(errors).toEqual([]);fs.writeFileSync(`${directory}/report.json`,JSON.stringify({passed:true,checks,errors},null,2));console.log(checks.map(check=>'PASS '+check).join('\n'));
}catch(error){console.error(error);if(app)try{await(await app.firstWindow()).screenshot({path:`${directory}/failure.png`});}catch{}process.exitCode=1;}
finally{if(app)await app.close();}
