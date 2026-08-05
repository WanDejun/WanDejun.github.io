import { TerminalMarkdownRenderer } from '../../markdown/TerminalMarkdownRenderer';
import type { Command } from '../types';
import { error } from './utils';

const renderer = new TerminalMarkdownRenderer();

export const renderCommand: Command = {
  name: 'render',
  description: 'Render Markdown or open a slide document',
  usage: 'render FILE.md|/slide/NAME/index.html',
  completion: 'files',
  execute(args, _stdin, context) {
    if (!context.isStandalone) {
      return { stdout: '', stderr: error('render', 'cannot be used in a pipeline'), exitCode: 2 };
    }
    if (args.length !== 1) {
      return { stdout: '', stderr: error('render', 'expected exactly one renderable file'), exitCode: 2 };
    }
    const path = args[0];

    try {
      const sourcePath = context.fs.normalize(path, context.cwd);
      if (sourcePath.toLowerCase().endsWith('.md')) {
        const source = context.fs.readText(sourcePath);
        return { stdout: '', chunks: renderer.render(source, sourcePath, context) };
      }
      if (/^\/slide\/(?:.+\/)?index\.html$/i.test(sourcePath)) {
        const node = context.fs.require(sourcePath);
        if (node.type !== 'file' || node.mime !== 'text/html') {
          return { stdout: '', stderr: error('render', `${path}: not an HTML file`), exitCode: 2 };
        }
        return {
          stdout: '',
          chunks: [{ type: 'document', path: sourcePath, title: sourcePath.split('/').at(-2) ?? 'slide' }],
        };
      }
      return {
        stdout: '',
        stderr: error('render', 'input must be a .md file or /slide/.../index.html'),
        exitCode: 2,
      };
    } catch (exception) {
      return { stdout: '', stderr: error('render', (exception as Error).message), exitCode: 1 };
    }
  },
};
