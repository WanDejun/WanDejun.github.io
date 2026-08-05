import { describe, expect, it } from 'vitest';
import { loadConfig, loadTheme } from '../src/config';

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
    expect(palette.terminal.background).toBe('#1a1b26');
    expect(palette.markdown.heading).toBe('#7aa2f7');
  });
});
