import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('test-results/clipboard',{recursive:true});
const env={...process.env,PERSON_TEST:`clipboard-${Date.now()}`};
delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
const packaged=process.argv.indexOf('--packaged');
const checks=[],errors=[];
let app,previousClipboard;
try{
  app=await electron.launch({...(packaged>=0?{executablePath:path.resolve(process.argv[packaged+1]),args:[]}:{args:['.']}),cwd:process.cwd(),env,timeout:30000});
  previousClipboard=await app.evaluate(({clipboard})=>clipboard.readText());
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.local-card').filter({hasText:'Windows PowerShell'}).click();
  await expect.poll(()=>page.evaluate(async()=>(await window.person.bootstrap()).sessions[0]?.ready),{timeout:25000}).toBeTruthy();
  const id=await page.evaluate(async()=>(await window.person.bootstrap()).sessions[0].id);
  const copyButton=page.getByRole('button',{name:'复制选中内容',exact:true});
  const textarea=page.locator('.terminal-pane:visible .xterm-helper-textarea');
  await expect(copyButton).toBeDisabled();
  const readClipboard=()=>app.evaluate(({clipboard})=>clipboard.readText());
  const seedClipboard=()=>app.evaluate(({clipboard})=>clipboard.writeText('clipboard sentinel'));
  await seedClipboard();
  await textarea.focus();await page.keyboard.press('Control+Shift+C');
  expect(await readClipboard()).toBe('clipboard sentinel');
  await page.evaluate(id=>window.person.execute(id,"Write-Output 'SLEEP_READY'; Start-Sleep -Seconds 30"),id);
  await expect.poll(()=>page.evaluate(async id=>(await window.person.buffer(id)).map(chunk=>chunk.data).join('').includes('SLEEP_READY\r\n'),id),{timeout:10000}).toBeTruthy();
  await textarea.focus();await page.keyboard.press('Control+c');
  await expect.poll(()=>page.evaluate(async()=>(await window.person.bootstrap()).sessions[0].ready),{timeout:10000}).toBeTruthy();
  expect(await readClipboard()).toBe('clipboard sentinel');
  checks.push('No selection: Ctrl+C interrupts a real PowerShell command; copy shortcut preserves clipboard');

  let seq=1000000;
  const render=async text=>{
    await app.evaluate(({BrowserWindow},{id,seq,text})=>BrowserWindow.getAllWindows()[0].webContents.send('session:data',{id,seq,data:'\x1b[3J\x1b[2J\x1b[H'+text}),{id,seq:seq++,text});
    await expect(page.locator('.xterm-rows>div').first()).toContainText('Ω');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const prompt='\x1b[0;38;5;214mΩ\x1b[0m';
  await render(`${prompt} C:\\copy> echo alpha\r\nalpha 中文 😀 é Ω literal ~ value\r\n\r\n  indented output\r\n${prompt} ~ $ echo beta\r\nbeta\r\n${prompt} ~ $ `);
  const select=async(start,end,alt=false)=>{
    const geometry=await page.locator('.terminal-pane:visible .xterm-rows').evaluate(rows=>{
      const box=rows.getBoundingClientRect(),first=rows.firstElementChild.getBoundingClientRect();
      const cell=parseFloat(rows.querySelector('.omega-prompt-glyph').style.width);
      return {x:box.x,y:first.y,height:first.height,cell};
    });
    if(alt)await page.keyboard.down('Alt');
    await page.mouse.move(geometry.x+(start.x+.1)*geometry.cell,geometry.y+(start.y+.5)*geometry.height);
    await page.mouse.down();
    await page.mouse.move(geometry.x+(end.x+.1)*geometry.cell,geometry.y+(end.y+.5)*geometry.height,{steps:12});
    await page.mouse.up();
    if(alt)await page.keyboard.up('Alt');
    await expect(copyButton).toBeEnabled();
  };
  await select({x:0,y:0},{x:4,y:5});
  const expected='C:\\copy> echo alpha\r\nalpha 中文 😀 é Ω literal ~ value\r\n\r\n  indented output\r\n$ echo beta\r\nbeta';
  for(const key of ['Control+c','Control+Shift+C','Control+Insert']){
    await seedClipboard();await page.keyboard.press(key);
    await expect.poll(readClipboard).toBe(expected);
    checks.push(`${key}: native clipboard keeps Unicode, indentation and blank lines; removes Omega and home prompt prefixes`);
  }
  await seedClipboard();await copyButton.click();
  await expect.poll(readClipboard).toBe(expected);
  checks.push('Copy button preserves terminal selection and writes the filtered text');

  const nativeCopy=await textarea.evaluate(element=>{
    const data=new DataTransfer();const event=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data});
    element.dispatchEvent(event);return {text:data.getData('text/plain'),handled:event.defaultPrevented};
  });
  expect(nativeCopy).toEqual({text:expected,handled:true});
  checks.push('Native copy events use the same filtered selection');

  await app.evaluate(({Menu})=>{
    globalThis.clipboardTestPopup=Menu.prototype.popup;
    Menu.prototype.popup=function(...args){globalThis.clipboardTestMenu=this;return globalThis.clipboardTestPopup.apply(this,args);};
  });
  await page.locator('.terminal-pane:visible .terminal-surface').click({button:'right'});
  await expect.poll(()=>app.evaluate(()=>!!globalThis.clipboardTestMenu)).toBeTruthy();
  await seedClipboard();
  const menu=await app.evaluate(({Menu})=>{
    const menu=globalThis.clipboardTestMenu;
    const items=menu.items.map(({label,enabled,role})=>({label,enabled,role}));
    menu.items[0].click();menu.closePopup();Menu.prototype.popup=globalThis.clipboardTestPopup;return items;
  });
  expect(menu[0]).toMatchObject({label:'复制',enabled:true});
  await expect.poll(readClipboard).toBe(expected);
  checks.push('Native context menu copies filtered selection');

  await select({x:2,y:4},{x:10,y:4});
  await page.keyboard.press('Control+c');await expect.poll(readClipboard).toBe('$ echo');
  checks.push('Partial selection preserves exact boundaries');
  await select({x:0,y:4},{x:5,y:5},true);
  await page.keyboard.press('Control+c');await expect.poll(readClipboard).toBe('$\r\nbeta');
  checks.push('Alt-drag column selection copies only the selected columns');

  const long='wrapped 中文 Ω ~/file '+'x'.repeat(180);
  await render(`${prompt} ~ $ echo long\r\n${long}\r\n${prompt} ~ $ `);
  await expect(page.locator('.omega-prompt-glyph')).toHaveCount(2);
  const lastRow=await page.locator('.omega-prompt-glyph').last().evaluate(element=>Array.prototype.indexOf.call(element.parentElement.parentElement.children,element.parentElement));
  await select({x:0,y:1},{x:0,y:lastRow});
  await page.keyboard.press('Control+c');await expect.poll(readClipboard).toBe(long+'\r\n');
  checks.push('Soft wraps do not add newlines to long Unicode output');
  await page.screenshot({path:'test-results/clipboard/selection.png'});

  expect(errors).toEqual([]);
  fs.writeFileSync('test-results/clipboard/report.json',JSON.stringify({passed:true,checks,errors},null,2));
  console.log(checks.map(check=>'PASS '+check).join('\n'));
}catch(error){
  if(app){const page=await app.firstWindow();console.error(JSON.stringify(await page.evaluate(async()=>{const boot=await window.person.bootstrap();return {boot,focus:document.activeElement?.className,chunks:boot.sessions[0]?await window.person.buffer(boot.sessions[0].id):[]};}),null,2));}
  if(app)await (await app.firstWindow()).screenshot({path:'test-results/clipboard/failure.png'}).catch(()=>{});
  fs.writeFileSync('test-results/clipboard/report.json',JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));
  console.error(error);process.exitCode=1;
}finally{
  if(app){if(previousClipboard!==undefined)await app.evaluate(({clipboard},text)=>clipboard.writeText(text),previousClipboard).catch(()=>{});await app.close();}
}
