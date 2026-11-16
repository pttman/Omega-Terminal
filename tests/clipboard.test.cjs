const {test}=require('node:test');
const assert=require('node:assert/strict');
const clipboard=import('../src/terminalClipboard.ts');

function line(text,{prompt=false,wrapped=false}={}){
  return {
    isWrapped:wrapped,
    getCell:x=>x===0?{getChars:()=>text[0],isFgPalette:()=>prompt,getFgColor:()=>214}:undefined,
    translateToString:(trim,start=0,end=text.length)=>{const value=text.slice(start,end);return trim?value.replace(/ +$/,''):value;},
  };
}
function selection(lines,text,start,end){
  return {getSelection:()=>text,getSelectionPosition:()=>({start,end}),buffer:{active:{getLine:y=>lines[y]}}};
}

test('multiline copy removes only marked prompt Omega, preserving literal Omega and indentation',async()=>{
  const {terminalSelectionText}=await clipboard;
  const lines=[line('Ω C:\\work> echo Ω',{prompt:true}),line('  Ω is output'),line('Ω ~ $ ls',{prompt:true})];
  const source='Ω C:\\work> echo Ω\r\n  Ω is output\r\nΩ ~ $ ls';
  assert.equal(terminalSelectionText(selection(lines,source,{x:0,y:0},{x:8,y:2})),'C:\\work> echo Ω\r\n  Ω is output\r\n$ ls');
});

test('partial selections preserve their boundaries and prompts outside the selection',async()=>{
  const {terminalSelectionText}=await clipboard;
  const lines=[line('Ω ~ $ echo Ω',{prompt:true})];
  assert.equal(terminalSelectionText(selection(lines,'echo Ω',{x:6,y:0},{x:12,y:0})),'echo Ω');
  assert.equal(terminalSelectionText(selection(lines,'Ω',{x:0,y:0},{x:1,y:0})),'');
  assert.equal(terminalSelectionText(selection(lines,'~ $ echo Ω',{x:2,y:0},{x:12,y:0})),'$ echo Ω');
});

test('home prompt prefixes are removed without changing literal tilde paths or output',async()=>{
  const {terminalSelectionText}=await clipboard;
  const lines=[line('Ω ~ /project # echo ~',{prompt:true}),line('~ /literal Ω output'),line('Ω ~/project $ pwd',{prompt:true})];
  const source='Ω ~ /project # echo ~\n~ /literal Ω output\nΩ ~/project $ pwd';
  assert.equal(terminalSelectionText(selection(lines,source,{x:0,y:0},{x:17,y:2})),'/project # echo ~\n~ /literal Ω output\n~/project $ pwd');
  assert.equal(terminalSelectionText(selection(lines,'~ /project # echo ~',{x:2,y:0},{x:21,y:0})),'/project # echo ~');
});

test('soft-wrapped rows remain joined and a wrapped Omega stays in the copied text',async()=>{
  const {terminalSelectionText}=await clipboard;
  const lines=[line('Ω ~ $ echo ',{prompt:true}),line('Ω payload',{prompt:true,wrapped:true}),line('done')];
  assert.equal(terminalSelectionText(selection(lines,'Ω ~ $ echoΩ payload\ndone',{x:0,y:0},{x:4,y:2})),'$ echoΩ payload\ndone');
});

test('column selections retain per-row boundaries and whitespace',async()=>{
  const {terminalSelectionText}=await clipboard;
  const lines=[line('Ω one trailing',{prompt:true}),line('Ω two trailing',{prompt:true})];
  assert.equal(terminalSelectionText(selection(lines,'Ω one\r\nΩ two',{x:0,y:0},{x:5,y:1})),'one\r\ntwo');
  assert.equal(terminalSelectionText(selection(lines,'one\r\ntwo',{x:2,y:0},{x:5,y:1})),'one\r\ntwo');
});

test('copy preserves Unicode, blank lines and nonbreaking-space normalization',async()=>{
  const {terminalSelectionText}=await clipboard;
  const lines=[line('Ω 中文😀é',{prompt:true}),line(''),line('A\u00a0B')];
  assert.equal(terminalSelectionText(selection(lines,'Ω 中文😀é\n\nA B',{x:0,y:0},{x:3,y:2})),'中文😀é\n\nA B');
});

test('empty, stale and unmatched selections leave clipboard text untouched',async()=>{
  const {terminalSelectionText}=await clipboard;
  assert.equal(terminalSelectionText(selection([], '',{x:0,y:0},{x:0,y:0})), '');
  assert.equal(terminalSelectionText(selection([], 'Ω original',{x:0,y:0},{x:10,y:0})), 'Ω original');
  assert.equal(terminalSelectionText(selection([line('Ω other',{prompt:true})], 'Ω original',{x:0,y:0},{x:10,y:0})), 'Ω original');
});
