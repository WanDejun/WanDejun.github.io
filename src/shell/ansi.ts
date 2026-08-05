export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  strike: '\x1b[9m',
  color(hex: string): string {
    const value = hex.replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `\x1b[38;2;${red};${green};${blue}m`;
  },
};

export function paint(text: string, color: string, style = ''): string {
  return `${style}${ansi.color(color)}${text}${ansi.reset}`;
}

export function sanitizeTerminalText(text: string): string {
  return text
    .replace(/\x1b/g, '^[[')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '�');
}

export function terminalLines(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

export function visibleLength(text: string): number {
  return [...text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')].length;
}
