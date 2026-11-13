const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {Ai}=require('../electron/ai.cjs');
test('AI adapter sends minimal context, parses response, binds target and reports service errors',{timeout:15000},async()=>{
  let payload,authorization,mode='ok';
  const server=http.createServer(async(request,response)=>{let body='';for await(const chunk of request)body+=chunk;payload=JSON.parse(body);authorization=request.headers.authorization;
    if(mode==='unauthorized'){response.writeHead(401);return response.end('{}');}
    if(mode==='wait')return setTimeout(()=>{if(!response.destroyed)response.end('{}');},1500);
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message:{content:JSON.stringify({command:'Get-Process',explanation:'显示进程',question:'',dependency:''})}}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const store={data:{ai:{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture-model'}},getKey:()=> 'fixture-only-key'};
  const sessions={get:id=>({id,shell:'powershell',kind:'local',host:'sensitive-host',cwd:'C:\\private',history:['sensitive-command']})};
  const ai=new Ai(store,sessions);
  try{
    const result=await ai.generate({requestId:'one',sessionId:'target-A',question:'显示进程'});assert.equal(result.command,'Get-Process');assert.equal(result.sessionId,'target-A');assert.equal(authorization,'Bearer fixture-only-key');
    const transmitted=JSON.stringify(payload);assert.ok(!transmitted.includes('sensitive-host'));assert.ok(!transmitted.includes('sensitive-command'));assert.ok(!transmitted.includes('private'));assert.ok(transmitted.includes('powershell'));
    mode='unauthorized';await assert.rejects(ai.generate({requestId:'two',question:'hi'}),/认证失败/);
    mode='wait';const pending=ai.generate({requestId:'cancel',question:'hi'});setTimeout(()=>ai.cancel('cancel'),50);await assert.rejects(pending,/取消/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
