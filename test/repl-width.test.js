import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../src/repl.js';

test('truncatePlain respects display width for CJK text', () => {
  const text = '最好的LLM排行榜：全面清单 --- Best LLM Leaderboard';
  const out = __test__.truncatePlain(text, 20);

  assert.ok(__test__.visibleLength(out) <= 20);
  assert.ok(out.endsWith('...'));
});

test('buildBorderTable keeps row width aligned with truncated content', () => {
  const lines = __test__.buildBorderTable(
    [{ key: 'title', title: 'Title', min: 14, pref: 14 }],
    [{ title: { plain: '最好的LLM排行榜：全面清单 --- Best LLM Leaderboard' } }],
    20
  );

  const expected = __test__.visibleLength(lines[0]);
  for (const line of lines) {
    assert.equal(__test__.visibleLength(line), expected);
  }
  assert.ok(lines.some((line) => line.includes('...')));
});

test('input helper functions are code-point safe', () => {
  const input = 'a你b';
  assert.equal(__test__.inputLength(input), 3);
  assert.equal(__test__.inputSlice(input, 0, 2), 'a你');
});

test('word navigation helpers find previous/next word boundary', () => {
  const input = 'show barretlee/media doc-slug';
  assert.equal(__test__.prevWordStart(input, input.length), 21);
  assert.equal(__test__.nextWordEnd(input, 5), 20);
});

test('help text shows core commands without line shortcut section', () => {
  const plain = __test__.helpText().replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  assert.match(plain, /Commands/);
  assert.match(plain, /clear/);
  assert.match(plain, /create doc in \[repo\]/);
  assert.doesNotMatch(plain, /Line Shortcuts/);
});
