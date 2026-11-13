import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

if(process.platform!=='win32')throw new Error('Windows 发布包需要在 Windows 上生成');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const folder=path.resolve('release/win-unpacked');
const output=path.resolve('artifacts');fs.mkdirSync(output,{recursive:true});
const setup=process.argv.includes('--setup');
const name=setup?`Omega-Terminal-Setup-${pkg.version}-x64.exe`:`Omega-Terminal-${pkg.version}-win-x64.zip`;
const archive=path.join(output,name);
if(fs.existsSync(archive))throw new Error(`发布文件已存在，请先归档或移走：${archive}`);
if(setup){
  const installer=path.resolve(`release-${pkg.version}`,name);
  if(!fs.existsSync(installer))throw new Error('请先生成 NSIS 安装程序');
  fs.copyFileSync(installer,archive);
}else{
  if(!fs.existsSync(path.join(folder,'Omega Terminal.exe')))throw new Error('请先运行 npm run pack');
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:OMEGA_PACKAGE_DIR, $env:OMEGA_ARCHIVE_PATH, [System.IO.Compression.CompressionLevel]::Optimal, $false)"],{
    stdio:'inherit',env:{...process.env,OMEGA_PACKAGE_DIR:folder,OMEGA_ARCHIVE_PATH:archive}
  });
  if(result.status!==0)throw new Error('ZIP 打包失败');
}
const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk);
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),`${hash.digest('hex')}  ${name}\n`);
console.log(`发布包：${archive}`);
console.log('校验文件：'+path.join(output,'SHA256SUMS.txt'));
