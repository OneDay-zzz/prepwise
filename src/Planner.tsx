import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Check, Clock, ArrowUpRight, Trash2, Download } from 'lucide-react';
import { calendarDays, localDate, type Note, type Plan } from './model';

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function calendarExport(p: Plan) {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(`${p.date}T${p.time || '09:00'}:00`);
  const end = new Date(start.getTime() + p.duration * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prepwise//Interview Planner//EN', 'BEGIN:VEVENT', `UID:${p.id}@prepwise.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(p.company ? `${p.company}: ${p.title}` : p.title)}`, `DESCRIPTION:${escape([p.round, p.notes].filter(Boolean).join('\n'))}`, 'END:VEVENT', 'END:VCALENDAR'];
  // Fold by UTF-8 octets as required by iCalendar, preserving Unicode characters.
  return lines.map(line => { let result = '', width = 0; for (const char of line) { const size = new TextEncoder().encode(char).length; if (width + size > 75) { result += '\r\n '; width = 1; } result += char; width += size; } return result; }).join('\r\n') + '\r\n';
}
export function PlanRow({ plan, onEdit, onToggle, onOpenNote }: { plan: Plan; onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onOpenNote: (id: string) => void }) {
  const date = new Date(`${plan.date}T12:00:00`);
  return <div className={`plan-row ${plan.done ? 'done' : ''}`}>
    <button className={`check-button ${plan.done ? 'checked' : ''}`} aria-label={plan.done ? 'Mark incomplete' : 'Mark complete'} onClick={() => onToggle(plan)}>{plan.done && <Check size={13}/>}</button>
    <button className="plan-info" onClick={() => onEdit(plan)}><strong>{plan.title}</strong><span>{plan.company && `${plan.company} · `}{plan.round || (plan.kind === 'task' ? 'Prep task' : 'Interview')}{plan.time && ` · ${plan.time}`}</span></button>
    {plan.noteId && <button className="icon-button" title="Open linked note" aria-label="Open linked note" onClick={() => onOpenNote(plan.noteId)}><ArrowUpRight size={16}/></button>}
    <span className={`date-tag ${plan.date < localDate() && !plan.done ? 'overdue' : ''}`}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    <span className={`kind-dot ${plan.kind}`} title={plan.kind}/>
  </div>;
}
export default function Planner({ mode, plans, notes, onSave, onDelete, onOpenNote, editor, setEditor }: { mode: 'planner' | 'calendar'; plans: Plan[]; notes: Note[]; onSave: (p: Plan) => void; onDelete: (id: string) => void; onOpenNote: (id: string) => void; editor: Plan | null; setEditor: (p: Plan | null) => void }) {
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(localDate());
  const [filter, setFilter] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const sorted = [...plans].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const filtered = sorted.filter(p => (filter === 'all' || p.kind === filter) && (showDone || !p.done));
  const newPlan = (kind: Plan['kind'], date = localDate()) => setEditor(createPlan(kind, date));
  return <div className="page planner-page">
    <div className="page-heading"><div><div className="eyebrow">MAKE ROOM FOR PROGRESS</div><h1>{mode === 'calendar' ? 'Your prep calendar' : 'A plan for what’s next'}</h1><p>Bring your preparation and interviews into one clear view.</p></div><button className="primary" onClick={() => newPlan('interview')}><Plus size={17}/> Add interview</button></div>
    <div className="planner-stats"><div><span>Upcoming interviews</span><strong>{plans.filter(p => p.kind === 'interview' && !p.done && p.date >= localDate()).length}</strong></div><div><span>Open prep tasks</span><strong>{plans.filter(p => p.kind === 'task' && !p.done).length}</strong></div><div><span>Completed</span><strong>{plans.filter(p => p.done).length}</strong></div></div>
    {mode === 'calendar' ? <div className="calendar-layout"><section className="panel calendar-panel"><div className="panel-heading"><h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><div className="button-row"><button className="small-button" onClick={() => {setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));setSelected(localDate());}}>Today</button><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18}/></button></div></div>
      <div className="calendar-grid weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}</div>
      <div className="calendar-grid">{calendarDays(month.getFullYear(), month.getMonth()).map(date => { const key = localDate(date); const events = sorted.filter(p => p.date === key); return <button key={key} className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === selected ? 'selected' : ''}`} onClick={() => setSelected(key)} aria-label={`${date.toDateString()}, ${events.length} events`}><span className={key === localDate() ? 'today' : ''}>{date.getDate()}</span><div className="day-events">{events.slice(0, 2).map(p => <span key={p.id} className={`${p.kind} ${p.done ? 'completed' : ''}`}>{p.time && `${p.time} `}{p.title}</span>)}{events.length > 2 && <small>+{events.length - 2} more</small>}</div></button>; })}</div>
      <div className="calendar-legend"><span><i className="kind-dot interview"/>Interview</span><span><i className="kind-dot task"/>Prep task</span><small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></div>
    </section><section className="panel day-panel"><div className="panel-heading"><h2>{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h2><button className="icon-button" aria-label="Add plan for selected day" onClick={() => newPlan('task', selected)}><Plus size={18}/></button></div>{sorted.filter(p => p.date === selected).map(p => <PlanRow key={p.id} plan={p} onEdit={setEditor} onToggle={p => onSave({...p, done: !p.done})} onOpenNote={onOpenNote}/>)}{!sorted.some(p => p.date === selected) && <div className="empty-state"><CalendarDays/><h3>A little breathing room</h3><p>Schedule a study session or interview for this day.</p><button className="small-button" onClick={() => newPlan('task', selected)}>Add a prep task</button></div>}</section></div> : <section className="panel"><div className="panel-heading"><div className="segmented">{[['all','All plans'],['task','Prep tasks'],['interview','Interviews']].map(([key, name]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{name}</button>)}</div><div className="button-row"><label className="show-completed"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)}/> Show completed</label><button className="small-button" onClick={() => newPlan('task')}><Plus size={15}/> Add task</button></div></div>{filtered.map(p => <PlanRow key={p.id} plan={p} onEdit={setEditor} onToggle={p => onSave({...p, done: !p.done})} onOpenNote={onOpenNote}/>)}{!filtered.length && <div className="empty-state spacious"><CalendarDays size={32}/><h3>Your next step starts here</h3><p>Add a prep task or an interview. Give your preparation a little structure.</p><button className="primary" onClick={() => newPlan('task')}><Plus size={16}/> Create a prep task</button></div>}</section>}
    {editor && <PlanEditor key={editor.id} plan={editor} notes={notes} existing={plans.some(p => p.id === editor.id)} onClose={() => setEditor(null)} onSave={p => {onSave(p);setEditor(null);}} onDelete={() => {onDelete(editor.id);setEditor(null);}}/>}
  </div>;
}
export function createPlan(kind: Plan['kind'], date = localDate()): Plan { return {id: crypto.randomUUID(), kind, title: '', date, time: '09:00', duration: 60, company: '', round: '', notes: '', noteId: '', done: false}; }
export function PlanEditor({ plan, notes, existing, onClose, onSave, onDelete }: { plan: Plan; notes: Note[]; existing: boolean; onClose: () => void; onSave: (p: Plan) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(plan);
  const field = (key: keyof Plan, value: string | number) => setDraft(p => ({...p, [key]: value}));
  return <div className="modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget) onClose();}}><dialog open className="plan-modal" aria-labelledby="plan-title" onCancel={onClose}><form onSubmit={e => {e.preventDefault();if(draft.title.trim()) onSave({...draft,title:draft.title.trim()});}} onKeyDown={e => {if (e.key === 'Escape') onClose();}}><div className="modal-heading"><div><div className="eyebrow">MAKE IT HAPPEN</div><h2 id="plan-title">{existing ? 'Edit your plan' : 'Plan your next step'}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>
    <div className="segmented wide">{(['task','interview'] as const).map(kind => <button type="button" key={kind} className={draft.kind === kind ? 'active' : ''} onClick={() => field('kind',kind)}>{kind === 'task' ? 'Prep task' : 'Interview'}</button>)}</div>
    <label>Title<input autoFocus required maxLength={160} placeholder={draft.kind === 'task' ? 'e.g. Practice two STAR stories' : 'e.g. System design interview'} value={draft.title} onChange={e => field('title',e.target.value)}/></label>
    {draft.kind === 'interview' && <div className="form-grid"><label>Company<input placeholder="Company name" value={draft.company} onChange={e => field('company',e.target.value)}/></label><label>Round<input placeholder="e.g. Technical round 1" value={draft.round} onChange={e => field('round',e.target.value)}/></label></div>}
    <div className="form-grid three"><label>Date<input type="date" required value={draft.date} onChange={e => field('date',e.target.value)}/></label><label>Time<input type="time" required value={draft.time} onChange={e => field('time',e.target.value)}/></label><label>Minutes<input type="number" min="5" max="1440" required value={draft.duration} onChange={e => field('duration',Number(e.target.value))}/></label></div>
    <p className="field-hint"><Clock size={12}/> Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <label>Link a prep note<select value={draft.noteId} onChange={e => field('noteId',e.target.value)}><option value="">No linked note</option>{notes.map(n => <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}</select></label>
    <label>Details<textarea rows={3} placeholder="Topics to review, meeting link, or questions to ask…" value={draft.notes} onChange={e => field('notes',e.target.value)}/></label>
    <div className="modal-footer"><div className="button-row">{existing && <><button type="button" className="icon-button danger" aria-label="Delete plan" onClick={() => {if(window.confirm('Delete this plan?')) onDelete();}}><Trash2 size={17}/></button><button type="button" className="small-button" onClick={() => download('interview.ics', calendarExport(draft), 'text/calendar')}><Download size={14}/> .ics</button></>}</div><div className="button-row"><button type="button" className="small-button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{existing ? 'Save changes' : 'Add to my plan'}</button></div></div>
    </form></dialog></div>;
}
