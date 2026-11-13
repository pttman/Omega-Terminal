import { useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import type { Question } from '../types';
import Modal from './Modal';
export default function QuestionDialog({question,onAnswer}:{question:Question;onAnswer:(value:unknown)=>void}){
  const [answers,setAnswers]=useState<string[]>(question.prompts?.map(()=> '')||[]);
  return <Modal title={question.title} onClose={()=>onAnswer(question.type==='collision'?'skip':false)}>
    {question.type==='fingerprint'&&<><div className="identity-heading"><Fingerprint size={30}/><div><strong>{question.host}</strong><p>{question.previous?'请核实变更后再更新信任记录。':'核对指纹后，将信任记录保存在本机。'}</p></div></div><label>当前主机指纹<code className="fingerprint-code">{question.fingerprint}</code></label>{question.previous&&<label>此前信任的指纹<code className="fingerprint-code muted">{question.previous}</code></label>}<div className="modal-actions"><button className="button secondary" onClick={()=>onAnswer(false)}>取消连接</button><button className="button primary" onClick={()=>onAnswer(true)}><ShieldCheck size={15}/>{question.previous?'更新并连接':'信任并连接'}</button></div></>}
    {question.type==='authentication'&&<form onSubmit={event=>{event.preventDefault();onAnswer(answers);}}>{question.instructions&&<p>{question.instructions}</p>}{question.prompts?.map((prompt,index)=><label key={index}>{prompt.prompt}<input autoFocus type={prompt.echo?'text':'password'} autoComplete="off" value={answers[index]} onChange={event=>setAnswers(old=>old.map((value,i)=>i===index?event.target.value:value))}/></label>)}<div className="modal-actions"><button type="button" className="button secondary" onClick={()=>onAnswer(false)}>取消</button><button className="button primary">继续认证</button></div></form>}
    {question.type==='collision'&&<><p><strong>{question.name}</strong> 已存在于 {question.host} 的 {question.directory}。</p><p className="muted">请选择这一个文件的处理方式。</p><div className="modal-actions"><button className="button secondary" onClick={()=>onAnswer('skip')}>跳过</button><button className="button secondary" onClick={()=>onAnswer('overwrite')}>覆盖原文件</button><button className="button primary" onClick={()=>onAnswer('keep')}>保留两份</button></div></>}
  </Modal>;
}
