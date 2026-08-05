import { parse } from 'smol-toml';
import rawConfig from '../config.toml?raw';
import type { AppConfig, AppTheme } from './types';

type Table = Record<string, unknown>;

const themeFiles = import.meta.glob('./themes/*.toml', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

export const themeNames = Object.keys(themeFiles)
  .map((path) => path.slice(path.lastIndexOf('/') + 1, -'.toml'.length))
  .sort();

function table(value: unknown, path: string): Table {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected TOML table at ${path}`);
  }
  return value as Table;
}

function stringValue(source: Table, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string at ${path}.${key}`);
  }
  return value;
}

function numberValue(source: Table, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected positive number at ${path}.${key}`);
  }
  return value;
}

function percentValue(source: Table, key: string, path: string): number {
  const value = numberValue(source, key, path);
  if (value > 100) throw new Error(`Expected percentage no greater than 100 at ${path}.${key}`);
  return value;
}

function booleanValue(source: Table, key: string, path: string): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}.${key}`);
  }
  return value;
}

function colorSchemeValue(source: Table): AppTheme['colorScheme'] {
  const value = stringValue(source, 'color_scheme', 'meta');
  if (value !== 'dark' && value !== 'light') {
    throw new Error("Expected 'dark' or 'light' at meta.color_scheme");
  }
  return value;
}

function camelizeTable(source: Table): Table {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

export function loadConfig(source = rawConfig): AppConfig {
  const parsed = parse(source) as Table;
  const site = table(parsed.site, 'site');
  const terminal = table(parsed.terminal, 'terminal');
  const images = table(parsed.images, 'images');

  return {
    site: {
      title: stringValue(site, 'title', 'site'),
      windowTitle: stringValue(site, 'window_title', 'site'),
    },
    terminal: {
      prompt: stringValue(terminal, 'prompt', 'terminal'),
      theme: stringValue(terminal, 'theme', 'terminal'),
      fontFamily: stringValue(terminal, 'font_family', 'terminal'),
      fontSize: numberValue(terminal, 'font_size', 'terminal'),
      cursorBlink: booleanValue(terminal, 'cursor_blink', 'terminal'),
      scrollback: numberValue(terminal, 'scrollback', 'terminal'),
      maxWidth: numberValue(terminal, 'max_width', 'terminal'),
      heightPercent: percentValue(terminal, 'height_percent', 'terminal'),
    },
    images: {
      timeoutMs: numberValue(images, 'timeout_ms', 'images'),
      maxBytes: numberValue(images, 'max_bytes', 'images'),
      maxWidthCells: numberValue(images, 'max_width_cells', 'images'),
    },
  };
}

export function loadTheme(name: string): AppTheme {
  const entry = Object.entries(themeFiles).find(([path]) => path.endsWith(`/${name}.toml`));
  if (!entry) throw new Error(`Theme '${name}' was not found in src/themes`);

  const parsed = parse(entry[1]) as Table;
  const meta = table(parsed.meta, 'meta');
  const page = camelizeTable(table(parsed.page, 'page'));
  const terminal = camelizeTable(table(parsed.terminal, 'terminal'));
  const markdown = camelizeTable(table(parsed.markdown, 'markdown'));

  const requireColors = (source: Table, keys: string[], path: string): Record<string, string> =>
    Object.fromEntries(keys.map((key) => [key, stringValue(source, key, path)]));

  return {
    colorScheme: colorSchemeValue(meta),
    page: requireColors(page, ['background', 'panel', 'titlebar', 'border', 'title', 'shadow'], 'page') as AppTheme['page'],
    terminal: requireColors(
      terminal,
      ['background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground', 'selectionForeground', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'],
      'terminal',
    ),
    markdown: requireColors(markdown, ['heading', 'strong', 'emphasis', 'link', 'code', 'quote', 'muted', 'border', 'error'], 'markdown') as AppTheme['markdown'],
  };
}

export const config = loadConfig();
export const theme = loadTheme(config.terminal.theme);
