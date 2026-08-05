import { describe, expect, it } from 'vitest';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';
import { mimeForPath, responseMimeForPath } from '../src/filesystem/mime';

const fs = new VirtualFileSystem([
  { path: '/help', content: 'hello\n', size: 6, mime: 'text/plain' },
  { path: '/posts/a.md', content: '# A\n', size: 4, mime: 'text/markdown', url: '/a.md' },
  { path: '/posts/picture.png', url: '/picture.png', size: 100, mime: 'image/png' },
], ['cat', 'ls']);

describe('VirtualFileSystem', () => {
  it('normalizes relative paths without escaping root', () => {
    expect(fs.normalize('../help', '/posts')).toBe('/help');
    expect(fs.normalize('../../../../', '/posts/archive')).toBe('/');
  });

  it('infers nested directories and reads text', () => {
    expect(fs.list('/').map((node) => node.name)).toEqual(['bin', 'help', 'posts']);
    expect(fs.readText('../a.md', '/posts/deeper')).toBe('# A\n');
  });

  it('expands recursive globs and keeps unmatched patterns', () => {
    expect(fs.expand('/posts/**/*.md')).toEqual(['/posts/a.md']);
    expect(fs.expand('*.missing', '/posts')).toEqual(['*.missing']);
  });

  it('exposes registered commands under /bin', () => {
    expect(fs.list('/bin').map((node) => node.name)).toEqual(['cat', 'ls']);
  });

  it('shares MIME detection between virtual and statically served files', () => {
    expect(mimeForPath('deck/index.html')).toBe('text/html');
    expect(mimeForPath('deck/font.woff2')).toBe('font/woff2');
    expect(mimeForPath('help', 'text/plain')).toBe('text/plain');
    expect(responseMimeForPath('deck/index.html')).toBe('text/html; charset=utf-8');
  });
});
