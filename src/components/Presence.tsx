import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const Present=createContext(true);
export const useIsPresent=()=>useContext(Present);

// Keep closing overlays mounted until their CSS transition has finished.
export default function Presence({show,children}:{show:boolean;children:ReactNode}){
  const [retained,setRetained]=useState(show);
  const content=useRef(children);
  if(show)content.current=children;
  useEffect(()=>{
    if(show){setRetained(true);return;}
    const timer=setTimeout(()=>setRetained(false),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:300);
    return()=>clearTimeout(timer);
  },[show]);
  if(!show&&!retained)return null;
  return <Present.Provider value={show}><div className="presence" data-open={show} aria-hidden={!show} inert={!show}>{show?children:content.current}</div></Present.Provider>;
}
