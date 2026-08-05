import type { CompletionSuggestion } from '../shell/types';
import { measureColumns } from '../shell/columnLayout';

export interface CompletionLayout {
  rows: Array<Array<{ index: number; suggestion: CompletionSuggestion }>>;
  columnCount: number;
  columnWidth: number;
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
  const rows = Array.from({ length: Math.ceil(visible.length / columnCount) }, (_, row) => (
    visible.slice(row * columnCount, (row + 1) * columnCount).map((suggestion, column) => ({
      index: firstIndex + row * columnCount + column,
      suggestion,
    }))
  ));

  return { rows, columnCount, columnWidth, page, pageCount, showPageCounter };
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
