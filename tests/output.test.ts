import { describe, expect, it, vi } from 'vitest';
import { displayWidth } from '../src/output.js';

describe('displayWidth', () => {
  it('counts ASCII as 1 column per character', () => {
    expect(displayWidth('')).toBe(0);
    expect(displayWidth('yuque')).toBe(5);
  });

  it('counts CJK ideographs and fullwidth forms as 2 columns', () => {
    expect(displayWidth('语雀')).toBe(4);
    expect(displayWidth('Ａ')).toBe(2); // U+FF21 fullwidth latin
    expect(displayWidth('。')).toBe(2); // U+3002 ideographic full stop
  });

  it('counts Hangul syllables as 2 columns', () => {
    expect(displayWidth('한글')).toBe(4);
    expect(displayWidth('한글 문서')).toBe(9); // 4 wide chars + 1 space
  });

  it('counts CJK Extension B+ and Compatibility Ideographs as 2 columns', () => {
    expect(displayWidth('𠀀')).toBe(2); // U+20000, surrogate pair
    expect(displayWidth('豈')).toBe(2); // U+F900 compatibility ideograph
  });

  it('counts emoji as 2 columns', () => {
    expect(displayWidth('📄')).toBe(2); // U+1F4C4
    expect(displayWidth('🧪')).toBe(2); // U+1F9EA
  });

  it('counts halfwidth katakana as 1 column', () => {
    expect(displayWidth('ｱ')).toBe(1); // U+FF71
  });

  it('mixes narrow and wide characters', () => {
    expect(displayWidth('doc 한글 📄')).toBe(11); // 3 + 1 + 4 + 1 + 2
  });
});

describe('bin EPIPE guard', () => {
  it('exits 0 on stdout EPIPE and rethrows other errors', async () => {
    const before = process.stdout.listeners('error');
    const savedArgv = process.argv;
    const savedExitCode = process.exitCode;
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    class ExitSentinel extends Error {}
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitSentinel(String(code));
    }) as never);
    try {
      process.argv = ['node', 'yuque', '--help'];
      await import('../src/bin.js');
      const listeners = process.stdout.listeners('error').filter((l) => !before.includes(l));
      expect(listeners).toHaveLength(1);
      const handler = listeners[0] as (error: NodeJS.ErrnoException) => void;

      const epipe: NodeJS.ErrnoException = Object.assign(new Error('write EPIPE'), {
        code: 'EPIPE',
      });
      expect(() => handler(epipe)).toThrow(ExitSentinel);
      expect(exit).toHaveBeenCalledWith(0);

      const other: NodeJS.ErrnoException = Object.assign(new Error('write EACCES'), {
        code: 'EACCES',
      });
      expect(() => handler(other)).toThrow('write EACCES');
      expect(exit).toHaveBeenCalledTimes(1);

      process.stdout.removeListener('error', handler);
    } finally {
      process.argv = savedArgv;
      process.exitCode = savedExitCode;
      exit.mockRestore();
      write.mockRestore();
    }
  });
});
