import { beforeEach, describe, expect, it } from 'vitest';
import { theme, themeNames } from '../src/config';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';
import { createRegistry } from '../src/shell/createRegistry';
import { ansi } from '../src/shell/ansi';
import { terminalCellWidth } from '../src/shell/columnLayout';
import { Shell } from '../src/shell/Shell';

const controller = () => new AbortController().signal;
let shell: Shell;

beforeEach(() => {
  const registry = createRegistry();
  const fs = new VirtualFileSystem([
    { path: '/help', content: 'Use help.\n', size: 10, mime: 'text/plain' },
    { path: '/posts/post.md', content: '# Post\n\n$$\nE = mc^2\n$$\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n![Photo](./photo.png)\n\nEmoji :rocket: and 😺; code `:rocket:`.\n', size: 138, mime: 'text/markdown', url: '/post.md' },
    { path: '/posts/photo.png', size: 12, mime: 'image/png', url: '/photo.png' },
    { path: '/posts/my notes/draft post.md', content: '# Draft\n', size: 8, mime: 'text/markdown' },
    { path: '/project/page.html', content: '<h1>Project</h1>', size: 16, mime: 'text/html' },
    { path: '/slide/example/index.html', content: '<h1>Slides</h1>', size: 15, mime: 'text/html' },
  ], registry.names());
  shell = new Shell(fs, registry, theme, 'tokyonight-night', themeNames);
});

describe('Shell', () => {
  it('implements help through the /help file', async () => {
    const help = await shell.execute('help', controller());
    const cat = await shell.execute('cat /help', controller());
    expect(help.chunks).toEqual(cat.chunks);
  });

  it('changes cwd and runs text pipelines', async () => {
    await shell.execute('cd /posts', controller());
    expect(shell.cwd).toBe('/posts');
    const result = await shell.execute(`printf '%s\\n' beta alpha beta | sort | uniq -c`, controller());
    expect(result.chunks).toEqual([{ type: 'text', value: '      1 alpha\n      2 beta\n' }]);
  });

  it('finds Markdown through a quoted glob expression', async () => {
    const result = await shell.execute(`find /posts -type f -name '*.md'`, controller());
    expect(result.chunks).toEqual([{
      type: 'text',
      value: '/posts/my notes/draft post.md\n/posts/post.md\n',
    }]);
  });

  it('returns typed command and path completion candidates', async () => {
    expect(shell.complete('re')).toEqual({
      prefix: '',
      suffix: '',
      suggestions: [{ value: 'render', kind: 'command' }],
    });

    await shell.execute('cd /posts', controller());
    expect(shell.complete('cat p')).toEqual({
      prefix: 'cat ',
      suffix: '',
      suggestions: [
        { value: 'photo.png', kind: 'file' },
        { value: 'post.md', kind: 'file' },
      ],
    });

    expect(shell.complete('cat post.md | wc', 6)).toEqual({
      prefix: 'cat ',
      suffix: ' | wc',
      suggestions: [{ value: 'post.md', kind: 'file' }],
    });
    expect(shell.complete("cat '/posts/my notes/'")).toEqual({
      prefix: 'cat ',
      suffix: '',
      suggestions: [{ value: '/posts/my notes/draft post.md', kind: 'file' }],
    });

    expect(shell.complete('ls ')).toEqual({ prefix: 'ls ', suffix: '', suggestions: [] });
    expect(shell.complete('which c')).toEqual({
      prefix: 'which ',
      suffix: '',
      suggestions: [
        { value: '/bin/cat', kind: 'executable' },
        { value: '/bin/cd', kind: 'executable' },
        { value: '/bin/clear', kind: 'executable' },
        { value: '/bin/cut', kind: 'executable' },
      ],
    });
    expect(shell.complete('cat post.md | which c').suggestions).toEqual([
      { value: '/bin/cat', kind: 'executable' },
      { value: '/bin/cd', kind: 'executable' },
      { value: '/bin/clear', kind: 'executable' },
      { value: '/bin/cut', kind: 'executable' },
    ]);
    expect(shell.complete('theme gruvbox-').suggestions).toEqual([
      { value: 'gruvbox-dark', kind: 'theme' },
      { value: 'gruvbox-light', kind: 'theme' },
    ]);
  });

  it('lists themes, emits a theme change, and accepts completed /bin paths', async () => {
    const listed = await shell.execute('theme', controller());
    expect(listed.chunks).toEqual([{ type: 'text', value: expect.stringContaining('* tokyonight-night\n') }]);

    const changed = await shell.execute('theme gruvbox-light', controller());
    expect(changed.chunks).toEqual([{ type: 'theme', name: 'gruvbox-light' }]);
    expect((await shell.execute('theme missing', controller())).exitCode).toBe(1);
    expect((await shell.execute('theme gruvbox-light | cat', controller())).exitCode).toBe(2);
    expect((await shell.execute('which /bin/cat', controller())).chunks).toEqual([
      { type: 'text', value: '/bin/cat\n' },
    ]);
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

  it('wraps short ls output into aligned terminal-width columns', async () => {
    const narrow = await shell.execute('ls /bin | cat', controller(), 24);
    expect(narrow.chunks).toHaveLength(1);
    const output = narrow.chunks[0].type === 'text' ? narrow.chunks[0].value : '';
    const lines = output.trimEnd().split('\n');
    expect(lines.slice(0, 2)).toEqual(['basename  cat', 'cd        clear']);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => terminalCellWidth(line) <= 23)).toBe(true);

    const colored = await shell.execute('ls /bin', controller(), 24);
    const coloredOutput = colored.chunks[0].type === 'ansi' ? colored.chunks[0].value : '';
    expect(coloredOutput.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')).toBe(output);

    const tiny = await shell.execute('ls /bin | cat', controller(), 5);
    const tinyOutput = tiny.chunks[0].type === 'text' ? tiny.chunks[0].value : '';
    expect(tinyOutput).toContain('basename\n');
    expect(tinyOutput).not.toContain('…');
  });

  it('keeps long ls output line-oriented', async () => {
    const result = await shell.execute('ls -l /bin | cat', controller(), 24);
    const output = result.chunks[0].type === 'text' ? result.chunks[0].value : '';
    const lines = output.trimEnd().split('\n');
    expect(lines).toHaveLength(shell.registry.names().length);
    expect(lines.every((line) => line.startsWith('-r-xr-xr-x'))).toBe(true);
  });

  it('keeps cat raw and lets render emit formula, diagram, and image chunks', async () => {
    const cat = await shell.execute('cat /posts/post.md', controller());
    expect(cat.chunks[0]).toMatchObject({ type: 'text', value: expect.stringContaining('![Photo]') });
    expect(cat.chunks[0]).toMatchObject({ type: 'text', value: expect.stringContaining(':rocket:') });

    const rendered = await shell.execute('render /posts/post.md', controller());
    expect(rendered.chunks).toContainEqual({ type: 'formula', source: 'E = mc^2', display: true });
    expect(rendered.chunks).toContainEqual({ type: 'diagram', source: 'flowchart LR\n  A --> B' });
    expect(rendered.chunks.some((chunk) => chunk.type === 'image' && chunk.source === '/photo.png')).toBe(true);
    const renderedText = rendered.chunks
      .filter((chunk) => chunk.type === 'ansi')
      .map((chunk) => chunk.value)
      .join('')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    expect(renderedText).toContain('Emoji 🚀 and 😺; code  :rocket: .');
  });

  it('opens only slide index HTML files as standalone documents', async () => {
    expect((await shell.execute('render /slide/example/index.html', controller())).chunks).toEqual([
      { type: 'document', path: '/slide/example/index.html', title: 'example' },
    ]);
    expect((await shell.execute('render /project/page.html', controller())).exitCode).toBe(2);
    expect((await shell.execute('render /slide/missing/index.html', controller())).exitCode).toBe(1);
  });

  it('exposes render instead of glow and rejects invalid or piped input', async () => {
    expect(shell.registry.get('render')).toBeDefined();
    expect(shell.registry.get('glow')).toBeUndefined();

    for (const command of [
      'render',
      'render /help',
      'render /posts/post.md /posts/post.md',
      'render /posts/post.md | grep Post',
      'cat /posts/post.md | render /posts/post.md',
    ]) {
      const result = await shell.execute(command, controller());
      expect(result.exitCode).toBe(2);
    }
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
