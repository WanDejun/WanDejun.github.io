import { beforeEach, describe, expect, it } from 'vitest';
import { theme } from '../src/config';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';
import { createRegistry } from '../src/shell/createRegistry';
import { ansi } from '../src/shell/ansi';
import { Shell } from '../src/shell/Shell';

const controller = () => new AbortController().signal;
let shell: Shell;

beforeEach(() => {
  const registry = createRegistry();
  const fs = new VirtualFileSystem([
    { path: '/help', content: 'Use help.\n', size: 10, mime: 'text/plain' },
    { path: '/blogs/notes/post.md', content: '# Post\n\n![Photo](./photo.png)\n', size: 34, mime: 'text/markdown', url: '/post.md' },
    { path: '/blogs/notes/photo.png', size: 12, mime: 'image/png', url: '/photo.png' },
  ], registry.names());
  shell = new Shell(fs, registry, theme);
});

describe('Shell', () => {
  it('implements help through the /help file', async () => {
    const help = await shell.execute('help', controller());
    const cat = await shell.execute('cat /help', controller());
    expect(help.chunks).toEqual(cat.chunks);
  });

  it('changes cwd and runs text pipelines', async () => {
    await shell.execute('cd /blogs/notes', controller());
    expect(shell.cwd).toBe('/blogs/notes');
    const result = await shell.execute(`printf '%s\\n' beta alpha beta | sort | uniq -c`, controller());
    expect(result.chunks).toEqual([{ type: 'text', value: '      1 alpha\n      2 beta\n' }]);
  });

  it('finds Markdown through a quoted glob expression', async () => {
    const result = await shell.execute(`find /blogs -type f -name '*.md'`, controller());
    expect(result.chunks).toEqual([{ type: 'text', value: '/blogs/notes/post.md\n' }]);
  });

  it('colors directories, executables, and regular files without polluting pipes', async () => {
    const root = await shell.execute('ls /', controller());
    expect(root.chunks).toEqual([{ type: 'ansi', value: expect.any(String) }]);
    const rootOutput = root.chunks[0].type === 'ansi' ? root.chunks[0].value : '';
    expect(rootOutput).toContain(`${ansi.color(theme.terminal.blue!)}bin/`);
    expect(rootOutput).toContain(`${ansi.color(theme.terminal.white!)}help`);

    const bin = await shell.execute('tree /bin -L 1', controller());
    const binOutput = bin.chunks[0].type === 'ansi' ? bin.chunks[0].value : '';
    expect(binOutput).toContain(`${ansi.color(theme.terminal.green!)}cat`);

    const piped = await shell.execute('ls /bin/cat | grep cat', controller());
    expect(piped.chunks).toEqual([{ type: 'text', value: 'cat\n' }]);
    expect((piped.chunks[0] as { value: string }).value).not.toContain('\x1b');
  });

  it('keeps cat raw and lets glow emit a terminal image chunk', async () => {
    const cat = await shell.execute('cat /blogs/notes/post.md', controller());
    expect(cat.chunks[0]).toMatchObject({ type: 'text', value: expect.stringContaining('![Photo]') });

    const glow = await shell.execute('glow /blogs/notes/post.md', controller());
    expect(glow.chunks.some((chunk) => chunk.type === 'image' && chunk.source === '/photo.png')).toBe(true);
  });

  it('returns plain fallback text when glow is piped', async () => {
    const result = await shell.execute('glow /blogs/notes/post.md | grep image', controller());
    expect(result.chunks).toEqual([{ type: 'text', value: '[image: Photo; ./photo.png]\n' }]);
  });

  it('implements sed substitution including the complete-match token', async () => {
    const result = await shell.execute(`printf 'alpha\\n' | sed 's/alpha/[&]/'`, controller());
    expect(result.chunks).toEqual([{ type: 'text', value: '[alpha]\n' }]);
  });

  it('reports unknown commands and exposes reset as an exit side effect', async () => {
    expect((await shell.execute('missing', controller())).exitCode).toBe(127);
    expect((await shell.execute('exit', controller())).chunks).toEqual([{ type: 'reset' }]);
  });
});
