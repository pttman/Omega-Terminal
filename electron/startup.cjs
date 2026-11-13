function loginText(value){
  return value.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r\n/g,'\n').replace(/[\x00-\x09\x0b-\x1f\x7f]/g,'');
}
class SshStartup{
  constructor(token){this.marker=`\x1b]777;${token};S\x07`;this.buffer='';this.truncated=false;}
  summary(){
    let text=loginText(this.buffer);const echo=text.indexOf('__person_init=');
    if(echo>=0){text=text.slice(0,echo);text=text.slice(0,text.lastIndexOf('\n')+1);}
    return (this.truncated?'（较早的登录信息已截断）\n':'')+text.trim();
  }
  push(data){
    this.buffer+=data;
    const end=this.buffer.indexOf(this.marker);
    if(end>=0){const output=this.buffer.slice(end+this.marker.length);this.buffer=this.buffer.slice(0,end);return {output,loginMessage:this.summary()};}
    if(this.buffer.length>65536){this.buffer=this.buffer.slice(-65536);this.truncated=true;}
    return null;
  }
}
module.exports={SshStartup,loginText};
