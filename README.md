# Neko Terminal Homepage

A static personal homepage built as a read-only Linux-inspired terminal. It uses
React, TypeScript, Vite, and xterm.js, including iTerm2 inline image support.

## Development

```bash
npm install
npm run dev
```

Useful verification commands:

```bash
npm test
npm run test:e2e
npm run build
```

## Content

- Add Markdown and image assets anywhere under `blogs/`. The directory is
  recursively mounted at `/blogs` during the Vite build.
- Add other virtual root files and directories under `content/`. For example,
  `content/help` becomes `/help`.
- Edit the prompt, terminal sizing, active theme, and image limits in
  `config.toml`.
- Add or edit color palettes in `src/themes/`; the active palette is selected by
  `terminal.theme` in `config.toml`.

Available palettes are `tokyonight-night`, `tokyonight-day`, `gruvbox-dark`,
`gruvbox-light`, `molokai-dark`, and `molokai-light`.

Use `cat` to read Markdown source and `render FILE.md` to render terminal-formatted
Markdown with MathJax formula blocks, Mermaid fenced code blocks, and local or
HTTPS images. Literal Unicode Emoji and GitHub-style shortcodes such as
`:rocket:` are supported. The terminal bundles Nerd Font and Emoji fallback
fonts, so visitors do not need to install them locally. `render` accepts one
`.md` file and is intentionally unavailable in pipelines.

## Deployment

`.github/workflows/deploy-pages.yml` tests and builds pushes to `main` or
`master`, then deploys the `dist/` artifact with GitHub Pages Actions. In the
repository settings, set Pages source to **GitHub Actions**.
