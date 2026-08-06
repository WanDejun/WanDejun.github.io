import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import App from './App';
import { config } from './config';

document.title = config.site.title;

// Resolve the configured relative path against the current page so favicon
// URLs continue to work when GitHub Pages serves the site from a subdirectory.
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = new URL(config.site.favicon, document.baseURI).href;
document.head.appendChild(favicon);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
