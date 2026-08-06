import type { OutputChunk } from '../../types';
import type { Command } from '../types';
import { error } from './utils';

function parseShareArguments(args: string[]): { path?: string; theme?: string; error?: string } {
  let path: string | undefined;
  let theme: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--theme') {
      if (theme !== undefined) return { error: 'theme may be specified only once' };
      theme = args[++index];
      if (!theme || theme.startsWith('-')) return { error: 'option \'--theme\' requires a theme name' };
    } else if (argument.startsWith('--theme=')) {
      if (theme !== undefined) return { error: 'theme may be specified only once' };
      theme = argument.slice('--theme='.length);
      if (!theme) return { error: 'option \'--theme\' requires a theme name' };
    } else if (argument.startsWith('-')) {
      return { error: `unknown option '${argument}'` };
    } else if (path === undefined) {
      path = argument;
    } else {
      return { error: 'expected exactly one post path' };
    }
  }

  return { path, theme };
}

function shareUrl(pageUrl: string, blogPath: string, themeName: string): string {
  const url = new URL(pageUrl);
  // A share link starts from the current site page, but must not inherit an old
  // blog/theme query or hash from the terminal session that created it.
  url.search = '';
  url.hash = '';
  url.searchParams.set('blog', blogPath);
  url.searchParams.set('theme', themeName);
  return url.toString();
}

export const shareCommand: Command = {
  name: 'share',
  description: 'Generate a shareable post URL',
  usage: 'share POST.md [--theme NAME]',
  completion: 'files',
  execute(args, _stdin, context) {
    const parsed = parseShareArguments(args);
    if (parsed.error) return { stdout: '', stderr: error('share', parsed.error), exitCode: 2 };
    if (!parsed.path) return { stdout: '', stderr: error('share', 'missing post path'), exitCode: 2 };

    const blogPath = context.fs.normalize(parsed.path, context.cwd);
    if (!/^\/post\/.+\.md$/i.test(blogPath)) {
      return { stdout: '', stderr: error('share', 'path must be a Markdown post under /post'), exitCode: 2 };
    }
    try {
      const node = context.fs.require(blogPath);
      if (node.type !== 'file' || node.mime !== 'text/markdown') {
        return { stdout: '', stderr: error('share', `${parsed.path}: not a Markdown post`), exitCode: 2 };
      }

      const selectedTheme = parsed.theme === undefined
        ? context.themeName
        : context.themeNames().includes(parsed.theme) ? parsed.theme : context.themeName;
      const warning = parsed.theme !== undefined && selectedTheme !== parsed.theme
        ? `share: warning: unsupported theme '${parsed.theme}'; using '${context.themeName}'\n`
        : '';
      const link = `${shareUrl(context.pageUrl, blogPath, selectedTheme)}\n`;
      const chunks: OutputChunk[] | undefined = warning
        ? [{ type: 'text', value: warning }, { type: 'text', value: link }]
        : undefined;
      return { stdout: link, chunks };
    } catch (exception) {
      return { stdout: '', stderr: error('share', (exception as Error).message), exitCode: 1 };
    }
  },
};
