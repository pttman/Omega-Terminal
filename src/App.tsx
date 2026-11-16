import { terminalThemes, readTerminalTheme, saveTerminalTheme } from './terminalThemes';
import { appearanceTokens } from './appearance';
import { useDelayedDismiss } from './useDelayedDismiss';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, ChevronRight, Command, Pencil, Home, LayoutGrid, List, LoaderCircle, Maximize, Minus, Plus, Search, Server, Settings2, SlidersHorizontal, Sparkles, SquareSplitHorizontal, SquareSplitVertical, Star, TerminalSquare, Trash2, Upload, X } from 'lucide-react';
import type { Boot, Host, Session, Tab, Transfer, Question, ConnectionOptions, ExitRequest } from './types';
import { AboutDialog, ExitDialog } from './components/AppDialogs';
import TerminalPane from './components/TerminalPane';
import HostEditor from './components/HostEditor';
import Settings from './components/Settings';
import Assistant from './components/Assistant';
import Modal from './components/Modal';
import Presence from './components/Presence';
import QuestionDialog from './components/QuestionDialog';
import UploadDirectory from './components/UploadDirectory';
import ConnectionDialog from './components/ConnectionDialog';
import TransferPanel from './components/TransferPanel';
import PaneWorkspace, { startSessionDrag, sessionDragType } from './components/PaneWorkspace';
import { pane, insertPane, replacePane, removeFromTabs, dockSession, detachSession, resizeSplit, sessionIds, type DockEdge } from './layout';

const emptyHost:Partial<Host>={};
export default function App(){
  const [about,setAbout]=useState(false);const [exitRequest,setExitRequest]=useState<ExitRequest|null>(null);
  const [appearance,setAppearance]=useState(false);
  const appearanceDismiss=useDelayedDismiss(appearance,()=>setAppearance(false));
  const [compact,setCompact]=useState(false);
  const [windowState,setWindowState]=useState({fullscreen:false,maximized:false});
  const [colorTheme,setColorTheme]=useState(readTerminalTheme);
  useEffect(()=>{const update=()=>setColorTheme(readTerminalTheme());window.addEventListener('person-terminal-color',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('person-terminal-color',update);window.removeEventListener('storage',update);};},[]);
  useEffect(()=>{
    const root=document.documentElement;const appearance=appearanceTokens(terminalThemes[colorTheme].colors);
    root.dataset.palette=colorTheme;
    root.dataset.tone=appearance.light?'light':'dark';
    root.dataset.theme=root.dataset.tone;
    for(const [name,value] of Object.entries(appearance.tokens))root.style.setProperty(name,value);
    root.style.colorScheme=appearance.light?'light':'dark';
  },[colorTheme]);
  const [boot,setBoot]=useState<Boot|null>(null);const [failure,setFailure]=useState('');const [sessions,setSessions]=useState<Session[]>([]);const [tabs,setTabs]=useState<Tab[]>([]);const [activeTab,setActiveTab]=useState('home');const [focused,setFocused]=useState('');
  const [section,setSection]=useState('all');const [filter,setFilter]=useState('');const [listView,setListView]=useState(false);
  const [editor,setEditor]=useState<Partial<Host>|null>(null);const [settingsTab,setSettingsTab]=useState<string|null>(null);const [auth,setAuth]=useState<{host:Host;replace?:string;automatic?:boolean}|null>(null);
  const [assistantVisible,setAssistantVisible]=useState(false);const [assistantMode,setAssistantMode]=useState<'ai'|'manual'>('ai');const [assistantTarget,setAssistantTarget]=useState('');
  const [questions,setQuestions]=useState<Question[]>([]);const [transfers,setTransfers]=useState<Transfer[]>([]);const [showTransfers,setShowTransfers]=useState(false);
  const transferDismiss=useDelayedDismiss(showTransfers,()=>setShowTransfers(false));
  const [uploadPrompt,setUploadPrompt]=useState<{session:Session;files:string[]}|null>(null);const uploadDirectories=useRef<Record<string,string>>({});
  const [staged,setStaged]=useState<Record<string,{id:string;command:string}>>({});const [toasts,setToasts]=useState<{id:string;text:string}[]>([]);
  const [confirm,setConfirm]=useState<{title:string;body:string;action:()=>void}|null>(null);const [palette,setPalette]=useState(false);const [paletteQuery,setPaletteQuery]=useState('');const [rename,setRename]=useState<{id:string;title:string}|null>(null);
  const currentTab=tabs.find(tab=>tab.id===activeTab);const activeSession=sessions.find(session=>session.id===focused&&currentTab?.sessions.includes(session.id))||sessions.find(session=>currentTab?.sessions.includes(session.id));
  const immersive=!!currentTab&&(windowState.fullscreen||windowState.maximized);
  const restoreWindow=()=>{void window.person.window('restore');};
  useEffect(()=>{
    if(!window.person)return;
    const off=window.person.onWindowState(setWindowState);
    void window.person.windowState().then(setWindowState).catch(error=>setFailure(error.message));
    return off;
  },[]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.code!=='F11'||event.ctrlKey||event.altKey||event.metaKey)return;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)void window.person.window(immersive||windowState.fullscreen?'restore':'fullscreen');
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  },[immersive,windowState.fullscreen]);
  useEffect(()=>{
    if(!immersive)return;
    const frame=requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>('.terminal-pane.focused .xterm-helper-textarea')?.focus());
    return()=>cancelAnimationFrame(frame);
  },[immersive,focused]);
  useEffect(()=>{
    if(immersive&&(questions.length||exitRequest||uploadPrompt||confirm||editor||settingsTab||auth||rename||palette||about))restoreWindow();
  },[immersive,questions.length,exitRequest,uploadPrompt,confirm,editor,settingsTab,auth,rename,palette,about]);
  const [dragSession,setDragSession]=useState<string|null>(null);const tabHover=useRef<ReturnType<typeof setTimeout>|null>(null);const tabHoverTarget=useRef<string|null>(null);
  const clearTabHover=()=>{if(tabHover.current)clearTimeout(tabHover.current);tabHover.current=null;tabHoverTarget.current=null;};
  const hoverTab=(id:string)=>{if(activeTab===id||tabHoverTarget.current===id)return;clearTabHover();tabHoverTarget.current=id;tabHover.current=setTimeout(()=>setActiveTab(id),400);};
  const finishDrag=()=>{setDragSession(null);clearTabHover();};
  useEffect(()=>{const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape')finishDrag();};window.addEventListener('dragend',finishDrag);window.addEventListener('drop',finishDrag);window.addEventListener('keydown',cancel);window.addEventListener('blur',finishDrag);return()=>{window.removeEventListener('dragend',finishDrag);window.removeEventListener('drop',finishDrag);window.removeEventListener('keydown',cancel);window.removeEventListener('blur',finishDrag);clearTabHover();};},[]);
  const dock=(id:string,target:string,edge:DockEdge)=>{const destination=tabs.find(tab=>tab.sessions.includes(target));if(!destination)return;setTabs(old=>dockSession(old,id,target,edge));setActiveTab(destination.id);setFocused(id);finishDrag();};
  const detach=()=>{if(!dragSession)return;const source=tabs.find(tab=>tab.sessions.includes(dragSession));if(!source)return;const id=source.sessions.length===1?source.id:crypto.randomUUID();setTabs(old=>detachSession(old,dragSession,id,sessions.find(session=>session.id===dragSession)?.name||'终端'));setActiveTab(id);setFocused(dragSession);finishDrag();};
  const notify=(text:string)=>{const id=crypto.randomUUID();setToasts(old=>[...old.slice(-2),{id,text}]);setTimeout(()=>setToasts(old=>old.filter(toast=>toast.id!==id)),5500);};
  useEffect(()=>{
    if(!window.person){setFailure('请通过 npm run dev 或桌面应用打开，浏览器无法直接访问本机 Shell。');return;}
    const offSession=window.person.onSession(session=>setSessions(old=>session.status==='closed'?old.filter(item=>item.id!==session.id):old.some(item=>item.id===session.id)?old.map(item=>item.id===session.id?session:item):[...old,session]));
    const offTransfer=window.person.onTransfer(transfer=>setTransfers(old=>old.some(item=>item.id===transfer.id)?old.map(item=>item.id===transfer.id?transfer:item):[transfer,...old]));
    const offQuestion=window.person.onQuestion(question=>setQuestions(old=>[...old,question]));
    const offExit=window.person.onExitRequested(setExitRequest);
    const offHost=window.person.onHost(({host,warning})=>{setBoot(old=>old?{...old,hosts:old.hosts.map(value=>value.id===host.id?host:value)}:old);if(warning)notify(warning);});
    void window.person.bootstrap().then(data=>{setBoot(data);setSessions(data.sessions);setTransfers(data.transfers);if(data.warning)notify(data.warning);}).catch(error=>setFailure(error.message));
    return()=>{offSession();offTransfer();offQuestion();offHost();offExit();};
  },[]);
  const attachSession=(session:Session,split?:'row'|'column',replace?:string)=>{
      setSessions(old=>old.some(item=>item.id===session.id)?old: [...old,session]);setFocused(session.id);
      if(replace){setTabs(old=>old.map(tab=>({...tab,sessions:tab.sessions.map(id=>id===replace?session.id:id),layout:replacePane(tab.layout,replace,session.id)})));void window.person.closeSession(replace);}
      else if(split&&currentTab&&currentTab.sessions.length<4){setTabs(old=>old.map(tab=>{if(tab.id!==currentTab.id)return tab;const target=tab.sessions.includes(focused)?focused:tab.sessions[0];const layout=insertPane(tab.layout,target,session.id,split==='row'?'right':'bottom');return {...tab,layout,sessions:sessionIds(layout)};}));}
      else{const tab={id:crypto.randomUUID(),title:session.name,sessions:[session.id],layout:pane(session.id)};setTabs(old=>[...old,tab]);setActiveTab(tab.id);}
      if(assistantVisible)setAssistantTarget(session.id);
  };
  const addSession=async(options:ConnectionOptions,split?:'row'|'column',replace?:string)=>{
    try{attachSession(await window.person.createSession(options),split,replace);}catch(error){notify((error as Error).message);}
  };
  const openAssistant=(mode:'ai'|'manual'='ai',id=activeSession?.id)=>{setAssistantMode(mode);setAssistantVisible(true);if(id)setAssistantTarget(id);};
  const selectAssistantTarget=(id:string)=>{
    if(assistantMode==='ai'){setAssistantTarget(id);return;}
    const tab=tabs.find(tab=>tab.sessions.includes(id));
    if(tab){setActiveTab(tab.id);setFocused(id);}
  };
  const connect=(host:Host,replace?:string)=>{
    const current=host;
    const retryAfterError=replace && sessions.find(value=>value.id===replace)?.status==='error';
    setAuth({host:current,replace,automatic:!!(current.auth==='password'&&current.hasPassword&&!retryAfterError)});
  };
  const closeSession=(id:string)=>{
    const session=sessions.find(session=>session.id===id);
    const close=()=>{void window.person.closeSession(id);setTabs(old=>removeFromTabs(old,id));if(currentTab?.sessions.length===1&&currentTab.sessions[0]===id)setActiveTab('home');};
    if(session?.status==='connected'||transfers.some(item=>item.sessionId===id&&['queued','running','waiting'].includes(item.status)))setConfirm({title:'关闭这个会话？',body:'此会话的进程、连接与未完成的传输将结束。',action:close});else close();
  };
  const closeTab=(id:string)=>{
    const tab=tabs.find(tab=>tab.id===id);if(!tab)return;
    const close=()=>{for(const id of tab.sessions)void window.person.closeSession(id);setTabs(old=>old.filter(item=>item.id!==tab.id));if(activeTab===tab.id)setActiveTab('home');};
    if(tab.sessions.some(id=>sessions.find(session=>session.id===id)?.status==='connected'))setConfirm({title:'关闭标签页？',body:`将关闭此标签中的 ${tab.sessions.length} 个会话。`,action:close});else close();
  };
  const stage=(id:string,command:string)=>{const session=sessions.find(session=>session.id===id&&session.status==='connected');if(!session){notify('原会话已关闭或断开，请重新选择目标');return;}const tab=tabs.find(tab=>tab.sessions.includes(id));if(tab)setActiveTab(tab.id);setFocused(id);setStaged(old=>({...old,[id]:{id:crypto.randomUUID(),command}}));};
  const enqueue=async(session:Session,files:string[],directory:string)=>{try{const result=await window.person.upload(session.id,files,directory);if(result.accepted){setShowTransfers(true);notify(`已加入 ${result.accepted} 个上传任务`);}if(result.rejected.length)notify(result.rejected.join('；'));}catch(error){notify((error as Error).message);}};
  const upload=async(session:Session,files:string[])=>{
    if(session.kind==='local'){
      try{
        const paths=files.map(file=>{if(session.shell==='powershell')return `'${file.replaceAll("'","''")}'`;if(/["%\r\n]/.test(file))throw new Error('路径包含 CMD 特殊字符，请手动填写');return `"${file}"`;}).join(' ');stage(session.id,paths);
      }catch(error){notify((error as Error).message);}return;
    }
    if(session.status!=='connected'){notify('请先连接目标 SSH 会话');return;}
    const host=boot?.hosts.find(host=>host.id===session.hostId);
    const directory=host?.uploadDirectory||uploadDirectories.current[session.id]||(session.integrated&&session.cwd.startsWith('/')?session.cwd:'');
    if(directory)await enqueue(session,files,directory);else setUploadPrompt({session,files});
  };
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!boot||event.defaultPrevented||immersive)return;
      if(event.ctrlKey&&event.shiftKey&&event.code==='KeyT'){event.preventDefault();void addSession({profile:boot.settings.defaultShell});}
      if(event.ctrlKey&&event.shiftKey&&event.code==='KeyP'){event.preventDefault();setPalette(true);setPaletteQuery('');}
      if(event.ctrlKey&&event.shiftKey&&event.code==='KeyF'){event.preventDefault();if(activeSession)window.dispatchEvent(new CustomEvent('person-search',{detail:activeSession.id}));}
      if(event.ctrlKey&&event.code==='Tab'){event.preventDefault();const ids=['home',...tabs.map(tab=>tab.id)];const i=ids.indexOf(activeTab);setActiveTab(ids[(i+(event.shiftKey?ids.length-1:1))%ids.length]);}
      if(event.ctrlKey&&event.code==='KeyK'){event.preventDefault();setPalette(true);setPaletteQuery('');}
      if(event.ctrlKey&&event.code==='Digit0'){event.preventDefault();if(activeSession)window.dispatchEvent(new CustomEvent('person-reset-font',{detail:activeSession.id}));}
    };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  });
  if(failure)return <div className="boot-state"><TerminalSquare size={40}/><h1>Ω-Terminal</h1><p>{failure}</p><code>npm run dev</code></div>;
  if(!boot)return <div className="boot-state"><LoaderCircle size={28} className="spin"/><p>正在准备你的工作区…</p></div>;
  const hosts=boot.hosts.filter(host=>(section!=='favorites'||host.favorite)&&(!section.startsWith('group:')||(host.group||'默认空间')===section.slice(6))&&`${host.name} ${host.host} ${host.username} ${host.group}`.toLowerCase().includes(filter.toLowerCase()));
  const groups=[...new Set(boot.hosts.map(host=>host.group||'默认空间'))];const activeTransfers=transfers.filter(item=>['queued','running','waiting'].includes(item.status));
  const paletteActions=[...boot.shells.map(shell=>({id:shell.id,title:`打开 ${shell.name}`,description:'本地终端',action:()=>void addSession({profile:shell.id})})),...boot.hosts.map(host=>({id:host.id,title:host.name,description:`${host.username}@${host.host}`,action:()=>connect(host)})),{id:'new',title:'新建 SSH 连接',description:'保存一台服务器',action:()=>setEditor(emptyHost)},{id:'ai',title:'打开 AI 助手',description:'用自然语言生成命令',action:()=>openAssistant('ai')},{id:'manual',title:'命令手册',description:'离线查询常用命令',action:()=>openAssistant('manual')},{id:'settings',title:'设置',description:'外观、终端与 AI 服务',action:()=>setSettingsTab('appearance')}].filter(item=>`${item.title} ${item.description}`.toLowerCase().includes(paletteQuery.toLowerCase()));
  return <div className={`app-shell config-layout ${activeTab==='home'?'is-home':''} ${immersive?'terminal-immersive':''}`}>
    <div className={`workspace ${compact?'compact-workspace':''}`}><header className="titlebar"><button className="brand titlebar-brand" title="连接配置" onClick={()=>{setActiveTab('home');setSection('all');}}><strong>Ω</strong><span>Terminal</span></button><div className="titlebar-tabs"><button className={`workspace-tab home-tab ${activeTab==='home'?'selected':''}`} onClick={()=>setActiveTab('home')}><Home size={14}/><span>连接</span></button>{tabs.map(tab=><div key={tab.id} className={`workspace-tab ${activeTab===tab.id?'selected':''}`} draggable title="拖动会话到终端边缘分屏" onDragStart={event=>startSessionDrag(event,tab.sessions.includes(focused)?focused:tab.sessions[0],setDragSession)} onDragOver={event=>{if(dragSession&&event.dataTransfer.types.includes(sessionDragType)){event.preventDefault();hoverTab(tab.id);}}} onDragLeave={event=>{const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>=box.right||event.clientY<box.top||event.clientY>=box.bottom)clearTabHover();}} onClick={()=>{setActiveTab(tab.id);if(!tab.sessions.includes(focused))setFocused(tab.sessions[0]);}} onDoubleClick={()=>setRename({id:tab.id,title:tab.title})}><span className={`status-dot ${sessions.find(session=>session.id===tab.sessions[0])?.status||''}`}/><span>{tab.title}{tab.sessions.length>1?` · ${tab.sessions.length}`:''}</span><button title="关闭标签" onClick={event=>{event.stopPropagation();closeTab(tab.id);}}><X size={12}/></button></div>)}{dragSession&&<div className="detach-drop" onDragOver={event=>{if(event.dataTransfer.types.includes(sessionDragType)){event.preventDefault();event.dataTransfer.dropEffect='move';clearTabHover();}}} onDrop={event=>{if(event.dataTransfer.types.includes(sessionDragType)){event.preventDefault();detach();}}}>松开以独立标签</div>}<button className="icon-button tab-plus" title="新建默认终端（Ctrl+Shift+T）" onClick={()=>void addSession({profile:boot.settings.defaultShell})}><Plus size={17}/></button></div><div className="titlebar-drag"/><nav className="tools-nav" aria-label="工具"><button className="icon-button" title="命令手册" onClick={()=>openAssistant('manual')}><BookOpen size={16}/></button><button className="icon-button" title="设置" onClick={()=>setSettingsTab('appearance')}><Settings2 size={16}/></button></nav><button className="appearance-toggle" title="外观与配色" aria-expanded={appearance} aria-controls="appearance-panel" {...appearanceDismiss} onClick={()=>setAppearance(value=>!value)}><SlidersHorizontal size={16}/><span>外观</span></button><button className="icon-button" aria-expanded={!compact} title={compact?'展开工具栏':'收起工具栏'} onClick={()=>setCompact(value=>!value)}>{compact?<ChevronDown size={16}/>:<ChevronUp size={16}/>}</button><button className={`icon-button ${assistantVisible?'accent':''}`} title="随行助手" onClick={()=>assistantVisible?setAssistantVisible(false):openAssistant('ai')}><Sparkles size={17}/></button><div className="window-controls"><button title="最小化" onClick={()=>void window.person.window('minimize')}><Minus size={15}/></button><button title={currentTab?'全屏（F11 退出）':'最大化 / 还原'} onClick={()=>void window.person.window(currentTab?'fullscreen':'maximize')}><Maximize size={13}/></button><button title="关闭窗口" className="window-close" onClick={()=>void window.person.window('close')}><X size={16}/></button></div></header>
      <div className="workspace-body"><main className="main-content">
        <div className={`connections-page ${activeTab!=='home'?'hidden':''}`}>
          <div className="config-controls">
            <div className="filter-input config-search"><Search size={16}/><input placeholder="搜索连接名称、地址、用户名或分组…" aria-label="搜索连接" value={filter} onChange={event=>setFilter(event.target.value)}/>{filter&&<button className="icon-button small" title="清除搜索" onClick={()=>setFilter('')}><X size={14}/></button>}<button className="search-shortcut" title="搜索或跳转（Ctrl+K）" onClick={()=>{setPalette(true);setPaletteQuery(filter);}}>Ctrl K</button></div>
            <div className="config-toolbar"><button className="button primary" onClick={()=>setEditor(emptyHost)}><Plus size={16}/>新建连接</button>{boot.shells.map(shell=><button className="local-card" key={shell.id} onClick={()=>void addSession({profile:shell.id})}><TerminalSquare size={16}/><strong>{shell.name}</strong></button>)}<div className="config-toolbar-spacer"/><select className="connection-scope" aria-label="连接分组" value={section} onChange={event=>setSection(event.target.value)}><option value="all">所有连接</option><option value="favorites">收藏</option>{groups.map(group=><option key={group} value={`group:${group}`}>{group}</option>)}</select><div className="view-toggle"><button className={!listView?'selected':''} title="卡片视图" onClick={()=>setListView(false)}><LayoutGrid size={16}/></button><button className={listView?'selected':''} title="列表视图" onClick={()=>setListView(true)}><List size={16}/></button></div></div>
          </div>
          <section className="host-section"><div className="config-section-heading"><h1>{section==='favorites'?'收藏':section.startsWith('group:')?section.slice(6):'所有连接'}</h1><span>{hosts.length}</span></div>
            {hosts.length?<div className={`host-grid ${listView?'list-view':''}`}>{hosts.map(host=><article className="host-card" key={host.id}>
              <button className="host-open" aria-label="连接" title={`双击连接 ${host.username}@${host.host}:${host.port}`} onDoubleClick={()=>connect(host)} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();connect(host);}}}><span className={`host-symbol ${host.color}`}><Server size={21}/></span><span className="host-card-info"><strong>{host.name}</strong><span>ssh, {host.username}<span className="host-address"> · {host.host}{host.port!==22?`:${host.port}`:''}</span></span></span></button>
              <div className="host-card-actions"><button className={`icon-button small ${host.favorite?'favorite':''}`} title={host.favorite?'取消收藏':'收藏连接'} onClick={async()=>{try{const saved=await window.person.saveHost({...host,favorite:!host.favorite});setBoot({...boot,hosts:boot.hosts.map(item=>item.id===saved.id?saved:item)});}catch(error){notify((error as Error).message);}}}><Star size={14} fill={host.favorite?'currentColor':'none'}/></button><button className="icon-button small" title="编辑连接" onClick={()=>setEditor(host)}><Pencil size={16}/></button><button className="icon-button small delete-host" title="删除连接" onClick={()=>setConfirm({title:'删除这个连接配置？',body:`将移除“${host.name}”，已打开的会话仍可继续使用。`,action:()=>{void window.person.deleteHost(host.id).then(()=>setBoot({...boot,hosts:boot.hosts.filter(item=>item.id!==host.id)})).catch(error=>notify(error.message));}})}><Trash2 size={13}/></button></div>
            </article>)}</div>:<div className="hosts-empty"><Server size={24}/><h3>{filter?'没有找到这个连接':section==='favorites'?'暂无收藏':'暂无连接'}</h3>{filter&&<button className="text-button" onClick={()=>setFilter('')}>清除搜索</button>}</div>}
          </section>
        </div>
        <div className={`terminal-workspace ${!currentTab?'hidden':''}`}>{currentTab&&(()=>{const tab=currentTab;return <><div className="terminal-toolbar"><button className="text-button" onClick={()=>{setActiveTab('home');setSection('all');setFilter('');}}>已保存连接</button><div><TerminalSquare size={14}/><span>{tab.title}</span><ChevronRight size={12}/><span className="muted">{tab.sessions.length>1?`${tab.sessions.length} 个分屏`:'终端会话'}</span></div><div>{activeSession&&['error','exited','disconnected'].includes(activeSession.status)&&<button className="text-button" onClick={()=>{const host=boot.hosts.find(host=>host.id===activeSession.hostId);if(host)connect(host,activeSession.id);else void addSession({profile:activeSession.profile},undefined,activeSession.id);}}>重新连接</button>}<button className="icon-button small" title="左右分屏（新建默认本地终端）" disabled={tab.sessions.length>=4} onClick={()=>void addSession({profile:boot.settings.defaultShell},'row')}><SquareSplitHorizontal size={17}/></button><button className="icon-button small" title="上下分屏（新建默认本地终端）" disabled={tab.sessions.length>=4} onClick={()=>void addSession({profile:boot.settings.defaultShell},'column')}><SquareSplitVertical size={17}/></button><button className="button small-button secondary" onClick={()=>openAssistant('ai')}><Sparkles size={14}/>问问 AI</button></div></div></>;})()}<PaneWorkspace tabs={tabs} activeTab={activeTab} dragSession={dragSession} onDock={dock} onResize={(id,split,ratio)=>setTabs(old=>old.map(tab=>tab.id===id?{...tab,layout:resizeSplit(tab.layout,split,ratio)}:tab))} renderPane={id=>{const session=sessions.find(item=>item.id===id);return session?<TerminalPane session={session} immersive={immersive} onRequireUI={restoreWindow} settings={boot.settings} active={activeTab!=='home'&&currentTab?.sessions.includes(id)===true&&activeSession?.id===id} onFocus={()=>setFocused(id)} onClose={()=>closeSession(id)} onAi={()=>openAssistant('ai',id)} onUpload={files=>void upload(session,files)} onError={notify} staged={staged[id]} onStaged={()=>setStaged(old=>{const next={...old};delete next[id];return next;})} onDragStart={event=>startSessionDrag(event,id,setDragSession)}/>:<div className="pane-loading"><LoaderCircle size={20} className="spin"/></div>;}}/></div>
      </main><Assistant visible={assistantVisible&&!editor} mode={assistantMode} onMode={setAssistantMode} target={assistantMode==='manual'?activeSession:sessions.find(session=>session.id===assistantTarget)} sessions={sessions} ai={boot.ai} onTarget={selectAssistantTarget} onClose={()=>setAssistantVisible(false)} onSettings={()=>setSettingsTab('ai')} onStage={stage} onError={notify}/><Presence show={!!editor}>{editor&&<HostEditor key={editor.id||'new'} host={editor.id?editor as Host:undefined} onClose={()=>setEditor(null)} onPasswordRemoved={host=>{setBoot(old=>old?{...old,hosts:old.hosts.map(value=>value.id===host.id?host:value)}:old);notify('已清除保存的密码');}} onSaved={(host,shouldConnect)=>{setBoot(old=>old?{...old,hosts:[...old.hosts.filter(item=>item.id!==host.id),host]}:old);setSection('all');setFilter('');setEditor(null);if(shouldConnect)connect(host);}}/>}</Presence></div>
      <div className="statusbar"><div><span className="status-dot connected"/><span>{sessions.filter(session=>session.status==='connected').length} 个活动会话</span></div><div><button className="transfer-toggle" aria-expanded={showTransfers} aria-controls="transfer-panel" {...transferDismiss} onClick={()=>setShowTransfers(value=>!value)}><Upload size={12}/>{activeTransfers.length?`${activeTransfers.length} 个传输中`:'传输任务'}{transfers.length>0&&<span className="status-transfer-count">{transfers.length}</span>}</button><button className="version-toggle" title="关于 Omega Terminal" onClick={()=>setAbout(true)}>v{boot.version}</button></div></div>
    </div>
    <aside id="appearance-panel" className={`appearance-panel ${appearance?'is-open':''}`} aria-label="外观" aria-hidden={!appearance} inert={!appearance} {...appearanceDismiss} onKeyDown={event=>{if(event.key==='Escape'){setAppearance(false);document.querySelector<HTMLButtonElement>('.appearance-toggle')?.focus();}}}><div className="appearance-heading"><strong>外观</strong><button className="icon-button" title="收起外观" onClick={()=>setAppearance(false)}><X size={17}/></button></div><p>应用与终端配色</p><div className="theme-cards">{Object.entries(terminalThemes).map(([id,theme])=><button key={id} className={colorTheme===id?'selected':''} onClick={()=>{setColorTheme(id);saveTerminalTheme(id);}}><span className="theme-preview" style={{background:theme.colors.background,color:theme.colors.foreground}}><i style={{background:theme.colors.green}}/><i style={{background:theme.colors.blue}}/><i style={{background:theme.colors.magenta}}/></span><span>{theme.name}</span>{colorTheme===id&&<Check size={16}/>}</button>)}</div></aside>

    <Presence show={!!settingsTab}>{settingsTab&&<Settings boot={boot} initialTab={settingsTab} onClose={()=>setSettingsTab(null)} onChange={(settings,ai)=>{setBoot(old=>old?{...old,settings,ai}:old);void window.person.bootstrap().then(data=>setBoot(data));}}/>}</Presence>
    <Presence show={!!auth}>{auth&&<ConnectionDialog key={auth.host.id} host={auth.host} automatic={auth.automatic} sessions={sessions} onClose={()=>setAuth(null)} onConnect={options=>window.person.createSession(options)} onConnected={session=>{attachSession(session,undefined,auth.replace);setAuth(null);}}/>}</Presence>
    <Presence show={!!questions[0]}>{questions[0]&&<QuestionDialog key={questions[0].id} question={questions[0]} onAnswer={value=>{void window.person.answer(questions[0].id,value);setQuestions(old=>old.slice(1));}}/>}</Presence>
    <Presence show={!!uploadPrompt}>{uploadPrompt&&<UploadDirectory session={uploadPrompt.session} files={uploadPrompt.files} onClose={()=>setUploadPrompt(null)} onConfirm={directory=>{uploadDirectories.current[uploadPrompt.session.id]=directory;void enqueue(uploadPrompt.session,uploadPrompt.files,directory);setUploadPrompt(null);}}/>}</Presence>
    <Presence show={!!confirm}>{confirm&&<Modal title={confirm.title} onClose={()=>setConfirm(null)}><p className="confirm-description">{confirm.body}</p><div className="modal-actions"><button className="button secondary" onClick={()=>setConfirm(null)}>取消</button><button className="button primary" onClick={()=>{confirm.action();setConfirm(null);}}>确认</button></div></Modal>}</Presence>
    <Presence show={!!rename}>{rename&&<Modal title="重命名标签页" onClose={()=>setRename(null)}><form onSubmit={event=>{event.preventDefault();if(rename.title.trim())setTabs(old=>old.map(tab=>tab.id===rename.id?{...tab,title:rename.title.trim()}:tab));setRename(null);}}><label>名称<input autoFocus value={rename.title} maxLength={80} onChange={event=>setRename({...rename,title:event.target.value})}/></label><div className="modal-actions"><button className="button primary" type="submit">保存</button></div></form></Modal>}</Presence>
    <Presence show={!!palette}>{palette&&<Modal title="你想去哪里？" onClose={()=>setPalette(false)}><div className="palette-input"><Search size={18}/><input autoFocus value={paletteQuery} placeholder="搜索主机、Shell 或操作…" onChange={event=>setPaletteQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&paletteActions[0]){paletteActions[0].action();setPalette(false);}}}/><kbd>Esc</kbd></div><div className="palette-results">{paletteActions.map(item=><button key={item.id} onClick={()=>{item.action();setPalette(false);}}><Command size={16}/><div><strong>{item.title}</strong><span>{item.description}</span></div><ArrowRight size={15}/></button>)}{!paletteActions.length&&<p className="muted">没有匹配的操作</p>}</div></Modal>}</Presence>
    <Presence show={showTransfers}>{showTransfers&&<TransferPanel transfers={transfers} dismiss={transferDismiss} onClose={()=>setShowTransfers(false)}/>}</Presence>
    <div className="toast-stack" role="status">{toasts.map(toast=><div className="toast" key={toast.id}><span>{toast.text}</span><button title="关闭提示" onClick={()=>setToasts(old=>old.filter(item=>item.id!==toast.id))}><X size={13}/></button></div>)}</div>
    <Presence show={about}>{about&&<AboutDialog boot={boot} onClose={()=>setAbout(false)}/>}</Presence>
    <Presence show={!!exitRequest}>{exitRequest&&<ExitDialog key={exitRequest.id} request={exitRequest} onCancel={()=>{void window.person.answerExit(exitRequest.id,false).then(()=>setExitRequest(null)).catch(error=>notify(error.message));}} onConfirm={()=>window.person.answerExit(exitRequest.id,true)}/>}</Presence>
  </div>;
}
