---
name: verify-project
description: Select and run repository validation for React, TypeScript, Vite, xterm.js, shell, Markdown, content, and deployment changes. Use when asked to run tests, check work before a commit or push, diagnose CI failures, or report whether a change is ready.
---

# Verify Project

## Establish Scope

Read `AGENTS.md`, `package.json`, and `git status --short`. Inspect both staged and unstaged diffs so the checks cover all pending behavior without changing unrelated files.

## Choose Checks

- Run `npm test` for every TypeScript logic change. Unit tests cover parser, filesystem, shell, configuration, startup URLs, formulas, and completion layout.
- Run `npm run build` for source, configuration, assets, content manifests, themes, or deployment changes. Confirm required public/static files exist under `dist/` when relevant.
- Run `npm run test:e2e -- --project=desktop` for terminal input, startup rendering, URL parameters, themes, slides, images, Mermaid, MathJax, or layout.
- Run full `npm run test:e2e` before a push or when responsive/focus behavior changes; it executes desktop and mobile projects.
- Run `git diff --check` before handoff or commit.

Use a focused Playwright filter while iterating:

```bash
npm run test:e2e -- --project=desktop -g "share links"
```

Follow it with the broader affected project after the focused test passes.

## Interpret Results

Wait for every started process to finish. Report exact test counts and commands. Treat nonzero exits as failures; distinguish existing Vite chunk-size warnings from build failures. When a check fails, identify the first actionable cause and inspect its artifacts before editing code.

Do not edit `dist/`, `playwright-report/`, `test-results/`, or `*.tsbuildinfo`. Do not claim unrun checks passed. Mention residual risk when browser tests, network-dependent assets, or mobile projects were skipped.
