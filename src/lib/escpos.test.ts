import { describe, expect, it } from 'vitest';
import { parseReceiptBlocks, receiptToEscPos, receiptToPrintDocument, toAscii } from '@/lib/escpos';
import { padReceiptLine } from '@/lib/receiptLayout';

describe('escpos', () => {
  it('keeps an untagged line at paper width and does not print the tags', () => {
    const line = padReceiptLine('Subtotal', '5.00');
    const blocks = parseReceiptBlocks(`<C><CB>Store</CB></C>\n${line}`);
    expect(blocks[0]).toMatchObject({ align: 'center', bold: true, text: 'Store' });
    expect(blocks[1]?.text).toBe(line);
    expect(blocks[1]?.preformatted).toBe(true);
    expect(blocks[1]?.text).not.toContain('<');
  });

  it('replaces non-ASCII on the thermal path and keeps it in the browser document', () => {
    expect(toAscii('Café …')).toBe('Caf? ?');
    const bytes = receiptToEscPos('Café x1');
    expect(Array.from(bytes)).toContain(0x1b);
    expect(Array.from(bytes.slice(-6))).toEqual([0x1b, 0x64, 3, 0x1d, 0x56, 0x01]);
    const html = receiptToPrintDocument('<C>Café</C>\n<L>left</L>');
    expect(html).toContain('Café');
    expect(html).not.toContain('<C>');
    expect(html).toContain('@page { size: 58mm auto; margin: 0 }');
    expect(html).toContain('white-space: pre');
  });
});
