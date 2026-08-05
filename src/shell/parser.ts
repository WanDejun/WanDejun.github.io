import type { ParsedCommand, ParsedWord } from './types';

export class ShellSyntaxError extends Error {}

export interface CompletionTarget {
  fragment: string;
  prefix: string;
  suffix: string;
  isCommand: boolean;
  commandName?: string;
}

export function quoteShellWord(value: string): string {
  if (/^[A-Za-z0-9_./~:@%+,=-]+$/.test(value)) return value;
  // Adjacent quoted and escaped sections preserve literal single quotes.
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// Completion must tolerate unfinished quotes and escapes, unlike the strict executor parser.
export function findCompletionTarget(input: string, cursor = input.length): CompletionTarget {
  const position = Math.max(0, Math.min(cursor, input.length));
  let quote: 'single' | 'double' | null = null;
  let escaped = false;
  let wordStarted = false;
  let commandPosition = true;
  let commandName: string | undefined;
  let start = 0;
  let fragment = '';

  for (let index = 0; index < position; index += 1) {
    const character = input[index];
    if (escaped) {
      fragment += character;
      escaped = false;
      wordStarted = true;
    } else if (character === '\\' && quote !== 'single') {
      escaped = true;
      wordStarted = true;
    } else if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single';
      wordStarted = true;
    } else if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double';
      wordStarted = true;
    } else if (!quote && (character === '|' || /\s/.test(character))) {
      if (wordStarted) {
        if (commandPosition) commandName = fragment;
        commandPosition = false;
      }
      if (character === '|') {
        commandPosition = true;
        commandName = undefined;
      }
      wordStarted = false;
      fragment = '';
      start = index + 1;
    } else {
      fragment += character;
      wordStarted = true;
    }
  }

  let end = position;
  if (wordStarted) {
    for (; end < input.length; end += 1) {
      const character = input[end];
      if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote !== 'single') {
        escaped = true;
      } else if (character === "'" && quote !== 'double') {
        quote = quote === 'single' ? null : 'single';
      } else if (character === '"' && quote !== 'single') {
        quote = quote === 'double' ? null : 'double';
      } else if (!quote && (character === '|' || /\s/.test(character))) {
        break;
      }
    }
  }

  return {
    fragment,
    prefix: input.slice(0, start),
    suffix: input.slice(end),
    isCommand: commandPosition,
    commandName: commandPosition ? undefined : commandName,
  };
}

// This is intentionally a small shell lexer. It tracks quoting only to preserve
// argument boundaries and decide whether glob expansion is allowed later.
export function parseCommandLine(input: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  let words: ParsedWord[] = [];
  let value = '';
  let quoted = false;
  let quote: 'single' | 'double' | null = null;
  let escaped = false;
  let started = false;

  const pushWord = () => {
    if (!started) return;
    words.push({ value, allowGlob: !quoted });
    value = '';
    quoted = false;
    started = false;
  };
  const pushCommand = () => {
    pushWord();
    if (words.length === 0) throw new ShellSyntaxError('syntax error near unexpected token `|`');
    commands.push({ words });
    words = [];
  };

  for (const character of input) {
    if (escaped) {
      value += character;
      started = true;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== 'single') {
      escaped = true;
      started = true;
      continue;
    }
    if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single';
      quoted = true;
      started = true;
      continue;
    }
    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double';
      quoted = true;
      started = true;
      continue;
    }
    if (!quote && character === '|') {
      pushCommand();
      continue;
    }
    // Reject syntax that could imply writes or scripting instead of silently misparsing it.
    if (!quote && /[<>;&]/.test(character)) {
      throw new ShellSyntaxError(`unsupported shell operator '${character}'`);
    }
    if (!quote && /\s/.test(character)) {
      pushWord();
      continue;
    }
    value += character;
    started = true;
  }

  if (escaped) throw new ShellSyntaxError('unfinished escape sequence');
  if (quote) throw new ShellSyntaxError(`unterminated ${quote} quote`);
  pushWord();
  if (words.length > 0) commands.push({ words });
  else if (commands.length > 0) throw new ShellSyntaxError('expected command after pipe');
  return commands;
}
