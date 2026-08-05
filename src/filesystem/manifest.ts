import type { ManifestFile } from '../types';

// content/ is a text-only mirror of the virtual root. Adding content/foo creates /foo.
const contentSources = import.meta.glob('/content/**/*', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

// Keep URL and raw-text views separate: binary assets need emitted Vite URLs, while
// shell commands need source text without an extra network request.
const blogUrls = import.meta.glob('/blogs/**/*', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const blogText = import.meta.glob('/blogs/**/*.{md,markdown,txt,json,toml,yaml,yml,csv}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const encoder = new TextEncoder();

function mimeFor(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({
    md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', json: 'application/json',
    toml: 'application/toml', yaml: 'text/yaml', yml: 'text/yaml', csv: 'text/csv',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
}

export function buildManifest(): ManifestFile[] {
  const content = Object.entries(contentSources).map(([sourcePath, value]) => ({
    path: sourcePath.replace(/^\/content/, '') || '/',
    content: value,
    size: encoder.encode(value).byteLength,
    mime: mimeFor(sourcePath),
  }));

  const blogs = Object.entries(blogUrls).map(([path, url]) => {
    const text = blogText[path];
    // Text files retain their emitted URL too, so future commands can link to them.
    return {
      path,
      ...(text === undefined ? { url } : { content: text, url }),
      size: text === undefined ? 0 : encoder.encode(text).byteLength,
      mime: mimeFor(path),
    };
  });

  return [...content, ...blogs];
}
