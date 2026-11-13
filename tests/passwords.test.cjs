const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {Store}=require('../electron/store.cjs');
const {Sessions}=require('../electron/sessions.cjs');
const {sshFixture,until}=require('./fixture.cjs');

// Exercise the storage contract without depending on a logged-in Windows user.
const key=crypto.randomBytes(32);
const storage={
  isEncryptionAvailable:()=>true,
  encryptString(value){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]);},
  decryptString(value){const decipher=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));decipher.setAuthTag(value.subarray(12,28));return Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString('utf8');}
};

test('Saved passwords persist encrypted, stay out of renderer/export, and follow server identity',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'person-password-'));
  try{
    let store=new Store(directory,storage);
    const original=store.setHost({host:'example.test',username:'tester',name:'Test'});
    store.setPassword(original,'private-password-中文');
    assert.ok(!fs.readFileSync(store.file,'utf8').includes('private-password'));
    store=new Store(directory,storage);
    assert.equal(store.getPassword(original.id),'private-password-中文');
    assert.equal(store.publicData().hosts[0].hasPassword,true);
    for(const data of [store.publicData(),store.exportData()]){
      assert.ok(!JSON.stringify(data).includes('private-password'));
      assert.ok(!JSON.stringify(data).includes(store.data.passwords[original.id].encrypted));
      assert.equal(data.passwords,undefined);
    }
    assert.equal(store.setHost({...original,name:'Renamed',favorite:true}).hasPassword,true);
    for(const changes of [{host:'other.test'},{port:2222},{username:'another'},{auth:'key'}]){
      store.setHost(original);store.setPassword(original,'private-password');
      assert.equal(store.setHost({...original,...changes}).hasPassword,false);
      assert.throws(()=>store.getPassword(original.id));
      assert.equal(store.setPassword(original,'late-connection-password'),false);
    }
    store.setHost(original);store.setPassword(original,'private-password');
    store.importData({version:1,hosts:[{...original,host:'imported.test'}],passwords:{[original.id]:{encrypted:'untrusted'}}});
    assert.equal(store.publicData().hosts[0].hasPassword,false);
    store.setHost(original);store.setPassword(original,'private-password');
    store.forgetPassword(original.id);assert.equal(new Store(directory,storage).publicData().hosts[0].hasPassword,false);
    store.setPassword(original,'private-password');store.removeHost(original.id);
    assert.deepEqual(Object.keys(store.data.passwords),[]);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Unavailable encryption and failed writes never leave a password marked as saved',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'person-password-fail-'));
  try{
    const store=new Store(directory,{isEncryptionAvailable:()=>false});
    const host=store.setHost({host:'example.test',username:'tester'});
    assert.throws(()=>store.setPassword(host,'private-password'),/加密/);
    assert.equal(store.publicData().hosts[0].hasPassword,false);
    store.safeStorage=storage;store.setPassword(host,'previous-password');
    store.save=()=>{throw new Error('write failed');};
    assert.throws(()=>store.setPassword(host,'new-password'),/write failed/);
    assert.equal(store.getPassword(host.id),'previous-password');
    assert.throws(()=>store.forgetPassword(host.id),/write failed/);
    assert.equal(store.getPassword(host.id),'previous-password');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('SSH remembers only successful opted-in passwords and reconnects after reloading the store',{timeout:30000},async()=>{
  const fixture=await sshFixture();
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'person-password-ssh-'));
  let manager;
  try{
    let store=new Store(directory,storage);
    const host=store.setHost({host:'127.0.0.1',port:fixture.port,username:'tester',name:'Fixture'});
    manager=new Sessions(store,async()=>true);
    async function connect(options){const session=manager.create({hostId:host.id,...options});const item=manager.get(session.id);await until(()=>item.ready||item.status==='error');return item;}
    let item=await connect({password:'wrong-password',rememberPassword:true});
    assert.equal(item.status,'error');assert.equal(store.publicData().hosts[0].hasPassword,false);manager.close(item.id);
    item=await connect({password:'fixture-password'});
    assert.equal(item.status,'connected');assert.equal(store.publicData().hosts[0].hasPassword,false);manager.close(item.id);
    const events=[];manager.on('credentials',event=>events.push(event));
    item=await connect({password:'fixture-password',rememberPassword:true});
    assert.equal(item.status,'connected');assert.equal(store.publicData().hosts[0].hasPassword,true);
    assert.equal(events[0].host.hasPassword,true);assert.ok(!JSON.stringify(events).includes('fixture-password'));
    assert.ok(!JSON.stringify(manager.list()).includes('fixture-password'));manager.closeAll();
    store=new Store(directory,storage);manager=new Sessions(store,async()=>true);
    item=await connect({useSavedPassword:true,rememberPassword:true});
    assert.equal(item.status,'connected');assert.equal(item.ready,true);manager.close(item.id);
    item=await connect({useSavedPassword:true,rememberPassword:false});
    assert.equal(item.status,'connected');assert.equal(store.publicData().hosts[0].hasPassword,false);manager.close(item.id);
    store.safeStorage={isEncryptionAvailable:()=>false};
    let warning;manager.on('credentials',event=>{warning=event.warning;});
    item=await connect({password:'fixture-password',rememberPassword:true});
    assert.equal(item.status,'connected');assert.match(warning,/未能更新/);assert.equal(store.publicData().hosts[0].hasPassword,false);
  }finally{manager?.closeAll();await fixture.close();fs.rmSync(directory,{recursive:true,force:true});}
});
