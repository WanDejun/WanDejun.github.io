import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import typescript from 'highlight.js/lib/languages/typescript';
import { Marked, type Token, type TokenizerExtension, type Tokens } from 'marked';
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
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);

export interface MarkdownRenderResult {
  chunks: OutputChunk[];
  plainText: string;
}

export class TerminalMarkdownRenderer {
  private readonly marked = new Marked({ gfm: true, breaks: false }).use({ extensions: [formulaExtension] });

  render(source: string, sourcePath: string, context: CommandContext): MarkdownRenderResult {
    const tokens = this.marked.lexer(source);
    // Maintain rich terminal output and a control-sequence-free pipe representation together.
    const chunks: OutputChunk[] = [];
    const plain: string[] = [];

    const push = (styled: string, plainText = stripAnsi(styled)) => {
      chunks.push({ type: 'ansi', value: styled });
      plain.push(plainText);
    };

    for (const token of tokens) {
      switch (token.type) {
        case 'space':
          break;
        case 'heading': {
          const heading = token as Tokens.Heading;
          const marker = heading.depth === 1 ? '█' : '▸';
          const text = this.inlineText(heading.tokens as InlineToken[], context, false);
          push(`${paint(marker, context.theme.markdown.heading, ansi.bold)} ${paint(text, context.theme.markdown.heading, ansi.bold)}\n\n`, `${marker} ${text}\n\n`);
          break;
        }
        case 'paragraph': {
          const paragraph = token as Tokens.Paragraph;
          const rendered = this.renderInline(paragraph.tokens as InlineToken[], sourcePath, context);
          chunks.push(...rendered.chunks, { type: 'ansi', value: '\n\n' });
          plain.push(rendered.plainText, '\n\n');
          break;
        }
        case 'blockquote': {
          const quote = token as Tokens.Blockquote;
          const text = sanitizeTerminalText(this.tokensToPlain(quote.tokens)).trim();
          const lines = text.split('\n').map((line) => `${paint('│', context.theme.markdown.quote)} ${paint(line, context.theme.markdown.quote, ansi.italic)}`);
          push(`${lines.join('\n')}\n\n`, `${text.split('\n').map((line) => `| ${line}`).join('\n')}\n\n`);
          break;
        }
        case 'list': {
          const list = token as Tokens.List;
          const lines = list.items.map((item, index) => {
            const marker = list.ordered ? `${Number(list.start) + index}.` : '•';
            const text = sanitizeTerminalText(this.tokensToPlain(item.tokens)).trim().replace(/\n+/g, ' ');
            return `${paint(marker, context.theme.markdown.heading)} ${text}`;
          });
          push(`${lines.join('\n')}\n\n`, `${lines.map(stripAnsi).join('\n')}\n\n`);
          break;
        }
        case 'code': {
          const code = token as Tokens.Code;
          const label = code.lang ? ` ${code.lang} ` : ' code ';
          const ruleLength = Math.max(4, Math.min(context.columns - label.length - 2, 42));
          push(`${paint(`─${label}${'─'.repeat(ruleLength)}`, context.theme.markdown.border)}\n`, `---${label}---\n`);
          const highlighted = this.highlight(code.text, code.lang, context);
          push(`${highlighted}\n${paint('─'.repeat(Math.min(context.columns - 1, 56)), context.theme.markdown.border)}\n\n`, `${code.text}\n---\n\n`);
          break;
        }
        case 'formula': {
          const formula = token as FormulaToken;
          chunks.push({ type: 'formula', source: formula.text, display: formula.display });
          chunks.push({ type: 'ansi', value: '\n\n' });
          plain.push(`$$\n${formula.text}\n$$\n\n`);
          break;
        }
        case 'table': {
          const table = token as Tokens.Table;
          const rows = [table.header, ...table.rows].map((row) => row.map((cell) => sanitizeTerminalText(cell.text).replace(/\s+/g, ' ').trim()));
          const tableText = renderTable(rows, context.columns);
          push(`${paint(tableText, context.theme.terminal.foreground ?? '#c0caf5')}\n\n`, `${tableText}\n\n`);
          break;
        }
        case 'hr': {
          const rule = '─'.repeat(Math.max(8, Math.min(context.columns - 1, 64)));
          push(`${paint(rule, context.theme.markdown.border)}\n\n`, `${rule}\n\n`);
          break;
        }
        case 'html': {
          const html = token as Tokens.HTML;
          const text = sanitizeTerminalText(html.text.replace(/<[^>]*>/g, '')).trim();
          if (text) push(`${paint(text, context.theme.markdown.muted)}\n\n`, `${text}\n\n`);
          break;
        }
        default: {
          const text = sanitizeTerminalText((token as Token & { raw?: string }).raw ?? '');
          if (text.trim()) push(`${text}\n`, `${text}\n`);
        }
      }
    }

    return { chunks, plainText: plain.join('').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n' };
  }

  private renderInline(tokens: InlineToken[], sourcePath: string, context: CommandContext): MarkdownRenderResult {
    const chunks: OutputChunk[] = [];
    let plainText = '';
    for (const token of tokens) {
      const text = sanitizeTerminalText(token.text ?? token.raw ?? '');
      switch (token.type) {
        case 'strong':
          chunks.push({ type: 'ansi', value: paint(this.inlineText(token.tokens ?? [], context, false), context.theme.markdown.strong, ansi.bold) });
          plainText += this.inlineText(token.tokens ?? [], context, false);
          break;
        case 'em':
          chunks.push({ type: 'ansi', value: paint(this.inlineText(token.tokens ?? [], context, false), context.theme.markdown.emphasis, ansi.italic) });
          plainText += this.inlineText(token.tokens ?? [], context, false);
          break;
        case 'del':
          chunks.push({ type: 'ansi', value: `${ansi.strike}${this.inlineText(token.tokens ?? [], context, false)}${ansi.reset}` });
          plainText += this.inlineText(token.tokens ?? [], context, false);
          break;
        case 'codespan':
          chunks.push({ type: 'ansi', value: paint(` ${text} `, context.theme.markdown.code) });
          plainText += `\`${text}\``;
          break;
        case 'link': {
          const label = this.inlineText(token.tokens ?? [], context, false) || text;
          const href = sanitizeTerminalText(token.href ?? '');
          const target = label === href ? '' : ` ${paint(`<${href}>`, context.theme.markdown.muted)}`;
          chunks.push({ type: 'ansi', value: `${paint(label, context.theme.markdown.link, ansi.underline)}${target}` });
          plainText += label === href ? label : `${label} <${href}>`;
          break;
        }
        case 'image': {
          const href = token.href ?? '';
          const alt = text || 'image';
          const resolved = this.resolveImage(href, sourcePath, context);
          if (resolved.error) {
            const message = `[image: ${alt}; ${resolved.error}; ${href}]`;
            chunks.push({ type: 'ansi', value: paint(message, context.theme.markdown.error) });
            plainText += message;
          } else {
            chunks.push({ type: 'ansi', value: `\n${paint(`[image: ${alt}]`, context.theme.markdown.muted)}\n` });
            chunks.push({ type: 'image', source: resolved.source!, alt, name: basename(href) || 'image' });
            chunks.push({ type: 'ansi', value: '\n' });
            plainText += `[image: ${alt}; ${href}]`;
          }
          break;
        }
        case 'br':
          chunks.push({ type: 'ansi', value: '\n' });
          plainText += '\n';
          break;
        default:
          chunks.push({ type: 'ansi', value: text });
          plainText += text;
      }
    }
    return { chunks, plainText };
  }

  private inlineText(tokens: InlineToken[], _context: CommandContext, includeLinks: boolean): string {
    return sanitizeTerminalText(tokens.map((token) => {
      if (token.type === 'link' && includeLinks) return `${token.text} <${token.href}>`;
      return token.tokens ? this.inlineText(token.tokens, _context, includeLinks) : token.text ?? token.raw ?? '';
    }).join(''));
  }

  private tokensToPlain(tokens: Token[]): string {
    return tokens.map((token) => {
      if ('tokens' in token && Array.isArray(token.tokens)) return this.tokensToPlain(token.tokens as Token[]);
      if ('items' in token && Array.isArray(token.items)) return token.items.map((item) => this.tokensToPlain(item.tokens)).join('\n');
      return 'text' in token && typeof token.text === 'string' ? token.text : '';
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

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
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
