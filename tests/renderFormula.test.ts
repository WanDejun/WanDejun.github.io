import { describe, expect, it } from 'vitest';
import { formulaToSvg } from '../src/markdown/renderFormula';

describe('formula rendering', () => {
  it('renders a multi-line loss function as SVG', () => {
    const source = String.raw`L(\theta)
= -\sum_{i=1}^{n}\log\left(
\frac{\exp(z_{i,y_i}/\tau)}
{\sum_{j=1}^{K}\exp(z_{i,j}/\tau)}
\right)
+ \lambda\left\|\theta\right\|_2^2`;
    const svg = formulaToSvg(source, true, '#c0caf5');

    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('color="#c0caf5"');
    expect(svg).not.toContain('data-mjx-error');
  });
});
