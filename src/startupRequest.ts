import { dirname, type VirtualFileSystem } from './filesystem/VirtualFileSystem';
import { resolveRenderableTarget } from './renderTarget';

export const BLOG_NOT_FOUND = [
  ' _  _    ___  _  _',
  '| || |  / _ \\| || |',
  '| || |_| | | | || |_',
  '|__   _| |_| |__   _|',
  '   |_|  \\___/   |_|',
].join('\n');

export type BlogRequest =
  | { type: 'default' }
  | { type: 'found'; path: string; cwd: string }
  | { type: 'not-found' };

export interface StartupRequest {
  blog: BlogRequest;
  themeName: string;
  window: boolean;
}

export function resolveStartupRequest(
  search: string,
  fs: VirtualFileSystem,
  defaultTheme: string,
  availableThemes: readonly string[],
): StartupRequest {
  const parameters = new URLSearchParams(search);
  const requestedTheme = parameters.get('theme');
  return {
    blog: resolveBlogParameter(parameters, fs),
    themeName: requestedTheme && availableThemes.includes(requestedTheme)
      ? requestedTheme
      : defaultTheme,
    window: parameters.get('window') === 'true',
  };
}

function resolveBlogParameter(parameters: URLSearchParams, fs: VirtualFileSystem): BlogRequest {
  if (!parameters.has('blog')) return { type: 'default' };

  try {
    const target = resolveRenderableTarget(parameters.get('blog') ?? '', fs);
    return target ? { type: 'found', path: target.path, cwd: dirname(target.path) } : { type: 'not-found' };
  } catch {
    return { type: 'not-found' };
  }
}
