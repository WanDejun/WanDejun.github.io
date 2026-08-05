import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import typescript from 'highlight.js/lib/languages/typescript';
import { Marked, type Token, type TokenizerExtension, type Tokens } from 'marked';
import { emojify } from 'node-emoji';
import { basename, dirname } from '../filesystem/VirtualFileSystem';
import { ansi, paint, sanitizeTerminalText } from '../shell/ansi';
import type { CommandContext } from '../shell/types';
import type { OutputChunk } from '../types';

type InlineToken = Tokens.Generic & { tokens?: InlineToken[]; text?: string; href?: string; raw?: string };
type FormulaToken = Tokens.Generic & { type: 'formula'; text: string; display: true };

const formulaExtension: TokenizerExtension = {
  name: 'formula',
  level: 'block',
  start(source) {
    return source.match(/^\$\$[ \t]*$/m)?.index;
  },
  tokenizer(source) {
    // Requiring delimiters on their own lines avoids treating ordinary dollar signs as TeX.
    const match = /^\$\$[ \t]*\n([\s\S]+?)\n\$\$(?:[ \t]*\n|[ \t]*$)/.exec(source);
    if (!match) return undefined;
    return { type: 'formula', raw: match[0], text: match[1].trim(), display: true };
  },
};

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('golang', go);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);

export class TerminalMarkdownRenderer {
  private readonly marked = new Marked({ gfm: true, breaks: false }).use({ extensions: [formulaExtension] });

  render(source: string, sourcePath: string, context: CommandContext): OutputChunk[] {
    const tokens = this.marked.lexer(source);
    const chunks: OutputChunk[] = [];
    const push = (value: string) => chunks.push({ type: 'ansi' as const, value });

    for (const token of tokens) {
      switch (token.type) {
        case 'space':
          break;
        case 'heading': {
          const heading = token as Tokens.Heading;
          const markers = ['█', '▸', '▹', '•', '·', '·'];
          const marker = markers[heading.depth - 1];
          const indent = '  '.repeat(Math.max(0, heading.depth - 2));
          const text = this.inlineText(heading.tokens as InlineToken[]);
          push(`${indent}${paint(marker, context.theme.markdown.heading, ansi.bold)} ${paint(text, context.theme.markdown.heading, ansi.bold)}\n\n`);
          break;
        }
        case 'paragraph': {
          const paragraph = token as Tokens.Paragraph;
          chunks.push(...this.renderInline(paragraph.tokens as InlineToken[], sourcePath, context), { type: 'ansi', value: '\n\n' });
          break;
        }
        case 'blockquote': {
          const quote = token as Tokens.Blockquote;
          const text = sanitizeTerminalText(this.tokensToPlain(quote.tokens)).trim();
          const lines = text.split('\n').map((line) => `${paint('│', context.theme.markdown.quote)} ${paint(line, context.theme.markdown.quote, ansi.italic)}`);
          push(`${lines.join('\n')}\n\n`);
          break;
        }
        case 'list': {
          const list = token as Tokens.List;
          const lines = this.renderList(list, context);
          push(`${lines.join('\n')}\n\n`);
          break;
        }
        case 'code': {
          const code = token as Tokens.Code;
          if (code.lang?.trim().split(/\s+/)[0].toLowerCase() === 'mermaid') {
            chunks.push({ type: 'diagram', source: code.text });
            chunks.push({ type: 'ansi', value: '\n\n' });
            break;
          }
          const label = code.lang ? ` ${code.lang} ` : ' code ';
          const ruleLength = Math.max(4, Math.min(context.columns - label.length - 2, 42));
          push(`${paint(`─${label}${'─'.repeat(ruleLength)}`, context.theme.markdown.border)}\n`);
          const highlighted = this.highlight(code.text, code.lang, context);
          push(`${highlighted}\n${paint('─'.repeat(Math.min(context.columns - 1, 56)), context.theme.markdown.border)}\n\n`);
          break;
        }
        case 'formula': {
          const formula = token as FormulaToken;
          chunks.push({ type: 'formula', source: formula.text, display: formula.display });
          chunks.push({ type: 'ansi', value: '\n\n' });
          break;
        }
        case 'table': {
          const table = token as Tokens.Table;
          const rows = [table.header, ...table.rows].map((row) => row.map((cell) => (
            this.inlineText(cell.tokens as InlineToken[]).replace(/\s+/g, ' ').trim()
          )));
          const tableText = renderTable(rows, context.columns);
          push(`${paint(tableText, context.theme.terminal.foreground ?? '#c0caf5')}\n\n`);
          break;
        }
        case 'hr': {
          const rule = '─'.repeat(Math.max(8, Math.min(context.columns - 1, 64)));
          push(`${paint(rule, context.theme.markdown.border)}\n\n`);
          break;
        }
        case 'html': {
          const html = token as Tokens.HTML;
          const text = emojify(sanitizeTerminalText(html.text.replace(/<[^>]*>/g, ''))).trim();
          if (text) push(`${paint(text, context.theme.markdown.muted)}\n\n`);
          break;
        }
        default: {
          const text = sanitizeTerminalText((token as Token & { raw?: string }).raw ?? '');
          if (text.trim()) push(`${text}\n`);
        }
      }
    }

    return chunks;
  }

  private renderInline(tokens: InlineToken[], sourcePath: string, context: CommandContext): OutputChunk[] {
    const chunks: OutputChunk[] = [];
    for (const token of tokens) {
      const text = sanitizeTerminalText(token.text ?? token.raw ?? '');
      switch (token.type) {
        case 'strong':
          chunks.push({ type: 'ansi', value: paint(this.inlineText(token.tokens ?? []), context.theme.markdown.strong, ansi.bold) });
          break;
        case 'em':
          chunks.push({ type: 'ansi', value: paint(this.inlineText(token.tokens ?? []), context.theme.markdown.emphasis, ansi.italic) });
          break;
        case 'del':
          chunks.push({ type: 'ansi', value: `${ansi.strike}${this.inlineText(token.tokens ?? [])}${ansi.reset}` });
          break;
        case 'codespan':
          chunks.push({ type: 'ansi', value: paint(` ${text} `, context.theme.markdown.code) });
          break;
        case 'link': {
          const label = this.inlineText(token.tokens ?? []) || text;
          const href = sanitizeTerminalText(token.href ?? '');
          const target = label === href ? '' : ` ${paint(`<${href}>`, context.theme.markdown.muted)}`;
          chunks.push({ type: 'ansi', value: `${paint(label, context.theme.markdown.link, ansi.underline)}${target}` });
          break;
        }
        case 'image': {
          const href = token.href ?? '';
          const alt = text || 'image';
          const resolved = this.resolveImage(href, sourcePath, context);
          if (resolved.error) {
            const message = `[image: ${alt}; ${resolved.error}; ${href}]`;
            chunks.push({ type: 'ansi', value: paint(message, context.theme.markdown.error) });
          } else {
            chunks.push({ type: 'ansi', value: `\n${paint(`[image: ${alt}]`, context.theme.markdown.muted)}\n` });
            chunks.push({ type: 'image', source: resolved.source!, alt, name: basename(href) || 'image' });
            chunks.push({ type: 'ansi', value: '\n' });
          }
          break;
        }
        case 'br':
          chunks.push({ type: 'ansi', value: '\n' });
          break;
        default:
          chunks.push({ type: 'ansi', value: emojify(text) });
      }
    }
    return chunks;
  }

  private inlineText(tokens: InlineToken[]): string {
    return sanitizeTerminalText(tokens.map((token) => {
      if (token.tokens) return this.inlineText(token.tokens);
      const text = token.text ?? token.raw ?? '';
      return token.type === 'codespan' ? text : emojify(text);
    }).join(''));
  }

  private renderList(list: Tokens.List, context: CommandContext, indent = ''): string[] {
    const lines: string[] = [];
    const start = typeof list.start === 'number' ? list.start : Number(list.start) || 1;

    list.items.forEach((item, index) => {
      const marker = list.ordered ? `${start + index}.` : '•';
      const continuationIndent = `${indent}${' '.repeat(marker.length + 1)}`;
      let hasText = false;

      for (const token of item.tokens) {
        if (token.type === 'space') {
          if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
          continue;
        }
        if (token.type === 'list') {
          lines.push(...this.renderList(token as Tokens.List, context, continuationIndent));
          continue;
        }

        const text = this.listTokenText(token).trim();
        if (!text) continue;
        for (const textLine of text.split('\n')) {
          const prefix = hasText
            ? continuationIndent
            : `${indent}${paint(marker, context.theme.markdown.heading)} `;
          lines.push(`${prefix}${textLine}`.trimEnd());
          hasText = true;
        }
      }
    });

    return lines;
  }

  private listTokenText(token: Token): string {
    if ((token.type === 'text' || token.type === 'paragraph')
      && 'tokens' in token && Array.isArray(token.tokens)) {
      return this.inlineText(token.tokens as InlineToken[]);
    }
    return sanitizeTerminalText(this.tokensToPlain([token]));
  }

  private tokensToPlain(tokens: Token[]): string {
    return tokens.map((token) => {
      if ('tokens' in token && Array.isArray(token.tokens)) return this.tokensToPlain(token.tokens as Token[]);
      if ('items' in token && Array.isArray(token.items)) return token.items.map((item) => this.tokensToPlain(item.tokens)).join('\n');
      if (!('text' in token) || typeof token.text !== 'string') return '';
      return token.type === 'codespan' || token.type === 'code' ? token.text : emojify(token.text);
    }).join('\n');
  }

  private resolveImage(href: string, sourcePath: string, context: CommandContext): { source?: string; error?: string } {
    if (/^https:\/\//i.test(href)) return { source: href };
    if (/^http:\/\//i.test(href)) return { source: href };
    if (/^[a-z]+:/i.test(href)) return { error: 'unsupported URL scheme' };
    try {
      // Markdown image paths are relative to the post, not to the current shell cwd.
      const path = context.fs.normalize(href, dirname(sourcePath));
      const node = context.fs.require(path);
      if (node.type !== 'file' || !node.mime.startsWith('image/')) return { error: 'not a supported image file' };
      return { source: context.fs.imageSource(path) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  private highlight(code: string, language: string | undefined, context: CommandContext): string {
    const safe = sanitizeTerminalText(code);
    let html: string;
    try {
      html = language && hljs.getLanguage(language)
        ? hljs.highlight(safe, { language }).value
        : hljs.highlightAuto(safe).value;
    } catch {
      return paint(safe, context.theme.markdown.code);
    }
    return highlightedHtmlToAnsi(html, context);
  }
}

function decodeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity] ?? entity);
}

function highlightedHtmlToAnsi(html: string, context: CommandContext): string {
  const colors: Record<string, string> = {
    keyword: context.theme.markdown.heading, selector: context.theme.markdown.heading,
    string: context.theme.markdown.code, number: context.theme.markdown.strong,
    comment: context.theme.markdown.muted, title: context.theme.markdown.link,
    function: context.theme.markdown.link, variable: context.theme.markdown.emphasis,
    literal: context.theme.markdown.strong, built_in: context.theme.markdown.quote,
  };
  // Remove Highlight.js markup before decoding entities so code like <T> is preserved.
  return decodeHtml(html
    .replace(/<span class="hljs-([^" ]+)[^"]*">/g, (_, className: string) => ansi.color(colors[className] ?? context.theme.markdown.code))
    .replace(/<\/span>/g, `${ansi.reset}${ansi.color(context.theme.markdown.code)}`)
    .replace(/<[^>]+>/g, ''));
}

function renderTable(rows: string[][], columns: number): string {
  if (!rows.length || !rows[0].length) return '';
  const columnCount = rows[0].length;
  // Reserve space for borders first, then divide the remaining terminal cells evenly.
  const available = Math.max(18, columns - (columnCount * 3 + 1));
  const maxWidth = Math.max(5, Math.floor(available / columnCount));
  const widths = Array.from({ length: columnCount }, (_, index) => Math.min(maxWidth, Math.max(3, ...rows.map((row) => [...(row[index] ?? '')].length))));
  const border = (left: string, middle: string, right: string) => `${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`;
  const renderRow = (row: string[]) => `│${widths.map((width, index) => ` ${(row[index] ?? '').slice(0, width).padEnd(width)} `).join('│')}│`;
  return [border('┌', '┬', '┐'), renderRow(rows[0]), border('├', '┼', '┤'), ...rows.slice(1).map(renderRow), border('└', '┴', '┘')].join('\n');
}
