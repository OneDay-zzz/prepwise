import { useMemo, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { parseCsv, pasteCells, squareRows, toCsv } from './doc-formats';

/** A spreadsheet-style grid over a CSV document. The first row is the header. */
export default function TableEditor({body,onChange}: {body:string;onChange:(body:string)=>void}) {
  const rows=useMemo(()=>squareRows(parseCsv(body)),[body]);
  const save=(next:string[][])=>onChange(`${toCsv(next)}\n`);
  const setCell=(r:number,c:number,value:string)=>save(rows.map((row,i)=>i===r ? row.map((cell,j)=>j===c ? value : cell) : row));
  const addRow=()=>save([...rows,rows[0].map(()=>'')]);
  const addColumn=()=>save(rows.map((row,i)=>[...row,i===0 ? `Column ${row.length+1}` : '']));
  const removeRow=(r:number)=>save(rows.filter((_,i)=>i!==r));
  const removeColumn=(c:number)=>save(rows.map(row=>row.filter((_,j)=>j!==c)));
  const focusCell=(r:number,c:number)=>requestAnimationFrame(()=>document.querySelector<HTMLInputElement>(`.table-editor [data-cell="${r}-${c}"]`)?.focus());
  const onKeyDown=(e:KeyboardEvent<HTMLInputElement>,r:number,c:number)=>{
    const input=e.currentTarget;
    const atStart=input.selectionStart===0 && input.selectionEnd===0,atEnd=input.selectionStart===input.value.length;
    if(e.nativeEvent.isComposing)return;
    if(e.key==='Enter') {
      e.preventDefault();
      if(r===rows.length-1)addRow();
      focusCell(r+1,c);
    }
    else if(e.key==='ArrowDown' && r<rows.length-1) {e.preventDefault();focusCell(r+1,c);}
    else if(e.key==='ArrowUp' && r>0) {e.preventDefault();focusCell(r-1,c);}
    else if(e.key==='ArrowRight' && atEnd && c<rows[0].length-1) {e.preventDefault();focusCell(r,c+1);}
    else if(e.key==='ArrowLeft' && atStart && c>0) {e.preventDefault();focusCell(r,c-1);}
  };
  // Cells copied from a spreadsheet arrive as tabs and new lines.
  const onPaste=(e:ClipboardEvent<HTMLInputElement>,r:number,c:number)=>{
    const text=e.clipboardData.getData('text/plain');
    if(!/[\t\n]/.test(text))return;
    e.preventDefault();
    save(pasteCells(rows,r,c,parseCsv(text.replace(/\r?\n$/,''),'\t')));
  };
  const tooFewRows=rows.length<=1,tooFewColumns=rows[0].length<=1;
  return <div className="table-editor">
    <div className="table-editor-scroll"><table>
      <thead><tr><th aria-hidden="true"/>{rows[0].map((_,c)=><th key={c} className="table-column-tools"><button type="button" aria-label={`Delete column ${c+1}`} title="Delete this column" disabled={tooFewColumns} onClick={()=>{if(!rows.some(row=>row[c]) || window.confirm('Delete this column and what’s in it?'))removeColumn(c);}}><X size={12}/></button></th>)}</tr></thead>
      <tbody>{rows.map((row,r)=><tr key={r} className={r===0 ? 'is-header' : ''}><th className="table-row-tools"><span>{r===0 ? '' : r}</span><button type="button" aria-label={`Delete row ${r+1}`} title="Delete this row" disabled={tooFewRows} onClick={()=>{if(!row.some(Boolean) || window.confirm('Delete this row and what’s in it?'))removeRow(r);}}><X size={12}/></button></th>{row.map((cell,c)=><td key={c}><input data-cell={`${r}-${c}`} aria-label={`Row ${r+1}, column ${c+1}`} value={cell} onChange={e=>setCell(r,c,e.target.value)} onKeyDown={e=>onKeyDown(e,r,c)} onPaste={e=>onPaste(e,r,c)}/></td>)}</tr>)}</tbody>
    </table></div>
    <div className="table-editor-actions"><button type="button" className="small-button" onClick={addRow}><Plus size={14}/> Add row</button><button type="button" className="small-button" onClick={addColumn}><Plus size={14}/> Add column</button><small>{rows.length-1} {rows.length===2 ? 'row' : 'rows'}. Paste from a spreadsheet into any cell.</small></div>
  </div>;
}
