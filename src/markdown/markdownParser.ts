import { Marked, type TokenizerExtension, type Tokens } from 'marked';

export type FormulaToken = Tokens.Generic & { type: 'formula'; text: string; display: true };

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

export function createMarkdownParser(): Marked {
  return new Marked({ gfm: true, breaks: false }).use({ extensions: [formulaExtension] });
}
