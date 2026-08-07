import { expect, test } from '@playwright/test';

async function runCommand(page: import('@playwright/test').Page, command: string) {
  const input = page.locator('.xterm-helper-textarea');
  const terminal = page.locator('.xterm-accessibility-tree');
  await input.focus();
  await input.pressSequentially(command);
  // xterm forwards key events through an async input queue; wait for the tail before Enter.
  await expect(terminal).toContainText(command.slice(-12));
  await input.press('Enter');
}

async function waitForTerminalReady(page: import('@playwright/test').Page, cwd = '/') {
  await expect(page.locator('.xterm-accessibility-tree')).toContainText(`neko:${cwd}$`, { timeout: 30_000 });
}

async function suppressExampleImage(page: import('@playwright/test').Page) {
  await page.route(/example-coat(?:-[^/]+)?\.png(?:\?.*)?$/, (route) => {
    const requestUrl = new URL(route.request().url());
    return requestUrl.searchParams.has('url') ? route.continue() : route.abort();
  });
}

async function expectOpaqueImageLayer(page: import('@playwright/test').Page) {
  const imageLayer = page.locator('canvas.xterm-image-layer');
  await expect(imageLayer).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(async () => imageLayer.evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) opaque += 1;
    }
    return opaque;
  })).toBeGreaterThan(1000);
}

async function glyphPixels(
  page: import('@playwright/test').Page,
  family: string,
  glyph: string,
) {
  return page.evaluate(async ({ family, glyph }) => {
    await document.fonts.load(`36px "${family}"`, glyph);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.font = `36px "${family}"`;
    context.fillText(glyph, 4, 44);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    const colors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      opaque += 1;
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    }
    return { opaque, colors: colors.size };
  }, { family, glyph });
}

test('opens an interactive terminal and navigates the virtual filesystem', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Neko Blog');
  await expect(page.locator('.terminal-window')).toBeVisible();
  await expect(page.locator('.xterm-helper-textarea')).toBeFocused();
  await waitForTerminalReady(page);
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('github.com/WanDejun');

  await runCommand(page, 'ls /');
  const terminal = page.locator('.xterm-accessibility-tree');
  await expect(terminal).toContainText('post/');
  await expect(terminal).toContainText('project/');
  await expect(terminal).toContainText('slide/');

  await runCommand(page, 'cd /post');
  await runCommand(page, 'pwd');
  await expect(terminal).toContainText('/post');

  await runCommand(page, 'help');
  await expect(terminal).toContainText('standalone slide directories', { timeout: 15_000 });
});

test('opens a shared post with its requested theme and starts in its directory', async ({ page }) => {
  await suppressExampleImage(page);
  await page.goto('/?blog=%2Fpost%2Fhello-terminal.md&theme=gruvbox-light');
  await waitForTerminalReady(page, '/post');

  const terminal = page.locator('.xterm-accessibility-tree');
  await expect(terminal).toContainText('[ ] Add a new post');
  await expect(terminal).toContainText('[x] Render this example');
  await expect(terminal).toContainText('This flowchart is rendered by Mermaid.');
  await expect.poll(() => page.locator('.page').evaluate((element) => (
    getComputedStyle(element).backgroundColor
  ))).toBe('rgb(242, 229, 188)');
  await runCommand(page, 'pwd');
  await expect(terminal).toContainText('/post');
  await runCommand(page, 'theme');
  await expect(terminal).toContainText('* gruvbox-light');
});

test('shows a terminal 404 and stays at root for a missing shared post', async ({ page }) => {
  await page.goto('/?blog=%2Fpost%2Fmissing.md');
  await waitForTerminalReady(page);

  const terminal = page.locator('.xterm-accessibility-tree');
  await expect(terminal).toContainText(' _  _    ___  _  _');
  await expect(terminal).toContainText('   |_|  \\___/   |_|');
  await runCommand(page, 'pwd');
  await expect(terminal).toContainText('/');
});

test('falls back to the configured theme for an invalid theme parameter', async ({ page }) => {
  await page.goto('/?theme=missing');
  await waitForTerminalReady(page);

  const terminal = page.locator('.xterm-accessibility-tree');
  await expect.poll(() => page.locator('.page').evaluate((element) => (
    getComputedStyle(element).backgroundColor
  ))).toBe('rgb(29, 32, 33)');
  await runCommand(page, 'theme');
  await expect(terminal).toContainText('* gruvbox-dark');
});

test('generates share links with the active or requested theme', async ({ page }) => {
  await page.goto('/?theme=gruvbox-light');
  await waitForTerminalReady(page);
  const terminal = page.locator('.xterm-accessibility-tree');

  await runCommand(page, 'share /post/hello-terminal.md');
  await expect(terminal).toContainText('blog=%2Fpost%2Fhello-terminal.md&theme=gruvbox-light');

  await runCommand(page, 'share /post/hello-terminal.md --theme missing');
  await expect(terminal).toContainText("share: warning: unsupported theme 'missing'");
  await expect(terminal).toContainText('blog=%2Fpost%2Fhello-terminal.md&theme=gruvbox-light');
});

test('selects path completions with Tab and arrow keys before executing', async ({ page }) => {
  await page.goto('/');
  await waitForTerminalReady(page);
  await runCommand(page, 'cd /post');
  const terminal = page.locator('.xterm-accessibility-tree');
  const input = page.locator('.xterm-helper-textarea');
  await expect(terminal).toContainText('neko:/post$');

  await input.focus();
  await input.pressSequentially('cat ');
  await expect(terminal).toContainText('cat ');
  await input.press('Tab');
  await expect(terminal).toContainText('example-coat.png');
  await expect(terminal).toContainText('hello-terminal.md');
  await expect.poll(async () => {
    const text = await terminal.textContent() ?? '';
    return text.lastIndexOf('cat ') < text.lastIndexOf('example-coat.png');
  }).toBe(true);

  await input.press('Tab');
  await expect(terminal).toContainText('cat example-coat.png');
  await input.press('ArrowDown');
  await expect(terminal).toContainText('cat hello-terminal.md');

  // The first Enter accepts the highlighted candidate; the second executes it.
  await input.press('Enter');
  await expect(terminal).toContainText('cat hello-terminal.md');
  await input.press('Enter');
  await expect(terminal).toContainText('This flowchart is rendered by Mermaid.');
});

test('switches themes without resetting the shell session', async ({ page }) => {
  await page.goto('/');
  await waitForTerminalReady(page);
  await runCommand(page, 'cd /post');
  const terminal = page.locator('.xterm-accessibility-tree');
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially('the');
  await input.press('Tab');
  await input.pressSequentially('gruvbox-light');
  await expect(terminal).toContainText('theme gruvbox-light');
  await input.press('Enter');

  await expect.poll(() => page.locator('.page').evaluate((element) => (
    getComputedStyle(element).backgroundColor
  ))).toBe('rgb(242, 229, 188)');

  await runCommand(page, 'pwd');
  await expect(terminal).toContainText('/post');
});

test('opens a static slide and transfers keyboard focus into it', async ({ page }) => {
  await page.goto('/');
  await waitForTerminalReady(page);
  await runCommand(page, 'render /slide/example/index.html');

  const overlay = page.locator('.document-window');
  const frameElement = page.locator('.document-frame');
  const frame = page.frameLocator('.document-frame');
  await expect(overlay).toBeVisible();
  await expect(frameElement).toBeFocused();
  await expect(frame.locator('html')).toHaveAttribute('data-slide', '1');
  const viewport = page.viewportSize()!;
  const overlayBox = await overlay.boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(overlayBox!.x).toBeGreaterThanOrEqual(0);
  expect(overlayBox!.y).toBeGreaterThanOrEqual(0);
  expect(overlayBox!.x + overlayBox!.width).toBeLessThanOrEqual(viewport.width);
  expect(overlayBox!.y + overlayBox!.height).toBeLessThanOrEqual(viewport.height);

  await page.keyboard.press('ArrowRight');
  await expect(frame.locator('html')).toHaveAttribute('data-last-key', 'ArrowRight');
  await expect(frame.locator('html')).toHaveAttribute('data-slide', '2');

  const terminal = page.locator('.xterm-accessibility-tree');
  const terminalText = await terminal.textContent();
  await page.keyboard.press('x');
  await expect(frame.locator('html')).toHaveAttribute('data-last-key', 'x');
  expect(await terminal.textContent()).toBe(terminalText);

  await page.locator('.document-close').click();
  await expect(overlay).not.toBeVisible();
  await expect(page.locator('.xterm-helper-textarea')).toBeFocused();
});

test('renders a MathJax formula through the iTerm2 image layer', async ({ page }) => {
  // Suppress the other rich chunks so nontransparent pixels can only come from MathJax.
  await suppressExampleImage(page);
  await page.route('**/src/markdown/renderDiagram.ts*', (route) => route.abort());
  await page.goto('/');
  await waitForTerminalReady(page);
  await runCommand(page, 'render /post/hello-terminal.md');
  const terminal = page.locator('.xterm-accessibility-tree');
  await expect(terminal).toContainText('This flowchart is rendered by Mermaid.', { timeout: 30_000 });
  // The longer example scrolls formulas out of view; ImageAddon redraws them when revisiting scrollback.
  await page.locator('.xterm-helper-textarea').press('Shift+PageUp');
  await expect(terminal).toContainText('This loss function is also rendered as an internal image chunk.');
  await expect(terminal).not.toContainText('formula unavailable');
  await expectOpaqueImageLayer(page);
});

test('renders a Mermaid diagram through the iTerm2 image layer', async ({ page }) => {
  // Suppress the other rich chunks so nontransparent pixels can only come from Mermaid.
  await suppressExampleImage(page);
  await page.route('**/src/markdown/renderFormula.ts*', (route) => route.abort());
  await page.goto('/');
  await waitForTerminalReady(page);
  await runCommand(page, 'render /post/hello-terminal.md');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('This pie chart is rendered by Mermaid.', { timeout: 30_000 });
  await expect(page.locator('.xterm-accessibility-tree')).not.toContainText('diagram unavailable');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('This flowchart is rendered by Mermaid.', { timeout: 30_000 });
  await expect(page.locator('.xterm-accessibility-tree')).not.toContainText('diagram unavailable');
  await expectOpaqueImageLayer(page);
});

test('renders Markdown Emoji and bundled Nerd Font glyphs', async ({ page }) => {
  await page.goto('/');
  await waitForTerminalReady(page);

  const nerd = await glyphPixels(page, 'Neko Nerd Symbols', '\ue0b0');
  const emoji = await glyphPixels(page, 'Neko Emoji', '🚀');
  expect(nerd.opaque).toBeGreaterThan(50);
  expect(emoji.opaque).toBeGreaterThan(100);
  expect(emoji.colors).toBeGreaterThan(5);

  await runCommand(page, 'render /post/zz-emoji.md');
  const terminal = page.locator('.xterm-accessibility-tree');
  await expect(terminal).toContainText('Markdown shortcodes become Emoji: 🚀 ✨ 😺', { timeout: 30_000 });
  await expect(terminal).toContainText('Powerline glyphs: \ue0b0 \ue0b2');
});

test('keeps the rounded terminal inside a mobile viewport', async ({ page }) => {
  await page.goto('/');
  await waitForTerminalReady(page);
  const viewport = page.viewportSize()!;
  const box = await page.locator('.terminal-window').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(Math.abs(box!.height - viewport.height * 0.9)).toBeLessThan(2);
  expect(await page.locator('.terminal-window').evaluate((element) => getComputedStyle(element).borderRadius)).not.toBe('0px');

  const terminalBox = await page.locator('.xterm').boundingBox();
  const screenBox = await page.locator('.xterm-screen').boundingBox();
  expect(terminalBox).not.toBeNull();
  expect(screenBox).not.toBeNull();
  expect(screenBox!.y + screenBox!.height).toBeLessThanOrEqual(terminalBox!.y + terminalBox!.height + 1);
});
