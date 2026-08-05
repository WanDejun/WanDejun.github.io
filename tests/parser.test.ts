import { describe, expect, it } from 'vitest';
import { parseCommandLine, ShellSyntaxError } from '../src/shell/parser';

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
});
