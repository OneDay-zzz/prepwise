import { useEffect, useRef, useState } from 'react';
import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, remarkStringifyOptionsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import { commonmark, createCodeBlockCommand, imageSchema, insertHrCommand, liftListItemCommand, remarkPreserveEmptyLinePlugin, toggleEmphasisCommand, toggleInlineCodeCommand, toggleStrongCommand, turnIntoTextCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInHeadingCommand, wrapInOrderedListCommand } from '@milkdown/kit/preset/commonmark';
import { gfm, insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { lift } from '@milkdown/kit/prose/commands';
import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose, $view, callCommand, replaceAll } from '@milkdown/kit/utils';
import EditorToolbar from './EditorToolbar';
import type { ToolbarAction } from './markdown-edits';
import type { Section, UploadedFile } from './model';
import { bracketImagePaths, findNoteUpload, type SavedPicture } from './note-images';
import { getUpload } from './uploads';

const SAVE_DELAY_MS = 120;

type Props = {body:string;section:Section;uploads?:UploadedFile[];onChange:(body:string)=>void;onPictures:(files:File[])=>Promise<SavedPicture[]>};

/** Which toolbar buttons describe where the cursor is. */
function activeFormats(view:EditorView) {
  const {state}=view,{from,to,empty,$from}=state.selection,{marks}=state.schema;
  const found:ToolbarAction[]=[];
  const hasMark=(name:string)=>{
    const mark=marks[name];
    if(!mark)return false;
    return empty ? !!mark.isInSet(state.storedMarks || $from.marks()) : state.doc.rangeHasMark(from,to,mark);
  };
  if(hasMark('strong'))found.push('bold');
  if(hasMark('emphasis'))found.push('italic');
  if(hasMark('strike_through'))found.push('strike');
  if(hasMark('inlineCode'))found.push('code');
  if(hasMark('link'))found.push('link');
  for(let depth=$from.depth;depth>0;depth--) {
    const node=$from.node(depth),name=node.type.name;
    if(name==='heading' && node.attrs.level<=3)found.push(`h${node.attrs.level}` as ToolbarAction);
    if(name==='blockquote')found.push('quote');
    if(name==='code_block')found.push('codeblock');
    if(name==='list_item') {
      found.push(node.attrs.checked!==null && node.attrs.checked!==undefined ? 'task' : node.attrs.listType==='ordered' ? 'ordered' : 'bullet');
      break;
    }
  }
  return found;
}
/** Adds or removes a link. With nothing selected, the address itself becomes the link's text. */
function setLink(view:EditorView,url?:string) {
  const {state}=view,{from,to,empty,$from}=state.selection,type=state.schema.marks.link;
  if(!url) {
    // Removing a link with just a cursor in it covers the whole link.
    if(!empty) {view.dispatch(state.tr.removeMark(from,to,type));return;}
    let start=from,end=from;
    const parent=$from.parent,base=$from.start();
    parent.forEach((child,offset)=>{
      if(type.isInSet(child.marks) && base+offset<=from && from<=base+offset+child.nodeSize) {start=base+offset;end=start+child.nodeSize;}
    });
    view.dispatch(state.tr.removeMark(start,end,type));
    return;
  }
  const mark=type.create({href:url});
  view.dispatch(empty ? state.tr.insert(from,state.schema.text(url,[mark])) : state.tr.addMark(from,to,mark));
}
/** A checklist is a bullet list whose items have a checked state. */
function markAsTask(view:EditorView,wrap:()=>void) {
  const inList=()=>{
    const {$from}=view.state.selection;
    for(let depth=$from.depth;depth>0;depth--) if($from.node(depth).type.name==='list_item')return depth;
    return 0;
  };
  if(!inList())wrap();
  const depth=inList();
  if(!depth)return;
  const {$from}=view.state.selection,position=$from.before(depth);
  view.dispatch(view.state.tr.setNodeMarkup(position,undefined,{...$from.node(depth).attrs,checked:false}));
}

export default function LiveEditor({body,section,uploads,onChange,onPictures}: Props) {
  const root=useRef<HTMLDivElement>(null);
  const editor=useRef<Editor|null>(null);
  // What the editor currently holds, to tell another window's edit apart from this editor's own.
  const held=useRef(body);
  const latest=useRef({onChange,section,uploads,onPictures});
  latest.current={onChange,section,uploads,onPictures};
  const applyingOutsideEdit=useRef(false);
  const [active,setActive]=useState<ToolbarAction[]>([]);
  const pictureAdder=useRef<(files:File[])=>void>(()=>{});

  useEffect(()=>{
    let cancelled=false,timer=0;
    let flush=()=>{};
    const shown=(source:string,image:HTMLImageElement,alt:string)=>{
      const upload=findNoteUpload(source,latest.current.section,latest.current.uploads);
      image.alt=alt;
      if(!upload){image.src=source;return ()=>{};}
      let url='',gone=false;
      getUpload(upload.id).then(blob=>{if(blob && !gone){url=URL.createObjectURL(blob);image.src=url;}}).catch(()=>{});
      return ()=>{gone=true;if(url)URL.revokeObjectURL(url);};
    };
    // The note's text keeps the link as written. Only what's displayed points at the gallery file.
    const imageView=$view(imageSchema.node,()=>initial=>{
      const dom=document.createElement('img');
      let current=initial;
      let release=shown(String(current.attrs.src),dom,String(current.attrs.alt));
      return {dom,ignoreMutation:()=>true,destroy:()=>release(),update(next){
        if(next.type!==current.type)return false;
        if(next.attrs.src!==current.attrs.src){release();release=shown(String(next.attrs.src),dom,String(next.attrs.alt));}
        current=next;
        return true;
      }};
    });
    const saver=$prose(ctx=>new Plugin({view:view=>{
      flush=()=>{
        window.clearTimeout(timer);timer=0;
        const text=ctx.get(serializerCtx)(view.state.doc);
        if(text===held.current)return;
        held.current=text;
        latest.current.onChange(text);
      };
      return {update(_,previous){
        const next=activeFormats(view);
        setActive(current=>current.join()===next.join() ? current : next);
        root.current?.classList.toggle('is-empty',view.state.doc.textContent==='' && view.state.doc.childCount<=1);
        if(applyingOutsideEdit.current || view.state.doc.eq(previous.doc))return;
        window.clearTimeout(timer);
        timer=window.setTimeout(flush,SAVE_DELAY_MS);
      },destroy(){if(timer)flush();}};
    }}));
    const addPictures=(view:EditorView,files:File[],position:number)=>{
      void latest.current.onPictures(files).then(pictures=>{
        if(view.isDestroyed || !pictures.length)return;
        // The image shows as soon as it's inserted, which can be before the next render brings its upload.
        latest.current.uploads=[...(latest.current.uploads || []),...pictures.map(p=>p.upload)];
        const image=view.state.schema.nodes.image;
        const at=Math.min(position,view.state.doc.content.size);
        let tr=view.state.tr;
        for(const picture of [...pictures].reverse())tr=tr.replaceRangeWith(at,at,image.create({src:picture.src,alt:picture.alt}));
        view.dispatch(tr);
      });
    };
    pictureAdder.current=files=>{const view=editor.current?.action(ctx=>ctx.get(editorViewCtx));if(view)addPictures(view,files,view.state.selection.from);};
    const base=Editor.make().config(ctx=>{
      ctx.set(rootCtx,root.current);
      ctx.set(defaultValueCtx,bracketImagePaths(held.current));
      ctx.update(remarkStringifyOptionsCtx,options=>({...options,bullet:'-' as const,rule:'-' as const,emphasis:'*' as const,strong:'*' as const,fence:'`' as const,fences:true}));
      ctx.update(editorViewOptionsCtx,options=>({...options,
        attributes:{class:'markdown-preview',spellcheck:'true','aria-label':'Live Markdown editor'},
        handleDrop(view,event){
          const files=Array.from((event as DragEvent).dataTransfer?.files || []);
          if(!files.length)return false;
          event.preventDefault();
          const point=event as DragEvent;
          addPictures(view,files,view.posAtCoords({left:point.clientX,top:point.clientY})?.pos ?? view.state.selection.from);
          return true;
        },
        handlePaste(view,event){
          const files=Array.from(event.clipboardData?.files || []);
          if(!files.length)return false;
          event.preventDefault();
          addPictures(view,files,view.state.selection.from);
          return true;
        },
        handleClick(view,_pos,event){
          const target=event.target as HTMLElement;
          const link=target.closest('a');
          if(link && (event.metaKey || event.ctrlKey)){window.open(link.href,'_blank','noopener,noreferrer');return true;}
          // The checkbox is drawn on the list item itself, so only its own box lands here.
          if(target.matches('li[data-item-type=task]')){
            const position=view.posAtDOM(target,0)-1;
            const item=view.state.doc.nodeAt(position);
            if(item){view.dispatch(view.state.tr.setNodeMarkup(position,undefined,{...item.attrs,checked:!item.attrs.checked}));return true;}
          }
          return false;
        },
      }));
    }).use(commonmark);
    // Without this, a blank line would be saved as a literal <br />, which Read displays as text.
    base.remove(remarkPreserveEmptyLinePlugin).then(editorBase=>editorBase.use(gfm).use(history).use(clipboard).use(imageView).use(saver).create()).then(ready=>{
      if(cancelled){void ready.destroy();return;}
      editor.current=ready;
      root.current?.classList.toggle('is-empty',!held.current.trim());
    }).catch(()=>{});
    return ()=>{
      cancelled=true;
      if(timer)flush();
      const current=editor.current;
      editor.current=null;
      if(current)void current.destroy();
    };
  },[]);

  // Another window showing this note may have changed it.
  useEffect(()=>{
    if(body===held.current || !editor.current)return;
    held.current=body;
    applyingOutsideEdit.current=true;
    editor.current.action(replaceAll(bracketImagePaths(body)));
    applyingOutsideEdit.current=false;
  },[body]);

  const run=(action:ToolbarAction)=>{
    const current=editor.current;
    if(!current)return;
    const on=active.includes(action);
    current.action(ctx=>{
      const view=ctx.get(editorViewCtx);
      const call=<T,>(command:{key:Parameters<typeof callCommand>[0]},payload?:T)=>callCommand(command.key,payload)(ctx);
      if(action==='undo')call(undoCommand);
      else if(action==='redo')call(redoCommand);
      else if(action==='h1' || action==='h2' || action==='h3') {if(on)call(turnIntoTextCommand);else call(wrapInHeadingCommand,Number(action[1]));}
      else if(action==='bold')call(toggleStrongCommand);
      else if(action==='italic')call(toggleEmphasisCommand);
      else if(action==='strike')call(toggleStrikethroughCommand);
      else if(action==='code')call(toggleInlineCodeCommand);
      else if(action==='bullet') {if(on)call(liftListItemCommand);else call(wrapInBulletListCommand);}
      else if(action==='ordered') {if(on)call(liftListItemCommand);else call(wrapInOrderedListCommand);}
      else if(action==='task') {if(on)call(liftListItemCommand);else markAsTask(view,()=>call(wrapInBulletListCommand));}
      else if(action==='quote') {if(on)lift(view.state,view.dispatch);else call(wrapInBlockquoteCommand);}
      else if(action==='link')setLink(view);
      else if(action==='table')call(insertTableCommand,{row:3,col:3});
      else if(action==='codeblock') {if(on)call(turnIntoTextCommand);else call(createCodeBlockCommand);}
      else if(action==='rule')call(insertHrCommand);
      view.focus();
    });
  };
  const addLink=(url:string)=>editor.current?.action(ctx=>{const view=ctx.get(editorViewCtx);setLink(view,url);view.focus();});
  return <div className="live-editor">
    <EditorToolbar name="Live" active={active} onAction={run} onLink={addLink} onPictures={files=>pictureAdder.current(files)}/>
    <div ref={root} className="live-editor-surface"/>
  </div>;
}
