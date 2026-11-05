import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, AtSign, Check, ChevronDown, ChevronRight, LoaderCircle, RotateCcw, Sparkles, Square, Trash2, TriangleAlert, X } from 'lucide-react';
import { activeMention, changeLines, chatModels, diffCounts, diffHunks, matchContext, messageContext, modelName, tokenTotal, type ContextItem, type ChatChange, type ChatMessage, type ChatModel } from './doc-chat-model';
import { applyAnyway, chatContextItems, chatModel, chatState, clearChat, discardChange, loadChat, sendChat, setChatModel, stopChat, subscribeChats, undoChange } from './doc-chat-store';
import { clampColumn, columnLimits } from './layout-settings';

const DEFAULT_WIDTH=360;
// Below this the window is too narrow to share, so the chat covers it until closed.
const SHARE_WIDTH=680;
const DOC_CHAT={intro:'Ask about this doc, or ask for a change. Claude focuses on this doc and can read your whole workspace too.',placeholder:'Message Claude about this doc. Type @ to add another…',suggestions:['Summarize this doc','What’s missing or unclear here?','Quiz me on this doc','Tighten the writing in this doc']};
const WORKSPACE={intro:'Ask about anything in your workspace: documents, uploaded files, whiteboard text, and your calendar. You can ask for changes too, like adding a milestone.',placeholder:'Message Claude. Type @ to focus on a doc and save tokens…',suggestions:['What should I focus on next?','What’s coming up on my calendar?','Summarize my prep so far','Which topics look weakest?']};

function ChangeCard({noteId,messageId,index,change,onOpen}: {noteId:string;messageId:string;index:number;change:ChatChange;onOpen:(id:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [blocked,setBlocked]=useState(false);
  const lines=changeLines(change);
  const {added,removed}=diffCounts(lines);
  const plans=change.kind==='plans';
  const name=plans ? change.title : `“${change.title}”`;
  const label={applied:plans ? 'Updated your plans' : change.kind==='new' ? `Created ${name}` : `Edited ${name}`,conflict:`${name} changed while Claude was working, so this edit wasn’t used`,discarded:`Left ${name} as it is`,undone:`Undid the change to ${name}`,missing:`${name} no longer exists`}[change.status || 'applied'];
  return <div className={`chat-change is-${change.status || 'applied'}`}>
    <div className="chat-change-head">
      {change.status==='conflict' ? <TriangleAlert size={14}/> : change.status==='applied' ? <Check size={14}/> : <RotateCcw size={13}/>}
      <span>{label}</span>
      <small><b>+{added}</b> <i>−{removed}</i></small>
    </div>
    <div className="chat-change-actions">
      <button className="text-button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} Changes</button>
      {change.status==='applied' && !plans && change.noteId!==noteId && <button className="text-button" onClick={()=>onOpen(change.noteId)}>Open</button>}
      {change.status==='applied' && <button className="text-button" onClick={()=>setBlocked(!undoChange(noteId,messageId,index,change))}>Undo</button>}
      {change.status==='conflict' && <><button className="text-button" onClick={()=>applyAnyway(noteId,messageId,index,change)}>Use it anyway</button><button className="text-button" onClick={()=>discardChange(noteId,messageId,index,change)}>Discard</button></>}
    </div>
    {blocked && change.status==='applied' && <p className="chat-change-note">This doc has been edited since, so Undo would lose that work.</p>}
    {open && <div className="chat-diff">{diffHunks(lines).map((line,i)=>line ? <div key={i} className={`diff-${line.type}`}><span>{line.type==='add' ? '+' : line.type==='remove' ? '−' : ' '}</span><code>{line.text || ' '}</code></div> : <div key={i} className="diff-gap">⋯</div>)}</div>}
  </div>;
}

function Message({noteId,message,onOpen}: {noteId:string;message:ChatMessage;onOpen:(id:string)=>void}) {
  if(message.role==='user') return <div className="chat-message is-user">{message.text}</div>;
  return <div className={`chat-message is-assistant ${message.error ? 'is-error' : ''}`}>
    {!!message.tools?.length && <details className="chat-tools"><summary>{message.tools.length} {message.tools.length===1 ? 'step' : 'steps'}</summary>{message.tools.map((tool,i)=><div key={i}>{tool}</div>)}</details>}
    {message.text && <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>}
    {message.model && <small className="chat-model" title={message.usage ? `${message.usage.input.toLocaleString()} new input, ${message.usage.cacheWrite.toLocaleString()} newly cached, ${message.usage.cacheRead.toLocaleString()} reused from cache, ${message.usage.output.toLocaleString()} output` : undefined}>{modelName(message.model)}{message.usage ? ` · ${tokenTotal(message.usage).toLocaleString()} tokens` : ''}</small>}
    {message.stopped && <small className="chat-stopped">Stopped. Nothing from this answer was changed.</small>}
    {message.changes?.map((change,i)=><ChangeCard key={i} noteId={noteId} messageId={message.id} index={i} change={change} onOpen={onOpen}/>)}
    {message.notes?.map((note,i)=><p key={i} className="chat-change-note is-warning"><TriangleAlert size={13}/>{note}</p>)}
  </div>;
}

/** A chat shown at the side of what it's about: one document's window, or the whole page for the workspace chat. */
export default function DocChat({chatId,title,label,host,everything=false,width,onWidth,onClose,onOpenNote}: {chatId:string;title:string;label:string;host:string;everything?:boolean;width:number|null;onWidth:(width:number|null)=>void;onClose:()=>void;onOpenNote:(id:string)=>void}) {
  const copy=everything ? WORKSPACE : DOC_CHAT;
  const state=useSyncExternalStore(subscribeChats,()=>chatState(chatId));
  const model=useSyncExternalStore(subscribeChats,chatModel);
  const [draft,setDraft]=useState('');
  const [picked,setPicked]=useState<ContextItem[]>([]);
  const [mention,setMention]=useState<{start:number;query:string;items:ContextItem[];active:number}|null>(null);
  const [box,setBox]=useState<{top:number;left:number;width:number;height:number}|null>(null);
  const [dragWidth,setDragWidth]=useState<number|null>(null);
  const panel=useRef<HTMLElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const pinned=useRef(true);
  const input=useRef<HTMLTextAreaElement>(null);
  const wanted=dragWidth ?? width ?? DEFAULT_WIDTH;

  useEffect(()=>{void loadChat(chatId);setDraft('');setPicked([]);setMention(null);pinned.current=true;},[chatId]);
  // The panel follows its window. A fixed position lets the document scroll behind without moving it.
  // The space is set as a style because React rewrites these elements' classes when the page changes.
  useEffect(()=>{
    const pane=panel.current?.closest<HTMLElement>(host);
    if(!pane)return;
    const measure=()=>{
      // A phone has no room to share, so the chat takes the whole screen.
      if(window.innerWidth<=760) {
        pane.style.paddingRight='0px';
        setBox({top:0,left:0,width:window.innerWidth,height:window.innerHeight});
        return;
      }
      const rect=pane.getBoundingClientRect();
      const shared=rect.width>=SHARE_WIDTH;
      const size=shared ? Math.min(wanted,Math.round(rect.width*.55)) : rect.width;
      pane.style.paddingRight=shared ? `${size}px` : '0px';
      const top=Math.max(rect.top,0),bottom=Math.min(rect.bottom,window.innerHeight);
      setBox({top,left:rect.right-size,width:size,height:bottom-top});
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(pane);
    window.addEventListener('resize',measure);
    window.addEventListener('scroll',measure,true);
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);pane.style.removeProperty('padding-right');};
  },[wanted,host]);
  useEffect(()=>{if(pinned.current && list.current)list.current.scrollTop=list.current.scrollHeight;},[state.messages,state.activity]);

  const send=(text=draft)=>{
    if(!text.trim() || state.running)return;
    const context=messageContext(text,picked);
    setDraft('');
    setPicked([]);
    setMention(null);
    pinned.current=true;
    void sendChat(chatId,text.trim(),context);
    input.current?.focus();
  };
  const readMention=(text:string,caret:number)=>{
    const found=activeMention(text,caret);
    const items=found ? matchContext(chatContextItems().filter(item=>item.id!==chatId),found.query) : [];
    setMention(found && items.length ? {...found,items,active:0} : null);
  };
  const pick=(item:ContextItem)=>{
    if(!mention)return;
    const caret=input.current?.selectionStart ?? draft.length;
    const inserted=`@${item.title} `;
    const next=draft.slice(0,mention.start)+inserted+draft.slice(caret);
    setDraft(next);
    setPicked(current=>current.some(other=>other.id===item.id) ? current : [...current,item]);
    setMention(null);
    requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(mention.start+inserted.length,mention.start+inserted.length);});
  };
  const removePick=(item:ContextItem)=>{
    setPicked(current=>current.filter(other=>other.id!==item.id));
    setDraft(current=>current.split(`@${item.title} `).join('').split(`@${item.title}`).join(''));
  };
  const startMention=()=>{
    const area=input.current;
    const caret=area?.selectionStart ?? draft.length;
    const spaced=caret>0 && !/\s/.test(draft[caret-1]) ? ' @' : '@';
    const next=draft.slice(0,caret)+spaced+draft.slice(caret);
    setDraft(next);
    readMention(next,caret+spaced.length);
    requestAnimationFrame(()=>{area?.focus();area?.setSelectionRange(caret+spaced.length,caret+spaced.length);});
  };
  const chosen=picked.filter(item=>draft.includes(`@${item.title}`));
  const onKeyDown=(e:KeyboardEvent)=>{
    if(mention && !e.nativeEvent.isComposing) {
      if(e.key==='ArrowDown' || e.key==='ArrowUp') {e.preventDefault();const step=e.key==='ArrowDown' ? 1 : -1;setMention({...mention,active:(mention.active+step+mention.items.length)%mention.items.length});return;}
      if(e.key==='Enter' || e.key==='Tab') {e.preventDefault();pick(mention.items[mention.active]);return;}
      if(e.key==='Escape') {e.preventDefault();setMention(null);return;}
    }
    // During IME composition, Enter picks a candidate instead of sending.
    if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault();send();}
  };
  return <aside ref={panel} className="doc-chat" aria-label={`Chat about ${title}`} style={box ? {top:box.top,left:box.left,width:box.width,height:box.height} : {visibility:'hidden'}}>
    <div className="doc-chat-resizer" role="separator" aria-label="Resize chat" aria-orientation="vertical" title="Drag to resize. Double-click to reset."
      onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId) && box)setDragWidth(clampColumn(box.left+box.width-e.clientX,columnLimits.chat));}}
      onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId) && dragWidth!==null){onWidth(dragWidth);setDragWidth(null);}}}
      onDoubleClick={()=>{setDragWidth(null);onWidth(null);}}/>
    <div className="doc-chat-head">
      <Sparkles size={15}/><div><strong>{label}</strong><small>{title}</small></div>
      {state.messages.length>0 && <button className="icon-button" aria-label="Clear this chat" title="Clear this chat" onClick={()=>clearChat(chatId)}><Trash2 size={15}/></button>}
      <button className="icon-button" aria-label="Close chat" title="Close chat" onClick={onClose}><X size={16}/></button>
    </div>
    <div ref={list} className="doc-chat-messages" onScroll={e=>{const el=e.currentTarget;pinned.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;}}>
      {!state.messages.length && <div className="doc-chat-empty"><p>{copy.intro}</p>{copy.suggestions.map(text=><button key={text} className="small-button" onClick={()=>send(text)}>{text}</button>)}</div>}
      {state.messages.map(message=><Message key={message.id} noteId={chatId} message={message} onOpen={onOpenNote}/>)}
      {state.running && <div className="doc-chat-activity"><LoaderCircle size={13} className="spin"/>{state.activity || 'Writing…'}</div>}
    </div>
    <div className="doc-chat-composer">
      {mention && <div className="chat-mentions" role="listbox" aria-label="Add to this message">{mention.items.map((item,i)=><button key={item.id} role="option" aria-selected={i===mention.active} className={i===mention.active ? 'is-active' : ''} onMouseDown={e=>{e.preventDefault();pick(item);}}><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>}
      {chosen.length>0 && <div className="chat-chosen" aria-label="Claude can only use these for this message"><small>Only:</small>{chosen.map(item=><span key={item.id}>{item.title}<button aria-label={`Remove ${item.title}`} onClick={()=>removePick(item)}><X size={11}/></button></span>)}</div>}
      <textarea ref={input} rows={2} aria-label="Message Claude" placeholder={copy.placeholder} value={draft} onChange={e=>{setDraft(e.target.value);readMention(e.target.value,e.target.selectionStart);}} onKeyDown={onKeyDown}/>
      {state.running ? <button className="primary doc-chat-send" aria-label="Stop" title="Stop" onClick={()=>stopChat(chatId)}><Square size={13}/></button> : <button className="primary doc-chat-send" aria-label="Send" title="Send (Enter)" disabled={!draft.trim()} onClick={()=>send()}><ArrowUp size={15}/></button>}
      <div className="doc-chat-model"><button className="icon-button chat-at" aria-label="Add a doc to this message" title="Limit this message to specific docs, to save tokens" onClick={startMention}><AtSign size={14}/></button><label>Model<select value={model} onChange={e=>setChatModel(e.target.value as ChatModel)}>{chatModels.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label><small>Uses your Claude Code plan. What Claude reads is sent to Anthropic.</small></div>
    </div>
  </aside>;
}
