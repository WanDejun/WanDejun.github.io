# Repository Guidelines

## Project Structure & Module Organization

This repository is a React, TypeScript, Vite, and xterm.js static site. Application code lives in `src/`:

- `components/`: terminal UI, completion pager, and document overlay.
- `shell/`: parser, registry, command implementations, and ANSI helpers.
- `filesystem/`: read-only virtual filesystem, manifest, and MIME handling.
- `markdown/`: ANSI Markdown, MathJax, Mermaid, Emoji, and code highlighting.
- `themes/`: TOML palettes. `startupRequest.ts` validates `blog` and `theme` URL parameters.

Tests live in `tests/` (Vitest) and `e2e/` (Playwright). `content/posts/` maps to `/post`; project and slide directories retain their names. Slides are copied unchanged, so keep their assets self-contained with relative URLs. Edit defaults in `config.toml`. Do not edit generated output, reports, or `*.tsbuildinfo` files.

## Build, Test, and Development Commands

- `npm ci`: install locked dependencies.
- `npm run dev -- --host 127.0.0.1`: start Vite locally.
- `npm run build`: type-check and build `dist/`.
- `npm test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: run desktop and mobile Playwright projects.
- `npm run preview`: serve `dist/` locally.

Run unit tests and the build before submission. Add relevant E2E coverage for terminal interaction, layout, startup URLs, slides, or rich rendering. CI runs unit tests, desktop E2E, build, and Pages deployment on `main` and `master`.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, semicolons, and strict types. Use `PascalCase` for components/classes and `camelCase` for functions/variables. Export commands as `<name>Command`, such as `grepCommand`. Comment only on non-obvious constraints, trust boundaries, or browser behavior. No formatter or linter is configured; match surrounding code and run `git diff --check`.

## Testing Guidelines

Name Vitest files `*.test.ts` and Playwright files `*.spec.ts`. Cover parser boundaries, filesystem normalization, pipelines, URL parameters, and errors. There is no coverage threshold. Rich-rendering tests must inspect the xterm image canvas and account for scrollback. Verify interactions on desktop and mobile.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit pattern, for example `feat(markdown): render nested lists` or `fix(terminal): preserve prompt descenders`. Keep commits focused. Pull requests should explain behavior changes, list verification commands, link issues, and include desktop/mobile screenshots for visual changes.

## Security & Configuration Tips

Keep the shell read-only. Normalize and validate URL/content paths before filesystem access. Sanitize untrusted text before writing to xterm; emit ANSI or OSC sequences only from trusted renderers. Never commit secrets or local `.env` files.
