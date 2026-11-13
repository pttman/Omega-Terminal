const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Sessions}=require('../electron/sessions.cjs');
const {Transfers}=require('../electron/transfers.cjs');
const {sshFixture,until}=require('./fixture.cjs');
test('Real SSH transport: fingerprint trust, shell UTF-8, SFTP integrity, collisions and cancellation',{timeout:60000},async(t)=>{
  const fixture=await sshFixture();let collision='keep';const questions=[];
  const store={data:{settings:{},trustedHosts:{},hosts:[{id:'fixture',host:'127.0.0.1',port:fixture.port,username:'tester',name:'Fixture',auth:'password',shell:'bash'}]},save(){}};
  const manager=new Sessions(store,async question=>{questions.push(question);return true;});
  const transfers=new Transfers(manager,async()=>collision);
  const session=manager.create({hostId:'fixture',password:'fixture-password'});const item=manager.get(session.id);
  try{
    await until(()=>item.ready||item.status==='error');assert.equal(item.status,'connected',item.error);assert.equal(item.cwd,'/home/test');assert.equal(questions.length,1);assert.match(questions[0].fingerprint,/^SHA256:/);
    t.diagnostic('SSH authenticated and prompt integrated');
    manager.execute(item.id,'echo hello');await until(()=>item.ready&&item.chunks.some(chunk=>chunk.data.includes('hello')));assert.ok(item.chunks.map(chunk=>chunk.data).join('').includes('执行完成 中文'));
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'person-upload-'));const source=path.join(directory,'中文 file.txt');const content=crypto.randomBytes(1024*1024);fs.writeFileSync(source,content);
    await transfers.enqueue(item.id,[source],'/home/test/uploads');await until(()=>[...transfers.items.values()].every(task=>['done','error'].includes(task.status)));
    const first=[...transfers.items.values()][0];assert.equal(first.status,'done',first.error);assert.deepEqual(fs.readFileSync(path.join(fixture.root,'uploads','中文 file.txt')),content);t.diagnostic('SFTP uploaded and content matched');
    await transfers.enqueue(item.id,[source],'/home/test/uploads');await until(()=>[...transfers.items.values()].length===2&&[...transfers.items.values()][1].status==='done');assert.ok(fs.existsSync(path.join(fixture.root,'uploads','中文 file (1).txt')));
    collision='skip';await transfers.enqueue(item.id,[source],'/home/test/uploads');await until(()=>[...transfers.items.values()][2]?.status==='skipped');
    const big=path.join(directory,'cancel.bin');fs.writeFileSync(big,crypto.randomBytes(8*1024*1024));
    const listener=task=>{if(task.name==='cancel.bin'&&task.bytes>0&&task.status==='running')transfers.cancel(task.id);};transfers.on('state',listener);
    await transfers.enqueue(item.id,[big],'/home/test/uploads');await until(()=>[...transfers.items.values()][3]?.status==='cancelled');transfers.removeListener('state',listener);
    assert.ok(!fs.existsSync(path.join(fixture.root,'uploads','cancel.bin')));assert.ok(!fs.readdirSync(path.join(fixture.root,'uploads')).some(file=>file.endsWith('.part')));
    const duplicate=await transfers.enqueue(item.id,[source,source],'/home/test/uploads');assert.equal(duplicate.accepted,1);assert.equal(duplicate.rejected.length,1);
  }finally{for(const task of transfers.active())transfers.cancel(task.id);manager.closeAll();await fixture.close();}
});
test('Changed SSH fingerprint is rejected without overwriting previous trust',{timeout:25000},async()=>{
  const fixture=await sshFixture();const identity=`[127.0.0.1]:${fixture.port}`;let question;
  const store={data:{settings:{},trustedHosts:{[identity]:'SHA256:previous'},hosts:[{id:'fixture',host:'127.0.0.1',port:fixture.port,username:'tester',name:'Fixture',auth:'password',shell:'bash'}]},save(){}};
  const manager=new Sessions(store,async value=>{question=value;return false;});
  try{const session=manager.create({hostId:'fixture',password:'fixture-password'});await until(()=>manager.get(session.id).status==='error');assert.equal(question.previous,'SHA256:previous');assert.equal(store.data.trustedHosts[identity],'SHA256:previous');}finally{manager.closeAll();await fixture.close();}
});
