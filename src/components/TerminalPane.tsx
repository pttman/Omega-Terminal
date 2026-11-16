import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { ArrowDown, ArrowUp, ChevronRight, Command, Copy, File, Folder, History, LoaderCircle, Search, Send, Sparkles, Square, Upload, X } from 'lucide-react';
import type { Candidate, Session, Settings } from '../types';
import '@xterm/xterm/css/xterm.css';
import { terminalThemes, readTerminalTheme, saveTerminalTheme } from '../terminalThemes';
import { terminalAppearance } from '../appearance';
import LoginMessage from './LoginMessage';
import { terminalSelectionText } from '../terminalClipboard';

type Props={immersive:boolean;onRequireUI:()=>void;session:Session;settings:Settings;active:boolean;onFocus:()=>void;onClose:()=>void;onAi:()=>void;onUpload:(files:string[])=>void;onError:(message:string)=>void;staged?:{id:string;command:string};onStaged:()=>void;onDragStart:(event:DragEvent)=>void};
const statusText={connecting:'连接中',connected:'已连接',disconnected:'已断开',error:'连接失败',exited:'已退出',closed:'已关闭'};
export default function TerminalPane(props:Props){
  const {session,settings,active,onFocus,onClose,onAi,onUpload,onError,staged,onStaged}=props;
  const [composerVisible,setComposerVisible]=useState(false);
  const [hasSelection,setHasSelection]=useState(false);
  const copySelection=()=>{if(terminal.current?.hasSelection()){const text=terminalSelectionText(terminal.current);if(text)void window.person.copyText(text).catch(error=>propsRef.current.onError(error.message));}};
  const searchInput=useRef<HTMLInputElement>(null);
  const [colorTheme,setColorTheme]=useState(readTerminalTheme);
  useEffect(()=>{const update=()=>setColorTheme(readTerminalTheme());window.addEventListener('person-terminal-color',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('person-terminal-color',update);window.removeEventListener('storage',update);};},[]);
  useEffect(()=>{if(terminal.current)terminal.current.options.theme=terminalAppearance(terminalThemes[colorTheme].colors);},[colorTheme]);
  const pane=useRef<HTMLElement>(null);const mount=useRef<HTMLDivElement>(null);const terminal=useRef<Terminal|null>(null);const fit=useRef<FitAddon|null>(null);const search=useRef<SearchAddon|null>(null);const input=useRef<HTMLTextAreaElement>(null);
  const propsRef=useRef(props);propsRef.current=props;
  const [fontSize,setFontSize]=useState(settings.fontSize);const [zoom,setZoom]=useState(false);const zoomTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [command,setCommand]=useState('');const commandRef=useRef('');commandRef.current=command;
  const [candidates,setCandidates]=useState<Candidate[]>([]);const [selected,setSelected]=useState(0);const generation=useRef(0);
  const [dragging,setDragging]=useState(false);const [searching,setSearching]=useState(false);const [query,setQuery]=useState('');const [match,setMatch]=useState(true);
  useEffect(()=>{if(searching)searchInput.current?.focus();},[searching]);
  const [pendingCommand,setPendingCommand]=useState<string|null>(null);const [replacePrompt,setReplacePrompt]=useState(false);const [executing,setExecuting]=useState(false);const [preview,setPreview]=useState(false);
  const submitting=useRef(false);
  useEffect(()=>{if(props.immersive&&(preview||replacePrompt))props.onRequireUI();},[props.immersive,preview,replacePrompt]);
  const setFont=(value:number)=>{setFontSize(Math.max(8,Math.min(40,value)));setZoom(true);if(zoomTimeout.current)clearTimeout(zoomTimeout.current);zoomTimeout.current=setTimeout(()=>setZoom(false),1200);};
  const fontRef=useRef(fontSize);fontRef.current=fontSize;
  useEffect(()=>{
    let remainder=0;const element=pane.current;
    const wheel=(event:WheelEvent)=>{if(!event.ctrlKey){remainder=0;return;}event.preventDefault();event.stopPropagation();remainder+=event.deltaY*(event.deltaMode===1?40:1);const steps=Math.trunc(remainder/80);if(steps){remainder-=steps*80;setFont(fontRef.current-steps);}};
    const reset=(event:Event)=>{if((event as CustomEvent).detail===session.id)setFont(propsRef.current.settings.fontSize);};
    element?.addEventListener('wheel',wheel,{passive:false,capture:true});window.addEventListener('person-reset-font',reset);
    return()=>{element?.removeEventListener('wheel',wheel,true);window.removeEventListener('person-reset-font',reset);if(zoomTimeout.current)clearTimeout(zoomTimeout.current);};
  },[session.id]);
  useEffect(()=>{setFontSize(settings.fontSize);},[settings.fontSize]);
  useEffect(()=>{
    const container=mount.current;if(!container)return;
    const term=new Terminal({fontFamily:'"JetBrains Mono", "Cascadia Mono", Consolas, monospace',fontSize:settings.fontSize,fontWeight:400,fontWeightBold:700,lineHeight:1.35,cursorBlink:true,cursorStyle:'block',cursorInactiveStyle:'outline',scrollback:10000,allowProposedApi:false,minimumContrastRatio:4.5,
      theme:terminalAppearance(terminalThemes[readTerminalTheme()].colors)});
    const fitter=new FitAddon();const finder=new SearchAddon();term.loadAddon(fitter);term.loadAddon(finder);term.open(container);terminal.current=term;fit.current=fitter;search.current=finder;
    // Use the title's natural Omega glyph while preserving the terminal cell grid.
    const stylePromptGlyphs=()=>{
      const rows=mount.current?.querySelector('.xterm-rows');
      if(!rows)return;
      const cellWidth=mount.current?.querySelector('.xterm-screen')?.getBoundingClientRect().width;
      for(const marker of rows.querySelectorAll('.xterm-fg-214,.omega-prompt-glyph,div>span:first-child')){
        const row=marker.parentElement;
        const rowIndex=Array.prototype.indexOf.call(rows.children,row);
        const cell=term.buffer.active.getLine(term.buffer.active.viewportY+rowIndex)?.getCell(0);
        // A selected span uses inline colors instead of xterm-fg-214. The buffer
        // retains the original prompt color and identifies it across selection.
        const selectedPrompt=marker===row?.firstElementChild&&cell?.getChars()==='Ω'&&cell.isFgPalette()&&cell.getFgColor()===214;
        const isPrompt=(marker.classList.contains('xterm-fg-214')||selectedPrompt)&&/^Ω[ \u00a0]*$/.test(marker.textContent??'');
        if(marker.classList.contains('omega-prompt-glyph')!==isPrompt)marker.classList.toggle('omega-prompt-glyph',isPrompt);
        const span=marker as HTMLElement;
        if(isPrompt&&cellWidth)span.style.width=`${cellWidth/term.cols*(marker.textContent?.length??1)}px`;
        else span.style.removeProperty('width');
      }
    };
    // Selection and focus redraw rows without emitting onRender. Keep the mark's
    // proportions on every DOM redraw, including reused spans and changed classes.
    const promptGlyphs=new MutationObserver(stylePromptGlyphs);
    promptGlyphs.observe(container,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    stylePromptGlyphs();
    let disposed=false;let lastSeq=0;let loading=true;const queued:{seq:number;data:string}[]=[];
    const write=(chunk:{seq:number;data:string})=>{if(chunk.seq>lastSeq){term.write(chunk.data);lastSeq=chunk.seq;}};
    const unsubscribe=window.person.onData(chunk=>{if(chunk.id!==session.id)return;if(loading)queued.push(chunk);else write(chunk);});
    window.person.buffer(session.id).then(chunks=>{if(disposed)return;for(const chunk of [...chunks,...queued].sort((a,b)=>a.seq-b.seq))write(chunk);loading=false;}).catch(error=>{if(!disposed)propsRef.current.onError(error.message);});
    const resize=()=>{if(disposed||!mount.current?.offsetWidth||!mount.current?.offsetHeight)return;try{fitter.fit();void window.person.resize(session.id,term.cols,term.rows).catch(()=>{});}catch{}};
    const observer=new ResizeObserver(resize);observer.observe(container);requestAnimationFrame(resize);
    const data=term.onData(value=>{void window.person.write(session.id,value).catch(error=>propsRef.current.onError(error.message));});
    const selection=term.onSelectionChange(()=>setHasSelection(term.hasSelection()));
    term.attachCustomKeyEventHandler(event=>{
      if(event.type!=='keydown')return true;
      if(event.ctrlKey&&!event.altKey&&((event.code==='KeyC'&&(event.shiftKey||term.hasSelection()))||(event.code==='Insert'&&!event.shiftKey))){event.preventDefault();event.stopPropagation();copySelection();return false;}
      if(event.ctrlKey&&event.code==='Digit0'){setFont(propsRef.current.settings.fontSize);return false;}
      if(event.ctrlKey&&event.shiftKey&&['KeyT','KeyF','KeyP'].includes(event.code))return false;
      if(event.ctrlKey&&event.code==='Tab')return false;return true;
    });
    const paste=async(event:ClipboardEvent)=>{const text=event.clipboardData?.getData('text');if(text&&/[\r\n]/.test(text)){event.preventDefault();event.stopImmediatePropagation();setPendingCommand(text);setPreview(true);}};
    const copy=(event:ClipboardEvent)=>{if(!term.hasSelection())return;event.preventDefault();event.stopImmediatePropagation();const text=terminalSelectionText(term);if(event.clipboardData)event.clipboardData.setData('text/plain',text);else copySelection();};
    const contextMenu=(event:MouseEvent)=>{event.preventDefault();event.stopImmediatePropagation();void window.person.terminalContextMenu(terminalSelectionText(term)).catch(error=>propsRef.current.onError(error.message));};
    container.addEventListener('paste',paste,true);container.addEventListener('copy',copy,true);container.addEventListener('contextmenu',contextMenu,true);
    const showSearch=(event:Event)=>{if((event as CustomEvent).detail===session.id)setSearching(true);};window.addEventListener('person-search',showSearch);
    return()=>{disposed=true;unsubscribe();observer.disconnect();data.dispose();selection.dispose();promptGlyphs.disconnect();container.removeEventListener('paste',paste,true);container.removeEventListener('copy',copy,true);container.removeEventListener('contextmenu',contextMenu,true);window.removeEventListener('person-search',showSearch);term.dispose();terminal.current=null;};
  },[session.id]);
  useEffect(()=>{if(terminal.current){terminal.current.options.fontSize=fontSize;requestAnimationFrame(()=>{try{fit.current?.fit();void window.person.resize(session.id,terminal.current!.cols,terminal.current!.rows);}catch{}});}},[fontSize,session.id]);
  useEffect(()=>{if(active)requestAnimationFrame(()=>{try{fit.current?.fit();}catch{}});},[active]);
  const wasInteractive=useRef(false);
  useEffect(()=>{
    if(active){
      if(session.interactive)terminal.current?.focus();
      else if(wasInteractive.current&&composerVisible&&!props.immersive)input.current?.focus();
    }
    wasInteractive.current=session.interactive;
  },[session.interactive,active,composerVisible,props.immersive]);
  useEffect(()=>{
    if(!staged)return;
    setComposerVisible(true);
    if(commandRef.current.trim()){setPendingCommand(staged.command);setReplacePrompt(true);}else{setCommand(staged.command);input.current?.focus();}
    onStaged();
  },[staged?.id]);
  useEffect(()=>{
    const version=++generation.current;
    if(!settings.completion||session.interactive||!command.trim()||(!session.ready&&!session.commandRunning)||session.rawDirty){setCandidates([]);return;}
    const timer=setTimeout(()=>{void window.person.complete(session.id,command,input.current?.selectionStart??command.length).then(values=>{if(generation.current===version){setCandidates(values);setSelected(0);}}).catch(()=>{if(generation.current===version)setCandidates([]);});},110);
    return()=>{clearTimeout(timer);};
  },[command,session.interactive,session.cwd,session.ready,session.commandRunning,session.rawDirty,session.id,settings.completion]);
  const accept=(candidate:Candidate)=>{const next=command.slice(0,candidate.start)+candidate.insert+command.slice(candidate.end);setCommand(next);setCandidates([]);generation.current++;requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(candidate.start+candidate.insert.length,candidate.start+candidate.insert.length);});};
  const canRun=session.status==='connected'&&!session.interactive&&(session.ready||session.commandRunning)&&!session.rawDirty&&session.queuedCommands<20;
  const interrupt=()=>{setCandidates([]);generation.current++;void window.person.interrupt(session.id).catch(error=>onError(error.message));input.current?.focus();};
  const execute=async(approved=false)=>{
    const submitted=commandRef.current;
    if(submitting.current||!canRun||!submitted.trim())return;
    if(/[\r\n]/.test(submitted)&&!approved){setPreview(true);return;}
    submitting.current=true;setExecuting(true);setCandidates([]);generation.current++;input.current?.focus();
    try{await window.person.execute(session.id,submitted);setCommand(current=>current===submitted?'':current);setPreview(false);}
    catch(error){onError((error as Error).message);}
    finally{submitting.current=false;setExecuting(false);}
  };
  const find=(back=false)=>{if(!query){setMatch(true);return;}setMatch(!!(back?search.current?.findPrevious(query):search.current?.findNext(query)));};
  const drop=(event:React.DragEvent)=>{event.preventDefault();setDragging(false);const files=window.person.filePaths(Array.from(event.dataTransfer.files));if(files.length)onUpload(files);};
  const composerStatus=session.status!=='connected'?statusText[session.status]:session.interactive?'交互程序 · 命令栏暂停':session.rawDirty?'原生输入未清空':session.commandRunning?`正在执行${session.queuedCommands?` · 待执行 ${session.queuedCommands} 条`:''}`:session.ready?'就绪':session.integrated?'等待提示符':'提示符未集成';
  return <section ref={pane} className={`terminal-pane ${active?'focused':''} ${dragging?'dragging':''}`} onPointerDown={onFocus} onFocus={onFocus} onDragOver={event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=session.kind==='ssh'?'copy':'link';setDragging(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={drop}>
    <div className="pane-header" draggable onDragStart={props.onDragStart} title="拖动到终端边缘分屏，或拖到顶栏成为独立标签"><span className={`status-dot ${session.status}`}/><span className="pane-name">{session.kind==='ssh'?session.host:session.name}</span><span className="pane-type">{session.kind==='ssh'?'SSH':session.shell==='powershell'?'PowerShell':'CMD'}</span><button className="text-button" onClick={()=>setComposerVisible(value=>!value)}>{composerVisible?'收起命令栏':'命令栏'}</button><span className="pane-status">{statusText[session.status]}</span><button className="icon-button small" title="复制选中内容（Ctrl+C / Ctrl+Shift+C）" aria-label="复制选中内容" disabled={!hasSelection} onMouseDown={event=>event.preventDefault()} onClick={copySelection}><Copy size={14}/></button><button className="icon-button small" title="查找输出" onClick={()=>setSearching(value=>!value)}><Search size={14}/></button>{session.kind==='ssh'&&<button className="icon-button small" title="上传文件" onClick={()=>void window.person.pickFiles().then(files=>{if(files.length)onUpload(files);}).catch(error=>onError(error.message))}><Upload size={14}/></button>}<button className="icon-button small" title="关闭分屏" onClick={onClose}><X size={14}/></button></div>
    <div className={`terminal-search ${searching?'is-open':''}`} aria-hidden={!searching} inert={!searching}><Search size={14}/><input ref={searchInput} value={query} placeholder="在此终端中查找…" onChange={event=>{setQuery(event.target.value);setMatch(!event.target.value||!!search.current?.findNext(event.target.value));}} onKeyDown={event=>{if(event.key==='Enter')find(event.shiftKey);if(event.key==='Escape')setSearching(false);}}/>{!match&&<small>无匹配</small>}<button className="icon-button small" title="上一个" onClick={()=>find(true)}><ArrowUp size={14}/></button><button className="icon-button small" title="下一个" onClick={()=>find()}><ArrowDown size={14}/></button><button className="icon-button small" title="关闭搜索" onClick={()=>setSearching(false)}><X size={14}/></button></div>
    <div className="terminal-surface" style={{background:terminalThemes[colorTheme].colors.background}} ref={mount}/>
    {zoom&&<div className="zoom-toast">{fontSize} px <button onClick={()=>setFont(settings.fontSize)}>恢复默认</button></div>}
    {session.error&&<div className="session-error">{session.error}</div>}
    {session.kind==='ssh'&&session.loginMessage&&<LoginMessage message={session.loginMessage}/>}
    {session.startupWarning&&<div className="startup-warning">{session.startupWarning}</div>}
    <div className={`composer-wrap ${composerVisible?'':'hidden'}`} aria-hidden={!composerVisible} inert={!composerVisible}>
      {candidates.length>0&&<div className="completion-list" role="listbox" aria-label="命令补全">{candidates.slice(0,7).map((candidate,index)=>{const Icon=candidate.kind==='directory'?Folder:candidate.kind==='file'?File:candidate.kind==='history'?History:Command;return <button key={`${candidate.kind}-${candidate.label}`} className={selected===index?'selected':''} role="option" aria-selected={selected===index} onMouseDown={event=>event.preventDefault()} onClick={()=>accept(candidate)}><Icon size={14}/><span>{candidate.label}</span><small>{candidate.detail}</small>{selected===index&&<kbd>Tab</kbd>}</button>;})}<div className="completion-help">↑ ↓ 选择 · Tab 补全 · Esc 收起</div></div>}
      <div className="command-composer"><ChevronRight size={18} className={canRun?'accent':'muted'}/><textarea ref={input} rows={1} value={command} aria-label={`${session.name} 命令输入`} spellCheck={false} disabled={session.interactive} placeholder={session.interactive?'交互程序运行中，请在终端内操作…':canRun?(session.commandRunning?'继续输入，Enter 排队执行…':'输入命令，Tab 补全，Enter 执行…'):session.rawDirty?'先清空终端输入；此处可继续编辑…':session.integrated?'等待终端返回提示符；可先编辑…':'可先编辑命令；此 Shell 暂未接入提示符检测'} onChange={event=>setCommand(event.target.value)} onKeyDown={event=>{
        if(event.nativeEvent.isComposing||session.interactive)return;
        if(event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.code==='KeyC'&&event.currentTarget.selectionStart===event.currentTarget.selectionEnd){event.preventDefault();if(session.status==='connected')interrupt();}
        else if(event.key==='Tab'&&candidates.length){event.preventDefault();accept(candidates[selected]||candidates[0]);}
        else if(event.key==='ArrowDown'&&candidates.length){event.preventDefault();setSelected(old=>(old+1)%Math.min(7,candidates.length));}
        else if(event.key==='ArrowUp'&&candidates.length){event.preventDefault();setSelected(old=>(old+Math.min(7,candidates.length)-1)%Math.min(7,candidates.length));}
        else if(event.key==='Escape'){setCandidates([]);generation.current++;}
        else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void execute();}
      }}/><button className="icon-button" title="用自然语言生成命令" onClick={onAi}><Sparkles size={16}/></button>{session.status==='connected'&&!session.interactive&&(!session.ready||session.rawDirty)&&<button className="icon-button composer-stop" title={session.rawDirty?'清空终端输入（Ctrl+C）':'中断并清空待执行命令（Ctrl+C）'} onMouseDown={event=>event.preventDefault()} onClick={interrupt}><Square size={15}/></button>}<button className="run-button" title={canRun?(session.commandRunning?'加入待执行命令（Enter）':'执行命令（Enter）'):composerStatus} disabled={!command.trim()||!canRun||executing} onMouseDown={event=>event.preventDefault()} onClick={()=>void execute()}>{executing?<LoaderCircle size={15} className="spin"/>:<Send size={15}/>}</button></div>
      <div className="composer-footer"><span title={session.cwd}>{session.cwd||'工作目录未确认'}</span><span className="composer-state"><span role="status">{composerStatus}</span>{session.queuedCommands>0&&<button className="text-button" onClick={()=>void window.person.cancelCommands(session.id).catch(error=>onError(error.message))}>清空待执行</button>}<span>{session.integrated?'提示符已集成':'原生终端'} · {fontSize}px</span></span></div>
    </div>
    {dragging&&<div className="drop-overlay"><Upload size={30}/><strong>{session.kind==='ssh'?'松开以上传文件':'松开以填入本地路径'}</strong><span>{session.host||session.name}</span><small>{session.kind==='ssh'?(session.cwd||'松开后选择上传目录'):'路径将填入可编辑命令栏'}</small></div>}
    {replacePrompt&&<div className="pane-confirm"><strong>命令栏已有内容</strong><p>新建议已暂存，你可以替换，也可以保留现有输入。</p><div><button className="button secondary" onClick={()=>{setReplacePrompt(false);}}>保留现有输入</button><button className="button primary" onClick={()=>{setCommand(pendingCommand||'');setPendingCommand(null);setReplacePrompt(false);input.current?.focus();}}>替换输入</button></div></div>}
    {pendingCommand&&!replacePrompt&&!preview&&<button className="pending-command" onClick={()=>setReplacePrompt(true)}>有一条暂存命令，点击查看</button>}
    {preview&&<div className="pane-confirm wide"><strong>检查多行内容</strong><pre>{pendingCommand||command}</pre><p>先填入命令栏，检查后逐条执行。</p><div><button className="button secondary" onClick={()=>{setPreview(false);setPendingCommand(null);}}>取消</button>{pendingCommand?<button className="button primary" onClick={()=>{if(command.trim()){setReplacePrompt(true);setPreview(false);}else{setCommand(pendingCommand);setPendingCommand(null);setPreview(false);}}}>填入命令栏</button>:<button className="button primary" disabled={!canRun} onClick={()=>void execute(true)}>执行这些命令</button>}</div></div>}
  </section>;
}
