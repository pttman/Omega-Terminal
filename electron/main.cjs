const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {Store}=require('./store.cjs');
const {Sessions,availableShells}=require('./sessions.cjs');
const {Completion}=require('./completion.cjs');
const {Transfers}=require('./transfers.cjs');
const {Ai}=require('./ai.cjs');
const {probeSsh}=require('./probe.cjs');
const {renderTemplate,normalizeDirectory}=require('./core.cjs');
const manual=require('../src/shared/manual.json');

if(process.env.PERSON_TEST)app.setPath('userData',path.resolve('test-results',`runtime-${process.env.PERSON_TEST.replace(/[^\w-]/g,'')}`));
else if(!app.isPackaged)app.setPath('userData',path.join(__dirname,'..','.local-data'));
app.setName('Ω-Terminal');
let window,store,sessions,transfers,completion,ai,exiting=false,exitRequest=null;
const testExitBypass=()=>process.env.PERSON_TEST&&!process.env.PERSON_TEST_EXIT;
const questions=new Map();
const probes=new Map();
const send=(channel,value)=>{if(window&&!window.isDestroyed())window.webContents.send(channel,value);};
function ask(value){return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID();const timer=setTimeout(()=>{questions.delete(id);reject(new Error('操作等待超时'));},120000);
  questions.set(id,{...value,resolve:value=>{clearTimeout(timer);resolve(value);}});send('app:question',{...value,id});
});}
function handle(channel,fn){ipcMain.handle(channel,async(event,...args)=>{
  try{
    if(event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('无效调用来源');
    return {ok:true,value:await fn(...args)};
  }catch(error){return {ok:false,error:error.message||'操作失败'};}
});}
function register(){
  handle('app:bootstrap',()=>({...store.publicData(),shells:availableShells().map(({executable,...shell})=>shell),sessions:sessions.list(),transfers:transfers.list(),version:app.getVersion(),runtime:{platform:process.platform,arch:process.arch,electron:process.versions.electron,chrome:process.versions.chrome}}));
  handle('app:repository',()=>shell.openExternal('https://github.com/pttman/Omega-Terminal'));
  handle('app:answerExit',(id,confirmed)=>{
    if(!exitRequest||exitRequest.id!==id||typeof confirmed!=='boolean')throw new Error('退出请求已失效');
    exitRequest=null;
    if(confirmed){exiting=true;window.close();}
  });
  handle('host:save',value=>store.setHost(value));handle('host:delete',id=>store.removeHost(id));
  handle('host:forgetPassword',id=>store.forgetPassword(id));
  handle('host:probe',async(id,requestId)=>{
    const host=store.data.hosts.find(value=>value.id===id);
    if(!host)throw new Error('服务器配置不存在');
    if(typeof requestId!=='string'||! /^[\w-]{1,80}$/.test(requestId)||probes.has(requestId)||probes.size>=8)throw new Error('无效的连接检测请求');
    const controller=new AbortController();probes.set(requestId,controller);
    try{return await probeSsh(host,{signal:controller.signal,onPhase:phase=>send('probe:state',{requestId,phase})});}
    finally{probes.delete(requestId);}
  });
  handle('host:cancelProbe',requestId=>{probes.get(requestId)?.abort();});
  handle('settings:save',value=>store.setSettings(value));handle('ai:settings',value=>store.setAi(value));
  handle('session:create',value=>sessions.create(value));handle('session:close',id=>sessions.close(id));
  handle('session:write',(id,data)=>sessions.write(id,data));handle('session:execute',(id,command)=>sessions.execute(id,command));
  handle('session:resize',(id,cols,rows)=>sessions.resize(id,cols,rows));handle('session:buffer',id=>sessions.get(id).chunks);
  handle('completion:get',(id,text,cursor)=>completion.get(id,text,cursor));
  handle('ai:generate',value=>ai.generate(value));handle('ai:cancel',id=>ai.cancel(id));
  handle('manual:render',(id,fields)=>{const entry=manual.find(entry=>entry.id===id);if(!entry)throw new Error('命令不存在');return renderTemplate(entry.command,fields,entry.shell);});
  handle('dialog:key',async()=>{const value=await dialog.showOpenDialog(window,{title:'选择 SSH 私钥',properties:['openFile']});return value.canceled?null:value.filePaths[0];});
  handle('dialog:directory',async()=>{const value=await dialog.showOpenDialog(window,{title:'选择启动目录',properties:['openDirectory']});return value.canceled?null:value.filePaths[0];});
  handle('dialog:files',async()=>{const value=await dialog.showOpenDialog(window,{title:'选择上传文件',properties:['openFile','multiSelections']});return value.canceled?[]:value.filePaths;});
  handle('config:export',async()=>{const value=await dialog.showSaveDialog(window,{title:'导出连接与设置（不含凭据）',defaultPath:'person-terminal.json',filters:[{name:'JSON',extensions:['json']}]});
    if(value.canceled)return false;await fs.promises.writeFile(value.filePath,JSON.stringify(store.exportData(),null,2));return true;});
  handle('config:readImport',async()=>{const value=await dialog.showOpenDialog(window,{title:'导入配置',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
    if(value.canceled)return null;const stat=await fs.promises.stat(value.filePaths[0]);if(stat.size>4e6)throw new Error('配置文件过大');return JSON.parse(await fs.promises.readFile(value.filePaths[0],'utf8'));});
  handle('config:import',value=>store.importData(value));
  handle('transfer:enqueue',(id,files,directory)=>transfers.enqueue(id,files,directory));
  handle('transfer:cancel',id=>{transfers.cancel(id);for(const [qid,q] of questions)if(q.transferId===id){q.resolve('skip');questions.delete(qid);}});
  handle('transfer:retry',id=>transfers.retry(id));
  handle('transfer:home',async id=>{const sftp=await sessions.sftp(id);return new Promise((resolve,reject)=>sftp.realpath('.',(error,value)=>error?reject(error):resolve(value)));});
  handle('transfer:list',async(id,directory)=>{directory=normalizeDirectory(directory);const sftp=await sessions.sftp(id);return new Promise((resolve,reject)=>sftp.readdir(directory,(error,values)=>error?reject(error):resolve(values.filter(value=>value.attrs.isDirectory()).map(value=>value.filename).filter(name=>name!=='.'&&name!=='..').sort())));});
  handle('question:answer',(id,value)=>{const question=questions.get(id);if(question){questions.delete(id);question.resolve(value);}});
  handle('window:action',action=>{if(action==='minimize')window.minimize();if(action==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}if(action==='close')window.close();});
}
app.whenReady().then(()=>{
  store=new Store(app.getPath('userData'),safeStorage);sessions=new Sessions(store,ask);completion=new Completion(sessions);ai=new Ai(store,sessions);transfers=new Transfers(sessions,ask);
  sessions.on('state',value=>send('session:state',value));sessions.on('data',value=>send('session:data',value));transfers.on('state',value=>send('transfer:state',value));
  sessions.on('credentials',value=>send('host:state',value));
  window=new BrowserWindow({icon:path.join(__dirname,'../public/omega.ico'),title:'Ω-Terminal',width:1440,height:940,minWidth:1000,minHeight:680,show:false,backgroundColor:'#121418',frame:false,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{const current=window.webContents.getURL();if(url!==current)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  register();
  window.once('ready-to-show',()=>window.show());
  if(process.env.PERSON_DEV_URL==='http://127.0.0.1:5173')window.loadURL(process.env.PERSON_DEV_URL);else window.loadFile(path.join(__dirname,'../dist/index.html'));
  window.on('close',event=>{
    if(exiting||testExitBypass())return;
    const active=sessions.list().filter(item=>item.status==='connected'||item.status==='connecting').length;
    if(active||transfers.active().length){
      event.preventDefault();
      exitRequest={id:exitRequest?.id||crypto.randomUUID(),sessions:active,transfers:transfers.active().length};
      send('app:exitRequested',exitRequest);
    }
  });
});
app.on('window-all-closed',()=>{for(const controller of probes.values())controller.abort();sessions?.closeAll();for(const [,question]of questions)question.resolve(false);app.quit();});
app.on('before-quit',event=>{
  if(!exiting&&!testExitBypass()&&window&&!window.isDestroyed()){
    event.preventDefault();window.close();
  }
});
