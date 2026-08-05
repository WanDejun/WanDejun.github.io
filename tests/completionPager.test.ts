import { describe, expect, it } from 'vitest';
import {
  applyCompletionSuggestion, layoutCompletions, moveCompletionColumn, moveCompletionIndex,
} from '../src/components/completionPager';
import { fitCell, terminalCellWidth } from '../src/shell/columnLayout';
import type { CompletionSuggestion } from '../src/shell/types';

const suggestions: CompletionSuggestion[] = ['alpha', 'beta', 'gamma', 'omega'].map((value) => ({
  value,
  kind: 'file',
}));

describe('completion pager', () => {
  it('lays candidates out within the available terminal area', () => {
    const layout = layoutCompletions(suggestions, null, 16, 3);
    expect(layout.columnCount).toBe(2);
    expect(layout.rows.map((row) => row.map(({ suggestion }) => suggestion.value))).toEqual([
      ['alpha', 'gamma'],
      ['beta', 'omega'],
    ]);
    expect(layout.pageCount).toBe(1);
  });

  it('paginates around the selected candidate', () => {
    const many = Array.from({ length: 10 }, (_, index): CompletionSuggestion => ({
      value: `item-${index}`,
      kind: 'file',
    }));
    const layout = layoutCompletions(many, 9, 10, 3);
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(layout.page).toBe(layout.pageCount - 1);
    expect(layout.rows.flat().some(({ index }) => index === 9)).toBe(true);
  });

  it('selects the first item and wraps in both directions', () => {
    expect(moveCompletionIndex(null, 4, 1)).toBe(0);
    expect(moveCompletionIndex(3, 4, 1)).toBe(0);
    expect(moveCompletionIndex(0, 4, -1)).toBe(3);
  });

  it('continues from the bottom of one column to the next column', () => {
    const five = [...suggestions, { value: 'sigma', kind: 'file' as const }];
    const layout = layoutCompletions(five, 2, 16, 3);
    expect(layout.rows.map((row) => row.map(({ index }) => index))).toEqual([
      [0, 3],
      [1, 4],
      [2],
    ]);
    expect(moveCompletionIndex(2, five.length, 1)).toBe(3);
  });

  it('moves horizontally within a visual row and skips missing cells', () => {
    const five = [...suggestions, { value: 'sigma', kind: 'file' as const }];
    const layout = layoutCompletions(five, 1, 16, 3);
    expect(moveCompletionColumn(1, layout, 1)).toBe(4);
    expect(moveCompletionColumn(4, layout, 1)).toBe(1);
    expect(moveCompletionColumn(2, layout, 1)).toBe(2);
  });

  it('adds a separator after accepted non-directory candidates', () => {
    expect(applyCompletionSuggestion('', '', { value: 'theme', kind: 'command' })).toEqual({
      line: 'theme ',
      cursor: 6,
    });
    expect(applyCompletionSuggestion('cat ', '', { value: 'draft post.md', kind: 'file' })).toEqual({
      line: "cat 'draft post.md' ",
      cursor: 20,
    });
    expect(applyCompletionSuggestion('cd ', '', { value: 'posts/', kind: 'directory' })).toEqual({
      line: 'cd posts/',
      cursor: 9,
    });
    expect(applyCompletionSuggestion('cat ', ' | wc', { value: 'post.md', kind: 'file' })).toEqual({
      line: 'cat post.md | wc',
      cursor: 11,
    });
  });

  it('pads and truncates labels to a stable width', () => {
    expect(fitCell('cat', 5)).toEqual({ text: 'cat', padding: '  ' });
    expect(fitCell('terminal', 5)).toEqual({ text: 'term…', padding: '' });
    expect(fitCell('博客', 5)).toEqual({ text: '博客', padding: ' ' });
    expect(terminalCellWidth('a博客')).toBe(5);
    expect(terminalCellWidth('🚀')).toBe(2);
    expect(terminalCellWidth('\ue0b0')).toBe(1);
  });

  it('does not exceed the available height just to show a page counter', () => {
    const layout = layoutCompletions(suggestions, 3, 5, 1);
    expect(layout.rows).toHaveLength(1);
    expect(layout.showPageCounter).toBe(false);
  });
});
