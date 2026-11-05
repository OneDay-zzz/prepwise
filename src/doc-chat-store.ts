import { del, get, set } from 'idb-keyval';
import { applyChatChange, chatModels, chatWorkspace, contextItems, defaultChatModel, threadTitle, undoChatChange, WORKSPACE_CHAT, type ChatChange, type ChatContext, type ChatMessage, type ChatModel, type ChatThread } from './doc-chat-model';
import { localDate, type Workspace } from './model';

export type ChatState = {messages:ChatMessage[]; sessionId?:string; running:boolean; activity?:string; loaded:boolean};
export type ChatIndex = {threads:ChatThread[]; activeId:string; loaded:boolean};
type Bridge = {get:()=>Workspace|null; update:(change:(workspace:Workspace)=>Workspace)=>void; viewing:()=>string};

const EMPTY: ChatState = {messages:[],running:false,loaded:false};
// The first session of a chat uses the chat's own id, which is also where chats from before sessions are saved.
const threadKey=(threadId:string)=>`prepwise-chat:${threadId}`;
const indexKey=(chatId:string)=>`prepwise-chat-index:${chatId}`;
// Lives outside the components, so an answer keeps coming while you look at something else.
const chats=new Map<string,ChatState>();
const indexes=new Map<string,ChatIndex>();
const controllers=new Map<string,AbortController>();
const listeners=new Set<()=>void>();
let bridge:Bridge|null=null;
let version=0;

const MODEL_KEY='prepwise-chat-model';
let model:ChatModel=defaultChatModel;
try {const saved=localStorage.getItem(MODEL_KEY);if(chatModels.some(m=>m.id===saved))model=saved as ChatModel;}catch {/* Without storage, the default is used. */}
const notify=()=>{version++;listeners.forEach(listener=>listener());};
export const chatModel=()=>model;
export function setChatModel(next:ChatModel) {
  model=next;
  try {localStorage.setItem(MODEL_KEY,next);}catch {/* It still applies until the page reloads. */}
  notify();
}
export const setChatBridge=(next:Bridge)=>{bridge=next;};
export const subscribeChats=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
/** Changes with anything in the store, so a panel redraws for a session it isn't showing too. */
export const chatVersion=()=>version;
export const chatState=(threadId:string)=>chats.get(threadId) || EMPTY;
export const chatIndex=(chatId:string):ChatIndex=>indexes.get(chatId) || {threads:[{id:chatId,title:'',updatedAt:''}],activeId:chatId,loaded:false};

function update(threadId:string,patch:Partial<ChatState>,save=false) {
  const next={...chatState(threadId),...patch};
  chats.set(threadId,next);
  notify();
  if(save)void set(threadKey(threadId),{messages:next.messages,sessionId:next.sessionId}).catch(()=>{});
}
function setIndex(chatId:string,index:ChatIndex) {
  indexes.set(chatId,index);
  notify();
  // A session nothing was said in isn't worth keeping.
  void set(indexKey(chatId),{threads:index.threads.filter(t=>t.title),activeId:index.activeId}).catch(()=>{});
}
async function loadThread(threadId:string) {
  if(chatState(threadId).loaded)return;
  const saved=await get<{messages:ChatMessage[];sessionId?:string}>(threadKey(threadId)).catch(()=>undefined);
  if(!chatState(threadId).loaded)update(threadId,{messages:saved?.messages || [],sessionId:saved?.sessionId,loaded:true});
}
const loadingIndex=new Map<string,Promise<void>>();
export function loadChat(chatId:string) {
  if(indexes.get(chatId)?.loaded)return loadThread(indexes.get(chatId)!.activeId);
  const pending=loadingIndex.get(chatId) || (async()=>{
    const saved=await get<{threads:ChatThread[];activeId:string}>(indexKey(chatId)).catch(()=>undefined);
    if(saved?.threads?.length) {
      const activeId=saved.threads.some(t=>t.id===saved.activeId) ? saved.activeId : saved.threads[0].id;
      indexes.set(chatId,{threads:saved.threads,activeId,loaded:true});
    }
    else {
      // A chat from before sessions becomes the first one, titled from what was said.
      const old=await get<{messages:ChatMessage[]}>(threadKey(chatId)).catch(()=>undefined);
      const first=old?.messages?.find(m=>m.role==='user');
      indexes.set(chatId,{threads:[{id:chatId,title:first ? threadTitle(first.text) : '',updatedAt:first ? new Date().toISOString() : ''}],activeId:chatId,loaded:true});
    }
    notify();
    await loadThread(indexes.get(chatId)!.activeId);
  })().finally(()=>loadingIndex.delete(chatId));
  loadingIndex.set(chatId,pending);
  return pending;
}
/** Leaving an unused new session behind removes it, so the list only holds real conversations. */
const withoutUnused=(threads:ChatThread[],keep:string)=>threads.filter(t=>t.title || t.id===keep);
export function selectThread(chatId:string,threadId:string) {
  const index=chatIndex(chatId);
  setIndex(chatId,{...index,threads:withoutUnused(index.threads,threadId),activeId:threadId});
  void loadThread(threadId);
}
export function newThread(chatId:string) {
  const index=chatIndex(chatId);
  const current=index.threads.find(t=>t.id===index.activeId);
  if(current && !current.title)return;
  const id=crypto.randomUUID();
  update(id,{messages:[],running:false,loaded:true});
  setIndex(chatId,{...index,threads:[{id,title:'',updatedAt:''},...withoutUnused(index.threads,id)],activeId:id});
}
/** Removes the chat here and Claude Code's transcript of it. False if the transcript couldn't be removed. */
export async function deleteThread(chatId:string,threadId:string) {
  stopChat(threadId);
  chats.delete(threadId);
  void del(threadKey(threadId)).catch(()=>{});
  const index=chatIndex(chatId);
  const rest=index.threads.filter(t=>t.id!==threadId);
  if(rest.length) {
    const activeId=index.activeId===threadId ? rest[0].id : index.activeId;
    setIndex(chatId,{...index,threads:rest,activeId});
    void loadThread(activeId);
  }
  else {
    const id=crypto.randomUUID();
    update(id,{messages:[],running:false,loaded:true});
    setIndex(chatId,{...index,threads:[{id,title:'',updatedAt:''}],activeId:id});
  }
  try {
    const response=await fetch('/api/chat/forget',{method:'POST',headers:{'Content-Type':'application/json','X-Prepwise-Checkpoint':'1'},body:JSON.stringify({thread:threadId})});
    return response.ok;
  }
  catch {return false;}
}
const patchLast=(threadId:string,patch:(message:ChatMessage)=>ChatMessage)=>{
  const messages=[...chatState(threadId).messages];
  messages[messages.length-1]=patch(messages[messages.length-1]);
  return messages;
};
function runChange(change:ChatChange,force=false):ChatChange {
  const workspace=bridge?.get();
  if(!workspace || !bridge)return {...change,status:'conflict'};
  const result=applyChatChange(workspace,change,force);
  if(result.ok)bridge.update(current=>applyChatChange(current,change,force).workspace);
  return {...change,status:result.status};
}
const replaceChange=(threadId:string,messageId:string,index:number,change:ChatChange)=>update(threadId,{messages:chatState(threadId).messages.map(m=>m.id===messageId ? {...m,changes:m.changes?.map((c,i)=>i===index ? change : c)} : m)},true);
export const applyAnyway=(threadId:string,messageId:string,index:number,change:ChatChange)=>replaceChange(threadId,messageId,index,runChange(change,true));
export const discardChange=(threadId:string,messageId:string,index:number,change:ChatChange)=>replaceChange(threadId,messageId,index,{...change,status:'discarded'});
/** False when the document has been edited since, so undoing would lose that work. */
export function undoChange(threadId:string,messageId:string,index:number,change:ChatChange) {
  const workspace=bridge?.get();
  if(!workspace || !bridge)return false;
  const result=undoChatChange(workspace,change);
  if(!result.ok)return false;
  bridge.update(current=>undoChatChange(current,change).workspace);
  replaceChange(threadId,messageId,index,{...change,status:'undone'});
  return true;
}
export const chatContextItems=()=>{const workspace=bridge?.get();return workspace ? contextItems(workspace) : [];};
export const stopChat=(threadId:string)=>controllers.get(threadId)?.abort();
export async function sendChat(chatId:string,threadId:string,text:string,context?:ChatContext) {
  const workspace=bridge?.get();
  if(!workspace || chatState(threadId).running || !text.trim())return;
  const previous=chatState(threadId);
  const messages:ChatMessage[]=[...previous.messages,{id:crypto.randomUUID(),role:'user',text},{id:crypto.randomUUID(),role:'assistant',text:'',tools:[]}];
  update(threadId,{messages,running:true,activity:'Thinking…'},true);
  const index=chatIndex(chatId);
  setIndex(chatId,{...index,threads:index.threads.map(t=>t.id===threadId ? {...t,title:t.title || threadTitle(text),updatedAt:new Date().toISOString()} : t)});
  const controller=new AbortController();
  controllers.set(threadId,controller);
  const appendText=(more:string)=>update(threadId,{messages:patchLast(threadId,m=>({...m,text:m.text+more})),activity:undefined});
  const fail=(message:string)=>update(threadId,{messages:patchLast(threadId,m=>({...m,text:m.text ? `${m.text}\n\n${message}` : message,error:true}))});
  const handle=(event:Record<string,any>)=>{
    if(event.type==='session')update(threadId,{sessionId:event.id,messages:patchLast(threadId,m=>({...m,model:event.model}))});
    else if(event.type==='text')appendText(event.text);
    else if(event.type==='tool')update(threadId,{messages:patchLast(threadId,m=>({...m,tools:[...(m.tools || []),event.label]})),activity:event.label});
    else if(event.type==='stopped')update(threadId,{messages:patchLast(threadId,m=>({...m,stopped:true}))});
    else if(event.type==='error')fail(event.message);
    else if(event.type==='done') {
      const changes=(event.changes as ChatChange[]).map(change=>runChange(change));
      update(threadId,{messages:patchLast(threadId,m=>({...m,changes,notes:event.skipped,usage:event.usage}))});
    }
  };
  try {
    const history=previous.messages.filter(m=>m.text && !m.error).slice(-30).map(({role,text})=>({role,text}));
    const response=await fetch('/api/chat/message',{method:'POST',headers:{'Content-Type':'application/json','X-Prepwise-Checkpoint':'1'},body:JSON.stringify({...(chatId===WORKSPACE_CHAT ? {scope:WORKSPACE_CHAT,viewing:bridge?.viewing()} : {noteId:chatId}),thread:threadId,message:text,context,today:localDate(),sessionId:previous.sessionId,model,history,...chatWorkspace(workspace)}),signal:controller.signal});
    if(!response.ok || !response.body) {
      const detail=await response.json().catch(()=>null) as {error?:string}|null;
      throw new Error(detail?.error || 'The chat isn’t available. Is the app running with npm run dev?');
    }
    const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer='';
    for(;;) {
      const {value,done}=await reader.read();
      if(done)break;
      buffer+=value;
      const lines=buffer.split('\n');
      buffer=lines.pop() || '';
      for(const line of lines) if(line.trim())handle(JSON.parse(line));
    }
  }
  catch(error) {
    if(controller.signal.aborted) {if(chats.has(threadId))update(threadId,{messages:patchLast(threadId,m=>({...m,stopped:true}))});}
    else fail(error instanceof Error ? error.message : 'The chat failed.');
  }
  finally {
    controllers.delete(threadId);
    if(chats.has(threadId))update(threadId,{running:false,activity:undefined},true);
  }
}
