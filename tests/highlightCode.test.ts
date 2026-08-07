import { describe, expect, it } from 'vitest';
import { highlightCode } from '../src/markdown/highlightCode';

describe('code highlighting', () => {
  it('adds language tokens while keeping source HTML escaped', () => {
    const highlighted = highlightCode('const value: string = "<tag>";', 'typescript');

    expect(highlighted).toContain('hljs-keyword');
    expect(highlighted).toContain('hljs-built_in');
    expect(highlighted).toContain('&lt;tag&gt;');
    expect(highlighted).not.toContain('<tag>');
  });
});
