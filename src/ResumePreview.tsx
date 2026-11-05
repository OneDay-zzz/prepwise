import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Download, FileText, Maximize2, Minimize2, X } from 'lucide-react';

type Props = { url: string; name: string; onClose: () => void };

export default function ResumePreview({ url, name, onClose }: Props) {
  const [fit, setFit] = useState<'width' | 'page'>('width');
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      expandButton.current?.focus();
    };
  }, [expanded]);

  // Chromium's PDF open parameters suppress the native toolbar and thumbnails.
  // Keep a separate original-file link for browsers that ignore these parameters.
  const source = `${url}#toolbar=0&navpanes=0&scrollbar=1&page=1&view=${fit === 'width' ? 'FitH' : 'Fit'}`;
  const preview = <section className="resume-viewer" aria-label="Resume preview">
    <div className="resume-viewer-toolbar">
      <div className="resume-viewer-label"><FileText size={14}/><span>Resume preview</span><span className="resume-viewer-format">PDF</span></div>
      <div className="resume-viewer-actions">
        <div className="resume-fit-controls" role="group" aria-label="PDF page size">
          <button type="button" aria-pressed={fit === 'width'} onClick={() => setFit('width')}>Fit width</button>
          <button type="button" aria-pressed={fit === 'page'} onClick={() => setFit('page')}>Full page</button>
        </div>
        <span className="resume-toolbar-divider"/>
        <a className="icon-button" href={url} target="_blank" rel="noreferrer" aria-label="Open original PDF in a new tab" title="Open original PDF"><ArrowUpRight size={16}/></a>
        <a className="icon-button" href={url} download={name} aria-label="Download resume PDF" title="Download"><Download size={15}/></a>
        <button ref={expandButton} type="button" className="icon-button" aria-label={expanded ? 'Exit expanded preview' : 'Expand resume preview'} title={expanded ? 'Exit expanded view' : 'Expand preview'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button>
        <button type="button" className="icon-button" aria-label="Close resume preview" title="Close preview" onClick={expanded ? () => setExpanded(false) : onClose}><X size={16}/></button>
      </div>
    </div>
    <div className="resume-viewer-stage">
      {url ? <iframe key={source} className="resume-document" title={`Resume PDF: ${name}`} src={source}/> : <div className="resume-preview-loading" role="status">Preparing your resume…</div>}
    </div>
    <div className="resume-viewer-footer"><span>{name}</span><a href={url} target="_blank" rel="noreferrer">Open original <ArrowUpRight size={12}/></a></div>
  </section>;

  return expanded ? createPortal(
    <dialog ref={dialog} className="resume-preview-dialog" aria-label={`Expanded resume preview: ${name}`} onCancel={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
      {preview}
    </dialog>, document.body,
  ) : preview;
}
