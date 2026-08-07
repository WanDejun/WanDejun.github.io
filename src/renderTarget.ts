import type { VirtualFileSystem } from './filesystem/VirtualFileSystem';

export type RenderableTarget =
  | { type: 'markdown'; path: string; source: string }
  | { type: 'slide'; path: string; title: string };

export const RENDER_INPUT_ERROR = 'input must be a .md file or /slide/.../index.html';

export function resolveRenderableTarget(
  input: string,
  fs: VirtualFileSystem,
  cwd = '/',
): RenderableTarget | undefined {
  const path = fs.normalize(input, cwd);
  if (path.toLowerCase().endsWith('.md')) {
    return { type: 'markdown', path, source: fs.readText(path) };
  }
  if (!/^\/slide\/(?:.+\/)?index\.html$/i.test(path)) return undefined;

  const node = fs.require(path);
  if (node.type !== 'file' || node.mime !== 'text/html') return undefined;
  return { type: 'slide', path, title: path.split('/').at(-2) ?? 'slide' };
}
