import type { Command } from '../types';
import { error, expandCharacterSet, readSources, splitLines } from './utils';

function decodeEscapes(value: string): string {
  return value.replace(/\\([\\abfnrtv]|x[\da-fA-F]{2}|[0-7]{1,3})/g, (match, sequence: string) => {
    const named: Record<string, string> = { '\\': '\\', a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
    if (named[sequence] !== undefined) return named[sequence];
    if (sequence.startsWith('x')) return String.fromCharCode(Number.parseInt(sequence.slice(1), 16));
    if (/^[0-7]+$/.test(sequence)) return String.fromCharCode(Number.parseInt(sequence, 8));
    return match;
  });
}

export const echoCommand: Command = {
  name: 'echo', description: 'Display arguments', usage: 'echo [-n] [ARG ...]',
  execute(args) {
    const newline = args[0] !== '-n';
    const values = newline ? args : args.slice(1);
    return { stdout: `${values.join(' ')}${newline ? '\n' : ''}` };
  },
};

export const printfCommand: Command = {
  name: 'printf', description: 'Format and print data', usage: 'printf FORMAT [ARG ...]',
  execute(args) {
    const format = args.shift();
    if (format === undefined) return { stdout: '', stderr: error('printf', 'missing format operand'), exitCode: 1 };
    const decoded = decodeEscapes(format);
    if (!/%(?:s|d|i)/.test(decoded)) return { stdout: decoded.replace(/%%/g, '%') };
    let output = ''; let argumentIndex = 0;
    do {
      output += decoded.replace(/%(?:%|s|d|i)/g, (specifier) => {
        if (specifier === '%%') return '%';
        const value = args[argumentIndex++] ?? '';
        return specifier === '%s' ? value : String(Number.parseInt(value, 10) || 0);
      });
    } while (argumentIndex < args.length);
    return { stdout: output };
  },
};

export const sortCommand: Command = {
  name: 'sort', description: 'Sort lines of text', usage: 'sort [-rnu] [FILE ...]',
  execute(args, stdin, context) {
    let reverse = false; let numeric = false; let unique = false; const paths: string[] = [];
    for (const arg of args) {
      if (/^-[rnu]+$/.test(arg)) { reverse ||= arg.includes('r'); numeric ||= arg.includes('n'); unique ||= arg.includes('u'); }
      else paths.push(arg);
    }
    try {
      let lines = readSources(paths, stdin, context).flatMap(({ content }) => splitLines(content));
      lines.sort(numeric ? ((a, b) => Number.parseFloat(a) - Number.parseFloat(b)) : ((a, b) => a.localeCompare(b)));
      if (unique) lines = lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
      if (reverse) lines.reverse();
      return { stdout: lines.length ? `${lines.join('\n')}\n` : '' };
    } catch (exception) {
      return { stdout: '', stderr: error('sort', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const uniqCommand: Command = {
  name: 'uniq', description: 'Report or omit repeated lines', usage: 'uniq [-cd] [FILE]',
  execute(args, stdin, context) {
    let counts = false; let duplicatesOnly = false; const paths: string[] = [];
    for (const arg of args) {
      if (/^-[cd]+$/.test(arg)) { counts ||= arg.includes('c'); duplicatesOnly ||= arg.includes('d'); }
      else paths.push(arg);
    }
    try {
      const lines = splitLines(readSources(paths, stdin, context).map(({ content }) => content).join(''));
      const groups: Array<{ value: string; count: number }> = [];
      lines.forEach((line) => {
        const last = groups.at(-1);
        if (last?.value === line) last.count += 1;
        else groups.push({ value: line, count: 1 });
      });
      const output = groups.filter((group) => !duplicatesOnly || group.count > 1).map((group) => `${counts ? `${String(group.count).padStart(7)} ` : ''}${group.value}`);
      return { stdout: output.length ? `${output.join('\n')}\n` : '' };
    } catch (exception) {
      return { stdout: '', stderr: error('uniq', (exception as Error).message), exitCode: 1 };
    }
  },
};

type SedOperation =
  | { type: 'substitute'; matcher: RegExp; replacement: string; print: boolean }
  | { type: 'print' }
  | { type: 'delete' };

function parseSedScript(script: string): SedOperation {
  if (script === 'p') return { type: 'print' };
  if (script === 'd') return { type: 'delete' };
  if (script.startsWith('s') && script.length >= 4) {
    // The delimiter is user-selected (s/foo/bar/, s|foo|bar|, etc.), so split with
    // a small scanner rather than a slash-specific regular expression.
    const delimiter = script[1];
    const parts: string[] = []; let value = ''; let escaped = false;
    for (const character of script.slice(2)) {
      if (escaped) { value += character; escaped = false; }
      else if (character === '\\') { value += character; escaped = true; }
      else if (character === delimiter && parts.length < 2) { parts.push(value); value = ''; }
      else value += character;
    }
    parts.push(value);
    if (parts.length !== 3) throw new Error(`invalid substitute expression '${script}'`);
    const flags = parts[2];
    return { type: 'substitute', matcher: new RegExp(parts[0], flags.includes('g') ? 'g' : ''), replacement: parts[1].replace(/&/g, () => '$&'), print: flags.includes('p') };
  }
  throw new Error(`unsupported script '${script}'`);
}

export const sedCommand: Command = {
  name: 'sed', description: 'Transform text', usage: 'sed [-n] [-e SCRIPT] [SCRIPT] [FILE ...]',
  execute(args, stdin, context) {
    let quiet = false; const scripts: string[] = []; const paths: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-n') quiet = true;
      else if (args[index] === '-e') scripts.push(args[++index] ?? '');
      else if (scripts.length === 0) scripts.push(args[index]);
      else paths.push(args[index]);
    }
    if (scripts.length === 0) return { stdout: '', stderr: error('sed', 'missing script'), exitCode: 1 };
    try {
      const operations = scripts.map(parseSedScript);
      const input = readSources(paths, stdin, context).map(({ content }) => content).join('');
      const output: string[] = [];
      splitLines(input).forEach((original) => {
        let line = original; let deleted = false; let explicitlyPrinted = false;
        for (const operation of operations) {
          if (operation.type === 'delete') deleted = true;
          else if (operation.type === 'print') { output.push(line); explicitlyPrinted = true; }
          else {
            const changed = operation.matcher.test(line);
            operation.matcher.lastIndex = 0;
            line = line.replace(operation.matcher, operation.replacement);
            if (changed && operation.print) { output.push(line); explicitlyPrinted = true; }
          }
        }
        if (!quiet && !deleted) output.push(line);
        void explicitlyPrinted;
      });
      return { stdout: output.length ? `${output.join('\n')}\n` : '' };
    } catch (exception) {
      return { stdout: '', stderr: error('sed', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const cutCommand: Command = {
  name: 'cut', description: 'Select fields from lines', usage: 'cut -d DELIMITER -f LIST [FILE ...]',
  execute(args, stdin, context) {
    let delimiter = '\t'; let fields = ''; const paths: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-d') delimiter = args[++index] ?? '';
      else if (args[index] === '-f') fields = args[++index] ?? '';
      else paths.push(args[index]);
    }
    if (!fields) return { stdout: '', stderr: error('cut', 'fields must be specified with -f'), exitCode: 1 };
    const selected = new Set(fields.split(',').flatMap((part) => {
      const [start, end] = part.split('-').map(Number);
      return end ? Array.from({ length: end - start + 1 }, (_, index) => start + index) : [start];
    }));
    try {
      const input = readSources(paths, stdin, context).map(({ content }) => content).join('');
      return { stdout: `${splitLines(input).map((line) => line.split(delimiter).filter((_, index) => selected.has(index + 1)).join(delimiter)).join('\n')}\n` };
    } catch (exception) {
      return { stdout: '', stderr: error('cut', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const trCommand: Command = {
  name: 'tr', description: 'Translate or delete characters', usage: 'tr [-d] SET1 [SET2]',
  execute(args, stdin) {
    const deleting = args[0] === '-d';
    const sets = deleting ? args.slice(1) : args;
    if (!sets[0] || (!deleting && !sets[1])) return { stdout: '', stderr: error('tr', 'missing operand'), exitCode: 1 };
    const from = expandCharacterSet(sets[0]); const to = deleting ? [] : expandCharacterSet(sets[1]);
    const translated = [...stdin].map((character) => {
      const index = from.indexOf(character);
      if (index === -1) return character;
      if (deleting) return '';
      return to[Math.min(index, to.length - 1)] ?? '';
    }).join('');
    return { stdout: translated };
  },
};

export const nlCommand: Command = {
  name: 'nl', description: 'Number lines', usage: 'nl [-b a|t] [FILE]',
  execute(args, stdin, context) {
    let style = 't'; const paths: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-b') style = args[++index] ?? '';
      else paths.push(args[index]);
    }
    if (!['a', 't'].includes(style)) return { stdout: '', stderr: error('nl', `invalid numbering style '${style}'`), exitCode: 1 };
    try {
      const input = readSources(paths, stdin, context).map(({ content }) => content).join('');
      let number = 1;
      return { stdout: splitLines(input).map((line) => style === 'a' || line ? `${String(number++).padStart(6)}\t${line}` : '       ').join('\n') + '\n' };
    } catch (exception) {
      return { stdout: '', stderr: error('nl', (exception as Error).message), exitCode: 1 };
    }
  },
};

export const whichCommand: Command = {
  name: 'which', description: 'Locate commands', usage: 'which COMMAND ...',
  execute(args, _stdin, context) {
    const found = args.filter((name) => context.getCommand(name)).map((name) => `/bin/${name}`);
    const missing = args.filter((name) => !context.getCommand(name));
    return { stdout: found.length ? `${found.join('\n')}\n` : '', exitCode: missing.length ? 1 : 0 };
  },
};
