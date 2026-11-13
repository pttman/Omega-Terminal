import { useCallback, useEffect, useRef, type FocusEvent, type PointerEvent } from 'react';

// Shared by the menu and its trigger so crossing the gap never closes the menu.
export function useDelayedDismiss(open:boolean,onClose:()=>void,delay=1000){
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const hovered=useRef(false);
  const regions=useRef(new Set<HTMLElement>());
  const state=useRef({open,onClose});state.current={open,onClose};
  const cancel=useCallback(()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;},[]);
  const schedule=useCallback(()=>{
    cancel();
    if(!state.current.open)return;
    timer.current=setTimeout(()=>{
      timer.current=null;
      const focused=document.activeElement;
      const keyboardFocus=focused?.matches(':focus-visible')&&[...regions.current].some(region=>region.contains(focused));
      if(state.current.open&&!hovered.current&&!keyboardFocus)state.current.onClose();
    },delay);
  },[cancel,delay]);
  useEffect(()=>{
    for(const region of regions.current)if(!region.isConnected)regions.current.delete(region);
    hovered.current=open&&[...regions.current].some(region=>region.matches(':hover'));
    if(open&&!hovered.current)schedule();else cancel();
    return cancel;
  },[open,schedule,cancel]);
  return {
    onPointerEnter:(event:PointerEvent<HTMLElement>)=>{regions.current.add(event.currentTarget);hovered.current=true;cancel();},
    onPointerLeave:()=>{hovered.current=false;schedule();},
    onFocusCapture:(event:FocusEvent<HTMLElement>)=>{regions.current.add(event.currentTarget);if(event.target.matches(':focus-visible'))cancel();},
    onBlurCapture:(event:FocusEvent<HTMLElement>)=>{if(!event.currentTarget.contains(event.relatedTarget)&&!hovered.current)schedule();},
  };
}
