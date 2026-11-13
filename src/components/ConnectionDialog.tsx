import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, RotateCw, Server } from 'lucide-react';
import type { Host, ConnectionOptions, ProbePhase, Session } from '../types';
import Modal from './Modal';
import ConnectionProgress from './ConnectionProgress';
import { useIsPresent } from './Presence';

type Props={host:Host;sessions:Session[];onClose:()=>void;onConnect:(options:ConnectionOptions)=>Promise<Session>;onConnected:(session:Session)=>void;automatic?:boolean};
export default function ConnectionDialog({host,sessions,onClose,onConnect,onConnected,automatic=false}:Props){
  const present=useIsPresent();
  const [secret,setSecret]=useState('');const [visible,setVisible]=useState(false);
  const [phase,setPhase]=useState<ProbePhase>('resolving');const [ready,setReady]=useState(false);
  const [progressFinished,setProgressFinished]=useState(false);const revealed=ready&&progressFinished;
  const [error,setError]=useState('');const [latency,setLatency]=useState(0);const [attempt,setAttempt]=useState(0);
  const [busy,setBusy]=useState(false);const [manual,setManual]=useState(false);const [created,setCreated]=useState<Session|null>(null);
  const input=useRef<HTMLInputElement>(null);const connectRef=useRef(onConnect);connectRef.current=onConnect;
  const createdRef=useRef<Session|null>(null);const pending=useRef(false);const finished=useRef(false);const operation=useRef(0);
  const presentRef=useRef(present);presentRef.current=present;
  const password=host.auth==='password';const saved=password&&host.hasPassword;
  const session=sessions.find(value=>value.id===created?.id)||created;
  const connected=session?.status==='connected';
  const automaticLogin=automatic&&saved&&!manual;
  const cancelPending=()=>{
    operation.current++;pending.current=false;
    if(createdRef.current&&!finished.current){void window.person.closeSession(createdRef.current.id).catch(()=>{});createdRef.current=null;}
  };
  useEffect(()=>()=>cancelPending(),[]);
  useEffect(()=>{if(!present)cancelPending();},[present]);
  useEffect(()=>{
    if(!present)return;
    let active=true;const requestId=crypto.randomUUID();setReady(false);setProgressFinished(false);setError('');setPhase('resolving');
    const off=window.person.onProbe(value=>{if(active&&value.requestId===requestId)setPhase(value.phase);});
    void window.person.probeHost(host.id,requestId).then(result=>{
      if(!active)return;setLatency(result.latencyMs);setReady(true);
    }).catch(error=>{if(active)setError((error as Error).message);});
    return()=>{active=false;off();void window.person.cancelProbe(requestId).catch(()=>{});};
  },[host.id,attempt,present]);
  const start=async(options:ConnectionOptions)=>{
    if(!revealed||!presentRef.current||pending.current||finished.current)return;
    pending.current=true;setBusy(true);setError('');const version=++operation.current;
    try{
      const value=await connectRef.current(options);
      if(version!==operation.current||!presentRef.current){void window.person.closeSession(value.id).catch(()=>{});return;}
      createdRef.current=value;setCreated(value);setSecret('');
    }catch(error){
      if(version!==operation.current||!presentRef.current)return;
      pending.current=false;setBusy(false);setManual(true);setError((error as Error).message);
    }
  };
  const startRef=useRef(start);startRef.current=start;
  useEffect(()=>{
    if(!revealed||!present)return;
    if(automaticLogin)void startRef.current({hostId:host.id,useSavedPassword:true,rememberPassword:true});
    else if(!busy)input.current?.focus();
  },[revealed,present,automaticLogin,host.id,busy]);
  useEffect(()=>{
    if(!session||!['error','disconnected','closed','exited'].includes(session.status))return;
    setError(session.error||'连接已断开，请重试');setBusy(false);setManual(true);pending.current=false;
    void window.person.closeSession(session.id).catch(()=>{});createdRef.current=null;setCreated(null);
  },[session?.id,session?.status,session?.error]);
  const submit=(remember:boolean)=>{
    void start({hostId:host.id,...(password?{password:secret,rememberPassword:remember,useSavedPassword:!!saved&&!secret}:{passphrase:secret})});
  };
  const finish=()=>{
    if(!presentRef.current||!pending.current||!session||session.status!=='connected'||finished.current)return;
    finished.current=true;onConnected(session);
  };
  const close=()=>{cancelPending();onClose();};
  return <Modal title={`连接 ${host.name}`} subtitle={`${host.username}@${host.host}:${host.port}`} onClose={close}>
    <div className={`preflight-card ${revealed?'is-ready':''} ${error?'is-error':''}`}>
      <div className="preflight-heading"><span className="preflight-icon">{connected?<Check size={18}/>:busy?<LoaderCircle size={18} className="spin"/>:revealed?<Check size={18}/>:<Server size={18}/>}</span><div><strong>{error?(ready?'连接未完成':'暂时无法连接'):connected?'连接成功':busy?'正在建立 SSH 连接':revealed?'SSH 服务可达':'正在检测连通性'}</strong><p>{error||(connected?'身份认证已通过，即将进入终端':busy?(session?.phase==='initializing'?'身份认证已通过，正在准备终端':'正在验证身份，请稍候'):revealed?`服务响应 ${latency} ms · 可以继续认证`:'先确认服务器在线，无需发送密码')}</p></div></div>
      <ConnectionProgress key={attempt} flow="probe" phase={connected?'ready':ready?'authentication':phase} waiting={revealed&&!busy&&!error} error={!!error} onAuthenticationReady={()=>setProgressFinished(true)} onComplete={finish}/>
    </div>
    {revealed&&!automaticLogin?<form className="credential-reveal" onSubmit={event=>{event.preventDefault();submit(false);}}>
      <div className="credential-scroll">
        <label htmlFor="connection-secret">{password?'密码（交互认证可留空）':'私钥口令（如有）'}</label>
        <div className="password-input"><input ref={input} id="connection-secret" type={visible?'text':'password'} autoComplete="off" disabled={busy} value={secret} placeholder={saved?'已保存密码；输入可替换':''} onChange={event=>setSecret(event.target.value)}/><button type="button" className="icon-button" disabled={busy} aria-label={visible?'隐藏密码':'显示密码'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
        <div className="credential-note"><LockKeyhole size={15}/><span>{password?'选择“保存并连接”，认证成功后加密保存，下次直接连接。':'私钥口令仅用于此次连接。'}</span></div>
      </div>
      <div className="modal-actions connection-actions"><button className="button secondary" type="button" onClick={close}>{busy&&!connected?'取消连接':'取消'}</button><div className="connection-choices">{password&&<button className="button secondary" type="button" disabled={busy||(!secret&&!saved)} onClick={()=>submit(true)}>保存并连接</button>}<button className="button primary" type="submit" disabled={busy}>{busy?(connected?<Check size={15}/>:<LoaderCircle size={15} className="spin"/>):null}{connected?'连接成功':busy?'正在连接':'直接连接'}{!busy&&<ArrowRight size={15}/>}</button></div></div>
    </form>:<div className="modal-actions"><button className="button secondary" onClick={close}>{busy?'取消连接':'取消'}</button>{error&&!ready&&<button className="button primary" onClick={()=>setAttempt(value=>value+1)}><RotateCw size={15}/>重新检测</button>}</div>}
  </Modal>;
}
