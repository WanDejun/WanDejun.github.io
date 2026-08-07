import { basename, dirname, type VirtualFileSystem } from '../filesystem/VirtualFileSystem';

export type ResolvedMarkdownImage =
  | { source: string; name: string; error?: never }
  | { source?: never; name?: never; error: string };

export function resolveMarkdownImage(
  href: string,
  sourcePath: string,
  fs: VirtualFileSystem,
): ResolvedMarkdownImage {
  const name = basename(href) || 'image';
  if (/^https?:\/\//i.test(href)) return { source: href, name };
  if (/^[a-z]+:/i.test(href)) return { error: 'unsupported URL scheme' };
  try {
    // Markdown image paths are relative to the document, not to the shell cwd.
    const path = fs.normalize(href, dirname(sourcePath));
    const node = fs.require(path);
    if (node.type !== 'file' || !node.mime.startsWith('image/')) {
      return { error: 'not a supported image file' };
    }
    return { source: fs.imageSource(path), name };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
