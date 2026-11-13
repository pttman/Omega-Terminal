const fs = require('node:fs');
const path = require('node:path');
const { validateHost, aiEndpoint, clamp, assertString } = require('./core.cjs');
const defaults = () => ({ version: 1, hosts: [], passwords:{}, settings: { fontSize:14, theme:'dark', defaultShell:'powershell', startDirectory:'', completion:true }, ai: { baseUrl:'', model:'', encryptedKey:'' }, trustedHosts:{} });
const passwordIdentity = host => JSON.stringify([host.host.toLowerCase(),host.port,host.username,host.auth]);
class Store {
  constructor(directory, safeStorage) {
    this.directory = directory; this.safeStorage = safeStorage; this.file = path.join(directory, 'config.json');
    fs.mkdirSync(directory, { recursive:true });
    this.data = defaults(); this.warning = '';
    if (fs.existsSync(this.file)) {
      try {
        const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = { ...this.data, ...value, settings:{...this.data.settings,...value.settings}, ai:{...this.data.ai,...value.ai} };
        this.data.hosts = (Array.isArray(value.hosts) ? value.hosts : []).map(validateHost);
      } catch {
        fs.copyFileSync(this.file, this.file + `.damaged-${Date.now()}`);
        this.warning = '配置文件损坏，已备份并恢复默认设置。';
      }
    }
    this.data.settings.defaultShell = 'powershell';
    this.prunePasswords();
  }
  save() {
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode:0o600 });
    fs.renameSync(temporary, this.file);
  }
  hasPassword(host) { const record=this.data.passwords?.[host.id];return host.auth==='password' && record?.identity===passwordIdentity(host) && typeof record.encrypted==='string' && !!record.encrypted; }
  publicHost(host) { return {...host,hasPassword:!!this.hasPassword(host)}; }
  prunePasswords() {
    this.data.passwords=Object.assign(Object.create(null),Object.fromEntries(this.data.hosts.filter(host=>this.hasPassword(host)).map(host=>[host.id,this.data.passwords[host.id]])));
  }
  publicData() { return { hosts:this.data.hosts.map(host=>this.publicHost(host)), settings:this.data.settings, ai:{baseUrl:this.data.ai.baseUrl,model:this.data.ai.model,hasKey:!!this.data.ai.encryptedKey}, warning:this.warning }; }
  setHost(input) { const host = validateHost(input); this.data.hosts = [...this.data.hosts.filter(item=>item.id!==host.id), host]; this.prunePasswords();this.save(); return this.publicHost(host); }
  removeHost(id) { this.data.hosts = this.data.hosts.filter(host=>host.id!==id); this.prunePasswords();this.save(); }
  setPassword(host,password) {
    const current=this.data.hosts.find(item=>item.id===host.id);
    if(!current || current.auth!=='password' || passwordIdentity(current)!==passwordIdentity(host))return false;
    if(!this.safeStorage.isEncryptionAvailable())throw new Error('当前系统无法加密保存密码');
    const encrypted=this.safeStorage.encryptString(assertString(password,'密码',4096)).toString('base64');
    if(!password)throw new Error('不能保存空密码');
    const previous=this.data.passwords[host.id];
    this.data.passwords[host.id]={identity:passwordIdentity(host),encrypted};
    try{this.save();}catch(error){if(previous)this.data.passwords[host.id]=previous;else delete this.data.passwords[host.id];throw error;}
    return true;
  }
  getPassword(id) {
    const host=this.data.hosts.find(item=>item.id===id);
    if(!host || !this.hasPassword(host))throw new Error('没有可用的已保存密码，请重新输入');
    try{return this.safeStorage.decryptString(Buffer.from(this.data.passwords[id].encrypted,'base64'));}
    catch{throw new Error('无法读取已保存的密码，请重新输入并保存');}
  }
  forgetPassword(id,expectedHost) {
    const host=this.data.hosts.find(item=>item.id===id);
    if(!host)throw new Error('服务器配置不存在');
    if(expectedHost && passwordIdentity(host)!==passwordIdentity(expectedHost))return this.publicHost(host);
    const previous=this.data.passwords[id];delete this.data.passwords[id];
    try{this.save();}catch(error){if(previous)this.data.passwords[id]=previous;throw error;}
    return this.publicHost(host);
  }
  setSettings(input) {
    const old = this.data.settings;
    this.data.settings = { fontSize:clamp(input.fontSize ?? old.fontSize, 8, 40), theme:['dark','light'].includes(input.theme) ? input.theme : old.theme,
      defaultShell:'powershell',
      startDirectory:assertString(input.startDirectory ?? old.startDirectory,'启动目录'), completion:typeof input.completion === 'boolean' ? input.completion : old.completion };
    this.save(); return this.data.settings;
  }
  setAi(input) {
    const baseUrl = assertString(input.baseUrl || '', '服务地址');
    if (baseUrl) aiEndpoint(baseUrl);
    const ai = { ...this.data.ai, baseUrl, model:assertString(input.model || '', '模型', 128) };
    if (input.clearKey) ai.encryptedKey = '';
    if (input.key) {
      if (!this.safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存 AI 凭据');
      ai.encryptedKey = this.safeStorage.encryptString(assertString(input.key,'API 凭据',8192)).toString('base64');
    }
    this.data.ai = ai; this.save(); return this.publicData().ai;
  }
  getKey() { return this.data.ai.encryptedKey ? this.safeStorage.decryptString(Buffer.from(this.data.ai.encryptedKey,'base64')) : ''; }
  exportData() { return { version:1, hosts:this.data.hosts.map(({keyPath,...host})=>host), settings:this.data.settings }; }
  importData(value) {
    if (value.version !== 1 || !Array.isArray(value.hosts) || value.hosts.length > 2000) throw new Error('不支持的配置格式');
    const hosts = value.hosts.map(host=>validateHost({...host,keyPath:''}));
    const map = new Map(this.data.hosts.map(host=>[host.id,host]));
    for (const host of hosts) map.set(host.id,host);
    this.data.hosts = [...map.values()]; this.prunePasswords();this.save(); return this.publicData();
  }
}
module.exports = { Store, defaults };
