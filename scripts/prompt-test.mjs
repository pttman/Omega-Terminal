import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { terminalAppearance } from '../src/appearance.ts';
import { terminalThemes } from '../src/terminalThemes.ts';

fs.mkdirSync('test-results/prompt',{recursive:true});
const packaged=process.argv.indexOf('--packaged');
const env={...process.env,PERSON_TEST:`gold-${Date.now()}`};
delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
const checks=[],errors=[];
let app;
try{
  app=await electron.launch({...(packaged>=0?{executablePath:path.resolve(process.argv[packaged+1]),args:[]}:{args:['.']}),cwd:process.cwd(),env,timeout:30000});
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('.connections-page')).toBeVisible();
  expect(await page.evaluate(()=>document.fonts.check('14px "JetBrains Mono"')&&document.fonts.check('bold 14px "JetBrains Mono"'))).toBeTruthy();
  await page.locator('.appearance-toggle').click();
  const themes=await page.locator('.theme-cards>button').allTextContents();
  await page.getByRole('button',{name:'收起外观',exact:true}).click();
  await page.locator('.local-card').filter({hasText:'Windows PowerShell'}).click();
  await expect.poll(()=>page.evaluate(async()=>{const {sessions}=await window.person.bootstrap();return sessions[0]?.ready;}),{timeout:25000}).toBeTruthy();
  await page.getByRole('button',{name:'命令栏',exact:true}).click();
  const composer=page.locator('.terminal-pane:visible .command-composer textarea');
  await composer.fill('Get-Location');await composer.press('Enter');
  await expect.poll(()=>page.evaluate(async()=>{const {sessions}=await window.person.bootstrap();return sessions[0].ready&&sessions[0].history.includes('Get-Location');})).toBeTruthy();
  await page.getByRole('button',{name:'收起命令栏',exact:true}).click();
  const measure=page.locator('.terminal-pane:visible .xterm-char-measure-element').first();
  expect(await measure.evaluate(element=>getComputedStyle(element).fontFamily)).toContain('JetBrains Mono');
  const titleFont=await page.locator('.brand strong').evaluate(element=>({family:getComputedStyle(element).fontFamily,weight:getComputedStyle(element).fontWeight}));
  for(const name of themes){
    await page.locator('.appearance-toggle').click();
    await page.locator('.theme-cards>button').filter({hasText:name}).click();
    await page.getByRole('button',{name:'收起外观',exact:true}).click();
    await page.waitForTimeout(180);
    const id=await page.locator('html').getAttribute('data-palette');
    const gold=terminalAppearance(terminalThemes[id].colors).extendedAnsi[198];
    const box=await page.locator('.terminal-pane:visible .terminal-surface').boundingBox();
    await expect(page.locator('.terminal-pane:visible .omega-prompt-glyph')).toHaveCount(2);
    await expect(page.locator('.terminal-pane:visible .omega-prompt-glyph').first()).toHaveCSS('font-weight',titleFont.weight);
    await expect(page.locator('.terminal-pane:visible .omega-prompt-glyph').first()).toHaveCSS('font-family',titleFont.family);
    const promptMark=page.locator('.terminal-pane:visible .omega-prompt-glyph').first();
    const transform=await promptMark.evaluate(element=>getComputedStyle(element).transform);
    const initialGlyph=await promptMark.boundingBox();
    await page.mouse.move(initialGlyph.x+2,initialGlyph.y+initialGlyph.height/2);
    await page.mouse.down();
    await page.mouse.move(initialGlyph.x+200,initialGlyph.y+initialGlyph.height/2,{steps:8});
    await page.mouse.up();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(page.locator('.terminal-pane:visible .omega-prompt-glyph')).toHaveCount(2);
    await expect(promptMark).toHaveCSS('transform',transform);
    await expect(promptMark).toHaveCSS('font-weight',titleFont.weight);
    if(id==='graphite'||id==='paper')await page.screenshot({path:`test-results/prompt/${id}-selected.png`,clip:{x:box.x,y:box.y,width:Math.min(760,box.width),height:230}});
    await page.mouse.click(initialGlyph.x+2,initialGlyph.y+initialGlyph.height/2);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(page.locator('.terminal-pane:visible .omega-prompt-glyph')).toHaveCount(2);
    await expect(promptMark).toHaveCSS('transform',transform);
    const expectedColor=`rgb(${gold.match(/\w\w/g).map(channel=>parseInt(channel,16)).join(', ')})`;
    await expect(page.locator('.terminal-pane:visible .omega-prompt-glyph').first()).toHaveCSS('color',expectedColor);
    const glyphBox=await promptMark.evaluate(element=>{
      const range=document.createRange();range.setStart(element.firstChild,0);range.setEnd(element.firstChild,1);
      return range.getBoundingClientRect().toJSON();
    });
    const screenshot=await page.screenshot({path:`test-results/prompt/${id}.png`,clip:{x:box.x,y:box.y,width:Math.min(760,box.width),height:230}});
    const glyph=await app.evaluate(({nativeImage},{base64,gold,region,clipWidth})=>{
      const image=nativeImage.createFromBuffer(Buffer.from(base64,'base64'));
      const {width,height}=image.getSize(),bitmap=image.toBitmap();
      const target=gold.match(/\w\w/g).map(channel=>parseInt(channel,16));
      let count=0,minX=width,maxX=0,minY=height,maxY=0;
      const scale=width/clipWidth;
      for(let y=Math.max(0,Math.floor(region.y*scale));y<Math.min(height,Math.ceil((region.y+region.height)*scale));y++)for(let x=Math.max(0,Math.floor(region.x*scale));x<Math.min(width,Math.ceil((region.x+region.width)*scale));x++){
        const offset=(y*width+x)*4;
        // Allow rasterization/color-profile differences; the DOM color is checked exactly above.
        if(Math.abs(bitmap[offset]-target[2])<25&&Math.abs(bitmap[offset+1]-target[1])<25&&Math.abs(bitmap[offset+2]-target[0])<25){
          count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        }
      }
      return {pixels:count,aspect:(maxX-minX+1)/(maxY-minY+1)};
    },{base64:screenshot.toString('base64'),gold,region:{x:glyphBox.x-box.x,y:glyphBox.y-box.y,width:glyphBox.width,height:glyphBox.height},clipWidth:Math.min(760,box.width)});
    expect(glyph.pixels,`${id}: rendered gold Omega`).toBeGreaterThan(3);
    expect(glyph.aspect,`${id}: square Omega proportions`).toBeGreaterThan(.8);
    expect(glyph.aspect,`${id}: square Omega proportions`).toBeLessThan(1.3);
    checks.push(`${id}: title Omega font, natural proportions, stable click/selection and theme gold`);
  }
  expect(errors).toEqual([]);
  fs.writeFileSync('test-results/prompt/report.json',JSON.stringify({passed:true,checks,errors},null,2));
  console.log(`PASS ${checks.length} rendered prompt checks; bundled regular and bold font loaded`);
}catch(error){
  if(app){const debugPage=await app.firstWindow();fs.writeFileSync('test-results/prompt/failure.html',await debugPage.locator('.terminal-pane:visible .xterm-rows').evaluate(element=>element.innerHTML));await debugPage.screenshot({path:'test-results/prompt/failure.png'});}
  fs.writeFileSync('test-results/prompt/report.json',JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));
  console.error(error);process.exitCode=1;
}finally{if(app)await app.close();}
