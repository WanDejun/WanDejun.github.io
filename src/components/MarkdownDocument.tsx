import { Fragment, createElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type Token, type Tokens } from 'marked';
import { emojify } from 'node-emoji';
import type { VirtualFileSystem } from '../filesystem/VirtualFileSystem';
import type { AppTheme } from '../types';
import { createMarkdownParser, type FormulaToken } from '../markdown/markdownParser';
import { resolveMarkdownImage } from '../markdown/resolveImage';

type InlineToken = Tokens.Generic & {
  tokens?: InlineToken[];
  text?: string;
  href?: string;
  title?: string | null;
  raw?: string;
};

interface MarkdownDocumentProps {
  path: string;
  fs: VirtualFileSystem;
  theme: AppTheme;
}

const parser = createMarkdownParser();

export function MarkdownDocument({ path, fs, theme }: MarkdownDocumentProps) {
  const source = useMemo(() => {
    try {
      return fs.readText(path);
    } catch (error) {
      return `Unable to read ${path}: ${(error as Error).message}`;
    }
  }, [fs, path]);
  const tokens = useMemo(() => parser.lexer(source), [source]);

  return (
    <article className="markdown-document" tabIndex={-1}>
      {renderBlocks(tokens, path, fs, theme)}
    </article>
  );
}

function renderBlocks(tokens: Token[], path: string, fs: VirtualFileSystem, theme: AppTheme): ReactNode[] {
  return tokens.map((token, index) => (
    <Fragment key={`${token.type}-${index}`}>{renderBlock(token, path, fs, theme)}</Fragment>
  ));
}

function renderBlock(token: Token, path: string, fs: VirtualFileSystem, theme: AppTheme): ReactNode {
  switch (token.type) {
    case 'space':
      return null;
    case 'heading': {
      const heading = token as Tokens.Heading;
      const tag = `h${Math.min(6, Math.max(1, heading.depth))}` as keyof HTMLElementTagNameMap;
      return createElement(tag, null, renderInline(heading.tokens as InlineToken[], path, fs, theme));
    }
    case 'paragraph': {
      const paragraph = token as Tokens.Paragraph;
      return <p>{renderInline(paragraph.tokens as InlineToken[], path, fs, theme)}</p>;
    }
    case 'blockquote': {
      const quote = token as Tokens.Blockquote;
      return <blockquote>{renderBlocks(quote.tokens, path, fs, theme)}</blockquote>;
    }
    case 'list': {
      const list = token as Tokens.List;
      const List = list.ordered ? 'ol' : 'ul';
      return (
        <List start={list.ordered && list.start !== '' ? list.start : undefined}>
          {list.items.map((item, index) => (
            <li className={item.task ? 'markdown-task' : undefined} key={`${item.type}-${index}`}>
              {item.task && <input type="checkbox" checked={Boolean(item.checked)} disabled aria-label={item.checked ? 'Completed' : 'Incomplete'} />}
              {renderBlocks(item.tokens, path, fs, theme)}
            </li>
          ))}
        </List>
      );
    }
    case 'code': {
      const code = token as Tokens.Code;
      if (code.lang?.trim().split(/\s+/)[0].toLowerCase() === 'mermaid') {
        return <MarkdownDiagram source={code.text} theme={theme} />;
      }
      return (
        <pre>
          <code data-language={code.lang || undefined}>{code.text}</code>
        </pre>
      );
    }
    case 'formula': {
      const formula = token as FormulaToken;
      return <MarkdownFormula source={formula.text} display={formula.display} theme={theme} />;
    }
    case 'table': {
      const table = token as Tokens.Table;
      return (
        <div className="markdown-table-wrap">
          <table>
            <thead>
              <tr>{table.header.map((cell, index) => <th key={index} style={{ textAlign: table.align?.[index] ?? undefined }}>{renderInline(cell.tokens as InlineToken[], path, fs, theme)}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, index) => <td key={index} style={{ textAlign: table.align?.[index] ?? undefined }}>{renderInline(cell.tokens as InlineToken[], path, fs, theme)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'hr':
      return <hr />;
    case 'html': {
      const text = stripHtml((token as Tokens.HTML).text).trim();
      return text ? <p className="markdown-html-text">{emojify(text)}</p> : null;
    }
    case 'text':
      return <>{renderInline((token as InlineToken).tokens ?? [token as InlineToken], path, fs, theme)}</>;
    default:
      return null;
  }
}

function renderInline(tokens: InlineToken[], path: string, fs: VirtualFileSystem, theme: AppTheme): ReactNode[] {
  return tokens.map((token, index) => {
    const nested = token.tokens ?? [];
    const text = token.text ?? token.raw ?? '';
    switch (token.type) {
      case 'strong':
        return <strong key={index}>{renderInline(nested, path, fs, theme)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(nested, path, fs, theme)}</em>;
      case 'del':
        return <del key={index}>{renderInline(nested, path, fs, theme)}</del>;
      case 'codespan':
        return <code className="markdown-inline-code" key={index}>{text}</code>;
      case 'link': {
        const href = safeHref(token.href ?? '');
        if (!href) return <Fragment key={index}>{renderInline(nested, path, fs, theme)}</Fragment>;
        return <a href={href} title={token.title ?? undefined} key={index}>{renderInline(nested, path, fs, theme)}</a>;
      }
      case 'image': {
        const alt = text || 'image';
        const resolved = resolveMarkdownImage(token.href ?? '', path, fs);
        if ('error' in resolved) return <span className="markdown-image-error" key={index}>[image: {alt}; {resolved.error}]</span>;
        return <img key={index} src={resolved.source} alt={alt} loading="lazy" />;
      }
      case 'br':
        return <br key={index} />;
      case 'html':
        return <Fragment key={index}>{emojify(stripHtml(text))}</Fragment>;
      default:
        return <Fragment key={index}>{nested.length ? renderInline(nested, path, fs, theme) : emojify(text)}</Fragment>;
    }
  });
}

function safeHref(value: string): string | undefined {
  const href = value.trim();
  return /^(?:javascript|data|vbscript):/i.test(href) ? undefined : href;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function MarkdownFormula({ source, display, theme }: { source: string; display: boolean; theme: AppTheme }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const color = theme.terminal.foreground ?? '#c0caf5';

  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setError('');
    void import('../markdown/renderFormula')
      .then(({ formulaToSvg }) => formulaToSvg(source, display, color))
      .then((value) => { if (!cancelled) setSvg(value); })
      .catch((exception: unknown) => { if (!cancelled) setError(exception instanceof Error ? exception.message : String(exception)); });
    return () => { cancelled = true; };
  }, [color, display, source]);

  if (error) return <p className="markdown-render-error">[formula unavailable: {error}]</p>;
  if (!svg) return <p className="markdown-render-pending">Rendering formula...</p>;
  // The SVG is generated locally by MathJax, never taken from document content.
  return <div className="markdown-formula" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MarkdownDiagram({ source, theme }: { source: string; theme: AppTheme }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const palette = {
    background: theme.page.panel,
    foreground: theme.terminal.foreground ?? '#c0caf5',
    primary: theme.markdown.heading,
    secondary: theme.markdown.code,
    border: theme.markdown.border,
    line: theme.markdown.muted,
  };

  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setError('');
    void import('../markdown/renderDiagram')
      .then(({ diagramToSvg }) => diagramToSvg(source, palette))
      .then((value) => { if (!cancelled) setSvg(value); })
      .catch((exception: unknown) => { if (!cancelled) setError(exception instanceof Error ? exception.message : String(exception)); });
    return () => { cancelled = true; };
  }, [palette.background, palette.border, palette.foreground, palette.line, palette.primary, palette.secondary, source]);

  if (error) return <p className="markdown-render-error">[diagram unavailable: {error}]</p>;
  if (!svg) return <p className="markdown-render-pending">Rendering diagram...</p>;
  // Mermaid returns an SVG generated from trusted Markdown source and palette values.
  return <div className="markdown-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
