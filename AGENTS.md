# Repository Guidelines

## Project Structure & Module Organization

This is a React, TypeScript, Vite, and xterm.js static site. Application code lives in `src/`:

- `src/components/` contains the terminal UI and browser integration.
- `src/shell/` contains parsing, command execution, and command modules.
- `src/filesystem/` builds and exposes the read-only virtual filesystem.
- `src/markdown/` renders Markdown as ANSI and image output.
- `src/themes/` contains TOML color palettes.

Unit tests live in `tests/`; Playwright scenarios live in `e2e/`. Files under `content/` populate the virtual filesystem: `content/posts/` is exposed as `/post`, while `content/project/` and `content/slide/` retain their names. Edit user-facing settings in `config.toml`. Do not edit generated `dist/` output.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm run dev`: start the Vite development server.
- `npm run build`: type-check with TypeScript and create the production bundle.
- `npm test`: run all Vitest unit tests once.
- `npm run test:watch`: run Vitest interactively while developing.
- `npm run test:e2e`: run Playwright tests in desktop and mobile projects.
- `npm run preview`: serve the production build locally.

Run `npm test` and `npm run build` before submitting every change. Run E2E tests for terminal interaction, responsive layout, or image-rendering changes.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes in TypeScript, semicolons, and strict TypeScript types. Name React components and classes in `PascalCase`; use `camelCase` for functions and variables. Command exports follow `<name>Command`, for example `grepCommand`. Keep comments focused on non-obvious constraints and design decisions.

No formatter or linter is configured. Match surrounding code and use `git diff --check` to catch whitespace problems.

## Testing Guidelines

Use Vitest files named `*.test.ts` and Playwright files named `*.spec.ts`. Cover parser boundaries, filesystem behavior, pipeline output, and error paths. Browser tests should verify both desktop and mobile behavior; image tests must inspect the xterm image canvas rather than only checking text.

## Commit & Pull Request Guidelines

There is no existing Git history or established commit convention. Use concise imperative subjects, such as `Add tab completion for blog paths`, and keep commits focused. Pull requests should explain behavior changes, list verification commands, link relevant issues, and include desktop/mobile screenshots for visual changes.

## Security & Configuration Tips

The shell must remain read-only. Sanitize user-controlled text before writing it to xterm, and emit ANSI or OSC sequences only through trusted internal renderers. Never commit secrets; GitHub Pages deployment requires no runtime credentials.
