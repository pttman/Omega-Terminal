import type { Terminal } from '@xterm/xterm';

type SelectionTerminal = Pick<Terminal, 'getSelection' | 'getSelectionPosition' | 'buffer'>;

// Match the selected buffer cells, rather than deleting prompt text from arbitrary
// output. Keep xterm's line breaks, soft wraps, Unicode and column selections.
export function terminalSelectionText(term: SelectionTerminal): string {
  const selected = term.getSelection();
  const range = term.getSelectionPosition();
  if (!selected || !range) return selected;
  const newline = selected.includes('\r\n') ? '\r\n' : '\n';

  const extract = (column: boolean) => {
    const original: string[] = [], cleaned: string[] = [];
    for (let y = range.start.y; y <= range.end.y; y++) {
      const line = term.buffer.active.getLine(y);
      if (!line) return;
      const left = column ? Math.min(range.start.x, range.end.x) : y === range.start.y ? range.start.x : 0;
      const right = column ? Math.max(range.start.x, range.end.x) : y === range.end.y ? range.end.x : undefined;
      const text = line.translateToString(true, left, right).replace(/\u00a0/g, ' ');
      const first = line.getCell(0);
      const prompt = !line.isWrapped && first?.getChars() === 'Ω' && first.isFgPalette() && first.getFgColor() === 214;
      const prefix = prompt ? line.translateToString(false, 0, 4).replace(/\u00a0/g, ' ').match(/^Ω ?(?:~ )?/)?.[0].length ?? 0 : 0;
      const value = text.slice(Math.max(0, prefix - left));
      if (!column && y > range.start.y && line.isWrapped) {
        original[original.length - 1] += text;
        cleaned[cleaned.length - 1] += value;
      } else {
        original.push(text);
        cleaned.push(value);
      }
    }
    return { original: original.join(newline), cleaned: cleaned.join(newline) };
  };

  for (const column of [false, true]) {
    const result = extract(column);
    if (result?.original === selected) return result.cleaned;
  }
  return selected;
}
