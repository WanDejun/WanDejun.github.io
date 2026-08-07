import { beforeEach, describe, expect, it } from 'vitest';
import { theme, themeNames } from '../src/config';
import { VirtualFileSystem } from '../src/filesystem/VirtualFileSystem';
import { createRegistry } from '../src/shell/createRegistry';
import { ansi } from '../src/shell/ansi';
import { terminalCellWidth } from '../src/shell/columnLayout';
import { Shell } from '../src/shell/Shell';

const controller = () => new AbortController().signal;
const aboutSource = '# About Me\n\nProfile text.\n';
const postSource = `# Post

### Deep heading

1. Parent line
   continuation line

   Second paragraph.

   - Nested child
2. Last item

- [ ] Pending task
- [x] Completed task

$$
E = mc^2
$$

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

![Photo](./photo.png)

Emoji :rocket: and 😺; code \`:rocket:\`.
`;
let shell: Shell;

beforeEach(() => {
  const registry = createRegistry();
  const fs = new VirtualFileSystem([
    { path: '/static/about_me.md', content: aboutSource, size: new TextEncoder().encode(aboutSource).byteLength, mime: 'text/markdown' },
    { path: '/static/help', content: 'Use help.\n', size: 10, mime: 'text/plain' },
    { path: '/post/post.md', content: postSource, size: new TextEncoder().encode(postSource).byteLength, mime: 'text/markdown', url: '/post.md' },
    { path: '/post/photo.png', size: 12, mime: 'image/png', url: '/photo.png' },
    { path: '/post/my notes/draft post.md', content: '# Draft\n', size: 8, mime: 'text/markdown' },
    { path: '/project/page.html', content: '<h1>Project</h1>', size: 16, mime: 'text/html' },
    { path: '/slide/example/index.html', content: '<h1>Slides</h1>', size: 15, mime: 'text/html' },
  ], registry.names());
  shell = new Shell(fs, registry, theme, 'tokyonight-night', themeNames, 'https://example.com/home/?old=value#section');
});

describe('Shell', () => {
  it('implements help through the /static/help file', async () => {
    const help = await shell.execute('help', controller());
    const cat = await shell.execute('cat /static/help', controller());
    expect(help.chunks).toEqual(cat.chunks);
  });

  it('renders the root about page from every working directory', async () => {
    const direct = await shell.execute('render /static/about_me.md', controller());
    await shell.execute('cd /post', controller());
    expect((await shell.execute('about_me', controller())).chunks).toEqual(direct.chunks);
    expect((await shell.execute('about_me unexpected', controller())).exitCode).toBe(2);
    expect((await shell.execute('about_me | cat', controller())).exitCode).toBe(2);
  });

  it('changes cwd and runs text pipelines', async () => {
    await shell.execute('cd /post', controller());
    expect(shell.cwd).toBe('/post');
    const result = await shell.execute(`printf '%s\\n' beta alpha beta | sort | uniq -c`, controller());
    expect(result.chunks).toEqual([{ type: 'text', value: '      1 alpha\n      2 beta\n' }]);
  });

  it('finds Markdown through a quoted glob expression', async () => {
    const result = await shell.execute(`find /post -type f -name '*.md'`, controller());
    expect(result.chunks).toEqual([{
      type: 'text',
      value: '/post/my notes/draft post.md\n/post/post.md\n',
    }]);
  });

  it('returns typed command and path completion candidates', async () => {
    expect(shell.complete('re')).toEqual({
      prefix: '',
      suffix: '',
      suggestions: [{ value: 'render', kind: 'command' }],
    });

    await shell.execute('cd /post', controller());
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
    expect(shell.complete("cat '/post/my notes/'")).toEqual({
      prefix: 'cat ',
      suffix: '',
      suggestions: [{ value: '/post/my notes/draft post.md', kind: 'file' }],
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

  it('generates share links with the current or requested theme', async () => {
    expect((await shell.execute('share /post/post.md', controller())).chunks).toEqual([{
      type: 'text',
      value: 'https://example.com/home/?blog=%2Fpost%2Fpost.md&theme=tokyonight-night\n',
    }]);
    expect((await shell.execute('share /post/post.md --theme gruvbox-light', controller())).chunks).toEqual([{
      type: 'text',
      value: 'https://example.com/home/?blog=%2Fpost%2Fpost.md&theme=gruvbox-light\n',
    }]);
  });

  it('warns and falls back when a share theme is unsupported', async () => {
    const result = await shell.execute('share /post/post.md --theme missing', controller());
    expect(result.exitCode).toBe(0);
    expect(result.chunks).toEqual([
      { type: 'text', value: "share: warning: unsupported theme 'missing'; using 'tokyonight-night'\n" },
      { type: 'text', value: 'https://example.com/home/?blog=%2Fpost%2Fpost.md&theme=tokyonight-night\n' },
    ]);

    const piped = await shell.execute('share /post/post.md --theme missing | cat', controller());
    expect(piped.chunks).toEqual([{
      type: 'text',
      value: 'https://example.com/home/?blog=%2Fpost%2Fpost.md&theme=tokyonight-night\n',
    }]);
  });

  it('rejects non-post share targets and malformed options', async () => {
    expect((await shell.execute('share /project/page.html', controller())).exitCode).toBe(2);
    expect((await shell.execute('share /post/post.md --theme', controller())).exitCode).toBe(2);
    expect((await shell.execute('share /post/post.md --unknown', controller())).exitCode).toBe(2);
  });

  it('colors directories, executables, and regular files without polluting pipes', async () => {
    const root = await shell.execute('ls /', controller());
    expect(root.chunks).toEqual([{ type: 'ansi', value: expect.any(String) }]);
    const rootOutput = root.chunks[0].type === 'ansi' ? root.chunks[0].value : '';
    expect(rootOutput).toContain(`${ansi.color(theme.terminal.blue!)}bin/`);
    expect(rootOutput).toContain(`${ansi.color(theme.terminal.blue!)}static/`);

    const staticFiles = await shell.execute('ls /static', controller());
    const staticOutput = staticFiles.chunks[0].type === 'ansi' ? staticFiles.chunks[0].value : '';
    expect(staticOutput).toContain(`${ansi.color(theme.terminal.white!)}help`);

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
    expect(lines.slice(0, 2)).toEqual(['about_me  basename', 'cat       cd']);
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
    const cat = await shell.execute('cat /post/post.md', controller());
    expect(cat.chunks[0]).toMatchObject({ type: 'text', value: expect.stringContaining('![Photo]') });
    expect(cat.chunks[0]).toMatchObject({ type: 'text', value: expect.stringContaining(':rocket:') });

    const rendered = await shell.execute('render /post/post.md', controller());
    expect(rendered.chunks).toContainEqual({ type: 'formula', source: 'E = mc^2', display: true });
    expect(rendered.chunks).toContainEqual({ type: 'diagram', source: 'flowchart LR\n  A --> B' });
    expect(rendered.chunks.some((chunk) => chunk.type === 'image' && chunk.source === '/photo.png')).toBe(true);
    const renderedText = rendered.chunks
      .filter((chunk) => chunk.type === 'ansi')
      .map((chunk) => chunk.value)
      .join('')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    expect(renderedText).toContain('Emoji 🚀 and 😺; code  :rocket: .');
    expect(renderedText).toContain('  ▹ Deep heading');
    expect(renderedText).toContain([
      '1. Parent line',
      '   continuation line',
      '',
      '   Second paragraph.',
      '',
      '   • Nested child',
      '2. Last item',
      '',
      '[ ] Pending task',
      '[x] Completed task',
    ].join('\n'));
  });

  it('opens only slide index HTML files as standalone documents', async () => {
    expect((await shell.execute('render --window /post/post.md', controller())).chunks).toEqual([
      { type: 'markdown-document', path: '/post/post.md', title: 'post.md' },
    ]);
    expect((await shell.execute('render /post/post.md -w', controller())).chunks).toEqual([
      { type: 'markdown-document', path: '/post/post.md', title: 'post.md' },
    ]);
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
      'render /static/help',
      'render /post/post.md /post/post.md',
      'render --window /post/post.md | cat',
      'render /post/post.md | grep Post',
      'cat /post/post.md | render /post/post.md',
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
