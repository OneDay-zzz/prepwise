// What the toolbar does to Markdown text. Live does the same through the editor's own commands.
export type ToolbarAction = 'undo'|'redo'|'h1'|'h2'|'h3'|'bold'|'italic'|'strike'|'code'|'bullet'|'ordered'|'task'|'quote'|'link'|'image'|'table'|'codeblock'|'rule';
export type TextEdit = {text:string; start:number; end:number};

const INLINE:Partial<Record<ToolbarAction,string>>={bold:'**',italic:'*',strike:'~~',code:'`'};
const PLACEHOLDER:Partial<Record<ToolbarAction,string>>={bold:'bold text',italic:'italic text',strike:'struck text',code:'code'};

function toggleInline(text:string,start:number,end:number,action:ToolbarAction):TextEdit {
  const mark=INLINE[action]!;
  const size=mark.length,chosen=text.slice(start,end);
  // `**` also begins with `*`, so italic doesn't count markers that are really bold.
  const isBoldMark=(at:number)=>mark==='*' && (text[at]==='*' && (text[at+1]==='*' || text[at-1]==='*'));
  if(start>=size && text.slice(start-size,start)===mark && text.slice(end,end+size)===mark && !isBoldMark(start-1))
    return {text:text.slice(0,start-size)+chosen+text.slice(end+size),start:start-size,end:end-size};
  if(chosen.length>=size*2 && chosen.startsWith(mark) && chosen.endsWith(mark) && !(mark==='*' && chosen.startsWith('**'))) {
    const inner=chosen.slice(size,-size);
    return {text:text.slice(0,start)+inner+text.slice(end),start,end:start+inner.length};
  }
  const inner=chosen || PLACEHOLDER[action]!;
  return {text:text.slice(0,start)+mark+inner+mark+text.slice(end),start:start+size,end:start+size+inner.length};
}

/** Changes every line the selection touches, keeping the same lines selected. */
function editLines(text:string,start:number,end:number,change:(lines:string[])=>string[]):TextEdit {
  const first=text.lastIndexOf('\n',start-1)+1;
  const lastBreak=end>start && text[end-1]==='\n' ? end-1 : end;
  const next=text.indexOf('\n',lastBreak);
  const last=next===-1 ? text.length : next;
  const lines=change(text.slice(first,last).split('\n')).join('\n');
  const single=start===end;
  const at=first+lines.length;
  return {text:text.slice(0,first)+lines+text.slice(last),start:single ? at : first,end:at};
}
const BULLET=/^\s*[-*+]\s+(\[[ xX]\]\s+)?/,NUMBER=/^\s*\d+[.)]\s+/,TASK=/^\s*[-*+]\s+\[[ xX]\]\s+/,QUOTE=/^\s*>\s?/,HEADING=/^#{1,6}\s+/;
const plainLine=(line:string)=>line.replace(HEADING,'').replace(TASK,'').replace(BULLET,'').replace(NUMBER,'').replace(QUOTE,'');
function toggleLines(action:ToolbarAction,lines:string[]) {
  const filled=lines.filter(line=>line.trim());
  const every=(pattern:RegExp,not?:RegExp)=>filled.length>0 && filled.every(line=>pattern.test(line) && !not?.test(line));
  if(action==='h1' || action==='h2' || action==='h3') {
    const hashes='#'.repeat(Number(action[1]));
    const same=every(new RegExp(`^${hashes}\\s+`));
    return lines.map(line=>!line.trim() ? line : same ? plainLine(line) : `${hashes} ${plainLine(line)}`);
  }
  if(action==='quote') {
    const same=every(QUOTE);
    return lines.map(line=>same ? line.replace(QUOTE,'') : `> ${line}`);
  }
  if(action==='ordered') {
    const same=every(NUMBER);
    let n=0;
    return lines.map(line=>!line.trim() ? line : same ? plainLine(line) : `${++n}. ${plainLine(line)}`);
  }
  const same=action==='task' ? every(TASK) : every(BULLET,TASK);
  const prefix=action==='task' ? '- [ ] ' : '- ';
  return lines.map(line=>!line.trim() ? line : same ? plainLine(line) : `${prefix}${plainLine(line)}`);
}
/** Puts a block on lines of its own. */
function insertBlock(text:string,start:number,end:number,block:string,selectFrom=block.length,selectTo=block.length):TextEdit {
  const before=text.slice(0,start),after=text.slice(end);
  const lead=!before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail=!after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const at=before.length+lead.length;
  return {text:before+lead+block+trail+after,start:at+selectFrom,end:at+selectTo};
}
export function editMarkdown(text:string,start:number,end:number,action:ToolbarAction):TextEdit {
  if(INLINE[action])return toggleInline(text,start,end,action);
  if(action==='table') {
    const block='| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n|  |  |';
    return insertBlock(text,start,end,block,2,10);
  }
  if(action==='rule')return insertBlock(text,start,end,'---');
  if(action==='codeblock') {
    const inner=text.slice(start,end) || 'code';
    return insertBlock(text,start,end,`\`\`\`\n${inner}\n\`\`\``,4,4+inner.length);
  }
  return editLines(text,start,end,lines=>toggleLines(action,lines));
}
const destination=(url:string)=>/[\s()]/.test(url) ? `<${url}>` : url;
export function insertLink(text:string,start:number,end:number,url:string):TextEdit {
  const label=text.slice(start,end) || 'link text';
  const link=`[${label}](${destination(url.trim())})`;
  return {text:text.slice(0,start)+link+text.slice(end),start:start+1,end:start+1+label.length};
}
/** Addresses typed without a scheme still go somewhere. Anything that could run script is refused. */
export function cleanLinkUrl(value:string) {
  const url=value.trim();
  if(!url || /^(javascript|data|vbscript):/i.test(url))return '';
  return /^([a-z][a-z0-9+.-]*:|\/|#|\.)/i.test(url) ? url : `https://${url}`;
}
