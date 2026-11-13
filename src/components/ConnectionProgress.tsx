import { useEffect, useRef, useState } from 'react';

const stages:Record<string,{label:string;width:string}>={resolving:{label:'解析地址',width:'18%'},connecting:{label:'连接服务器',width:'38%'},handshake:{label:'确认 SSH 服务',width:'62%'},authentication:{label:'正在验证身份',width:'82%'},initializing:{label:'准备终端',width:'90%'},ready:{label:'连接成功',width:'100%'}};
const flows={probe:['resolving','connecting','handshake','authentication','ready'],session:['connecting','handshake','authentication','initializing','ready']};
export default function ConnectionProgress({phase='connecting',error=false,waiting=false,flow='session',onAuthenticationReady,onComplete}:{phase?:string;error?:boolean;waiting?:boolean;flow?:keyof typeof flows;onAuthenticationReady?:()=>void;onComplete?:()=>void}){
  const steps=flows[flow];const [step,setStep]=useState(-1);const entered=useRef(performance.now());const completed=useRef(false);
  const callback=useRef(onComplete);callback.current=onComplete;
  const authenticationCallback=useRef(onAuthenticationReady);authenticationCallback.current=onAuthenticationReady;
  const authenticationRevealed=useRef(false);
  const target=Math.max(0,steps.indexOf(phase));const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(()=>{
    if(step>target){completed.current=false;entered.current=performance.now();setStep(target);}
  },[step,target]);
  useEffect(()=>{
    if(error||completed.current)return;
    if(step<target){
      const delay=reduced?0:step<0?40:Math.max(0,360-(performance.now()-entered.current));
      const timer=setTimeout(()=>{entered.current=performance.now();setStep(reduced?target:step+1);},delay);return()=>clearTimeout(timer);
    }
    if(phase==='authentication'&&steps[step]==='authentication'&&!authenticationRevealed.current){
      const timer=setTimeout(()=>{authenticationRevealed.current=true;authenticationCallback.current?.();},reduced?0:Math.max(0,380-(performance.now()-entered.current)));return()=>clearTimeout(timer);
    }
    if(phase==='ready'&&step===steps.length-1){
      const timer=setTimeout(()=>{completed.current=true;callback.current?.();},reduced?0:Math.max(0,380-(performance.now()-entered.current)));return()=>clearTimeout(timer);
    }
  },[phase,step,target,error,reduced,steps]);
  const visiblePhase=steps[Math.max(0,step)];const stage=stages[visiblePhase];
  return <div className={`connection-progress ${error?'is-error':''} ${waiting?'is-waiting':''} ${visiblePhase==='ready'?'is-complete':''}`} data-phase={visiblePhase} role="status" aria-live="polite"><div className="connection-progress-track"><span style={{width:step<0?'4%':stage.width}}/></div><span className="connection-progress-label">{error?'连接未完成，请检查后重试':visiblePhase==='authentication'&&waiting?'等待身份认证':stage.label}</span></div>;
}
