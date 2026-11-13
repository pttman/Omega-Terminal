import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const directory='test-results/split';fs.mkdirSync(directory,{recursive:true});
const env={...process.env,PERSON_TEST:`split-${Date.now()}`};delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
const packaged=process.argv.indexOf('--packaged');const checks=[],errors=[];let app;
try{
  app=await electron.launch({...(packaged>=0?{executablePath:path.resolve(process.argv[packaged+1]),args:[]}:{args:['.']}),cwd:process.cwd(),env,timeout:30000});
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  const slot=id=>page.locator(`.pane-slot[data-session-id="${id}"]`);
  const rect=async id=>await slot(id).boundingBox();
  async function newSession(){
    await page.locator('.home-tab').click();await page.locator('.local-card').click();
    const id=await page.locator('.pane-slot:visible').getAttribute('data-session-id');
    await expect.poll(()=>page.evaluate(async id=>(await window.person.bootstrap()).sessions.find(item=>item.id===id)?.ready,id),{timeout:25000}).toBeTruthy();return id;
  }
  async function drag(source,target,edge,screenshot){
    const from=await source.boundingBox(),to=await target.boundingBox();
    await page.mouse.move(from.x+Math.min(65,from.width/2),from.y+from.height/2);await page.mouse.down();
    await page.mouse.move(from.x+Math.min(65,from.width/2)+12,from.y+from.height/2+5,{steps:5});
    const x=to.x+to.width*(edge==='left'?.1:edge==='right'?.9:.5),y=to.y+to.height*(edge==='top'?.15:edge==='bottom'?.85:.5);
    await page.mouse.move(x,y,{steps:15});await page.mouse.move(x+1,y+1);
    if(screenshot){await expect(page.locator(`.dock-preview.edge-${edge}`)).toBeVisible();await page.screenshot({path:`${directory}/${screenshot}.png`});}
    await page.mouse.up();
  }
  const a=await newSession(),b=await newSession();
  await page.locator('.workspace-tab:not(.home-tab)').first().click();
  await slot(a).getByRole('button',{name:'命令栏',exact:true}).click();await slot(a).locator('.command-composer textarea').fill('draft survives docking');
  await drag(page.locator('.workspace-tab:not(.home-tab)').last(),slot(a),'right','right-preview');
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(2);await expect(page.locator('.workspace-tab:not(.home-tab)')).toHaveCount(1);
  expect((await rect(b)).x).toBeGreaterThan((await rect(a)).x);checks.push('Native tab drag docks an existing session on the right');
  const c=await newSession();await page.locator('.workspace-tab:not(.home-tab)').first().click();
  await drag(page.locator('.workspace-tab:not(.home-tab)').last(),slot(b),'bottom','bottom-preview');
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(3);expect((await rect(c)).y).toBeGreaterThan((await rect(b)).y);
  expect(Math.abs((await rect(b)).x-(await rect(c)).x)).toBeLessThan(1);
  await expect(slot(a).locator('.command-composer textarea')).toHaveValue('draft survives docking');checks.push('Nested bottom docking preserves live terminal and draft state');
  const split=page.getByRole('separator',{name:'调整左右分屏'});const before=await rect(a);const box=await split.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/4);await page.mouse.down();await page.mouse.move(box.x-90,box.y+box.height/2,{steps:12});await page.mouse.up();
  expect((await rect(a)).width).toBeLessThan(before.width-60);await split.dblclick({position:{x:box.width/2,y:box.height/4}});expect(Math.abs((await rect(a)).width-before.width)).toBeLessThan(2);
  await split.focus();await page.keyboard.press('ArrowRight');expect((await rect(a)).width).toBeGreaterThan(before.width);await page.keyboard.press('Home');
  checks.push('Split dividers resize by mouse and keyboard and reset on double click');
  await drag(slot(c).locator('.pane-header'),slot(a),'left','left-preview');
  expect((await rect(c)).x).toBeLessThan((await rect(a)).x);await expect(page.locator('.terminal-pane:visible')).toHaveCount(3);
  await drag(slot(c).locator('.pane-header'),slot(b),'top','top-preview');
  expect((await rect(c)).y).toBeLessThan((await rect(b)).y);checks.push('Existing panes can be moved to the left and top');
  // Drag a pane into a fresh tab using the real HTML drag lifecycle.
  const from=await slot(c).locator('.pane-header').boundingBox();await page.mouse.move(from.x+65,from.y+16);await page.mouse.down();await page.mouse.move(from.x+80,from.y+26,{steps:5});
  await expect(page.locator('.detach-drop')).toBeVisible();const detach=await page.locator('.detach-drop').boundingBox();await page.mouse.move(detach.x+detach.width/2,detach.y+detach.height/2,{steps:12});await page.mouse.move(detach.x+detach.width/2+1,detach.y+detach.height/2);await page.mouse.up();
  await expect(page.locator('.workspace-tab:not(.home-tab)')).toHaveCount(2);await expect(slot(c)).toBeVisible();await expect(page.locator('.terminal-pane:visible')).toHaveCount(1);
  await expect(slot(a).locator('.command-composer textarea')).toHaveValue('draft survives docking');checks.push('Pane drag creates an independent tab without losing session state');
  const ids=await page.evaluate(async()=>(await window.person.bootstrap()).sessions.map(item=>item.id));expect(new Set(ids)).toEqual(new Set([a,b,c]));
  // Hovering a tab during drag exposes its existing pane targets.
  const source=page.locator('.workspace-tab.selected:not(.home-tab)');const sourceBox=await source.boundingBox(),targetBox=await page.locator('.workspace-tab:not(.home-tab)').first().boundingBox();
  await page.mouse.move(sourceBox.x+60,sourceBox.y+18);await page.mouse.down();await page.mouse.move(sourceBox.x+75,sourceBox.y+23,{steps:5});await page.mouse.move(targetBox.x+60,targetBox.y+18,{steps:12});
  await expect(slot(a)).toBeVisible();const target=await rect(a);await page.mouse.move(target.x+target.width*.1,target.y+target.height*.5,{steps:12});await page.mouse.move(target.x+target.width*.1+1,target.y+target.height*.5);await page.mouse.up();
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(3);await expect(page.locator('.workspace-tab:not(.home-tab)')).toHaveCount(1);checks.push('Hovering another tab while dragging reveals docking targets');
  await page.evaluate(async id=>window.person.execute(id,"Write-Output ([string]::Concat('split-', 'still-alive'))"),c);
  await expect.poll(()=>page.evaluate(async id=>(await window.person.buffer(id)).map(chunk=>chunk.data).join(''),c)).toContain('split-still-alive');
  await page.screenshot({path:`${directory}/nested-split.png`});
  await slot(a).getByRole('button',{name:'关闭分屏',exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(2);expect(await page.locator('.pane-divider').count()).toBe(1);checks.push('Closing a pane collapses its split and keeps other sessions alive');
  await page.getByRole('button',{name:'左右分屏（新建默认本地终端）'}).click();await expect(page.locator('.terminal-pane:visible')).toHaveCount(3);
  await page.getByRole('button',{name:'上下分屏（新建默认本地终端）'}).click();await expect(page.locator('.terminal-pane:visible')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'左右分屏（新建默认本地终端）'})).toBeDisabled();await expect(page.getByRole('button',{name:'上下分屏（新建默认本地终端）'})).toBeDisabled();
  const extra=await newSession();await page.locator('.workspace-tab:not(.home-tab)').first().click();
  await drag(page.locator('.workspace-tab:not(.home-tab)').last(),slot(b),'right','four-pane-limit');
  await expect(page.locator('.terminal-pane:visible')).toHaveCount(4);await expect(page.locator('.workspace-tab:not(.home-tab)')).toHaveCount(2);
  expect(await page.evaluate(async id=>(await window.person.bootstrap()).sessions.some(session=>session.id===id&&session.ready),extra)).toBe(true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,680));
  await expect.poll(()=>page.locator('.appearance-toggle').evaluate(element=>{const label=element.querySelector('span');return label.getBoundingClientRect().height<=parseFloat(getComputedStyle(label).fontSize)*1.8;})).toBe(true);
  await page.screenshot({path:`${directory}/compact-four-panes.png`});checks.push('Existing split buttons work with nested layouts and a fifth pane is rejected without closing its session');
  expect(errors).toEqual([]);fs.writeFileSync(`${directory}/report.json`,JSON.stringify({passed:true,checks,errors},null,2));console.log(checks.map(check=>`PASS ${check}`).join('\n'));
}catch(error){if(app){try{await (await app.firstWindow()).screenshot({path:`${directory}/failure.png`});}catch{}}fs.writeFileSync(`${directory}/report.json`,JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));console.error(error);process.exitCode=1;
}finally{if(app)await app.close();}
