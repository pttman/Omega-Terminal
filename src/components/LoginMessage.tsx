import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDelayedDismiss } from '../useDelayedDismiss';

export default function LoginMessage({message}:{message:string}){
  const [open,setOpen]=useState(false);
  const id=useId();
  const panel=useRef<HTMLDivElement>(null);
  const [contentWidth,setContentWidth]=useState(618);
  useLayoutEffect(()=>{
    const parent=panel.current?.parentElement;if(!parent)return;
    const measure=()=>setContentWidth(Math.max(0,Math.min(618,parent.clientWidth-34)));
    measure();const observer=new ResizeObserver(measure);observer.observe(parent);return()=>observer.disconnect();
  },[]);
  const dismiss=useDelayedDismiss(open,()=>setOpen(false));
  return <div ref={panel} style={{'--login-content-width':`${contentWidth}px`} as CSSProperties} className={`login-message ${open?'is-open':''}`} {...dismiss} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
    <button className="login-summary" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><span>登录信息</span><ChevronDown size={12}/></button>
    <div id={id} className="login-message-content" aria-hidden={!open} inert={!open}><div><pre>{message}</pre></div></div>
  </div>;
}
