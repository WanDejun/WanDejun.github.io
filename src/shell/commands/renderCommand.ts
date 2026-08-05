import { TerminalMarkdownRenderer } from '../../markdown/TerminalMarkdownRenderer';
import type { Command } from '../types';
import { error } from './utils';

const renderer = new TerminalMarkdownRenderer();

export const renderCommand: Command = {
  name: 'render',
  description: 'Render a Markdown file in the terminal',
  usage: 'render FILE.md',
  execute(args, _stdin, context) {
    if (!context.isStandalone) {
      return { stdout: '', stderr: error('render', 'cannot be used in a pipeline'), exitCode: 2 };
    }
    if (args.length !== 1) {
      return { stdout: '', stderr: error('render', 'expected exactly one Markdown file'), exitCode: 2 };
    }
    const path = args[0];
    if (!path.toLowerCase().endsWith('.md')) {
      return { stdout: '', stderr: error('render', 'input must be a .md file'), exitCode: 2 };
    }

    try {
      const source = context.fs.readText(path, context.cwd);
      const sourcePath = context.fs.normalize(path, context.cwd);
      const rendered = renderer.render(source, sourcePath, context);
      return { stdout: rendered.plainText, chunks: rendered.chunks };
    } catch (exception) {
      return { stdout: '', stderr: error('render', (exception as Error).message), exitCode: 1 };
    }
  },
};
