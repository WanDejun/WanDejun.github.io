import { describe, expect, it } from 'vitest';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';

const fs = new VirtualFileSystem([
  { path: '/help', content: 'hello\n', size: 6, mime: 'text/plain' },
  { path: '/blogs/notes/a.md', content: '# A\n', size: 4, mime: 'text/markdown', url: '/a.md' },
  { path: '/blogs/notes/picture.png', url: '/picture.png', size: 100, mime: 'image/png' },
], ['cat', 'ls']);

describe('VirtualFileSystem', () => {
  it('normalizes relative paths without escaping root', () => {
    expect(fs.normalize('../help', '/blogs')).toBe('/help');
    expect(fs.normalize('../../../../', '/blogs/notes')).toBe('/');
  });

  it('infers nested directories and reads text', () => {
    expect(fs.list('/').map((node) => node.name)).toEqual(['bin', 'blogs', 'help']);
    expect(fs.readText('../a.md', '/blogs/notes/deeper')).toBe('# A\n');
  });

  it('expands recursive globs and keeps unmatched patterns', () => {
    expect(fs.expand('/blogs/**/*.md')).toEqual(['/blogs/notes/a.md']);
    expect(fs.expand('*.missing', '/blogs')).toEqual(['*.missing']);
  });

  it('exposes registered commands under /bin', () => {
    expect(fs.list('/bin').map((node) => node.name)).toEqual(['cat', 'ls']);
  });
});
