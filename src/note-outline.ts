import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type OutlineHeading = {
  text: string;
  depth: number;
  /** Levels below the note's top heading, so a note starting at ## isn't indented. */
  indent: number;
  /** Position among all headings shown on the page, including empty ones left out of the outline. */
  index: number;
  /** Where the heading starts and ends in the Markdown. */
  start: number;
  end: number;
};

type MarkdownNode = {type:string;value?:string;alt?:string;depth?:number;children?:MarkdownNode[];position?:{start:{offset?:number};end:{offset?:number}}};
const parser=unified().use(remarkParse).use(remarkGfm);

const textOf=(node:MarkdownNode):string=>{
  if(node.type==='text' || node.type==='inlineCode') return node.value || '';
  if(node.type==='image') return node.alt || '';
  if(node.type==='break') return ' ';
  return node.children?.map(textOf).join('') || '';
};

/** Uses the parser behind Read, so code samples and "#" in text aren't mistaken for headings. */
export function noteOutline(body: string): OutlineHeading[] {
  const found: Omit<OutlineHeading,'indent'>[]=[];
  let index=0;
  const visit=(node:MarkdownNode)=>{
    if(node.type==='heading') {
      const text=textOf(node).replace(/\s+/g,' ').trim();
      if(text) found.push({text,depth:node.depth || 1,index,start:node.position?.start.offset ?? 0,end:node.position?.end.offset ?? 0});
      index+=1;
      return;
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(body) as unknown as MarkdownNode);
  const top=Math.min(...found.map(h=>h.depth));
  return found.map(h=>({...h,indent:h.depth-top}));
}

export type NotePart = {title: string; body: string; group?: string};
type Draft = {title: string; start: number; end: number; shift: number; group?: string; keep: boolean};

const rootBlocks=(body: string)=>(parser.parse(body) as unknown as MarkdownNode).children || [];
const startOf=(node: MarkdownNode)=>node.position?.start.offset ?? 0;
const isHeading=(node: MarkdownNode)=>node.type==='heading';

/**
 * Cuts a note at its headings of one level, keeping the Markdown exactly as written.
 * A heading above that level becomes a folder name, or its own document if it has text of its own.
 */
export function splitNote(body: string, depth: number, fallbackTitle: string): NotePart[] {
  const blocks=rootBlocks(body);
  const topLevel=blocks.filter(b=>isHeading(b) && b.depth===1);
  // A single # heading at the start names the note, so it isn't a folder.
  const first=blocks.find(isHeading);
  const noteTitle=first?.depth===1 && topLevel.length===1 ? first : null;
  const drafts: Draft[]=[];
  let parent: string|undefined;
  for(const block of blocks) {
    const level=isHeading(block) ? block.depth || 1 : 0;
    if(level && level<=depth) {
      const title=textOf(block).replace(/\s+/g,' ').trim();
      if(drafts.length) drafts.at(-1)!.end=startOf(block);
      drafts.push({title:title || fallbackTitle,start:startOf(block),end:body.length,shift:level-1,group:level===depth ? parent : undefined,keep:level===depth});
      if(level<depth) parent=block===noteTitle ? undefined : title || undefined;
      continue;
    }
    if(!drafts.length) drafts.push({title:fallbackTitle,start:startOf(block),end:body.length,shift:0,keep:false});
    if(block.type!=='thematicBreak' && block.type!=='definition') drafts.at(-1)!.keep=true;
  }
  const definitions=blocks.filter(b=>b.type==='definition').map(b=>({label:`[${(b as MarkdownNode & {identifier?:string}).identifier}]`,text:body.slice(startOf(b),b.position?.end.offset ?? startOf(b))}));
  return drafts.filter(d=>d.keep).map(d=>{
    // Moves the headings up, so a document starts at the top level like any other note.
    const headings=blocks.filter(b=>isHeading(b) && startOf(b)>=d.start && startOf(b)<d.end && body[startOf(b)]==='#').map(startOf).reverse();
    let text=body.slice(d.start,d.end);
    for(const at of headings) text=text.slice(0,at-d.start)+text.slice(at-d.start+d.shift);
    // A reference-style link needs its definition, which may have been left in another document.
    const lower=text.toLowerCase();
    const needed=definitions.filter(link=>lower.includes(link.label) && !text.includes(link.text)).map(link=>link.text);
    return {title:d.title,body:[text.trimEnd(),...needed].join(needed.length ? '\n\n' : '')+'\n',...(d.group ? {group:d.group} : {})};
  });
}

/** The heading levels that would give at least two documents. */
export function splitLevels(body: string) {
  const present=[...new Set(rootBlocks(body).filter(isHeading).map(b=>b.depth || 1))].sort();
  return present.filter(depth=>splitNote(body,depth,'').length>=2);
}

/** The shallowest level whose headings mostly hold text, rather than only grouping smaller headings. */
export function suggestedSplitLevel(body: string, levels=splitLevels(body)) {
  const blocks=rootBlocks(body);
  for(const depth of levels) {
    const headings=blocks.map((b,i)=>({b,next:blocks[i+1]})).filter(({b})=>isHeading(b) && b.depth===depth);
    const grouping=headings.filter(({next})=>next && isHeading(next) && (next.depth || 1)>depth).length;
    if(grouping*2<headings.length) return depth;
  }
  return levels.at(-1) ?? null;
}
