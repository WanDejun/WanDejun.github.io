import { TerminalMarkdownRenderer } from '../../markdown/TerminalMarkdownRenderer';
import { RENDER_INPUT_ERROR, resolveRenderableTarget } from '../../renderTarget';
import type { Command } from '../types';
import { error } from './utils';

const renderer = new TerminalMarkdownRenderer();

export const renderCommand: Command = {
  name: 'render',
  description: 'Render Markdown or open a slide document',
  usage: 'render [--window] FILE.md|/slide/NAME/index.html',
  completion: 'files',
  execute(args, _stdin, context) {
    if (!context.isStandalone) {
      return { stdout: '', stderr: error('render', 'cannot be used in a pipeline'), exitCode: 2 };
    }
    const windowed = args.filter((arg) => arg === '--window' || arg === '-w').length > 0;
    const paths = args.filter((arg) => arg !== '--window' && arg !== '-w');
    if (paths.length !== 1) {
      return { stdout: '', stderr: error('render', 'expected exactly one renderable file'), exitCode: 2 };
    }
    const path = paths[0];

    try {
      const target = resolveRenderableTarget(path, context.fs, context.cwd);
      if (!target) {
        return { stdout: '', stderr: error('render', RENDER_INPUT_ERROR), exitCode: 2 };
      }
      if (target.type === 'markdown') {
        if (windowed) {
          return {
            stdout: '',
            chunks: [{ type: 'markdown-document', path: target.path, title: target.path.split('/').at(-1) ?? 'document' }],
          };
        }
        return { stdout: '', chunks: renderer.render(target.source, target.path, context) };
      }
      return { stdout: '', chunks: [{ type: 'document', path: target.path, title: target.title }] };
    } catch (exception) {
      return { stdout: '', stderr: error('render', (exception as Error).message), exitCode: 1 };
    }
  },
};
