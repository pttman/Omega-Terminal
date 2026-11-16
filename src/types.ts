export type Shell = 'powershell' | 'cmd' | 'bash';
export type Host = { id:string; name:string; host:string; port:number; username:string; group:string; color:string; auth:'password'|'key'; keyPath:string; favorite:boolean; shell:Shell; uploadDirectory:string; hasPassword?:boolean };
export type ConnectionOptions = {profile?:string;cwd?:string;hostId?:string;password?:string;passphrase?:string;rememberPassword?:boolean;useSavedPassword?:boolean};
export type ProbePhase = 'resolving'|'connecting'|'handshake';
export type Settings = {fontSize:number;theme:'dark'|'light';defaultShell:string;startDirectory:string;completion:boolean};
export type AiConfig = {baseUrl:string;model:string;hasKey:boolean};
export type Profile = {id:string;name:string;shell:Shell;subtitle:string};
export type Session = {id:string;name:string;kind:'local'|'ssh';shell:Shell;profile:string;status:'connecting'|'connected'|'disconnected'|'error'|'exited'|'closed';cwd:string;ready:boolean;rawDirty:boolean;integrated:boolean;commandRunning:boolean;queuedCommands:number;interactive:boolean;hostId?:string;host?:string;error:string;phase?:string;loginMessage?:string;startupWarning?:string;createdAt:number;history:string[]};
export type Transfer = {id:string;sessionId:string;host:string;name:string;source:string;directory:string;size:number;bytes:number;status:'queued'|'running'|'waiting'|'done'|'error'|'cancelled'|'skipped';error:string;speed:number;cleanup:string};
export type Candidate = {label:string;insert:string;kind:string;detail:string;start:number;end:number};
export type AiResult = {command:string;explanation:string;question:string;dependency:string;sessionId:string|null;shell:Shell};
export type Question = {id:string;type:'fingerprint'|'authentication'|'collision';title:string;host?:string;fingerprint?:string;previous?:string;instructions?:string;prompts?:{prompt:string;echo:boolean}[];name?:string;directory?:string};
export type ExitRequest = {id:string;sessions:number;transfers:number};
export type WindowState = {fullscreen:boolean;maximized:boolean};
export type Boot = {hosts:Host[];settings:Settings;ai:AiConfig;shells:Profile[];sessions:Session[];transfers:Transfer[];version:string;warning:string;runtime:{platform:string;arch:string;electron:string;chrome:string}};
export type Tab = {id:string;title:string;sessions:string[];layout:import('./layout').PaneLayout};
export type ManualEntry = {id:string;title:string;category:string;shell:string;command:string;description:string;fields:Record<string,string>;keywords:string;source:string};
export type DataChunk={id:string;seq:number;data:string};
export interface Bridge {
  copyText(text:string):Promise<void>;terminalContextMenu(text:string):Promise<void>;
  bootstrap():Promise<Boot>;
  openRepository():Promise<void>;answerExit(id:string,confirmed:boolean):Promise<void>;onExitRequested(fn:(request:ExitRequest)=>void):()=>void;
  saveHost(value:Partial<Host>):Promise<Host>;deleteHost(id:string):Promise<void>;
  forgetPassword(id:string):Promise<Host>;onHost(fn:(value:{host:Host;warning:string})=>void):()=>void;
  probeHost(id:string,requestId:string):Promise<{latencyMs:number}>;cancelProbe(requestId:string):Promise<void>;onProbe(fn:(value:{requestId:string;phase:ProbePhase})=>void):()=>void;
  settings(value:Partial<Settings>):Promise<Settings>;saveAi(value:{baseUrl:string;model:string;key?:string;clearKey?:boolean}):Promise<AiConfig>;
  createSession(value:ConnectionOptions):Promise<Session>;
  closeSession(id:string):Promise<void>;write(id:string,data:string):Promise<void>;execute(id:string,command:string):Promise<void>;interrupt(id:string):Promise<void>;cancelCommands(id:string):Promise<void>;resize(id:string,cols:number,rows:number):Promise<void>;buffer(id:string):Promise<DataChunk[]>;
  complete(id:string,text:string,cursor:number):Promise<Candidate[]>;
  ai(value:{requestId:string;sessionId?:string;shell?:Shell;question:string;attachment?:string;history?:{role:string;content:string}[]}):Promise<AiResult>;cancelAi(id:string):Promise<void>;
  renderManual(id:string,fields:Record<string,string>):Promise<string>;
  pickKey():Promise<string|null>;pickDirectory():Promise<string|null>;pickFiles():Promise<string[]>;
  exportConfig():Promise<boolean>;readImport():Promise<{version:number;hosts:Host[]}|null>;importConfig(value:unknown):Promise<Boot>;
  upload(id:string,files:string[],directory:string):Promise<{accepted:number;rejected:string[]}>;cancelTransfer(id:string):Promise<void>;retryTransfer(id:string):Promise<void>;sftpHome(id:string):Promise<string>;sftpList(id:string,directory:string):Promise<string[]>;
  filePaths(files:FileList|File[]):string[];answer(id:string,value:unknown):Promise<void>;window(action:'minimize'|'maximize'|'fullscreen'|'restore'|'close'):Promise<void>;windowState():Promise<WindowState>;onWindowState(fn:(state:WindowState)=>void):()=>void;
  onData(fn:(data:DataChunk)=>void):()=>void;onSession(fn:(session:Session)=>void):()=>void;onTransfer(fn:(transfer:Transfer)=>void):()=>void;onQuestion(fn:(question:Question)=>void):()=>void;
}
declare global {interface Window {person:Bridge}}
