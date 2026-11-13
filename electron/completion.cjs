const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {quote,assertString}=require('./core.cjs');
const execFileAsync=promisify(execFile);
const specs={
  'Get-ChildItem':['-Path','-LiteralPath','-Force','-File','-Directory','-Recurse','-Filter'],
  'Get-Content':['-Path','-LiteralPath','-Tail','-Wait','-Raw','-Encoding'],
  'Get-Process':['-Name','-Id'], 'Select-Object':['-First','-Last','-Property'],
  'Select-String':['-Pattern','-Path','-SimpleMatch','-CaseSensitive','-Recurse'],
  'Get-NetTCPConnection':['-LocalPort','-State','-OwningProcess'],
  'Sort-Object':['-Property','-Descending','-Unique'],
  'Copy-Item':['-Path','-LiteralPath','-Destination','-Recurse'],
  'Move-Item':['-Path','-LiteralPath','-Destination'],
  git:['status','diff','log','branch','switch','checkout','add','commit','fetch','pull','push','--help','--version'],
  ls:['-l','-a','-h','-lah','--help'],grep:['-r','-n','-i','-F','--help'],
  tail:['-f','-n','--help'],df:['-h','-T','--help'],du:['-h','--max-depth=1'],
  ss:['-l','-t','-n','-p','-ltnp'],tar:['-xf','-czf','-tzf','-C'],
  dir:['/a','/b','/s','/o'],netstat:['-a','-n','-o','-ano'],tasklist:['/fi','/fo'],
  docker:['ps','images','logs','exec','compose','--help'],
};
const builtins={powershell:['Get-ChildItem','Get-Content','Get-Process','Get-Command','Get-Help','Get-Location','Set-Location','Copy-Item','Move-Item','Remove-Item','New-Item','Select-Object','Select-String','Sort-Object','Get-NetTCPConnection','Get-NetIPAddress','Get-PSDrive','Expand-Archive','Clear-Host','cd','pwd','ls','dir','echo','git'],
  cmd:['dir','cd','cls','type','echo','copy','move','mkdir','rmdir','where','findstr','tasklist','netstat','ipconfig','ping','tar','git'],
  bash:['ls','cd','pwd','cat','tail','head','grep','find','du','df','ps','top','ss','ip','tar','unzip','sort','mkdir','cp','mv','rm','chmod','ssh','git']};
function tokenAt(text,cursor){
  const prefix=text.slice(0,cursor);
  const match=prefix.match(/(?:^|[\s|;])((?:"[^"\n]*|'[^'\n]*|[^\s|;])*)$/);
  const raw=match?.[1]||'';return {start:cursor-raw.length,end:cursor,raw,token:raw.replace(/^['"]/,''),first:!prefix.slice(0,cursor-raw.length).trim()};
}
class Completion {
  constructor(sessions){this.sessions=sessions;this.commandCache=new Map();}
  async get(id,text,cursor){
    assertString(text,'命令输入',32000);const session=this.sessions.get(id);
    const part=tokenAt(text,Math.min(text.length,Math.max(0,cursor)));
    const needle=part.token.toLowerCase(); const candidates=[];
    const push=(label,insert,kind,detail)=>candidates.push({label,insert,kind,detail,start:part.start,end:part.end});
    if(!text.trim())return [];
    if(part.first){
      let commands=builtins[session.shell]||[];
      if(session.kind==='local'){
        const cached=this.commandCache.get(session.shell);
        if(Array.isArray(cached))commands=[...new Set([...commands,...cached])];
        else if(!cached)void this.localCommands(session).then(values=>this.commandCache.set(session.shell,values));
      }
      for(const name of commands)if(name.toLowerCase().startsWith(needle)&&name.toLowerCase()!==needle)push(name,name,'command','命令');
      for(const history of session.history)if(history.toLowerCase().startsWith(text.toLowerCase())&&history!==text)candidates.unshift({label:history,insert:history,kind:'history',detail:'当前会话',start:0,end:text.length});
    }else{
      const command=text.trim().split(/\s+/)[0];
      const key=Object.keys(specs).find(key=>key.toLowerCase()===command.toLowerCase());
      for(const param of specs[key]||[])if(param.toLowerCase().startsWith(needle)&&param.toLowerCase()!==needle)push(param,param,'parameter','参数 / 子命令');
    }
    if(!part.first || /[./\\]/.test(part.token)) {
      try {
        const entries=await this.paths(session,part.token);
        for(const entry of entries) {
          let insert=entry.path;
          if(/[\s'"&;()$`]/.test(insert)||part.raw.startsWith('"')||part.raw.startsWith("'"))insert=quote(insert,session.shell);
          push(entry.name+(entry.directory?'/':''),insert,entry.directory?'directory':'file',session.kind==='ssh'?'远程路径':'本地路径');
        }
      }catch{}
    }
    return candidates.slice(0,40);
  }
  async localCommands(session){
    if(this.commandCache.has(session.shell))return this.commandCache.get(session.shell);
    const promise=(async()=>{
      if(session.shell==='powershell'){
        const executable=session.process?.spawnfile || (session.profile==='pwsh'?'pwsh.exe':'powershell.exe');
        try{const {stdout}=await execFileAsync(executable,['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Command -CommandType Cmdlet,Function,Application -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"],{windowsHide:true,timeout:12000,maxBuffer:2e6});return stdout.split(/\r?\n/).filter(Boolean);}catch{}
      }
      const names=[];
      for(const directory of (process.env.PATH||'').split(path.delimiter)){
        try{for(const entry of await fs.readdir(directory))if(/\.(exe|cmd|bat)$/i.test(entry))names.push(entry.replace(/\.(exe|cmd|bat)$/i,''));}catch{}
      }
      return [...new Set(names)];
    })();this.commandCache.set(session.shell,promise);return promise;
  }
  async paths(session,token){
    if(!session.cwd || !session.integrated)return [];
    const remote=session.kind==='ssh';const paths=remote?path.posix:path;
    const clean=token.replace(/['"]$/,''); const slash=remote?'/':(clean.includes('/')?'/':'\\');
    const split=Math.max(clean.lastIndexOf('/'),clean.lastIndexOf('\\'));
    const prefix=split>=0?clean.slice(0,split+1):''; const leaf=clean.slice(split+1).toLowerCase();
    const directory=paths.resolve(session.cwd,prefix||'.');
    let entries;
    if(remote){
      if(session.shell!=='bash')return [];
      const sftp=await this.sessions.sftp(session.id);
      entries=await new Promise((resolve,reject)=>sftp.readdir(directory,(error,values)=>error?reject(error):resolve(values.map(entry=>({name:entry.filename,directory:entry.attrs.isDirectory()})))));
    }else entries=(await fs.readdir(directory,{withFileTypes:true})).map(entry=>({name:entry.name,directory:entry.isDirectory()}));
    return entries.filter(entry=>entry.name.toLowerCase().startsWith(leaf)).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name)).slice(0,80).map(entry=>({...entry,path:prefix+entry.name+(entry.directory?slash:'')}));
  }
}
module.exports={Completion,tokenAt,specs};
