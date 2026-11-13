const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {quote,renderTemplate,validateHost,aiEndpoint,normalizeDirectory,safeRemoteName,parseAiResponse}=require('../electron/core.cjs');
const {Store}=require('../electron/store.cjs');
const {tokenAt}=require('../electron/completion.cjs');
const manual=require('../src/shared/manual.json');
test('Shell arguments preserve quotes, reject CMD expansion, and validate numeric parameters',()=>{
  assert.equal(quote("a'b c",'powershell'),"'a''b c'");
  assert.equal(quote("a'b c",'bash'),"'a'\\''b c'");
  assert.equal(quote('C:\\my files\\a.txt','cmd'),'"C:\\my files\\a.txt"');
  assert.throws(()=>quote('%USERPROFILE%','cmd'));
  assert.throws(()=>renderTemplate('ss {{port}}',{port:'22; rm'},'bash'));
  assert.equal(renderTemplate('ss {{port}}',{port:'8080'},'bash'),'ss 8080');
});
test('All manual templates are renderable without unresolved placeholders',()=>{
  assert.equal(new Set(manual.map(entry=>entry.id)).size,manual.length);
  for(const entry of manual){const command=renderTemplate(entry.command,entry.fields,entry.shell);assert.ok(!command.includes('{{'),entry.id);assert.ok(command.length>0);}
});
test('Host persistence explicitly picks allowed fields and never retains auth secrets',()=>{
  const host=validateHost({name:'测试',host:'127.0.0.1',port:22,username:'tester',password:'secret',passphrase:'secret',auth:'password'});
  assert.equal(host.host,'127.0.0.1');assert.equal(host.password,undefined);assert.equal(host.passphrase,undefined);
  assert.throws(()=>validateHost({host:'bad host',username:'test'}));assert.throws(()=>validateHost({host:'good',username:'test',port:65536}));
});
test('AI URL permits local HTTP and HTTPS, rejects embedded credentials and remote plaintext',()=>{
  assert.equal(aiEndpoint('https://example.com/v1/'),'https://example.com/v1/chat/completions');
  assert.equal(aiEndpoint('http://127.0.0.1:11434/v1'),'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(aiEndpoint('https://example.com/v1/chat/completions'),'https://example.com/v1/chat/completions');
  assert.throws(()=>aiEndpoint('http://example.com/v1'));assert.throws(()=>aiEndpoint('https://key:secret@example.com'));assert.throws(()=>aiEndpoint('file:///etc/passwd'));
});
test('Remote paths require explicit absolute directories and leaf filenames',()=>{
  assert.equal(normalizeDirectory('/home/test/../uploads'),'/home/uploads');assert.throws(()=>normalizeDirectory('relative'));
  assert.equal(safeRemoteName('中文 file.txt'),'中文 file.txt');assert.throws(()=>safeRemoteName('../outside'));
});
test('AI structured output separates prose and never treats arbitrary prose as executable',()=>{
  assert.equal(parseAiResponse('```json\n{"command":"pwd","explanation":"位置"}\n```').command,'pwd');
  assert.equal(parseAiResponse('请先告诉我文件路径').command,'');assert.throws(()=>parseAiResponse('{"command":'));
});
test('Completion replacement preserves quoted token boundaries',()=>{
  const line='Get-Content "C:\\my fi';const part=tokenAt(line,line.length);
  assert.equal(part.start,12);assert.equal(part.raw,'"C:\\my fi');assert.equal(part.first,false);
  assert.equal(tokenAt('Get-Ch',6).first,true);assert.equal(tokenAt('git ',4).token,'');
});
test('Legacy local shell preferences migrate to PowerShell and stay migrated after saving',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'person-shell-'));
  try{
    for(const defaultShell of ['cmd','pwsh']){
      fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({settings:{defaultShell,startDirectory:'C:\\work',fontSize:18}}));
      const store=new Store(directory,{});
      assert.equal(store.publicData().settings.defaultShell,'powershell');
      assert.equal(store.publicData().settings.startDirectory,'C:\\work');
      assert.equal(store.setSettings({defaultShell}).defaultShell,'powershell');
      assert.equal(new Store(directory,{}).data.settings.defaultShell,'powershell');
    }
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Config export and import do not move secrets, keys, or trust records',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'person-store-'));
  const storage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('encrypted:'+value),decryptString:value=>value.toString().slice(10)};
  const store=new Store(directory,storage);
  store.setHost({host:'localhost',username:'tester',name:'local',keyPath:'C:\\secret.key'});
  store.setAi({baseUrl:'https://example.com/v1',model:'test-model',key:'private-api-key'});store.data.trustedHosts.localhost='fingerprint';store.save();
  assert.equal(store.getKey(),'private-api-key');assert.equal(store.publicData().ai.encryptedKey,undefined);
  const serialized=JSON.stringify(store.exportData());assert.ok(!serialized.includes('private-api-key'));assert.ok(!serialized.includes('secret.key'));assert.ok(!serialized.includes('fingerprint'));
  const second=new Store(fs.mkdtempSync(path.join(os.tmpdir(),'person-import-')),storage);second.importData(store.exportData());assert.equal(second.data.hosts[0].keyPath,'');assert.deepEqual(second.data.trustedHosts,{});
});
