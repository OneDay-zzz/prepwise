import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Check, Clock, ArrowUpRight, Trash2, Download, Flag } from 'lucide-react';
import { calendarDays, DEFAULT_SPACE, localDate, milestoneStatus, planSpace, sectionSpace, type Note, type Plan, type SectionConfig, type SpaceConfig } from './model';
import { SpaceDot } from './Workspaces';

const kindNames: Record<Plan['kind'], string> = {task:'Task', milestone:'Milestone', interview:'Interview', event:'Event'};
/** Interviews belong to the original workspace. Everywhere else, the same thing is just an event. */
const mainKind=(space:string):Plan['kind']=>space===DEFAULT_SPACE ? 'interview' : 'event';

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
  // A milestone with no time is due on the day, so it exports as an all-day event.
  const dateOnly = (d: Date) => localDate(d).replace(/-/g, '');
  const span = p.time ? [`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`] : [`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1))}`];
  const summary = p.kind === 'milestone' ? `Milestone: ${p.title}` : p.company ? `${p.company}: ${p.title}` : p.title;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prepwise//Interview Planner//EN', 'BEGIN:VEVENT', `UID:${p.id}@prepwise.local`, `DTSTAMP:${stamp(new Date())}`, ...span, `SUMMARY:${escape(summary)}`, `DESCRIPTION:${escape((p.kind === 'milestone' ? [p.notes] : [p.round, p.notes]).filter(Boolean).join('\n'))}`, 'END:VEVENT', 'END:VCALENDAR'];
  // Fold by UTF-8 octets as required by iCalendar, preserving Unicode characters.
  return lines.map(line => { let result = '', width = 0; for (const char of line) { const size = new TextEncoder().encode(char).length; if (width + size > 75) { result += '\r\n '; width = 1; } result += char; width += size; } return result; }).join('\r\n') + '\r\n';
}
export function PlanRow({ plan, space, onEdit, onToggle, onOpenNote }: { space?: SpaceConfig; plan: Plan; onEdit: (p: Plan) => void; onToggle: (p: Plan) => void; onOpenNote: (id: string) => void }) {
  const date = new Date(`${plan.date}T12:00:00`);
  return <div className={`plan-row ${plan.done ? 'done' : ''}`}>
    <button className={`check-button ${plan.done ? 'checked' : ''}`} aria-label={plan.done ? 'Mark incomplete' : 'Mark complete'} onClick={() => onToggle(plan)}>{plan.done && <Check size={13}/>}</button>
    <button className="plan-info" onClick={() => onEdit(plan)}><strong>{space && <SpaceDot color={space.color} title={space.name}/>}{plan.title}</strong><span>{plan.kind === 'milestone' ? <>Milestone · {milestoneStatus(plan)}{plan.time && ` · by ${plan.time}`}</> : <>{plan.company && `${plan.company} · `}{plan.round || kindNames[plan.kind]}{plan.time && ` · ${plan.time}`}</>}</span></button>
    {plan.noteId && <button className="icon-button" title="Open linked note" aria-label="Open linked note" onClick={() => onOpenNote(plan.noteId)}><ArrowUpRight size={16}/></button>}
    <span className={`date-tag ${plan.date < localDate() && !plan.done ? 'overdue' : ''}`}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    {plan.kind === 'milestone' ? <Flag size={13} className="milestone-flag" aria-label="Milestone"/> : <span className={`kind-dot ${plan.kind}`} title={plan.kind}/>}
  </div>;
}
export default function Planner({ spaces, sections, currentSpace, mode, plans, notes, onSave, onDelete, onOpenNote, editor, setEditor }: { spaces: SpaceConfig[]; sections: SectionConfig[]; currentSpace: string; mode: 'planner' | 'calendar'; plans: Plan[]; notes: Note[]; onSave: (p: Plan) => void; onDelete: (id: string) => void; onOpenNote: (id: string) => void; editor: Plan | null; setEditor: (p: Plan | null) => void }) {
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(localDate());
  const [filter, setFilter] = useState('all');
  const [showDone, setShowDone] = useState(false);
  // The calendar starts with everything together. The planner starts with the workspace you're in.
  const [spaceFilter, setSpaceFilter] = useState(mode === 'calendar' ? 'all' : currentSpace);
  const multiple = spaces.length > 1;
  const spaceOf = (plan: Plan) => multiple ? spaces.find(s => s.id === planSpace(plan)) : undefined;
  const scoped = plans.filter(p => spaceFilter === 'all' || planSpace(p) === spaceFilter);
  // A new plan goes where you're looking.
  const newSpace = spaceFilter === 'all' ? currentSpace : spaceFilter;
  const sorted = [...scoped].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const filtered = sorted.filter(p => (filter === 'all' || p.kind === filter || (filter === 'event' && p.kind === 'interview')) && (showDone || !p.done));
  const newPlan = (kind: Plan['kind'], date = localDate()) => setEditor(createPlan(kind, date, newSpace));
  return <div className="page planner-page">
    <div className="page-heading"><div><div className="eyebrow">MAKE ROOM FOR PROGRESS</div><h1>{mode === 'calendar' ? 'Your calendar' : 'A plan for what’s next'}</h1><p>{multiple ? 'Tasks, events, and milestones from all your workspaces, in one view.' : 'Bring your tasks, milestones, and events into one clear view.'}</p></div><div className="button-row"><button className="small-button" onClick={() => newPlan('milestone', mode === 'calendar' ? selected : localDate())}><Flag size={15}/> Add milestone</button><button className="primary" onClick={() => newPlan(mainKind(newSpace), mode === 'calendar' ? selected : localDate())}><Plus size={17}/> Add {kindNames[mainKind(newSpace)].toLowerCase()}</button></div></div>
    {multiple && <div className="space-filter" role="group" aria-label="Show plans from"><button type="button" aria-pressed={spaceFilter === 'all'} onClick={() => setSpaceFilter('all')}>All workspaces</button>{spaces.map(space => <button type="button" key={space.id} aria-pressed={spaceFilter === space.id} onClick={() => setSpaceFilter(space.id)}><SpaceDot color={space.color}/>{space.name}</button>)}</div>}
    <div className="planner-stats"><div><span>Upcoming events</span><strong>{scoped.filter(p => (p.kind === 'interview' || p.kind === 'event') && !p.done && p.date >= localDate()).length}</strong></div><div><span>Open tasks</span><strong>{scoped.filter(p => p.kind === 'task' && !p.done).length}</strong></div><div><span>Open milestones</span><strong>{scoped.filter(p => p.kind === 'milestone' && !p.done).length}</strong></div><div><span>Completed</span><strong>{scoped.filter(p => p.done).length}</strong></div></div>
    {mode === 'calendar' ? <div className="calendar-layout"><section className="panel calendar-panel"><div className="panel-heading"><h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><div className="button-row"><button className="small-button" onClick={() => {setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));setSelected(localDate());}}>Today</button><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18}/></button></div></div>
      <div className="calendar-grid weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d}>{d}</span>)}</div>
      <div className="calendar-grid">{calendarDays(month.getFullYear(), month.getMonth()).map(date => { const key = localDate(date); const events = sorted.filter(p => p.date === key).sort((a, b) => Number(b.kind === 'milestone') - Number(a.kind === 'milestone')); return <button key={key} className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === selected ? 'selected' : ''}`} onClick={() => setSelected(key)} aria-label={`${date.toDateString()}, ${events.length} events`}><span className={key === localDate() ? 'today' : ''}>{date.getDate()}</span><div className="day-events">{events.slice(0, 2).map(p => <span key={p.id} className={`${p.kind} ${p.done ? 'completed' : ''} ${p.kind === 'milestone' && !p.done && key < localDate() ? 'missed' : ''}`}>{spaceOf(p) && <SpaceDot color={spaceOf(p)!.color}/>}{p.kind === 'milestone' && <Flag size={10}/>}{p.time && `${p.time} `}{p.title}</span>)}{events.length > 2 && <small>+{events.length - 2} more</small>}</div></button>; })}</div>
      <div className="calendar-legend"><span><i className="kind-dot interview"/>Event</span><span><i className="kind-dot task"/>Task</span><span><Flag size={11} className="milestone-flag"/>Milestone</span><small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></div>
    </section><section className="panel day-panel"><div className="panel-heading"><h2>{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h2><div className="button-row"><button className="icon-button" title="Add a milestone for this day" aria-label="Add milestone for selected day" onClick={() => newPlan('milestone', selected)}><Flag size={16}/></button><button className="icon-button" title="Add a plan for this day" aria-label="Add plan for selected day" onClick={() => newPlan('task', selected)}><Plus size={18}/></button></div></div>{sorted.filter(p => p.date === selected).map(p => <PlanRow key={p.id} plan={p} space={spaceOf(p)} onEdit={setEditor} onToggle={p => onSave({...p, done: !p.done})} onOpenNote={onOpenNote}/>)}{!sorted.some(p => p.date === selected) && <div className="empty-state"><CalendarDays/><h3>A little breathing room</h3><p>Schedule something, or set a milestone to finish by this day.</p><div className="button-row"><button className="small-button" onClick={() => newPlan('task', selected)}>Add a task</button><button className="small-button" onClick={() => newPlan('milestone', selected)}>Add a milestone</button></div></div>}</section></div> : <section className="panel"><div className="panel-heading"><div className="segmented">{[['all','All plans'],['task','Tasks'],['milestone','Milestones'],['event','Events']].map(([key, name]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{name}</button>)}</div><div className="button-row"><label className="show-completed"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)}/> Show completed</label><button className="small-button" onClick={() => newPlan('task')}><Plus size={15}/> Add task</button></div></div>{filtered.map(p => <PlanRow key={p.id} plan={p} space={spaceOf(p)} onEdit={setEditor} onToggle={p => onSave({...p, done: !p.done})} onOpenNote={onOpenNote}/>)}{!filtered.length && <div className="empty-state spacious"><CalendarDays size={32}/><h3>Your next step starts here</h3><p>Add a prep task or an interview. Give your preparation a little structure.</p><button className="primary" onClick={() => newPlan('task')}><Plus size={16}/> Create a prep task</button></div>}</section>}
    {editor && <PlanEditor key={editor.id} plan={editor} spaces={spaces} sections={sections} notes={notes} existing={plans.some(p => p.id === editor.id)} onClose={() => setEditor(null)} onSave={p => {onSave(p);setEditor(null);}} onDelete={() => {onDelete(editor.id);setEditor(null);}}/>}
  </div>;
}
export function createPlan(kind: Plan['kind'], date = localDate(), space = DEFAULT_SPACE): Plan { return {...(space === DEFAULT_SPACE ? {} : {space}), id: crypto.randomUUID(), kind: kind === 'interview' ? mainKind(space) : kind, title: '', date, time: kind === 'milestone' ? '' : '09:00', duration: 60, company: '', round: '', notes: '', noteId: '', done: false}; }
export function PlanEditor({ plan, spaces, sections, notes, existing, onClose, onSave, onDelete }: { spaces: SpaceConfig[]; sections: SectionConfig[]; plan: Plan; notes: Note[]; existing: boolean; onClose: () => void; onSave: (p: Plan) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(plan);
  const field = (key: keyof Plan, value: string | number) => setDraft(p => ({...p, [key]: value}));
  const milestone = draft.kind === 'milestone';
  // Only a milestone may have no time, so the time follows the kind.
  const setKind = (kind: Plan['kind']) => setDraft(p => p.kind === kind ? p : {...p, kind, time: kind === 'milestone' ? '' : p.time || '09:00'});
  const space = planSpace(draft);
  const kinds: Plan['kind'][] = space === DEFAULT_SPACE ? ['task','milestone','interview','event'] : ['task','milestone','event'];
  const setSpace = (next: string) => setDraft(({space: _old, ...p}) => ({...p, ...(next === DEFAULT_SPACE ? {} : {space: next}), noteId: '', kind: p.kind === 'interview' ? mainKind(next) : p.kind}));
  const spaceNotes = notes.filter(n => sectionSpace(sections.find(s => s.id === n.section) || {}) === space);
  return <div className="modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget) onClose();}}><dialog open className="plan-modal" aria-labelledby="plan-title" onCancel={onClose}><form onSubmit={e => {e.preventDefault();if(draft.title.trim()) onSave({...draft,title:draft.title.trim()});}} onKeyDown={e => {if (e.key === 'Escape') onClose();}}><div className="modal-heading"><div><div className="eyebrow">MAKE IT HAPPEN</div><h2 id="plan-title">{existing ? (milestone ? 'Edit your milestone' : 'Edit your plan') : (milestone ? 'Set a milestone' : 'Plan your next step')}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>
    {spaces.length > 1 && <label>Workspace<select value={space} onChange={e => setSpace(e.target.value)}>{spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    <div className="segmented wide">{kinds.map(kind => <button type="button" key={kind} className={draft.kind === kind ? 'active' : ''} onClick={() => setKind(kind)}>{kindNames[kind]}</button>)}</div>
    <label>{milestone ? 'What should be finished?' : 'Title'}<input autoFocus required maxLength={160} placeholder={milestone ? 'e.g. Finish the first draft' : draft.kind === 'task' ? 'e.g. Book the flights' : draft.kind === 'event' ? 'e.g. Leg day' : 'e.g. System design interview'} value={draft.title} onChange={e => field('title',e.target.value)}/></label>
    {draft.kind === 'interview' && <div className="form-grid"><label>Company<input placeholder="Company name" value={draft.company} onChange={e => field('company',e.target.value)}/></label><label>Round<input placeholder="e.g. Technical round 1" value={draft.round} onChange={e => field('round',e.target.value)}/></label></div>}
    {draft.kind === 'event' && <label>Where (optional)<input placeholder="e.g. The gym" value={draft.company} onChange={e => field('company',e.target.value)}/></label>}
    {milestone ? <div className="form-grid"><label>Finish by<input type="date" required value={draft.date} onChange={e => field('date',e.target.value)}/></label><label>Time (optional)<input type="time" value={draft.time} onChange={e => field('time',e.target.value)}/></label></div> : <div className="form-grid three"><label>Date<input type="date" required value={draft.date} onChange={e => field('date',e.target.value)}/></label><label>Time<input type="time" required value={draft.time} onChange={e => field('time',e.target.value)}/></label><label>Minutes<input type="number" min="5" max="1440" required value={draft.duration} onChange={e => field('duration',Number(e.target.value))}/></label></div>}
    <p className="field-hint"><Clock size={12}/> {milestone && !draft.time ? 'Due any time that day.' : `Times are in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`}</p>
    <label>Link a document<select value={draft.noteId} onChange={e => field('noteId',e.target.value)}><option value="">No linked document</option>{spaceNotes.map(n => <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}</select></label>
    <label>Details<textarea rows={3} placeholder={milestone ? 'What does finished look like?' : 'Anything worth remembering…'} value={draft.notes} onChange={e => field('notes',e.target.value)}/></label>
    <div className="modal-footer"><div className="button-row">{existing && <><button type="button" className="icon-button danger" aria-label="Delete plan" onClick={() => {if(window.confirm('Delete this plan?')) onDelete();}}><Trash2 size={17}/></button><button type="button" className="small-button" onClick={() => download(`${draft.kind}.ics`, calendarExport(draft), 'text/calendar')}><Download size={14}/> .ics</button></>}</div><div className="button-row"><button type="button" className="small-button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{existing ? 'Save changes' : 'Add to my plan'}</button></div></div>
    </form></dialog></div>;
}
