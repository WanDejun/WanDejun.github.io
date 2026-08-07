import { useEffect, useRef } from 'react';
import type { VirtualFileSystem } from '../filesystem/VirtualFileSystem';
import type { AppTheme } from '../types';
import { MarkdownDocument } from './MarkdownDocument';

export type DocumentPreview = {
  kind: 'slide' | 'markdown';
  path: string;
  title: string;
};

interface DocumentOverlayProps {
  document: DocumentPreview;
  fs: VirtualFileSystem;
  theme: AppTheme;
  onClose(): void;
}

function staticDocumentUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export function DocumentOverlay({ document, fs, theme, onClose }: DocumentOverlayProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);

  const focusDocument = () => {
    if (document.kind === 'slide') {
      frameRef.current?.focus();
      frameRef.current?.contentWindow?.focus();
    } else {
      markdownRef.current?.focus();
    }
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
      <section
        className="document-window"
        role="dialog"
        aria-modal="true"
        aria-label={`${document.title} ${document.kind === 'slide' ? 'slide' : 'document'}`}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
      >
        <header className="document-titlebar">
          <span className="document-title">{document.path}</span>
          <button className="document-close" type="button" title="Close" aria-label="Close document" onClick={onClose}>
            ×
          </button>
        </header>
        {document.kind === 'slide' ? (
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
        ) : (
          <div className="document-content" ref={markdownRef} tabIndex={-1} onClick={(event) => {
            if (event.target === event.currentTarget) markdownRef.current?.focus();
          }}>
            <MarkdownDocument path={document.path} fs={fs} theme={theme} />
          </div>
        )}
      </section>
    </div>
  );
}
