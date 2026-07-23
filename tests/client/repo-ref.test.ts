import { describe, expect, it } from 'vitest';
import { parseRepoRef, repoBasePath } from '../../src/client/repo-ref.js';
import { UsageError } from '../../src/errors.js';

describe('parseRepoRef', () => {
  it('parses a numeric id', () => {
    expect(parseRepoRef('123456')).toEqual({ kind: 'id', id: '123456' });
  });

  it('parses a namespace', () => {
    expect(parseRepoRef('yuque/help')).toEqual({ kind: 'namespace', group: 'yuque', slug: 'help' });
  });

  it('rejects malformed references', () => {
    expect(() => parseRepoRef('a/b/c')).toThrow(UsageError);
    expect(() => parseRepoRef('/slug')).toThrow(UsageError);
    expect(() => parseRepoRef('group/')).toThrow(UsageError);
  });
});

describe('repoBasePath', () => {
  it('builds id and namespace paths', () => {
    expect(repoBasePath(parseRepoRef('42'))).toBe('/repos/42');
    expect(repoBasePath(parseRepoRef('yuque/help'))).toBe('/repos/yuque/help');
  });

  it('escapes URL-unsafe characters', () => {
    expect(repoBasePath(parseRepoRef('团队/知识 库'))).toBe(
      '/repos/%E5%9B%A2%E9%98%9F/%E7%9F%A5%E8%AF%86%20%E5%BA%93'
    );
  });
});
