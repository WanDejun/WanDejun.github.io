const combiningMark = /\p{Mark}/u;

// These ranges follow the terminal wcwidth convention used for CJK and emoji cells.
function isWideCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f000 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function characterWidth(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint === 0 || codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (combiningMark.test(character) || codePoint === 0x200d || codePoint === 0xfe0f) return 0;
  return isWideCodePoint(codePoint) ? 2 : 1;
}

export function terminalCellWidth(value: string): number {
  return [...value].reduce((width, character) => width + characterWidth(character), 0);
}

export interface ColumnMetrics {
  columnCount: number;
  columnWidth: number;
}

export function measureColumns(values: string[], availableColumns: number, gap = 2): ColumnMetrics {
  const available = Math.max(1, availableColumns);
  const widest = Math.max(1, ...values.map(terminalCellWidth));
  const columnWidth = Math.min(available, widest + gap);
  return {
    columnCount: Math.max(1, Math.floor(available / columnWidth)),
    columnWidth,
  };
}

export function fitCell(value: string, width: number): { text: string; padding: string } {
  const available = Math.max(1, width);
  let text = value;
  if (terminalCellWidth(value) > available) {
    const characters: string[] = [];
    let used = 0;
    for (const character of value) {
      const next = characterWidth(character);
      if (used + next > available - 1) break;
      characters.push(character);
      used += next;
    }
    text = `${characters.join('')}…`;
  }
  return {
    text,
    padding: ' '.repeat(Math.max(0, available - terminalCellWidth(text))),
  };
}
