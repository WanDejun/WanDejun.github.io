import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cp, readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { responseMimeForPath } from './src/filesystem/mime';

const slideRoot = fileURLToPath(new URL('./content/slide', import.meta.url));

// Slides bypass Vite's asset rewriting so frameworks such as Reveal.js can
// keep resolving CSS, scripts, fonts, and media relative to their index.html.
function staticSlides(): Plugin {
  return {
    name: 'static-slides',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        } catch {
          next();
          return;
        }
        if (pathname !== '/slide' && !pathname.startsWith('/slide/')) {
          next();
          return;
        }

        const relativePath = pathname.replace(/^\/slide\/?/, '');
        let filePath = resolve(slideRoot, relativePath);
        if (filePath !== slideRoot && !filePath.startsWith(`${slideRoot}${sep}`)) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }
        try {
          if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, 'index.html');
          const body = await readFile(filePath);
          response.setHeader('Content-Type', responseMimeForPath(filePath));
          response.end(body);
        } catch {
          response.statusCode = 404;
          response.end('Not Found');
        }
      });
    },
    async writeBundle(options) {
      if (options.dir) await cp(slideRoot, resolve(options.dir, 'slide'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), staticSlides()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@xterm/')) return 'terminal';
          if (id.includes('/node_modules/highlight.js/') || id.includes('/node_modules/marked/')) return 'markdown';
          if (id.includes('/node_modules/react')) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
