import { describe, expect, it } from 'vitest';
import { findCompletionTarget, parseCommandLine, quoteShellWord, ShellSyntaxError } from '../src/shell/parser';

describe('parseCommandLine', () => {
  it('parses quotes, escapes, and pipelines', () => {
    expect(parseCommandLine(`printf '%s\\n' "hello world" | grep hello`)).toEqual([
      { words: [
        { value: 'printf', allowGlob: true },
        { value: '%s\\n', allowGlob: false },
        { value: 'hello world', allowGlob: false },
      ] },
      { words: [
        { value: 'grep', allowGlob: true },
        { value: 'hello', allowGlob: true },
      ] },
    ]);
  });

  it('rejects operators outside the supported shell subset', () => {
    expect(() => parseCommandLine('cat /help > output')).toThrow(ShellSyntaxError);
    expect(() => parseCommandLine('ls |')).toThrow('expected command after pipe');
  });

  it('finds the word around the cursor and safely quotes completion values', () => {
    expect(findCompletionTarget('cat post.md | wc', 6)).toEqual({
      fragment: 'po',
      prefix: 'cat ',
      suffix: ' | wc',
      isCommand: false,
      commandName: 'cat',
    });
    expect(findCompletionTarget("cat '/blogs/my notes/'")).toMatchObject({
      fragment: '/blogs/my notes/',
      prefix: 'cat ',
      commandName: 'cat',
    });

    const filename = "draft * 'notes'.md";
    const parsed = parseCommandLine(`cat ${quoteShellWord(filename)}`);
    expect(parsed[0].words[1]).toEqual({ value: filename, allowGlob: false });
  });
});
