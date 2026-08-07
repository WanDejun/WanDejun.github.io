---
name: publish-content
description: Add or reorganize Markdown posts, post images and binary assets, project articles, and standalone HTML slide decks in this repository. Use when publishing content, choosing asset locations, preserving virtual paths, or validating content rendering and share URLs.
---

# Publish Content

## Select the Destination

- Put blog Markdown under `content/posts/`; it maps to virtual `/post`, not `/posts`.
- Put project-oriented articles under `content/project/`; they map to `/project`.
- Put standalone presentations under `content/slide/<name>/index.html`; they map to `/slide/<name>/index.html`.
- Keep shell documents such as `/static/help` and `/static/welcome.md` under `content/static/`.
- Reserve `public/resources/` for site-wide UI assets such as the favicon, not article-specific media.

## Organize Article Assets

Co-locate new posts and their assets when practical:

```text
content/posts/example/
├── index.md
└── assets/
    └── diagram.png
```

Reference the image as `![Diagram](./assets/diagram.png)` and share the article as `/post/example/index.md`. To preserve an existing flat URL such as `/post/example.md`, keep the Markdown file in place and use `content/posts/assets/example/` for its media.

The content manifest discovers text and binary files automatically. Binary files have URLs but no text payload, so `cat` reports `Binary file`; supported images render through the Markdown image path.

## Keep Slides Self-Contained

Keep slide CSS, JavaScript, fonts, images, and other dependencies inside the slide directory and reference them with relative URLs. Vite copies slide trees unchanged. Do not rely on source-only paths or absolute repository paths.

## Preserve Public Links

Avoid renaming published post paths without calling out broken share links. The `blog` GET parameter and `share` command accept existing Markdown files under `/post`. Use relative paths for local assets so GitHub Pages subpath deployment continues to work.

## Verify

Run `npm run build` after adding content or binary assets. Run `npm test` when path mapping, MIME handling, or rendering code changes. Run relevant Playwright tests for Markdown images, MathJax, Mermaid, Emoji, or slide focus behavior, then finish with `git diff --check`.
