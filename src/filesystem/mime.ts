const mimeByExtension: Record<string, string> = {
  css: 'text/css',
  csv: 'text/csv',
  eot: 'application/vnd.ms-fontobject',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  markdown: 'text/markdown',
  md: 'text/markdown',
  mjs: 'text/javascript',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  toml: 'application/toml',
  ttf: 'font/ttf',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  yaml: 'text/yaml',
  yml: 'text/yaml',
};

export function mimeForPath(path: string, fallback = 'application/octet-stream'): string {
  const extension = path.split('.').pop()?.toLowerCase();
  return mimeByExtension[extension ?? ''] ?? fallback;
}

export function responseMimeForPath(path: string): string {
  const mime = mimeForPath(path);
  const needsCharset = mime.startsWith('text/')
    || ['application/json', 'application/toml', 'image/svg+xml'].includes(mime);
  return needsCharset ? `${mime}; charset=utf-8` : mime;
}
