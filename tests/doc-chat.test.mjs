import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { activeMention, threadTitle, applyChatChange, changeLines, chatWorkspace, contextItems, matchContext, messageContext, tokenTotal, diffCounts, diffHunks, lineDiff, modelName, undoChatChange } from '../src/doc-chat-model.ts';
import { initialWorkspace, newNote } from '../src/model.ts';
import { chatMiddleware, claudeArgs, claudeEnv, createDocChat } from '../server/doc-chat.mjs';
import { isLocalRequest } from '../server/github-checkpoints.mjs';

const note=(id,title,body,extra={})=>({...newNote('leetcode',false),id,title,body,...extra});
const workspace=(...notes)=>({...initialWorkspace(),notes,folders:[{id:'f1',section:'leetcode',name:'Topics'}]});

/** A stand-in for the claude command: runs a script against the sandbox and prints stream-json. */
function fakeClaude(script) {
  const dir=mkdtempSync(path.join(tmpdir(),'chat-bin-'));
  const file=path.join(dir,'claude');
  writeFileSync(file,`#!/usr/bin/env node
const fs=require('fs');const print=o=>console.log(JSON.stringify(o));
const args=process.argv.slice(2);let prompt='';process.stdin.on('data',d=>prompt+=d);process.stdin.on('end',async()=>{
fs.writeFileSync(${JSON.stringify(path.join(dir,'seen.json'))},JSON.stringify({args,prompt,env:process.env,cwd:process.cwd()}));
print({type:'system',subtype:'init',session_id:'sess-1'});
${script}
});`);
  chmodSync(file,0o755);
  return {file,seen:()=>JSON.parse(readFileSync(path.join(dir,'seen.json'),'utf8'))};
}
async function ask(script,body) {
  const fake=fakeClaude(script);
  const directory=mkdtempSync(path.join(tmpdir(),'chat-data-'));
  const chat=createDocChat({directory,uploadsDirectory:path.join(directory,'none'),command:fake.file,env:{HOME:process.env.HOME,PATH:process.env.PATH,PREPWISE_GITHUB_TOKEN:'secret-token',ANTHROPIC_API_KEY:'key'}});
  const events=[];
  await chat.send(body,e=>events.push(e),body.signal || new AbortController().signal);
  return {events,seen:fake.seen,done:events.find(e=>e.type==='done'),directory};
}
const ok="print({type:'result',subtype:'success',is_error:false,result:'ok'});";
const textOut=t=>`print({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:${JSON.stringify(t)}}}});`;

test('every tool is limited to the sandbox, refusing the rest, with no shell or web',()=>{
  const args=claudeArgs({sandbox:'/x/box',systemPrompt:'p'});
  assert.equal(args[args.indexOf('--permission-mode')+1],'dontAsk');
  assert.equal(args[args.indexOf('--tools')+1],'Read,Glob,Grep,Edit,Write');
  const start=args.indexOf('--allowedTools')+1;
  const rules=args.slice(start,args.indexOf('--permission-mode'));
  assert.deepEqual(rules,['Read','Glob','Grep','Edit','Write'].map(t=>`${t}(//x/box/**)`));
  assert.equal(args[args.indexOf('--setting-sources')+1],'');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.deepEqual(claudeArgs({sandbox:'/x',systemPrompt:'p',sessionId:'s'}).slice(-2),['--resume','s']);
});
test('the chosen model is passed on, and anything else is ignored',()=>{
  const model=value=>{const args=claudeArgs({sandbox:'/x',systemPrompt:'p',model:value});return args.includes('--model') ? args[args.indexOf('--model')+1] : null;};
  for(const name of ['fable','opus','sonnet','haiku']) assert.equal(model(name),name);
  assert.equal(model('--dangerously-skip-permissions'),null);
  assert.equal(model(undefined),null);
  assert.equal(modelName('claude-haiku-5-5'),'Haiku 5.5');
  assert.equal(modelName('claude-opus-5'),'Opus 5');
  assert.equal(modelName('other'),'other');
});
test('app secrets and API keys never reach the command',()=>{
  const env=claudeEnv({HOME:'/h',PATH:'/bin',PREPWISE_GITHUB_TOKEN:'t',ANTHROPIC_API_KEY:'k',OTHER:'x'});
  assert.deepEqual(Object.keys(env).sort(),['HOME','PATH']);
  assert.ok(env.PATH.includes('/h/.local/bin'));
});
test('streams an answer, names the open doc, and sends the prompt on stdin',async()=>{
  const {events,seen,done,directory}=await ask(textOut('Hel')+textOut('lo')+ok,{noteId:'a',message:'--hi',workspace:workspace(note('a','Heap','# Heap\n'))});
  assert.deepEqual(events.filter(e=>e.type==='text').map(e=>e.text),['Hel','lo']);
  assert.equal(events[0].id,'sess-1');
  assert.deepEqual(done.changes,[]);
  const run=seen();
  assert.match(run.prompt,/^\[Today is \d{4}-\d{2}-\d{2}\.\]\n\n--hi$/,'the message stays in the prompt, away from the options');
  assert.equal(run.env.PREPWISE_GITHUB_TOKEN,undefined);
  assert.equal(run.env.ANTHROPIC_API_KEY,undefined);
  assert.match(run.args[run.args.indexOf('--system-prompt')+1],/LeetCode notes\/Heap\.md/);
  assert.ok(realpathSync(path.dirname(path.dirname(run.cwd)))===realpathSync(path.dirname(directory)),'runs inside its data folder');
  assert.equal(existsSync(run.cwd),false,'the copy of the notes is removed afterwards');
});
test('reports edits and new files, keeping metadata and ignoring deletions and other files',async()=>{
  const script=`
fs.writeFileSync('LeetCode notes/Heap.md',fs.readFileSync('LeetCode notes/Heap.md','utf8')+'more\\n');
fs.writeFileSync('LeetCode notes/Tagged.md',fs.readFileSync('LeetCode notes/Tagged.md','utf8').replace('old','new'));
fs.unlinkSync('LeetCode notes/Gone.md');
fs.writeFileSync('LeetCode notes/Topics/Fresh.md','# Fresh');
fs.writeFileSync('LeetCode notes/stray.txt','x');
${ok}`;
  const {done}=await ask(script,{noteId:'a',message:'edit',workspace:workspace(note('a','Heap','# Heap\n'),note('b','Tagged','old',{tags:['x']}),note('c','Gone','bye'),note('d','Same','same'))});
  assert.equal(done.changes.length,3);
  const [heap,tagged,fresh]=done.changes;
  assert.deepEqual([heap.kind,heap.noteId,heap.before,heap.after],['edit','a','# Heap\n','# Heap\nmore\n']);
  assert.deepEqual([tagged.noteId,tagged.before,tagged.after],['b','old','new'],'frontmatter is not part of the body');
  assert.deepEqual([fresh.kind,fresh.title,fresh.section,fresh.folderId,fresh.after],['new','Fresh','leetcode','f1','# Fresh']);
  assert.equal(done.skipped.length,1);
  assert.match(done.skipped[0],/Gone\.md/);
});
test('failures are explained, and a second message waits for the first',async()=>{
  const failed=await ask("print({type:'result',is_error:true,result:'Not logged in'});process.exit(1);",{noteId:'a',message:'x',workspace:workspace(note('a','A',''))});
  assert.match(failed.events.at(-1).message,/signed in/);
  assert.equal(failed.done,undefined);
  const chat=createDocChat({directory:mkdtempSync(path.join(tmpdir(),'chat-')),uploadsDirectory:'/none',command:'/does/not/exist'});
  const events=[];
  await chat.send({noteId:'a',message:'x',workspace:workspace(note('a','A',''))},e=>events.push(e),new AbortController().signal);
  assert.match(events.at(-1).message,/not found/);
  const none=[];
  await chat.send({noteId:'zz',message:'x',workspace:workspace(note('a','A',''))},e=>none.push(e),new AbortController().signal);
  assert.match(none[0].message,/no longer exists/);
});
test('stopping ends the run and changes nothing',async()=>{
  const controller=new AbortController();
  setTimeout(()=>controller.abort(),400);
  const {events}=await ask("fs.writeFileSync('LeetCode notes/A.md','changed');setTimeout(()=>{},60000);",{noteId:'a',message:'x',signal:controller.signal,workspace:workspace(note('a','A','text'))});
  assert.equal(events.at(-1).type,'stopped');
  assert.equal(events.some(e=>e.type==='done'),false);
});
test('an expired session carries on from the saved conversation',async()=>{
  const script=`if(args.includes('--resume')){print({type:'result',is_error:true,result:'No conversation found with session ID'});process.exit(1);}
${textOut('back')}${ok}`;
  const {events,seen}=await ask(script,{noteId:'a',message:'new',sessionId:'old',history:[{role:'user',text:'earlier'}],workspace:workspace(note('a','A',''))});
  assert.equal(events.at(-1).type,'done');
  assert.match(seen().prompt,/earlier[\s\S]*new/);
  assert.equal(seen().args.includes('--resume'),false);
});
test('only the app can reach the chat: another site is refused',async()=>{
  let called=false;
  const handler=chatMiddleware({send:async()=>{called=true;}},isLocalRequest);
  const reply=()=>({headers:{},setHeader(){},end(text){this.body=text;},on(){},statusCode:200});
  const request=headers=>Object.assign((async function*(){yield Buffer.from('{}');})(),{url:'/api/chat/message',method:'POST',headers:{host:'127.0.0.1:5173','content-type':'application/json','x-prepwise-checkpoint':'1',...headers}});
  const res=reply();
  await handler(request({origin:'https://evil.example'}),res,()=>{});
  assert.equal(res.statusCode,403);
  assert.equal(called,false);
  const noHeader=reply();
  await handler(request({origin:'http://127.0.0.1:5173','x-prepwise-checkpoint':undefined}),noHeader,()=>{});
  assert.equal(noHeader.statusCode,403);
  const good=reply();good.write=()=>{};
  await handler(request({origin:'http://127.0.0.1:5173'}),good,()=>{});
  assert.equal(called,true);
});
test('edits go into the workspace, never over newer work, and can be undone',()=>{
  const w=workspace(note('a','A','old'));
  const change={kind:'edit',noteId:'a',title:'A',before:'old',after:'new'};
  const applied=applyChatChange(w,change,false,'2026-01-01T00:00:00.000Z');
  assert.equal(applied.status,'applied');
  assert.equal(applied.workspace.notes[0].body,'new');
  assert.equal(applied.workspace.notes[0].updatedAt,'2026-01-01T00:00:00.000Z');
  assert.equal(undoChatChange(applied.workspace,change).workspace.notes[0].body,'old');
  const typed=workspace(note('a','A','typed meanwhile'));
  const conflict=applyChatChange(typed,change);
  assert.equal(conflict.status,'conflict');
  assert.equal(conflict.workspace,typed);
  assert.equal(applyChatChange(typed,change,true).workspace.notes[0].body,'new');
  assert.equal(undoChatChange(typed,change).ok,false,'undo never loses later edits');
  assert.equal(applyChatChange(workspace(),change).status,'missing');
  const fresh={kind:'new',noteId:'n',title:'Fresh',before:'',after:'text',section:'leetcode',folderId:'f1'};
  const created=applyChatChange(w,fresh).workspace;
  assert.deepEqual([created.notes[0].id,created.notes[0].folderId,created.notes[0].body],['n','f1','text']);
  assert.equal(applyChatChange(created,fresh).workspace,created,'not added twice');
  assert.equal(undoChatChange(created,fresh).workspace.notes.some(n=>n.id==='n'),false);
});
test('line diff finds the changed lines and shows them with some context',()=>{
  const before=['a','b','c','d','e','f','g','h','i'].join('\n');
  const after=['a','b','c','X','e','f','g','h','i','j'].join('\n');
  const lines=lineDiff(before,after);
  assert.deepEqual(diffCounts(lines),{added:2,removed:1});
  const hunks=diffHunks(lines,1);
  assert.deepEqual(hunks.map(l=>l && `${l.type[0]}${l.text}`),['sc','rd','aX','se',null,'si','aj']);
  assert.deepEqual(lineDiff('','new'),[{type:'add',text:'new'}]);
  const big=Array.from({length:3000},(_,i)=>`l${i}`).join('\n');
  assert.ok(diffCounts(lineDiff(big,big.replace(/l/g,'m'))).added===3000,'very large edits still finish');
});
test('a chat sends only the text of a whiteboard',()=>{
  const w=workspace(note('a','A','x',{scene:{elements:[{type:'text',text:'Kafka'},{type:'rectangle'},{type:'text',text:'gone',isDeleted:true}],appState:{},files:{}}}),note('b','B','y'));
  const sent=chatWorkspace(w);
  assert.equal(sent.workspace.notes[0].scene,undefined);
  assert.deepEqual(sent.boards,{a:'Kafka'});
  assert.ok(w.notes[0].scene,'the workspace itself is untouched');
});
test('the workspace chat sees everything and has no document in focus',async()=>{
  const w=workspace(note('a','Heap','text'));
  w.plans=[{id:'p',kind:'task',title:'Review',date:'2026-12-01',time:'09:00',duration:60,company:'',round:'',notes:'',noteId:'',done:false}];
  const script=`
print({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:fs.readFileSync('_plans.json','utf8').includes('Review')+' '+fs.readFileSync('LeetCode notes/Heap.whiteboard.txt','utf8')}}});
fs.writeFileSync('Fresh.md','# Fresh');
${ok}`;
  const {events,seen,done}=await ask(script,{scope:'workspace',viewing:'the Calendar',message:'hi',boards:{a:'On the board'},workspace:w});
  assert.equal(events.find(e=>e.type==='text').text,'true On the board');
  const prompt=seen().args[seen().args.indexOf('--system-prompt')+1];
  assert.match(prompt,/whole workspace/);
  assert.match(seen().prompt,/looking at: "the Calendar"/,'the page goes with each message, since a resumed session keeps its first prompt');
  assert.doesNotMatch(prompt,/the Calendar/);
  assert.match(seen().prompt,/Sections, including empty ones: .*"Reflections"/);
  assert.doesNotMatch(prompt,/has this document open/);
  assert.deepEqual(done.changes.map(c=>[c.kind,c.title]),[['new','Fresh']],'a whiteboard file never comes back as a document');
  assert.ok(w.notes.length,'a stray new file lands in a real section');
  assert.ok(done.changes[0].section);
});
test('plans can be added and changed, and invalid edits are refused',async()=>{
  const w=workspace(note('a','A',''));
  w.plans=[{id:'p',kind:'task',title:'Review',date:'2026-12-01',time:'09:00',duration:60,company:'',round:'',notes:'',noteId:'',done:false}];
  const add=`const plans=JSON.parse(fs.readFileSync('_plans.json','utf8'));plans[0].done=true;plans.push({kind:'milestone',title:'Finish DSA',date:'2026-12-20'});fs.writeFileSync('_plans.json',JSON.stringify(plans));${ok}`;
  const {done}=await ask(add,{scope:'workspace',message:'x',workspace:w});
  const change=done.changes[0];
  assert.equal(change.kind,'plans');
  const after=JSON.parse(change.after);
  assert.equal(after[0].done,true);
  assert.deepEqual([after[1].kind,after[1].time,after[1].duration,after[1].done],['milestone','',60,false]);
  assert.ok(after[1].id,'a new plan gets an id');
  const applied=applyChatChange(w,change);
  assert.equal(applied.workspace.plans.length,2);
  assert.deepEqual(undoChatChange(applied.workspace,change).workspace.plans,w.plans);
  assert.equal(applyChatChange({...w,plans:[]},change).status,'conflict');
  assert.deepEqual(diffCounts(changeLines(change)),{added:2,removed:1});
  const loose=await ask(`fs.writeFileSync('_plans.json','[{"kind":"milestone","title":"Finish","date":"2026-12-20","time":"","duration":0,"company":"","round":"","notes":"","noteId":null,"done":false}]');${ok}`,{scope:'workspace',message:'x',workspace:{...w,plans:[]}});
  assert.equal(loose.done.skipped.length,0,'null and a zero duration mean none');
  const added=JSON.parse(loose.done.changes[0].after)[0];
  assert.deepEqual([added.duration,added.noteId],[60,'']);
  const bad=await ask(`fs.writeFileSync('_plans.json','[{"kind":"goal","title":"x","date":"nope"}]');${ok}`,{scope:'workspace',message:'x',workspace:w});
  assert.deepEqual(bad.done.changes,[]);
  assert.match(bad.done.skipped[0],/plans were not changed/);
  const same=await ask(`fs.writeFileSync('_plans.json',JSON.stringify(JSON.parse(fs.readFileSync('_plans.json','utf8'))));${ok}`,{scope:'workspace',message:'x',workspace:w});
  assert.deepEqual(same.done.changes,[],'reformatting alone is not a change');
});

test('@ opens at the start of a word, and matches titles with spaces',()=>{
  assert.deepEqual(activeMention('see @he',7),{start:4,query:'he'});
  assert.deepEqual(activeMention('@',1),{start:0,query:''});
  assert.equal(activeMention('me@mail.com',11),null,'an email address is not a mention');
  assert.equal(activeMention('@a\nb',4),null);
  assert.deepEqual(activeMention('@two po',7),{start:0,query:'two po'});
  const w=workspace(note('a','Two pointers',''),note('b','Pointer tricks',''));
  w.resume={name:'cv.pdf',data:'data:,',type:'application/pdf',size:1};
  w.uploads=[{id:'u',section:'leetcode',name:'graphs.pdf',type:'application/pdf',size:1,addedAt:''}];
  const items=contextItems(w);
  assert.deepEqual(items.slice(0,2).map(i=>i.kind),['plans','resume']);
  assert.deepEqual(matchContext(items,'pointer').map(i=>i.id),['b','a'],'titles starting with it come first');
  assert.deepEqual(matchContext(items,'two po').map(i=>i.id),['a']);
  assert.deepEqual(matchContext(items,'zzz'),[]);
  assert.equal(matchContext(items,'',2).length,2);
});
test('a mention counts only while its @title is still in the message',()=>{
  const items=[{kind:'note',id:'a',title:'Two pointers',detail:''},{kind:'upload',id:'u',title:'g.pdf',detail:''},{kind:'plans',id:'plans',title:'Calendar and plans',detail:''}];
  assert.equal(messageContext('no mentions',items),undefined);
  assert.deepEqual(messageContext('use @Two pointers and @g.pdf',items),{notes:['a'],uploads:['u'],plans:false,resume:false});
  assert.equal(messageContext('@Calendar and plans',items).plans,true);
  assert.equal(tokenTotal({input:1,cacheWrite:2,cacheRead:3,output:4}),10);
});
test('with @mentions only those files exist, and hidden documents stay safe',async()=>{
  const w=workspace(note('a','Heap','heap'),note('b','Stack','stack'),note('c','Queue','queue'));
  w.plans=[{id:'p',kind:'task',title:'Review',date:'2026-12-01',time:'09:00',duration:60,company:'',round:'',notes:'',noteId:'',done:false}];
  const list=`const files=fs.readdirSync('LeetCode notes').filter(f=>f.endsWith('.md')).sort().join()+'|'+fs.existsSync('_plans.json');print({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:files}}});`;
  // A workspace chat gets just the mention.
  const only=await ask(list+`fs.writeFileSync('LeetCode notes/Heap.md','edited');fs.writeFileSync('LeetCode notes/Stack.md','overwrite attempt');`+ok,{scope:'workspace',message:'x',context:{notes:['a']},workspace:w});
  assert.equal(only.events.find(e=>e.type==='text').text,'Heap.md|false');
  assert.deepEqual(only.done.changes.map(c=>[c.kind,c.noteId,c.after]),[['edit','a','edited']]);
  assert.match(only.done.skipped[0],/Stack\.md wasn't changed/,'a hidden document is not overwritten or duplicated');
  assert.match(only.seen().prompt,/holds only what the user chose.*LeetCode notes\/Heap\.md/);
  // A document chat also keeps its open document, and plans are included when mentioned.
  const doc=await ask(list+ok,{noteId:'b',message:'x',context:{notes:['a'],plans:true},workspace:w});
  assert.equal(doc.events.find(e=>e.type==='text').text,'Heap.md,Stack.md|true');
  assert.deepEqual(doc.done.changes,[],'a missing plans file is not read as a change');
  // No mention means everything, as before.
  const all=await ask(list+ok,{scope:'workspace',message:'x',workspace:w});
  assert.equal(all.events.find(e=>e.type==='text').text,'Heap.md,Queue.md,Stack.md|true');
  assert.doesNotMatch(all.seen().prompt,/holds only/);
  const empty=await ask(list+ok,{scope:'workspace',message:'x',context:{notes:[]},workspace:w});
  assert.equal(empty.events.find(e=>e.type==='text').text,'Heap.md,Queue.md,Stack.md|true','an empty list is not a limit');
});
test('token usage is reported',async()=>{
  const {done}=await ask("print({type:'result',is_error:false,result:'ok',usage:{input_tokens:5,cache_creation_input_tokens:7,cache_read_input_tokens:11,output_tokens:3}});",{noteId:'a',message:'x',workspace:workspace(note('a','A',''))});
  assert.deepEqual(done.usage,{input:5,cacheWrite:7,cacheRead:11,output:3});
});

test('separate sessions answer at once, while one session answers one message at a time',async()=>{
  const fake=fakeClaude(`setTimeout(()=>{${ok}},300);`);
  const directory=mkdtempSync(path.join(tmpdir(),'chat-data-'));
  const chat=createDocChat({directory,uploadsDirectory:path.join(directory,'none'),command:fake.file,env:{HOME:process.env.HOME,PATH:process.env.PATH}});
  const signal=new AbortController().signal;
  const body=thread=>({noteId:'a',thread,message:'x',workspace:workspace(note('a','A','text'))});
  const results={one:[],two:[],again:[]};
  await Promise.all([chat.send(body('one'),e=>results.one.push(e),signal),chat.send(body('two'),e=>results.two.push(e),signal),chat.send(body('one'),e=>results.again.push(e),signal)]);
  assert.equal(results.one.at(-1).type,'done');
  assert.equal(results.two.at(-1).type,'done');
  assert.match(results.again.at(-1).message,/still answering/);
  const odd=[];
  await chat.send({...body('../../evil'),noteId:'a'},e=>odd.push(e),signal);
  assert.equal(odd.at(-1).type,'done','an unusable session id falls back to the chat');
});
test('a chat is titled from its first message',()=>{
  assert.equal(threadTitle('  Summarize\n this   doc '),'Summarize this doc');
  const long=threadTitle('x'.repeat(100));
  assert.equal(long.length,48);
  assert.ok(long.endsWith('…'));
});

test('deleting a chat removes only that session\'s transcript',async()=>{
  const home=mkdtempSync(path.join(tmpdir(),'chat-home-'));
  const directory=realpathSync(mkdtempSync(path.join(tmpdir(),'chat-data-')));
  const chat=createDocChat({directory,uploadsDirectory:'/none',command:'/none',env:{HOME:home}});
  const projects=path.join(home,'.claude','projects');
  const folder=thread=>path.join(projects,path.join(directory,createHash('sha256').update(thread).digest('hex').slice(0,16)).replace(/[^a-zA-Z0-9]/g,'-'));
  mkdirSync(folder('one'),{recursive:true});writeFileSync(path.join(folder('one'),'s.jsonl'),'history');
  mkdirSync(folder('two'),{recursive:true});writeFileSync(path.join(folder('two'),'s.jsonl'),'history');
  const unrelated=path.join(projects,'-Users-me-other-project');
  mkdirSync(unrelated,{recursive:true});
  assert.deepEqual(await chat.forget({thread:'one'}),{removed:true});
  assert.equal(existsSync(folder('one')),false);
  assert.equal(existsSync(folder('two')),true);
  assert.equal(existsSync(unrelated),true);
  for(const thread of ['../..','','a/b',undefined]) assert.deepEqual(await chat.forget({thread}),{removed:false});
  assert.equal(existsSync(projects),true,'an odd id deletes nothing');
});
