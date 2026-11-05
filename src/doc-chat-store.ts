import { del, get, set } from 'idb-keyval';
import { applyChatChange, chatModels, chatWorkspace, defaultChatModel, contextItems, undoChatChange, WORKSPACE_CHAT, type ChatChange, type ChatContext, type ChatMessage, type ChatModel } from './doc-chat-model';
import { localDate, type Workspace } from './model';

export type ChatState = {messages:ChatMessage[]; sessionId?:string; running:boolean; activity?:string; loaded:boolean};
type Bridge = {get:()=>Workspace|null; update:(change:(workspace:Workspace)=>Workspace)=>void; viewing:()=>string};

const EMPTY: ChatState = {messages:[],running:false,loaded:false};
const key=(noteId:string)=>`prepwise-chat:${noteId}`;
// Lives outside the components, so an answer keeps coming while you look at another document.
const chats=new Map<string,ChatState>();
const controllers=new Map<string,AbortController>();
const listeners=new Set<()=>void>();
let bridge:Bridge|null=null;

const MODEL_KEY='prepwise-chat-model';
let model:ChatModel=defaultChatModel;
try {const saved=localStorage.getItem(MODEL_KEY);if(chatModels.some(m=>m.id===saved))model=saved as ChatModel;}catch {/* Without storage, the default is used. */}
export const chatModel=()=>model;
export function setChatModel(next:ChatModel) {
  model=next;
  try {localStorage.setItem(MODEL_KEY,next);}catch {/* It still applies until the page reloads. */}
  listeners.forEach(listener=>listener());
}
export const setChatBridge=(next:Bridge)=>{bridge=next;};
export const subscribeChats=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
export const chatState=(noteId:string)=>chats.get(noteId) || EMPTY;

function update(noteId:string,patch:Partial<ChatState>,save=false) {
  const next={...chatState(noteId),...patch};
  chats.set(noteId,next);
  listeners.forEach(listener=>listener());
  if(save)void set(key(noteId),{messages:next.messages,sessionId:next.sessionId}).catch(()=>{});
}
export async function loadChat(noteId:string) {
  if(chatState(noteId).loaded)return;
  const saved=await get<{messages:ChatMessage[];sessionId?:string}>(key(noteId)).catch(()=>undefined);
  if(!chatState(noteId).loaded)update(noteId,{messages:saved?.messages || [],sessionId:saved?.sessionId,loaded:true});
}
const patchLast=(noteId:string,patch:(message:ChatMessage)=>ChatMessage)=>{
  const messages=[...chatState(noteId).messages];
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
const replaceChange=(noteId:string,messageId:string,index:number,change:ChatChange)=>update(noteId,{messages:chatState(noteId).messages.map(m=>m.id===messageId ? {...m,changes:m.changes?.map((c,i)=>i===index ? change : c)} : m)},true);
export const applyAnyway=(noteId:string,messageId:string,index:number,change:ChatChange)=>replaceChange(noteId,messageId,index,runChange(change,true));
export const discardChange=(noteId:string,messageId:string,index:number,change:ChatChange)=>replaceChange(noteId,messageId,index,{...change,status:'discarded'});
/** False when the document has been edited since, so undoing would lose that work. */
export function undoChange(noteId:string,messageId:string,index:number,change:ChatChange) {
  const workspace=bridge?.get();
  if(!workspace || !bridge)return false;
  const result=undoChatChange(workspace,change);
  if(!result.ok)return false;
  bridge.update(current=>undoChatChange(current,change).workspace);
  replaceChange(noteId,messageId,index,{...change,status:'undone'});
  return true;
}
export const stopChat=(noteId:string)=>controllers.get(noteId)?.abort();
export function clearChat(noteId:string) {
  stopChat(noteId);
  update(noteId,{messages:[],sessionId:undefined,running:false,activity:undefined,loaded:true});
  void del(key(noteId)).catch(()=>{});
}
export const chatContextItems=()=>{const workspace=bridge?.get();return workspace ? contextItems(workspace) : [];};
export async function sendChat(noteId:string,text:string,context?:ChatContext) {
  const workspace=bridge?.get();
  if(!workspace || chatState(noteId).running || !text.trim())return;
  const previous=chatState(noteId);
  const messages:ChatMessage[]=[...previous.messages,{id:crypto.randomUUID(),role:'user',text},{id:crypto.randomUUID(),role:'assistant',text:'',tools:[]}];
  update(noteId,{messages,running:true,activity:'Thinking…'},true);
  const controller=new AbortController();
  controllers.set(noteId,controller);
  const appendText=(more:string)=>update(noteId,{messages:patchLast(noteId,m=>({...m,text:m.text+more})),activity:undefined});
  const fail=(message:string)=>update(noteId,{messages:patchLast(noteId,m=>({...m,text:m.text ? `${m.text}\n\n${message}` : message,error:true}))});
  const handle=(event:Record<string,any>)=>{
    if(event.type==='session')update(noteId,{sessionId:event.id,messages:patchLast(noteId,m=>({...m,model:event.model}))});
    else if(event.type==='text')appendText(event.text);
    else if(event.type==='tool')update(noteId,{messages:patchLast(noteId,m=>({...m,tools:[...(m.tools || []),event.label]})),activity:event.label});
    else if(event.type==='stopped')update(noteId,{messages:patchLast(noteId,m=>({...m,stopped:true}))});
    else if(event.type==='error')fail(event.message);
    else if(event.type==='done') {
      const changes=(event.changes as ChatChange[]).map(change=>runChange(change));
      update(noteId,{messages:patchLast(noteId,m=>({...m,changes,notes:event.skipped,usage:event.usage}))});
    }
  };
  try {
    const history=previous.messages.filter(m=>m.text && !m.error).slice(-30).map(({role,text})=>({role,text}));
    const response=await fetch('/api/chat/message',{method:'POST',headers:{'Content-Type':'application/json','X-Prepwise-Checkpoint':'1'},body:JSON.stringify({...(noteId===WORKSPACE_CHAT ? {scope:WORKSPACE_CHAT,viewing:bridge?.viewing()} : {noteId}),message:text,context,today:localDate(),sessionId:previous.sessionId,model,history,...chatWorkspace(workspace)}),signal:controller.signal});
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
    if(controller.signal.aborted)update(noteId,{messages:patchLast(noteId,m=>({...m,stopped:true}))});
    else fail(error instanceof Error ? error.message : 'The chat failed.');
  }
  finally {
    controllers.delete(noteId);
    update(noteId,{running:false,activity:undefined},true);
  }
}
