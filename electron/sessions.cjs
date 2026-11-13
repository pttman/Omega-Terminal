const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');
const { execFile } = require('node:child_process');
const pty = require('node-pty');
const { Client } = require('ssh2');
const { assertString, clamp } = require('./core.cjs');
const { sshPrompt } = require('./prompt.cjs');
const { SshStartup } = require('./startup.cjs');

function availableShells() {
  const candidates = [
    { id:'powershell', name:'Windows PowerShell', shell:'powershell', executable:path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'), subtitle:'Windows 内置 · 5.1' },
  ];
  return candidates.filter(item=>fs.existsSync(item.executable));
}
class Sessions extends EventEmitter {
  constructor(store, ask) { super(); this.store=store; this.ask=ask; this.items=new Map(); }
  public(item) {
    return { id:item.id, name:item.name, kind:item.kind, shell:item.shell, profile:item.profile, status:item.status, cwd:item.cwd,
      ready:item.ready, rawDirty:item.rawDirty, integrated:item.integrated, hostId:item.host?.id, host:item.host ? `${item.host.username}@${item.host.host}:${item.host.port}` : undefined,
      error:item.error || '', phase:item.phase||'',loginMessage:item.loginMessage||'',startupWarning:item.startupWarning||'',createdAt:item.createdAt, history:item.history };
  }
  list() { return [...this.items.values()].map(item=>this.public(item)); }
  get(id) { const item=this.items.get(id); if (!item) throw new Error('会话已关闭'); return item; }
  notify(item) { this.emit('state',this.public(item)); }
  output(item,data) {
    if (!data) return;
    const chunk={id:item.id,seq:++item.seq,data}; item.chunks.push(chunk); item.bufferSize+=data.length;
    while (item.bufferSize>512000 && item.chunks.length>1) item.bufferSize-=item.chunks.shift().data.length;
    this.emit('data',chunk);
  }
  ingest(item,data) {
    const marker=`\x1b]777;${item.token};`;
    item.pending+=data;
    while(item.pending) {
      const start=item.pending.indexOf(marker);
      if (start<0) {
        const escape=item.pending.lastIndexOf('\x1b');
        if (escape>=0 && marker.startsWith(item.pending.slice(escape))) {
          this.output(item,item.pending.slice(0,escape)); item.pending=item.pending.slice(escape);
        } else { this.output(item,item.pending); item.pending=''; }
        break;
      }
      this.output(item,item.pending.slice(0,start)); item.pending=item.pending.slice(start);
      const bell=item.pending.indexOf('\x07'); const st=item.pending.indexOf('\x1b\\',marker.length);
      const end=bell<0 ? st : st<0 ? bell : Math.min(bell,st);
      if (end<0) { if(item.pending.length>16000) { this.output(item,item.pending);item.pending=''; } break; }
      const payload=item.pending.slice(marker.length,end); item.pending=item.pending.slice(end+(end===st?2:1));
      const [type,...rest]=payload.split(';');
      if(type==='P'||type==='C') {
        item.cwd=type==='P' ? Buffer.from(rest.join(';'),'base64').toString('utf8') : rest.join(';');
        item.ready=true;item.rawDirty=false;item.integrated=true;this.notify(item);
      }
    }
  }
  create(input={}) {
    const id=crypto.randomUUID();
    const item={id,token:crypto.randomBytes(20).toString('hex'),createdAt:Date.now(),name:'',kind:input.hostId?'ssh':'local',shell:'powershell',
      status:'connecting',phase:'connecting',cwd:'',ready:false,rawDirty:false,integrated:false,seq:0,chunks:[],bufferSize:0,pending:'',history:[],closed:false, cols:100,rows:30};
    this.items.set(id,item);
    try {
      if(input.hostId) this.connectSsh(item,input);
      else this.connectLocal(item,input);
    } catch(error) { item.status='error';item.error=error.message;this.notify(item); }
    return this.public(item);
  }
  connectLocal(item,input) {
    const shells=availableShells(); const profile=shells.find(shell=>shell.id===(input.profile || this.store.data.settings.defaultShell)) || shells[0];
    if(!profile) throw new Error('没有找到 Windows PowerShell，请检查系统组件是否可用');
    const cwd=input.cwd || this.store.data.settings.startDirectory || os.homedir();
    if(!fs.statSync(cwd).isDirectory()) throw new Error('启动目录不是文件夹');
    Object.assign(item,{name:profile.name,shell:profile.shell,profile:profile.id,cwd});
    const env={...process.env,TERM:'xterm-256color',COLORTERM:'truecolor',PERSON_SESSION_TOKEN:item.token};
    delete env.ELECTRON_RUN_AS_NODE;delete env.PERSON_DEV_URL;
    const script=path.join(__dirname,'integration.ps1').replace(/app\.asar([\\/])/,'app.asar.unpacked$1').replaceAll("'","''");
    const args=['-NoLogo','-NoExit','-ExecutionPolicy','Bypass','-Command',`. '${script}'`];
    item.process=pty.spawn(profile.executable,args,{name:'xterm-256color',cols:item.cols,rows:item.rows,cwd,env,useConpty:true});
    item.process.onData(data=>this.ingest(item,data));
    item.process.onExit(({exitCode})=>{ if(item.closed)return;item.status='exited';item.ready=false;item.error=exitCode?`进程退出，代码 ${exitCode}`:'';this.notify(item); });
    item.status='connected';this.notify(item);
  }
  connectSsh(item,input) {
    const host=this.store.data.hosts.find(host=>host.id===input.hostId);
    if(!host) throw new Error('服务器配置不存在');
    Object.assign(item,{host,name:host.name,shell:host.shell,profile:'ssh'});
    const connection=new Client(); item.connection=connection;
    const config={host:host.host,port:host.port,username:host.username,readyTimeout:60000,keepaliveInterval:15000,keepaliveCountMax:3,
      tryKeyboard:true,
      hostVerifier:(key,callback)=>{
        const fingerprint='SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
        const identity=`[${host.host}]:${host.port}`; const known=this.store.data.trustedHosts[identity];
        if(known===fingerprint) return callback(true);
        this.ask({type:'fingerprint',title:known?'服务器身份已变化':'首次连接此服务器',host:`${host.host}:${host.port}`,fingerprint,previous:known || '',sessionId:item.id})
          .then(accepted=>{ if(accepted===true && !item.closed) {this.store.data.trustedHosts[identity]=fingerprint;this.store.save();callback(true);}else callback(false); })
          .catch(()=>callback(false));
      }
    };
    if(host.auth==='key') { config.privateKey=fs.readFileSync(host.keyPath); if(input.passphrase) config.passphrase=assertString(input.passphrase,'私钥口令',4096); }
    const password=host.auth==='password' ? (input.password ? assertString(input.password,'密码',4096) : input.useSavedPassword===true ? this.store.getPassword(host.id) : '') : '';
    if(password) config.password=password;
    connection.on('keyboard-interactive',(_name,instructions,_language,prompts,finish)=>{
      item.phase='authentication';this.notify(item);
      this.ask({type:'authentication',title:'服务器身份认证',instructions,prompts,sessionId:item.id})
        .then(answers=>finish(Array.isArray(answers)?answers:prompts.map(()=>''))).catch(()=>finish(prompts.map(()=>'')));
    });
    connection.on('ready',()=>{
      if(item.closed)return connection.end();
      item.phase='initializing';this.notify(item);
      if(host.auth==='password' && typeof input.rememberPassword==='boolean'){
        let warning='';
        try{
          if(input.rememberPassword && input.password)this.store.setPassword(host,password);
          else if(!input.rememberPassword)this.store.forgetPassword(host.id,host);
        }catch{warning='连接已成功，但密码保存设置未能更新，请在编辑连接中重试。';}
        const current=this.store.data.hosts.find(value=>value.id===host.id);
        if(current)this.emit('credentials',{host:this.store.publicHost(current),warning});
      }
      connection.shell({term:'xterm-256color',cols:item.cols,rows:item.rows},(error,stream)=>{
        if(error) return this.fail(item,error);
        item.stream=stream;
        if(host.shell==='bash'){
          item.startup=new SshStartup(item.token);
          item.startupTimer=setTimeout(()=>{
            if(!item.startup||item.closed)return;
            item.loginMessage=item.startup.summary();item.startup=null;item.startupWarning='提示符集成未完成，可直接使用原生终端。';
            item.status='connected';item.phase='ready';this.output(item,'\r\n');this.notify(item);
          },10000);
        }else{item.status='connected';item.phase='ready';this.notify(item);}
        const decoder=new StringDecoder('utf8');const stderrDecoder=new StringDecoder('utf8');
        const receive=data=>{
          if(item.closed)return;
          if(item.startup){
            const result=item.startup.push(data);if(!result)return;
            clearTimeout(item.startupTimer);item.startup=null;item.loginMessage=result.loginMessage;item.status='connected';item.phase='ready';this.notify(item);
            this.ingest(item,result.output);
          }else this.ingest(item,data);
        };
        stream.on('data',data=>receive(decoder.write(data)));
        stream.stderr.on('data',data=>receive(stderrDecoder.write(data)));
        stream.on('close',()=>{clearTimeout(item.startupTimer);if(!item.closed){item.status='disconnected';item.ready=false;this.notify(item);}});
        // A per-session prompt hook; no server files or login profile are changed.
        if(host.shell==='bash') {
          stream.write(sshPrompt(item.token));
        }
      });
    });
    connection.on('error',error=>this.fail(item,error));
    connection.on('handshake',()=>{item.phase='authentication';this.notify(item);});
    connection.on('close',()=>{if(!item.closed && item.status!=='error'){item.status='disconnected';item.ready=false;this.notify(item);}});
    connection.connect(config);
  }
  fail(item,error) { if(item.closed)return;clearTimeout(item.startupTimer);item.status='error';item.ready=false;item.error=error.message;this.notify(item); }
  write(id,data) {
    const item=this.get(id);assertString(data,'终端输入',1000000);
    if(item.status!=='connected') return;
    const terminalReport=/^(?:\x1b\[(?:[?>]?[\d;]*[cRn]|[IO]|<?[\d;]*[Mm]))+$/.test(data);
    if(data && !terminalReport) {
      item.rawDirty=true;if(/[\r\n\x03]/.test(data)) item.ready=false;this.notify(item);
    }
    if(item.kind==='local') item.process.write(data);else item.stream?.write(data);
  }
  execute(id,command) {
    const item=this.get(id);assertString(command,'命令',32000);
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command))throw new Error('命令包含不可见控制字符，请重新填写');
    if(!item.ready || item.rawDirty || item.status!=='connected') throw new Error('请先回到空白 Shell 提示符；原生输入可按 Ctrl+C 清空后重试');
    if(!command.trim()) return;
    if(/\{\{.*?\}\}/.test(command)) throw new Error('请先填写命令中的占位参数');
    if(!/[\r\n]/.test(command) && !/(?:password|passwd|secret|token|api[_-]?key)\s*[:= ]/i.test(command)) item.history=[command,...item.history.filter(old=>old!==command)].slice(0,50);
    item.ready=false;item.rawDirty=false;this.notify(item);
    const text=command.replace(/\r\n/g,'\n');
    if(item.kind==='local') item.process.write(text+'\r'); else item.stream.write(text+'\r');
  }
  resize(id,cols,rows) {
    const item=this.get(id);item.cols=Math.floor(clamp(cols,2,500));item.rows=Math.floor(clamp(rows,1,200));
    try { if(item.kind==='local') item.process?.resize(item.cols,item.rows);else item.stream?.setWindow(item.rows,item.cols,0,0); }catch{}
  }
  async sftp(id) {
    const item=this.get(id);
    if(item.kind!=='ssh'||item.status!=='connected')throw new Error('请先连接 SSH 会话');
    if(item.sftp)return item.sftp;
    return new Promise((resolve,reject)=>item.connection.sftp((error,sftp)=>{if(error)reject(new Error('SFTP 不可用：'+error.message));else{item.sftp=sftp;sftp.on('close',()=>{item.sftp=null;});resolve(sftp);}}));
  }
  close(id) {
    const item=this.items.get(id);if(!item)return;
    item.closed=true;item.status='closed';item.ready=false;
    clearTimeout(item.startupTimer);
    try{
      // Let ConPTY drain and clean up through its normal process-exit event.
      // node-pty 1.1's kill helper otherwise races the console being destroyed.
      if(item.process && process.platform==='win32')execFile('taskkill.exe',['/PID',String(item.process.pid),'/T','/F'],{windowsHide:true},error=>{if(error){try{item.process.kill();}catch{}}});
      else item.process?.kill();
      item.stream?.close();item.connection?.end();
    }catch{}
    this.items.delete(id);this.notify(item);
  }
  closeAll() { for(const id of this.items.keys()) this.close(id); }
}
module.exports={Sessions,availableShells};
