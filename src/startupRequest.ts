import { dirname, type VirtualFileSystem } from './filesystem/VirtualFileSystem';

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
  };
}

function resolveBlogParameter(parameters: URLSearchParams, fs: VirtualFileSystem): BlogRequest {
  if (!parameters.has('blog')) return { type: 'default' };

  const path = fs.normalize(parameters.get('blog') ?? '');
  if (!path.startsWith('/post/')) return { type: 'not-found' };
  try {
    const node = fs.require(path);
    if (node.type !== 'file' || node.mime !== 'text/markdown') return { type: 'not-found' };
    return { type: 'found', path, cwd: dirname(path) };
  } catch {
    return { type: 'not-found' };
  }
}
