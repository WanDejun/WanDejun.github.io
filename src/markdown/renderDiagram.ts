import mermaid from 'mermaid';

export interface DiagramPalette {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  border: string;
  line: string;
}

let diagramId = 0;
let activePalette = '';

export async function diagramToSvg(source: string, palette: DiagramPalette): Promise<string> {
  const signature = JSON.stringify(palette);
  if (signature !== activePalette) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      // SVG foreignObject labels taint Canvas in Chromium and prevent PNG export.
      htmlLabels: false,
      themeVariables: {
        background: palette.background,
        primaryColor: palette.primary,
        primaryTextColor: palette.foreground,
        primaryBorderColor: palette.border,
        secondaryColor: palette.secondary,
        secondaryTextColor: palette.foreground,
        tertiaryColor: palette.background,
        tertiaryTextColor: palette.foreground,
        lineColor: palette.line,
        textColor: palette.foreground,
      },
    });
    activePalette = signature;
  }

  // Mermaid needs a unique DOM id even though the resulting SVG is immediately rasterized.
  const { svg } = await mermaid.render(`terminal-mermaid-${diagramId++}`, source);
  return svg;
}
