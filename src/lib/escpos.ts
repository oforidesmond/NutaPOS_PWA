/** Receipt tag translation for thermal bytes and the browser print sheet. */

export type ReceiptBlock = {
  align: 'left' | 'center';
  bold: boolean;
  /** Untagged lines are already padded to the paper width and must not be reflowed. */
  preformatted: boolean;
  text: string;
};

const BOLD_CENTER = /^<C><CB>([\s\S]*)<\/CB><\/C>$/;
const BOLD_ONLY = /^<CB>([\s\S]*)<\/CB>$/;
const CENTER = /^<C>([\s\S]*)<\/C>$/;

/** Split a tagged receipt into lines. Tags stay out of `text`. */
export function parseReceiptBlocks(source: string): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  let leftOpen = false;

  for (const line of source.split('\n')) {
    if (leftOpen) {
      const closed = line.endsWith('</L>');
      const text = closed ? line.slice(0, -4) : line;
      blocks.push({ align: 'left', bold: false, preformatted: false, text });
      if (closed) leftOpen = false;
      continue;
    }

    const bold = line.match(BOLD_CENTER) ?? line.match(BOLD_ONLY);
    if (bold) {
      blocks.push({ align: 'center', bold: true, preformatted: false, text: bold[1] ?? '' });
      continue;
    }

    const center = line.match(CENTER);
    if (center) {
      blocks.push({ align: 'center', bold: false, preformatted: false, text: center[1] ?? '' });
      continue;
    }

    if (line.startsWith('<L>')) {
      const closed = line.endsWith('</L>');
      const inner = line.slice(3, closed ? -4 : undefined);
      blocks.push({ align: 'left', bold: false, preformatted: false, text: inner });
      leftOpen = !closed;
      continue;
    }

    blocks.push({ align: 'left', bold: false, preformatted: true, text: line });
  }

  return blocks;
}

/** ESC/POS is ASCII. Characters outside that range become `?`. */
export function toAscii(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 32 && code <= 126 ? ch : '?';
  }
  return out;
}

function pushText(bytes: number[], text: string): void {
  for (let i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i));
}

/**
 * Initialize, render each line, feed, and partial-cut.
 * Alignment: ESC a. Bold: ESC E. Partial cut: GS V 1.
 */
export function receiptToEscPos(source: string): Uint8Array {
  const bytes: number[] = [0x1b, 0x40];
  for (const block of parseReceiptBlocks(source)) {
    bytes.push(0x1b, 0x61, block.align === 'center' ? 1 : 0);
    bytes.push(0x1b, 0x45, block.bold ? 1 : 0);
    pushText(bytes, toAscii(block.text));
    bytes.push(0x0a);
  }
  bytes.push(0x1b, 0x45, 0, 0x1b, 0x61, 0);
  bytes.push(0x1b, 0x64, 3);
  bytes.push(0x1d, 0x56, 0x01);
  return Uint8Array.from(bytes);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Same characters as the thermal string, with tags rendered instead of printed. */
export function receiptToPrintDocument(source: string): string {
  const lines = parseReceiptBlocks(source)
    .map((block) => {
      const classes = ['line'];
      if (block.align === 'center') classes.push('center');
      if (block.bold) classes.push('bold');
      const text = block.text.length > 0 ? escapeHtml(block.text) : '&nbsp;';
      return `<div class="${classes.join(' ')}">${text}</div>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt</title>
<style>
  @page { size: 58mm auto; margin: 0 }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  .slip {
    width: 58mm;
    padding: 2mm 1mm;
    font-family: ui-monospace, "Courier New", Courier, monospace;
    font-size: 3mm;
    line-height: 1.25;
  }
  .line { white-space: pre; margin: 0; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
</style>
</head>
<body><div class="slip">${lines}</div></body>
</html>`;
}
