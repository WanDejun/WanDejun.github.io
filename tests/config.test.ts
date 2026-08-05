import { describe, expect, it } from 'vitest';
import { loadConfig, loadTheme } from '../src/config';

const themes = [
  ['tokyonight-night', 'dark'],
  ['tokyonight-day', 'light'],
  ['gruvbox-dark', 'dark'],
  ['gruvbox-light', 'light'],
  ['molokai-dark', 'dark'],
  ['molokai-light', 'light'],
] as const;

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map((pair) => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('configuration', () => {
  it('loads editable prompt and sizing settings', () => {
    const config = loadConfig(`
      [site]
      title = "Test"
      window_title = "test"
      [terminal]
      prompt = "user:{cwd}$ "
      theme = "tokyonight-night"
      font_family = "monospace"
      font_size = 14
      cursor_blink = true
      scrollback = 100
      max_width = 900
      height_percent = 90
      [images]
      timeout_ms = 1000
      max_bytes = 10000
      max_width_cells = 60
    `);
    expect(config.terminal.prompt).toBe('user:{cwd}$ ');
    expect(config.terminal.heightPercent).toBe(90);
    expect(config.images.maxWidthCells).toBe(60);
  });

  it('loads the complete Tokyo Night palette', () => {
    const palette = loadTheme('tokyonight-night');
    expect(palette.colorScheme).toBe('dark');
    expect(palette.terminal.background).toBe('#1a1b26');
    expect(palette.markdown.heading).toBe('#7aa2f7');
  });

  it.each(themes)('loads the complete %s palette', (name, colorScheme) => {
    const palette = loadTheme(name);
    expect(palette.colorScheme).toBe(colorScheme);
    const colors = [
      ...Object.values(palette.page),
      ...Object.values(palette.terminal),
      ...Object.values(palette.markdown),
    ];
    expect(colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
    expect(contrast(palette.terminal.foreground!, palette.terminal.background!)).toBeGreaterThanOrEqual(4.5);
  });
});
