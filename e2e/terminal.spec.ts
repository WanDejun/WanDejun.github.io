import { expect, test } from '@playwright/test';

async function runCommand(page: import('@playwright/test').Page, command: string) {
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await input.pressSequentially(command);
  await input.press('Enter');
}

async function waitForTerminalReady(page: import('@playwright/test').Page) {
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('neko:/$');
}

test('opens an interactive terminal and navigates the virtual filesystem', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Neko Terminal');
  await expect(page.locator('.terminal-window')).toBeVisible();
  await expect(page.locator('.xterm-helper-textarea')).toBeFocused();
  await waitForTerminalReady(page);
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('github.com/WanDejun');

  await runCommand(page, 'cd /blogs');
  await runCommand(page, 'pwd');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('/blogs');

  await runCommand(page, 'help');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('publish them on the next deployment');
});

test('renders Markdown and a local iTerm2 image', async ({ page }) => {
  await page.goto('/');
  await waitForTerminalReady(page);
  await runCommand(page, 'glow /blogs/notes/hello-terminal.md');
  const imageLayer = page.locator('canvas.xterm-image-layer');
  await expect(imageLayer).toHaveCount(1);

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
});
