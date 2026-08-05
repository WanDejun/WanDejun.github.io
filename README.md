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

Use `cat` to read Markdown source and `glow` to render terminal-formatted
Markdown with local or HTTPS images.

## Deployment

`.github/workflows/deploy-pages.yml` tests and builds pushes to `main` or
`master`, then deploys the `dist/` artifact with GitHub Pages Actions. In the
repository settings, set Pages source to **GitHub Actions**.
