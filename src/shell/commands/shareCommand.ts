import type { OutputChunk } from '../../types';
import { RENDER_INPUT_ERROR, resolveRenderableTarget } from '../../renderTarget';
import type { Command } from '../types';
import { error } from './utils';

function parseShareArguments(args: string[]): { path?: string; theme?: string; window?: boolean; error?: string } {
  let path: string | undefined;
  let theme: string | undefined;
  let window: boolean | undefined;
  let windowSpecified = false;

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
    } else if (argument === '--window' || argument === '-w') {
      if (windowSpecified) return { error: 'window may be specified only once' };
      window = true;
      windowSpecified = true;
    } else if (argument.startsWith('--window=')) {
      if (windowSpecified) return { error: 'window may be specified only once' };
      const value = argument.slice('--window='.length);
      if (value !== 'true' && value !== 'false') return { error: 'option \'--window\' expects true or false' };
      window = value === 'true';
      windowSpecified = true;
    } else if (argument.startsWith('-')) {
      return { error: `unknown option '${argument}'` };
    } else if (path === undefined) {
      path = argument;
    } else {
      return { error: 'expected exactly one renderable path' };
    }
  }

  return { path, theme, window };
}

function shareUrl(pageUrl: string, blogPath: string, themeName: string, window: boolean): string {
  const url = new URL(pageUrl);
  // A share link starts from the current site page, but must not inherit query
  // parameters or a hash from the terminal session that created it.
  url.search = '';
  url.hash = '';
  url.searchParams.set('blog', blogPath);
  url.searchParams.set('theme', themeName);
  if (window) url.searchParams.set('window', 'true');
  return url.toString();
}

export const shareCommand: Command = {
  name: 'share',
  description: 'Generate a shareable render URL',
  usage: 'share FILE.md|/slide/.../index.html [--theme NAME] [--window]',
  completion: 'files',
  execute(args, _stdin, context) {
    const parsed = parseShareArguments(args);
    if (parsed.error) return { stdout: '', stderr: error('share', parsed.error), exitCode: 2 };
    if (!parsed.path) return { stdout: '', stderr: error('share', 'missing renderable path'), exitCode: 2 };

    try {
      const target = resolveRenderableTarget(parsed.path, context.fs, context.cwd);
      if (!target) return { stdout: '', stderr: error('share', RENDER_INPUT_ERROR), exitCode: 2 };

      const selectedTheme = parsed.theme === undefined
        ? context.themeName
        : context.themeNames().includes(parsed.theme) ? parsed.theme : context.themeName;
      const warning = parsed.theme !== undefined && selectedTheme !== parsed.theme
        ? `share: warning: unsupported theme '${parsed.theme}'; using '${context.themeName}'\n`
        : '';
      const link = `${shareUrl(context.pageUrl, target.path, selectedTheme, parsed.window === true)}\n`;
      const chunks: OutputChunk[] | undefined = warning
        ? [{ type: 'text', value: warning }, { type: 'text', value: link }]
        : undefined;
      return { stdout: link, chunks };
    } catch (exception) {
      return { stdout: '', stderr: error('share', (exception as Error).message), exitCode: 1 };
    }
  },
};
