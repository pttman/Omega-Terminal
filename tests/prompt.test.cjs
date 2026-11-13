const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {sshPrompt}=require('../electron/prompt.cjs');
const {SshStartup}=require('../electron/startup.cjs');
const {until}=require('./fixture.cjs');

function bashPath(){
  if(process.platform!=='win32')return '/bin/bash';
  try{
    let directory=execFileSync('git',['--exec-path'],{encoding:'utf8',windowsHide:true}).trim();
    for(let level=0;level<6;level++,directory=path.dirname(directory)){
      const candidate=path.join(directory,'bin','bash.exe');
      if(fs.existsSync(candidate))return candidate;
    }
  }catch{}
}

test('Real interactive Bash hides initialization and keeps subsequent commands visible',{timeout:20000},async t=>{
  const bash=bashPath();if(!bash)return t.skip('Bash is not installed');
  const pty=require('node-pty');const token='interactive-test';const gate=new SshStartup(token);
  let completed=false,output='',login='';
  const term=pty.spawn(bash,['--noprofile','--norc','-i'],{name:'xterm-256color',cols:100,rows:30,cwd:process.cwd(),env:{...process.env,TERM:'xterm-256color'},useConpty:true});
  term.onData(data=>{
    if(completed){output+=data;return;}
    const result=gate.push(data);if(result){completed=true;login=result.loginMessage;output+=result.output;}
  });
  try{
    term.write(sshPrompt(token));
    await until(()=>completed&&output.includes(`777;${token};P;`));
    assert.ok(!output.includes('PROMPT_COMMAND'));assert.ok(!login.includes('__person_init'));
    term.write("printf 'INTERACTIVE_OK\\n'\r");
    await until(()=>/\r?\nINTERACTIVE_OK\r?\n/.test(output));
    assert.match(output,/Ω/);
  }finally{
    if(process.platform==='win32'){try{execFileSync('taskkill.exe',['/PID',String(term.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{term.kill();}}
    else term.kill();
  }
});
for(const existing of ['PROMPT_COMMAND="printf existing"','PROMPT_COMMAND=("printf first" "printf second")']){
  test(`Bash Omega prompt expands paths, isolates gold and preserves ${existing}`,t=>{
    const bash=bashPath();if(!bash)return t.skip('Bash is not installed');
    const script=`${existing}; ${sshPrompt('test-token').trim()}; printf 'CWD:%s\\n' "$PWD"; printf 'PROMPT:%s\\n' "\${PS1@P}"; for callback in "\${PROMPT_COMMAND[@]}"; do eval "$callback"; done`;
    const output=execFileSync(bash,['--noprofile','--norc','-c',script],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.match(output,/PROMPT:\x1b\[0;38;5;214mΩ\x1b\[0m .+ [$#] /);
    assert.ok(output.includes(existing.includes('=(')?'firstsecond':'existing'));
    const marker=output.match(/\x1b\]777;test-token;P;([^\x07]+)\x07/);
    assert.ok(marker,'Working directory integration still runs');
    assert.equal(Buffer.from(marker[1],'base64').toString('utf8'),output.match(/CWD:([^\r\n]+)/)[1]);
  });
}

test('Bash home subdirectories show a space after tilde while cwd and literal filenames stay intact',t=>{
  const bash=bashPath();if(!bash)return t.skip('Bash is not installed');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'omega-prompt-'));
  const home=path.join(root,'home');fs.mkdirSync(home);
  for(const directory of ['yiask','yiask/nested folder','$(printf INJECTED)'])fs.mkdirSync(path.join(home,directory),{recursive:true});
  fs.mkdirSync(path.join(root,'outside'));
  try{
    for(const [directory,expected] of [['.','~'],['yiask','~ /yiask'],['yiask/nested folder','~ /yiask/nested folder'],['$(printf INJECTED)','~ /$(printf INJECTED)'],['../outside',null]]){
      const quoted="'"+directory.replaceAll("'","'\\''")+"'";
      const script=`HOME="$PWD"; ${sshPrompt('spacing-test').trim()}; cd -- ${quoted}; __person_prompt; printf 'REAL:%s\\n' "$PWD"; printf 'PROMPT:%s\\n' "\${PS1@P}"`;
      const output=execFileSync(bash,['--noprofile','--norc','-c',script],{cwd:home,encoding:'utf8',windowsHide:true,timeout:10000});
      const cwd=output.match(/REAL:([^\r\n]+)/)[1];
      const displayed=output.match(/PROMPT:([^\r\n]+)/)[1].replace(/\x1b\[[0-9;]*m/g,'');
      assert.ok([`Ω ${expected??cwd} $ `,`Ω ${expected??cwd} # `].includes(displayed),`Unexpected prompt: ${displayed}`);
      const marker=output.match(/\x1b\]777;spacing-test;P;([^\x07]+)\x07/);
      assert.equal(Buffer.from(marker[1],'base64').toString('utf8'),cwd);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
