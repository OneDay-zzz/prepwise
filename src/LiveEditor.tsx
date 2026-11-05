import { useEffect, useRef, type MouseEvent } from 'react';
import { defaultValueCtx, Editor, editorViewOptionsCtx, remarkStringifyOptionsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { commonmark, createCodeBlockCommand, imageSchema, remarkPreserveEmptyLinePlugin, toggleEmphasisCommand, toggleStrongCommand, wrapInBulletListCommand, wrapInHeadingCommand } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose, $view, callCommand, replaceAll } from '@milkdown/kit/utils';
import { Bold, Code2, Italic, List } from 'lucide-react';
import type { Section, UploadedFile } from './model';
import { bracketImagePaths, findNoteUpload } from './note-images';
import { getUpload } from './uploads';

const SAVE_DELAY_MS = 120;

type Props = {body:string;section:Section;uploads?:UploadedFile[];onChange:(body:string)=>void};

export default function LiveEditor({body,section,uploads,onChange}: Props) {
  const root=useRef<HTMLDivElement>(null);
  const editor=useRef<Editor|null>(null);
  // What the editor currently holds, to tell another window's edit apart from this editor's own.
  const held=useRef(body);
  const latest=useRef({onChange,section,uploads});
  latest.current={onChange,section,uploads};
  const applyingOutsideEdit=useRef(false);

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
        root.current?.classList.toggle('is-empty',view.state.doc.textContent==='' && view.state.doc.childCount<=1);
        if(applyingOutsideEdit.current || view.state.doc.eq(previous.doc))return;
        window.clearTimeout(timer);
        timer=window.setTimeout(flush,SAVE_DELAY_MS);
      },destroy(){if(timer)flush();}};
    }}));
    const base=Editor.make().config(ctx=>{
      ctx.set(rootCtx,root.current);
      ctx.set(defaultValueCtx,bracketImagePaths(held.current));
      ctx.update(remarkStringifyOptionsCtx,options=>({...options,bullet:'-' as const,rule:'-' as const,emphasis:'*' as const,strong:'*' as const,fence:'`' as const,fences:true}));
      ctx.update(editorViewOptionsCtx,options=>({...options,
        attributes:{class:'markdown-preview',spellcheck:'true','aria-label':'Live Markdown editor'},
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

  const format=(run:(current:Editor)=>void)=>({
    onMouseDown:(e:MouseEvent)=>{e.preventDefault();if(editor.current)run(editor.current);},
  });
  return <div className="live-editor">
    <div className="markdown-toolbar">
      <button aria-label="Bold" title="Bold" {...format(e=>e.action(callCommand(toggleStrongCommand.key)))}><Bold size={15}/></button>
      <button aria-label="Italic" title="Italic" {...format(e=>e.action(callCommand(toggleEmphasisCommand.key)))}><Italic size={15}/></button>
      <button aria-label="Heading" title="Heading" {...format(e=>e.action(callCommand(wrapInHeadingCommand.key,2)))}>H₂</button><span/>
      <button aria-label="Bullet list" title="Bullet list" {...format(e=>e.action(callCommand(wrapInBulletListCommand.key)))}><List size={16}/></button>
      <button aria-label="Code block" title="Code block" {...format(e=>e.action(callCommand(createCodeBlockCommand.key)))}><Code2 size={16}/></button>
      <small>Live</small>
    </div>
    <div ref={root} className="live-editor-surface"/>
  </div>;
}
