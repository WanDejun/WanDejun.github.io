import type { ManifestFile } from '../types';

export type VirtualNode = VirtualDirectory | VirtualFile;

export interface VirtualDirectory {
  type: 'directory';
  path: string;
  name: string;
  size: 0;
}

export interface VirtualFile {
  type: 'file';
  path: string;
  name: string;
  size: number;
  mime: string;
  content?: string;
  url?: string;
  executable: boolean;
}

export class FileSystemError extends Error {
  constructor(
    message: string,
    readonly code: 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EBINARY',
  ) {
    super(message);
  }
}

export function basename(path: string): string {
  if (path === '/') return '/';
  return path.slice(path.lastIndexOf('/') + 1);
}

export function dirname(path: string): string {
  if (path === '/') return '/';
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

export function globToRegExp(pattern: string): RegExp {
  let result = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const next = pattern[index + 1];
    if (character === '*' && next === '*') {
      // Treat **/ as zero or more complete path segments; plain ** may cross '/'.
      if (pattern[index + 2] === '/') {
        result += '(?:.*/)?';
        index += 2;
      } else {
        result += '.*';
        index += 1;
      }
    } else if (character === '*') {
      result += '[^/]*';
    } else if (character === '?') {
      result += '[^/]';
    } else if (character === '[') {
      const close = pattern.indexOf(']', index + 1);
      if (close !== -1) {
        const content = pattern.slice(index + 1, close).replace(/^!/, '^');
        result += `[${content}]`;
        index = close;
      } else {
        result += '\\[';
      }
    } else {
      result += character.replace(/[.+^${}()|\\]/g, '\\$&');
    }
  }
  return new RegExp(`${result}$`);
}

export class VirtualFileSystem {
  private readonly nodes = new Map<string, VirtualNode>();

  constructor(files: ManifestFile[] = [], commands: string[] = []) {
    this.addDirectory('/');
    this.addDirectory('/bin');
    // /bin is derived from the registry, keeping command discovery and execution in sync.
    for (const command of commands) {
      this.addFile({
        path: `/bin/${command}`,
        content: `${command}: virtual shell command\n`,
        size: command.length + 24,
        mime: 'text/plain',
      }, true);
    }
    files.forEach((file) => this.addFile(file));
  }

  normalize(path: string, cwd = '/'): string {
    if (!path || path === '.') return cwd;
    const expanded = path === '~' ? '/' : path.startsWith('~/') ? path.slice(1) : path;
    const source = expanded.startsWith('/') ? expanded : `${cwd}/${expanded}`;
    const parts: string[] = [];
    // Popping an empty array makes attempts to traverse above / stay at /.
    for (const part of source.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return `/${parts.join('/')}`;
  }

  get(path: string, cwd = '/'): VirtualNode | undefined {
    return this.nodes.get(this.normalize(path, cwd));
  }

  require(path: string, cwd = '/'): VirtualNode {
    const normalized = this.normalize(path, cwd);
    const node = this.nodes.get(normalized);
    if (!node) throw new FileSystemError(`${path}: No such file or directory`, 'ENOENT');
    return node;
  }

  readText(path: string, cwd = '/'): string {
    const node = this.require(path, cwd);
    if (node.type === 'directory') throw new FileSystemError(`${path}: Is a directory`, 'EISDIR');
    if (node.content === undefined) throw new FileSystemError(`${path}: Binary file`, 'EBINARY');
    return node.content;
  }

  list(path: string, cwd = '/'): VirtualNode[] {
    const normalized = this.normalize(path, cwd);
    const node = this.require(normalized);
    if (node.type !== 'directory') return [node];
    return [...this.nodes.values()]
      .filter((candidate) => candidate.path !== normalized && dirname(candidate.path) === normalized)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  descendants(path: string, cwd = '/'): VirtualNode[] {
    const normalized = this.normalize(path, cwd);
    const node = this.require(normalized);
    if (node.type !== 'directory') return [node];
    const prefix = normalized === '/' ? '/' : `${normalized}/`;
    return [...this.nodes.values()]
      .filter((candidate) => candidate.path.startsWith(prefix) && candidate.path !== normalized)
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  expand(pattern: string, cwd = '/'): string[] {
    if (!/[?*[]/.test(pattern)) return [pattern];
    const normalizedPattern = this.normalize(pattern, cwd);
    const matcher = globToRegExp(normalizedPattern);
    const matches = [...this.nodes.keys()].filter((path) => matcher.test(path)).sort();
    // Like a shell without nullglob, preserve an unmatched pattern literally.
    return matches.length > 0 ? matches : [pattern];
  }

  imageSource(path: string, cwd = '/'): string {
    const node = this.require(path, cwd);
    if (node.type !== 'file' || !node.url) {
      throw new FileSystemError(`${path}: Not an image asset`, 'EBINARY');
    }
    return node.url;
  }

  allPaths(): string[] {
    return [...this.nodes.keys()].sort();
  }

  private addFile(file: ManifestFile, executable = false): void {
    const path = this.normalize(file.path);
    const segments = path.split('/').filter(Boolean);
    // The manifest only contains files, so synthesize every parent directory here.
    for (let index = 1; index < segments.length; index += 1) {
      this.addDirectory(`/${segments.slice(0, index).join('/')}`);
    }
    this.nodes.set(path, {
      type: 'file',
      path,
      name: basename(path),
      size: file.size,
      mime: file.mime,
      content: file.content,
      url: file.url,
      executable,
    });
  }

  private addDirectory(path: string): void {
    const normalized = this.normalize(path);
    if (this.nodes.has(normalized)) return;
    this.nodes.set(normalized, {
      type: 'directory',
      path: normalized,
      name: basename(normalized),
      size: 0,
    });
  }
}
