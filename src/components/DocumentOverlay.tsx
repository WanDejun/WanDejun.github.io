import { useEffect, useRef } from 'react';

export interface DocumentPreview {
  path: string;
  title: string;
}

interface DocumentOverlayProps {
  document: DocumentPreview;
  onClose(): void;
}

function staticDocumentUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export function DocumentOverlay({ document, onClose }: DocumentOverlayProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const focusDocument = () => {
    frameRef.current?.focus();
    frameRef.current?.contentWindow?.focus();
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(focusDocument);
    return () => window.cancelAnimationFrame(frame);
  }, [document.path]);

  return (
    <div
      className="document-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="document-window" role="dialog" aria-modal="true" aria-label={`${document.title} slide`}>
        <header className="document-titlebar">
          <span className="document-title">{document.path}</span>
          <button className="document-close" type="button" title="Close" aria-label="Close slide" onClick={onClose}>
            ×
          </button>
        </header>
        <iframe
          ref={frameRef}
          className="document-frame"
          src={staticDocumentUrl(document.path)}
          title={document.title}
          allow="fullscreen"
          allowFullScreen
          sandbox="allow-forms allow-popups allow-presentation allow-scripts"
          onLoad={focusDocument}
        />
      </section>
    </div>
  );
}
