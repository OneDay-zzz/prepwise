import { useEffect, useRef, useState } from 'react';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Check, ImagePlus, LoaderCircle, Maximize2, Minimize2 } from 'lucide-react';
import type { Note } from './model';
import { boardSelection } from './whiteboard-export';

export default function Whiteboard({ note, onChange, onAddDrawing, theme }: { theme: 'light' | 'dark'; note: Note; onChange: (scene: NonNullable<Note['scene']>) => void; onAddDrawing: (svg: string) => Promise<void> }) {
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
  const api = useRef<any>(null);
  // What the button offers: the selection, the whole board, or nothing yet.
  const [selected, setSelected] = useState(0);
  const [hasContent, setHasContent] = useState(!!note.scene?.elements?.some(element => !element.isDeleted));
  const [adding, setAdding] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const addToDoc = async () => {
    const board = api.current;
    if (!board || adding === 'busy') return;
    setAdding('busy');
    try {
      const elements = board.getSceneElements();
      const chosen = boardSelection(elements as any[], board.getAppState().selectedElementIds);
      // A light picture on its own background reads well in the doc, whichever theme the board uses.
      const svg = await exportToSvg({ elements: chosen.length ? chosen : elements, files: board.getFiles(), exportPadding: 24, appState: { exportBackground: true, viewBackgroundColor: board.getAppState().viewBackgroundColor || '#ffffff', exportWithDarkMode: false, exportEmbedScene: false } });
      await onAddDrawing(new XMLSerializer().serializeToString(svg));
      setAdding('done');
    }
    catch { setAdding('failed'); }
    window.setTimeout(() => setAdding('idle'), 2200);
  };
  const addLabel = adding === 'done' ? 'Added to doc' : adding === 'failed' ? 'Couldn’t add it' : selected ? `Add ${selected} selected to doc` : 'Add board to doc';
  const toggle = () => {
    if (fillWindow) setFillWindow(false);
    else if (nativeFullscreen) void document.exitFullscreen();
    else if (container.current?.requestFullscreen) container.current.requestFullscreen().catch(() => setFillWindow(true));
    else setFillWindow(true);
  };
  const label = expanded ? 'Exit full screen' : 'Full screen';
  return <div ref={container} className={`whiteboard ${fillWindow ? 'fill-window' : ''}`}><Excalidraw excalidrawAPI={board => { api.current = board; }} theme={theme} name={note.title} initialData={initial.current} renderTopRightUI={() => <><button type="button" className="whiteboard-add" disabled={!hasContent || adding === 'busy'} title="Save a picture of this at the end of the doc. Select shapes first to add only those." onClick={() => void addToDoc()}>{adding === 'busy' ? <LoaderCircle size={15} className="spin"/> : adding === 'done' ? <Check size={15}/> : <ImagePlus size={15}/>}<span>{addLabel}</span></button><button type="button" className="whiteboard-expand" aria-label={label} title={label} onClick={toggle}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></>} onChange={(elements, appState, files) => {
    setSelected(boardSelection(elements as any[], appState.selectedElementIds).filter((element: any) => !element.isDeleted && !element.containerId).length);
    setHasContent(elements.some(element => !element.isDeleted));
    const nextSignature = JSON.stringify([elements, files, appState.viewBackgroundColor]);
    if (signature.current === nextSignature) return;
    signature.current = nextSignature;
    onChange({ elements, appState: { viewBackgroundColor: appState.viewBackgroundColor }, files });
  }}/></div>;
}
