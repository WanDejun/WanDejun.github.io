import type { ITheme } from '@xterm/xterm';

export interface AppConfig {
  site: {
    title: string;
    windowTitle: string;
  };
  terminal: {
    prompt: string;
    theme: string;
    fontFamily: string;
    fontSize: number;
    cursorBlink: boolean;
    scrollback: number;
    maxWidth: number;
    heightPercent: number;
  };
  images: {
    timeoutMs: number;
    maxBytes: number;
    maxWidthCells: number;
  };
}

export interface AppTheme {
  colorScheme: 'dark' | 'light';
  page: {
    background: string;
    panel: string;
    titlebar: string;
    border: string;
    title: string;
    shadow: string;
  };
  terminal: ITheme;
  markdown: {
    heading: string;
    strong: string;
    emphasis: string;
    link: string;
    code: string;
    quote: string;
    muted: string;
    border: string;
    error: string;
  };
}

export type ManifestFile = {
  path: string;
  content?: string;
  url?: string;
  size: number;
  mime: string;
};

// Commands return structured chunks so terminal side effects and trusted ANSI output
// never have to be encoded into the plain-text pipeline stream.
export type OutputChunk =
  | { type: 'text'; value: string }
  | { type: 'ansi'; value: string }
  | { type: 'image'; source: string; alt: string; name: string }
  | { type: 'formula'; source: string; display: boolean }
  | { type: 'diagram'; source: string }
  | { type: 'theme'; name: string }
  | { type: 'clear' }
  | { type: 'reset' };

export interface CommandOutput {
  stdout: string;
  stderr?: string;
  chunks?: OutputChunk[];
  exitCode?: number;
}
