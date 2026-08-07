---
name: add-shell-command
description: Add or modify commands in the repository's read-only virtual shell, including registration, completion, help text, pipeline behavior, structured terminal output, and tests. Use when implementing a new `/bin` command or changing an existing command contract.
---

# Add Shell Command

## Inspect First

Read `AGENTS.md`, `src/shell/types.ts`, `src/shell/Shell.ts`, and a neighboring command implementation. Check `git status --short` and preserve unrelated worktree changes.

## Implement the Command

1. Define exact arguments, exit codes, pipeline support, completion behavior, and side effects before editing.
2. Add simple filesystem commands to `src/shell/commands/fileCommands.ts`, text filters to `textCommands.ts`, or create a focused command file for richer behavior.
3. Export the command as `<name>Command` and register it in `src/shell/createRegistry.ts`. Registration automatically exposes it as `/bin/<name>` in the virtual filesystem.
4. Set `completion` only when useful: `files`, `directories`, `commands`, or `themes`. Commands without a policy intentionally return no candidates.
5. Update `content/static/help`, plus `README.md` or `content/static/welcome.md` when the command changes a visitor-facing workflow.

## Preserve Shell Contracts

- Keep the shell read-only. Normalize paths through `context.fs` and validate node type/MIME before reading.
- Return pipeline data in `stdout`; use `stderr` with `error(command, message)` for failures.
- Use structured `chunks` only for final terminal effects or trusted ANSI/image/document output. Do not leak rich chunks into pipeline data.
- Reject unsupported operators or pipeline placement explicitly when a command has browser-only side effects.
- Use `context.themeName`, `themeNames()`, and other injected context instead of importing mutable UI state.

## Test and Verify

Add command behavior and failure cases to `tests/shell.test.ts`. Add parser or filesystem tests only when those contracts change. Add Playwright coverage for focus, startup URLs, completion interaction, visual output, or browser integration.

Run:

```bash
npm test
npm run build
git diff --check
```

Run `npm run test:e2e -- --project=desktop` for terminal interaction changes and full `npm run test:e2e` when behavior can differ on mobile.
