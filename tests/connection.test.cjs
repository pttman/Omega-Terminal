const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {probeSsh}=require('../electron/probe.cjs');
const {SshStartup}=require('../electron/startup.cjs');
const {sshPrompt}=require('../electron/prompt.cjs');
const {Sessions}=require('../electron/sessions.cjs');
const {sshFixture,until}=require('./fixture.cjs');

test('Preflight reads a split SSH banner without sending credentials, supports timeout and cancellation',async()=>{
  const sockets=new Set();const received=[];let mode='ssh';
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.on('data',data=>received.push(data.toString()));
    if(mode==='ssh'){socket.write('Welcome\r\nSSH-2.');setTimeout(()=>{if(!socket.destroyed)socket.write('0-TestServer\r\n');},20);}
    if(mode==='http')socket.write('HTTP/1.1 200 OK\r\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const host={host:'127.0.0.1',port:server.address().port};
  try{
    const phases=[];const result=await probeSsh(host,{onPhase:value=>phases.push(value)});
    assert.ok(result.latencyMs>=0);assert.ok(phases.includes('handshake'));
    assert.ok(received.every(data=>data==='SSH-2.0-Omega_Preflight\r\n'));
    mode='http';await assert.rejects(probeSsh(host),/SSH 服务/);
    mode='silent';await assert.rejects(probeSsh(host,{timeout:40}),/超时/);
    const controller=new AbortController();const pending=probeSsh(host,{signal:controller.signal});controller.abort();await assert.rejects(pending,/取消/);
  }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
  await assert.rejects(probeSsh(host),/连接被拒绝/);
});

test('Startup hides echoed integration across every marker split while preserving login information and user output',()=>{
  const token='test-token';const command=sshPrompt(token);const marker=`\x1b]777;${token};S\x07`;
  const prefix='Web console: https://localhost:9090/\r\nLast login: today\r\nroot@server:~# '+command+'\r\n';
  for(let split=0;split<=marker.length;split++){
    const gate=new SshStartup(token);
    let result=gate.push(prefix+marker.slice(0,split));
    if(split<marker.length){assert.equal(result,null);result=gate.push(marker.slice(split)+'Ω ~ # ');}
    else assert.equal(result.output,'');
    assert.match(result.loginMessage,/Web console:/);assert.match(result.loginMessage,/Last login:/);
    assert.ok(!result.loginMessage.includes('__person_'));assert.ok(!result.loginMessage.includes('PROMPT_COMMAND'));
    if(split<marker.length)assert.equal(result.output,'Ω ~ # ');
  }
  const gate=new SshStartup(token);gate.push('x'.repeat(100000));assert.ok(gate.buffer.length<=65536);
});

test('SSH terminal starts clean even when the server echoes the entire integration twice',{timeout:20000},async()=>{
  const fixture=await sshFixture({echoStartup:true});
  const store={data:{settings:{},trustedHosts:{},hosts:[{id:'fixture',host:'127.0.0.1',port:fixture.port,username:'tester',name:'Fixture',auth:'password',shell:'bash'}]},save(){}};
  const manager=new Sessions(store,async()=>true);
  try{
    const session=manager.create({hostId:'fixture',password:'fixture-password'});const item=manager.get(session.id);
    await until(()=>item.ready||item.status==='error');assert.equal(item.status,'connected',item.error);
    assert.match(item.loginMessage,/Fixture Linux shell/);
    assert.ok(!item.loginMessage.includes('__person_'));
    let output=item.chunks.map(chunk=>chunk.data).join('');assert.ok(!output.includes('PROMPT_COMMAND'));assert.ok(!output.includes('Fixture Linux shell'));
    manager.execute(item.id,'echo clean-output');await until(()=>item.ready&&item.chunks.some(chunk=>chunk.data.includes('clean-output')));
    output=item.chunks.map(chunk=>chunk.data).join('');assert.match(output,/执行完成 中文: echo clean-output/);
  }finally{manager.closeAll();await fixture.close();}
});
