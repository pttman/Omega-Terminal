import { useEffect, useRef, useState, type ReactNode, type DragEvent, type PointerEvent } from 'react';
import type { Tab } from '../types';
import { dockEdge, measureLayout, type DockEdge } from '../layout';

export const sessionDragType='application/x-omega-session';
export function startSessionDrag(event:DragEvent,id:string,onStart:(id:string)=>void){
  if((event.target as HTMLElement).closest('button,input,textarea,select')){event.preventDefault();return;}
  event.dataTransfer.setData(sessionDragType,id);event.dataTransfer.effectAllowed='move';onStart(id);
}
const edgeLabels={left:'左侧分屏',right:'右侧分屏',top:'上方分屏',bottom:'下方分屏'};
type Props={tabs:Tab[];activeTab:string;dragSession:string|null;onDock:(id:string,target:string,edge:DockEdge)=>void;onResize:(tab:string,split:string,ratio:number)=>void;renderPane:(id:string)=>ReactNode};
export default function PaneWorkspace({tabs,activeTab,dragSession,onDock,onResize,renderPane}:Props){
  const canvas=useRef<HTMLDivElement>(null);const [preview,setPreview]=useState<{target:string;edge:DockEdge;blocked:boolean}|null>(null);
  const [resizing,setResizing]=useState(false);const resizeCleanup=useRef<()=>void>(()=>{});
  useEffect(()=>{if(!dragSession)setPreview(null);},[dragSession]);
  useEffect(()=>()=>resizeCleanup.current(),[]);
  const over=(event:DragEvent,id:string,tab:Tab)=>{
    if(!dragSession||!event.dataTransfer.types.includes(sessionDragType))return;
    event.preventDefault();event.stopPropagation();
    if(dragSession===id){event.dataTransfer.dropEffect='none';setPreview(null);return;}
    const blocked=tab.sessions.length>=4&&!tab.sessions.includes(dragSession);const box=event.currentTarget.getBoundingClientRect();
    event.dataTransfer.dropEffect=blocked?'none':'move';setPreview({target:id,edge:dockEdge((event.clientX-box.left)/box.width,(event.clientY-box.top)/box.height),blocked});
  };
  const startResize=(event:PointerEvent<HTMLDivElement>,tabId:string,divider:ReturnType<typeof measureLayout>['dividers'][number])=>{
    if(event.button!==0||!canvas.current)return;event.preventDefault();resizeCleanup.current();setResizing(true);
    const rect=canvas.current.getBoundingClientRect(),horizontal=divider.direction==='row';const length=(horizontal?rect.width*divider.bounds.width:rect.height*divider.bounds.height);
    const start=horizontal?rect.left+divider.bounds.x*rect.width:rect.top+divider.bounds.y*rect.height;
    const min=Math.min(.4,(horizontal?180:120)/length);const pointerId=event.pointerId;const handle=event.currentTarget;handle.setPointerCapture(pointerId);
    const move=(value:globalThis.PointerEvent)=>{if(value.pointerId===pointerId)onResize(tabId,divider.id,Math.max(min,Math.min(1-min,((horizontal?value.clientX:value.clientY)-start)/length)));};
    const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',end);if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);setResizing(false);resizeCleanup.current=()=>{};};
    resizeCleanup.current=end;window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',end);
  };
  return <div ref={canvas} className={`pane-canvas ${resizing?'is-resizing':''} ${dragSession?'is-docking':''}`}>
    {tabs.flatMap(tab=>measureLayout(tab.layout).panes.map(({id,bounds})=><div key={id} data-session-id={id} className={`pane-slot ${tab.id!==activeTab?'hidden':''}`} style={{left:`${bounds.x*100}%`,top:`${bounds.y*100}%`,width:`${bounds.width*100}%`,height:`${bounds.height*100}%`}} onDragOver={event=>over(event,id,tab)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setPreview(old=>old?.target===id?null:old);}} onDrop={event=>{
      if(!dragSession||!event.dataTransfer.types.includes(sessionDragType))return;event.preventDefault();event.stopPropagation();
      if(preview?.target===id&&!preview.blocked)onDock(dragSession,id,preview.edge);setPreview(null);
    }}>{renderPane(id)}{preview?.target===id&&<div className={`dock-preview edge-${preview.edge} ${preview.blocked?'is-blocked':''}`}><span>{preview.blocked?'最多 4 个分屏':`松开以${edgeLabels[preview.edge]}`}</span></div>}</div>))}
    {tabs.filter(tab=>tab.id===activeTab).flatMap(tab=>measureLayout(tab.layout).dividers.map(divider=>{
      const {bounds,ratio,direction,id}=divider;const row=direction==='row';
      return <div key={id} className={`pane-divider ${direction}`} role="separator" aria-label={row?'调整左右分屏':'调整上下分屏'} aria-orientation={row?'vertical':'horizontal'} aria-valuemin={10} aria-valuemax={90} aria-valuenow={Math.round(ratio*100)} tabIndex={0} style={row?{left:`calc(${(bounds.x+bounds.width*ratio)*100}% - 3px)`,top:`${bounds.y*100}%`,height:`${bounds.height*100}%`}:{top:`calc(${(bounds.y+bounds.height*ratio)*100}% - 3px)`,left:`${bounds.x*100}%`,width:`${bounds.width*100}%`}} onPointerDown={event=>startResize(event,tab.id,divider)} onDoubleClick={()=>onResize(tab.id,id,.5)} onKeyDown={event=>{
        const delta=(row?event.key==='ArrowRight':event.key==='ArrowDown') ? .05 : (row?event.key==='ArrowLeft':event.key==='ArrowUp') ? -.05 : 0;
        if(delta||event.key==='Home'){event.preventDefault();onResize(tab.id,id,event.key==='Home' ? .5 : ratio+delta);}
      }}><i/></div>;
    }))}
  </div>;
}
