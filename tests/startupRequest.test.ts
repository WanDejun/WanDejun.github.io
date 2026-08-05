import { describe, expect, it } from 'vitest';
import { BLOG_NOT_FOUND, resolveStartupRequest } from '../src/startupRequest';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';

const fs = new VirtualFileSystem([
  { path: '/post/hello-terminal.md', content: '# Hello\n', size: 8, mime: 'text/markdown' },
  { path: '/post/archive/deep-dive.md', content: '# Deep dive\n', size: 12, mime: 'text/markdown' },
  { path: '/post/image.png', size: 10, mime: 'image/png' },
  { path: '/project/notes.md', content: '# Notes\n', size: 8, mime: 'text/markdown' },
]);
const defaultTheme = 'tokyonight-night';
const themeNames = ['gruvbox-light', defaultTheme];

const resolveRequest = (search: string) => resolveStartupRequest(search, fs, defaultTheme, themeNames);

describe('startup request', () => {
  it('keeps the default startup when no parameters are present', () => {
    expect(resolveRequest('')).toEqual({ blog: { type: 'default' }, themeName: defaultTheme });
  });

  it('resolves a shared post and its working directory', () => {
    expect(resolveRequest('?blog=%2Fpost%2Fhello-terminal.md').blog).toEqual({
      type: 'found',
      path: '/post/hello-terminal.md',
      cwd: '/post',
    });
    expect(resolveRequest('?blog=/post/archive/deep-dive.md').blog).toEqual({
      type: 'found',
      path: '/post/archive/deep-dive.md',
      cwd: '/post/archive',
    });
  });

  it.each([
    '?blog=',
    '?blog=/post/missing.md',
    '?blog=/post/image.png',
    '?blog=/project/notes.md',
    '?blog=/post/../project/notes.md',
  ])('rejects an invalid shared post: %s', (search) => {
    expect(resolveRequest(search).blog).toEqual({ type: 'not-found' });
  });

  it('uses a valid requested theme alongside other startup parameters', () => {
    expect(resolveRequest('?blog=/post/hello-terminal.md&theme=gruvbox-light')).toMatchObject({
      blog: { type: 'found', path: '/post/hello-terminal.md' },
      themeName: 'gruvbox-light',
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
