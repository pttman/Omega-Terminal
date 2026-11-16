const {Server,utils}=require('ssh2');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
async function sshFixture({echoStartup=false,realShell}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'person-sftp-'));fs.mkdirSync(path.join(root,'uploads'));
  const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const clients=new Set();const commands=[];const shellProcesses=new Set();
  const resolve=remote=>{const resolved=path.resolve(root,'.'+String(remote).replace(/^\/home\/test/,''));if(resolved!==root&&!resolved.startsWith(root+path.sep))throw new Error('outside fixture');return resolved;};
  const server=new Server({hostKeys:[privateKey]},client=>{
    clients.add(client);client.on('close',()=>clients.delete(client));client.on('error',()=>{});
    client.on('authentication',ctx=>{if(ctx.username==='tester'&&ctx.method==='password'&&ctx.password==='fixture-password')ctx.accept();else if(ctx.username==='tester'&&ctx.method==='publickey')ctx.accept();else ctx.reject(['password','publickey']);});
    client.on('ready',()=>client.on('session',accept=>{
      const session=accept();let terminalSize={cols:100,rows:30},term;
      session.on('pty',(accept,_reject,info)=>{terminalSize={cols:info.cols,rows:info.rows};accept?.();});
      session.on('window-change',(accept,_reject,info)=>{term?.resize(Math.max(2,info.cols),Math.max(1,info.rows));accept?.();});
      session.on('shell',accept=>{const stream=accept();
        if(realShell){
          term=require('node-pty').spawn(realShell,['--noprofile','--norc','-i'],{...terminalSize,name:'xterm-256color',cwd:root,env:{...process.env,TERM:'xterm-256color'},useConpty:true});
          let stopped=false;
          const stop=()=>{if(stopped)return;stopped=true;try{term.kill();}catch{}};
          shellProcesses.add(stop);
          term.onData(data=>{if(!stream.destroyed)stream.write(data);});
          stream.on('data',data=>term.write(data.toString()));
          term.onExit(()=>{shellProcesses.delete(stop);stop();if(!stream.destroyed)stream.end();});
          stream.on('close',stop);
          return;
        }
        let token='';let pending='';stream.write('Fixture Linux shell\r\n');
        stream.on('data',data=>{pending+=data.toString();let end;while((end=pending.indexOf('\r'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);commands.push(line);
          if(line.includes('PROMPT_COMMAND')){token=line.match(/[a-f0-9]{40}/)?.[0]||'';if(echoStartup){stream.write(line+'\r\nroot@fixture:~# '+line+'\r\n');}stream.write(`\x1b]777;${token};S\x07`);}
          else {const output=Buffer.from(`执行完成 中文: ${line}\r\n`);stream.write(output.subarray(0,2));stream.write(output.subarray(2));}
          if(token)stream.write(`\x1b]777;${token};P;${Buffer.from('/home/test').toString('base64')}\x07tester@fixture:~$ `);
        }});
      });
      session.on('sftp',accept=>{
        const sftp=accept();const handles=new Map();let next=0;const OK=0,FAILURE=4,NO_SUCH_FILE=2;
        const respondError=(id,error)=>sftp.status(id,error.code==='ENOENT'?NO_SUCH_FILE:FAILURE,error.message);
        const handle=entry=>{const buffer=Buffer.alloc(4);buffer.writeUInt32BE(++next);handles.set(buffer.toString('hex'),entry);return buffer;};
        sftp.on('REALPATH',(id,remote)=>sftp.name(id,[{filename:remote==='.'?'/home/test':remote,longname:remote,attrs:{}}]));
        for(const event of ['STAT','LSTAT'])sftp.on(event,(id,remote)=>{try{sftp.attrs(id,fs.statSync(resolve(remote)));}catch(error){respondError(id,error);}});
        sftp.on('OPENDIR',(id,remote)=>{try{sftp.handle(id,handle({entries:fs.readdirSync(resolve(remote)).map(name=>{const stat=fs.statSync(path.join(resolve(remote),name));return {filename:name,longname:name,attrs:stat};})}));}catch(error){respondError(id,error);}});
        sftp.on('READDIR',(id,value)=>{const entry=handles.get(value.toString('hex'));if(!entry)return sftp.status(id,FAILURE);if(entry.sent)return sftp.status(id,1);entry.sent=true;if(!entry.entries.length)return sftp.status(id,1);sftp.name(id,entry.entries);});
        sftp.on('OPEN',(id,remote,flags)=>{try{const fd=fs.openSync(resolve(remote),utils.sftp.flagsToString(flags));sftp.handle(id,handle({fd}));}catch(error){respondError(id,error);}});
        sftp.on('WRITE',(id,value,offset,data)=>{const entry=handles.get(value.toString('hex'));if(!entry)return sftp.status(id,FAILURE);fs.write(entry.fd,data,0,data.length,offset,error=>error?respondError(id,error):sftp.status(id,OK));});
        sftp.on('READ',(id,value,offset,length)=>{const entry=handles.get(value.toString('hex'));if(!entry)return sftp.status(id,FAILURE);const buffer=Buffer.alloc(Math.min(length,32768));fs.read(entry.fd,buffer,0,buffer.length,offset,(error,count)=>error?respondError(id,error):count?sftp.data(id,buffer.subarray(0,count)):sftp.status(id,1));});
        sftp.on('CLOSE',(id,value)=>{const key=value.toString('hex');const entry=handles.get(key);try{if(entry?.fd!==undefined)fs.closeSync(entry.fd);handles.delete(key);sftp.status(id,OK);}catch(error){respondError(id,error);}});
        sftp.on('REMOVE',(id,remote)=>{try{fs.unlinkSync(resolve(remote));sftp.status(id,OK);}catch(error){respondError(id,error);}});
        sftp.on('RENAME',(id,from,to)=>{try{if(fs.existsSync(resolve(to)))return sftp.status(id,FAILURE,'Already exists');fs.renameSync(resolve(from),resolve(to));sftp.status(id,OK);}catch(error){respondError(id,error);}});
        sftp.on('EXTENDED',(id,extension,from,to)=>{if(extension!=='posix-rename@openssh.com')return sftp.status(id,8);try{fs.renameSync(resolve(from),resolve(to));sftp.status(id,OK);}catch(error){respondError(id,error);}});
        sftp.on('close',()=>{for(const entry of handles.values()){try{if(entry.fd!==undefined)fs.closeSync(entry.fd);}catch{}}});
      });
    }));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {port:server.address().port,root,commands,close:async()=>{
    for(const stop of shellProcesses)stop();
    for(const client of clients){client.end();client._sock?.destroy();}
    await new Promise(resolve=>server.close(resolve));
  }};
}
function until(predicate,timeout=15000){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('等待条件超时'));}},25);});}
module.exports={sshFixture,until};
