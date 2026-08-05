import { basename as pathBasename, dirname as pathDirname } from '../../filesystem/VirtualFileSystem';
import type { VirtualNode } from '../../filesystem/VirtualFileSystem';
import { paint } from '../ansi';
import { columnRows, formatColumnRow, measureColumns, terminalCellWidth } from '../columnLayout';
import type { Command, CommandContext } from '../types';
import { error, humanSize, mode, readSources, splitLines, wildcardMatch } from './utils';

function nodeColor(node: VirtualNode, context: CommandContext): string {
  if (node.type === 'directory') return context.theme.terminal.blue ?? '#7aa2f7';
  if (node.executable) return context.theme.terminal.green ?? '#9ece6a';
  return context.theme.terminal.white ?? '#a9b1d6';
}

function nodeName(node: VirtualNode): string {
  return `${node.name}${node.type === 'directory' ? '/' : ''}`;
}

function coloredNodeName(node: VirtualNode, context: CommandContext): string {
  return paint(nodeName(node), nodeColor(node, context));
}

function columnarNodeNames(entries: VirtualNode[], context: CommandContext): { plain: string; colored: string } {
  const names = entries.map(nodeName);
  const metrics = measureColumns(names, Math.max(1, context.columns - 1));
  // A single overlong name remains complete; truncation is appropriate for a picker, not for ls.
  const columnWidth = metrics.columnCount === 1
    ? Math.max(metrics.columnWidth, ...names.map(terminalCellWidth))
    : metrics.columnWidth;
  const rows = columnRows(entries, metrics.columnCount);
  return {
    plain: rows.map((row) => formatColumnRow(row, columnWidth, nodeName)).join('\n'),
    colored: rows.map((row) => formatColumnRow(
      row,
      columnWidth,
      nodeName,
      (text, entry) => paint(text, nodeColor(entry, context)),
    )).join('\n'),
  };
}

export const catCommand: Command = {
  name: 'cat', description: 'Concatenate files', usage: 'cat [-n] [FILE ...]',
  execute(args, stdin, context) {
    const numbered = args[0] === '-n';
    const paths = numbered ? args.slice(1) : args;
    try {
      const sources = readSources(paths, stdin, context);
      let lineNumber = 1;
      const stdout = sources.map(({ content }) => {
        if (!numbered) return content;
        return content.split(/(?<=\n)/).map((line) => `${String(lineNumber++).padStart(6)}\t${line}`).join('');
      }).join('');
      return { stdout };
    } catch (exception) {
      return { stdout: '', stderr: error('cat', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const lsCommand: Command = {
  name: 'ls', description: 'List directory contents', usage: 'ls [-alh] [PATH ...]',
  execute(args, _stdin, context) {
    let all = false; let long = false; let human = false;
    const paths: string[] = [];
    for (const arg of args) {
      if (arg.startsWith('-') && arg !== '-') {
        all ||= arg.includes('a'); long ||= arg.includes('l'); human ||= arg.includes('h');
        if ([...arg.slice(1)].some((flag) => !'alh'.includes(flag))) {
          return { stdout: '', stderr: error('ls', `invalid option -- '${arg}'`), exitCode: 2 };
        }
      } else paths.push(arg);
    }
    const targets = paths.length ? paths : ['.'];
    const blocks: string[] = [];
    const coloredBlocks: string[] = [];
    try {
      for (const target of targets) {
        const node = context.fs.require(target, context.cwd);
        let entries = node.type === 'directory' ? context.fs.list(target, context.cwd) : [node];
        if (!all) entries = entries.filter((entry) => !entry.name.startsWith('.'));
        const heading = targets.length > 1 ? `${target}:\n` : '';
        const coloredHeading = targets.length > 1 ? `${paint(target, nodeColor(node, context))}:\n` : '';
        if (long) {
          blocks.push(`${heading}${entries.map((entry) => `${mode(entry)}  ${String(entry.size).padStart(8)} ${human ? humanSize(entry.size).padStart(6) : ''} ${nodeName(entry)}`.replace(/ +$/g, '')).join('\n')}`);
          coloredBlocks.push(`${coloredHeading}${entries.map((entry) => `${mode(entry)}  ${String(entry.size).padStart(8)} ${human ? humanSize(entry.size).padStart(6) : ''} ${coloredNodeName(entry, context)}`.replace(/ +$/g, '')).join('\n')}`);
        } else {
          const listing = columnarNodeNames(entries, context);
          blocks.push(`${heading}${listing.plain}`);
          coloredBlocks.push(`${coloredHeading}${listing.colored}`);
        }
      }
      const suffix = blocks.some(Boolean) ? '\n' : '';
      const stdout = `${blocks.join('\n\n')}${suffix}`;
      const coloredOutput = `${coloredBlocks.join('\n\n')}${suffix}`;
      return {
        stdout,
        chunks: context.isFinal ? [{ type: 'ansi', value: coloredOutput }] : undefined,
      };
    } catch (exception) {
      return { stdout: '', stderr: error('ls', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const treeCommand: Command = {
  name: 'tree', description: 'Display a directory tree', usage: 'tree [-a] [-L LEVEL] [PATH]',
  execute(args, _stdin, context) {
    let includeHidden = false; let maxDepth = Number.POSITIVE_INFINITY; let target = '.';
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '-a') includeHidden = true;
      else if (arg === '-L') maxDepth = Number.parseInt(args[++index] ?? '', 10);
      else if (!arg.startsWith('-')) target = arg;
      else return { stdout: '', stderr: error('tree', `invalid option '${arg}'`), exitCode: 2 };
    }
    if (!(maxDepth >= 0)) return { stdout: '', stderr: error('tree', 'invalid level'), exitCode: 2 };
    try {
      const root = context.fs.require(target, context.cwd);
      const lines = [root.path];
      const coloredLines = [paint(root.path, nodeColor(root, context))];
      let directories = root.type === 'directory' ? 1 : 0; let files = root.type === 'file' ? 1 : 0;
      const visit = (path: string, prefix: string, depth: number) => {
        if (depth > maxDepth) return;
        let entries = context.fs.list(path);
        if (!includeHidden) entries = entries.filter((entry) => !entry.name.startsWith('.'));
        entries.forEach((entry, index) => {
          const last = index === entries.length - 1;
          lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}${entry.type === 'directory' ? '/' : ''}`);
          coloredLines.push(`${prefix}${last ? '└── ' : '├── '}${coloredNodeName(entry, context)}`);
          if (entry.type === 'directory') {
            directories += 1;
            visit(entry.path, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
          } else files += 1;
        });
      };
      if (root.type === 'directory') visit(root.path, '', 1);
      const summary = `${directories} director${directories === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`;
      lines.push('', summary);
      coloredLines.push('', summary);
      return {
        stdout: `${lines.join('\n')}\n`,
        chunks: context.isFinal ? [{ type: 'ansi', value: `${coloredLines.join('\n')}\n` }] : undefined,
      };
    } catch (exception) {
      return { stdout: '', stderr: error('tree', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const findCommand: Command = {
  name: 'find', description: 'Search for files', usage: 'find [PATH] [-type f|d] [-name PATTERN]',
  execute(args, _stdin, context) {
    let target = '.'; let type: 'f' | 'd' | undefined; let namePattern: string | undefined;
    let index = 0;
    if (args[0] && !args[0].startsWith('-')) { target = args[0]; index = 1; }
    while (index < args.length) {
      if (args[index] === '-type' && ['f', 'd'].includes(args[index + 1])) type = args[++index] as 'f' | 'd';
      else if (args[index] === '-name' && args[index + 1]) namePattern = args[++index];
      else return { stdout: '', stderr: error('find', `unsupported expression '${args[index]}'`), exitCode: 2 };
      index += 1;
    }
    try {
      const root = context.fs.require(target, context.cwd);
      return {
        stdout: [root, ...context.fs.descendants(target, context.cwd)]
          .filter((node) => !type || (type === 'f' ? node.type === 'file' : node.type === 'directory'))
          .filter((node) => !namePattern || wildcardMatch(node.name, namePattern))
          .map((node) => node.path).join('\n') + '\n',
      };
    } catch (exception) {
      return { stdout: '', stderr: error('find', (exception as Error).message), exitCode: 1 };
    }
  },
};

function headTail(command: 'head' | 'tail'): Command {
  return {
    name: command, description: `${command === 'head' ? 'First' : 'Last'} lines of files`, usage: `${command} [-n COUNT] [FILE ...]`,
    execute(args, stdin, context) {
      let count = 10; const paths: string[] = [];
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '-n') count = Number.parseInt(args[++index] ?? '', 10);
        else if (/^-\d+$/.test(args[index])) count = Number.parseInt(args[index].slice(1), 10);
        else paths.push(args[index]);
      }
      if (!(count >= 0)) return { stdout: '', stderr: error(command, 'invalid number of lines'), exitCode: 2 };
      try {
        const sources = readSources(paths, stdin, context);
        const output = sources.map(({ name, content }) => {
          const lines = splitLines(content);
          const selected = command === 'head' ? lines.slice(0, count) : lines.slice(-count);
          const heading = sources.length > 1 ? `==> ${name} <==\n` : '';
          return `${heading}${selected.join('\n')}`;
        });
        return { stdout: output.join('\n\n') + (output.some(Boolean) ? '\n' : '') };
      } catch (exception) {
        return { stdout: '', stderr: error(command, (exception as Error).message), exitCode: 1 };
      }
    },
  };
}

export const headCommand = headTail('head');
export const tailCommand = headTail('tail');

export const grepCommand: Command = {
  name: 'grep', description: 'Search text by pattern', usage: 'grep [-invE] PATTERN [FILE ...]',
  execute(args, stdin, context) {
    let insensitive = false; let numbered = false; let invert = false; let extended = false;
    const rest: string[] = [];
    for (const arg of args) {
      if (rest.length === 0 && /^-[invE]+$/.test(arg)) {
        insensitive ||= arg.includes('i'); numbered ||= arg.includes('n'); invert ||= arg.includes('v'); extended ||= arg.includes('E');
      } else rest.push(arg);
    }
    const pattern = rest.shift();
    if (pattern === undefined) return { stdout: '', stderr: error('grep', 'missing pattern'), exitCode: 2 };
    try {
      const sourcePattern = extended ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matcher = new RegExp(sourcePattern, insensitive ? 'i' : '');
      const sources = readSources(rest, stdin, context);
      const matches: string[] = [];
      sources.forEach(({ name, content }) => splitLines(content).forEach((line, index) => {
        const matchesPattern = matcher.test(line);
        if (invert ? !matchesPattern : matchesPattern) {
          const prefix = `${sources.length > 1 ? `${name}:` : ''}${numbered ? `${index + 1}:` : ''}`;
          matches.push(`${prefix}${line}`);
        }
      }));
      return { stdout: matches.length ? `${matches.join('\n')}\n` : '', exitCode: matches.length ? 0 : 1 };
    } catch (exception) {
      return { stdout: '', stderr: error('grep', (exception as Error).message), exitCode: 2 };
    }
  },
};

export const wcCommand: Command = {
  name: 'wc', description: 'Count lines, words, and bytes', usage: 'wc [-lwc] [FILE ...]',
  execute(args, stdin, context) {
    let lines = false; let words = false; let bytes = false; const paths: string[] = [];
    for (const arg of args) {
      if (/^-[lwc]+$/.test(arg)) { lines ||= arg.includes('l'); words ||= arg.includes('w'); bytes ||= arg.includes('c'); }
      else paths.push(arg);
    }
    if (!lines && !words && !bytes) lines = words = bytes = true;
    try {
      const sources = readSources(paths, stdin, context);
      const counts = sources.map(({ name, content }) => {
        const values = [lines ? (content.match(/\n/g) ?? []).length : undefined, words ? (content.trim().match(/\S+/g) ?? []).length : undefined, bytes ? new TextEncoder().encode(content).byteLength : undefined].filter((value) => value !== undefined);
        return `${values.map((value) => String(value).padStart(7)).join('')}${name ? ` ${name}` : ''}`;
      });
      return { stdout: `${counts.join('\n')}\n` };
    } catch (exception) {
      return { stdout: '', stderr: error('wc', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const cdCommand: Command = {
  name: 'cd', description: 'Change working directory', usage: 'cd [DIRECTORY]',
  execute(args, _stdin, context) {
    if (args.length > 1) return { stdout: '', stderr: error('cd', 'too many arguments'), exitCode: 1 };
    try {
      const path = context.fs.normalize(args[0] ?? '/', context.cwd);
      const node = context.fs.require(path);
      if (node.type !== 'directory') return { stdout: '', stderr: error('cd', `${args[0]}: Not a directory`), exitCode: 1 };
      context.setCwd(path);
      return { stdout: '' };
    } catch (exception) {
      return { stdout: '', stderr: error('cd', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const pwdCommand: Command = { name: 'pwd', description: 'Print working directory', usage: 'pwd', execute: (_args, _stdin, context) => ({ stdout: `${context.cwd}\n` }) };
export const clearCommand: Command = { name: 'clear', description: 'Clear the terminal', usage: 'clear', execute: () => ({ stdout: '', chunks: [{ type: 'clear' }] }) };
export const exitCommand: Command = { name: 'exit', description: 'Start a fresh terminal session', usage: 'exit', execute: () => ({ stdout: '', chunks: [{ type: 'reset' }] }) };
export const basenameCommand: Command = { name: 'basename', description: 'Strip directory components', usage: 'basename PATH', execute: (args) => args[0] ? ({ stdout: `${pathBasename(args[0].replace(/\/+$/, ''))}\n` }) : ({ stdout: '', stderr: error('basename', 'missing operand'), exitCode: 1 }) };
export const dirnameCommand: Command = { name: 'dirname', description: 'Strip the last path component', usage: 'dirname PATH', execute: (args) => args[0] ? ({ stdout: `${pathDirname(args[0].replace(/\/+$/, ''))}\n` }) : ({ stdout: '', stderr: error('dirname', 'missing operand'), exitCode: 1 }) };
