import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { config, loadTheme, theme as defaultTheme, themeNames } from '../config';
import { BLOG_NOT_FOUND, resolveStartupRequest } from '../startupRequest';
import {
  applyCompletionSuggestion, layoutCompletions, moveCompletionColumn, moveCompletionIndex,
} from './completionPager';
import { buildManifest } from '../filesystem/manifest';
import { VirtualFileSystem } from '../filesystem/VirtualFileSystem';
import { ansi, paint, sanitizeTerminalText, terminalLines } from '../shell/ansi';
import { formatColumnRow, terminalCellWidth } from '../shell/columnLayout';
import { createRegistry } from '../shell/createRegistry';
import { quoteShellWord } from '../shell/parser';
import { Shell } from '../shell/Shell';
import type { CompletionSuggestion } from '../shell/types';
import type { AppTheme, OutputChunk } from '../types';
import { DocumentOverlay, type DocumentPreview } from './DocumentOverlay';

interface CompletionMenu {
  suggestions: CompletionSuggestion[];
  prefix: string;
  suffix: string;
  originalLine: string;
  originalCursor: number;
  selectedIndex: number | null;
  renderedRows: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  // Avoid passing a large image through one spread call, which can overflow the stack.
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function xtermWrite(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

function isSupportedImage(mime: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime.toLowerCase());
}

async function imageCellSize(terminal: Terminal, bytes: Uint8Array, mime: string): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen');
  const cellWidth = (screen?.clientWidth ?? terminal.cols * 9) / terminal.cols;
  const cellHeight = (screen?.clientHeight ?? terminal.rows * 19) / terminal.rows;
  // IIP dimensions use terminal cells. Constrain both axes so portrait images remain visible.
  const maxWidthPixels = Math.min(config.images.maxWidthCells, terminal.cols - 2) * cellWidth;
  const maxHeightPixels = Math.max(4, terminal.rows - 5) * cellHeight;
  const scale = Math.min(maxWidthPixels / bitmap.width, maxHeightPixels / bitmap.height, 1);
  const width = Math.max(1, Math.floor((bitmap.width * scale) / cellWidth));
  const height = Math.max(1, Math.floor((bitmap.height * scale) / cellHeight));
  bitmap.close();
  return { width, height };
}

async function writeInlineImage(
  terminal: Terminal,
  bytes: Uint8Array,
  mime: string,
  name: string,
): Promise<void> {
  const dimensions = await imageCellSize(terminal, bytes, mime);
  // ImageAddon consumes the iTerm2 OSC 1337 sequence written into xterm itself.
  const sequence = `\x1b]1337;File=name=${utf8ToBase64(name)};size=${bytes.byteLength};width=${dimensions.width};height=${dimensions.height};preserveAspectRatio=1;inline=1:${bytesToBase64(bytes)}\x07`;
  await xtermWrite(terminal, sequence);
}

async function writeImage(
  terminal: Terminal,
  chunk: Extract<OutputChunk, { type: 'image' }>,
  signal: AbortSignal,
  palette: AppTheme,
): Promise<void> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), config.images.timeoutMs);
  const abort = () => timeout.abort();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(chunk.source, { signal: timeout.signal, mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const announcedSize = Number(response.headers.get('content-length') ?? 0);
    if (announcedSize > config.images.maxBytes) throw new Error('image exceeds configured size limit');
    const mime = (response.headers.get('content-type') ?? '').split(';')[0];
    if (!isSupportedImage(mime)) throw new Error(`unsupported image type '${mime || 'unknown'}'`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > config.images.maxBytes) throw new Error('image exceeds configured size limit');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await writeInlineImage(terminal, bytes, mime, chunk.name);
  } catch (exception) {
    if (signal.aborted) throw exception;
    const reason = exception instanceof Error ? exception.message : String(exception);
    const fallback = `[image unavailable: ${chunk.alt}; ${reason}] ${chunk.source}\n`;
    await xtermWrite(terminal, terminalLines(paint(fallback, palette.markdown.error)));
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

async function svgToPng(svg: string): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('generated SVG has no dimensions');

    // A modest scale keeps TeX strokes crisp without changing terminal-cell sizing excessively.
    const scale = Math.min(1.5, 4096 / image.naturalWidth, 4096 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.ceil(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas rendering is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('failed to encode generated image')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function writeGeneratedImage(
  terminal: Terminal,
  signal: AbortSignal,
  kind: 'formula' | 'diagram',
  palette: AppTheme,
  createSvg: () => Promise<string>,
): Promise<void> {
  try {
    const svg = await createSvg();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const bytes = await svgToPng(svg);
    if (bytes.byteLength > config.images.maxBytes) throw new Error(`${kind} image exceeds configured size limit`);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await writeInlineImage(terminal, bytes, 'image/png', `${kind}.png`);
  } catch (exception) {
    if (signal.aborted) throw exception;
    const reason = sanitizeTerminalText(exception instanceof Error ? exception.message : String(exception));
    await xtermWrite(terminal, terminalLines(paint(`[${kind} unavailable: ${reason}]\n`, palette.markdown.error)));
  }
}

async function writeFormula(
  terminal: Terminal,
  chunk: Extract<OutputChunk, { type: 'formula' }>,
  signal: AbortSignal,
  palette: AppTheme,
): Promise<void> {
  return writeGeneratedImage(terminal, signal, 'formula', palette, async () => {
    // MathJax is a separate bundle and is loaded only when rendered Markdown contains TeX.
    const { formulaToSvg } = await import('../markdown/renderFormula');
    return formulaToSvg(chunk.source, chunk.display, palette.terminal.foreground ?? '#c0caf5');
  });
}

async function writeDiagram(
  terminal: Terminal,
  chunk: Extract<OutputChunk, { type: 'diagram' }>,
  signal: AbortSignal,
  palette: AppTheme,
): Promise<void> {
  return writeGeneratedImage(terminal, signal, 'diagram', palette, async () => {
    // Mermaid is intentionally lazy because its parsers and layout engines are sizeable.
    const { diagramToSvg } = await import('../markdown/renderDiagram');
    return diagramToSvg(chunk.source, {
      background: palette.page.panel,
      foreground: palette.terminal.foreground ?? '#c0caf5',
      primary: palette.markdown.heading,
      secondary: palette.markdown.code,
      border: palette.markdown.border,
      line: palette.markdown.muted,
    });
  });
}

export function TerminalWindow() {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const startup = useMemo(() => {
    const registry = createRegistry();
    const fs = new VirtualFileSystem(buildManifest(), registry.names());
    const request = resolveStartupRequest(
      window.location.search,
      fs,
      config.terminal.theme,
      themeNames,
    );
    const palette = request.themeName === config.terminal.theme
      ? defaultTheme
      : loadTheme(request.themeName);
    const shell = new Shell(
      fs,
      registry,
      palette,
      request.themeName,
      themeNames,
      window.location.href,
    );
    return { palette, request, shell };
  }, []);
  const [activeTheme, setActiveTheme] = useState(startup.palette);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { request, shell } = startup;
    let currentTheme = startup.palette;

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: config.terminal.cursorBlink,
      cursorStyle: 'bar',
      fontFamily: config.terminal.fontFamily,
      fontSize: config.terminal.fontSize,
      lineHeight: 1.25,
      screenReaderMode: true,
      scrollback: config.terminal.scrollback,
      theme: currentTheme.terminal,
    });
    terminalRef.current = terminal;
    const fitAddon = new FitAddon();
    const imageAddon = new ImageAddon();
    const unicodeAddon = new Unicode11Addon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(unicodeAddon);
    terminal.loadAddon(imageAddon);
    terminal.unicode.activeVersion = '11';
    terminal.open(host);
    fitAddon.fit();

    // xterm draws text on canvas, so it must redraw once bundled fallback fonts are ready.
    void Promise.all([
      document.fonts.load(`${config.terminal.fontSize}px "Neko Nerd Symbols"`, '\ue0b0'),
      document.fonts.load(`${config.terminal.fontSize}px "Neko Emoji"`, '🚀'),
    ]).then(() => {
      if (terminalRef.current !== terminal) return;
      fitAddon.fit();
      terminal.refresh(0, terminal.rows - 1);
    }).catch(() => { /* System fallbacks remain usable if a bundled font cannot load. */ });

    let line: string[] = [];
    let cursor = 0;
    let historyIndex = -1;
    const history: string[] = [];
    let busy = false;
    let activeController: AbortController | null = null;
    let inputQueue = Promise.resolve();
    let completion: CompletionMenu | null = null;

    const promptText = () => config.terminal.prompt.replaceAll('{cwd}', shell.cwd);
    const promptAnsi = () => paint(promptText(), currentTheme.terminal.green ?? '#9ece6a', ansi.bold);
    const writePrompt = () => terminal.write(promptAnsi());
    const redraw = () => {
      terminal.write(`\r\x1b[2K${promptAnsi()}${sanitizeTerminalText(line.join(''))}`);
      const tail = terminalCellWidth(line.slice(cursor).join(''));
      if (tail > 0) terminal.write(`\x1b[${tail}D`);
    };

    const completionColor = (suggestion: CompletionSuggestion) => {
      if (suggestion.kind === 'command' || suggestion.kind === 'executable') return currentTheme.terminal.green ?? '#9ece6a';
      if (suggestion.kind === 'directory') return currentTheme.terminal.blue ?? '#7aa2f7';
      return currentTheme.terminal.white ?? currentTheme.terminal.foreground ?? '#c0caf5';
    };

    const eraseCompletion = () => {
      if (!completion?.renderedRows) return;
      // The pager lives below the prompt; erase it without disturbing the command line.
      terminal.write('\x1b[1B\r\x1b[J\x1b[1A');
      completion.renderedRows = 0;
    };

    const renderCompletion = () => {
      if (!completion) return;
      if (completion.renderedRows) eraseCompletion();

      const layout = layoutCompletions(
        completion.suggestions,
        completion.selectedIndex,
        Math.max(1, terminal.cols - 1),
        Math.max(1, terminal.rows - 4),
      );
      const lines = layout.rows.map((row) => formatColumnRow(
        row,
        layout.columnWidth,
        ({ suggestion }) => suggestion.value,
        (text, { index, suggestion }) => {
          const styled = `${ansi.color(completionColor(suggestion))}${sanitizeTerminalText(text)}${ansi.reset}`;
          return index === completion?.selectedIndex ? `${ansi.inverse}${styled}` : styled;
        },
      ));
      if (layout.showPageCounter) {
        lines.push(paint(`[${layout.page + 1}/${layout.pageCount}]`, currentTheme.markdown.muted));
      }

      // Writing the pager may scroll the viewport; moving back by its rendered height
      // reliably returns the cursor to the command immediately above it.
      terminal.write(`\r\n${lines.join('\r\n')}\x1b[${lines.length}A`);
      completion.renderedRows = lines.length;
      redraw();
    };

    const closeCompletion = (restoreOriginal: boolean) => {
      if (!completion) return;
      const current = completion;
      eraseCompletion();
      if (restoreOriginal) {
        line = [...current.originalLine];
        cursor = current.originalCursor;
      }
      completion = null;
      redraw();
    };

    const openCompletion = () => {
      const input = line.join('');
      const cursorOffset = line.slice(0, cursor).join('').length;
      const result = shell.complete(input, cursorOffset);
      if (result.suggestions.length === 0) {
        terminal.write('\x07');
        return;
      }
      if (result.suggestions.length === 1) {
        const selectedInput = applyCompletionSuggestion(
          result.prefix,
          result.suffix,
          result.suggestions[0],
        );
        line = [...selectedInput.line];
        cursor = selectedInput.cursor;
        redraw();
        return;
      }
      completion = {
        suggestions: result.suggestions,
        prefix: result.prefix,
        suffix: result.suffix,
        originalLine: line.join(''),
        originalCursor: cursor,
        selectedIndex: null,
        renderedRows: 0,
      };
      renderCompletion();
    };

    const moveCompletion = (direction: 'next' | 'previous' | 'left' | 'right') => {
      if (!completion) return;
      const layout = layoutCompletions(
        completion.suggestions,
        completion.selectedIndex,
        Math.max(1, terminal.cols - 1),
        Math.max(1, terminal.rows - 4),
      );
      completion.selectedIndex = direction === 'left' || direction === 'right'
        ? moveCompletionColumn(completion.selectedIndex, layout, direction === 'right' ? 1 : -1)
        : moveCompletionIndex(
          completion.selectedIndex,
          completion.suggestions.length,
          direction === 'next' ? 1 : -1,
      );
      const selected = completion.suggestions[completion.selectedIndex!];
      const selectedInput = applyCompletionSuggestion(completion.prefix, completion.suffix, selected);
      line = [...selectedInput.line];
      cursor = selectedInput.cursor;
      renderCompletion();
    };
    // This is the trust boundary: plain command output is sanitized, while ANSI chunks
    // come only from internal renderers and may intentionally contain escape sequences.
    async function renderChunks(chunks: OutputChunk[], controller: AbortController): Promise<void> {
      for (const chunk of chunks) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (chunk.type === 'text') await xtermWrite(terminal, terminalLines(sanitizeTerminalText(chunk.value)));
        else if (chunk.type === 'ansi') await xtermWrite(terminal, terminalLines(chunk.value));
        else if (chunk.type === 'image') await writeImage(terminal, chunk, controller.signal, currentTheme);
        else if (chunk.type === 'formula') await writeFormula(terminal, chunk, controller.signal, currentTheme);
        else if (chunk.type === 'diagram') await writeDiagram(terminal, chunk, controller.signal, currentTheme);
        else if (chunk.type === 'document') setDocumentPreview({ kind: 'slide', path: chunk.path, title: chunk.title });
        else if (chunk.type === 'markdown-document') setDocumentPreview({ kind: 'markdown', path: chunk.path, title: chunk.title });
        else if (chunk.type === 'theme') {
          currentTheme = loadTheme(chunk.name);
          shell.setTheme(chunk.name, currentTheme);
          terminal.options.theme = currentTheme.terminal;
          setActiveTheme(currentTheme);
          terminal.refresh(0, terminal.rows - 1);
        }
        else if (chunk.type === 'clear') await xtermWrite(terminal, '\x1b[2J\x1b[H');
        else if (chunk.type === 'reset') {
          historyIndex = -1;
          await renderStartup(controller);
        }
      }
    }

    async function renderStartup(controller: AbortController): Promise<void> {
      await xtermWrite(terminal, '\x1b[2J\x1b[H');
      shell.reset();
      if (request.blog.type === 'not-found') {
        await xtermWrite(terminal, terminalLines(`${BLOG_NOT_FOUND}\n`));
        return;
      }

      const path = request.blog.type === 'found' ? request.blog.path : '/static/welcome.md';
      if (request.blog.type === 'found') shell.cwd = request.blog.cwd;
      // Equivalent to a bashrc command: startup and `exit` both use the public render path.
      const renderArguments = request.window ? `--window ${quoteShellWord(path)}` : quoteShellWord(path);
      const startupResult = await shell.execute(`render ${renderArguments}`, controller.signal, terminal.cols);
      await renderChunks(startupResult.chunks, controller);
    }

    const submit = async () => {
      const input = line.join('');
      terminal.write('\r\n');
      line = [];
      cursor = 0;
      historyIndex = -1;
      if (!input.trim()) { writePrompt(); return; }
      if (history.at(-1) !== input) history.push(input);
      busy = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const result = await shell.execute(input, controller.signal, terminal.cols);
        await renderChunks(result.chunks, controller);
      } catch (exception) {
        if (controller.signal.aborted) terminal.write('^C\r\n');
        else terminal.write(terminalLines(paint(`${(exception as Error).message}\n`, currentTheme.markdown.error)));
      } finally {
        busy = false;
        activeController = null;
        writePrompt();
      }
    };

    const setHistory = (direction: -1 | 1) => {
      if (history.length === 0) return;
      if (direction === -1) historyIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      else historyIndex = historyIndex < 0 ? -1 : Math.min(history.length, historyIndex + 1);
      line = historyIndex === history.length || historyIndex < 0 ? [] : [...history[historyIndex]];
      cursor = line.length;
      redraw();
    };

    const processData = async (data: string) => {
      if (busy) {
        if (data.includes('\x03')) activeController?.abort();
        return;
      }
      if (completion) {
        if (data === '\t' || data === '\x1b[B') { moveCompletion('next'); return; }
        if (data === '\x1b[Z' || data === '\x1b[A') { moveCompletion('previous'); return; }
        if (data === '\x1b[C') { moveCompletion('right'); return; }
        if (data === '\x1b[D') { moveCompletion('left'); return; }
        if (data === '\x1b') { closeCompletion(true); return; }
        if (data === '\r' || data === '\n') {
          if (completion.selectedIndex !== null) { closeCompletion(false); return; }
          closeCompletion(false);
        } else {
          // Editing after a preview accepts the highlighted value and closes the pager.
          closeCompletion(false);
        }
      }
      if (data === '\x1b[A') { setHistory(-1); return; }
      if (data === '\x1b[B') { setHistory(1); return; }
      if (data === '\x1b[D') { if (cursor > 0) { cursor -= 1; terminal.write('\x1b[D'); } return; }
      if (data === '\x1b[C') { if (cursor < line.length) { cursor += 1; terminal.write('\x1b[C'); } return; }
      if (data === '\x1b[H' || data === '\x01') { cursor = 0; redraw(); return; }
      if (data === '\x1b[F' || data === '\x05') { cursor = line.length; redraw(); return; }
      if (data === '\x1b[3~') { if (cursor < line.length) line.splice(cursor, 1); redraw(); return; }
      if (data === '\x0c') { terminal.write('\x1b[2J\x1b[H'); redraw(); return; }
      if (data === '\x03') { line = []; cursor = 0; terminal.write('^C\r\n'); writePrompt(); return; }
      if (data === '\x15') { line.splice(0, cursor); cursor = 0; redraw(); return; }
      if (data === '\x0b') { line.splice(cursor); redraw(); return; }
      if (data === '\x17') {
        while (cursor > 0 && /\s/.test(line[cursor - 1])) { line.splice(--cursor, 1); }
        while (cursor > 0 && !/\s/.test(line[cursor - 1])) { line.splice(--cursor, 1); }
        redraw(); return;
      }
      if (data === '\t') { openCompletion(); return; }
      if (data === '\x7f') { if (cursor > 0) { line.splice(--cursor, 1); redraw(); } return; }

      for (const character of data.replace(/\r\n/g, '\r')) {
        if (character === '\r' || character === '\n') await submit();
        else if (character >= ' ' && character !== '\x7f') {
          line.splice(cursor, 0, character);
          cursor += 1;
          redraw();
        }
      }
    };

    const dataDisposable = terminal.onData((data) => {
      // Serialize key and paste events so a multiline paste cannot race command execution.
      inputQueue = inputQueue.then(() => processData(data));
    });
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (completion) renderCompletion();
      } catch { /* The terminal may be between mount states. */ }
    });
    resizeObserver.observe(host);
    const focus = () => terminal.focus();
    host.addEventListener('pointerdown', focus);

    // Keep startup cancellable because React StrictMode mounts effects twice in development.
    const startupController = new AbortController();
    activeController = startupController;
    busy = true;
    void renderStartup(startupController)
      .catch((exception) => {
        if (!startupController.signal.aborted) {
          terminal.write(terminalLines(paint(`${(exception as Error).message}\n`, currentTheme.markdown.error)));
        }
      })
      .finally(() => {
        if (!startupController.signal.aborted) {
          busy = false;
          activeController = null;
          writePrompt();
        }
      });
    terminal.focus();

    return () => {
      activeController?.abort();
      dataDisposable.dispose();
      resizeObserver.disconnect();
      host.removeEventListener('pointerdown', focus);
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [startup]);

  const variables = {
    colorScheme: activeTheme.colorScheme,
    '--page-bg': activeTheme.page.background,
    '--panel-bg': activeTheme.page.panel,
    '--titlebar-bg': activeTheme.page.titlebar,
    '--panel-border': activeTheme.page.border,
    '--title-color': activeTheme.page.title,
    '--panel-shadow': activeTheme.page.shadow,
    '--status-red': activeTheme.terminal.red,
    '--status-yellow': activeTheme.terminal.yellow,
    '--status-green': activeTheme.terminal.green,
    '--scrollbar-thumb': activeTheme.terminal.brightBlack,
    '--terminal-bg': activeTheme.terminal.background,
    '--terminal-fg': activeTheme.terminal.foreground,
    '--markdown-heading': activeTheme.markdown.heading,
    '--markdown-strong': activeTheme.markdown.strong,
    '--markdown-emphasis': activeTheme.markdown.emphasis,
    '--markdown-link': activeTheme.markdown.link,
    '--markdown-code': activeTheme.markdown.code,
    '--markdown-quote': activeTheme.markdown.quote,
    '--markdown-muted': activeTheme.markdown.muted,
    '--markdown-border': activeTheme.markdown.border,
    '--markdown-error': activeTheme.markdown.error,
    '--terminal-font': config.terminal.fontFamily,
    '--window-max-width': `${config.terminal.maxWidth}px`,
    '--window-height-percent': config.terminal.heightPercent,
  } as React.CSSProperties;

  const closeDocument = () => {
    setDocumentPreview(null);
    window.requestAnimationFrame(() => terminalRef.current?.focus());
  };

  return (
    <main className="page" style={variables}>
      <section className="terminal-window" aria-label="Interactive terminal">
        <header className="terminal-titlebar">
          <div className="window-status" aria-hidden="true">
            <span className="status-dot status-red" />
            <span className="status-dot status-yellow" />
            <span className="status-dot status-green" />
          </div>
          <div className="terminal-title">{config.site.windowTitle}</div>
          <div className="titlebar-balance" aria-hidden="true" />
        </header>
        <div className="terminal-host">
          <div ref={hostRef} className="terminal-mount" />
        </div>
      </section>
      {documentPreview && <DocumentOverlay document={documentPreview} fs={startup.shell.fs} theme={activeTheme} onClose={closeDocument} />}
    </main>
  );
}
