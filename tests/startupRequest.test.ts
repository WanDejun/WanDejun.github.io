import { describe, expect, it } from 'vitest';
import { BLOG_NOT_FOUND, resolveStartupRequest } from '../src/startupRequest';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';

const fs = new VirtualFileSystem([
  { path: '/post/hello-terminal.md', content: '# Hello\n', size: 8, mime: 'text/markdown' },
  { path: '/post/archive/deep-dive.md', content: '# Deep dive\n', size: 12, mime: 'text/markdown' },
  { path: '/post/image.png', size: 10, mime: 'image/png' },
  { path: '/project/notes.md', content: '# Notes\n', size: 8, mime: 'text/markdown' },
  { path: '/slide/example/index.html', content: '<h1>Slides</h1>', size: 18, mime: 'text/html' },
]);
const defaultTheme = 'tokyonight-night';
const themeNames = ['gruvbox-light', defaultTheme];

const resolveRequest = (search: string) => resolveStartupRequest(search, fs, defaultTheme, themeNames);

describe('startup request', () => {
  it('keeps the default startup when no parameters are present', () => {
    expect(resolveRequest('')).toEqual({ blog: { type: 'default' }, themeName: defaultTheme, window: false });
  });

  it('resolves a shared post and its working directory', () => {
    expect(resolveRequest('?blog=%2Fpost%2Fhello-terminal.md').blog).toEqual({
      type: 'found',
      path: '/post/hello-terminal.md',
      cwd: '/post',
    });
    expect(resolveRequest('?blog=%2Fpost%2Fhello-terminal.md').window).toBe(false);
    expect(resolveRequest('?blog=/post/archive/deep-dive.md').blog).toEqual({
      type: 'found',
      path: '/post/archive/deep-dive.md',
      cwd: '/post/archive',
    });
  });

  it('resolves every renderable target and a windowed Markdown request', () => {
    expect(resolveRequest('?blog=/project/notes.md&window=true')).toEqual({
      blog: { type: 'found', path: '/project/notes.md', cwd: '/project' },
      themeName: defaultTheme,
      window: true,
    });
    expect(resolveRequest('?blog=/slide/example/index.html&window=true')).toEqual({
      blog: { type: 'found', path: '/slide/example/index.html', cwd: '/slide/example' },
      themeName: defaultTheme,
      window: true,
    });
    expect(resolveRequest('?blog=/slide/example/index.html&window=false').window).toBe(false);
  });

  it.each(['', '?window=false', '?window=1', '?window=TRUE'])('defaults window to false unless true: %s', (search) => {
    expect(resolveRequest(search).window).toBe(false);
  });

  it('accepts the literal true window parameter', () => {
    expect(resolveRequest('?window=true').window).toBe(true);
  });

  it.each([
    '?blog=',
    '?blog=/post/missing.md',
    '?blog=/post/image.png',
    '?blog=/project/page.html',
    '?blog=/project/missing.html',
  ])('rejects an invalid shared target: %s', (search) => {
    expect(resolveRequest(search).blog).toEqual({ type: 'not-found' });
  });

  it('uses a valid requested theme alongside other startup parameters', () => {
    expect(resolveRequest('?blog=/post/hello-terminal.md&theme=gruvbox-light')).toMatchObject({
      blog: { type: 'found', path: '/post/hello-terminal.md' },
      themeName: 'gruvbox-light',
      window: false,
    });
  });

  it.each(['?theme=', '?theme=missing', '?theme=GRUVBOX-LIGHT'])(
    'falls back to the configured theme for an invalid theme: %s',
    (search) => {
      expect(resolveRequest(search).themeName).toBe(defaultTheme);
    },
  );

  it('exports the exact not-found banner', () => {
    expect(BLOG_NOT_FOUND).toBe([
      ' _  _    ___  _  _',
      '| || |  / _ \\| || |',
      '| || |_| | | | || |_',
      '|__   _| |_| |__   _|',
      '   |_|  \\___/   |_|',
    ].join('\n'));
  });
});
