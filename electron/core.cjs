const path = require('node:path');
const crypto = require('node:crypto');

function assertString(value, label, max = 4096) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error(`${label}格式不正确`);
  return value;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || min)); }
function quote(value, shell) {
  assertString(value, '参数');
  if (/[\r\n]/.test(value)) throw new Error('参数不能包含换行');
  if (shell === 'powershell') return `'${value.replaceAll("'", "''")}'`;
  if (shell === 'cmd') {
    if (/["%\r\n]/.test(value)) throw new Error('此 CMD 参数包含不支持的引号或百分号，请在终端中手动填写');
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function renderTemplate(template, fields, shell) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = assertString(fields[key], key, 1024).trim();
    if (!value) throw new Error(`请填写 ${key}`);
    if (key === 'port') {
      if (!/^\d+$/.test(value) || +value < 1 || +value > 65535) throw new Error('端口应为 1–65535');
      return value;
    }
    return quote(value, shell);
  });
}
function validateHost(value) {
  const host = assertString(value.host, '服务器地址', 253).trim();
  const username = assertString(value.username, '用户名', 128).trim();
  const name = assertString(value.name || host, '名称', 128).trim();
  if (!host || /[\s/\\]/.test(host)) throw new Error('请输入有效服务器地址');
  if (!username || /[\r\n]/.test(username)) throw new Error('请输入有效用户名');
  const port = Number(value.port || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口应为 1–65535');
  const shell = ['bash', 'powershell', 'cmd'].includes(value.shell) ? value.shell : 'bash';
  return { id: typeof value.id === 'string' && /^[\w-]{1,80}$/.test(value.id) ? value.id : crypto.randomUUID(), name, host, username, port,
    group: assertString(value.group || '', '分组', 80), color: ['green','blue','orange','purple'].includes(value.color) ? value.color : 'green',
    auth: value.auth === 'key' ? 'key' : 'password', keyPath: assertString(value.keyPath || '', '私钥路径'),
    favorite: !!value.favorite, shell, uploadDirectory: assertString(value.uploadDirectory || '', '上传目录') };
}
function aiEndpoint(baseUrl) {
  const url = new URL(assertString(baseUrl, '服务地址'));
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入 HTTP(S) 服务地址，不包含账号、查询参数或片段');
  if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('远程 AI 服务请使用 HTTPS；本机服务可使用 HTTP');
  url.pathname = url.pathname.replace(/\/$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.toString();
}
function normalizeDirectory(value) {
  const directory = assertString(value, '远程目录');
  if (!directory.startsWith('/') || directory.includes('\n') || directory.includes('\r')) throw new Error('请使用绝对远程目录，例如 /home/user');
  return path.posix.normalize(directory);
}
function safeRemoteName(name) {
  if (!name || name === '.' || name === '..' || /[/\\\0\r\n]/.test(name)) throw new Error('文件名不支持');
  return name;
}
function parseAiResponse(content) {
  let text = String(content || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const value = JSON.parse(text);
    const command = assertString(value.command || '', 'AI 命令', 16000);
    return { command, explanation: String(value.explanation || '').slice(0,8000), question: String(value.question || '').slice(0,2000), dependency: String(value.dependency || '').slice(0,2000) };
  } catch (error) {
    if (text.startsWith('{')) throw new Error('AI 返回格式不完整，请重新生成');
    return { command: '', explanation: text.slice(0,12000), question: '', dependency: '' };
  }
}
module.exports = { assertString, clamp, quote, renderTemplate, validateHost, aiEndpoint, normalizeDirectory, safeRemoteName, parseAiResponse };
