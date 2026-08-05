import type { VirtualFile, VirtualNode } from '../../filesystem/VirtualFileSystem';
import type { CommandContext } from '../types';

export function error(command: string, message: string): string {
  return `${command}: ${message}\n`;
}

export function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function readSources(
  paths: string[],
  stdin: string,
  context: CommandContext,
): Array<{ name: string; content: string }> {
  if (paths.length === 0) return [{ name: '', content: stdin }];
  return paths.map((path) => ({ name: path, content: context.fs.readText(path, context.cwd) }));
}

export function humanSize(size: number): string {
  if (size < 1024) return `${size}B`;
  const units = ['K', 'M', 'G'];
  let value = size;
  let unit = '';
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${unit}`;
}

export function mode(node: VirtualNode): string {
  if (node.type === 'directory') return 'dr-xr-xr-x';
  return node.executable ? '-r-xr-xr-x' : '-r--r--r--';
}

export function asFile(node: VirtualNode): VirtualFile | undefined {
  return node.type === 'file' ? node : undefined;
}

export function expandCharacterSet(source: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const start = source[index];
    if (source[index + 1] === '-' && source[index + 2]) {
      const end = source[index + 2];
      const direction = start.codePointAt(0)! <= end.codePointAt(0)! ? 1 : -1;
      for (let code = start.codePointAt(0)!; code !== end.codePointAt(0)! + direction; code += direction) {
        result.push(String.fromCodePoint(code));
      }
      index += 2;
    } else {
      result.push(start);
    }
  }
  return result;
}

export function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(value);
}
