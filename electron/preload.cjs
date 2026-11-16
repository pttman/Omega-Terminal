const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=async(channel,...args)=>{const result=await ipcRenderer.invoke(channel,...args);if(!result.ok)throw new Error(result.error);return result.value;};
const on=(channel,callback)=>{const listener=(_event,value)=>callback(value);ipcRenderer.on(channel,listener);return ()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('person',{
  copyText:text=>invoke('clipboard:write',text),terminalContextMenu:text=>invoke('terminal:contextMenu',text),
  bootstrap:()=>invoke('app:bootstrap'),
  openRepository:()=>invoke('app:repository'),answerExit:(id,confirmed)=>invoke('app:answerExit',id,confirmed),onExitRequested:callback=>on('app:exitRequested',callback),
  saveHost:value=>invoke('host:save',value),deleteHost:id=>invoke('host:delete',id),
  forgetPassword:id=>invoke('host:forgetPassword',id),onHost:callback=>on('host:state',callback),
  probeHost:(id,requestId)=>invoke('host:probe',id,requestId),cancelProbe:requestId=>invoke('host:cancelProbe',requestId),onProbe:callback=>on('probe:state',callback),
  settings:value=>invoke('settings:save',value),saveAi:value=>invoke('ai:settings',value),
  createSession:value=>invoke('session:create',value),closeSession:id=>invoke('session:close',id),
  write:(id,data)=>invoke('session:write',id,data),execute:(id,command)=>invoke('session:execute',id,command),
  interrupt:id=>invoke('session:interrupt',id),cancelCommands:id=>invoke('session:cancelCommands',id),
  resize:(id,cols,rows)=>invoke('session:resize',id,cols,rows),buffer:id=>invoke('session:buffer',id),
  complete:(id,text,cursor)=>invoke('completion:get',id,text,cursor),
  ai:value=>invoke('ai:generate',value),cancelAi:id=>invoke('ai:cancel',id),
  renderManual:(id,fields)=>invoke('manual:render',id,fields),
  pickKey:()=>invoke('dialog:key'),pickDirectory:()=>invoke('dialog:directory'),pickFiles:()=>invoke('dialog:files'),
  exportConfig:()=>invoke('config:export'),readImport:()=>invoke('config:readImport'),importConfig:value=>invoke('config:import',value),
  upload:(id,files,directory)=>invoke('transfer:enqueue',id,files,directory),cancelTransfer:id=>invoke('transfer:cancel',id),retryTransfer:id=>invoke('transfer:retry',id),
  sftpHome:id=>invoke('transfer:home',id),sftpList:(id,directory)=>invoke('transfer:list',id,directory),
  filePaths:files=>Array.from(files).map(file=>webUtils.getPathForFile(file)).filter(Boolean),
  answer:(id,value)=>invoke('question:answer',id,value),window:action=>invoke('window:action',action),windowState:()=>invoke('window:state'),onWindowState:callback=>on('window:state',callback),
  onData:callback=>on('session:data',callback),onSession:callback=>on('session:state',callback),onTransfer:callback=>on('transfer:state',callback),onQuestion:callback=>on('app:question',callback),
});
