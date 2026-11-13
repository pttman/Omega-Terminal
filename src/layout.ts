import type { Tab } from './types';

export type DockEdge='left'|'right'|'top'|'bottom';
export type PaneLayout={kind:'pane';sessionId:string}|{kind:'split';id:string;direction:'row'|'column';ratio:number;first:PaneLayout;second:PaneLayout};
export type Bounds={x:number;y:number;width:number;height:number};
export const pane=(sessionId:string):PaneLayout=>({kind:'pane',sessionId});
export const sessionIds=(layout:PaneLayout):string[]=>layout.kind==='pane'?[layout.sessionId]:[...sessionIds(layout.first),...sessionIds(layout.second)];
export function removePane(layout:PaneLayout,id:string):PaneLayout|null{
  if(layout.kind==='pane')return layout.sessionId===id?null:layout;
  const first=removePane(layout.first,id),second=removePane(layout.second,id);
  return first&&second?{...layout,first,second}:first||second;
}
export function replacePane(layout:PaneLayout,id:string,next:string):PaneLayout{
  return layout.kind==='pane'?(layout.sessionId===id?pane(next):layout):{...layout,first:replacePane(layout.first,id,next),second:replacePane(layout.second,id,next)};
}
export function insertPane(layout:PaneLayout,target:string,id:string,edge:DockEdge):PaneLayout{
  if(layout.kind==='split')return {...layout,first:insertPane(layout.first,target,id,edge),second:insertPane(layout.second,target,id,edge)};
  if(layout.sessionId!==target)return layout;
  const before=edge==='left'||edge==='top';
  return {kind:'split',id:crypto.randomUUID(),direction:edge==='left'||edge==='right'?'row':'column',ratio:.5,first:before?pane(id):layout,second:before?layout:pane(id)};
}
export function removeFromTabs(tabs:Tab[],id:string):Tab[]{
  return tabs.flatMap(tab=>{const layout=removePane(tab.layout,id);return layout?[{...tab,layout,sessions:sessionIds(layout)}]:[];});
}
export function dockSession(tabs:Tab[],id:string,target:string,edge:DockEdge):Tab[]{
  const source=tabs.find(tab=>tab.sessions.includes(id)),destination=tabs.find(tab=>tab.sessions.includes(target));
  if(!source||!destination||id===target||(source.id!==destination.id&&destination.sessions.length>=4))return tabs;
  return removeFromTabs(tabs,id).map(tab=>{
    if(tab.id!==destination.id)return tab;
    const layout=insertPane(tab.layout,target,id,edge);return {...tab,layout,sessions:sessionIds(layout)};
  });
}
export function detachSession(tabs:Tab[],id:string,tabId:string,title:string):Tab[]{
  const source=tabs.find(tab=>tab.sessions.includes(id));if(!source||source.sessions.length===1)return tabs;
  return [...removeFromTabs(tabs,id),{id:tabId,title,sessions:[id],layout:pane(id)}];
}
export function resizeSplit(layout:PaneLayout,id:string,ratio:number):PaneLayout{
  if(layout.kind==='pane')return layout;
  return layout.id===id?{...layout,ratio:Math.max(.1,Math.min(.9,ratio))}:{...layout,first:resizeSplit(layout.first,id,ratio),second:resizeSplit(layout.second,id,ratio)};
}
export function measureLayout(layout:PaneLayout,bounds:Bounds={x:0,y:0,width:1,height:1}):{panes:{id:string;bounds:Bounds}[];dividers:{id:string;direction:'row'|'column';ratio:number;bounds:Bounds}[]}{
  if(layout.kind==='pane')return {panes:[{id:layout.sessionId,bounds}],dividers:[]};
  const {x,y,width,height}=bounds;const horizontal=layout.direction==='row';
  const first=measureLayout(layout.first,{x,y,width:horizontal?width*layout.ratio:width,height:horizontal?height:height*layout.ratio});
  const second=measureLayout(layout.second,{x:horizontal?x+width*layout.ratio:x,y:horizontal?y:y+height*layout.ratio,width:horizontal?width*(1-layout.ratio):width,height:horizontal?height:height*(1-layout.ratio)});
  return {panes:[...first.panes,...second.panes],dividers:[{id:layout.id,direction:layout.direction,ratio:layout.ratio,bounds},...first.dividers,...second.dividers]};
}
export function dockEdge(x:number,y:number):DockEdge{
  const edges:[DockEdge,number][]=[['left',x],['right',1-x],['top',y],['bottom',1-y]];
  return edges.sort((a,b)=>a[1]-b[1])[0][0];
}
