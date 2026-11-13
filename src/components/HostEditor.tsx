import { useState, type FormEvent } from 'react';
import { FolderKey, LoaderCircle, Server, Star } from 'lucide-react';
import type { Host } from '../types';
import Modal from './Modal';
export default function HostEditor({host,onClose,onSaved,onPasswordRemoved}:{host?:Host;onClose:()=>void;onSaved:(host:Host,connect:boolean)=>void;onPasswordRemoved:(host:Host)=>void}){
  const [value,setValue]=useState<Partial<Host>>(host||{name:'',host:'',port:22,username:'',group:'',color:'green',auth:'password',keyPath:'',favorite:false,shell:'bash',uploadDirectory:''});
  const [error,setError]=useState('');const [saving,setSaving]=useState(false);
  const update=(key:keyof Host,input:unknown)=>setValue(old=>({...old,[key]:input}));
  const save=async(event:FormEvent,connect=false)=>{event.preventDefault();setError('');setSaving(true);try{onSaved(await window.person.saveHost(value),connect);}catch(error){setError((error as Error).message);}finally{setSaving(false);}};
  return <Modal title={host?'编辑服务器':'新建 SSH 连接'} subtitle="给连接起个名字，下一次一键抵达。" onClose={onClose}>
    <form onSubmit={event=>save(event)}><div className="host-preview"><span className={`host-symbol ${value.color}`}><Server size={22}/></span><div><strong>{value.name||'新的服务器'}</strong><span>{value.username||'user'}@{value.host||'hostname'}:{value.port}</span></div><button type="button" className={`icon-button ${value.favorite?'favorite':''}`} title="收藏" onClick={()=>update('favorite',!value.favorite)}><Star size={18} fill={value.favorite?'currentColor':'none'}/></button></div>
    <label>连接名称<input autoFocus value={value.name} placeholder="例如：我的开发服务器" onChange={e=>update('name',e.target.value)}/></label>
    <div className="form-row host-address"><label>服务器地址<input required value={value.host} placeholder="IP 地址或域名" onChange={e=>update('host',e.target.value)}/></label><label>端口<input required type="number" min="1" max="65535" value={value.port} onChange={e=>update('port',+e.target.value)}/></label></div>
    <div className="form-row"><label>用户名<input required value={value.username} placeholder="root / ubuntu / …" onChange={e=>update('username',e.target.value)}/></label><label>分组<input value={value.group} placeholder="留空归入默认空间" onChange={e=>update('group',e.target.value)}/></label></div>
    <div className="form-row"><label>认证方式<select value={value.auth} onChange={e=>update('auth',e.target.value)}><option value="password">密码 / 交互认证</option><option value="key">私钥文件</option></select></label><label>远程 Shell<select value={value.shell} onChange={e=>update('shell',e.target.value)}><option value="bash">Linux · Bash</option><option value="powershell">Windows · PowerShell</option><option value="cmd">Windows · CMD</option></select></label></div>
    {value.auth==='key'&&<label>私钥文件<div className="input-action"><input required value={value.keyPath} placeholder="选择本地私钥" onChange={e=>update('keyPath',e.target.value)}/><button type="button" className="icon-button" title="选择私钥" onClick={async()=>{const file=await window.person.pickKey();if(file)update('keyPath',file);}}><FolderKey size={17}/></button></div></label>}
    {value.hasPassword&&host&&<div className="saved-password-row"><div><strong>已保存登录密码</strong><p>修改服务器地址、端口、用户名或认证方式后将自动清除。</p></div><button type="button" className="text-button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{const updated=await window.person.forgetPassword(host.id);update('hasPassword',false);onPasswordRemoved(updated);}catch(error){setError((error as Error).message);}finally{setSaving(false);}}}>清除密码</button></div>}
    <label>固定上传目录 <span className="optional">可选，留空跟随可靠的当前目录</span><input value={value.uploadDirectory} placeholder="/home/user/uploads" onChange={e=>update('uploadDirectory',e.target.value)}/></label>
    <div className="color-field"><span>连接颜色</span><div>{['green','blue','orange','purple'].map(color=><button key={color} type="button" className={`color-dot ${color} ${value.color===color?'selected':''}`} title={color} onClick={()=>update('color',color)}/>)}</div></div>
    {error&&<div className="error-message" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button secondary" type="submit" disabled={saving}>保存连接</button><button className="button primary" type="button" disabled={saving} onClick={event=>save(event,true)}>{saving?<LoaderCircle size={15} className="spin"/>:null}保存并连接</button></div></form>
  </Modal>;
}
