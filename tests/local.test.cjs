const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Sessions,availableShells}=require('../electron/sessions.cjs');
const {Completion}=require('../electron/completion.cjs');
function until(predicate,timeout=20000){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('等待真实 Shell 超时'));}},40);});}
for(const profile of ['powershell'])test(`Real ${profile} PTY starts, executes, emits prompt and closes`,{timeout:30000},async()=>{
  const store={data:{settings:{defaultShell:profile,startDirectory:''},hosts:[]}};const manager=new Sessions(store,()=>Promise.resolve(false));
  const session=manager.create({profile});const item=manager.get(session.id);
  try{
    await until(()=>item.ready||item.status==='error');assert.equal(item.status,'connected',item.error);assert.ok(item.cwd);
    const marker='PERSON_PTY_'+Date.now();manager.execute(item.id,`echo ${marker}`);
    await until(()=>item.ready&&item.chunks.some(chunk=>chunk.data.includes(marker)));
    await until(()=>item.chunks.map(chunk=>chunk.data).join('').includes('Ω'));
    const output=item.chunks.map(chunk=>chunk.data).join('');
    assert.ok(output.split('Ω').length>=3,'Omega returns after each executed command');
    assert.match(output,/\x1b\[38;5;214m(?:\x1b\[[\d;?]*[a-zA-Z]|\r|\n)*Ω(?:\x1b\[[\d;]*m | \x1b\[[\d;]*m)/,'Omega uses gold and resets before the path');
    assert.ok(item.integrated);assert.ok(item.history.some(command=>command.includes(marker)));
    assert.throws(()=>{item.rawDirty=true;manager.execute(item.id,'echo unsafe');});item.rawDirty=false;
    manager.resize(item.id,120,35);assert.equal(item.cols,120);assert.equal(item.rows,35);
    const completion=new Completion(manager);const values=await completion.get(item.id,'Get-Ch',6);assert.ok(values.some(value=>value.label==='Get-ChildItem'));
  }finally{manager.close(item.id);assert.equal(manager.items.size,0);}
});
test('Local shell discovery exposes only Windows PowerShell',()=>{assert.deepEqual(availableShells().map(shell=>shell.id),['powershell']);});
test('Session prompt parser tolerates split control sequences and retains ordinary output',()=>{
  const manager=new Sessions({data:{}},()=>{});const item={id:'fixture',token:'abc',pending:'',chunks:[],seq:0,bufferSize:0,history:[]};
  manager.ingest(item,'hello\x1b]777;ab');manager.ingest(item,'c;P;L2hvbWUvdGVzdA==\x07world');
  assert.equal(item.cwd,'/home/test');assert.equal(item.ready,true);assert.equal(item.chunks.map(chunk=>chunk.data).join(''),'helloworld');
});
