const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Sessions}=require('../electron/sessions.cjs');
const {until}=require('./fixture.cjs');

test('Terminal replies preserve readiness and running command ownership; real input cancels queued commands',async()=>{
  const manager=new Sessions({data:{}},()=>{}),writes=[];
  const item={id:'reply',token:'reply-token',pending:'',chunks:[],seq:0,bufferSize:0,history:[],kind:'ssh',shell:'bash',status:'connected',ready:true,rawDirty:false,integrated:true,commandQueue:[],stream:{write:data=>writes.push(data)}};
  manager.items.set(item.id,item);
  const reports=['\x1b[1;1R','\x1b[?1;2c','\x1b[>0;276;0c','\x1b[I','\x1b[O','\x1b[8;24;80t','\x1b]11;rgb:ffff/eeee/dddd\x1b\\','\x1b]10;rgb:aaaa/bbbb/cccc\x07','\x1b]4;1;rgb:1111/2222/3333\x1b\\'];
  for(const report of reports)manager.write(item.id,report);
  assert.equal(item.ready,true);assert.equal(item.rawDirty,false);
  manager.execute(item.id,'echo first');manager.execute(item.id,'echo second');
  for(const report of reports)manager.write(item.id,report);
  assert.equal(item.commandRunning,true);assert.equal(item.commandQueue.length,1);assert.equal(item.rawDirty,false);
  manager.write(item.id,'x');assert.equal(item.commandRunning,false);assert.equal(item.commandQueue.length,0);assert.equal(item.rawDirty,true);
  assert.throws(()=>manager.execute(item.id,'echo unsafe'),/原生输入/);
  manager.ingest(item,'\x1b]777;reply-token;P;L3RtcA==\x07');
  assert.equal(item.rawDirty,false);manager.execute(item.id,'echo clean');
  manager.execute(item.id,'echo cancelled');manager.interrupt(item.id);
  assert.equal(writes.at(-1),'\x03');assert.equal(item.commandQueue.length,0);
  manager.ingest(item,'\x1b]777;reply-token;P;L3RtcA==\x07');
  await new Promise(setImmediate);assert.ok(!writes.includes('echo second\r'));assert.ok(!writes.includes('echo cancelled\r'));
});

test('Consecutive composer commands stream output in order, keep shell state and cancel without running queued work',{timeout:30000},async()=>{
  if(process.platform!=='win32')return;
  const manager=new Sessions({data:{settings:{defaultShell:'powershell',startDirectory:''},hosts:[]}},()=>{});
  const session=manager.create({profile:'powershell'}),item=manager.get(session.id),output=()=>item.chunks.map(chunk=>chunk.data).join('');
  try{
    await until(()=>item.ready);
    const clean=text=>text.replace(/\x1b\[[\d;?]*[a-zA-Z]/g,'');
    const chunks=[];manager.on('data',chunk=>chunks.push(chunk.data));
    manager.execute(item.id,"$composerValue = 41; 1..5 | ForEach-Object { Write-Output ('STREAM_' + $_); Start-Sleep -Milliseconds 150 }");
    manager.execute(item.id,"Write-Output ('AFTER_' + ($composerValue + 1))");
    await until(()=>/STREAM_1\r?\n/.test(output().replace(/\x1b\[[\d;?]*[a-zA-Z]/g,'')));assert.equal(item.commandRunning,true);assert.equal(item.commandQueue.length,1);
    await until(()=>item.ready&&!item.commandRunning&&!item.commandQueue.length&&/AFTER_42\r?\n/.test(output().replace(/\x1b\[[\d;?]*[a-zA-Z]/g,'')));
    const streamed=clean(chunks.join(''));for(let index=1;index<=5;index++)assert.match(streamed,new RegExp('STREAM_'+index+'\\r?\\n'));
    assert.ok(streamed.indexOf('\nSTREAM_5')<streamed.indexOf('\nAFTER_42'));
    manager.execute(item.id,"$batchValue = 6\nStart-Sleep -Milliseconds 100\nWrite-Output ('BATCH_' + $batchValue)");
    manager.execute(item.id,"Write-Output ('PERSIST_' + $batchValue)");
    await until(()=>item.ready&&/PERSIST_6\r?\n/.test(output().replace(/\x1b\[[\d;?]*[a-zA-Z]/g,'')));assert.match(clean(output()),/BATCH_6\r?\n/);
    manager.execute(item.id,"while ($true) { Write-Output 'INTERRUPT_STREAM'; Start-Sleep -Milliseconds 100 }");
    manager.execute(item.id,"Write-Output 'SHOULD_NOT_RUN'");await until(()=>/INTERRUPT_STREAM\r?\n/.test(output().replace(/\x1b\[[\d;?]*[a-zA-Z]/g,'')));
    manager.interrupt(item.id);await until(()=>item.ready&&!item.rawDirty);assert.equal(item.commandQueue.length,0);assert.ok(!item.history.some(command=>command.includes('SHOULD_NOT_RUN')));
    manager.execute(item.id,"Write-Output 'RECOVERED'");await until(()=>item.ready&&/RECOVERED\r?\n/.test(output().replace(/\x1b\[[\d;?]*[a-zA-Z]/g,'')));
  }catch(error){console.error(JSON.stringify(manager.public(item)));console.error(JSON.stringify(output()));throw error;}
  finally{manager.closeAll();}
});

test('Queued commands stay private, bounded and cannot execute after disconnect or explicit cancellation',async()=>{
  const manager=new Sessions({data:{}},()=>{}),writes=[];
  const item={id:'queue',token:'queue-token',pending:'',chunks:[],seq:0,bufferSize:0,history:[],kind:'ssh',shell:'bash',status:'connected',ready:true,rawDirty:false,integrated:true,commandQueue:[],stream:{write:data=>writes.push(data)}};
  manager.items.set(item.id,item);manager.execute(item.id,'echo first');
  for(let index=0;index<20;index++)manager.execute(item.id,`echo token=secret-${index}`);
  assert.equal(manager.public(item).queuedCommands,20);assert.ok(!JSON.stringify(manager.public(item)).includes('secret-'));assert.throws(()=>manager.execute(item.id,'overflow'),/20/);
  manager.cancelCommands(item.id);assert.equal(item.commandRunning,true);assert.equal(item.commandQueue.length,0);
  manager.execute(item.id,'echo after');manager.ingest(item,'\x1b]777;queue-token;P;L3RtcA==\x07');
  manager.fail(item,new Error('disconnected'));await new Promise(setImmediate);
  assert.deepEqual(writes,['echo first\r']);assert.equal(item.commandRunning,false);assert.equal(item.commandQueue.length,0);
});

test('Interactive commands and split alternate-screen sequences suspend the composer and clear queued work until the prompt returns',async()=>{
  const manager=new Sessions({data:{}},()=>{}),writes=[];
  const item={id:'interactive',token:'interactive-token',pending:'',chunks:[],seq:0,bufferSize:0,history:[],kind:'ssh',shell:'bash',status:'connected',ready:true,rawDirty:false,integrated:true,commandQueue:[],stream:{write:data=>writes.push(data)}};
  manager.items.set(item.id,item);
  const prompt=()=>manager.ingest(item,'\x1b]777;interactive-token;P;L3RtcA==\x07');
  manager.execute(item.id,'vim notes.txt');assert.equal(manager.public(item).interactive,true);
  assert.throws(()=>manager.execute(item.id,'pwd'),/交互程序/);prompt();assert.equal(manager.public(item).interactive,false);
  manager.execute(item.id,'custom-editor');manager.execute(item.id,'echo do-not-send');
  manager.ingest(item,'\x1b[');manager.ingest(item,'?104');manager.ingest(item,'9hEDITOR');
  assert.equal(manager.public(item).interactive,true);assert.equal(item.commandQueue.length,0);assert.throws(()=>manager.execute(item.id,'pwd'),/交互程序/);
  manager.write(item.id,':q\r');manager.ingest(item,'\x1b[?1049l');assert.equal(item.ready,false);
  prompt();await new Promise(setImmediate);assert.equal(manager.public(item).interactive,false);assert.ok(!writes.includes('echo do-not-send\r'));
  manager.execute(item.id,'pwd');assert.equal(writes.at(-1),'pwd\r');
});
