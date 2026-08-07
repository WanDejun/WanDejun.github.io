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

- Add Markdown posts and their images under `content/posts/`; project-oriented
  articles belong under `content/project/`.
- Add standalone HTML presentations under `content/slide/NAME/index.html`.
  These directories are copied unchanged so local CSS, JavaScript, and image
  paths continue to work. Open them with `render /slide/NAME/index.html`.
- Content is exposed through the virtual filesystem. Most directories retain
  their names; `content/posts/example.md` becomes `/post/example.md`.
- Share any Markdown file or slide with `?blog=/path/to/file.md` or
  `?blog=/slide/NAME/index.html`. Valid links start in the target's directory;
  missing targets show a terminal 404 and start at `/`.
- Add `&window=true` to a Markdown link to open it in a separate window. Slides
  always open in their floating document window.
- Generate a complete link from the terminal with `share /path/to/file.md`, or
  add `--theme gruvbox-light` and `--window` when needed.
- Select a startup palette with `?theme=gruvbox-light`. Unknown theme names
  fall back to the `terminal.theme` value in `config.toml`.
- Edit the prompt, terminal sizing, active theme, and image limits in
  `config.toml`.
- Add or edit color palettes in `src/themes/`; the active palette is selected by
  `terminal.theme` in `config.toml`.

Available palettes are `tokyonight-night`, `tokyonight-day`, `gruvbox-dark`,
`gruvbox-light`, `molokai-dark`, and `molokai-light`.
Run `theme` to list them or `theme NAME` to switch palettes without reloading.

Use `cat` to read Markdown source and `render FILE.md` to render terminal-formatted
Markdown with MathJax formula blocks, Mermaid fenced code blocks, and local or
HTTPS images. Literal Unicode Emoji and GitHub-style shortcodes such as
`:rocket:` are supported. The terminal bundles Nerd Font and Emoji fallback
fonts, so visitors do not need to install them locally. `render` accepts one
Markdown file or slide `index.html` and is intentionally unavailable in pipelines.

## Deployment

`.github/workflows/deploy-pages.yml` tests and builds pushes to `main` or
`master`, then deploys the `dist/` artifact with GitHub Pages Actions. In the
repository settings, set Pages source to **GitHub Actions**.

## License

[![CC BY-NC 4.0](https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/by-nc.svg)](http://creativecommons.org/licenses/by-nc/4.0/)

This project is licensed under the **CC BY-NC 4.0** (Creative Commons Attribution-NonCommercial 4.0 International) License.

- **Share & Adapt**: You are free to copy, redistribute, modify, and build upon the material.
- **NonCommercial**: You may **not** use the material for commercial purposes.
- For full license details, please see the [LICENSE](LICENSE) file.
