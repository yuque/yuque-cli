/** Rendering helpers: human-readable tables/records on a TTY, full JSON with --json. */

function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function bold(text: string): string {
  return colorEnabled() ? `\x1b[1m${text}\x1b[0m` : text;
}

export function dim(text: string): string {
  return colorEnabled() ? `\x1b[2m${text}\x1b[0m` : text;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printOk(message: string): void {
  process.stdout.write(`${colorEnabled() ? '\x1b[32m✓\x1b[0m' : '✓'} ${message}\n`);
}

/** EastAsianWidth Wide/Fullwidth ranges (plus emoji) that occupy 2 terminal columns. */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0xa4cf], // CJK Radicals .. Yi
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms, Small Form Variants
  [0xff00, 0xff60], // Fullwidth forms (excludes halfwidth katakana)
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1faff], // Emoji
  [0x20000, 0x3fffd], // CJK Extension B+
];

/** Display width where wide characters (CJK, Hangul, emoji, ...) count as 2 columns. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += WIDE_RANGES.some(([lo, hi]) => code >= lo && code <= hi) ? 2 : 1;
  }
  return width;
}

function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

export interface Column<T> {
  key: string;
  header: string;
  format?: (row: T) => string;
}

function cell<T extends Record<string, unknown>>(row: T, column: Column<T>): string {
  if (column.format) return column.format(row);
  const value = row[column.key];
  if (value === null || value === undefined) return '';
  return String(value);
}

export function printTable<T extends Record<string, unknown>>(
  rows: T[],
  columns: Column<T>[]
): void {
  if (rows.length === 0) {
    process.stdout.write(dim('(no results)\n'));
    return;
  }
  const widths = columns.map((column) =>
    Math.max(displayWidth(column.header), ...rows.map((row) => displayWidth(cell(row, column))))
  );
  const header = columns.map((column, i) => pad(column.header, widths[i])).join('  ');
  process.stdout.write(`${bold(header.trimEnd())}\n`);
  for (const row of rows) {
    const line = columns.map((column, i) => pad(cell(row, column), widths[i])).join('  ');
    process.stdout.write(`${line.trimEnd()}\n`);
  }
}

/** Print selected fields of a single object as aligned `key  value` lines. */
export function printRecord(record: Record<string, unknown>, fields: string[]): void {
  const present = fields.filter((field) => record[field] !== undefined && record[field] !== null);
  const width = Math.max(0, ...present.map((field) => displayWidth(field)));
  for (const field of present) {
    const value = record[field];
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    process.stdout.write(`${dim(pad(field, width))}  ${text}\n`);
  }
}
