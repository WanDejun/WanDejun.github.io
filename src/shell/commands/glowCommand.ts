import { TerminalMarkdownRenderer } from '../../markdown/TerminalMarkdownRenderer';
import type { Command } from '../types';
import { error } from './utils';

const renderer = new TerminalMarkdownRenderer();

export const glowCommand: Command = {
  name: 'glow',
  description: 'Render Markdown in the terminal',
  usage: 'glow FILE.md',
  execute(args, stdin, context) {
    if (args.length > 1) return { stdout: '', stderr: error('glow', 'expected one Markdown file'), exitCode: 2 };
    const path = args[0];
    if (!path && !stdin) return { stdout: '', stderr: error('glow', 'missing Markdown input'), exitCode: 1 };
    try {
      const source = path ? context.fs.readText(path, context.cwd) : stdin;
      const sourcePath = path ? context.fs.normalize(path, context.cwd) : context.fs.normalize('stdin.md', context.cwd);
      const rendered = renderer.render(source, sourcePath, context);
      return {
        stdout: rendered.plainText,
        chunks: context.isFinal ? rendered.chunks : undefined,
      };
    } catch (exception) {
      return { stdout: '', stderr: error('glow', (exception as Error).message), exitCode: 1 };
    }
  },
};
