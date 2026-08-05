import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { SVG } from '@mathjax/src/js/output/svg.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const document = mathjax.document('', {
  InputJax: new TeX(),
  // A local font cache keeps every generated SVG self-contained.
  OutputJax: new SVG({ fontCache: 'local' }),
});

export function formulaToSvg(source: string, display: boolean, color: string): string {
  const node = document.convert(source, { display });
  const markup = adaptor.outerHTML(node);
  const start = markup.indexOf('<svg');
  const end = markup.lastIndexOf('</svg>');
  if (start === -1 || end === -1) throw new Error('MathJax did not produce SVG output');

  // MathJax paths use currentColor, so make the terminal foreground explicit before rasterizing.
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#c0caf5';
  return markup.slice(start, end + 6).replace('<svg ', `<svg color="${safeColor}" `);
}
