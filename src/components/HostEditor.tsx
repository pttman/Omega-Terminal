import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FolderKey, LoaderCircle, X } from 'lucide-react';
import type { Host } from '../types';
import { useIsPresent } from './Presence';

export default function HostEditor({host,onClose,onSaved,onPasswordRemoved}:{host?:Host;onClose:()=>void;onSaved:(host:Host,connect:boolean)=>void;onPasswordRemoved:(host:Host)=>void}){
  const [value,setValue]=useState<Partial<Host>>(host||{name:'',host:'',port:22,username:'',group:'',color:'blue',auth:'password',keyPath:'',favorite:false,shell:'bash',uploadDirectory:''});
  const [error,setError]=useState('');const [saving,setSaving]=useState(false);
  const panel=useRef<HTMLElement>(null);const address=useRef<HTMLInputElement>(null);
  const present=useIsPresent();const available=useRef(present);available.current=present;
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>()=>{available.current=false;},[]);
  useEffect(()=>{
    if(!present)return;
    available.current=true;
    const previous=document.activeElement as HTMLElement|null;const element=panel.current;
    address.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.key!=='Escape'||[...document.querySelectorAll('.modal')].some(modal=>!modal.closest('[inert]')&&modal.checkVisibility()))return;
      event.preventDefault();event.stopPropagation();close.current();
    };
    document.addEventListener('keydown',key,true);
    return()=>{
      document.removeEventListener('keydown',key,true);
      if(element?.contains(document.activeElement)||document.activeElement===document.body)previous?.focus();
    };
  },[present]);
  const update=(key:keyof Host,input:unknown)=>setValue(old=>({...old,[key]:input}));
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(saving)return;
    const connect=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='connect';
    setError('');setSaving(true);
    try{const saved=await window.person.saveHost(value);if(available.current)onSaved(saved,connect);}
    catch(error){if(available.current)setError((error as Error).message);}
    finally{if(available.current)setSaving(false);}
  };
  return <aside ref={panel} className="host-editor" role="dialog" aria-modal="false" aria-label={host?'编辑连接':'新建连接'}>
    <header className="host-editor-heading"><h2>{host?'编辑连接':'新建连接'}</h2><button className="icon-button" title="关闭连接面板" onClick={onClose}><X size={18}/></button></header>
    <form onSubmit={save}>
      <div className="host-editor-fields">
        <div className="host-editor-group"><label>服务器地址<input ref={address} required autoComplete="off" autoCapitalize="none" spellCheck={false} value={value.host} placeholder="IP 地址或域名" onChange={e=>update('host',e.target.value)}/></label></div>
        <div className="host-editor-group">
          <label>用户名<input required autoComplete="off" autoCapitalize="none" spellCheck={false} value={value.username} placeholder="root / ubuntu" onChange={e=>update('username',e.target.value)}/></label>
          <label>端口<input required type="number" inputMode="numeric" min="1" max="65535" step="1" value={value.port??''} onChange={e=>update('port',e.target.value===''?undefined:Number(e.target.value))}/></label>
        </div>
        <div className="host-editor-group">
          <label>认证方式<select aria-label="认证方式" value={value.auth} onChange={e=>update('auth',e.target.value)}><option value="password">密码 / 交互认证</option><option value="key">私钥文件</option></select></label>
          {value.auth==='key'&&<label>私钥文件<div className="input-action"><input required value={value.keyPath} placeholder="选择本地私钥" onChange={e=>update('keyPath',e.target.value)}/><button type="button" className="icon-button" title="选择私钥" onClick={async()=>{try{const file=await window.person.pickKey();if(file&&available.current)update('keyPath',file);}catch(error){if(available.current)setError((error as Error).message);}}}><FolderKey size={17}/></button></div></label>}
          {value.hasPassword&&host&&<div className="host-editor-password"><span>已保存密码</span><button type="button" className="text-button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{const updated=await window.person.forgetPassword(host.id);if(available.current){update('hasPassword',false);onPasswordRemoved(updated);}}catch(error){if(available.current)setError((error as Error).message);}finally{if(available.current)setSaving(false);}}}>清除密码</button></div>}
        </div>
        {error&&<div className="error-message" role="alert">{error}</div>}
      </div>
      <footer className="host-editor-actions"><button className="button secondary" type="submit" value="save" disabled={saving}>保存连接</button><button className="button primary" type="submit" value="connect" disabled={saving}>{saving&&<LoaderCircle size={15} className="spin"/>}保存并连接</button></footer>
    </form>
  </aside>;
}
