import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LogOut, Server, Upload } from 'lucide-react';
import type { Boot, ExitRequest } from '../types';
import Modal from './Modal';

export function AboutDialog({boot,onClose}:{boot:Boot;onClose:()=>void}){
  const [error,setError]=useState('');
  return <Modal title="关于 Omega Terminal" subtitle="让每一次连接，都从容一点。" onClose={onClose}>
    <div className="about-brand"><img src="./omega.ico" alt=""/><div><strong>Omega Terminal</strong><span>版本 {boot.version} · Windows {boot.runtime.arch}</span></div><span className="about-badge">预览版</span></div>
    <p className="app-dialog-description">你的个人终端工作区，连接本地 PowerShell 与远程 SSH，随时管理会话、传输文件与查阅命令。</p>
    <dl className="about-details"><div><dt>应用版本</dt><dd>v{boot.version}</dd></div><div><dt>运行环境</dt><dd>Electron {boot.runtime.electron}</dd></div><div><dt>浏览器引擎</dt><dd>Chromium {boot.runtime.chrome}</dd></div><div><dt>项目仓库</dt><dd>pttman / Omega-Terminal</dd></div></dl>
    {error&&<p className="error-message" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button secondary" onClick={()=>void window.person.openRepository().catch(error=>setError(error.message))}>项目与版本发布<ArrowUpRight size={14}/></button><button className="button primary" onClick={onClose}>知道了</button></div>
  </Modal>;
}

export function ExitDialog({request,onCancel,onConfirm}:{request:ExitRequest;onCancel:()=>void;onConfirm:()=>Promise<void>}){
  const [leaving,setLeaving]=useState(false);const [error,setError]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const leave=()=>{
    if(leaving)return;setLeaving(true);
    timer.current=setTimeout(()=>void onConfirm().catch(error=>{setLeaving(false);setError(error.message);}),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:220);
  };
  return <Modal title="准备离开工作区？" subtitle="还有一些工作正在进行。" onClose={()=>{if(!leaving)onCancel();}}>
    <div className={`exit-content ${leaving?'is-leaving':''}`}><div className="exit-symbol"><LogOut size={26}/></div>
      <div className="exit-summary"><div><Server size={18}/><strong>{request.sessions}</strong><span>个活动会话</span></div><div><Upload size={18}/><strong>{request.transfers}</strong><span>个传输任务</span></div></div>
      <p className="app-dialog-description">退出会关闭当前终端和 SSH 连接，并中止未完成的传输。已保存的连接与设置会保留。</p>
    </div>
    {error&&<p className="error-message" role="alert">{error}</p>}
    <div className="modal-actions exit-actions"><span>下次见，工作区随时等你回来。</span><button className="button secondary" data-autofocus disabled={leaving} onClick={onCancel}>继续使用</button><button className="button exit-button" disabled={leaving} onClick={leave}><LogOut size={14}/>{leaving?'正在退出…':'关闭并退出'}</button></div>
  </Modal>;
}
