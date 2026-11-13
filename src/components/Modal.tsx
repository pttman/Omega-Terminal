import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useIsPresent } from './Presence';
export default function Modal({title,subtitle,children,onClose,wide=false}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  const present=useIsPresent();
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    if(!present)return;
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button,input,textarea,select,[tabindex="0"]')||[]).filter(element=>!element.hasAttribute('disabled'));
    (ref.current?.querySelector<HTMLElement>('[data-autofocus],[autofocus],input,textarea,select')||focusable()[0])?.focus();
    const key=(event:KeyboardEvent)=>{
      const top=Array.from(document.querySelectorAll<HTMLElement>('.modal')).filter(element=>!element.closest('[inert]')&&element.checkVisibility()).at(-1);
      if(top!==ref.current)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRef.current();}
      if(event.key==='Tab'){
        const elements=focusable();const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[present]);
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={ref} className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" title="关闭" onClick={onClose}><X size={18}/></button></div>{children}
  </div></div>;
}
