import { useState } from 'react';
import { ArrowDownToLine, Check, ChevronDown, ChevronUp, Upload, X } from 'lucide-react';
import type { Transfer } from '../types';
import type { useDelayedDismiss } from '../useDelayedDismiss';

const statusLabel:Record<string,string>={queued:'等待中',running:'上传中',waiting:'等待处理',done:'已完成',error:'失败',cancelled:'已取消',skipped:'已跳过'};
const bytes=(value:number)=>value>=1024**3?`${(value/1024**3).toFixed(1)} GB`:value>=1024**2?`${(value/1024**2).toFixed(1)} MB`:value>=1024?`${(value/1024).toFixed(0)} KB`:`${value} B`;
type Props={transfers:Transfer[];onClose:()=>void;dismiss:ReturnType<typeof useDelayedDismiss>};

export default function TransferPanel({transfers,onClose,dismiss}:Props){
  const [expanded,setExpanded]=useState(false);
  const active=transfers.filter(item=>['queued','running','waiting'].includes(item.status)).length;
  const shown=expanded?transfers:transfers.slice(0,3);
  return <section id="transfer-panel" className="transfer-panel" aria-label="文件传输" {...dismiss} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
    <header><Upload size={16}/><strong>文件传输</strong><span>{active?`${active} 个进行中`:'任务记录'}</span><button className="icon-button" title="收起传输面板" onClick={onClose}><X size={16}/></button></header>
    <div className="transfer-items" id="transfer-items" tabIndex={expanded?0:-1} aria-label="传输任务列表">
      {shown.length===0?<div className="small-empty"><ArrowDownToLine size={26}/><p>拖文件到 SSH 终端，即可上传</p></div>:shown.map(item=><div className={`transfer-item ${item.status}`} key={item.id}>
        <div className="transfer-title"><strong title={item.name}>{item.name}</strong><span>{statusLabel[item.status]}</span>{['running','queued','waiting'].includes(item.status)?<button className="icon-button small" title="取消上传" onClick={()=>void window.person.cancelTransfer(item.id)}><X size={13}/></button>:['error','cancelled'].includes(item.status)?<button className="text-button" onClick={()=>void window.person.retryTransfer(item.id)}>重试</button>:item.status==='done'?<Check size={14}/>:null}</div>
        <div className="transfer-destination" title={`${item.host} ${item.directory}`}>{item.host} · {item.directory}</div>
        <div className="progress-track"><span style={{width:`${item.size?Math.min(100,item.bytes/item.size*100):item.status==='done'?100:0}%`}}/></div>
        <div className="transfer-meta"><span>{bytes(item.bytes)} / {bytes(item.size)}</span><span>{item.speed&&item.status==='running'?`${bytes(item.speed)}/s`:''}</span></div>
        {(item.error||item.cleanup)&&<p className={item.error?'transfer-error':'transfer-cleanup'} title={[item.error,item.cleanup].filter(Boolean).join(' · ')}>{[item.error,item.cleanup].filter(Boolean).join(' · ')}</p>}
      </div>)}
    </div>
    {transfers.length>3&&<footer><button className="text-button" aria-expanded={expanded} aria-controls="transfer-items" onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}<span>{expanded?'收起为最近 3 条':`展开全部 ${transfers.length} 条`}</span></button>{expanded&&<span>向下滚动查看更多</span>}</footer>}
  </section>;
}
