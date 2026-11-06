import { useRef, useState, type ReactNode } from 'react';
import { Bold, Code, Code2, Heading1, Heading2, Heading3, Image, Italic, Link2, List, ListChecks, ListOrdered, Minus, Quote, Redo2, Strikethrough, Table2, Undo2 } from 'lucide-react';
import { cleanLinkUrl, type ToolbarAction } from './markdown-edits';

const mod=/Mac|iPhone|iPad/.test(typeof navigator==='undefined' ? '' : navigator.platform) ? '⌘' : 'Ctrl+';
const GROUPS:{action:ToolbarAction;label:string;icon:ReactNode}[][]=[
  [{action:'undo',label:`Undo (${mod}Z)`,icon:<Undo2 size={15}/>},{action:'redo',label:`Redo (${mod}⇧Z)`,icon:<Redo2 size={15}/>}],
  [{action:'h1',label:'Heading 1',icon:<Heading1 size={16}/>},{action:'h2',label:'Heading 2',icon:<Heading2 size={16}/>},{action:'h3',label:'Heading 3',icon:<Heading3 size={16}/>}],
  [{action:'bold',label:`Bold (${mod}B)`,icon:<Bold size={15}/>},{action:'italic',label:`Italic (${mod}I)`,icon:<Italic size={15}/>},{action:'strike',label:'Strikethrough',icon:<Strikethrough size={15}/>},{action:'code',label:'Inline code',icon:<Code size={15}/>}],
  [{action:'bullet',label:'Bullet list',icon:<List size={16}/>},{action:'ordered',label:'Numbered list',icon:<ListOrdered size={16}/>},{action:'task',label:'Checklist',icon:<ListChecks size={16}/>},{action:'quote',label:'Quote',icon:<Quote size={15}/>}],
  [{action:'link',label:'Link',icon:<Link2 size={15}/>},{action:'image',label:'Picture',icon:<Image size={15}/>},{action:'table',label:'Table',icon:<Table2 size={15}/>},{action:'codeblock',label:'Code block',icon:<Code2 size={16}/>},{action:'rule',label:'Divider',icon:<Minus size={16}/>}],
];

/** The formatting bar for notes. Live and Write share it, and each decides what its buttons do. */
export default function EditorToolbar({name,active=[],onAction,onLink,onPictures}: {name:string;active?:ToolbarAction[];onAction:(action:ToolbarAction)=>void;onLink:(url:string)=>void;onPictures:(files:File[])=>void}) {
  const picker=useRef<HTMLInputElement>(null);
  const [linking,setLinking]=useState(false);
  const [url,setUrl]=useState('');
  const run=(action:ToolbarAction)=>{
    if(action==='image')picker.current?.click();
    else if(action==='link' && !active.includes('link')) {setUrl('');setLinking(open=>!open);}
    else onAction(action);
  };
  const applyLink=()=>{
    const clean=cleanLinkUrl(url);
    setLinking(false);
    if(clean)onLink(clean);
  };
  return <div className="markdown-toolbar" role="toolbar" aria-label="Formatting">
    {GROUPS.map((group,i)=><div className="toolbar-group" key={i}>{group.map(item=><button type="button" key={item.action} aria-label={item.label} title={item.label} aria-pressed={active.includes(item.action) || undefined} className={active.includes(item.action) ? 'is-on' : ''} onMouseDown={e=>e.preventDefault()} onClick={()=>run(item.action)}>{item.icon}</button>)}</div>)}
    <small>{name}</small>
    {linking && <div className="toolbar-link"><input autoFocus aria-label="Link address" placeholder="Paste or type a link" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') {e.preventDefault();applyLink();}else if(e.key==='Escape') {e.preventDefault();e.stopPropagation();setLinking(false);}}}/><button type="button" className="small-button" disabled={!cleanLinkUrl(url)} onMouseDown={e=>e.preventDefault()} onClick={applyLink}>Add link</button></div>}
    <input ref={picker} type="file" hidden multiple accept="image/*" aria-label="Choose pictures" onChange={e=>{const files=Array.from(e.target.files || []);e.target.value='';if(files.length)onPictures(files);}}/>
  </div>;
}
