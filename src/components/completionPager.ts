import type { CompletionSuggestion } from '../shell/types';
import { measureColumns } from '../shell/columnLayout';
import { quoteShellWord } from '../shell/parser';

export interface CompletionLayout {
  rows: Array<Array<{ index: number; suggestion: CompletionSuggestion }>>;
  columnCount: number;
  columnWidth: number;
  rowCount: number;
  firstIndex: number;
  visibleCount: number;
  page: number;
  pageCount: number;
  showPageCounter: boolean;
}

export function layoutCompletions(
  suggestions: CompletionSuggestion[],
  selectedIndex: number | null,
  terminalColumns: number,
  maxRows: number,
): CompletionLayout {
  const { columnCount, columnWidth } = measureColumns(
    suggestions.map(({ value }) => value),
    terminalColumns,
  );
  const availableRows = Math.max(1, maxRows);
  const needsPagination = suggestions.length > columnCount * availableRows;
  const showPageCounter = needsPagination && availableRows > 1;
  const itemRows = Math.max(1, availableRows - (showPageCounter ? 1 : 0));
  const pageSize = columnCount * itemRows;
  const pageCount = Math.max(1, Math.ceil(suggestions.length / pageSize));

  const page = Math.min(pageCount - 1, Math.floor((selectedIndex ?? 0) / pageSize));
  const firstIndex = page * pageSize;
  const visible = suggestions.slice(firstIndex, firstIndex + pageSize);
  const rowCount = Math.max(1, Math.min(itemRows, Math.ceil(visible.length / columnCount)));
  // Fish-style completion fills columns top-to-bottom so Down continues at the
  // top of the next column after reaching the current column's last row.
  const rows = Array.from({ length: rowCount }, (_, row) => {
    const items: CompletionLayout['rows'][number] = [];
    for (let column = 0; column < columnCount; column += 1) {
      const localIndex = column * rowCount + row;
      const suggestion = visible[localIndex];
      if (suggestion) items.push({ index: firstIndex + localIndex, suggestion });
    }
    return items;
  });

  return {
    rows,
    columnCount,
    columnWidth,
    rowCount,
    firstIndex,
    visibleCount: visible.length,
    page,
    pageCount,
    showPageCounter,
  };
}

export function moveCompletionIndex(
  selectedIndex: number | null,
  suggestionCount: number,
  offset: number,
): number | null {
  if (suggestionCount === 0) return null;
  if (selectedIndex === null) return offset < 0 ? suggestionCount - 1 : 0;
  return (selectedIndex + offset + suggestionCount) % suggestionCount;
}

export function moveCompletionColumn(
  selectedIndex: number | null,
  layout: CompletionLayout,
  direction: -1 | 1,
): number | null {
  if (layout.visibleCount === 0) return null;
  if (selectedIndex === null) return layout.firstIndex;

  const localIndex = selectedIndex - layout.firstIndex;
  if (localIndex < 0 || localIndex >= layout.visibleCount) return layout.firstIndex;
  const row = localIndex % layout.rowCount;
  const rowIndices: number[] = [];
  for (let index = row; index < layout.visibleCount; index += layout.rowCount) {
    rowIndices.push(index);
  }
  const position = rowIndices.indexOf(localIndex);
  const nextPosition = (position + direction + rowIndices.length) % rowIndices.length;
  return layout.firstIndex + rowIndices[nextPosition];
}

export function applyCompletionSuggestion(
  prefix: string,
  suffix: string,
  suggestion: CompletionSuggestion,
): { line: string; cursor: number } {
  // Directories retain their trailing slash for deeper completion. Other
  // candidates add a shell separator unless the untouched suffix has one.
  const separator = suggestion.kind !== 'directory' && !/^[\s|]/.test(suffix) ? ' ' : '';
  const beforeCursor = `${prefix}${quoteShellWord(suggestion.value)}${separator}`;
  return {
    line: `${beforeCursor}${suffix}`,
    cursor: [...beforeCursor].length,
  };
}
