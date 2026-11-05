import { useEffect, useRef, useState, type RefObject } from 'react';
import { clampColumn, columnLimits, type NoteMode } from './layout-settings';
import type { OutlineHeading } from './note-outline';

const scrollParent=(element:HTMLElement)=>{
  for(let node=element.parentElement;node;node=node.parentElement) {
    const overflow=getComputedStyle(node).overflowY;
    if(overflow==='auto' || overflow==='scroll') return node;
  }
  return document.scrollingElement as HTMLElement;
};

/** A textarea can't report where a line is, so a hidden copy with the same wrapping measures it. */
function textareaTops(area:HTMLTextAreaElement,offsets:number[]) {
  const style=getComputedStyle(area);
  const copy=document.createElement('div');
  copy.setAttribute('aria-hidden','true');
  Object.assign(copy.style,{position:'absolute',visibility:'hidden',top:'0',left:'0',boxSizing:'border-box',width:`${area.clientWidth}px`,whiteSpace:'pre-wrap',overflowWrap:'break-word',padding:style.padding,font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,tabSize:style.tabSize});
  let from=0;
  const markers=offsets.map(offset=>{
    copy.append(area.value.slice(from,offset));
    from=offset;
    const marker=document.createElement('span');
    copy.append(marker);
    return marker;
  });
  document.body.append(copy);
  const tops=markers.map(marker=>marker.offsetTop);
  copy.remove();
  return tops;
}

type Props = {headings:OutlineHeading[];mode:NoteMode;editor:RefObject<HTMLTextAreaElement|null>;onWidth:(width:number|null)=>void};

/** The table of contents beside a note. Jumps to a heading and follows the reading position. */
export default function NoteOutline({headings,mode,editor,onWidth}: Props) {
  const nav=useRef<HTMLElement>(null);
  const [active,setActive]=useState(0);
  // The last headings of a note can't reach the top of the window, so scrolling alone can't highlight them.
  const clicked=useRef<number|null>(null);
  const page=()=>{
    const row=nav.current!.parentElement!;
    const scroller=scrollParent(row);
    const isDocument=scroller===document.scrollingElement;
    const controls=row.closest('.doc-pane')?.querySelector<HTMLElement>('.editor-controls');
    const viewTop=isDocument ? 0 : scroller.getBoundingClientRect().top;
    const tabsBottom=(parseFloat(controls ? getComputedStyle(controls).top : '')||0)+(controls?.offsetHeight||0);
    // Pinned above the note, the table of contents hides what's under it too.
    const pinnedAbove=getComputedStyle(row).flexDirection==='column';
    const covered=tabsBottom+(pinnedAbove ? nav.current!.offsetHeight : 0);
    return {scroller,viewTop,tabsBottom,covered,viewHeight:isDocument ? window.innerHeight : scroller.clientHeight,headingNodes:[...row.querySelectorAll<HTMLElement>('.markdown-preview :is(h1,h2,h3,h4,h5,h6)')]};
  };

  useEffect(()=>{
    let frame=0;
    const measure=()=>{
      frame=0;
      if(!nav.current) return;
      const {scroller,viewTop,tabsBottom,covered,viewHeight,headingNodes}=page();
      nav.current.style.setProperty('--outline-top',`${tabsBottom+8}px`);
      nav.current.style.setProperty('--outline-pin',`${tabsBottom}px`);
      nav.current.style.setProperty('--outline-max',`${Math.max(120,viewHeight-tabsBottom-16)}px`);
      const area=mode==='edit' ? editor.current : null;
      const tops=area ? textareaTops(area,headings.map(h=>h.start)).map(top=>top-area.scrollTop) : headings.map(h=>headingNodes[h.index]?.getBoundingClientRect().top ?? Infinity);
      const line=area ? 16 : viewTop+covered+24;
      let current=0;
      tops.forEach((top,i)=>{if(top<=line)current=i;});
      const reader=area || scroller;
      const atEnd=reader.scrollTop+reader.clientHeight>=reader.scrollHeight-2;
      setActive(atEnd && clicked.current!==null && clicked.current<headings.length ? Math.max(current,clicked.current) : current);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    schedule();
    // Listening while capturing covers the window's scroller and the textarea's own.
    window.addEventListener('scroll',schedule,true);
    window.addEventListener('resize',schedule);
    const resized=new ResizeObserver(schedule);
    resized.observe(nav.current!.parentElement!);
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);resized.disconnect();};
  },[headings,mode,editor]);

  // Keeps the highlighted line in view without scrolling the note itself.
  useEffect(()=>{
    const panel=nav.current,item=panel?.querySelector<HTMLElement>('[aria-current=location]');
    if(!panel || !item) return;
    const box=panel.getBoundingClientRect(),line=item.getBoundingClientRect();
    if(line.top<box.top)panel.scrollTop-=box.top-line.top;
    else if(line.bottom>box.bottom)panel.scrollTop+=line.bottom-box.bottom;
  },[active]);

  const jump=(position:number)=>{
    const heading=headings[position];
    const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    clicked.current=position;
    setActive(position);
    const area=editor.current;
    if(area && (mode==='edit' || mode==='split')) area.scrollTo({top:textareaTops(area,[heading.start])[0]-8,behavior});
    if(area && mode==='edit') {
      area.focus({preventScroll:true});
      area.setSelectionRange(heading.end,heading.end);
      return;
    }
    const {scroller,viewTop,covered,headingNodes}=page();
    const target=headingNodes[heading.index];
    if(target) scroller.scrollBy({top:target.getBoundingClientRect().top-viewTop-covered-12,behavior});
  };

  // The panel is on the right, so dragging left makes it wider. The drag only touches CSS; the width is saved when it ends.
  const dragStart=useRef({x:0,width:0});
  const widthAt=(clientX:number)=>{
    const room=nav.current!.parentElement!.getBoundingClientRect().width*.55;
    return clampColumn(dragStart.current.width+dragStart.current.x-clientX,{min:columnLimits.outline.min,max:Math.max(columnLimits.outline.min,Math.min(columnLimits.outline.max,room))});
  };
  const shell=()=>nav.current!.closest<HTMLElement>('.app-shell')!;
  return <><div className="outline-resizer" role="separator" tabIndex={0} aria-label="Resize table of contents" aria-orientation="vertical" title="Drag to resize. Double-click to reset."
    onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);dragStart.current={x:e.clientX,width:nav.current!.getBoundingClientRect().width};shell().dataset.resizing='true';}}
    onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))shell().style.setProperty('--outline-width',`${widthAt(e.clientX)}px`);}}
    onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){delete shell().dataset.resizing;if(e.clientX!==dragStart.current.x)onWidth(widthAt(e.clientX));}}}
    onDoubleClick={()=>{shell().style.removeProperty('--outline-width');onWidth(null);}}
    onKeyDown={e=>{const delta={ArrowLeft:16,ArrowRight:-16}[e.key];if(delta){e.preventDefault();dragStart.current={x:0,width:nav.current!.getBoundingClientRect().width};onWidth(widthAt(-delta));}}}/>
  <nav ref={nav} className="note-outline" aria-label="Table of contents">
    <div className="eyebrow">CONTENTS</div>
    <ul>{headings.map((heading,position)=><li key={`${heading.index}-${heading.start}`}>
      {/* Keeps the cursor in the note while clicking here. */}
      <button style={{paddingLeft:`${8+Math.min(heading.indent,4)*12}px`}} title={heading.text} aria-current={position===active ? 'location' : undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>jump(position)}><span>{heading.text}</span></button>
    </li>)}</ul>
  </nav></>;
}
