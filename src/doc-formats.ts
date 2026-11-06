import type { NoteFormat } from './model.ts';

// A table document keeps its rows as CSV, so it's an ordinary file for checkpoints, chat, and other apps.
export function parseCsv(text:string,delimiter=','):string[][] {
  const rows:string[][]=[];
  let row:string[]=[],cell='',quoted=false,started=false;
  const source=text.replace(/^﻿/,'');
  for(let i=0;i<source.length;i++) {
    const char=source[i];
    if(quoted) {
      if(char==='"' && source[i+1]==='"') {cell+='"';i++;}
      else if(char==='"') quoted=false;
      else cell+=char;
      continue;
    }
    if(char==='"' && !cell) {quoted=true;started=true;}
    else if(char===delimiter) {row.push(cell);cell='';started=true;}
    else if(char==='\n' || char==='\r') {
      if(char==='\r' && source[i+1]==='\n') i++;
      row.push(cell);rows.push(row);row=[];cell='';started=false;
    }
    else {cell+=char;started=true;}
  }
  if(started || cell || row.length) {row.push(cell);rows.push(row);}
  return rows;
}
export function toCsv(rows:string[][]) {
  return rows.map(row=>row.map(cell=>/[",\r\n]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g,'""')}"` : cell).join(',')).join('\n');
}
/** Pads rows to the same width. A table always has at least one cell to type in. */
export function squareRows(rows:string[][]) {
  const width=Math.max(1,...rows.map(row=>row.length));
  const filled=rows.length ? rows : [[]];
  return filled.map(row=>[...row,...Array(width-row.length).fill('')]);
}
/** Fills cells from the top-left corner given, growing the table if the paste needs more room. */
export function pasteCells(rows:string[][],top:number,left:number,cells:string[][]) {
  const height=Math.max(rows.length,top+cells.length);
  const width=Math.max(rows[0]?.length ?? 0,left+Math.max(...cells.map(row=>row.length)));
  const next=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>rows[r]?.[c] ?? ''));
  cells.forEach((row,r)=>row.forEach((cell,c)=>{next[top+r][left+c]=cell;}));
  return next;
}
export const STARTER_TABLE='Column 1,Column 2,Column 3\n,,\n,,\n';
export const IMPORTABLE_FILES='.md,.markdown,.txt,.text,.log,.csv,.tsv,.json';
export const MAX_IMPORT_BYTES=5*1024*1024;
/** Turns a file into a document, or null when it isn't a text format the app can edit. */
export function importedDocument(name:string,text:string):{title:string;format?:NoteFormat;body:string}|null {
  const match=name.match(/^(.*?)\.([^.]+)$/);
  const title=(match ? match[1] : name).trim() || 'Untitled note';
  const type=(match ? match[2] : '').toLowerCase();
  if(type==='md' || type==='markdown') return {title,body:text};
  if(type==='txt' || type==='text' || type==='log' || type==='json') return {title,format:'text',body:text};
  if(type==='csv') return {title,format:'table',body:text};
  if(type==='tsv') return {title,format:'table',body:toCsv(parseCsv(text,'\t'))};
  return null;
}
