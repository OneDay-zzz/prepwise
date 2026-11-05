import { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Note } from './model';

export default function Whiteboard({ note, onChange, theme }: { theme: 'light' | 'dark'; note: Note; onChange: (scene: NonNullable<Note['scene']>) => void }) {
  const initial = useRef(note.scene);
  const signature = useRef(JSON.stringify([note.scene?.elements || [], note.scene?.files || {}, note.scene?.appState?.viewBackgroundColor || '#ffffff']));
  const container = useRef<HTMLDivElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // Some browsers, such as Safari on iPhone, have no Fullscreen API, so the board fills the window instead.
  const [fillWindow, setFillWindow] = useState(false);
  useEffect(() => {
    const sync = () => setNativeFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const expanded = nativeFullscreen || fillWindow;
  const toggle = () => {
    if (fillWindow) setFillWindow(false);
    else if (nativeFullscreen) void document.exitFullscreen();
    else if (container.current?.requestFullscreen) container.current.requestFullscreen().catch(() => setFillWindow(true));
    else setFillWindow(true);
  };
  const label = expanded ? 'Exit full screen' : 'Full screen';
  return <div ref={container} className={`whiteboard ${fillWindow ? 'fill-window' : ''}`}><Excalidraw theme={theme} name={note.title} initialData={initial.current} renderTopRightUI={() => <button type="button" className="whiteboard-expand" aria-label={label} title={label} onClick={toggle}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>} onChange={(elements, appState, files) => {
    const nextSignature = JSON.stringify([elements, files, appState.viewBackgroundColor]);
    if (signature.current === nextSignature) return;
    signature.current = nextSignature;
    onChange({ elements, appState: { viewBackgroundColor: appState.viewBackgroundColor }, files });
  }}/></div>;
}
