import type { ManifestFile } from '../types';
import { mimeForPath } from './mime';

// Every content file is exposed at the virtual root. URL and text views stay
// separate so binary assets remain intact while shell commands can read source.
const contentUrls = import.meta.glob('/content/**/*', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const typedContentText = import.meta.glob('/content/**/*.{md,markdown,txt,html,htm,css,js,mjs,json,toml,yaml,yml,csv,svg}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const extensionlessContentText = import.meta.glob(['/content/**/*', '!/content/**/*.*'], {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const contentText = { ...typedContentText, ...extensionlessContentText };

const encoder = new TextEncoder();

function virtualPath(sourcePath: string): string {
  const contentPath = sourcePath.replace(/^\/content/, '') || '/';
  // The repository groups articles under content/posts, while the public shell
  // uses the shorter singular /post path used by shareable blog URLs.
  return contentPath.replace(/^\/posts(?=\/|$)/, '/post');
}

export function buildManifest(): ManifestFile[] {
  return Object.entries(contentUrls).map(([sourcePath, url]) => {
    const text = contentText[sourcePath];
    return {
      path: virtualPath(sourcePath),
      ...(text === undefined ? { url } : { content: text, url }),
      size: text === undefined ? 0 : encoder.encode(text).byteLength,
      mime: mimeForPath(sourcePath, text === undefined ? 'application/octet-stream' : 'text/plain'),
    };
  });
}
