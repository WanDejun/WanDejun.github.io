import type { ParsedCommand, ParsedWord } from './types';

export class ShellSyntaxError extends Error {}

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
