const net=require('node:net');

// Read the SSH identification only; no username, password or authentication is sent.
function probeSsh(host,{signal,onPhase=()=>{},timeout=8000}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('检测已取消'));
    const started=Date.now();let buffer='',settled=false;
    onPhase('resolving');
    const socket=net.createConnection({host:host.host,port:host.port});
    const timer=setTimeout(()=>finish(new Error('检测超时，请检查服务器地址、端口及网络')),timeout);
    const abort=()=>finish(new Error('检测已取消'));
    function finish(error,value){
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);socket.destroy();
      if(error)reject(error);else resolve(value);
    }
    signal?.addEventListener('abort',abort,{once:true});
    socket.on('lookup',()=>onPhase('connecting'));
    socket.on('connect',()=>{onPhase('handshake');socket.write('SSH-2.0-Omega_Preflight\r\n');});
    socket.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      const lines=buffer.split(/\r?\n/);buffer=lines.pop();
      for(const line of lines){
        if(/^SSH-(?:2\.0|1\.99)-[^\x00-\x20]+/.test(line))return finish(null,{latencyMs:Date.now()-started});
        if(/^SSH-|^HTTP\//.test(line))return finish(new Error('此端口未响应可用的 SSH 服务，请检查端口'));
      }
      if(buffer.length>8192)return finish(new Error('此端口未响应可用的 SSH 服务，请检查端口'));
    });
    socket.on('error',error=>finish(new Error(({ECONNREFUSED:'连接被拒绝，请确认 SSH 服务已启动及端口正确',ENOTFOUND:'无法解析服务器地址，请检查域名',EHOSTUNREACH:'无法到达服务器，请检查网络',ENETUNREACH:'当前网络无法到达服务器',ETIMEDOUT:'检测超时，请检查网络或防火墙'})[error.code]||'无法连接服务器，请检查地址与网络')));
    socket.on('end',()=>finish(new Error('服务器已关闭连接，未完成 SSH 服务检测')));
  });
}
module.exports={probeSsh};
