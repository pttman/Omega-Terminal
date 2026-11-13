const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {EventEmitter}=require('node:events');
const {normalizeDirectory,safeRemoteName}=require('./core.cjs');
const call=(target,method,...args)=>new Promise((resolve,reject)=>target[method](...args,(error,result)=>error?reject(error):resolve(result)));
async function exists(sftp,file){try{await call(sftp,'stat',file);return true;}catch(error){if(error.code===2)return false;throw error;}}
class Transfers extends EventEmitter {
  constructor(sessions,ask){super();this.sessions=sessions;this.ask=ask;this.items=new Map();this.running=new Map();}
  public(item){return {id:item.id,sessionId:item.sessionId,host:item.host,name:item.name,directory:item.directory,size:item.size,bytes:item.bytes,status:item.status,error:item.error||'',speed:item.speed||0,cleanup:item.cleanup||'',source:item.source};}
  list(){return [...this.items.values()].map(item=>this.public(item));}
  notify(item){this.emit('state',this.public(item));}
  async enqueue(sessionId,files,directory){
    const session=this.sessions.get(sessionId);if(session.kind!=='ssh'||session.status!=='connected')throw new Error('请先连接目标 SSH 会话');
    directory=normalizeDirectory(directory);const accepted=[];const rejected=[];
    if(!Array.isArray(files)||files.length>500)throw new Error('一次最多上传 500 个文件');
    for(const source of files){
      if(typeof source!=='string')continue;
      let stat;try{stat=await fs.promises.stat(source);}catch{rejected.push(`${path.basename(source)}：无法读取`);continue;}
      if(!stat.isFile()){rejected.push(`${path.basename(source)}：暂不支持文件夹`);continue;}
      const name=safeRemoteName(path.basename(source));
      if([...this.items.values(),...accepted].some(item=>item.sessionId===sessionId&&item.source===source&&item.directory===directory&&['queued','running','waiting'].includes(item.status))){rejected.push(`${name}：已在队列中`);continue;}
      accepted.push({id:crypto.randomUUID(),sessionId,host:`${session.host.username}@${session.host.host}:${session.host.port}`,name,source,directory,size:stat.size,bytes:0,status:'queued'});
    }
    for(const item of accepted){this.items.set(item.id,item);this.notify(item);}
    this.pump(sessionId);return {accepted:accepted.length,rejected};
  }
  pump(sessionId){
    const count=this.running.get(sessionId)||0;if(count>=2)return;
    const item=[...this.items.values()].find(item=>item.sessionId===sessionId&&item.status==='queued');if(!item)return;
    this.running.set(sessionId,count+1);item.status='running';this.notify(item);
    this.run(item).catch(error=>{item.status=item.controller?.signal.aborted?'cancelled':'error';item.error=item.status==='cancelled'?'已取消':error.message;this.notify(item);})
      .finally(()=>{this.running.set(sessionId,(this.running.get(sessionId)||1)-1);this.pump(sessionId);});
    this.pump(sessionId);
  }
  async run(item){
    const controller=new AbortController();item.controller=controller;
    const sftp=await this.sessions.sftp(item.sessionId);let target=path.posix.join(item.directory,item.name);let overwrite=false;
    const directoryStat=await call(sftp,'stat',item.directory);if(!directoryStat.isDirectory())throw new Error('上传目标不是目录');
    if(await exists(sftp,target)){
      item.status='waiting';this.notify(item);
      const action=await this.ask({type:'collision',title:'目标目录中已有同名文件',name:item.name,directory:item.directory,host:item.host,transferId:item.id});
      if(controller.signal.aborted)throw new Error('已取消');
      if(action==='skip'||!action){item.status='skipped';this.notify(item);return;}
      if(action==='keep'){
        const extension=path.posix.extname(item.name);const base=item.name.slice(0,item.name.length-extension.length);
        let index=1;while(await exists(sftp,target=path.posix.join(item.directory,`${base} (${index++})${extension}`))){if(index>10000)throw new Error('无法生成不重复的文件名');}
        item.name=path.posix.basename(target);
      }else if(action==='overwrite')overwrite=true;else throw new Error('上传已取消');
    }
    if(controller.signal.aborted)throw new Error('已取消');
    item.status='running';this.notify(item);
    const temporary=path.posix.join(item.directory,`.person-${item.id}.part`);item.temp=temporary;
    const started=Date.now();let lastUpdate=0;
    const counter=new Transform({transform:(chunk,_encoding,done)=>{
      item.bytes+=chunk.length;const now=Date.now();
      if(now-lastUpdate>180){item.speed=item.bytes/Math.max(1,(now-started)/1000);lastUpdate=now;this.notify(item);}done(null,chunk);
    }});
    try{
      await pipeline(fs.createReadStream(item.source),counter,sftp.createWriteStream(temporary,{flags:'wx',mode:0o600}),{signal:controller.signal});
      if(controller.signal.aborted)throw new Error('已取消');
      if(overwrite){
        if(typeof sftp.ext_openssh_rename!=='function')throw new Error('服务器不支持安全覆盖，原文件保留。请选择保留两份');
        try{await call(sftp,'ext_openssh_rename',temporary,target);}catch{throw new Error('服务器无法安全覆盖，原文件保留。请选择保留两份');}
      }else {
        if(await exists(sftp,target))throw new Error('上传期间目标文件已被创建，请重试并选择同名处理方式');
        await call(sftp,'rename',temporary,target);
      }
      item.temp=null;item.bytes=item.size;item.status='done';this.notify(item);
    }catch(error){
      if(item.temp){try{await call(sftp,'unlink',temporary);item.cleanup='临时文件已清理';}catch(cleanError){item.cleanup=cleanError.code===2?'':'临时文件未能清理：'+temporary;}}
      throw error;
    }
  }
  cancel(id){const item=this.items.get(id);if(!item)return;if(item.status==='queued'){item.status='cancelled';this.notify(item);}else if(['running','waiting'].includes(item.status)){item.controller?.abort();}}
  retry(id){const item=this.items.get(id);if(!item||!['error','cancelled'].includes(item.status))return;item.bytes=0;item.error='';item.cleanup='';item.status='queued';this.notify(item);this.pump(item.sessionId);}
  active(){return [...this.items.values()].filter(item=>['queued','running','waiting'].includes(item.status));}
}
module.exports={Transfers,exists};
